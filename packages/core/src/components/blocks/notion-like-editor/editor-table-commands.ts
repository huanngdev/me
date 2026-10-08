import {
  deleteColumn,
  deleteRow,
  getTableGridAbove,
  insertTableColumn as insertPlateTableColumn,
  insertTableRow as insertPlateTableRow,
  mergeTableCells as mergePlateTableCells,
  splitTableCell as splitPlateTableCell,
} from "@platejs/table";
import {
  ElementApi,
  KEYS,
  PathApi,
  TextApi,
  nanoid,
  type SlateEditor,
  type TElement,
  type TText,
} from "platejs";

import { directText, isPlainParagraph, type EditorCommand } from "./editor-commands";
import {
  clampTableCount,
  columnIsHeader,
  createTableNode,
  neutralizeInsertedColumnWidths,
  replaceTableWithParagraph,
  rowIsHeader,
  tableCellContext,
  tableMaxColumns,
  tableMaxRows,
  type TableCellContext,
} from "./editor-table";
import {
  boundaryIsClean,
  rowSliceIsClean,
  tableCoverage,
  TABLE_MAX_COLUMN_WIDTH,
  TABLE_MIN_COLUMN_WIDTH,
} from "./editor-table-grid";

function editorIsReadOnly(editor: SlateEditor): boolean {
  return editor.dom.readOnly === true;
}

function inTable(editor: SlateEditor): boolean {
  return !editorIsReadOnly(editor) && tableCellContext(editor) !== undefined;
}

function nodeRecord(node: TElement): Record<string, unknown> {
  const record: Record<string, unknown> = {};
  for (const key of Object.keys(node)) {
    record[key] = node[key];
  }

  return record;
}

function currentTable(editor: SlateEditor): { node: TElement; cell: TableCellContext } | undefined {
  const cell = tableCellContext(editor);
  if (!cell) {
    return undefined;
  }

  const node = editor.api.node(cell.tablePath)?.[0];
  if (!ElementApi.isElement(node) || node.type !== KEYS.table) {
    return undefined;
  }

  return { node, cell };
}

function collapseToCell(editor: SlateEditor, cellPath: number[]): void {
  if (!editor.selection || editor.api.isCollapsed()) {
    return;
  }

  const start = editor.api.start(cellPath);
  if (start) {
    editor.tf.select(start);
  }
}

function setFirstAxisType(editor: SlateEditor, axis: "row" | "column", header: boolean): void {
  const current = currentTable(editor);
  if (!current) {
    return;
  }

  const nextType = header ? KEYS.th : KEYS.td;
  if (axis === "row") {
    const row = current.node.children[0];
    if (!ElementApi.isElement(row)) {
      return;
    }

    for (let index = 0; index < row.children.length; index += 1) {
      editor.tf.setNodes({ type: nextType }, { at: current.cell.tablePath.concat(0, index) });
    }
    return;
  }

  const anchors = tableCoverage(nodeRecord(current.node), tableMaxColumns()).cells.filter(
    (cell) => cell.column === 0,
  );
  for (const anchor of anchors) {
    editor.tf.setNodes(
      { type: nextType },
      { at: current.cell.tablePath.concat(anchor.rowIndex, anchor.cellIndex) },
    );
  }
}

const MERGE_CELLS_REASON = "Select a rectangle of cells to merge";
const SPLIT_CELL_REASON = "Select a merged cell to split.";

function selectedTableCells(editor: SlateEditor): { node: TElement; path: number[] }[] {
  const cells: { node: TElement; path: number[] }[] = [];
  for (const entry of getTableGridAbove(editor, { format: "cell" })) {
    const node = entry[0];
    const path = entry[1];
    if (!ElementApi.isElement(node) || !Array.isArray(path)) {
      continue;
    }

    cells.push({ node, path: [...path] });
  }

  return cells;
}

