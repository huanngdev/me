"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/table";
import { cn } from "@/lib/utils";

import type { CrmTable } from "./crm-data-table-features";
import type { CrmDensity } from "./types";

const FIXED_COLUMNS = new Set(["select", "index"]);
const FIXED_SIZE = 40;

export function CrmDataTable({ table, density }: { table: CrmTable; density: CrmDensity }) {
  "use no memo";

  const rows = table.getRowModel().rows;
  const columnCount = table.getAllLeafColumns().length;

  return (
    <div className="min-h-0 flex-1 *:data-[slot=table-container]:h-full">
      <Table className="border-separate border-spacing-0">
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} className="hover:bg-transparent">
              {headerGroup.headers.map((header) => {
                const fixed = FIXED_COLUMNS.has(header.column.id);
                return (
                  <TableHead
                    key={header.id}
                    className={cn(
                      "bg-background sticky top-0 z-10 border-t border-r border-b p-0 first:border-l",
                      fixed && "w-10",
                    )}
                    style={
                      fixed
                        ? { width: FIXED_SIZE, minWidth: FIXED_SIZE, maxWidth: FIXED_SIZE }
                        : undefined
                    }
                  >
                    {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {rows.length > 0 ? (
            rows.map((row) => (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() ? "selected" : undefined}
                className={density === "compact" ? "[&>td]:py-1" : undefined}
              >
                {row.getAllCells().map((cell) => {
                  const fixed = FIXED_COLUMNS.has(cell.column.id);
                  return (
                    <TableCell
                      key={cell.id}
                      className={cn("border-r border-b first:border-l", fixed && "h-10 w-10 p-0")}
                      style={
                        fixed
                          ? { width: FIXED_SIZE, minWidth: FIXED_SIZE, maxWidth: FIXED_SIZE }
                          : undefined
                      }
                    >
                      <table.FlexRender cell={cell} />
                    </TableCell>
                  );
                })}
              </TableRow>
            ))
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
