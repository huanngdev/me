import { insertTableColumn, insertTableRow } from "@platejs/table";
import { KEYS, PathApi, PointApi, type SlateEditor, type TElement } from "platejs";

import type { Repair } from "./editor-document-ids";
import {
  allowedChildTypes,
  maxChildren,
  TABLE_MAX_COLUMNS,
  TABLE_MAX_ROWS,
} from "./editor-document-schema";

export type TableCellContext = {
  tablePath: number[];
  cellPath: number[];
  rowIndex: number;
  columnIndex: number;
  rowCount: number;
  columnCount: number;
};

export function tableMaxRows(): number {
  return maxChildren(KEYS.table) ?? TABLE_MAX_ROWS;
}

export function tableMaxColumns(): number {
  return maxChildren(KEYS.tr) ?? TABLE_MAX_COLUMNS;
}

export function pastedTableTruncationMessage(): string {
  return `Pasted table kept the first ${tableMaxRows()} rows and ${tableMaxColumns()} columns. Cells past that cap were dropped.`;
}

function isTElement(node: unknown): node is TElement {
  return (
    typeof node === "object" &&
    node !== null &&
    "type" in node &&
    typeof node.type === "string" &&
    "children" in node &&
    Array.isArray(node.children)
  );
}

function emptyParagraph(text = ""): TElement {
  return { type: KEYS.p, children: [{ text }] };
}

export function emptyTableCell(header: boolean, text = ""): TElement {
  return {
    type: header ? KEYS.th : KEYS.td,
    children: [emptyParagraph(text)],
  };
}

export function createTableNode(rows: number, cols: number): TElement {
  const tableRows: TElement[] = [];
  for (let row = 0; row < rows; row += 1) {
    const cells: TElement[] = [];
    for (let column = 0; column < cols; column += 1) {
      cells.push(emptyTableCell(false));
    }
    tableRows.push({ type: KEYS.tr, children: cells });
  }

  return { type: KEYS.table, children: tableRows };
}

export function clampTableCount(value: number | undefined, fallback: number, max: number): number {
  if (value === undefined || !Number.isInteger(value)) {
    return fallback;
  }

  if (value < 1) {
    return 1;
  }

  if (value > max) {
    return max;
  }

  return value;
}

function elementChildren(node: TElement): TElement[] {
  return node.children.filter(isTElement);
}

export function capPastedTable(node: TElement, repairs: Repair[] | undefined): TElement {
  if (node.type !== KEYS.table) {
    return node;
  }

  const maxRows = tableMaxRows();
  const maxColumns = tableMaxColumns();
  const sourceRows = elementChildren(node);
  let truncated = sourceRows.length > maxRows;
  const keptRows = sourceRows.slice(0, maxRows);
  let width = 0;
  for (const row of keptRows) {
    const count = elementChildren(row).length;
    if (count > width) {
      width = count;
    }
  }

  if (width > maxColumns) {
    truncated = true;
    width = maxColumns;
  }

  if (width < 1) {
    width = 1;
  }

  let changed = keptRows.length !== node.children.length;
  const nextRows = keptRows.map((row) => {
    const cells = elementChildren(row);
    if (cells.length > width) {
      truncated = true;
    }

    const header = cells.length > 0 && cells.every((cell) => cell.type === KEYS.th);
    const nextCells = cells.slice(0, width);
    while (nextCells.length < width) {
      nextCells.push(emptyTableCell(header));
      changed = true;
    }

    if (
      nextCells.length !== row.children.length ||
      nextCells.some((cell, index) => cell !== row.children[index])
    ) {
      changed = true;
      return { ...row, children: nextCells };
    }

    return row;
  });

  if (
    truncated &&
    repairs !== undefined &&
    !repairs.some((repair) => repair.message === pastedTableTruncationMessage())
  ) {
    repairs.push({ path: [], message: pastedTableTruncationMessage() });
  }

  if (!changed && !truncated) {
    return node;
  }

  return { ...node, children: nextRows };
}

function isCellElement(node: unknown): node is TElement {
  return isTElement(node) && (node.type === KEYS.td || node.type === KEYS.th);
}

