import {
  columnFilteringFeature,
  columnOrderingFeature,
  columnVisibilityFeature,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  filterFn_equalsString,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_datetime,
  sortFn_text,
  tableFeatures,
  type ReactTable,
  type Row,
  type Table as TanStackTable,
} from "@tanstack/react-table";

import type { CrmCustomer } from "./types";

export const CRM_FEATURES = tableFeatures({
  rowSortingFeature,
  rowSelectionFeature,
  columnVisibilityFeature,
  columnOrderingFeature,
  columnFilteringFeature,
  globalFilteringFeature,
  rowPaginationFeature,
  sortedRowModel: createSortedRowModel(),
  filteredRowModel: createFilteredRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  sortFns: {
    alphanumeric: sortFn_alphanumeric,
    datetime: sortFn_datetime,
    text: sortFn_text,
  },
  filterFns: {
    equalsString: filterFn_equalsString,
  },
});

export type CrmTable = ReactTable<typeof CRM_FEATURES, CrmCustomer>;
export type CrmCoreTable = TanStackTable<typeof CRM_FEATURES, CrmCustomer>;

/**
 * Global search across every column. Rows are matched if any value contains the
 * needle, including nested arrays/objects.
 */
export function globalFilterAllColumns(
  row: Row<typeof CRM_FEATURES, CrmCustomer>,
  _columnId: string,
  filterValue: unknown,
): boolean {
  const needle = String(filterValue ?? "")
    .trim()
    .toLowerCase();

  if (!needle) return true;

  return Object.values(row.original).some((value) => {
    if (value === null || value === undefined) return false;
    if (Array.isArray(value)) {
      return value.some((item) => String(item).toLowerCase().includes(needle));
    }
    if (typeof value === "object") {
      return JSON.stringify(value).toLowerCase().includes(needle);
    }
    return String(value).toLowerCase().includes(needle);
  });
}
