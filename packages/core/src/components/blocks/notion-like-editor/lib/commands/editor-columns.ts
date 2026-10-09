import { setColumns } from "@platejs/layout";
import {
  ElementApi,
  KEYS,
  NodeApi,
  PathApi,
  RangeApi,
  type Descendant,
  type SlateEditor,
  type TElement,
  type TRange,
} from "platejs";

import type { EditorCommand } from "./editor-commands";
import { formatBlockLabel } from "../document/editor-document";
import type { Repair } from "../document/editor-document-ids";
import { allowedChildTypes } from "../document/editor-document-schema";
import { pasteRepairsOf, setPasteRepairs } from "../paste/editor-paste-repairs";
import type { EditorValue } from "../document/editor-value";

export const COLUMN_MIN_PERCENT = 20;
export const COLUMN_MIN_COUNT = 2;
export const COLUMN_MAX_COUNT = 3;

export const COLUMN_WIDTH_EQUAL =
  "Column widths were split equally because a width was missing, invalid, or below 20%.";
export const COLUMN_WIDTH_NORMALIZED = "Column widths were normalized so the group sums to 100%.";
export const COLUMN_UNWRAPPED = "A column group with one column was turned into blocks.";
export const COLUMN_NESTED = "A nested column group was moved out after its parent column group.";
export const COLUMN_LIFT_TOGGLE = "A column group inside a toggle was moved out after the toggle.";
export const COLUMN_LIFT_QUOTE = "A column group inside a quote was moved out after the quote.";
export const COLUMN_LIFT_CALLOUT =
  "A column group inside a callout was moved out after the callout.";
export const COLUMN_LIFT_TABLE = "A column group inside a table was moved out after the table.";
export const COLUMN_LIFTED = "A column group was moved out because columns are top-level only.";
export const COLUMN_CHILD_LIFTED =
  "A block that cannot sit in a column was moved out of the column group.";
export const COLUMN_FOLDED = "Columns after the third were folded into the third column.";
export const COLUMN_EMPTY = "An empty column was given an empty paragraph.";
export const COLUMN_BARE = "A column outside a column group was unwrapped.";

const COLUMN_MOVE_FORWARD = "forward";
const COLUMN_MOVE_BACKWARD = "backward";

type ColumnMove = typeof COLUMN_MOVE_FORWARD | typeof COLUMN_MOVE_BACKWARD;

type ParentKind =
  "root" | "group" | "column" | "toggle" | "quote" | "callout" | "table" | "row" | "cell" | "other";

type BlockResult = {
  blocks: Descendant[];
  escape: Descendant[];
  repairs: Repair[];
  changed: boolean;
};

type ListResult = {
  children: Descendant[];
  escape: Descendant[];
  repairs: Repair[];
  changed: boolean;
};

export type ColumnRepairResult = {
  content: EditorValue;
  repairs: Repair[];
  changed: boolean;
};

type ColumnKeyEvent = {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  preventDefault: () => void;
};

function emptyParagraph(): TElement {
  return { type: KEYS.p, children: [{ text: "" }] };
}

function isEditorValue(value: readonly Descendant[]): value is EditorValue {
  return value.every((node) => ElementApi.isElement(node));
}

export function formatColumnWidth(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  if (Number.isInteger(rounded)) {
    return `${rounded}%`;
  }

  return `${rounded.toFixed(2)}%`;
}

export function equalColumnWidths(count: number): string[] {
  const safe = Math.max(count, 1);
  const share = Math.round((100 / safe) * 100) / 100;
  const widths: number[] = [];
  let used = 0;
  for (let index = 0; index < safe - 1; index += 1) {
    widths.push(share);
    used += share;
  }
  widths.push(Math.round((100 - used) * 100) / 100);
  return widths.map(formatColumnWidth);
}

function parseColumnWidth(value: unknown): number | undefined {
  if (typeof value !== "string" || !value.endsWith("%")) {
    return undefined;
  }

  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }

  return parsed;
}

