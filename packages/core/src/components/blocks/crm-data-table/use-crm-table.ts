"use client";

import { useCallback, useEffect, useState } from "react";
import {
  useTable,
  type ColumnFiltersState,
  type ColumnPinningState,
  type ColumnVisibilityState,
  type ExpandedState,
  type PaginationState,
  type RowPinningState,
  type SortingState,
} from "@tanstack/react-table";

import { useBlockUrl } from "@/components/layouts/block-url";

import { createCrmColumns } from "./crm-data-table-columns";
import { CRM_FEATURES, globalFilterAllColumns, type CrmTable } from "./crm-data-table-features";
import type { CrmCustomer, CrmDensity } from "./types";

const CRM_COLUMNS = createCrmColumns();

const DEFAULT_PAGE_SIZE = 20;

const DEFAULT_COLUMN_PINNING: ColumnPinningState = {
  start: ["expander", "select"],
  end: [],
};

function parseIdList(value: string | null): string[] {
  return value ? value.split(",").filter(Boolean) : [];
}

function isSameIdList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

function parsePinning(params: URLSearchParams): ColumnPinningState {
  const hasStart = params.has("pinLeft");
  const hasEnd = params.has("pinRight");

  if (!hasStart && !hasEnd) {
    return { start: [...DEFAULT_COLUMN_PINNING.start], end: [...DEFAULT_COLUMN_PINNING.end] };
  }

  return {
    start: hasStart ? parseIdList(params.get("pinLeft")) : [...DEFAULT_COLUMN_PINNING.start],
    end: hasEnd ? parseIdList(params.get("pinRight")) : [...DEFAULT_COLUMN_PINNING.end],
  };
}

function writePinning(params: URLSearchParams, pinning: ColumnPinningState): void {
  if (!isSameIdList(pinning.start, DEFAULT_COLUMN_PINNING.start)) {
    params.set("pinLeft", pinning.start.join(","));
  }
  if (!isSameIdList(pinning.end, DEFAULT_COLUMN_PINNING.end)) {
    params.set("pinRight", pinning.end.join(","));
  }
}

export type CrmTableController = {
  table: CrmTable;
  density: CrmDensity;
  setDensity: (density: CrmDensity) => void;
  searchInput: string;
  setSearchInput: (value: string) => void;
  teamFilter: string;
  setTeamFilter: (value: string) => void;
  selectedCount: number;
  clearSelection: () => void;
  hasFilters: boolean;
  clearFilters: () => void;
};

