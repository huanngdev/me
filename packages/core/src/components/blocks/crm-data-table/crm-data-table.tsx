"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/table";
import { cn } from "@/lib/utils";

import type { CrmColumn, CrmTable } from "./crm-data-table-features";
import { RowDetail } from "./crm-data-table-row-detail";
import type { CrmDensity } from "./types";

type CrmRow = ReturnType<CrmTable["getRowModel"]>["rows"][number];
type CrmCell = ReturnType<CrmRow["getAllCells"]>[number];

const HEADER_Z = "z-20";
const HEADER_PINNED_Z = "z-30";
const BODY_PINNED_Z = "z-10";

const FIXED_COLUMN_IDS = new Set(["expander", "select", "index"]);
const FIXED_COLUMN_SIZE = 40;

const PINNED_START_SHADOW = "shadow-[2px_0_4px_-2px_rgba(0,0,0,0.18)]";
const PINNED_END_SHADOW = "shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.18)]";

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function areWidthsEqual(a: Record<string, number>, b: Record<string, number>): boolean {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => a[key] === b[key]);
}

/**
 * Columns use auto layout so they size to their content. Pinned offsets
 * therefore come from the measured header widths rather than declared sizes.
 */
function useColumnWidths(containerRef: RefObject<HTMLDivElement | null>): Record<string, number> {
  const [widths, setWidths] = useState<Record<string, number>>({});

  const measure = useCallback(() => {
    const table = containerRef.current?.querySelector("table");
    if (!table) return;

    const next: Record<string, number> = {};
    table.querySelectorAll<HTMLElement>("thead [data-column-id]").forEach((cell) => {
      const id = cell.dataset.columnId;
      if (id) next[id] = cell.offsetWidth;
    });

    setWidths((prev) => (areWidthsEqual(prev, next) ? prev : next));
  }, [containerRef]);

  // Re-measure after every render: toggling a column can change widths without
  // resizing the table itself.
  useIsomorphicLayoutEffect(measure);

  // Re-measure when the table box changes (container or viewport resize).
  useEffect(() => {
    const table = containerRef.current?.querySelector("table");
    if (!table) return;

    const observer = new ResizeObserver(measure);
    observer.observe(table);
    return () => observer.disconnect();
  }, [containerRef, measure]);

  return widths;
}

function getPinnedOffsets(table: CrmTable, widths: Record<string, number>): Record<string, number> {
  const offsets: Record<string, number> = {};

  let startOffset = 0;
  for (const column of table.getStartVisibleLeafColumns()) {
    offsets[column.id] = startOffset;
    startOffset += widths[column.id] ?? 0;
  }

  const endColumns = table.getEndVisibleLeafColumns();
  let endOffset = 0;
  for (let index = endColumns.length - 1; index >= 0; index -= 1) {
    offsets[endColumns[index].id] = endOffset;
    endOffset += widths[endColumns[index].id] ?? 0;
  }

  return offsets;
}

function getColumnStyle(column: CrmColumn, pinnedOffsets: Record<string, number>): CSSProperties {
  const style: CSSProperties = {};

  if (FIXED_COLUMN_IDS.has(column.id)) {
    style.width = FIXED_COLUMN_SIZE;
    style.minWidth = FIXED_COLUMN_SIZE;
    style.maxWidth = FIXED_COLUMN_SIZE;
  }

  const pinned = column.getIsPinned();
  if (pinned === "start") {
    style.position = "sticky";
    style.left = pinnedOffsets[column.id] ?? 0;
  } else if (pinned === "end") {
    style.position = "sticky";
    style.right = pinnedOffsets[column.id] ?? 0;
  }

  return style;
}

/** Draws a soft shadow on the outer edge of each pinned region. */
function getPinnedEdgeClass(column: CrmColumn, isEdge: boolean): string {
  if (!isEdge) return "";

  const pinned = column.getIsPinned();
  if (pinned === "start") return PINNED_START_SHADOW;
  if (pinned === "end") return PINNED_END_SHADOW;
  return "";
}