export function clampAndNormalizeWidths(input: readonly number[]): string[] {
  const count = input.length;
  if (count === 0) {
    return [];
  }

  const max = 100 - COLUMN_MIN_PERCENT * (count - 1);
  let values = input.map((value) => {
    if (!Number.isFinite(value)) {
      return 100 / count;
    }

    return Math.min(max, Math.max(COLUMN_MIN_PERCENT, value));
  });

  for (let guard = 0; guard < 8; guard += 1) {
    const sum = values.reduce((total, value) => total + value, 0);
    const diff = 100 - sum;
    if (Math.abs(diff) < 0.001) {
      break;
    }

    const room = values.map((value) => (diff > 0 ? max - value : value - COLUMN_MIN_PERCENT));
    const roomSum = room.reduce((total, value) => total + value, 0);
    if (roomSum <= 0.001) {
      break;
    }

    values = values.map((value, index) => value + (diff * (room[index] ?? 0)) / roomSum);
  }

  const formatted: number[] = [];
  let used = 0;
  for (let index = 0; index < count - 1; index += 1) {
    const rounded = Math.round((values[index] ?? 0) * 100) / 100;
    const clamped = Math.min(max, Math.max(COLUMN_MIN_PERCENT, rounded));
    formatted.push(clamped);
    used += clamped;
  }
  const last = Math.round((100 - used) * 100) / 100;
  if (last < COLUMN_MIN_PERCENT || last > max) {
    return equalColumnWidths(count);
  }
  formatted.push(last);
  return formatted.map(formatColumnWidth);
}

function parentKind(type: string): ParentKind {
  if (type === KEYS.columnGroup) {
    return "group";
  }
  if (type === KEYS.column) {
    return "column";
  }
  if (type === KEYS.toggle) {
    return "toggle";
  }
  if (type === KEYS.blockquote) {
    return "quote";
  }
  if (type === KEYS.callout) {
    return "callout";
  }
  if (type === KEYS.table) {
    return "table";
  }
  if (type === KEYS.tr) {
    return "row";
  }
  if (type === KEYS.td || type === KEYS.th) {
    return "cell";
  }
  return "other";
}

function liftMessage(kind: ParentKind, block: Descendant): string {
  if (!ElementApi.isElement(block) || block.type !== KEYS.columnGroup) {
    return COLUMN_CHILD_LIFTED;
  }

  if (kind === "column") {
    return COLUMN_NESTED;
  }
  if (kind === "toggle") {
    return COLUMN_LIFT_TOGGLE;
  }
  if (kind === "quote") {
    return COLUMN_LIFT_QUOTE;
  }
  if (kind === "callout") {
    return COLUMN_LIFT_CALLOUT;
  }
  if (kind === "cell" || kind === "row" || kind === "table") {
    return COLUMN_LIFT_TABLE;
  }
  return COLUMN_LIFTED;
}

function placeBlock(kind: ParentKind, block: Descendant): "keep" | "escape" | "unwrap" {
  if (!ElementApi.isElement(block) || typeof block.type !== "string") {
    return "keep";
  }

  if (block.type === KEYS.column && kind !== "group") {
    return "unwrap";
  }

  if (block.type === KEYS.columnGroup && kind !== "root") {
    return "escape";
  }

  if (kind === "column" || kind === "group") {
    const parentType = kind === "column" ? KEYS.column : KEYS.columnGroup;
    const allowed = allowedChildTypes(parentType);
    if (allowed !== undefined && !allowed.some((type) => type === block.type)) {
      return "escape";
    }
  }

  return "keep";
}

function unchanged(block: Descendant): BlockResult {
  return { blocks: [block], escape: [], repairs: [], changed: false };
}

function repairChildList(children: Descendant[], kind: ParentKind, path: number[]): ListResult {
  let changed = false;
  const next: Descendant[] = [];
  const escape: Descendant[] = [];
  const repairs: Repair[] = [];

  for (let index = 0; index < children.length; index += 1) {
    const child = children[index];
    if (child === undefined) {
      continue;
    }

    const result = repairNode(child, path.concat(index));
    if (result.changed || result.blocks.length !== 1 || result.blocks[0] !== child) {
      changed = true;
    }
    if (result.repairs.length > 0) {
      repairs.push(...result.repairs);
    }

    for (const block of result.blocks) {
      const action = placeBlock(kind, block);
      if (action === "escape") {
        escape.push(block);
        changed = true;
        repairs.push({ path: path.concat(index), message: liftMessage(kind, block) });
        continue;
      }

      if (action === "unwrap" && ElementApi.isElement(block)) {
        next.push(...block.children);
        changed = true;
        repairs.push({ path: path.concat(index), message: COLUMN_BARE });
        continue;
      }

      next.push(block);
    }

    if (result.escape.length > 0) {
      changed = true;
      if (kind === "root") {
        next.push(...result.escape);
      } else {
        escape.push(...result.escape);
      }
    }
  }

  if (!changed) {
    return { children, escape: [], repairs: [], changed: false };
  }

  return { children: next, escape, repairs, changed: true };
}

