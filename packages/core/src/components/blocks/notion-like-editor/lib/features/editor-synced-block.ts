import {
  ElementApi,
  KEYS,
  PathApi,
  nanoid,
  type Descendant,
  type SlateEditor,
  type TElement,
} from "platejs";

import type { EditorCommand } from "../commands/editor-commands";
import { formatBlockLabel } from "../document/editor-document";
import type { Repair } from "../document/editor-document-ids";
import { SYNCED_REF_KEY, isStoredSyncedTargetId } from "../document/editor-document-schema";
import { prefersReducedMotion } from "./editor-toc";
import { toggleOpen } from "../plugins/editor-toggle";
import type { EditorValue } from "../document/editor-value";

export { SYNCED_REF_KEY };

export const SYNCED_FROM_ABOVE = "Synced from above";
export const SYNCED_FROM_BELOW = "Synced from below";
export const SYNCED_INVALID_PLACEHOLDER = "Invalid reference";
export const SYNCED_MISSING_PLACEHOLDER = "The original block was deleted.";
export const SYNCED_CREATE_LABEL = "Create synced copy";
export const SYNCED_GO_LABEL = "Go to original";
export const SYNCED_CONVERT_LABEL = "Convert to copy";
export const SYNCED_REMOVE_LABEL = "Remove";
export const SYNCED_SELECT_REASON = "Select a block to sync.";
export const SYNCED_REJECT_REASON = "This block cannot be synced.";

export type SyncedTargetStatus = "live" | "missing" | "invalid";
export type SyncedDirection = "above" | "below";

type BlockEntry = [TElement, number[]];

function elementId(node: TElement): string | undefined {
  return typeof node.id === "string" && node.id.length > 0 ? node.id : undefined;
}

function isElement(node: Descendant): node is TElement {
  return ElementApi.isElement(node);
}

// Descendants only. The node itself is checked by its type.
function containsSyncedRef(node: TElement): boolean {
  for (const child of node.children) {
    if (!isElement(child)) {
      continue;
    }
    if (child.type === SYNCED_REF_KEY || containsSyncedRef(child)) {
      return true;
    }
  }

  return false;
}

export function syncedTargetStatus(
  target: TElement | undefined,
  targetId: string,
): SyncedTargetStatus {
  if (!isStoredSyncedTargetId(targetId)) {
    return "invalid";
  }

  if (!target) {
    return "missing";
  }

  if (
    target.type === SYNCED_REF_KEY ||
    target.type === KEYS.toc ||
    target.type === KEYS.columnGroup ||
    containsSyncedRef(target)
  ) {
    return "invalid";
  }

  return "live";
}

export function syncedDirection(targetPath: number[], refPath: number[]): SyncedDirection {
  return PathApi.compare(targetPath, refPath) < 0 ? "above" : "below";
}

function indexElements(value: readonly Descendant[]): Map<string, TElement> {
  const index = new Map<string, TElement>();

  const visit = (node: Descendant): void => {
    if (!isElement(node)) {
      return;
    }

    const id = elementId(node);
    if (id !== undefined && !index.has(id)) {
      index.set(id, node);
    }

    for (const child of node.children) {
      visit(child);
    }
  };

  for (const node of value) {
    visit(node);
  }

  return index;
}

function freshId(used: Set<string>): string {
  let id = nanoid();
  let suffix = 1;
  while (id.length === 0 || used.has(id)) {
    id = `${nanoid()}-${String(suffix)}`;
    suffix += 1;
  }

  used.add(id);
  return id;
}

function cloneWithFreshIds(node: TElement, used: Set<string>): TElement {
  const children = node.children.map((child) =>
    isElement(child) ? cloneWithFreshIds(child, used) : { ...child },
  );

  return { ...node, id: freshId(used), children };
}

function emptyParagraph(used: Set<string>): TElement {
  return { type: KEYS.p, id: freshId(used), children: [{ text: "" }] };
}

function targetIdOf(node: TElement): string {
  return typeof node.targetBlockId === "string" ? node.targetBlockId : "";
}

// Invalid targets are repairs. A missing target stays a runtime placeholder, so the
// document still opens and undo can bring the original back.
export function syncedRefRepairs(value: EditorValue): Repair[] {
  const index = indexElements(value);
  const repairs: Repair[] = [];

  const visit = (node: Descendant, path: number[]): void => {
    if (!isElement(node)) {
      return;
    }

    if (node.type === SYNCED_REF_KEY) {
      const targetId = targetIdOf(node);
      if (isStoredSyncedTargetId(targetId)) {
        const status = syncedTargetStatus(index.get(targetId), targetId);
        if (status === "invalid") {
          repairs.push({
            path,
            message: `${formatBlockLabel(path)} points at a block that cannot be synced. The reference is kept.`,
          });
        }
      }
    }

    node.children.forEach((child, childIndex) => {
      visit(child, [...path, childIndex]);
    });
  };

  value.forEach((node, nodeIndex) => {
    visit(node, [nodeIndex]);
  });

  return repairs;
}