export function mergeCellsReason(editor: SlateEditor): string | undefined {
  if (editorIsReadOnly(editor)) {
    return undefined;
  }

  const cells = selectedTableCells(editor);
  const first = cells[0];
  if (!first || cells.length < 2) {
    return MERGE_CELLS_REASON;
  }

  const tablePath = first.path.slice(0, -2);
  if (!cells.every((cell) => PathApi.equals(cell.path.slice(0, -2), tablePath))) {
    return MERGE_CELLS_REASON;
  }

  const table = editor.api.node(tablePath)?.[0];
  if (!ElementApi.isElement(table) || table.type !== KEYS.table) {
    return MERGE_CELLS_REASON;
  }

  const coverage = tableCoverage(nodeRecord(table), tableMaxColumns());
  const selected = cells.flatMap((cell) => {
    const rowIndex = cell.path[cell.path.length - 2];
    const cellIndex = cell.path[cell.path.length - 1];
    const found = coverage.cells.find(
      (item) => item.rowIndex === rowIndex && item.cellIndex === cellIndex,
    );
    return found === undefined ? [] : [found];
  });
  if (selected.length < 2) {
    return MERGE_CELLS_REASON;
  }

  const minRow = Math.min(...selected.map((cell) => cell.row));
  const maxRow = Math.max(...selected.map((cell) => cell.row + cell.rowSpan - 1));
  const minColumn = Math.min(...selected.map((cell) => cell.column));
  const maxColumn = Math.max(...selected.map((cell) => cell.column + cell.colSpan - 1));
  const covered = new Set<string>();
  for (const cell of selected) {
    for (let rowOffset = 0; rowOffset < cell.rowSpan; rowOffset += 1) {
      for (let columnOffset = 0; columnOffset < cell.colSpan; columnOffset += 1) {
        covered.add(`${cell.row + rowOffset}:${cell.column + columnOffset}`);
      }
    }
  }

  const width = maxColumn - minColumn + 1;
  const height = maxRow - minRow + 1;
  return covered.size === width * height ? undefined : MERGE_CELLS_REASON;
}

export function splitCellReason(editor: SlateEditor): string | undefined {
  if (editorIsReadOnly(editor)) {
    return undefined;
  }

  const cell = tableCellContext(editor);
  if (!cell || (cell.colSpan <= 1 && cell.rowSpan <= 1)) {
    return SPLIT_CELL_REASON;
  }

  return undefined;
}

function columnCanDuplicate(node: TElement, column: number): boolean {
  return tableCoverage(nodeRecord(node), tableMaxColumns()).cells.every((cell) => {
    const covers = cell.column <= column && column <= cell.column + cell.colSpan - 1;
    if (!covers) {
      return true;
    }

    return cell.column === column && cell.colSpan === 1 && cell.rowSpan === 1;
  });
}

export function duplicateRowReason(editor: SlateEditor): string | undefined {
  if (editorIsReadOnly(editor)) {
    return undefined;
  }

  const current = currentTable(editor);
  if (!current) {
    return undefined;
  }

  if (current.cell.rowCount >= tableMaxRows()) {
    return `This table already has ${tableMaxRows()} rows.`;
  }

  if (!rowSliceIsClean(nodeRecord(current.node), current.cell.rowIndex)) {
    return "A merged cell crosses this row.";
  }

  return undefined;
}

export function duplicateColumnReason(editor: SlateEditor): string | undefined {
  if (editorIsReadOnly(editor)) {
    return undefined;
  }

  const current = currentTable(editor);
  if (!current) {
    return undefined;
  }

  if (current.cell.columnCount >= tableMaxColumns()) {
    return `This table already has ${tableMaxColumns()} columns.`;
  }

  if (!columnCanDuplicate(current.node, current.cell.columnIndex)) {
    return "A merged cell crosses this column.";
  }

  return undefined;
}

export function moveRowReason(editor: SlateEditor, direction: "up" | "down"): string | undefined {
  if (editorIsReadOnly(editor)) {
    return undefined;
  }

  const current = currentTable(editor);
  if (!current) {
    return undefined;
  }

  const neighbor = direction === "up" ? current.cell.rowIndex - 1 : current.cell.rowIndex + 1;
  if (neighbor < 0) {
    return "This row is already at the top.";
  }

  if (neighbor >= current.cell.rowCount) {
    return "This row is already at the bottom.";
  }

  if (!boundaryIsClean(nodeRecord(current.node), "row", current.cell.rowIndex, neighbor)) {
    return "A merged cell crosses this row.";
  }

  return undefined;
}