function withColumnChildren(node: TElement, children: Descendant[]): TElement {
  if (node.children === children) {
    return node;
  }

  return { ...node, children };
}

function columnElement(node: TElement, children: Descendant[], width: string): TElement {
  if (node.width === width && node.children === children) {
    return node;
  }

  return { ...node, width, children };
}

function repairColumn(node: TElement, path: number[]): BlockResult {
  const children = Array.isArray(node.children) ? node.children : [];
  const listed = repairChildList(children, "column", path);
  const elements: Descendant[] = [];
  const looseText: Descendant[] = [];
  for (const child of listed.children) {
    if (ElementApi.isElement(child)) {
      elements.push(child);
    } else {
      looseText.push(child);
    }
  }

  const repairs = [...listed.repairs];
  let changed = listed.changed || looseText.length > 0;
  if (looseText.length > 0) {
    elements.unshift({ type: KEYS.p, children: looseText });
    repairs.push({
      path,
      message: `${formatBlockLabel(path)} had loose text. It was wrapped in a paragraph.`,
    });
  }

  if (elements.length === 0) {
    elements.push(emptyParagraph());
    changed = true;
    repairs.push({ path, message: COLUMN_EMPTY });
  }

  const next = withColumnChildren(node, changed ? elements : node.children);
  if (!changed && next === node) {
    return {
      blocks: [node],
      escape: listed.escape,
      repairs,
      changed: listed.escape.length > 0,
    };
  }

  return { blocks: [next], escape: listed.escape, repairs, changed: true };
}

function widthsForColumns(columns: readonly TElement[]): { widths: string[]; message?: string } {
  const raw = columns.map((column) => column.width);
  const invalid = raw.some((value) => {
    const parsed = parseColumnWidth(value);
    return parsed === undefined || parsed < COLUMN_MIN_PERCENT;
  });
  if (invalid) {
    return { widths: equalColumnWidths(columns.length), message: COLUMN_WIDTH_EQUAL };
  }

  const numbers = raw.map((value) => parseColumnWidth(value) ?? 0);
  const fitted = clampAndNormalizeWidths(numbers);
  const same = fitted.every((width, index) => width === raw[index]);
  if (same) {
    return { widths: fitted };
  }

  return { widths: fitted, message: COLUMN_WIDTH_NORMALIZED };
}

