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
  useEditorSelector,
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
// Each grid line is drawn once: the first row and column add the outer top and
// left, and every cell draws its right and bottom edge. TableHead has no background.
const CELL_BORDER_CLASS = "min-w-12 border-r border-b border-border";

type CellGridEdge = { row: number; column: number };

type SelectionBox = { left: number; top: number; width: number; height: number };

type TableResizeContextValue = {
  readOnly: boolean;
  startWidth: (column: number) => number;
  commitWidth: (column: number, width: number | null) => void;
  setPreview: Dispatch<SetStateAction<ReadonlyMap<number, number>>>;
  gridEdges: ReadonlyMap<string, CellGridEdge>;
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

function columnPixelWidths(table: HTMLTableElement): number[] {
  const edges = columnRightEdges(table);
  return edges.map((edge, index) => {
    const previous = index === 0 ? 0 : (edges[index - 1] ?? 0);
    return edge > previous ? edge - previous : 0;
  });
}

function cellGridEdges(element: TElement): ReadonlyMap<string, CellGridEdge> {
  const map = new Map<string, CellGridEdge>();
  for (const covered of tableCoverage(nodeRecord(element)).cells) {
    const rowNode = element.children[covered.rowIndex];
    if (!ElementApi.isElement(rowNode)) {
      continue;
    }

    const cellNode = rowNode.children[covered.cellIndex];
    if (!ElementApi.isElement(cellNode) || typeof cellNode.id !== "string") {
      continue;
    }

    map.set(cellNode.id, { row: covered.row, column: covered.column });
  }

  return map;
}

function sameBox(current: SelectionBox | null, next: SelectionBox | null): boolean {
  if (current === next) {
    return true;
  }
  if (!current || !next) {
    return false;
  }

  return (
    current.left === next.left &&
    current.top === next.top &&
    current.width === next.width &&
    current.height === next.height
  );
}

function borderWidth(element: Element, side: "top" | "right" | "bottom" | "left"): number {
  const parsed = Number.parseFloat(
    getComputedStyle(element).getPropertyValue(`border-${side}-width`),
  );
  return Number.isFinite(parsed) ? parsed : 0;
}

// A cell draws its own right and bottom line. The left and top lines belong to
// the neighbour, unless this cell is in the first column or first row.
function outsideGridLine(cell: HTMLElement, edge: "left" | "top"): number {
  if (borderWidth(cell, edge) > 0) {
    return 0;
  }

  const rect = cell.getBoundingClientRect();
  const table = cell.closest("table");
  if (!table) {
    return 0;
  }

  const neighborSide = edge === "left" ? "right" : "bottom";
  for (const other of table.querySelectorAll<HTMLElement>("td, th")) {
    if (other === cell) {
      continue;
    }

    const otherRect = other.getBoundingClientRect();
    const touches =
      edge === "left"
        ? Math.abs(otherRect.right - rect.left) <= 0.6 &&
          otherRect.bottom > rect.top + 0.5 &&
          otherRect.top < rect.bottom - 0.5
        : Math.abs(otherRect.bottom - rect.top) <= 0.6 &&
          otherRect.right > rect.left + 0.5 &&
          otherRect.left < rect.right - 0.5;
    if (touches) {
      return borderWidth(other, neighborSide);
    }
  }

  return 0;
}

function selectionBox(plate: HTMLElement): SelectionBox | null {
  const cells = plate.querySelectorAll<HTMLElement>("[data-cell-selected='true']");
  if (cells.length === 0) {
    return null;
  }

  const plateRect = plate.getBoundingClientRect();
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  for (const cell of cells) {
    const rect = cell.getBoundingClientRect();
    left = Math.min(left, rect.left);
    top = Math.min(top, rect.top);
    right = Math.max(right, rect.right);
    bottom = Math.max(bottom, rect.bottom);
  }

  let extraLeft = 0;
  let extraTop = 0;
  for (const cell of cells) {
    const rect = cell.getBoundingClientRect();
    if (Math.abs(rect.left - left) <= 0.6) {
      extraLeft = Math.max(extraLeft, outsideGridLine(cell, "left"));
    }
    if (Math.abs(rect.top - top) <= 0.6) {
      extraTop = Math.max(extraTop, outsideGridLine(cell, "top"));
    }
  }
  left -= extraLeft;
  top -= extraTop;

  const scroller = plate.querySelector("[data-slot='table-container']");
  if (scroller instanceof HTMLElement) {
    const view = scroller.getBoundingClientRect();
    left = Math.max(left, view.left);
    top = Math.max(top, view.top);
    right = Math.min(right, view.left + scroller.clientWidth);
    bottom = Math.min(bottom, view.top + scroller.clientHeight);
  }

  const width = right - left;
  const height = bottom - top;
  if (!(width > 0) || !(height > 0)) {
    return null;
  }

  return { left: left - plateRect.left, top: top - plateRect.top, width, height };
}

function TableSelectionFrame({ watch, multi }: { watch: unknown; multi: boolean }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<SelectionBox | null>(null);
  const selectionKey = useEditorSelector((instance) => {
    const range = instance.selection;
    if (!range) {
      return "";
    }

    return `${range.anchor.path.join(".")}:${range.anchor.offset}-${range.focus.path.join(".")}:${range.focus.offset}`;
  }, []);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    const plate = frame?.parentElement;
    if (!frame || !plate) {
      return;
    }

    const place = (): void => {
      const next = selectionBox(plate);
      setBox((current) => (sameBox(current, next) ? current : next));
    };
    place();

    const scroller = plate.querySelector("[data-slot='table-container']");
    const table = plate.querySelector("table");
    const Observer = globalThis.ResizeObserver;
    const observer = typeof Observer === "function" ? new Observer(place) : undefined;
    if (observer) {
      if (table) {
        observer.observe(table);
      }
      if (scroller instanceof HTMLElement) {
        observer.observe(scroller);
      }
    }
    scroller?.addEventListener("scroll", place, { passive: true });
    window.addEventListener("resize", place);

    return () => {
      observer?.disconnect();
      scroller?.removeEventListener("scroll", place);
      window.removeEventListener("resize", place);
    };
  }, [selectionKey, watch]);

  return (
    <div
      ref={frameRef}
      contentEditable={false}
      data-table-selection={multi ? "range" : "cell"}
      aria-hidden="true"
      hidden={box === null}
      // The box already covers the 1px grid line. A 1px border sits on that line,
      // with the same outer halo as a focused input. A range keeps the 2px stroke.
      className={cn(
        "pointer-events-none absolute box-border border-solid",
        multi ? "border-primary border-2" : "border-ring ring-ring/50 border ring-3",
      )}
      style={
        box === null
          ? undefined
          : { left: box.left, top: box.top, width: box.width, height: box.height }
      }
    />
  );
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
  const gridEdges = cellGridEdges(element);
  const tableId = typeof element.id === "string" ? element.id : "";
  const multi = useEditorSelector(
    (instance) => {
      const selection = instance.selection;
      if (!selection || instance.api.isCollapsed() || tableId.length === 0) {
        return false;
      }

      let count = 0;
      for (const [node, cellPath] of instance.api.nodes({
        at: selection,
        match: (candidate) =>
          ElementApi.isElement(candidate) &&
          (candidate.type === KEYS.td || candidate.type === KEYS.th),
      })) {
        if (!ElementApi.isElement(node) || cellPath.length < 2) {
          continue;
        }

        const tableNode = instance.api.node(cellPath.slice(0, -2))?.[0];
        if (!ElementApi.isElement(tableNode) || tableNode.id !== tableId) {
          continue;
        }

        count += 1;
        if (count > 1) {
          return true;
        }
      }

      return false;
    },
    [tableId],
  );

  function measureFit(): { tablePath: number[]; available: number; widths: number[] } | undefined {
    const table = tableRef.current;
    if (!table || path === undefined) {
      return undefined;
    }

    const container = table.parentElement;
    if (!(container instanceof HTMLElement)) {
      return undefined;
    }

    const live = columnPixelWidths(table);
    const measured = widths.map((width, index) => {
      if (typeof width === "number" && Number.isFinite(width) && width > 0) {
        return width;
      }

      const pixel = live[index] ?? 0;
      return pixel > 0 ? Math.round(pixel) : TABLE_MIN_COLUMN_WIDTH;
    });

    return {
      tablePath: path,
      available: container.clientWidth,
      widths: measured,
    };
  }

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
    <PlateElement
      {...props}
      className={cn(
        "group [&_[data-slot=table-container]]:scroll-fade-x relative my-2 max-w-full",
        multi && "[&_*::selection]:bg-transparent [&_*::selection]:text-current",
      )}
    >
      {readOnly || path === undefined ? null : (
        <TableControls element={element} measureFit={measureFit} />
      )}
      <TableResizeContext.Provider
        value={{ readOnly, startWidth, commitWidth, setPreview, gridEdges }}
      >
        <Table
          ref={tableRef}
          className="border-separate border-spacing-0"
          style={
            tableWidth === undefined
              ? undefined
              : { width: tableWidth, minWidth: tableWidth, borderCollapse: "separate" }
          }
        >
          <colgroup>
            {displayed.map((width, index) => (
              <col key={index} style={typeof width === "number" ? { width } : undefined} />
            ))}
          </colgroup>
          <TableBody>{props.children}</TableBody>
        </Table>
      </TableResizeContext.Provider>
      {readOnly ? null : <TableSelectionFrame watch={preview} multi={multi} />}
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
      className="absolute inset-y-0 right-0 z-10 w-2 cursor-col-resize"
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
    <TableRow
      {...slateProps}
      className={cn(
        className,
        "border-0 bg-transparent hover:bg-transparent data-[state=selected]:bg-transparent",
      )}
    >
      {children}
    </TableRow>
  );
}