export function moveColumnReason(
  editor: SlateEditor,
  direction: "left" | "right",
): string | undefined {
  if (editorIsReadOnly(editor)) {
    return undefined;
  }

  const current = currentTable(editor);
  if (!current) {
    return undefined;
  }

  const neighbor =
    direction === "left" ? current.cell.columnIndex - 1 : current.cell.columnIndex + 1;
  if (neighbor < 0) {
    return "This column is already at the left.";
  }

  if (neighbor >= current.cell.columnCount) {
    return "This column is already at the right.";
  }

  if (!boundaryIsClean(nodeRecord(current.node), "column", current.cell.columnIndex, neighbor)) {
    return "A merged cell crosses this column.";
  }

  return undefined;
}

function commandEnabled(
  editor: SlateEditor,
  reason: (editor: SlateEditor) => string | undefined,
): boolean {
  return (
    !editorIsReadOnly(editor) &&
    tableCellContext(editor) !== undefined &&
    reason(editor) === undefined
  );
}

function cloneWithNewIds(node: TElement): TElement {
  const copy: TElement = { type: node.type, id: nanoid(10), children: [] };
  for (const key of Object.keys(node)) {
    if (key === "type" || key === "id" || key === "children") {
      continue;
    }

    copy[key] = node[key];
  }

  copy.children = node.children.map((child) => {
    if (TextApi.isText(child)) {
      const text: TText = { text: child.text };
      for (const key of Object.keys(child)) {
        if (key !== "text") {
          text[key] = child[key];
        }
      }

      return text;
    }

    if (ElementApi.isElement(child)) {
      return cloneWithNewIds(child);
    }

    return { text: "" };
  });

  return copy;
}

function selectSurvivingCell(editor: SlateEditor, tablePath: number[], rowIndex: number): void {
  const node = editor.api.node(tablePath)?.[0];
  if (!ElementApi.isElement(node) || node.type !== KEYS.table) {
    if (!editor.api.node(tablePath)) {
      editor.tf.insertNodes(
        { type: KEYS.p, children: [{ text: "" }] },
        { at: tablePath, select: true },
      );
    }
    return;
  }

  const row = Math.min(Math.max(0, rowIndex), node.children.length - 1);
  const start = editor.api.start(tablePath.concat(row, 0));
  if (start) {
    editor.tf.select(start);
  }
}

function columnWidths(node: TElement): (number | null)[] | undefined {
  const raw = node.colSizes;
  if (!Array.isArray(raw)) {
    return undefined;
  }

  return raw.map((value) => (typeof value === "number" || value === null ? value : null));
}

// No shortcut. The slash menu and toolbar own insertion (DEV-122/125).
// Rows and columns are clamped to the table cap. The size picker is UI for those tasks.
export const insertTable: EditorCommand<{ rows?: number; cols?: number } | undefined> = {
  id: "block.insert.table",
  label: "Table",
  group: "insert",
  isEnabled: (editor) => !editorIsReadOnly(editor),
  run: (editor, payload) => {
    const rows = clampTableCount(payload?.rows, 3, tableMaxRows());
    const cols = clampTableCount(payload?.cols, 3, tableMaxColumns());
    const entry = editor.api.block({ highest: true });
    if (!entry || !ElementApi.isElement(entry[0]) || typeof entry[0].type !== "string") {
      return;
    }

    const [node, path] = entry;
    let tablePath = path;
    const table = createTableNode(rows, cols);
    if (path.length === 1 && isPlainParagraph(node) && directText(node).length === 0) {
      editor.tf.removeNodes({ at: path });
      editor.tf.insertNodes(table, { at: path, select: false });
    } else {
      const at = PathApi.next(path);
      if (!at) {
        return;
      }

      editor.tf.insertNodes(table, { at, select: false });
      tablePath = at;
    }

    const after = PathApi.next(tablePath);
    if (after && !editor.api.node(after)) {
      editor.tf.insertNodes(
        { type: KEYS.p, children: [{ text: "" }] },
        { at: after, select: false },
      );
    }

    const start = editor.api.start(tablePath.concat(0, 0));
    if (start) {
      editor.tf.select(start);
    }
  },
};