function repairGroup(node: TElement, path: number[]): BlockResult {
  const repairs: Repair[] = [];
  const columns: TElement[] = [];
  const after: Descendant[] = [];
  let changed = false;
  const children = Array.isArray(node.children) ? node.children : [];

  for (let index = 0; index < children.length; index += 1) {
    const child = children[index];
    if (child === undefined) {
      continue;
    }

    if (!ElementApi.isElement(child) || child.type !== KEYS.column) {
      const lifted = repairNode(child, path.concat(index));
      after.push(...lifted.blocks, ...lifted.escape);
      repairs.push(...lifted.repairs);
      repairs.push({ path: path.concat(index), message: COLUMN_CHILD_LIFTED });
      changed = true;
      continue;
    }

    const repaired = repairColumn(child, path.concat(columns.length));
    const column = repaired.blocks[0];
    if (ElementApi.isElement(column) && column.type === KEYS.column) {
      if (column !== child || repaired.changed) {
        changed = true;
      }
      columns.push(column);
    }
    if (repaired.escape.length > 0) {
      after.push(...repaired.escape);
      changed = true;
    }
    repairs.push(...repaired.repairs);
    for (const extra of repaired.blocks.slice(1)) {
      after.push(extra);
      changed = true;
    }
  }

  if (columns.length === 0) {
    return { blocks: after, escape: [], repairs, changed: true };
  }

  if (columns.length === 1) {
    const only = columns[0];
    repairs.push({ path, message: COLUMN_UNWRAPPED });
    return {
      blocks: [...(only ? only.children : []), ...after],
      escape: [],
      repairs,
      changed: true,
    };
  }

  let kept = columns;
  if (columns.length > COLUMN_MAX_COUNT) {
    const third = columns[COLUMN_MAX_COUNT - 1];
    const extras = columns.slice(COLUMN_MAX_COUNT);
    if (third) {
      const folded = [...third.children];
      for (const extra of extras) {
        folded.push(...extra.children);
      }
      kept = [...columns.slice(0, COLUMN_MAX_COUNT - 1), { ...third, children: folded }];
    }
    repairs.push({ path, message: COLUMN_FOLDED });
    changed = true;
  }

  const fitted = widthsForColumns(kept);
  if (fitted.message !== undefined) {
    repairs.push({ path, message: fitted.message });
    changed = true;
  }

  const nextColumns = kept.map((column, index) =>
    columnElement(
      column,
      column.children,
      fitted.widths[index] ?? equalColumnWidths(kept.length)[index] ?? "50%",
    ),
  );
  if (nextColumns.some((column, index) => column !== kept[index])) {
    changed = true;
  }

  if (!changed && after.length === 0) {
    return unchanged(node);
  }

  const group: TElement = { ...node, children: nextColumns };
  return { blocks: [group, ...after], escape: [], repairs, changed: true };
}

function repairElement(node: TElement, path: number[]): BlockResult {
  const kind = parentKind(node.type);
  if (kind === "group") {
    return repairGroup(node, path);
  }
  if (kind === "column") {
    return repairColumn(node, path);
  }

  if (!Array.isArray(node.children)) {
    return unchanged(node);
  }

  const listed = repairChildList(node.children, kind, path);
  const needsParagraph =
    kind === "quote" || kind === "callout" || kind === "toggle" || kind === "cell";
  let nextChildren = listed.children;
  const repairs = [...listed.repairs];
  if (needsParagraph && listed.changed && nextChildren.length === 0) {
    nextChildren = [emptyParagraph()];
    repairs.push({ path, message: COLUMN_EMPTY });
  }

  if (!listed.changed && nextChildren === listed.children) {
    return {
      blocks: [node],
      escape: listed.escape,
      repairs,
      changed: listed.escape.length > 0 || repairs.length > 0,
    };
  }

  return {
    blocks: [{ ...node, children: nextChildren }],
    escape: listed.escape,
    repairs,
    changed: true,
  };
}

function repairNode(value: Descendant, path: number[]): BlockResult {
  if (!ElementApi.isElement(value)) {
    return unchanged(value);
  }

  return repairElement(value, path);
}

export function repairColumnContent(content: EditorValue): ColumnRepairResult {
  const listed = repairChildList(content, "root", []);
  let blocks = listed.children;
  const repairs = [...listed.repairs];
  let changed = listed.changed;
  if (listed.escape.length > 0) {
    blocks = [...blocks, ...listed.escape];
    changed = true;
  }

  if (blocks.length === 0) {
    if (!changed) {
      return { content, repairs: [], changed: false };
    }

    return {
      content: [emptyParagraph()],
      repairs: [
        ...repairs,
        { path: [], message: "An empty column group was replaced with an empty paragraph." },
      ],
      changed: true,
    };
  }

  if (!changed) {
    return { content, repairs: [], changed: false };
  }

  if (!isEditorValue(blocks)) {
    return { content, repairs: [], changed: false };
  }

  return { content: blocks, repairs, changed: true };
}

let columnRepairDepth = 0;

export function applyColumnRepair(editor: SlateEditor): boolean {
  if (columnRepairDepth > 0 || !isEditorValue(editor.children)) {
    return false;
  }

  const repaired = repairColumnContent(editor.children);
  if (!repaired.changed) {
    return false;
  }

  columnRepairDepth += 1;
  try {
    editor.tf.withoutNormalizing(() => {
      for (let index = editor.children.length - 1; index >= 0; index -= 1) {
        editor.tf.removeNodes({ at: [index] });
      }
      repaired.content.forEach((node, index) => {
        editor.tf.insertNodes(node, { at: [index] });
      });
    });
    if (repaired.repairs.length > 0) {
      setPasteRepairs(editor, [...pasteRepairsOf(editor), ...repaired.repairs]);
    }
  } finally {
    columnRepairDepth -= 1;
  }

  return true;
}

