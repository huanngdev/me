import { ElementApi, KEYS, TextApi, nanoid, type Descendant } from "platejs";

import {
  EDITOR_DOCUMENT_LIMITS,
  EDITOR_SCHEMA_VERSION,
  editorDocumentSchema,
  formatBlockLabel,
  type EditorDocument,
} from "./editor-document";
import { normalizeBlockIds, type Repair } from "./editor-document-ids";
import {
  INLINE_ELEMENT_TYPES,
  allowedChildTypes,
  allowedElementAttrs,
  allowsFirstChild,
  firstChildForbiddenAttrs,
  firstChildTypes,
  elementAllowsMarks,
  isAllowedElementAttrValue,
  isAllowedMark,
  isAllowedMarkValue,
  isChildOnlyElementType,
  isVoidElementType,
  elementChildIssues,
  maxChildren,
  maxNesting,
  repairAttrKeys,
  requiredAttr,
  unsatisfiedDependentAttrs,
} from "./editor-document-schema";
import { isEditorValue, repairColumnContent } from "./editor-column-repair";
import { AUDIO_KEY, AUDIO_URL_REMOVED } from "../features/editor-audio";
import { FILE_KEY, FILE_URL_REMOVED } from "../features/editor-file";
import { IMAGE_KEY, IMAGE_URL_REMOVED } from "../features/editor-image";
import { VIDEO_KEY, VIDEO_URL_REMOVED } from "../features/editor-video";
import {
  EMBED_ATTRS_CLEANED,
  EMBED_KEY,
  EMBED_SOURCE_REMOVED,
  applyCleanedEmbed,
  cleanEmbedFields,
} from "../features/editor-embed";
import { isMediaBlockType } from "../features/editor-media-source";
import { repairMentionInputs } from "../features/editor-mention-node";
import { repairPageLinkContent } from "../features/editor-page-link";
import { repairFootnoteContent } from "../features/editor-footnote-repair";
import { syncedRefRepairs } from "../features/editor-synced-repair";
import type { EditorValue } from "./editor-value";

export type Issue = {
  path: number[];
  message: string;
};

export type ParseResult =
  | { status: "ok"; document: EditorDocument; repairs: Repair[] }
  | { status: "invalid"; issues: Issue[]; raw: unknown }
  | { status: "unsupported"; issues: Issue[]; raw: unknown }
  | { status: "future-version"; schemaVersion: number; raw: unknown };

type WalkState = {
  nodes: number;
  invalid: Issue | undefined;
  unsupported: Issue[];
  repairs: Repair[];
};

const textEncoder = new TextEncoder();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function invalidResult(raw: unknown, path: number[], message: string): ParseResult {
  return {
    status: "invalid",
    issues: [{ path, message }],
    raw,
  };
}

function reject(state: WalkState, path: number[], message: string): void {
  state.invalid = { path, message };
}

function jsonByteLength(raw: unknown): number | undefined {
  try {
    const json = JSON.stringify(raw);
    if (typeof json !== "string") {
      return 0;
    }

    return textEncoder.encode(json).length;
  } catch {
    return undefined;
  }
}

function createPlateId(): string {
  return nanoid(10);
}

function countNode(state: WalkState, path: number[]): boolean {
  state.nodes += 1;
  if (state.nodes > EDITOR_DOCUMENT_LIMITS.maxNodes) {
    reject(
      state,
      path,
      `This document has more than ${EDITOR_DOCUMENT_LIMITS.maxNodes} blocks. Restore from a backup or remove content.`,
    );
    return false;
  }

  return true;
}

