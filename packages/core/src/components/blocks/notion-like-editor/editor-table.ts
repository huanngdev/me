import { insertTableColumn, insertTableRow } from "@platejs/table";
import {
  KEYS,
  PathApi,
  PointApi,
  type Descendant,
  type SlateEditor,
  type TElement,
  type TText,
} from "platejs";

import type { Repair } from "./editor-document-ids";
import {
  allowedChildTypes,
  maxChildren,
  TABLE_MAX_COLUMNS,
  TABLE_MAX_ROWS,
} from "./editor-document-schema";
import { checkTableGrid, tableCoverage, type CoveredCell } from "./editor-table-grid";

export type TableCellContext = {
  tablePath: number[];
  cellPath: number[];
  rowIndex: number;
  /** Grid column. A colspan starts at this column. */
  columnIndex: number;
  cellIndex: number;
  rowCount: number;
  columnCount: number;
  colSpan: number;
  rowSpan: number;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function elementChildren(node: TElement): TElement[] {
  return node.children.filter(isTElement);
}

function tableRecord(node: TElement): Record<string, unknown> {
  const record: Record<string, unknown> = {};
  for (const key of Object.keys(node)) {
    record[key] = node[key];
  }

  return record;
}

function elementFromRecord(node: Record<string, unknown>): TElement | undefined {
  if (typeof node.type !== "string" || !Array.isArray(node.children)) {
    return undefined;
  }

  const children: Descendant[] = [];
  for (const child of node.children) {
    if (!isRecord(child)) {
      return undefined;
    }

    if (typeof child.text === "string") {
      const text: TText = { text: child.text };
      for (const key of Object.keys(child)) {
        if (key !== "text") {
          text[key] = child[key];
        }
      }
      children.push(text);
      continue;
    }

    const element = elementFromRecord(child);
    if (!element) {
      return undefined;
    }

    children.push(element);
  }

  const element: TElement = { type: node.type, children };
  for (const key of Object.keys(node)) {
    if (key === "type" || key === "children") {
      continue;
    }

    element[key] = node[key];
  }

  return element;
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
  let changed = keptRows.length !== node.children.length;
  const nextRows = keptRows.map((row) => {
    const cells = elementChildren(row);
    if (cells.length <= maxColumns) {
      return row;
    }

    truncated = true;
    changed = true;
    return { ...row, children: cells.slice(0, maxColumns) };
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
  const cellIndex = cellPath[cellPath.length - 1];
  if (rowIndex === undefined || cellIndex === undefined) {
    return undefined;
  }

  const coverage = tableCoverage(tableRecord(tableEntry[0]), tableMaxColumns());
  const covered = coverage.cells.find(
    (cell) => cell.rowIndex === rowIndex && cell.cellIndex === cellIndex,
  );

  return {
    tablePath: tableEntry[1],
    cellPath,
    rowIndex,
    columnIndex: covered?.column ?? cellIndex,
    cellIndex,
    rowCount: coverage.rowCount,
    columnCount: coverage.columnCount,
    colSpan: covered?.colSpan ?? 1,
    rowSpan: covered?.rowSpan ?? 1,
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
  return tableCoverage(tableRecord(table), tableMaxColumns()).columnCount;
}

function anchorAt(
  table: TElement,
  gridRow: number,
  gridColumn: number,
): CoveredCell | "covered" | undefined {
  const owner = tableCoverage(tableRecord(table), tableMaxColumns()).cells.find(
    (cell) =>
      cell.row <= gridRow &&
      gridRow < cell.row + cell.rowSpan &&
      cell.column <= gridColumn &&
      gridColumn < cell.column + cell.colSpan,
  );
  if (!owner) {
    return undefined;
  }

  if (owner.row !== gridRow || owner.column !== gridColumn) {
    return "covered";
  }

  return owner;
}

export function neutralizeInsertedColumnWidths(editor: SlateEditor, tablePath: number[]): void {
  const table = liveTable(editor, tablePath);
  const raw = table?.colSizes;
  if (!table || !Array.isArray(raw)) {
    return;
  }

  let changed = false;
  const next = raw.map((value) => {
    if (value === 0) {
      changed = true;
      return null;
    }

    return value;
  });
  if (!changed) {
    return;
  }

  if (next.every((value) => value === null)) {
    editor.tf.unsetNodes("colSizes", { at: tablePath });
    return;
  }

  editor.tf.setNodes({ colSizes: next }, { at: tablePath });
}

export function repairTableGrid(node: TElement, repairs: Repair[] | undefined): TElement {
  const checked = checkTableGrid(tableRecord(node), [], {
    maxRows: tableMaxRows(),
    maxColumns: tableMaxColumns(),
  });
  if (repairs !== undefined) {
    repairs.push(...checked.repairs);
  }

  if (checked.next === undefined) {
    return node;
  }

  return elementFromRecord(checked.next) ?? node;
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
          const firstRow = table.children[0];
          const lastCell = isTElement(firstRow) ? firstRow.children.length - 1 : 0;
          // fromCell is the last cell, so the new column is appended. The caret
          // is not a reliable anchor after writeCellText replaces a cell.
          insertTableColumn(editor, {
            select: false,
            fromCell: origin.tablePath.concat(0, lastCell),
          });
          neutralizeInsertedColumnWidths(editor, origin.tablePath);
          table = liveTable(editor, origin.tablePath);
          if (!table || columnCountOf(table) === before) {
            truncated = true;
            return;
          }
        }

        table = liveTable(editor, origin.tablePath);
        if (!table) {
          return;
        }

        const slot = anchorAt(table, targetRow, targetColumn);
        if (slot === "covered" || slot === undefined) {
          continue;
        }

        const cellText = row[columnOffset] ?? "";
        writeCellText(editor, origin.tablePath.concat(slot.rowIndex, slot.cellIndex), cellText);
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

  if (!isRecord(node)) {
    return false;
  }

  const checked = checkTableGrid(node, path, {
    maxRows: tableMaxRows(),
    maxColumns: tableMaxColumns(),
  });
  const replacement = checked.next === undefined ? undefined : elementFromRecord(checked.next);
  if (replacement) {
    editor.tf.withoutNormalizing(() => {
      editor.tf.removeNodes({ at: path });
      editor.tf.insertNodes(replacement, { at: path });
    });
    return true;
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
  const anchors = tableCoverage(tableRecord(table), tableMaxColumns()).cells.filter(
    (cell) => cell.column === 0,
  );
  if (anchors.length === 0) {
    return false;
  }

  return anchors.every((anchor) => {
    const row = table.children[anchor.rowIndex];
    const cell = isTElement(row) ? row.children[anchor.cellIndex] : undefined;
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