function columnGroupAbove(editor: SlateEditor): { node: TElement; path: number[] } | undefined {
  if (!editor.selection) {
    return undefined;
  }

  const entry = editor.api.above({
    match: (node) => ElementApi.isElement(node) && node.type === KEYS.columnGroup,
  });
  if (!entry || !ElementApi.isElement(entry[0]) || entry[0].type !== KEYS.columnGroup) {
    return undefined;
  }

  return { node: entry[0], path: entry[1] };
}

function inColumnGroup(editor: SlateEditor): boolean {
  return columnGroupAbove(editor) !== undefined;
}

function selectPath(editor: SlateEditor, path: number[]): void {
  const start = editor.api.start(path);
  if (start) {
    editor.tf.select(start);
  }
}

export function insertColumns(editor: SlateEditor, count: 2 | 3): void {
  const current = editor.api.block({ highest: true });
  if (!current) {
    return;
  }

  const at = PathApi.next(current[1]);
  if (!at) {
    return;
  }

  const widths = equalColumnWidths(count);
  const children = widths.map((width) => ({
    type: KEYS.column,
    width,
    children: [emptyParagraph()],
  }));
  editor.tf.withoutNormalizing(() => {
    editor.tf.insertNodes({ type: KEYS.columnGroup, children }, { at });
    selectPath(editor, at.concat([0, 0]));
  });
}

export function setColumnCount(editor: SlateEditor, count: 2 | 3): void {
  const group = columnGroupAbove(editor);
  if (!group || group.node.children.length === count) {
    return;
  }

  editor.tf.withoutNormalizing(() => {
    setColumns(editor, {
      at: group.path,
      columns: count,
      widths: equalColumnWidths(count),
    });
  });
}

function isPlaceholderParagraph(node: Descendant | undefined): boolean {
  return (
    node !== undefined &&
    ElementApi.isElement(node) &&
    node.type === KEYS.p &&
    NodeApi.string(node) === ""
  );
}

function isPlaceholderColumn(node: TElement): boolean {
  return node.children.length === 1 && isPlaceholderParagraph(node.children[0]);
}

function moveIntoColumn(
  editor: SlateEditor,
  blockPath: number[],
  columnPath: number[],
  column: TElement,
  place: "start" | "end",
): void {
  const replace = isPlaceholderColumn(column);
  const index = replace || place === "start" ? 0 : column.children.length;
  editor.tf.moveNodes({ at: blockPath, to: columnPath.concat(index) });
  if (!replace) {
    return;
  }

  const next = editor.api.node(columnPath);
  if (!next || !ElementApi.isElement(next[0]) || next[0].children.length !== 2) {
    return;
  }

  if (isPlaceholderParagraph(next[0].children[1])) {
    editor.tf.removeNodes({ at: columnPath.concat(1) });
  }
}

function columnAt(
  editor: SlateEditor,
  groupPath: number[],
  index: number,
): { node: TElement; path: number[] } | undefined {
  const entry = editor.api.node(groupPath.concat(index));
  if (!entry || !ElementApi.isElement(entry[0]) || entry[0].type !== KEYS.column) {
    return undefined;
  }

  return { node: entry[0], path: entry[1] };
}

function moveColumnChildren(
  editor: SlateEditor,
  groupPath: number[],
  from: number,
  to: number,
  place: "start" | "end",
): void {
  const source = columnAt(editor, groupPath, from);
  const target = columnAt(editor, groupPath, to);
  if (!source || !target || source.node.children.length === 0) {
    return;
  }

  const destination =
    place === "start" ? target.path.concat(0) : target.path.concat(target.node.children.length);
  editor.tf.moveNodes({ at: source.path, children: true, to: destination });
}

