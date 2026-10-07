import { formatBlockLabel } from "./editor-document";

// One grid check for the validator, the normalizer, and paste.
// Plate stores colSpan and rowSpan on the cell (constants-6xljcM3U.js getColSpan
// line 44, getRowSpan line 53). Absence means 1. 1 is never stored.
// colSizes is one entry per grid column. null means that column is automatic.
// 0 is not automatic: Plate uses 0 as an unset fill, and this schema rejects it.

export const TABLE_MIN_COLUMN_WIDTH = 48;
export const TABLE_MAX_COLUMN_WIDTH = 1200;

export type TableGridIssue = {
  path: number[];
  message: string;
};

export type TableGridLimits = {
  maxRows: number;
  maxColumns: number;
};

export type TableGridResult = {
  issues: TableGridIssue[];
  repairs: TableGridIssue[];
  next?: Record<string, unknown>;
};

export type CoveredCell = {
  rowIndex: number;
  cellIndex: number;
  row: number;
  column: number;
  rowSpan: number;
  colSpan: number;
};

type RowCells = {
  row: Record<string, unknown>;
  cells: Record<string, unknown>[];
};

type PlacedCell = {
  node: Record<string, unknown>;
  row: number;
  column: number;
  rowSpan: number;
  colSpan: number;
  requestedRowSpan: number;
  requestedColSpan: number;
};

type SpanRead = {
  span: number;
  storedOne: boolean;
  invalid: boolean;
};

const DEFAULT_LIMITS: TableGridLimits = { maxRows: 50, maxColumns: 20 };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isElement(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && typeof value.type === "string" && Array.isArray(value.children);
}

function elementChildren(node: Record<string, unknown>): Record<string, unknown>[] {
  if (!Array.isArray(node.children)) {
    return [];
  }

  return node.children.filter(isElement);
}

function readSpan(cell: Record<string, unknown>, key: "colSpan" | "rowSpan"): SpanRead {
  if (!(key in cell)) {
    return { span: 1, storedOne: false, invalid: false };
  }

  const value = cell[key];
  if (value === 1) {
    return { span: 1, storedOne: true, invalid: false };
  }

  if (typeof value === "number" && Number.isInteger(value) && value >= 2) {
    return { span: value, storedOne: false, invalid: false };
  }

  return { span: 1, storedOne: false, invalid: true };
}

function attributeSpan(
  cell: Record<string, unknown>,
  name: "colspan" | "rowspan",
): number | undefined {
  const attributes = cell.attributes;
  if (!isRecord(attributes) || !(name in attributes)) {
    return undefined;
  }

  const value = attributes[name];
  if (typeof value === "number" && Number.isInteger(value) && value > 1) {
    return value;
  }

  if (typeof value === "string" && /^[0-9]+$/.test(value)) {
    const parsed = Number(value);
    if (parsed > 1) {
      return parsed;
    }
  }

  return undefined;
}

function requestedSpans(cell: Record<string, unknown>): {
  colSpan: number;
  rowSpan: number;
  col: SpanRead;
  row: SpanRead;
} {
  const col = readSpan(cell, "colSpan");
  const row = readSpan(cell, "rowSpan");
  const attributeCol =
    col.span === 1 && !col.storedOne ? attributeSpan(cell, "colspan") : undefined;
  const attributeRow =
    row.span === 1 && !row.storedOne ? attributeSpan(cell, "rowspan") : undefined;

  return {
    colSpan: attributeCol ?? col.span,
    rowSpan: attributeRow ?? row.span,
    col,
    row,
  };
}

function tableRows(
  node: Record<string, unknown>,
  maxRows: number,
): { rows: RowCells[]; trimmed: boolean } {
  const rows = elementChildren(node)
    .filter((child) => child.type === "tr")
    .slice(0, maxRows)
    .map((row) => ({
      row,
      cells: elementChildren(row).filter((cell) => cell.type === "td" || cell.type === "th"),
    }));

  const trimmed = elementChildren(node).filter((child) => child.type === "tr").length > rows.length;
  return { rows, trimmed };
}

function columnCountOf(rows: readonly RowCells[], maxColumns: number): number {
  let count = 1;
  for (const row of rows) {
    let sum = 0;
    for (const cell of row.cells) {
      sum += requestedSpans(cell).colSpan;
    }

    if (sum > count) {
      count = sum;
    }
  }

  return Math.min(maxColumns, Math.max(1, count));
}