function contextForCell(editor: SlateEditor, cellPath: number[]): TableCellContext | undefined {
  const tableEntry = editor.api.above({
    at: cellPath,
    match: (node) => isTElement(node) && node.type === KEYS.table,
  });
  if (!tableEntry || !isTElement(tableEntry[0])) {
    return undefined;
  }

  const rowIndex = cellPath[cellPath.length - 2];
  const columnIndex = cellPath[cellPath.length - 1];
  if (rowIndex === undefined || columnIndex === undefined) {
    return undefined;
  }

  let columnCount = 0;
  for (const row of tableEntry[0].children) {
    if (isTElement(row) && row.children.length > columnCount) {
      columnCount = row.children.length;
    }
  }

  return {
    tablePath: tableEntry[1],
    cellPath,
    rowIndex,
    columnIndex,
    rowCount: tableEntry[0].children.length,
    columnCount,
  };
}

export function tableCellContext(editor: SlateEditor): TableCellContext | undefined {
  if (!editor.selection) {
    return undefined;
  }

  const cellEntry = editor.api.above({
    match: (node) => isCellElement(node),
  });
  if (!cellEntry || !isCellElement(cellEntry[0])) {
    return undefined;
  }

  return contextForCell(editor, cellEntry[1]);
}

// Plate's Tab selects the whole next cell, so the range is expanded but still
// inside one cell. A range that crosses cells is left for Plate.
export function selectedCellContext(editor: SlateEditor): TableCellContext | undefined {
  const selection = editor.selection;
  if (!selection) {
    return undefined;
  }

  const anchorEntry = editor.api.above({
    at: selection.anchor,
    match: (node) => isCellElement(node),
  });
  const focusEntry = editor.api.above({
    at: selection.focus,
    match: (node) => isCellElement(node),
  });
  if (!anchorEntry || !focusEntry || !isCellElement(anchorEntry[0])) {
    return undefined;
  }

  if (!PathApi.equals(anchorEntry[1], focusEntry[1])) {
    return undefined;
  }

  return contextForCell(editor, anchorEntry[1]);
}

export function caretAtCellStart(editor: SlateEditor, cellPath: number[]): boolean {
  if (!editor.selection || !editor.api.isCollapsed()) {
    return false;
  }

  const start = editor.api.start(cellPath);
  return start !== undefined && PointApi.equals(editor.selection.anchor, start);
}

export function replaceTableWithParagraph(editor: SlateEditor, tablePath: number[]): void {
  editor.tf.removeNodes({ at: tablePath });
  editor.tf.insertNodes(emptyParagraph(), { at: tablePath, select: true });
}

function liveTable(editor: SlateEditor, tablePath: number[]): TElement | undefined {
  const entry = editor.api.node(tablePath);
  return entry && isTElement(entry[0]) && entry[0].type === KEYS.table ? entry[0] : undefined;
}

function rowCountOf(table: TElement): number {
  return table.children.length;
}

function columnCountOf(table: TElement): number {
  let count = 0;
  for (const row of table.children) {
    if (isTElement(row) && row.children.length > count) {
      count = row.children.length;
    }
  }

  return count;
}

export function tsvGrid(text: string): string[][] | undefined {
  if (!text.includes("\t")) {
    return undefined;
  }

  const normalized = text.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
  const lines = normalized.split("\n");
  if (lines.at(-1) === "") {
    lines.pop();
  }

  if (lines.length === 0) {
    return undefined;
  }

  return lines.map((line) => line.split("\t"));
}

function writeCellText(editor: SlateEditor, cellPath: number[], text: string): void {
  if (!editor.api.node(cellPath)) {
    return;
  }

  editor.tf.replaceNodes(emptyParagraph(text), { at: cellPath, children: true });
}

export function fillTableWithTsv(
  editor: SlateEditor,
  text: string,
): { handled: boolean; truncated: boolean } {
  const grid = tsvGrid(text);
  const origin = tableCellContext(editor);
  if (!grid || !origin) {
    return { handled: false, truncated: false };
  }

  const maxRows = tableMaxRows();
  const maxColumns = tableMaxColumns();
  let truncated = false;

  editor.tf.withoutNormalizing(() => {
    for (let rowOffset = 0; rowOffset < grid.length; rowOffset += 1) {
      const targetRow = origin.rowIndex + rowOffset;
      if (targetRow >= maxRows) {
        truncated = true;
        break;
      }

      let table = liveTable(editor, origin.tablePath);
      if (!table) {
        return;
      }

      while (rowCountOf(table) <= targetRow) {
        if (rowCountOf(table) >= maxRows) {
          truncated = true;
          break;
        }

        const before = rowCountOf(table);
        // fromRow, not the selection: writing a cell replaces its children and
        // moves the caret out of the table, and insertTableRow then no-ops.
        insertTableRow(editor, {
          select: false,
          fromRow: origin.tablePath.concat(before - 1),
        });
        table = liveTable(editor, origin.tablePath);
        if (!table || rowCountOf(table) === before) {
          truncated = true;
          return;
        }
      }

      const row = grid[rowOffset];
      if (!row || !table) {
        continue;
      }

      for (let columnOffset = 0; columnOffset < row.length; columnOffset += 1) {
        const targetColumn = origin.columnIndex + columnOffset;
        if (targetColumn >= maxColumns) {
          truncated = true;
          continue;
        }

        table = liveTable(editor, origin.tablePath);
        if (!table) {
          return;
        }

        while (columnCountOf(table) <= targetColumn) {
          if (columnCountOf(table) >= maxColumns) {
            truncated = true;
            break;
          }

          const before = columnCountOf(table);
          // fromCell is the last cell, so the new column is appended. The caret
          // is not a reliable anchor after writeCellText replaces a cell.
          insertTableColumn(editor, {
            select: false,
            fromCell: origin.tablePath.concat(0, before - 1),
          });
          table = liveTable(editor, origin.tablePath);
          if (!table || columnCountOf(table) === before) {
            truncated = true;
            return;
          }
        }

        const cellText = row[columnOffset] ?? "";
        writeCellText(editor, origin.tablePath.concat(targetRow, targetColumn), cellText);
      }
    }
  });

  return { handled: true, truncated };
}