function replaceGroupWithChildren(editor: SlateEditor, groupPath: number[]): void {
  const entry = editor.api.node(groupPath);
  if (!entry || !ElementApi.isElement(entry[0]) || entry[0].type !== KEYS.columnGroup) {
    return;
  }

  const blocks: Descendant[] = [];
  for (const column of entry[0].children) {
    if (!ElementApi.isElement(column) || column.type !== KEYS.column) {
      if (ElementApi.isElement(column)) {
        blocks.push(column);
      }
      continue;
    }

    blocks.push(...column.children);
  }

  editor.tf.removeNodes({ at: groupPath });
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const block = blocks[index];
    if (block) {
      editor.tf.insertNodes(block, { at: groupPath });
    }
  }
  selectPath(editor, groupPath);
}

export function removeColumnAt(editor: SlateEditor, index: number): void {
  const group = columnGroupAbove(editor);
  if (!group) {
    return;
  }

  const count = group.node.children.length;
  if (index < 0 || index >= count) {
    return;
  }

  const groupPath = group.path;
  editor.tf.withoutNormalizing(() => {
    if (count <= 2) {
      const neighbour = index === 0 ? 1 : index - 1;
      moveColumnChildren(editor, groupPath, index, neighbour, index === 0 ? "start" : "end");
      editor.tf.removeNodes({ at: groupPath.concat(index) });
      replaceGroupWithChildren(editor, groupPath);
      return;
    }

    const neighbour = index === 0 ? 1 : index - 1;
    moveColumnChildren(editor, groupPath, index, neighbour, index === 0 ? "start" : "end");
    editor.tf.removeNodes({ at: groupPath.concat(index) });
    const widths = equalColumnWidths(count - 1);
    widths.forEach((width, columnIndex) => {
      editor.tf.setNodes({ width }, { at: groupPath.concat(columnIndex) });
    });
  });
}

export function unwrapColumns(editor: SlateEditor): void {
  const group = columnGroupAbove(editor);
  if (!group) {
    return;
  }

  editor.tf.withoutNormalizing(() => {
    replaceGroupWithChildren(editor, group.path);
  });
}

export function setColumnWidths(editor: SlateEditor, widths: readonly number[]): void {
  const group = columnGroupAbove(editor);
  if (!group || widths.length !== group.node.children.length) {
    return;
  }

  const next = clampAndNormalizeWidths(widths);
  const current = group.node.children.map((child) =>
    ElementApi.isElement(child) && typeof child.width === "string" ? child.width : "",
  );
  if (next.every((width, index) => width === current[index])) {
    return;
  }

  editor.tf.withoutNormalizing(() => {
    next.forEach((width, index) => {
      editor.tf.setNodes({ width }, { at: group.path.concat(index) });
    });
  });
}

export function removeColumnGroup(editor: SlateEditor): void {
  const group = columnGroupAbove(editor);
  if (!group) {
    return;
  }

  editor.tf.removeNodes({ at: group.path });
  if (editor.children.length === 0) {
    editor.tf.insertNodes(emptyParagraph(), { at: [0], select: true });
  }
}

function columnBlockEntry(
  editor: SlateEditor,
): { columnPath: number[]; blockPath: number[]; groupPath: number[] } | undefined {
  const selection = editor.selection;
  if (!selection) {
    return undefined;
  }

  const column = editor.api.above({
    at: selection,
    match: (node) => ElementApi.isElement(node) && node.type === KEYS.column,
  });
  if (!column) {
    return undefined;
  }

  const columnPath = column[1];
  const block = editor.api.above({
    at: selection,
    match: (_node, path) => path.length === columnPath.length + 1,
  });
  if (!block) {
    return undefined;
  }

  return {
    columnPath,
    blockPath: block[1],
    groupPath: PathApi.parent(columnPath),
  };
}

