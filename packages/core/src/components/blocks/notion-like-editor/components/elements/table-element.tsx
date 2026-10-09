import { useLayoutEffect, useRef, useState } from "react";
import { KEYS, type TElement } from "platejs";
import {
  PlateElement,
  useEditorRef,
  useElement,
  useReadOnly,
  type PlateElementProps,
} from "platejs/react";
import { useIsCellSelected, useSelectedCells } from "@platejs/table/react";

import { TableBody } from "@/components/table";
import { cn } from "@/lib/utils";

import { runEditorCommand } from "../../lib/commands/editor-commands";
import { setTableColumnWidth } from "../../lib/commands/editor-table-commands";
import {
  tableCoverage,
  TABLE_MAX_COLUMN_WIDTH,
  TABLE_MIN_COLUMN_WIDTH,
} from "../../lib/features/editor-table-grid";
import { TableControls } from "../ui/table-controls";

// PlateElement `as` accepts an HTML tag only, and Table() wraps a scrolling div
// that would move apart from the resize handles. The strings below are the
// classes on Table, TableRow, TableHead, and TableCell in @/components/table.
// TableBody is used directly. TableHead has no background.
const TABLE_CLASS = "w-full caption-bottom text-sm border-collapse";
const TABLE_ROW_CLASS =
  "hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted border-b transition-colors";
const TABLE_HEAD_CLASS =
  "text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap [&:has([role=checkbox])]:pr-0";
const TABLE_CELL_CLASS = "p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0";
const CELL_BORDER_CLASS = "min-w-12 border border-[var(--editor-table-border)]";

const SELECTED_CLASS = "editor-table-cell-selected bg-[var(--editor-table-selected)]";

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
      <div className="max-w-full overflow-x-auto">
        <div className="relative w-max min-w-full">
          <table
            ref={tableRef}
            className={TABLE_CLASS}
            style={tableWidth === undefined ? undefined : { width: tableWidth }}
          >
            <colgroup>
              {displayed.map((width, index) => (
                <col key={index} style={typeof width === "number" ? { width } : undefined} />
              ))}
            </colgroup>
            <TableBody>{props.children}</TableBody>
          </table>
          {readOnly
            ? null
            : displayed.map((width, index) => {
                const edge = edges[index];
                const left =
                  edge !== undefined && edge > 0
                    ? edge
                    : displayed
                        .slice(0, index + 1)
                        .reduce<number>((sum, value) => sum + (value ?? FALLBACK_COLUMN_WIDTH), 0);
                const current = typeof width === "number" ? width : startWidth(index);
                return (
                  <div
                    key={index}
                    role="separator"
                    aria-orientation="vertical"
                    aria-valuemin={TABLE_MIN_COLUMN_WIDTH}
                    aria-valuemax={TABLE_MAX_COLUMN_WIDTH}
                    aria-valuenow={current}
                    aria-label={`Resize column ${index + 1}`}
                    tabIndex={0}
                    contentEditable={false}
                    data-column={index}
                    className="absolute top-0 z-10 h-full w-2 -translate-x-1/2 cursor-col-resize"
                    style={{ left }}
                    onPointerDown={(event) => {
                      if (event.button !== 0) {
                        return;
                      }

                      event.preventDefault();
                      event.stopPropagation();
                      const handle = event.currentTarget;
                      const originX = event.clientX;
                      const initial = startWidth(index);
                      let latest = initial;
                      const move = (pointer: PointerEvent): void => {
                        latest = clampWidth(initial + pointer.clientX - originX);
                        setPreview((currentPreview) => {
                          const next = new Map(currentPreview);
                          next.set(index, latest);
                          return next;
                        });
                      };
                      const stop = (): void => {
                        handle.removeEventListener("pointermove", move);
                        handle.removeEventListener("pointerup", stop);
                        handle.removeEventListener("pointercancel", stop);
                        setPreview((currentPreview) => {
                          const next = new Map(currentPreview);
                          next.delete(index);
                          return next;
                        });
                        if (latest !== initial) {
                          commitWidth(index, latest);
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
                      commitWidth(index, null);
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
                        return;
                      }

                      event.preventDefault();
                      event.stopPropagation();
                      const delta = event.key === "ArrowRight" ? 8 : -8;
                      commitWidth(index, clampWidth(startWidth(index) + delta));
                    }}
                  />
                );
              })}
        </div>
      </div>
    </PlateElement>
  );
}

export function TableRowElement(props: PlateElementProps) {
  return <PlateElement {...props} as="tr" className={TABLE_ROW_CLASS} />;
}

export function TableCellElement(props: PlateElementProps) {
  const selected = useIsCellSelected(props.element);
  const header = props.element.type === KEYS.th;
  const colSpan = spanAttribute(props.element.colSpan);
  const rowSpan = spanAttribute(props.element.rowSpan);

  return (
    <PlateElement
      {...props}
      as={header ? "th" : "td"}
      attributes={{
        ...props.attributes,
        colSpan,
        rowSpan,
      }}
      className={cn(
        header ? TABLE_HEAD_CLASS : TABLE_CELL_CLASS,
        CELL_BORDER_CLASS,
        selected && SELECTED_CLASS,
      )}
    />
  );
}