function followingParagraphAllowed(editor: SlateEditor, tablePath: number[]): boolean {
  if (tablePath.length === 1) {
    return true;
  }

  const parent = editor.api.node(tablePath.slice(0, -1));
  if (!parent || !isTElement(parent[0])) {
    return false;
  }

  const childTypes = allowedChildTypes(parent[0].type);
  return (
    childTypes !== undefined &&
    childTypes.some((type) => type === KEYS.p) &&
    childTypes.some((type) => type === KEYS.table)
  );
}

function ensureParagraphAfterTable(editor: SlateEditor, tablePath: number[]): boolean {
  if (!followingParagraphAllowed(editor, tablePath)) {
    return false;
  }

  const next = PathApi.next(tablePath);
  if (!next || editor.api.node(next)) {
    return false;
  }

  editor.tf.insertNodes(emptyParagraph(), { at: next });
  return true;
}

export function normalizeTableNode(
  editor: SlateEditor,
  node: { type: string; children?: unknown },
  path: number[],
): boolean {
  if (node.type !== KEYS.table || !Array.isArray(node.children)) {
    return false;
  }

  const rows = node.children.filter(isTElement);
  if (rows.length === 0) {
    editor.tf.removeNodes({ at: path });
    if (editor.children.length === 0) {
      editor.tf.insertNodes(emptyParagraph(), { at: path.length === 1 ? path : [0], select: true });
    }
    return true;
  }

  if (rows.length > tableMaxRows()) {
    editor.tf.removeNodes({ at: path.concat(tableMaxRows()) });
    return true;
  }

  let width = 1;
  for (const row of rows) {
    const count = elementChildren(row).length;
    if (count > width) {
      width = count;
    }
  }

  if (width > tableMaxColumns()) {
    width = tableMaxColumns();
  }

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    if (!row) {
      continue;
    }

    const cells = elementChildren(row);
    if (cells.length > width) {
      editor.tf.removeNodes({ at: path.concat(rowIndex, cells.length - 1) });
      return true;
    }

    if (cells.length < width) {
      const header = cells.length > 0 && cells.every((cell) => cell.type === KEYS.th);
      editor.tf.insertNodes(emptyTableCell(header), { at: path.concat(rowIndex, cells.length) });
      return true;
    }
  }

  return ensureParagraphAfterTable(editor, path);
}

export function rowIsHeader(table: TElement): boolean {
  const row = table.children[0];
  if (!isTElement(row) || row.children.length === 0) {
    return false;
  }

  return row.children.every((cell) => isTElement(cell) && cell.type === KEYS.th);
}

export function columnIsHeader(table: TElement): boolean {
  if (table.children.length === 0) {
    return false;
  }

  return table.children.every((row) => {
    if (!isTElement(row)) {
      return false;
    }

    const cell = row.children[0];
    return isTElement(cell) && cell.type === KEYS.th;
  });
}

export function wholeTableSelection(editor: SlateEditor): number[] | undefined {
  if (!editor.selection || editor.api.isCollapsed()) {
    return undefined;
  }

  const matchesTable = (node: unknown): boolean => isTElement(node) && node.type === KEYS.table;
  if (!editor.api.isAt({ block: true, match: matchesTable })) {
    return undefined;
  }

  const entry = editor.api.block({ match: matchesTable });
  return entry?.[1];
}
