import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { ElementApi, KEYS, type TElement } from "platejs";
import {
  PlateElement,
  useEditorRef,
  useElement,
  useReadOnly,
  type PlateElementProps,
} from "platejs/react";
import { useIsCellSelected, useSelectedCells } from "@platejs/table/react";

import { Table, TableBody, TableCell, TableHead, TableRow } from "@/components/table";
import { cn } from "@/lib/utils";

import { runEditorCommand } from "../../lib/commands/editor-commands";
import { setTableColumnWidth } from "../../lib/commands/editor-table-commands";
import {
  tableCoverage,
  TABLE_MAX_COLUMN_WIDTH,
  TABLE_MIN_COLUMN_WIDTH,
} from "../../lib/features/editor-table-grid";
import { TableControls } from "../ui/table-controls";

// The slate table node stays a PlateElement div. Table renders the real table
// plus its scroll container, so the node attributes cannot sit on the table.
// Cell borders are the editor grid. TableHead has no background of its own.
const CELL_BORDER_CLASS = "min-w-12 border border-[var(--editor-table-border)]";

const SELECTED_CLASS = "editor-table-cell-selected bg-[var(--editor-table-selected)]";

type TableResizeContextValue = {
  readOnly: boolean;
  startWidth: (column: number) => number;
  commitWidth: (column: number, width: number | null) => void;
  setPreview: Dispatch<SetStateAction<ReadonlyMap<number, number>>>;
};

const TableResizeContext = createContext<TableResizeContextValue | null>(null);

const FALLBACK_COLUMN_WIDTH = 160;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nodeRecord(node: TElement): Record<string, unknown> {
  const record: Record<string, unknown> = {};
  for (const key of Object.keys(node)) {
    record[key] = node[key];
  }

  return record;
}

function storedWidths(node: TElement, columnCount: number): (number | null)[] {
  const raw = node.colSizes;
  const source = Array.isArray(raw) ? raw : [];
  return Array.from({ length: columnCount }, (_, index) => {
    const value = source[index];
    return typeof value === "number" ? value : null;
  });
}

function spanAttribute(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 1 ? value : undefined;
}

function clampWidth(width: number): number {
  return Math.min(TABLE_MAX_COLUMN_WIDTH, Math.max(TABLE_MIN_COLUMN_WIDTH, Math.round(width)));
}

function columnRightEdges(table: HTMLTableElement): number[] {
  const rows = Array.from(table.rows);
  const coverage: (HTMLTableCellElement | undefined)[][] = [];
  for (const row of rows) {
    const line: (HTMLTableCellElement | undefined)[] = [];
    coverage.push(line);
    let column = 0;
    for (const cell of Array.from(row.cells)) {
      while (line[column]) {
        column += 1;
      }

      const colSpan = cell.colSpan || 1;
      const rowSpan = cell.rowSpan || 1;
      for (let rowOffset = 0; rowOffset < rowSpan; rowOffset += 1) {
        const target = coverage[coverage.length - 1 + rowOffset] ?? [];
        coverage[coverage.length - 1 + rowOffset] = target;
        for (let columnOffset = 0; columnOffset < colSpan; columnOffset += 1) {
          target[column + columnOffset] = cell;
        }
      }
      column += colSpan;
    }
  }

  const columnCount = coverage.reduce((count, line) => Math.max(count, line.length), 0);
  const origin = table.getBoundingClientRect().left;
  const edges: number[] = [];
  for (let column = 0; column < columnCount; column += 1) {
    let edge = 0;
    for (const line of coverage) {
      const cell = line[column];
      if (!cell || (column > 0 && line[column - 1] === cell)) {
        continue;
      }

      if ((cell.colSpan || 1) !== 1) {
        continue;
      }

      edge = cell.getBoundingClientRect().right - origin;
      break;
    }
    edges.push(edge);
  }

  return edges;
}

export function TableElement(props: PlateElementProps) {
  const editor = useEditorRef();
  const element = useElement();
  const readOnly = useReadOnly();
  const path = editor.api.findPath(element);
  const tableRef = useRef<HTMLTableElement>(null);
  const coverage = tableCoverage(nodeRecord(element));
  const widths = storedWidths(element, coverage.columnCount);
  const [preview, setPreview] = useState<ReadonlyMap<number, number>>(() => new Map());
  const [edges, setEdges] = useState<number[]>([]);
  useSelectedCells();

  useLayoutEffect(() => {
    const table = tableRef.current;
    if (!table) {
      return;
    }

    setEdges(columnRightEdges(table));
  }, [element, preview, readOnly]);

  const displayed = widths.map((width, index) => preview.get(index) ?? width);
  const explicit = displayed.every((width) => typeof width === "number");
  const tableWidth = explicit
    ? displayed.reduce<number>((sum, width) => sum + (width ?? 0), 0)
    : undefined;

  function commitWidth(column: number, width: number | null): void {
    if (path === undefined) {
      return;
    }

    runEditorCommand(editor, setTableColumnWidth, { tablePath: path, column, width });
  }

  function startWidth(column: number): number {
    const node = path === undefined ? undefined : editor.api.node(path)?.[0];
    const raw = isRecord(node) && Array.isArray(node.colSizes) ? node.colSizes[column] : undefined;
    if (typeof raw === "number" && Number.isFinite(raw)) {
      return raw;
    }

    const previous = column === 0 ? 0 : edges[column - 1];
    const edge = edges[column];
    if (previous !== undefined && edge !== undefined && edge > previous) {
      return edge - previous;
    }

    return FALLBACK_COLUMN_WIDTH;
  }

  return (
    <PlateElement {...props} className="group relative my-2 max-w-full">
      {readOnly || path === undefined ? null : <TableControls element={element} />}
      <TableResizeContext.Provider value={{ readOnly, startWidth, commitWidth, setPreview }}>
        <Table
          ref={tableRef}
          className="border-collapse"
          style={tableWidth === undefined ? undefined : { width: tableWidth }}
        >
          <colgroup>
            {displayed.map((width, index) => (
              <col key={index} style={typeof width === "number" ? { width } : undefined} />
            ))}
          </colgroup>
          <TableBody>{props.children}</TableBody>
        </Table>
      </TableResizeContext.Provider>
    </PlateElement>
  );
}