function cellNode(
  cell: Record<string, unknown>,
  colSpan: number,
  rowSpan: number,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...cell, children: cell.children };
  delete next.colSpan;
  delete next.rowSpan;
  delete next.attributes;
  if (colSpan > 1) {
    next.colSpan = colSpan;
  }

  if (rowSpan > 1) {
    next.rowSpan = rowSpan;
  }

  return next;
}

function emptyCell(header: boolean): Record<string, unknown> {
  return {
    type: header ? "th" : "td",
    children: [{ type: "p", children: [{ text: "" }] }],
  };
}

function rowIsHeader(cells: readonly Record<string, unknown>[]): boolean {
  return cells.length > 0 && cells.every((cell) => cell.type === "th");
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

type WidthRepair = {
  issues: TableGridIssue[];
  repairs: TableGridIssue[];
  value: (number | null)[] | undefined;
  changed: boolean;
};

function repairWidths(raw: unknown, columnCount: number, path: number[]): WidthRepair {
  const issues: TableGridIssue[] = [];
  const repairs: TableGridIssue[] = [];
  if (raw === undefined) {
    return { issues, repairs, value: undefined, changed: false };
  }

  if (!Array.isArray(raw)) {
    issues.push({
      path,
      message: `${formatBlockLabel(path)} has an unsupported colSizes. Column widths were removed.`,
    });
    repairs.push({
      path,
      message: `${formatBlockLabel(path)} column widths were removed because none were valid.`,
    });
    return { issues, repairs, value: undefined, changed: true };
  }

  const cleaned: (number | null)[] = [];
  let anyExplicit = false;
  for (const entry of raw) {
    if (entry === null) {
      cleaned.push(null);
      continue;
    }

    if (typeof entry !== "number" || !Number.isFinite(entry)) {
      issues.push({
        path,
        message: `${formatBlockLabel(path)} has a colSizes entry that is not a finite number.`,
      });
      repairs.push({
        path,
        message: `${formatBlockLabel(path)} dropped a column width that was not a finite number. That column stays automatic.`,
      });
      cleaned.push(null);
      continue;
    }

    if (!Number.isInteger(entry)) {
      const rounded = Math.min(
        TABLE_MAX_COLUMN_WIDTH,
        Math.max(TABLE_MIN_COLUMN_WIDTH, Math.round(entry)),
      );
      issues.push({
        path,
        message: `${formatBlockLabel(path)} has a non-integer colSizes entry.`,
      });
      repairs.push({
        path,
        message: `${formatBlockLabel(path)} rounded a non-integer column width to ${rounded}px.`,
      });
      cleaned.push(rounded);
      anyExplicit = true;
      continue;
    }

    if (entry < TABLE_MIN_COLUMN_WIDTH || entry > TABLE_MAX_COLUMN_WIDTH) {
      const clamped = Math.min(TABLE_MAX_COLUMN_WIDTH, Math.max(TABLE_MIN_COLUMN_WIDTH, entry));
      const detail = entry === 0 ? "0" : entry < 0 ? "a negative width" : "a width above 1200";
      issues.push({
        path,
        message: `${formatBlockLabel(path)} has colSizes ${detail}.`,
      });
      repairs.push({
        path,
        message: `${formatBlockLabel(path)} clamped a column width of ${entry}px to ${clamped}px.`,
      });
      cleaned.push(clamped);
      anyExplicit = true;
      continue;
    }

    cleaned.push(entry);
    anyExplicit = true;
  }

  if (!anyExplicit) {
    issues.push({
      path,
      message: `${formatBlockLabel(path)} has colSizes with no explicit column width.`,
    });
    repairs.push({
      path,
      message: `${formatBlockLabel(path)} column widths were removed because none were valid.`,
    });
    return { issues, repairs, value: undefined, changed: true };
  }

  if (cleaned.length > columnCount) {
    issues.push({
      path,
      message: `${formatBlockLabel(path)} has colSizes length ${cleaned.length}. The table has ${columnCount} columns.`,
    });
    repairs.push({
      path,
      message: `${formatBlockLabel(path)} truncated column widths to ${columnCount} columns.`,
    });
    cleaned.length = columnCount;
  } else if (cleaned.length < columnCount) {
    issues.push({
      path,
      message: `${formatBlockLabel(path)} has colSizes length ${cleaned.length}. The table has ${columnCount} columns.`,
    });
    repairs.push({
      path,
      message: `${formatBlockLabel(path)} padded column widths to ${columnCount} columns. Added columns stay automatic.`,
    });
    while (cleaned.length < columnCount) {
      cleaned.push(null);
    }
  }

  return {
    issues,
    repairs,
    value: cleaned,
    changed: !sameJson(raw, cleaned),
  };
}

function occupied(
  grid: (PlacedCell | undefined)[][],
  row: number,
  column: number,
  rowSpan: number,
  colSpan: number,
  ignore?: PlacedCell,
): boolean {
  for (let rowOffset = 0; rowOffset < rowSpan; rowOffset += 1) {
    for (let columnOffset = 0; columnOffset < colSpan; columnOffset += 1) {
      const cell = grid[row + rowOffset]?.[column + columnOffset];
      if (cell && cell !== ignore) {
        return true;
      }
    }
  }

  return false;
}

function mark(grid: (PlacedCell | undefined)[][], cell: PlacedCell): void {
  for (let rowOffset = 0; rowOffset < cell.rowSpan; rowOffset += 1) {
    for (let columnOffset = 0; columnOffset < cell.colSpan; columnOffset += 1) {
      const row = grid[cell.row + rowOffset];
      if (row) {
        row[cell.column + columnOffset] = cell;
      }
    }
  }
}

function rebuild(grid: (PlacedCell | undefined)[][], placed: readonly PlacedCell[]): void {
  for (const row of grid) {
    row.fill(undefined);
  }

  for (const cell of placed) {
    mark(grid, cell);
  }
}

function freeSlots(grid: (PlacedCell | undefined)[][], row: number, columnCount: number): number {
  let free = 0;
  for (let column = 0; column < columnCount; column += 1) {
    if (!grid[row]?.[column]) {
      free += 1;
    }
  }

  return free;
}

export function checkTableGrid(
  node: Record<string, unknown>,
  path: number[],
  limits: TableGridLimits = DEFAULT_LIMITS,
): TableGridResult {
  const issues: TableGridIssue[] = [];
  const repairs: TableGridIssue[] = [];
  if (node.type !== "table" || !Array.isArray(node.children)) {
    return { issues, repairs };
  }

  const { rows, trimmed } = tableRows(node, limits.maxRows);
  if (rows.length === 0) {
    return { issues, repairs };
  }

  let dirty = trimmed;
  const rowCount = rows.length;
  const columnCount = columnCountOf(rows, limits.maxColumns);
  const grid: (PlacedCell | undefined)[][] = Array.from({ length: rowCount }, () => []);
  const placed: PlacedCell[] = [];

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    if (!row) {
      continue;
    }

    let guard = 0;
    while (
      freeSlots(grid, rowIndex, columnCount) < row.cells.length &&
      guard < columnCount + row.cells.length
    ) {
      guard += 1;
      const blocker = placed.find(
        (cell) => cell.row < rowIndex && rowIndex < cell.row + cell.rowSpan && cell.rowSpan > 1,
      );
      if (!blocker) {
        break;
      }

      blocker.rowSpan = rowIndex - blocker.row;
      dirty = true;
      issues.push({
        path: path.concat(blocker.row),
        message: `${formatBlockLabel(path)} has a cell that overlaps another cell.`,
      });
      repairs.push({
        path: path.concat(blocker.row),
        message: `${formatBlockLabel(path)} shrank an overlapping rowSpan to ${blocker.rowSpan === 1 ? "one row" : `${blocker.rowSpan} rows`}.`,
      });
      rebuild(grid, placed);
    }

    let column = 0;
    for (const cell of row.cells) {
      const requested = requestedSpans(cell);
      const cellPath = path.concat(rowIndex, column);
      if (requested.col.storedOne) {
        dirty = true;
        issues.push({
          path: cellPath,
          message: `${formatBlockLabel(cellPath)} stores colSpan 1. Absence means one column.`,
        });
        repairs.push({
          path: cellPath,
          message: `${formatBlockLabel(cellPath)} removed stored colSpan 1.`,
        });
      }

      if (requested.row.storedOne) {
        dirty = true;
        issues.push({
          path: cellPath,
          message: `${formatBlockLabel(cellPath)} stores rowSpan 1. Absence means one row.`,
        });
        repairs.push({
          path: cellPath,
          message: `${formatBlockLabel(cellPath)} removed stored rowSpan 1.`,
        });
      }

      if (requested.col.invalid) {
        dirty = true;
        issues.push({
          path: cellPath,
          message: `${formatBlockLabel(cellPath)} has an unsupported colSpan.`,
        });
        repairs.push({
          path: cellPath,
          message: `${formatBlockLabel(cellPath)} removed an invalid colSpan.`,
        });
      }

      if (requested.row.invalid) {
        dirty = true;
        issues.push({
          path: cellPath,
          message: `${formatBlockLabel(cellPath)} has an unsupported rowSpan.`,
        });
        repairs.push({
          path: cellPath,
          message: `${formatBlockLabel(cellPath)} removed an invalid rowSpan.`,
        });
      }

      if (
        attributeSpan(cell, "colspan") !== undefined ||
        attributeSpan(cell, "rowspan") !== undefined ||
        isRecord(cell.attributes)
      ) {
        dirty = true;
      }

      while (column < columnCount && grid[rowIndex]?.[column]) {
        column += 1;
      }

      if (column >= columnCount) {
        dirty = true;
        issues.push({
          path: cellPath,
          message: `${formatBlockLabel(path)} has a cell that overlaps another cell.`,
        });
        repairs.push({
          path: cellPath,
          message: `${formatBlockLabel(path)} kept overlapping cell text in the row and dropped the extra grid slot.`,
        });
        const host = placed.find((item) => item.row === rowIndex) ?? placed[placed.length - 1];
        if (host && Array.isArray(host.node.children) && Array.isArray(cell.children)) {
          host.node = {
            ...host.node,
            children: [...host.node.children, ...cell.children],
          };
        }
        continue;
      }

      let colSpan = requested.colSpan;
      let rowSpan = requested.rowSpan;
      if (rowIndex + rowSpan > rowCount) {
        const nextSpan = rowCount - rowIndex;
        issues.push({
          path: cellPath,
          message: `${formatBlockLabel(cellPath)} has rowSpan ${rowSpan}, which extends past the table.`,
        });
        repairs.push({
          path: cellPath,
          message: `${formatBlockLabel(cellPath)} shrank rowSpan from ${rowSpan} to ${nextSpan}.`,
        });
        rowSpan = nextSpan;
        dirty = true;
      }

      if (column + colSpan > columnCount || occupied(grid, rowIndex, column, rowSpan, colSpan)) {
        const original = colSpan;
        while (
          colSpan > 1 &&
          (column + colSpan > columnCount || occupied(grid, rowIndex, column, rowSpan, colSpan))
        ) {
          colSpan -= 1;
        }

        if (column + colSpan > columnCount) {
          colSpan = Math.max(1, columnCount - column);
        }

        while (rowSpan > 1 && occupied(grid, rowIndex, column, rowSpan, colSpan)) {
          rowSpan -= 1;
        }

        if (original !== colSpan || requested.rowSpan !== rowSpan) {
          dirty = true;
          const pastEdge = column + original > columnCount;
          issues.push({
            path: cellPath,
            message: pastEdge
              ? `${formatBlockLabel(cellPath)} has colSpan ${original}, which extends past the table.`
              : `${formatBlockLabel(path)} has a cell that overlaps another cell.`,
          });
          repairs.push({
            path: cellPath,
            message: pastEdge
              ? `${formatBlockLabel(cellPath)} shrank colSpan from ${original} to ${colSpan}.`
              : `${formatBlockLabel(cellPath)} shrank an overlapping span to ${colSpan} by ${rowSpan}.`,
          });
        }
      }

      const placedCell: PlacedCell = {
        node: cell,
        row: rowIndex,
        column,
        rowSpan,
        colSpan,
        requestedRowSpan: requested.rowSpan,
        requestedColSpan: requested.colSpan,
      };
      placed.push(placedCell);
      mark(grid, placedCell);
      column += colSpan;
    }
  }

  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    let missing = false;
    for (let column = 0; column < columnCount; column += 1) {
      if (!grid[rowIndex]?.[column]) {
        missing = true;
        break;
      }
    }

    if (!missing) {
      continue;
    }

    dirty = true;
    repairs.push({
      path: path.concat(rowIndex),
      message: `${formatBlockLabel(path)} filled an empty cell so the row stays rectangular.`,
    });
  }

  const widths = repairWidths(node.colSizes, columnCount, path);
  issues.push(...widths.issues);
  repairs.push(...widths.repairs);
  if (widths.changed) {
    dirty = true;
  }

  if (!dirty) {
    return { issues, repairs };
  }

  const nextRows = rows.map((row, rowIndex) => {
    const header = rowIsHeader(row.cells);
    const children: Record<string, unknown>[] = [];
    let column = 0;
    const starts = placed
      .filter((cell) => cell.row === rowIndex)
      .sort((left, right) => left.column - right.column);
    for (const cell of starts) {
      while (column < cell.column) {
        if (!grid[rowIndex]?.[column]) {
          children.push(emptyCell(header));
        }
        column += 1;
      }

      children.push(cellNode(cell.node, cell.colSpan, cell.rowSpan));
      column = cell.column + cell.colSpan;
    }

    while (column < columnCount) {
      if (!grid[rowIndex]?.[column]) {
        children.push(emptyCell(header));
      }
      column += 1;
    }

    return { ...row.row, children };
  });

  const next: Record<string, unknown> = { ...node, children: nextRows };
  if (widths.value === undefined) {
    delete next.colSizes;
  } else {
    next.colSizes = widths.value;
  }

  return { issues, repairs, next };
}