function walkText(
  value: Record<string, unknown>,
  path: number[],
  state: WalkState,
  parentType: string | undefined,
): void {
  if (!countNode(state, path)) {
    return;
  }

  if (typeof value.text !== "string") {
    reject(
      state,
      path,
      `${formatBlockLabel(path)} has text that is not a string. Restore from a backup or retype that block.`,
    );
    return;
  }

  for (const key of Object.keys(value)) {
    if (key === "text") {
      continue;
    }

    if (parentType !== undefined && !elementAllowsMarks(parentType)) {
      state.unsupported.push({
        path,
        message: `${formatBlockLabel(path)} has an unsupported mark "${key}". Restore from a backup or remove the mark.`,
      });
      continue;
    }

    if (!isAllowedMark(key)) {
      state.unsupported.push({
        path,
        message: `${formatBlockLabel(path)} has an unsupported mark "${key}". Restore from a backup or remove the mark.`,
      });
      continue;
    }

    if (isAllowedMarkValue(key, value[key])) {
      continue;
    }

    state.unsupported.push({
      path,
      message: `${formatBlockLabel(path)} has an unsupported ${key} "${markValueLabel(value[key])}". Restore from a backup or remove the mark.`,
    });
  }
}

function markValueLabel(value: unknown): string {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return "value";
}

function isTextChild(value: unknown): boolean {
  return (
    isRecord(value) && "text" in value && !("children" in value) && typeof value.type !== "string"
  );
}

function structuralChildType(value: unknown): string | undefined {
  if (!isRecord(value) || isTextChild(value)) {
    return undefined;
  }

  if ("children" in value || "type" in value) {
    return typeof value.type === "string" ? value.type : "";
  }

  return undefined;
}

// A void's only legal child is one empty text leaf with no marks. Anything else is
// unsupported: the type is known, and the raw document stays intact.
function isEmptyUnmarkedText(children: unknown[]): boolean {
  const only = children.length === 1 ? children[0] : undefined;
  if (!isRecord(only) || only.text !== "" || "children" in only || "type" in only) {
    return false;
  }

  return Object.keys(only).length === 1 && Object.hasOwn(only, "text");
}

function parentAllowsInlineLink(parentType: string): boolean {
  return (
    parentType !== KEYS.link && !isVoidElementType(parentType) && elementAllowsMarks(parentType)
  );
}

function childIsAllowed(parentType: string, child: unknown): boolean {
  const childTypes = allowedChildTypes(parentType);
  const childType = structuralChildType(child);
  if (childTypes === undefined) {
    if (childType === undefined) {
      return true;
    }

    return (
      INLINE_ELEMENT_TYPES.some((type) => type === childType) && parentAllowsInlineLink(parentType)
    );
  }

  return childType !== undefined && childTypes.some((type) => type === childType);
}

const emptyNesting = new Map<string, number>();