export function moveColumnBlock(editor: SlateEditor, direction: ColumnMove): boolean {
  const located = columnBlockEntry(editor);
  if (!located) {
    return false;
  }

  const groupEntry = editor.api.node(located.groupPath);
  if (
    !groupEntry ||
    !ElementApi.isElement(groupEntry[0]) ||
    groupEntry[0].type !== KEYS.columnGroup
  ) {
    return false;
  }

  const columnIndex = located.columnPath[located.columnPath.length - 1];
  if (columnIndex === undefined) {
    return false;
  }

  const columnCount = groupEntry[0].children.length;
  const blockRef = editor.api.pathRef(located.blockPath);
  const columnRef = editor.api.pathRef(located.columnPath);
  editor.tf.withoutNormalizing(() => {
    if (direction === COLUMN_MOVE_FORWARD && columnIndex < columnCount - 1) {
      const next = columnAt(editor, located.groupPath, columnIndex + 1);
      if (next) {
        moveIntoColumn(editor, located.blockPath, next.path, next.node, "start");
      }
    } else if (direction === COLUMN_MOVE_FORWARD) {
      const after = PathApi.next(located.groupPath);
      if (after) {
        editor.tf.moveNodes({ at: located.blockPath, to: after });
      }
    } else if (columnIndex > 0) {
      const previous = columnAt(editor, located.groupPath, columnIndex - 1);
      if (previous) {
        moveIntoColumn(editor, located.blockPath, previous.path, previous.node, "end");
      }
    } else {
      editor.tf.moveNodes({ at: located.blockPath, to: located.groupPath });
    }

    const sourcePath = columnRef.current;
    const source = sourcePath ? editor.api.node(sourcePath) : undefined;
    if (
      sourcePath &&
      source &&
      ElementApi.isElement(source[0]) &&
      source[0].type === KEYS.column &&
      source[0].children.length === 0
    ) {
      editor.tf.insertNodes(emptyParagraph(), { at: sourcePath.concat(0) });
    }
  });

  const landed = blockRef.current;
  blockRef.unref();
  columnRef.unref();
  if (landed) {
    selectPath(editor, landed);
  }
  return true;
}

export function onColumnKeyDown(editor: SlateEditor, event: ColumnKeyEvent): void {
  const modifier = event.metaKey || event.ctrlKey;
  if (!modifier || !event.altKey || event.shiftKey) {
    return;
  }

  if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") {
    return;
  }

  const moved = moveColumnBlock(
    editor,
    event.key === "ArrowRight" ? COLUMN_MOVE_FORWARD : COLUMN_MOVE_BACKWARD,
  );
  if (moved) {
    event.preventDefault();
  }
}

function listParagraph(node: TElement): boolean {
  return node.type === KEYS.p && node.listStyleType !== undefined;
}

export function isColumnBoundary(editor: SlateEditor): boolean {
  const selection: TRange | null = editor.selection;
  if (!selection || !RangeApi.isCollapsed(selection)) {
    return false;
  }

  const located = columnBlockEntry(editor);
  if (!located) {
    return false;
  }

  const index = located.blockPath[located.blockPath.length - 1];
  if (index !== 0) {
    return false;
  }

  const block = editor.api.node(located.blockPath);
  if (!block || !ElementApi.isElement(block[0])) {
    return false;
  }

  if (editor.api.isVoid(block[0])) {
    return false;
  }

  if (listParagraph(block[0]) && NodeApi.string(block[0]) !== "") {
    return false;
  }

  return editor.api.isStart(selection.anchor, located.blockPath);
}

export const insertColumns2: EditorCommand = {
  id: "block.insert.columns-2",
  label: "2 columns",
  group: "insert",
  run: (editor) => {
    insertColumns(editor, 2);
  },
};

export const insertColumns3: EditorCommand = {
  id: "block.insert.columns-3",
  label: "3 columns",
  group: "insert",
  run: (editor) => {
    insertColumns(editor, 3);
  },
};

export const setColumnCountCommand: EditorCommand<2 | 3> = {
  id: "block.columns.set-count",
  label: "Columns",
  group: "action",
  isEnabled: inColumnGroup,
  run: (editor, count) => {
    setColumnCount(editor, count);
  },
};

export const removeColumnCommand: EditorCommand<number> = {
  id: "block.columns.remove-column",
  label: "Remove column",
  group: "action",
  isEnabled: inColumnGroup,
  run: (editor, index) => {
    removeColumnAt(editor, index);
  },
};

export const unwrapColumnsCommand: EditorCommand = {
  id: "block.columns.unwrap",
  label: "Turn into blocks",
  group: "turn-into",
  isEnabled: inColumnGroup,
  run: (editor) => {
    unwrapColumns(editor);
  },
};

export const setColumnWidthsCommand: EditorCommand<readonly number[]> = {
  id: "block.columns.set-widths",
  label: "Column widths",
  group: "action",
  isEnabled: inColumnGroup,
  run: (editor, widths) => {
    setColumnWidths(editor, widths);
  },
};