export const insertTableRow: EditorCommand<{ before?: boolean } | undefined> = {
  id: "block.table.insert-row",
  label: "Insert row",
  group: "insert",
  isEnabled: inTable,
  run: (editor, payload) => {
    const cell = tableCellContext(editor);
    if (!cell || cell.rowCount >= tableMaxRows()) {
      return;
    }

    collapseToCell(editor, cell.cellPath);
    insertPlateTableRow(editor, {
      before: payload?.before === true,
      select: false,
    });
  },
};

export const insertTableColumn: EditorCommand<{ before?: boolean } | undefined> = {
  id: "block.table.insert-column",
  label: "Insert column",
  group: "insert",
  isEnabled: inTable,
  run: (editor, payload) => {
    const cell = tableCellContext(editor);
    if (!cell || cell.columnCount >= tableMaxColumns()) {
      return;
    }

    editor.tf.withoutNormalizing(() => {
      collapseToCell(editor, cell.cellPath);
      insertPlateTableColumn(editor, {
        before: payload?.before === true,
        select: false,
      });
      neutralizeInsertedColumnWidths(editor, cell.tablePath);
    });
  },
};

export const deleteTableRow: EditorCommand = {
  id: "block.table.delete-row",
  label: "Delete row",
  group: "insert",
  isEnabled: inTable,
  run: (editor) => {
    const cell = tableCellContext(editor);
    if (!cell) {
      return;
    }

    if (cell.rowCount <= 1 || (cell.rowIndex === 0 && cell.rowSpan >= cell.rowCount)) {
      replaceTableWithParagraph(editor, cell.tablePath);
      return;
    }

    // Plate's merge-aware row delete inserts the surviving span, then removes
    // the row. Normalizing between those steps replaces the table and leaves
    // the removal on a stale path.
    editor.tf.withoutNormalizing(() => {
      collapseToCell(editor, cell.cellPath);
      deleteRow(editor);
    });
    selectSurvivingCell(editor, cell.tablePath, cell.rowIndex);
  },
};

export const deleteTableColumn: EditorCommand = {
  id: "block.table.delete-column",
  label: "Delete column",
  group: "insert",
  isEnabled: inTable,
  run: (editor) => {
    const cell = tableCellContext(editor);
    if (!cell) {
      return;
    }

    if (cell.columnCount <= 1 || cell.colSpan >= cell.columnCount) {
      replaceTableWithParagraph(editor, cell.tablePath);
      return;
    }

    editor.tf.withoutNormalizing(() => {
      collapseToCell(editor, cell.cellPath);
      deleteColumn(editor);
    });
    selectSurvivingCell(editor, cell.tablePath, cell.rowIndex);
  },
};

export const deleteTable: EditorCommand = {
  id: "block.table.delete",
  label: "Delete table",
  group: "insert",
  isEnabled: inTable,
  run: (editor) => {
    const cell = tableCellContext(editor);
    if (!cell) {
      return;
    }

    replaceTableWithParagraph(editor, cell.tablePath);
  },
};

export const toggleTableHeaderRow: EditorCommand = {
  id: "block.table.header-row",
  label: "Header row",
  group: "format",
  isEnabled: inTable,
  run: (editor) => {
    const cell = tableCellContext(editor);
    const table = cell ? editor.api.node(cell.tablePath)?.[0] : undefined;
    if (!cell || !ElementApi.isElement(table)) {
      return;
    }

    setFirstAxisType(editor, "row", !rowIsHeader(table));
  },
};

export const toggleTableHeaderColumn: EditorCommand = {
  id: "block.table.header-column",
  label: "Header column",
  group: "format",
  isEnabled: inTable,
  run: (editor) => {
    const cell = tableCellContext(editor);
    const table = cell ? editor.api.node(cell.tablePath)?.[0] : undefined;
    if (!cell || !ElementApi.isElement(table)) {
      return;
    }

    setFirstAxisType(editor, "column", !columnIsHeader(table));
  },
};

export const mergeTableCells: EditorCommand = {
  id: "block.table.merge",
  label: "Merge cells",
  group: "insert",
  disabledReason: mergeCellsReason,
  isEnabled: (editor) => !editorIsReadOnly(editor) && mergeCellsReason(editor) === undefined,
  run: (editor) => {
    editor.tf.withoutNormalizing(() => {
      mergePlateTableCells(editor);
    });
  },
};