export function useCrmTable(data: CrmCustomer[]): CrmTableController {
  const { setSearch: setPreviewSearch } = useBlockUrl();

  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({});
  const [columnOrder, setColumnOrder] = useState<string[]>([]);
  const [columnPinning, setColumnPinning] = useState<ColumnPinningState>(DEFAULT_COLUMN_PINNING);
  const [rowPinning, setRowPinning] = useState<RowPinningState>({ top: [], bottom: [] });
  const [expanded, setExpanded] = useState<ExpandedState>({});
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: DEFAULT_PAGE_SIZE,
  });
  const [density, setDensity] = useState<CrmDensity>("comfortable");
  const [ready, setReady] = useState(false);

  const table = useTable({
    features: CRM_FEATURES,
    columns: CRM_COLUMNS,
    data,
    getRowId: (row) => row.id,
    getRowCanExpand: () => true,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      columnOrder,
      columnPinning,
      rowPinning,
      expanded,
      globalFilter: search,
      pagination,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnOrderChange: setColumnOrder,
    onColumnPinningChange: setColumnPinning,
    onRowPinningChange: setRowPinning,
    onExpandedChange: setExpanded,
    onGlobalFilterChange: setSearch,
    onPaginationChange: setPagination,
    globalFilterFn: globalFilterAllColumns,
  });

  // Hydrate state from the URL once on the client.
  /* eslint-disable react-hooks/set-state-in-effect -- one-time URL hydration on mount */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const query = params.get("q") ?? "";
    setSearch(query);
    setSearchInput(query);

    const sort = params.get("sort");
    if (sort) {
      const [id, direction] = sort.split(".");
      if (id && (direction === "asc" || direction === "desc")) {
        setSorting([{ id, desc: direction === "desc" }]);
      }
    }

    const team = parseIdList(params.get("team"));
    if (team.length > 0) setColumnFilters([{ id: "team", value: team }]);

    const hide = params.get("hide");
    if (hide) {
      setColumnVisibility(
        Object.fromEntries(
          hide
            .split(",")
            .filter(Boolean)
            .map((id) => [id, false]),
        ),
      );
    }

    const columns = params.get("cols");
    if (columns) setColumnOrder(columns.split(",").filter(Boolean));

    setColumnPinning(parsePinning(params));

    const pageSizeParam = Number(params.get("pageSize"));
    const pageParam = Number(params.get("page"));
    const nextPagination: PaginationState = { pageIndex: 0, pageSize: DEFAULT_PAGE_SIZE };
    if (Number.isFinite(pageSizeParam) && pageSizeParam > 0) {
      nextPagination.pageSize = pageSizeParam;
    }
    if (Number.isFinite(pageParam) && pageParam >= 1) {
      nextPagination.pageIndex = pageParam - 1;
    }
    setPagination(nextPagination);

    if (params.get("density") === "compact") setDensity("compact");

    setReady(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Debounce the search input before it drives the global filter.
  useEffect(() => {
    const timeout = window.setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => window.clearTimeout(timeout);
  }, [searchInput]);

  // Reflect the table state into the site URL and the Safari address bar.
  useEffect(() => {
    if (!ready) return;

    const params = new URLSearchParams();
    if (search) params.set("q", search);

    const firstSort = sorting[0];
    if (firstSort) params.set("sort", `${firstSort.id}.${firstSort.desc ? "desc" : "asc"}`);

    const team = columnFilters.find((filter) => filter.id === "team")?.value as
      string[] | undefined;
    if (team && team.length > 0) params.set("team", team.join(","));

    const hidden = Object.entries(columnVisibility)
      .filter(([, visible]) => visible === false)
      .map(([id]) => id);
    if (hidden.length > 0) params.set("hide", hidden.join(","));

    if (columnOrder.length > 0) params.set("cols", columnOrder.join(","));
    writePinning(params, columnPinning);
    if (pagination.pageIndex > 0) params.set("page", String(pagination.pageIndex + 1));
    if (pagination.pageSize !== DEFAULT_PAGE_SIZE) {
      params.set("pageSize", String(pagination.pageSize));
    }
    if (density === "compact") params.set("density", "compact");

    const query = params.toString();
    const searchString = query ? `?${query}` : "";
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${searchString}${window.location.hash}`,
    );
    setPreviewSearch(searchString);
  }, [
    ready,
    search,
    sorting,
    columnFilters,
    columnVisibility,
    columnOrder,
    columnPinning,
    pagination,
    density,
    setPreviewSearch,
  ]);

  const setTeamFilter = useCallback((value: string) => {
    setColumnFilters(value ? [{ id: "team", value: [value] }] : []);
  }, []);

  const clearFilters = useCallback(() => {
    setSearchInput("");
    setSearch("");
    table.resetColumnFilters();
    table.resetSorting();
  }, [table]);

  const clearSelection = useCallback(() => {
    table.resetRowSelection();
  }, [table]);

  const teamFilter =
    (columnFilters.find((filter) => filter.id === "team")?.value as string[] | undefined)?.[0] ??
    "";

  return {
    table,
    density,
    setDensity,
    searchInput,
    setSearchInput,
    teamFilter,
    setTeamFilter,
    selectedCount: table.getFilteredSelectedRowModel().rows.length,
    clearSelection,
    hasFilters: columnFilters.length > 0 || search.length > 0 || sorting.length > 0,
    clearFilters,
  };
}
