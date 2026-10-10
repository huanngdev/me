import {
  ElementApi,
  KEYS,
  nanoid,
  type Descendant,
  type SlateEditor,
  type TElement,
} from "platejs";

import { containerContentType, maxNesting } from "../document/editor-document-schema";
import { targetBlockAtPath } from "./editor-block-handle";
import { blockPlacementRefusal } from "./editor-block-menu";
import { SYNCED_REF_KEY, findBlockById } from "./editor-synced-block";

export const BLOCK_DRAG_THRESHOLD_PX = 4;

export const MOVE_ALREADY_FIRST = "This block is already first.";
export const MOVE_ALREADY_LAST = "This block is already last.";

const INTO_SELF = "A block cannot be dropped into itself.";
const TOGGLE_NESTING = "Toggles can only nest three levels deep.";

const UNMOVABLE = new Set<string>([KEYS.td, KEYS.th, KEYS.tr, KEYS.column, KEYS.codeLine]);

export type BlockDropDecision = {
  allowed: boolean;
  noop: boolean;
  reason?: string;
  unit: readonly [number, number];
};

export type SiblingMove = { ok: true; to: number[] } | { ok: false; reason: string };

export type DropBand = {
  path: number[];
  top: number;
  height: number;
  left: number;
  width: number;
};

export type DropIndicator = {
  top: number;
  left: number;
  width: number;
  to: number[];
  noop: boolean;
};

type ScrollSnap = {
  viewport: HTMLElement | null;
  top: number;
  left: number;
  windowX: number;
  windowY: number;
};

const refusedUnit: readonly [number, number] = [0, 0];

function refuse(reason: string, unit: readonly [number, number] = refusedUnit): BlockDropDecision {
  return { allowed: false, noop: false, reason, unit };
}

function elementId(node: TElement): string {
  const id: unknown = Reflect.get(node, "id");
  return typeof id === "string" ? id : "";
}

function listIndent(node: TElement): number | null {
  if (node.type !== KEYS.p) {
    return null;
  }
  const style: unknown = Reflect.get(node, "listStyleType");
  if (typeof style !== "string" || style.length === 0) {
    return null;
  }
  const indent: unknown = Reflect.get(node, "indent");
  if (typeof indent !== "number" || !Number.isInteger(indent)) {
    return 1;
  }
  return indent;
}

function elementAt(roots: readonly Descendant[], path: readonly number[]): TElement | null {
  let current: Descendant | undefined;
  let list: readonly Descendant[] = roots;
  for (const index of path) {
    current = list[index];
    if (!current || !ElementApi.isElement(current)) {
      return null;
    }
    list = current.children;
  }
  if (!current || !ElementApi.isElement(current)) {
    return null;
  }
  return current;
}

function childrenAt(
  roots: readonly Descendant[],
  parentPath: readonly number[],
): readonly Descendant[] | null {
  if (parentPath.length === 0) {
    return roots;
  }
  const parent = elementAt(roots, parentPath);
  return parent ? parent.children : null;
}