export function tableCoverage(
  node: Record<string, unknown>,
  maxColumns = DEFAULT_LIMITS.maxColumns,
): {
  rowCount: number;
  columnCount: number;
  cells: CoveredCell[];
} {
  const { rows } = tableRows(node, DEFAULT_LIMITS.maxRows);
  const columnCount = columnCountOf(rows, maxColumns);
  const grid: (CoveredCell | undefined)[][] = Array.from({ length: rows.length }, () => []);
  const cells: CoveredCell[] = [];

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    if (!row) {
      continue;
    }

    let column = 0;
    for (let cellIndex = 0; cellIndex < row.cells.length; cellIndex += 1) {
      const cell = row.cells[cellIndex];
      if (!cell) {
        continue;
      }

      while (column < columnCount && grid[rowIndex]?.[column]) {
        column += 1;
      }

      if (column >= columnCount) {
        break;
      }

      const spans = requestedSpans(cell);
      const covered: CoveredCell = {
        rowIndex,
        cellIndex,
        row: rowIndex,
        column,
        rowSpan: Math.min(spans.rowSpan, rows.length - rowIndex),
        colSpan: Math.min(spans.colSpan, columnCount - column),
      };
      cells.push(covered);
      for (let rowOffset = 0; rowOffset < covered.rowSpan; rowOffset += 1) {
        for (let columnOffset = 0; columnOffset < covered.colSpan; columnOffset += 1) {
          const line = grid[rowIndex + rowOffset];
          if (line) {
            line[column + columnOffset] = covered;
          }
        }
      }
      column += covered.colSpan;
    }
  }

  return { rowCount: rows.length, columnCount, cells };
}

export function rowSliceIsClean(node: Record<string, unknown>, row: number): boolean {
  const coverage = tableCoverage(node);
  return coverage.cells.every(
    (cell) =>
      cell.row + cell.rowSpan - 1 < row ||
      cell.row > row ||
      (cell.row === row && cell.rowSpan === 1),
  );
}

export function columnSliceIsClean(node: Record<string, unknown>, column: number): boolean {
  const coverage = tableCoverage(node);
  return coverage.cells.every(
    (cell) =>
      cell.column + cell.colSpan - 1 < column ||
      cell.column > column ||
      (cell.column === column && cell.colSpan === 1),
  );
}

export function boundaryIsClean(
  node: Record<string, unknown>,
  axis: "row" | "column",
  index: number,
  neighbor: number,
): boolean {
  const coverage = tableCoverage(node);
  return coverage.cells.every((cell) => {
    const start = axis === "row" ? cell.row : cell.column;
    const end = axis === "row" ? cell.row + cell.rowSpan - 1 : cell.column + cell.colSpan - 1;
    const coversIndex = start <= index && index <= end;
    const coversNeighbor = start <= neighbor && neighbor <= end;
    return !(coversIndex && coversNeighbor);
  });
}