function columnInFirstRow(
  editor: ReturnType<typeof useEditorRef>,
  element: TElement,
): number | undefined {
  const path = editor.api.findPath(element);
  if (!path || path.length < 3) {
    return undefined;
  }

  const rowIndex = path[path.length - 2];
  const cellIndex = path[path.length - 1];
  if (rowIndex !== 0 || typeof cellIndex !== "number") {
    return undefined;
  }

  const rowEntry = editor.api.node(path.slice(0, -1));
  if (rowEntry === undefined || !ElementApi.isElement(rowEntry[0])) {
    return undefined;
  }

  const ownSpan = spanAttribute(element.colSpan) ?? 1;
  if (ownSpan !== 1) {
    return undefined;
  }

  let column = 0;
  for (let index = 0; index < cellIndex; index += 1) {
    const child = rowEntry[0].children[index];
    const span =
      typeof child === "object" &&
      child !== null &&
      "colSpan" in child &&
      typeof child.colSpan === "number"
        ? child.colSpan
        : 1;
    column += span > 1 ? span : 1;
  }

  return column;
}

function ColumnResizeHandle({ column }: { column: number }) {
  const resize = useContext(TableResizeContext);
  if (!resize || resize.readOnly) {
    return null;
  }

  const current = resize.startWidth(column);
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-valuemin={TABLE_MIN_COLUMN_WIDTH}
      aria-valuemax={TABLE_MAX_COLUMN_WIDTH}
      aria-valuenow={current}
      aria-label={`Resize column ${column + 1}`}
      tabIndex={0}
      contentEditable={false}
      data-column={column}
      className="absolute inset-y-0 right-0 z-10 w-2 translate-x-1/2 cursor-col-resize"
      onPointerDown={(event) => {
        if (event.button !== 0) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        const handle = event.currentTarget;
        const originX = event.clientX;
        const initial = resize.startWidth(column);
        let latest = initial;
        const move = (pointer: PointerEvent): void => {
          latest = clampWidth(initial + pointer.clientX - originX);
          resize.setPreview((currentPreview) => {
            const next = new Map(currentPreview);
            next.set(column, latest);
            return next;
          });
        };
        const stop = (): void => {
          handle.removeEventListener("pointermove", move);
          handle.removeEventListener("pointerup", stop);
          handle.removeEventListener("pointercancel", stop);
          resize.setPreview((currentPreview) => {
            const next = new Map(currentPreview);
            next.delete(column);
            return next;
          });
          if (latest !== initial) {
            resize.commitWidth(column, latest);
          }
        };
        handle.addEventListener("pointermove", move);
        handle.addEventListener("pointerup", stop);
        handle.addEventListener("pointercancel", stop);
        if (event.isTrusted) {
          handle.setPointerCapture(event.pointerId);
        }
      }}
      onDoubleClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        resize.commitWidth(column, null);
      }}
      onKeyDown={(event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        const delta = event.key === "ArrowRight" ? 8 : -8;
        resize.commitWidth(column, clampWidth(resize.startWidth(column) + delta));
      }}
    />
  );
}

export function TableRowElement({ attributes, children }: PlateElementProps) {
  const { className, ...slateProps } = attributes;
  return (
    <TableRow {...slateProps} className={className}>
      {children}
    </TableRow>
  );
}

export function TableCellElement(props: PlateElementProps) {
  const editor = useEditorRef();
  const readOnly = useReadOnly();
  const selected = useIsCellSelected(props.element);
  const header = props.element.type === KEYS.th;
  const colSpan = spanAttribute(props.element.colSpan);
  const rowSpan = spanAttribute(props.element.rowSpan);
  const column = readOnly ? undefined : columnInFirstRow(editor, props.element);
  const { className, ...slateProps } = props.attributes;
  const cellClass = cn(
    className,
    CELL_BORDER_CLASS,
    selected && SELECTED_CLASS,
    column !== undefined && "relative",
  );
  const handle = column === undefined ? null : <ColumnResizeHandle column={column} />;

  if (header) {
    return (
      <TableHead {...slateProps} colSpan={colSpan} rowSpan={rowSpan} className={cellClass}>
        {props.children}
        {handle}
      </TableHead>
    );
  }

  return (
    <TableCell {...slateProps} colSpan={colSpan} rowSpan={rowSpan} className={cellClass}>
      {props.children}
      {handle}
    </TableCell>
  );
}
