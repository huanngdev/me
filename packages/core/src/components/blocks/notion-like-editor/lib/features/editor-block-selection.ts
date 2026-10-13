import { ElementApi, NodeApi, type Descendant, type SlateEditor, type TElement } from "platejs";

import {
  MOVE_ALREADY_FIRST,
  MOVE_ALREADY_LAST,
  blockDropDecision,
  listItemUnit,
  siblingMove,
} from "./editor-block-drop";
import { targetBlockAtPath } from "./editor-block-handle";
import { findBlockById } from "./editor-synced-block";

export const MARQUEE_THRESHOLD_PX = 4;

// The side margin is outside the content column and inside the scroll frame.
// A control, the handle, or a point over a block is not a marquee start.
export function isSideMarginPoint(input: {
  clientX: number;
  clientY: number;
  contentLeft: number;
  contentRight: number;
  contentTop: number;
  contentBottom: number;
  inFrame: boolean;
  onControl: boolean;
}): boolean {
  if (!input.inFrame || input.onControl) {
    return false;
  }
  if (input.clientY < input.contentTop || input.clientY > input.contentBottom) {
    return false;
  }
  return input.clientX < input.contentLeft || input.clientX > input.contentRight;
}

export type BlockRun = {
  parent: number[];
  start: number;
  end: number;
  ids: string[];
};

type VerticalBox = {
  id: string;
  top: number;
  bottom: number;
};

type CaretLanding = "previous-end" | "next-start" | "empty-document" | "empty-container";

function elementId(node: Descendant | undefined): string {
  if (!node || !ElementApi.isElement(node)) {
    return "";
  }
  const id: unknown = Reflect.get(node, "id");
  return typeof id === "string" ? id : "";
}

function isPrefix(prefix: readonly number[], path: readonly number[]): boolean {
  if (prefix.length >= path.length) {
    return false;
  }
  for (let index = 0; index < prefix.length; index += 1) {
    if (prefix[index] !== path[index]) {
      return false;
    }
  }
  return true;
}

function childrenOf(editor: SlateEditor, parent: readonly number[]): readonly Descendant[] | null {
  if (parent.length === 0) {
    return editor.children;
  }
  const entry = editor.api.node([...parent]);
  const node = entry?.[0];
  if (!entry || !ElementApi.isElement(node)) {
    return null;
  }
  return node.children;
}

function blockUnitId(editor: SlateEditor, id: string): string | null {
  const entry = findBlockById(editor, id);
  if (!entry) {
    return null;
  }
  return targetBlockAtPath(editor, entry[1])?.id ?? null;
}

function unitPath(editor: SlateEditor, id: string): number[] | null {
  const unitId = blockUnitId(editor, id);
  if (!unitId) {
    return null;
  }
  const entry = findBlockById(editor, unitId);
  return entry ? [...entry[1]] : null;
}

function commonParentLength(paths: readonly number[][]): number {
  const first = paths[0];
  if (!first) {
    return 0;
  }
  let depth = Math.max(0, first.length - 1);
  for (const path of paths) {
    let index = 0;
    const limit = Math.min(depth, Math.max(0, path.length - 1));
    while (index < limit && path[index] === first[index]) {
      index += 1;
    }
    depth = index;
  }
  return depth;
}

// Ids from any depth become one contiguous sibling run of block units.
// An ancestor wins over its descendants. A list item keeps the nested items
// that `listItemUnit` already treats as part of that item.
export function normalizeBlockIds(editor: SlateEditor, ids: readonly string[]): string[] {
  const paths: number[][] = [];
  for (const id of ids) {
    const path = unitPath(editor, id);
    if (!path) {
      continue;
    }
    if (paths.some((existing) => existing.join(".") === path.join("."))) {
      continue;
    }
    paths.push(path);
  }
  const kept = paths.filter(
    (path) => !paths.some((other) => other !== path && isPrefix(other, path)),
  );
  if (kept.length === 0) {
    return [];
  }
  const parentLength = commonParentLength(kept);
  const parent = kept[0]?.slice(0, parentLength) ?? [];
  const siblings = childrenOf(editor, parent);
  if (!siblings) {
    return [];
  }
  let min = siblings.length;
  let max = 0;
  for (const path of kept) {
    const index = path[parentLength];
    if (index === undefined || index < 0 || index >= siblings.length) {
      continue;
    }
    const [start, end] = listItemUnit(siblings, index);
    min = Math.min(min, start);
    max = Math.max(max, end);
  }
  if (min >= max) {
    return [];
  }
  const selected: string[] = [];
  let cursor = min;
  while (cursor < max) {
    const [start, end] = listItemUnit(siblings, cursor);
    if (start !== cursor || end <= start) {
      cursor += 1;
      continue;
    }
    const id = elementId(siblings[start]);
    if (id.length > 0) {
      selected.push(id);
    }
    cursor = end;
  }
  return selected;
}