export function TableCellElement(props: PlateElementProps) {
  const editor = useEditorRef();
  const readOnly = useReadOnly();
  const selected = useIsCellSelected(props.element);
  const cellId = typeof props.element.id === "string" ? props.element.id : "";
  const editing = useEditorSelector(
    (instance) => {
      const selection = instance.selection;
      if (!selection || cellId.length === 0) {
        return false;
      }

      const match = instance.api.above({
        at: selection,
        match: (node) => ElementApi.isElement(node) && node.id === cellId,
      });
      return match !== undefined;
    },
    [cellId],
  );
  const active = selected || editing;
  const header = props.element.type === KEYS.th;
  const colSpan = spanAttribute(props.element.colSpan);
  const rowSpan = spanAttribute(props.element.rowSpan);
  const column = readOnly ? undefined : columnInFirstRow(editor, props.element);
  const edge = useContext(TableResizeContext)?.gridEdges.get(cellId);
  const { className, ...slateProps } = props.attributes;
  const cellClass = cn(
    className,
    CELL_BORDER_CLASS,
    edge?.column === 0 && "border-l",
    edge?.row === 0 && "border-t",
    column !== undefined && "relative",
  );
  const handle = column === undefined ? null : <ColumnResizeHandle column={column} />;

  if (header) {
    return (
      <TableHead
        {...slateProps}
        colSpan={colSpan}
        rowSpan={rowSpan}
        className={cellClass}
        data-cell-selected={active ? "true" : undefined}
      >
        {props.children}
        {handle}
      </TableHead>
    );
  }

  return (
    <TableCell
      {...slateProps}
      colSpan={colSpan}
      rowSpan={rowSpan}
      className={cellClass}
      data-cell-selected={active ? "true" : undefined}
    >
      {props.children}
      {handle}
    </TableCell>
  );
}
