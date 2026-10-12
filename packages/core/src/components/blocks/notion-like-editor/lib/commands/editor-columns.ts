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
import { pasteRepairsOf, setPasteRepairs } from "../paste/editor-paste-repairs";

import {
  COLUMN_BARE,
  COLUMN_CHILD_LIFTED,
  COLUMN_EMPTY,
  COLUMN_FOLDED,
  COLUMN_LIFT_CALLOUT,
  COLUMN_LIFT_QUOTE,
  COLUMN_LIFT_TABLE,
  COLUMN_LIFT_TOGGLE,
  COLUMN_LIFTED,
  COLUMN_MAX_COUNT,
  COLUMN_MIN_COUNT,
  COLUMN_MIN_PERCENT,
  COLUMN_NESTED,
  COLUMN_UNWRAPPED,
  COLUMN_WIDTH_EQUAL,
  COLUMN_WIDTH_NORMALIZED,
  clampAndNormalizeWidths,
  equalColumnWidths,
  emptyParagraph,
  formatColumnWidth,
  isEditorValue,
  repairColumnContent,
} from "../document/editor-column-repair";

export {
  COLUMN_BARE,
  COLUMN_CHILD_LIFTED,
  COLUMN_EMPTY,
  COLUMN_FOLDED,
  COLUMN_LIFT_CALLOUT,
  COLUMN_LIFT_QUOTE,
  COLUMN_LIFT_TABLE,
  COLUMN_LIFT_TOGGLE,
  COLUMN_LIFTED,
  COLUMN_MAX_COUNT,
  COLUMN_MIN_COUNT,
  COLUMN_MIN_PERCENT,
  COLUMN_NESTED,
  COLUMN_UNWRAPPED,
  COLUMN_WIDTH_EQUAL,
  COLUMN_WIDTH_NORMALIZED,
  clampAndNormalizeWidths,
  equalColumnWidths,
  formatColumnWidth,
  repairColumnContent,
};

const COLUMN_MOVE_FORWARD = "forward";
const COLUMN_MOVE_BACKWARD = "backward";

type ColumnMove = typeof COLUMN_MOVE_FORWARD | typeof COLUMN_MOVE_BACKWARD;

type ColumnKeyEvent = {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  preventDefault: () => void;
};

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

// Insert a column group as the next sibling of `path`, inside its container.
// Used by the Add picker; insertColumns above works from the selection.
export function insertColumnsBelow(
  editor: SlateEditor,
  path: readonly number[],
  count: 2 | 3,
): void {
  const at = PathApi.next([...path]);
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
  label: "Delete column",
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