function walkElement(
  value: Record<string, unknown>,
  path: number[],
  state: WalkState,
  nesting: ReadonlyMap<string, number> = emptyNesting,
): void {
  if (path.length > EDITOR_DOCUMENT_LIMITS.maxDepth) {
    reject(
      state,
      path,
      `${formatBlockLabel(path)} is nested deeper than ${EDITOR_DOCUMENT_LIMITS.maxDepth} levels. Restore from a backup or remove the extra nesting.`,
    );
    return;
  }

  if (!countNode(state, path)) {
    return;
  }

  if (!isUnknownArray(value.children) || value.children.length === 0) {
    reject(
      state,
      path,
      `${formatBlockLabel(path)} has no children. Restore from a backup or remove the block.`,
    );
    return;
  }

  const type = value.type;
  if (typeof type !== "string" || type.length === 0) {
    reject(
      state,
      path,
      `${formatBlockLabel(path)} has no block type. Restore from a backup or remove the block.`,
    );
    return;
  }

  const allowed = allowedElementAttrs(type);
  if (allowed === undefined) {
    state.unsupported.push({
      path,
      message: `${formatBlockLabel(path)} uses an unsupported block type "${type}". Restore from a backup or remove the block.`,
    });
  }

  // An embed is cleaned as one block. A bad source clears it, and any other bad field is dropped.
  if (type === EMBED_KEY) {
    const cleaned = cleanEmbedFields(value);
    if (cleaned.cleared) {
      state.repairs.push({ path, message: EMBED_SOURCE_REMOVED });
    } else if (cleaned.dropped) {
      state.repairs.push({ path, message: EMBED_ATTRS_CLEANED });
    }
  }

  const unsatisfied = new Set(unsatisfiedDependentAttrs(type, value));
  const attrKeys = type === EMBED_KEY ? [] : Object.keys(value);

  for (const key of attrKeys) {
    if (key === "type" || key === "children" || key === "id") {
      continue;
    }

    const attr = value[key];
    // An unknown block is already unsupported. A known block with a blob or data url stays invalid.
    // A media block is the exception: its bad url is repaired to a placeholder, like any bad attribute.
    if (
      allowed !== undefined &&
      type !== KEYS.link &&
      !isMediaBlockType(type) &&
      (key === "url" || key === "src") &&
      typeof attr === "string" &&
      (attr.startsWith("blob:") || attr.startsWith("data:"))
    ) {
      const scheme = attr.startsWith("blob:") ? "blob:" : "data:";
      reject(
        state,
        path,
        `${formatBlockLabel(path)} has a ${key} that starts with ${scheme}. Restore from a backup or replace that file.`,
      );
      return;
    }

    if (allowed !== undefined && allowed.has(key)) {
      if (!isAllowedElementAttrValue(type, key, attr)) {
        if (repairAttrKeys(type).some((name) => name === key)) {
          state.repairs.push({
            path,
            message: repairAttrMessage(path, type, key, attr),
          });
          continue;
        }

        state.unsupported.push({
          path,
          message: `${formatBlockLabel(path)} has an unsupported ${key} "${markValueLabel(attr)}". Restore from a backup or remove the attribute.`,
        });
        continue;
      }

      const required = requiredAttr(type, key);
      if (required !== undefined && unsatisfied.has(key)) {
        const requiredPresent =
          required in value && isAllowedElementAttrValue(type, required, value[required]);
        const detail = requiredPresent ? key : `${key} without ${required}`;
        state.unsupported.push({
          path,
          message: `${formatBlockLabel(path)} has an unsupported ${detail}. Restore from a backup or remove the attribute.`,
        });
      }
      continue;
    }

    state.unsupported.push({
      path,
      message: `${formatBlockLabel(path)} has an unsupported attribute "${key}". Restore from a backup or remove the attribute.`,
    });
  }

  for (const issue of elementChildIssues(type, value, path)) {
    state.unsupported.push(issue);
  }

  const voidBlock = isVoidElementType(type);
  if (voidBlock && !isEmptyUnmarkedText(value.children)) {
    state.unsupported.push({
      path,
      message: `${formatBlockLabel(path)} must contain one empty text node. Restore from a backup or remove the block.`,
    });
  }

  const childLimit = allowed === undefined ? undefined : maxChildren(type);
  if (childLimit !== undefined && value.children.length > childLimit) {
    state.unsupported.push({
      path,
      message: `${formatBlockLabel(path)} has ${value.children.length} children. At most ${childLimit} are supported. Restore from a backup or remove the extra blocks.`,
    });
  }

  const nestingLimit = allowed === undefined ? undefined : maxNesting(type);
  let childNesting: ReadonlyMap<string, number> = nesting;
  if (nestingLimit !== undefined) {
    const depth = (nesting.get(type) ?? 0) + 1;
    if (depth > nestingLimit) {
      state.unsupported.push({
        path,
        message: `${formatBlockLabel(path)} is nested deeper than ${nestingLimit} ${type} levels. Restore from a backup or remove the extra nesting.`,
      });
    }

    const nextNesting = new Map(nesting);
    nextNesting.set(type, depth);
    childNesting = nextNesting;
  }

  const labelTypes = allowed === undefined ? undefined : firstChildTypes(type);
  if (labelTypes !== undefined) {
    const first = value.children[0];
    const firstStructuralType = structuralChildType(first);
    if (firstStructuralType !== undefined && !allowsFirstChild(type, firstStructuralType)) {
      state.unsupported.push({
        path,
        message: `${formatBlockLabel(path)} has an unsupported first child type "${firstStructuralType}". Restore from a backup or remove the block.`,
      });
    } else if (
      firstStructuralType !== undefined &&
      allowsFirstChild(type, firstStructuralType) &&
      isRecord(first)
    ) {
      for (const key of firstChildForbiddenAttrs(type)) {
        if (key in first) {
          state.unsupported.push({
            path,
            message: `${formatBlockLabel(path)} has an unsupported label ${key}. Restore from a backup or remove the attribute.`,
          });
        }
      }
    }
  }

  for (let index = 0; index < value.children.length; index += 1) {
    const child = value.children[index];
    const structuralType = structuralChildType(child);
    const allowedLabel =
      index === 0 && structuralType !== undefined && allowsFirstChild(type, structuralType);
    if (!voidBlock && !allowedLabel && !childIsAllowed(type, child)) {
      const childType = structuralChildType(child);
      const detail =
        childType === undefined ? "inline children" : `an unsupported child type "${childType}"`;
      state.unsupported.push({
        path,
        message: `${formatBlockLabel(path)} has ${detail}. Restore from a backup or remove the block.`,
      });
    }

    walkDescendant(child, [...path, index], state, childNesting, type);
    if (state.invalid) {
      return;
    }
  }
}