function materializeElement(
  node: TElement,
  path: number[],
  index: Map<string, TElement>,
  used: Set<string>,
  losses: Repair[],
): TElement {
  if (node.type === SYNCED_REF_KEY) {
    const targetId = targetIdOf(node);
    const target = isStoredSyncedTargetId(targetId) ? index.get(targetId) : undefined;
    const status = syncedTargetStatus(target, targetId);
    if (status !== "live" || target === undefined) {
      losses.push({
        path,
        message:
          status === "missing"
            ? `${formatBlockLabel(path)} points at a block that is not in the document. The reference was removed.`
            : `${formatBlockLabel(path)} points at a block that cannot be synced. The reference was removed.`,
      });
      return emptyParagraph(used);
    }

    return cloneWithFreshIds(target, used);
  }

  let changed = false;
  const children = node.children.map((child, childIndex) => {
    if (!isElement(child)) {
      return child;
    }

    const next = materializeElement(child, [...path, childIndex], index, used, losses);
    if (next !== child) {
      changed = true;
    }

    return next;
  });

  if (!changed) {
    return node;
  }

  return { ...node, children };
}

// The future exporter and read-only renderer (DEV-128) must call this before writing the document out.
export function materializeSyncedRefs(value: EditorValue): {
  value: EditorValue;
  losses: Repair[];
} {
  const index = indexElements(value);
  const used = new Set(index.keys());
  const losses: Repair[] = [];
  let changed = false;
  const next = value.map((node, nodeIndex) => {
    const materialized = materializeElement(node, [nodeIndex], index, used, losses);
    if (materialized !== node) {
      changed = true;
    }

    return materialized;
  });

  return { value: changed ? next : value, losses };
}

export function findBlockById(editor: SlateEditor, id: string): BlockEntry | undefined {
  for (const entry of editor.api.nodes({
    at: [],
    match: (node) => ElementApi.isElement(node) && node.id === id,
    voids: true,
  })) {
    if (ElementApi.isElement(entry[0])) {
      return [entry[0], entry[1]];
    }
  }

  return undefined;
}

function nodeAt(editor: SlateEditor, path: number[]): BlockEntry | undefined {
  const entry = editor.api.node(path);
  if (!entry || !ElementApi.isElement(entry[0])) {
    return undefined;
  }

  return [entry[0], entry[1]];
}

function selectedSyncedRef(editor: SlateEditor): BlockEntry | undefined {
  for (const entry of editor.api.nodes({
    match: (node) => ElementApi.isElement(node) && node.type === SYNCED_REF_KEY,
    voids: true,
    mode: "lowest",
  })) {
    if (ElementApi.isElement(entry[0])) {
      return [entry[0], entry[1]];
    }
  }

  return undefined;
}

function isEditable(editor: SlateEditor): boolean {
  return editor.dom.readOnly !== true;
}

function isSyncableBlock(node: TElement): boolean {
  const id = elementId(node);
  if (id === undefined) {
    return false;
  }

  return syncedTargetStatus(node, id) === "live";
}

export function createSyncedRefReason(editor: SlateEditor): string | undefined {
  const current = editor.api.block({ highest: true });
  if (!current || !ElementApi.isElement(current[0]) || elementId(current[0]) === undefined) {
    return SYNCED_SELECT_REASON;
  }

  if (!isSyncableBlock(current[0])) {
    return SYNCED_REJECT_REASON;
  }

  return undefined;
}

function syncedRefNode(id: string, targetBlockId: string): TElement {
  return {
    type: SYNCED_REF_KEY,
    id,
    targetBlockId,
    children: [{ text: "" }],
  };
}

export function insertSyncedRef(editor: SlateEditor): boolean {
  if (!isEditable(editor) || createSyncedRefReason(editor) !== undefined) {
    return false;
  }

  const current = editor.api.block({ highest: true });
  if (!current || !ElementApi.isElement(current[0])) {
    return false;
  }

  const targetId = elementId(current[0]);
  const at = PathApi.next(current[1]);
  if (targetId === undefined || !at) {
    return false;
  }

  editor.tf.insertNodes(syncedRefNode(nanoid(), targetId), { at, select: true });
  return true;
}

function openAncestorToggles(editor: SlateEditor, path: readonly number[]): void {
  for (let length = 1; length < path.length; length += 1) {
    const parent = editor.api.node(path.slice(0, length));
    if (!parent || !ElementApi.isElement(parent[0]) || parent[0].type !== KEYS.toggle) {
      continue;
    }

    const id = elementId(parent[0]);
    if (id === undefined) {
      continue;
    }

    toggleOpen(editor, id, true);
  }
}

function scrollToBlock(editor: SlateEditor, node: TElement): void {
  const dom = editor.api.toDOMNode(node);
  if (!(dom instanceof HTMLElement) || typeof dom.scrollIntoView !== "function") {
    return;
  }

  dom.scrollIntoView({
    behavior: prefersReducedMotion() ? "auto" : "smooth",
    block: "start",
  });
}