function getHeaderCellClassName(column: CrmColumn, isEdge: boolean): string {
  const pinned = column.getIsPinned();

  return cn(
    "bg-background sticky top-0 border-t border-r border-b p-0 first:border-l",
    FIXED_COLUMN_IDS.has(column.id) && "w-10",
    pinned ? HEADER_PINNED_Z : HEADER_Z,
    getPinnedEdgeClass(column, isEdge),
  );
}

function getBodyCellClassName(column: CrmColumn, isEdge: boolean): string {
  const pinned = column.getIsPinned();

  return cn(
    "border-r border-b first:border-l",
    FIXED_COLUMN_IDS.has(column.id) && "h-10 w-10 p-0",
    pinned &&
      cn(
        "bg-background",
        BODY_PINNED_Z,
        "group-hover/row:bg-muted group-data-[state=selected]/row:bg-muted",
      ),
    getPinnedEdgeClass(column, isEdge),
  );
}

/**
 * Pinned columns are rendered before unpinned ones so the sticky offsets line
 * up with the DOM. `getAllCells()` keeps the original column order, which would
 * let a pinned cell overlap the unpinned column sitting between them.
 */
function getOrderedCells(row: CrmRow): CrmCell[] {
  return [
    ...row.getStartVisibleCells(),
    ...row.getCenterVisibleCells(),
    ...row.getEndVisibleCells(),
  ];
}

function getOrderedHeaders(table: CrmTable) {
  return [
    ...table.getStartFlatHeaders(),
    ...table.getCenterFlatHeaders(),
    ...table.getEndFlatHeaders(),
  ];
}

export function CrmDataTable({ table, density }: { table: CrmTable; density: CrmDensity }) {
  "use no memo";

  const containerRef = useRef<HTMLDivElement>(null);
  const columnWidths = useColumnWidths(containerRef);
  const pinnedOffsets = getPinnedOffsets(table, columnWidths);

  const headers = getOrderedHeaders(table);
  const topRows = table.getTopRows();
  const centerRows = table.getCenterRows();
  const hasRows = topRows.length > 0 || centerRows.length > 0;
  const columnCount = table.getAllLeafColumns().length;
  const lastStartColumnId = table.getStartVisibleLeafColumns().at(-1)?.id;
  const firstEndColumnId = table.getEndVisibleLeafColumns()[0]?.id;

  const isPinnedEdge = (column: CrmColumn) =>
    column.id === lastStartColumnId || column.id === firstEndColumnId;

  const renderRow = (row: CrmRow, pinned = false) => (
    <Fragment key={row.id}>
      <TableRow
        data-state={row.getIsSelected() ? "selected" : undefined}
        className={cn(
          "group/row",
          density === "compact" && "[&>td]:py-1",
          pinned && "bg-muted/40 hover:bg-muted/60",
        )}
      >
        {getOrderedCells(row).map((cell) => {
          const { column } = cell;
          return (
            <TableCell
              key={cell.id}
              className={getBodyCellClassName(column, isPinnedEdge(column))}
              style={getColumnStyle(column, pinnedOffsets)}
            >
              <table.FlexRender cell={cell} />
            </TableCell>
          );
        })}
      </TableRow>
      {row.getIsExpanded() && (
        <TableRow className="hover:bg-transparent">
          <TableCell
            colSpan={columnCount}
            className="bg-muted/30 border-x border-b p-0 align-top whitespace-normal"
          >
            <RowDetail customer={row.original} />
          </TableCell>
        </TableRow>
      )}
    </Fragment>
  );

  return (
    <div ref={containerRef} className="min-h-0 flex-1 *:data-[slot=table-container]:h-full">
      <Table className="border-separate border-spacing-0">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {headers.map((header) => {
              const { column } = header;
              return (
                <TableHead
                  key={header.id}
                  data-column-id={column.id}
                  className={getHeaderCellClassName(column, isPinnedEdge(column))}
                  style={getColumnStyle(column, pinnedOffsets)}
                >
                  {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {hasRows ? (
            <>
              {topRows.map((row) => renderRow(row, true))}
              {centerRows.map((row) => renderRow(row))}
            </>
          ) : (
            <TableRow>
              <TableCell
                colSpan={columnCount}
                className="text-muted-foreground h-24 border-r border-b text-center first:border-l"
              >
                No customers found.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