export function blockRun(editor: SlateEditor, ids: readonly string[]): BlockRun | null {
  const normalized = normalizeBlockIds(editor, ids);
  const firstId = normalized[0];
  if (!firstId) {
    return null;
  }
  const first = unitPath(editor, firstId);
  const lastId = normalized[normalized.length - 1];
  const last = lastId ? unitPath(editor, lastId) : null;
  if (!first || !last) {
    return null;
  }
  const parent = first.slice(0, -1);
  const siblings = childrenOf(editor, parent);
  if (!siblings) {
    return null;
  }
  const start = first[first.length - 1] ?? 0;
  const lastIndex = last[last.length - 1] ?? start;
  const end = listItemUnit(siblings, lastIndex)[1];
  return { parent, start, end, ids: normalized };
}

export function topLevelBlockIds(editor: SlateEditor): string[] {
  const ids: string[] = [];
  let cursor = 0;
  while (cursor < editor.children.length) {
    const [start, end] = listItemUnit(editor.children, cursor);
    if (start !== cursor || end <= start) {
      cursor += 1;
      continue;
    }
    const id = elementId(editor.children[start]);
    if (id.length > 0) {
      ids.push(id);
    }
    cursor = end;
  }
  return ids;
}

export function adjacentBlockId(
  editor: SlateEditor,
  id: string,
  direction: "up" | "down",
): string | null {
  const path = unitPath(editor, id);
  if (!path || path.length === 0) {
    return null;
  }
  const parent = path.slice(0, -1);
  const siblings = childrenOf(editor, parent);
  if (!siblings) {
    return null;
  }
  const index = path[path.length - 1] ?? 0;
  const [start, end] = listItemUnit(siblings, index);
  if (direction === "down") {
    if (end < siblings.length) {
      const next = listItemUnit(siblings, end);
      const nextId = elementId(siblings[next[0]]);
      return nextId.length > 0 ? nextId : null;
    }
  } else if (start > 0) {
    let cursor = 0;
    let previous = 0;
    while (cursor < start) {
      const range = listItemUnit(siblings, cursor);
      if (range[0] !== cursor || range[1] <= range[0]) {
        cursor += 1;
        continue;
      }
      previous = range[0];
      cursor = range[1];
    }
    const previousId = elementId(siblings[previous]);
    return previousId.length > 0 ? previousId : null;
  }
  if (parent.length === 0) {
    return null;
  }
  const parentEntry = editor.api.node(parent);
  const parentId = elementId(parentEntry?.[0]);
  if (parentId.length === 0) {
    return null;
  }
  return adjacentBlockId(editor, parentId, direction);
}

export function applySelectionMarks(root: ParentNode, ids: readonly string[]): void {
  const selected = new Set(ids);
  const nodes = root.querySelectorAll("[data-block-id]");
  for (const node of nodes) {
    if (!(node instanceof HTMLElement) || node.closest("[data-preview-path]")) {
      continue;
    }
    const id = node.getAttribute("data-block-id");
    if (id && selected.has(id)) {
      node.setAttribute("data-block-selected", "");
    } else {
      node.removeAttribute("data-block-selected");
    }
  }
  if (root instanceof HTMLElement && root.hasAttribute("data-slate-editor")) {
    if (ids.length === 0) {
      root.removeAttribute("data-block-selection-count");
    } else {
      root.setAttribute("data-block-selection-count", String(ids.length));
    }
  }
}

