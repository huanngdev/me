import {
  columnFacetingFeature,
  columnFilteringFeature,
  columnOrderingFeature,
  columnPinningFeature,
  columnVisibilityFeature,
  createExpandedRowModel,
  createFacetedMinMaxValues,
  createFacetedRowModel,
  createFacetedUniqueValues,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  filterFn_arrHas,
  filterFn_arrIncludes,
  filterFn_arrIncludesAll,
  filterFn_arrIncludesSome,
  filterFn_between,
  filterFn_betweenInclusive,
  filterFn_empty,
  filterFn_endsWith,
  filterFn_equals,
  filterFn_equalsString,
  filterFn_equalsStringSensitive,
  filterFn_greaterThan,
  filterFn_greaterThanOrEqualTo,
  filterFn_inDateRange,
  filterFn_inNumberRange,
  filterFn_includesString,
  filterFn_includesStringSensitive,
  filterFn_lessThan,
  filterFn_lessThanOrEqualTo,
  filterFn_notEmpty,
  filterFn_startsWith,
  filterFn_weakEquals,
  globalFilteringFeature,
  rowExpandingFeature,
  rowPaginationFeature,
  rowPinningFeature,
  rowSelectionFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_alphanumericCaseSensitive,
  sortFn_basic,
  sortFn_datetime,
  sortFn_text,
  sortFn_textCaseSensitive,
  tableFeatures,
  type Column,
  type ReactTable,
  type Row,
  type Table as TanStackTable,
} from "@tanstack/react-table";

import type { CrmCustomer } from "./types";

export const CRM_FEATURES = tableFeatures({
  rowSortingFeature,
  rowSelectionFeature,
  rowExpandingFeature,
  rowPinningFeature,
  columnVisibilityFeature,
  columnOrderingFeature,
  columnPinningFeature,
  columnFilteringFeature,
  globalFilteringFeature,
  columnFacetingFeature,
  rowPaginationFeature,
  sortedRowModel: createSortedRowModel(),
  filteredRowModel: createFilteredRowModel(),
  expandedRowModel: createExpandedRowModel(),
  facetedRowModel: createFacetedRowModel(),
  facetedUniqueValues: createFacetedUniqueValues(),
  facetedMinMaxValues: createFacetedMinMaxValues(),
  paginatedRowModel: createPaginatedRowModel(),
  sortFns: {
    basic: sortFn_basic,
    alphanumeric: sortFn_alphanumeric,
    alphanumericCaseSensitive: sortFn_alphanumericCaseSensitive,
    text: sortFn_text,
    textCaseSensitive: sortFn_textCaseSensitive,
    datetime: sortFn_datetime,
  },
  filterFns: {
    arrHas: filterFn_arrHas,
    arrIncludes: filterFn_arrIncludes,
    arrIncludesAll: filterFn_arrIncludesAll,
    arrIncludesSome: filterFn_arrIncludesSome,
    between: filterFn_between,
    betweenInclusive: filterFn_betweenInclusive,
    empty: filterFn_empty,
    endsWith: filterFn_endsWith,
    equals: filterFn_equals,
    equalsString: filterFn_equalsString,
    equalsStringSensitive: filterFn_equalsStringSensitive,
    greaterThan: filterFn_greaterThan,
    greaterThanOrEqualTo: filterFn_greaterThanOrEqualTo,
    inDateRange: filterFn_inDateRange,
    inNumberRange: filterFn_inNumberRange,
    includesString: filterFn_includesString,
    includesStringSensitive: filterFn_includesStringSensitive,
    lessThan: filterFn_lessThan,
    lessThanOrEqualTo: filterFn_lessThanOrEqualTo,
    notEmpty: filterFn_notEmpty,
    startsWith: filterFn_startsWith,
    weakEquals: filterFn_weakEquals,
  },
});

export type CrmTable = ReactTable<typeof CRM_FEATURES, CrmCustomer>;
export type CrmCoreTable = TanStackTable<typeof CRM_FEATURES, CrmCustomer>;
export type CrmColumn = Column<typeof CRM_FEATURES, CrmCustomer, unknown>;

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