function repairAttrMessage(path: number[], type: string, key: string, value: unknown): string {
  const label = markValueLabel(value);
  if (type === IMAGE_KEY && key === "url") {
    return IMAGE_URL_REMOVED;
  }
  if (type === FILE_KEY && key === "url") {
    return FILE_URL_REMOVED;
  }
  if (type === VIDEO_KEY && key === "url") {
    return VIDEO_URL_REMOVED;
  }
  if (type === AUDIO_KEY && key === "url") {
    return AUDIO_URL_REMOVED;
  }

  if (key === "lang" && value === "plaintext") {
    return `${formatBlockLabel(path)} stores lang "plaintext". Plaintext is the default, so the language was cleared.`;
  }

  if (key === "lang") {
    return `${formatBlockLabel(path)} has an unsupported lang "${label}". Invalid/unknown language fallback plaintext.`;
  }

  if (key === "url") {
    return `${formatBlockLabel(path)} has an unsafe link URL. The link is shown as text.`;
  }

  return `${formatBlockLabel(path)} has an unsupported ${key} "${label}". The value was removed.`;
}

function nodeAt(content: unknown, path: readonly number[]): Record<string, unknown> | undefined {
  let current: unknown = content;
  for (const index of path) {
    if (Array.isArray(current)) {
      current = current[index];
      continue;
    }

    if (!isRecord(current) || !Array.isArray(current.children)) {
      return undefined;
    }

    current = current.children[index];
  }

  return isRecord(current) ? current : undefined;
}

function dropRepairedAttrs(content: EditorValue, repairs: readonly Repair[]): EditorValue {
  if (repairs.length === 0) {
    return content;
  }

  const copy = structuredClone(content);
  for (const repair of repairs) {
    const node = nodeAt(copy, repair.path);
    if (node === undefined || typeof node.type !== "string") {
      continue;
    }

    if (node.type === EMBED_KEY) {
      applyCleanedEmbed(node);
      continue;
    }

    for (const key of repairAttrKeys(node.type)) {
      if (key in node && !isAllowedElementAttrValue(node.type, key, node[key])) {
        Reflect.deleteProperty(node, key);
      }
    }
  }

  return copy;
}

function walkDescendant(
  value: unknown,
  path: number[],
  state: WalkState,
  nesting: ReadonlyMap<string, number> = emptyNesting,
  parentType?: string,
): void {
  if (!isRecord(value)) {
    reject(
      state,
      path,
      `${formatBlockLabel(path)} is not a block. Restore from a backup or remove the block.`,
    );
    return;
  }

  if ("children" in value || "type" in value) {
    walkElement(value, path, state, nesting);
    return;
  }

  if ("text" in value) {
    walkText(value, path, state, parentType);
    return;
  }

  reject(
    state,
    path,
    `${formatBlockLabel(path)} is not a block. Restore from a backup or remove the block.`,
  );
}

function walkTopLevel(
  value: unknown,
  path: number[],
  state: WalkState,
  nesting: ReadonlyMap<string, number> = emptyNesting,
): void {
  if (!isRecord(value) || !("children" in value || "type" in value)) {
    reject(
      state,
      path,
      `${formatBlockLabel(path)} is not a block. Restore from a backup or remove the block.`,
    );
    return;
  }

  if (typeof value.type === "string" && isChildOnlyElementType(value.type)) {
    state.unsupported.push({
      path,
      message: `${formatBlockLabel(path)} has an unsupported top-level type "${value.type}". Restore from a backup or remove the block.`,
    });
  }

  walkElement(value, path, state, nesting);
}