function samePath(left: readonly number[], right: readonly number[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

function startsWithPath(path: readonly number[], prefix: readonly number[]): boolean {
  if (prefix.length > path.length) {
    return false;
  }
  for (let index = 0; index < prefix.length; index += 1) {
    if (path[index] !== prefix[index]) {
      return false;
    }
  }
  return true;
}

// A list item is a paragraph with listStyleType. Plate stores nested items as
// the following siblings whose indent is greater. A non-list, or an item at an
// equal or smaller indent, ends the run. Headings are not list items.
export function listItemUnit(
  siblings: readonly Descendant[],
  index: number,
): readonly [number, number] {
  const node = siblings[index];
  if (!node || !ElementApi.isElement(node)) {
    return [index, index];
  }
  const base = listIndent(node);
  if (base === null) {
    return [index, index + 1];
  }
  let end = index + 1;
  while (end < siblings.length) {
    const next = siblings[end];
    if (!next || !ElementApi.isElement(next)) {
      break;
    }
    const indent = listIndent(next);
    if (indent === null || indent <= base) {
      break;
    }
    end += 1;
  }
  return [index, end];
}

function dropParentRefusal(parentType: string | null, toIndex: number): string | undefined {
  if (parentType === null) {
    return undefined;
  }
  if (parentType === KEYS.td || parentType === KEYS.th) {
    return "A table cell cannot hold a dropped block.";
  }
  if (parentType === KEYS.tr || parentType === KEYS.table) {
    return "A table moves as one block.";
  }
  if (parentType === KEYS.codeBlock || parentType === KEYS.codeLine) {
    return "A code block cannot hold a dropped block.";
  }
  if (parentType === KEYS.columnGroup) {
    return "Drop inside a column.";
  }
  if (parentType === SYNCED_REF_KEY) {
    return "A synced block cannot hold a dropped block.";
  }
  if (parentType === KEYS.toggle && toIndex === 0) {
    return "A toggle's label cannot be a drop target.";
  }
  return undefined;
}

function sourceRefusal(
  node: TElement,
  index: number,
  parentType: string | null,
): string | undefined {
  if (UNMOVABLE.has(node.type)) {
    return "This block cannot be moved.";
  }
  // A cell's paragraph is not a drag target. The table moves as one block.
  if (parentType === KEYS.td || parentType === KEYS.th) {
    return "This block cannot be moved.";
  }
  if (parentType === KEYS.toggle && index === 0) {
    return "A toggle label stays with its toggle.";
  }
  return undefined;
}

function toggleDepth(node: TElement): number {
  let nested = 0;
  for (const child of node.children) {
    if (!ElementApi.isElement(child)) {
      continue;
    }
    nested = Math.max(nested, toggleDepth(child));
  }
  return (node.type === KEYS.toggle ? 1 : 0) + nested;
}

function toggleLevel(roots: readonly Descendant[], parentPath: readonly number[]): number {
  let count = 0;
  for (let depth = 1; depth <= parentPath.length; depth += 1) {
    const node = elementAt(roots, parentPath.slice(0, depth));
    if (node?.type === KEYS.toggle) {
      count += 1;
    }
  }
  return count;
}

function insideMovedUnit(
  toParent: readonly number[],
  toIndex: number,
  fromParent: readonly number[],
  unit: readonly [number, number],
): boolean {
  const [start, end] = unit;
  for (let index = start; index < end; index += 1) {
    const unitPath = [...fromParent, index];
    if (samePath(toParent, unitPath) || startsWithPath(toParent, unitPath)) {
      return true;
    }
  }
  return samePath(toParent, fromParent) && toIndex > start && toIndex < end;
}

export function blockDropDecision(
  roots: readonly Descendant[],
  from: readonly number[],
  toParent: readonly number[],
  toIndex: number,
): BlockDropDecision {
  if (from.length === 0 || !Number.isInteger(toIndex) || toIndex < 0) {
    return refuse("This block cannot be moved.");
  }

  const fromParent = from.slice(0, -1);
  const fromIndex = from[from.length - 1] ?? 0;
  const siblings = childrenAt(roots, fromParent);
  const source = siblings?.[fromIndex];
  if (!siblings || !source || !ElementApi.isElement(source)) {
    return refuse("This block cannot be moved.");
  }

  const fromParentType =
    fromParent.length === 0 ? null : (elementAt(roots, fromParent)?.type ?? null);
  const unit = listItemUnit(siblings, fromIndex);
  const blocked = sourceRefusal(source, fromIndex, fromParentType);
  if (blocked !== undefined) {
    return refuse(blocked, unit);
  }

  const destination = childrenAt(roots, toParent);
  if (!destination || toIndex > destination.length) {
    return refuse("This block cannot be dropped here.", unit);
  }

  const toParentType = toParent.length === 0 ? null : (elementAt(roots, toParent)?.type ?? null);
  const parentReason = dropParentRefusal(toParentType, toIndex);
  if (parentReason !== undefined) {
    return refuse(parentReason, unit);
  }

  if (insideMovedUnit(toParent, toIndex, fromParent, unit)) {
    return refuse(INTO_SELF, unit);
  }

  if (samePath(toParent, fromParent) && (toIndex === unit[0] || toIndex === unit[1])) {
    return { allowed: true, noop: true, unit };
  }

  for (let index = unit[0]; index < unit[1]; index += 1) {
    const node = siblings[index];
    if (!node || !ElementApi.isElement(node)) {
      return refuse("This block cannot be moved.", unit);
    }
    const reason = blockPlacementRefusal(
      toParentType,
      toIndex,
      node.type,
      listIndent(node) !== null,
    );
    if (reason !== undefined) {
      return refuse(reason, unit);
    }
  }

  let movedDepth = 0;
  for (let index = unit[0]; index < unit[1]; index += 1) {
    const node = siblings[index];
    if (node && ElementApi.isElement(node)) {
      movedDepth = Math.max(movedDepth, toggleDepth(node));
    }
  }
  const limit = maxNesting(KEYS.toggle) ?? 3;
  if (toggleLevel(roots, toParent) + movedDepth > limit) {
    return refuse(TOGGLE_NESTING, unit);
  }

  return { allowed: true, noop: false, unit };
}

function previousRange(
  siblings: readonly Descendant[],
  unitStart: number,
): readonly [number, number] | null {
  if (unitStart <= 0) {
    return null;
  }
  for (let index = 0; index < unitStart; index += 1) {
    const range = listItemUnit(siblings, index);
    if (range[0] === index && range[1] === unitStart) {
      return range;
    }
  }
  return [unitStart - 1, unitStart];
}

function nextRange(
  siblings: readonly Descendant[],
  unitEnd: number,
): readonly [number, number] | null {
  if (unitEnd >= siblings.length) {
    return null;
  }
  return listItemUnit(siblings, unitEnd);
}

// Stops at the parent's first and last sibling. Dragging can cross containers;
// this step does not.
export function siblingMove(
  roots: readonly Descendant[],
  from: readonly number[],
  direction: "up" | "down",
): SiblingMove {
  if (from.length === 0) {
    return { ok: false, reason: "This block cannot be moved." };
  }
  const parent = from.slice(0, -1);
  const index = from[from.length - 1] ?? 0;
  const siblings = childrenAt(roots, parent);
  if (!siblings) {
    return { ok: false, reason: "This block cannot be moved." };
  }
  const unit = listItemUnit(siblings, index);
  const destination =
    direction === "up" ? previousRange(siblings, unit[0]) : nextRange(siblings, unit[1]);
  if (!destination) {
    return { ok: false, reason: direction === "up" ? MOVE_ALREADY_FIRST : MOVE_ALREADY_LAST };
  }
  const toIndex = direction === "up" ? destination[0] : destination[1];
  const decision = blockDropDecision(roots, from, parent, toIndex);
  if (!decision.allowed || decision.noop) {
    const edge = direction === "up" ? MOVE_ALREADY_FIRST : MOVE_ALREADY_LAST;
    // The label is not a sibling the body can trade places with.
    if (decision.reason === "A toggle's label cannot be a drop target.") {
      return { ok: false, reason: edge };
    }
    return { ok: false, reason: decision.reason ?? edge };
  }
  return { ok: true, to: [...parent, toIndex] };
}

function indicatorFor(band: DropBand, above: boolean, to: number[], noop: boolean): DropIndicator {
  return {
    top: above ? band.top - 1 : band.top + band.height - 1,
    left: band.left,
    width: band.width,
    to,
    noop,
  };
}

export function resolveDropIndicator(
  roots: readonly Descendant[],
  from: readonly number[],
  bands: readonly DropBand[],
  pointerY: number,
  unitBox: { first: DropBand; last: DropBand } | null,
): DropIndicator | null {
  for (const band of bands) {
    const index = band.path[band.path.length - 1] ?? 0;
    const parent = band.path.slice(0, -1);
    const above = pointerY < band.top + band.height / 2;
    const toIndex = above ? index : index + 1;
    const decision = blockDropDecision(roots, from, parent, toIndex);
    if (decision.allowed) {
      return indicatorFor(band, above, [...parent, toIndex], decision.noop);
    }
    if (decision.reason === INTO_SELF && unitBox) {
      const unionTop = unitBox.first.top;
      const unionBottom = unitBox.last.top + unitBox.last.height;
      const boundaryAbove = pointerY < (unionTop + unionBottom) / 2;
      const fromParent = from.slice(0, -1);
      const boundaryIndex = boundaryAbove ? decision.unit[0] : decision.unit[1];
      const boundary = blockDropDecision(roots, from, fromParent, boundaryIndex);
      if (boundary.allowed) {
        const box = boundaryAbove ? unitBox.first : unitBox.last;
        return indicatorFor(box, boundaryAbove, [...fromParent, boundaryIndex], boundary.noop);
      }
    }
  }
  return null;
}

export function dragPastThreshold(dx: number, dy: number): boolean {
  return dx * dx + dy * dy > BLOCK_DRAG_THRESHOLD_PX * BLOCK_DRAG_THRESHOLD_PX;
}

export function blockMoveDirection(event: {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}): "up" | "down" | null {
  if (event.metaKey === event.ctrlKey || !event.altKey || !event.shiftKey) {
    return null;
  }
  if (event.key === "ArrowUp") {
    return "up";
  }
  if (event.key === "ArrowDown") {
    return "down";
  }
  return null;
}

export function blockMoveTarget(editor: SlateEditor): number[] | null {
  const selection = editor.selection;
  if (!selection) {
    return null;
  }
  const hit = targetBlockAtPath(editor, selection.focus.path);
  return hit ? [...hit.path] : null;
}

function freshId(editor: SlateEditor): string {
  const seen = new Set<string>();
  const visit = (node: Descendant): void => {
    if (!ElementApi.isElement(node)) {
      return;
    }
    const id = elementId(node);
    if (id.length > 0) {
      seen.add(id);
    }
    for (const child of node.children) {
      visit(child);
    }
  };
  for (const child of editor.children) {
    visit(child);
  }
  let id = nanoid(10);
  let suffix = 1;
  while (id.length === 0 || seen.has(id)) {
    id = `${nanoid(10)}-${suffix}`;
    suffix += 1;
  }
  return id;
}

function repairEmptyContainer(editor: SlateEditor, parentPath: number[]): void {
  if (parentPath.length === 0) {
    return;
  }
  const parent = editor.api.node(parentPath);
  const node = parent?.[0];
  if (!parent || !ElementApi.isElement(node) || typeof node.type !== "string") {
    return;
  }
  if (node.children.length !== 0) {
    return;
  }
  const content = containerContentType(node.type);
  if (content === undefined) {
    return;
  }
  const child: TElement = { type: content, id: freshId(editor), children: [{ text: "" }] };
  editor.tf.insertNodes(child, { at: [...parentPath, 0] });
}

function selectMoved(editor: SlateEditor, id: string): void {
  if (id.length === 0) {
    return;
  }
  const landed = findBlockById(editor, id);
  if (!landed) {
    return;
  }
  const point = editor.api.start(landed[1]);
  if (point) {
    editor.tf.select(point);
  }
}

export function moveBlockAt(editor: SlateEditor, from: number[], to: number[]): boolean {
  const toParent = to.slice(0, -1);
  const toIndex = to[to.length - 1];
  if (toIndex === undefined) {
    return false;
  }
  const decision = blockDropDecision(editor.children, from, toParent, toIndex);
  if (!decision.allowed || decision.noop) {
    return false;
  }

  const fromParent = from.slice(0, -1);
  const [start, end] = decision.unit;
  const moving: TElement[] = [];
  for (let index = start; index < end; index += 1) {
    const entry = editor.api.node([...fromParent, index]);
    const node = entry?.[0];
    if (!entry || !ElementApi.isElement(node)) {
      return false;
    }
    moving.push(node);
  }
  if (moving.length === 0) {
    return false;
  }

  // The remove operation keeps the node for undo. Insert a copy so that snapshot stays put.
  const copies = moving.map((node) => structuredClone(node));
  const first = copies[0];
  if (!first) {
    return false;
  }
  const movedId = elementId(first);
  const destRef = editor.api.pathRef([...toParent, toIndex]);
  let inserted = false;
  editor.tf.withoutNormalizing(() => {
    for (let index = end - 1; index >= start; index -= 1) {
      editor.tf.removeNodes({ at: [...fromParent, index] });
    }
    repairEmptyContainer(editor, fromParent);
    const at = destRef.current;
    if (!at) {
      return;
    }
    let cursor = [...at];
    for (const copy of copies) {
      editor.tf.insertNodes(copy, { at: cursor });
      inserted = true;
      const next = [...cursor];
      const last = next[next.length - 1];
      if (last === undefined) {
        return;
      }
      next[next.length - 1] = last + 1;
      cursor = next;
    }
  });
  destRef.unref();
  if (!inserted) {
    return false;
  }
  selectMoved(editor, movedId);
  return true;
}

function movedElement(editor: SlateEditor): HTMLElement | null {
  const selection = editor.selection;
  if (!selection) {
    return null;
  }
  const target = targetBlockAtPath(editor, selection.anchor.path);
  if (!target) {
    return null;
  }
  const entry = editor.api.node(target.path);
  if (!entry || !ElementApi.isElement(entry[0])) {
    return null;
  }
  const dom: unknown = editor.api.toDOMNode(entry[0]);
  return dom instanceof HTMLElement ? dom : null;
}

export function captureEditorScroll(): ScrollSnap {
  const found = document.querySelector("[data-block-viewport]");
  const viewport = found instanceof HTMLElement ? found : null;
  return {
    viewport,
    top: viewport ? viewport.scrollTop : 0,
    left: viewport ? viewport.scrollLeft : 0,
    windowX: window.scrollX,
    windowY: window.scrollY,
  };
}

function outsideFrame(editor: SlateEditor, viewport: HTMLElement | null): boolean {
  const dom = movedElement(editor);
  if (!dom) {
    return false;
  }
  const rect = dom.getBoundingClientRect();
  if (viewport) {
    const frame = viewport.getBoundingClientRect();
    return rect.bottom <= frame.top + 1 || rect.top >= frame.bottom - 1;
  }
  return rect.bottom <= 0 || rect.top >= window.innerHeight;
}

export function settleMovedBlock(editor: SlateEditor, snap: ScrollSnap): void {
  if (outsideFrame(editor, snap.viewport)) {
    const dom = movedElement(editor);
    const frame = snap.viewport?.getBoundingClientRect();
    if (!dom || !snap.viewport || !frame) {
      dom?.scrollIntoView({ block: "nearest" });
      return;
    }
    const rect = dom.getBoundingClientRect();
    const delta = rect.top < frame.top ? rect.top - frame.top : rect.bottom - frame.bottom;
    snap.viewport.scrollTop += delta;
    return;
  }
  if (snap.viewport) {
    snap.viewport.scrollTop = snap.top;
    snap.viewport.scrollLeft = snap.left;
  }
  window.scrollTo(snap.windowX, snap.windowY);
}
