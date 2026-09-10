"use client";

import * as React from "react";
import { tableFeatures, useTable, type ColumnDef } from "@tanstack/react-table";
import type { z } from "zod";

import { cn } from "../../lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../table";

const FEATURES = tableFeatures({});

type ColumnKey<TRow> = Extract<keyof TRow, string>;

export type ZodDataTableColumnContext<TRow, TKey extends ColumnKey<TRow>> = {
  value: TRow[TKey];
  row: TRow;
  rowIndex: number;
};

export type ZodDataTableColumn<TRow, TKey extends ColumnKey<TRow>> = {
  header?: React.ReactNode;
  hidden?: boolean;
  cell?: (context: ZodDataTableColumnContext<TRow, TKey>) => React.ReactNode;
};

export type ZodDataTableColumns<TRow> = {
  [TKey in ColumnKey<TRow>]?: ZodDataTableColumn<TRow, TKey>;
};

export type ZodDataTableProps<TSchema extends z.ZodObject> = {
  schema: TSchema;
  data: Array<z.output<TSchema>>;
  columns?: ZodDataTableColumns<z.output<TSchema>>;
  emptyMessage?: string;
  className?: string;
};

export function humanizeColumnKey(key: string): string {
  return key
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function formatZodDataTableValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== "object") return String(value);

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function getSchemaKeys<TSchema extends z.ZodObject>(
  schema: TSchema,
): Array<ColumnKey<z.output<TSchema>>> {
  // Object.keys is the runtime boundary between the Zod shape and its inferred output keys.
  return Object.keys(schema.shape) as Array<ColumnKey<z.output<TSchema>>>;
}

function createColumn<
  TSchema extends z.ZodObject,
  TRow extends z.output<TSchema>,
  TKey extends ColumnKey<TRow>,
>(
  schema: TSchema,
  key: TKey,
  column: ZodDataTableColumn<TRow, TKey> | undefined,
): ColumnDef<typeof FEATURES, TRow, unknown> | null {
  if (column?.hidden) return null;

  const metadataTitle = schema.shape[key]?.meta()?.title;
  const header = column?.header ?? metadataTitle ?? humanizeColumnKey(key);

  return {
    accessorKey: key,
    header: typeof header === "string" ? header : () => header,
    cell: (context) => {
      const value = context.row.original[key];

      if (column?.cell) {
        return column.cell({
          value,
          row: context.row.original,
          rowIndex: context.row.index,
        });
      }

      return formatZodDataTableValue(value);
    },
  };
}

function createColumns<TSchema extends z.ZodObject>(
  schema: TSchema,
  columns: ZodDataTableColumns<z.output<TSchema>> | undefined,
): Array<ColumnDef<typeof FEATURES, z.output<TSchema>, unknown>> {
  return getSchemaKeys(schema).flatMap((key) => {
    const column = createColumn(schema, key, columns?.[key]);
    return column ? [column] : [];
  });
}

export function ZodDataTable<TSchema extends z.ZodObject>({
  schema,
  data,
  columns: columnOverrides,
  emptyMessage = "No results.",
  className,
}: ZodDataTableProps<TSchema>) {
  const columns = React.useMemo(
    () => createColumns(schema, columnOverrides),
    [schema, columnOverrides],
  );
  const table = useTable({ features: FEATURES, columns, data });

  if (columns.length === 0) {
    return (
      <div
        data-slot="zod-data-table"
        className={cn("text-muted-foreground rounded-lg border p-6 text-center text-sm", className)}
      >
        No columns to display.
      </div>
    );
  }

  return (
    <div data-slot="zod-data-table" className={cn("overflow-hidden rounded-lg border", className)}>
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id}>
                  {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length > 0 ? (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getAllCells().map((cell) => (
                  <TableCell key={cell.id}>
                    <table.FlexRender cell={cell} />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center">
                {emptyMessage}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