function isInlineNode(node: Descendant): boolean {
  return ElementApi.isElement(node) && INLINE_ELEMENT_TYPES.some((type) => type === node.type);
}

// Slate needs a text leaf before and after each inline element, and between two of them.
// Adds the empty leaves a stored document already has. Void elements keep their own leaf.
// Input is not checked yet, so anything that is not an element with a children array is returned as it is.
function spaceInlineChildren(node: Descendant): Descendant {
  if (!ElementApi.isElement(node) || isVoidElementType(node.type)) {
    return node;
  }

  let changed = false;
  const children: Descendant[] = [];
  for (const child of node.children) {
    const last = children.at(-1);
    if (isInlineNode(child) && (last === undefined || !TextApi.isText(last))) {
      children.push({ text: "" });
      changed = true;
    }

    const spaced = spaceInlineChildren(child);
    if (spaced !== child) {
      changed = true;
    }
    children.push(spaced);
  }

  const last = children.at(-1);
  if (last !== undefined && isInlineNode(last)) {
    children.push({ text: "" });
    changed = true;
  }

  return changed ? { ...node, children } : node;
}

// Returns the same array when no block needs a leaf.
function spaceInlineContent(content: EditorValue): EditorValue {
  const spaced: Descendant[] = content.map((block) => spaceInlineChildren(block));
  if (spaced.every((block, index) => block === content[index]) || !isEditorValue(spaced)) {
    return content;
  }

  return spaced;
}

export function parseEditorDocument(raw: unknown): ParseResult {
  if (
    isRecord(raw) &&
    typeof raw.schemaVersion === "number" &&
    Number.isFinite(raw.schemaVersion) &&
    raw.schemaVersion > EDITOR_SCHEMA_VERSION
  ) {
    return {
      status: "future-version",
      schemaVersion: raw.schemaVersion,
      raw,
    };
  }

  const bytes = jsonByteLength(raw);
  if (bytes === undefined) {
    return invalidResult(raw, [], "This document cannot be saved as JSON. Restore from a backup.");
  }

  if (bytes > EDITOR_DOCUMENT_LIMITS.maxBytes) {
    return invalidResult(
      raw,
      [],
      `This document is larger than ${EDITOR_DOCUMENT_LIMITS.maxBytes} bytes. Restore from a backup or remove content.`,
    );
  }

  const envelope = editorDocumentSchema.safeParse(raw);
  if (!envelope.success) {
    return invalidResult(
      raw,
      [],
      "This document is missing a schema version, document id, revision, or content. Restore from a backup.",
    );
  }

  const state: WalkState = {
    nodes: 0,
    invalid: undefined,
    unsupported: [],
    repairs: [],
  };
  // Leaves go in before any repair, so the walk and every repair path match the returned content.
  const footnotes = repairFootnoteContent(spaceInlineContent(envelope.data.content));
  const structurally = repairColumnContent(footnotes.content);
  const mentions = repairMentionInputs(structurally.content);
  const pageLinks = repairPageLinkContent(mentions.content);
  const content = pageLinks.content;

  for (let index = 0; index < content.length; index += 1) {
    walkTopLevel(content[index], [index], state);
    if (state.invalid) {
      return {
        status: "invalid",
        issues: [state.invalid],
        raw,
      };
    }
  }

  if (state.unsupported.length > 0) {
    return {
      status: "unsupported",
      issues: state.unsupported,
      raw,
    };
  }

  const normalized = normalizeBlockIds(dropRepairedAttrs(content, state.repairs), createPlateId);

  return {
    status: "ok",
    document: {
      schemaVersion: envelope.data.schemaVersion,
      documentId: envelope.data.documentId,
      revision: envelope.data.revision,
      content: normalized.content,
    },
    repairs: [
      ...footnotes.repairs,
      ...structurally.repairs,
      ...mentions.repairs,
      ...pageLinks.repairs,
      ...state.repairs,
      ...normalized.repairs,
      ...syncedRefRepairs(normalized.content),
    ],
  };
}