export const splitTableCell: EditorCommand = {
  id: "block.table.split",
  label: "Split cell",
  group: "insert",
  disabledReason: splitCellReason,
  isEnabled: (editor) => !editorIsReadOnly(editor) && splitCellReason(editor) === undefined,
  run: (editor) => {
    const cell = tableCellContext(editor);
    if (!cell) {
      return;
    }

    editor.tf.withoutNormalizing(() => {
      collapseToCell(editor, cell.cellPath);
      splitPlateTableCell(editor);
    });
  },
};

export const duplicateTableRow: EditorCommand = {
  id: "block.table.duplicate-row",
  label: "Duplicate row",
  group: "insert",
  disabledReason: duplicateRowReason,
  isEnabled: (editor) => commandEnabled(editor, duplicateRowReason),
  run: (editor) => {
    const current = currentTable(editor);
    if (!current || duplicateRowReason(editor) !== undefined) {
      return;
    }

    const row = editor.api.node(current.cell.tablePath.concat(current.cell.rowIndex))?.[0];
    if (!ElementApi.isElement(row)) {
      return;
    }

    editor.tf.insertNodes(cloneWithNewIds(row), {
      at: current.cell.tablePath.concat(current.cell.rowIndex + 1),
    });
  },
};

export const duplicateTableColumn: EditorCommand = {
  id: "block.table.duplicate-column",
  label: "Duplicate column",
  group: "insert",
  disabledReason: duplicateColumnReason,
  isEnabled: (editor) => commandEnabled(editor, duplicateColumnReason),
  run: (editor) => {
    const current = currentTable(editor);
    if (!current || duplicateColumnReason(editor) !== undefined) {
      return;
    }

    const coverage = tableCoverage(nodeRecord(current.node), tableMaxColumns());
    const widths = columnWidths(current.node);
    editor.tf.withoutNormalizing(() => {
      for (let rowIndex = coverage.rowCount - 1; rowIndex >= 0; rowIndex -= 1) {
        const anchor = coverage.cells.find(
          (cell) => cell.row === rowIndex && cell.column === current.cell.columnIndex,
        );
        const row = editor.api.node(current.cell.tablePath.concat(rowIndex))?.[0];
        const source =
          anchor && ElementApi.isElement(row) ? row.children[anchor.cellIndex] : undefined;
        if (!anchor || !ElementApi.isElement(source)) {
          continue;
        }

        editor.tf.insertNodes(cloneWithNewIds(source), {
          at: current.cell.tablePath.concat(rowIndex, anchor.cellIndex + 1),
        });
      }

      if (widths !== undefined) {
        const next = [...widths];
        next.splice(current.cell.columnIndex + 1, 0, widths[current.cell.columnIndex] ?? null);
        editor.tf.setNodes({ colSizes: next }, { at: current.cell.tablePath });
      }
    });
  },
};

function moveRow(editor: SlateEditor, direction: "up" | "down"): void {
  const current = currentTable(editor);
  if (!current || moveRowReason(editor, direction) !== undefined) {
    return;
  }

  const index = current.cell.rowIndex;
  const row = editor.api.node(current.cell.tablePath.concat(index))?.[0];
  if (!ElementApi.isElement(row)) {
    return;
  }

  const destination = direction === "down" ? index + 1 : index - 1;
  editor.tf.withoutNormalizing(() => {
    editor.tf.removeNodes({ at: current.cell.tablePath.concat(index) });
    editor.tf.insertNodes(row, { at: current.cell.tablePath.concat(destination) });
  });
  const start = editor.api.start(current.cell.tablePath.concat(destination, 0));
  if (start) {
    editor.tf.select(start);
  }
}