export function goToSyncedOriginal(editor: SlateEditor, at?: number[]): void {
  if (!isEditable(editor)) {
    return;
  }

  const refEntry = at === undefined ? selectedSyncedRef(editor) : nodeAt(editor, at);
  if (!refEntry || refEntry[0].type !== SYNCED_REF_KEY) {
    return;
  }

  const targetId = targetIdOf(refEntry[0]);
  const target = isStoredSyncedTargetId(targetId) ? findBlockById(editor, targetId) : undefined;
  if (!target || syncedTargetStatus(target[0], targetId) !== "live") {
    return;
  }

  openAncestorToggles(editor, target[1]);
  const start = editor.api.start(target[1]);
  if (!start) {
    return;
  }

  editor.tf.withoutSaving(() => {
    editor.tf.select(start, { focus: true });
  });
  scrollToBlock(editor, target[0]);
}

function collectIds(value: readonly Descendant[]): Set<string> {
  return new Set(indexElements(value).keys());
}

export function convertSyncedRefAt(editor: SlateEditor, path: number[]): boolean {
  if (!isEditable(editor)) {
    return false;
  }

  const refEntry = nodeAt(editor, path);
  if (!refEntry || refEntry[0].type !== SYNCED_REF_KEY) {
    return false;
  }

  const targetId = targetIdOf(refEntry[0]);
  const target = isStoredSyncedTargetId(targetId) ? findBlockById(editor, targetId) : undefined;
  if (!target || syncedTargetStatus(target[0], targetId) !== "live") {
    return false;
  }

  const clone = cloneWithFreshIds(target[0], collectIds(editor.children));
  editor.tf.withoutNormalizing(() => {
    editor.tf.removeNodes({ at: path, voids: true });
    editor.tf.insertNodes(clone, { at: path, select: true });
  });
  return true;
}

export function removeSyncedRefAt(editor: SlateEditor, path: number[]): boolean {
  if (!isEditable(editor)) {
    return false;
  }

  const refEntry = nodeAt(editor, path);
  if (!refEntry || refEntry[0].type !== SYNCED_REF_KEY) {
    return false;
  }

  editor.tf.removeNodes({ at: path, voids: true });
  if (editor.children.length === 0) {
    editor.tf.insertNodes({ type: KEYS.p, children: [{ text: "" }] }, { at: [0] });
  }

  return true;
}

type KeyEvent = {
  key: string;
  shiftKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  defaultPrevented: boolean;
  preventDefault: () => void;
};

export function onSyncedRefKeyDown(editor: SlateEditor, event: KeyEvent): void {
  if (
    event.defaultPrevented ||
    event.key !== "Enter" ||
    event.shiftKey ||
    event.metaKey ||
    event.ctrlKey ||
    event.altKey ||
    !isEditable(editor)
  ) {
    return;
  }

  const block = editor.api.block();
  if (!block || !ElementApi.isElement(block[0]) || block[0].type !== SYNCED_REF_KEY) {
    return;
  }

  event.preventDefault();
  goToSyncedOriginal(editor, block[1]);
}

function selectedTargetIsLive(editor: SlateEditor): boolean {
  const selected = selectedSyncedRef(editor);
  if (!selected) {
    return false;
  }

  const targetId = targetIdOf(selected[0]);
  const target = isStoredSyncedTargetId(targetId) ? findBlockById(editor, targetId) : undefined;
  return syncedTargetStatus(target?.[0], targetId) === "live";
}

export const createSyncedRef: EditorCommand = {
  id: "block.synced.create-ref",
  label: SYNCED_CREATE_LABEL,
  group: "insert",
  isEnabled: (editor) => isEditable(editor) && createSyncedRefReason(editor) === undefined,
  disabledReason: (editor) => createSyncedRefReason(editor),
  run: (editor) => {
    insertSyncedRef(editor);
  },
};

export const goToSyncedOriginalCommand: EditorCommand = {
  id: "block.synced.go-to-original",
  label: SYNCED_GO_LABEL,
  group: "action",
  isEnabled: (editor) => isEditable(editor) && selectedTargetIsLive(editor),
  run: (editor) => {
    goToSyncedOriginal(editor);
  },
};

export const convertSyncedRef: EditorCommand = {
  id: "block.synced.convert",
  label: SYNCED_CONVERT_LABEL,
  group: "action",
  isEnabled: (editor) => isEditable(editor) && selectedTargetIsLive(editor),
  run: (editor) => {
    const selected = selectedSyncedRef(editor);
    if (!selected) {
      return;
    }

    convertSyncedRefAt(editor, selected[1]);
  },
};

export const removeSyncedRef: EditorCommand = {
  id: "block.synced.remove",
  label: SYNCED_REMOVE_LABEL,
  group: "action",
  isEnabled: (editor) => isEditable(editor) && selectedSyncedRef(editor) !== undefined,
  run: (editor) => {
    const selected = selectedSyncedRef(editor);
    if (!selected) {
      return;
    }

    removeSyncedRefAt(editor, selected[1]);
  },
};
