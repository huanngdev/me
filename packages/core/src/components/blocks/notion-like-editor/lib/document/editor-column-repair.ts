import { ElementApi, KEYS, type Descendant, type TElement } from "platejs";

import { formatBlockLabel } from "./editor-document";
import type { Repair } from "./editor-document-ids";
import { allowedChildTypes } from "./editor-document-schema";
import type { EditorValue } from "./editor-value";

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

export function emptyParagraph(): TElement {
  return { type: KEYS.p, children: [{ text: "" }] };
}

export function isEditorValue(value: readonly Descendant[]): value is EditorValue {
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