function swapColumnCells(editor: SlateEditor, tablePath: number[], from: number, to: number): void {
  const table = editor.api.node(tablePath)?.[0];
  if (!ElementApi.isElement(table)) {
    return;
  }

  const coverage = tableCoverage(nodeRecord(table), tableMaxColumns());
  const widths = columnWidths(table);
  editor.tf.withoutNormalizing(() => {
    for (let rowIndex = 0; rowIndex < coverage.rowCount; rowIndex += 1) {
      const fromCell = coverage.cells.find((cell) => cell.row === rowIndex && cell.column === from);
      const toCell = coverage.cells.find((cell) => cell.row === rowIndex && cell.column === to);
      if (!fromCell || !toCell || fromCell.cellIndex === toCell.cellIndex) {
        continue;
      }

      const rowPath = tablePath.concat(rowIndex);
      const row = editor.api.node(rowPath)?.[0];
      if (!ElementApi.isElement(row)) {
        continue;
      }

      const upper = Math.max(fromCell.cellIndex, toCell.cellIndex);
      const lower = Math.min(fromCell.cellIndex, toCell.cellIndex);
      const moving = row.children[upper];
      if (!ElementApi.isElement(moving)) {
        continue;
      }

      editor.tf.removeNodes({ at: rowPath.concat(upper) });
      editor.tf.insertNodes(moving, { at: rowPath.concat(lower) });
    }

    if (widths !== undefined && from < widths.length && to < widths.length) {
      const next = [...widths];
      const fromWidth = next[from];
      next[from] = next[to] ?? null;
      next[to] = fromWidth ?? null;
      editor.tf.setNodes({ colSizes: next }, { at: tablePath });
    }
  });
}

export const moveTableRowUp: EditorCommand = {
  id: "block.table.move-row-up",
  label: "Move row up",
  group: "insert",
  disabledReason: (editor) => moveRowReason(editor, "up"),
  isEnabled: (editor) => commandEnabled(editor, (current) => moveRowReason(current, "up")),
  run: (editor) => {
    moveRow(editor, "up");
  },
};

export const moveTableRowDown: EditorCommand = {
  id: "block.table.move-row-down",
  label: "Move row down",
  group: "insert",
  disabledReason: (editor) => moveRowReason(editor, "down"),
  isEnabled: (editor) => commandEnabled(editor, (current) => moveRowReason(current, "down")),
  run: (editor) => {
    moveRow(editor, "down");
  },
};

export const moveTableColumnLeft: EditorCommand = {
  id: "block.table.move-column-left",
  label: "Move column left",
  group: "insert",
  disabledReason: (editor) => moveColumnReason(editor, "left"),
  isEnabled: (editor) => commandEnabled(editor, (current) => moveColumnReason(current, "left")),
  run: (editor) => {
    const current = currentTable(editor);
    if (!current || moveColumnReason(editor, "left") !== undefined) {
      return;
    }

    swapColumnCells(
      editor,
      current.cell.tablePath,
      current.cell.columnIndex,
      current.cell.columnIndex - 1,
    );
  },
};

export const moveTableColumnRight: EditorCommand = {
  id: "block.table.move-column-right",
  label: "Move column right",
  group: "insert",
  disabledReason: (editor) => moveColumnReason(editor, "right"),
  isEnabled: (editor) => commandEnabled(editor, (current) => moveColumnReason(current, "right")),
  run: (editor) => {
    const current = currentTable(editor);
    if (!current || moveColumnReason(editor, "right") !== undefined) {
      return;
    }

    swapColumnCells(
      editor,
      current.cell.tablePath,
      current.cell.columnIndex,
      current.cell.columnIndex + 1,
    );
  },
};

export const setTableColumnWidth: EditorCommand<{
  tablePath: number[];
  column: number;
  width: number | null;
}> = {
  id: "block.table.column-width",
  label: "Column width",
  group: "format",
  isEnabled: (editor) => !editorIsReadOnly(editor),
  run: (editor, payload) => {
    const node = editor.api.node(payload.tablePath)?.[0];
    if (!ElementApi.isElement(node) || node.type !== KEYS.table) {
      return;
    }

    const coverage = tableCoverage(nodeRecord(node), tableMaxColumns());
    if (payload.column < 0 || payload.column >= coverage.columnCount) {
      return;
    }

    const widths = columnWidths(node) ?? Array.from({ length: coverage.columnCount }, () => null);
    const next = Array.from({ length: coverage.columnCount }, (_, index) => widths[index] ?? null);
    next[payload.column] =
      payload.width === null
        ? null
        : Math.min(
            TABLE_MAX_COLUMN_WIDTH,
            Math.max(TABLE_MIN_COLUMN_WIDTH, Math.round(payload.width)),
          );
    if (next.every((width) => width === null)) {
      editor.tf.unsetNodes("colSizes", { at: payload.tablePath });
      return;
    }

    editor.tf.setNodes({ colSizes: next }, { at: payload.tablePath });
  },
};