export function stripPreviewChrome(root: HTMLElement): void {
  for (const node of root.querySelectorAll("[data-block-selection-tint], [data-block-marquee]")) {
    node.remove();
  }
  root.removeAttribute("data-block-selected");
  for (const node of root.querySelectorAll("[data-block-selected]")) {
    node.removeAttribute("data-block-selected");
  }
  for (const node of [root, ...root.querySelectorAll("*")]) {
    if (!(node instanceof HTMLElement) || node === root) {
      continue;
    }
    if (node.style.position === "fixed") {
      node.remove();
    }
  }
}

export function marqueeBlockIds(
  blocks: readonly VerticalBox[],
  top: number,
  bottom: number,
): string[] {
  const low = Math.min(top, bottom);
  const high = Math.max(top, bottom);
  return blocks.filter((block) => block.bottom > low && block.top < high).map((block) => block.id);
}

export function caretLanding(
  childCount: number,
  start: number,
  end: number,
  parentIsRoot: boolean,
): CaretLanding {
  if (start === 0 && end >= childCount) {
    return parentIsRoot ? "empty-document" : "empty-container";
  }
  if (start > 0) {
    return "previous-end";
  }
  return "next-start";
}

export function runMoveTarget(
  editor: SlateEditor,
  run: BlockRun,
  direction: "up" | "down",
): { ok: true; to: number[] } | { ok: false; reason: string } {
  const siblings = childrenOf(editor, run.parent);
  if (!siblings) {
    return { ok: false, reason: "This block cannot be moved." };
  }
  const single = listItemUnit(siblings, run.start);
  if (single[0] === run.start && single[1] === run.end) {
    return siblingMove(editor.children, [...run.parent, run.start], direction);
  }
  let toIndex: number;
  if (direction === "down") {
    if (run.end >= siblings.length) {
      return { ok: false, reason: MOVE_ALREADY_LAST };
    }
    toIndex = listItemUnit(siblings, run.end)[1];
  } else {
    if (run.start <= 0) {
      return { ok: false, reason: MOVE_ALREADY_FIRST };
    }
    let cursor = 0;
    let previous = 0;
    while (cursor < run.start) {
      const range = listItemUnit(siblings, cursor);
      if (range[0] !== cursor || range[1] <= range[0]) {
        cursor += 1;
        continue;
      }
      previous = range[0];
      cursor = range[1];
    }
    toIndex = previous;
  }
  const decision = blockDropDecision(
    editor.children,
    [...run.parent, run.start],
    run.parent,
    toIndex,
    [run.start, run.end],
  );
  if (!decision.allowed || decision.noop) {
    const edge = direction === "up" ? MOVE_ALREADY_FIRST : MOVE_ALREADY_LAST;
    return { ok: false, reason: decision.reason ?? edge };
  }
  return { ok: true, to: [...run.parent, toIndex] };
}

function blockText(node: TElement): string {
  return NodeApi.string(node);
}

export function selectionCoversBlock(
  editor: SlateEditor,
  path: readonly number[],
): "empty" | "covered" | "partial" | "outside" {
  const entry = editor.api.node([...path]);
  const node = entry?.[0];
  if (!entry || !ElementApi.isElement(node)) {
    return "outside";
  }
  if (blockText(node).length === 0) {
    return "empty";
  }
  const selection = editor.selection;
  const start = editor.api.start([...path]);
  const end = editor.api.end([...path]);
  if (!selection || !start || !end) {
    return "partial";
  }
  const anchorBeforeFocus =
    selection.anchor.path.join(".").localeCompare(selection.focus.path.join(".")) < 0 ||
    (selection.anchor.path.join(".") === selection.focus.path.join(".") &&
      selection.anchor.offset <= selection.focus.offset);
  const from = anchorBeforeFocus ? selection.anchor : selection.focus;
  const to = anchorBeforeFocus ? selection.focus : selection.anchor;
  const samePoint = (
    left: { path: number[]; offset: number },
    right: { path: number[]; offset: number },
  ) => left.offset === right.offset && left.path.join(".") === right.path.join(".");
  if (samePoint(from, start) && samePoint(to, end)) {
    return "covered";
  }
  return "partial";
}
