"use client";

import { useCallback, useEffect, useState } from "react";
import {
  useTable,
  type ColumnFiltersState,
  type ColumnVisibilityState,
  type PaginationState,
  type SortingState,
} from "@tanstack/react-table";

import { useBlockUrl } from "@/components/layouts/block-url";

import { createCrmColumns } from "./crm-data-table-columns";
import { CRM_FEATURES, globalFilterAllColumns, type CrmTable } from "./crm-data-table-features";
import type { CrmCustomer, CrmDensity } from "./types";

const CRM_COLUMNS = createCrmColumns();

export type CrmTableController = {
  table: CrmTable;
  density: CrmDensity;
  setDensity: (density: CrmDensity) => void;
  searchInput: string;
  setSearchInput: (value: string) => void;
  teamFilter: string;
  setTeamFilter: (value: string) => void;
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
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 20 });
  const [density, setDensity] = useState<CrmDensity>("comfortable");
  const [ready, setReady] = useState(false);

  const table = useTable({
    features: CRM_FEATURES,
    columns: CRM_COLUMNS,
    data,
    getRowId: (row) => row.id,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      columnOrder,
      globalFilter: search,
      pagination,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnOrderChange: setColumnOrder,
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

    const team = params.get("team");
    if (team) setColumnFilters([{ id: "team", value: team }]);

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

    const pageSizeParam = Number(params.get("pageSize"));
    const pageParam = Number(params.get("page"));
    const nextPagination: PaginationState = { pageIndex: 0, pageSize: 20 };
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

    const team = columnFilters.find((filter) => filter.id === "team")?.value;
    if (team) params.set("team", String(team));

    const hidden = Object.entries(columnVisibility)
      .filter(([, visible]) => visible === false)
      .map(([id]) => id);
    if (hidden.length > 0) params.set("hide", hidden.join(","));

    if (columnOrder.length > 0) params.set("cols", columnOrder.join(","));
    if (pagination.pageIndex > 0) params.set("page", String(pagination.pageIndex + 1));
    if (pagination.pageSize !== 20) params.set("pageSize", String(pagination.pageSize));
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
    pagination,
    density,
    setPreviewSearch,
  ]);

  const setTeamFilter = useCallback((value: string) => {
    setColumnFilters(value ? [{ id: "team", value }] : []);
  }, []);

  const clearFilters = useCallback(() => {
    setSearchInput("");
    setSearch("");
    setColumnFilters([]);
    setSorting([]);
  }, []);

  const teamFilter =
    (columnFilters.find((filter) => filter.id === "team")?.value as string | undefined) ?? "";

  return {
    table,
    density,
    setDensity,
    searchInput,
    setSearchInput,
    teamFilter,
    setTeamFilter,
    hasFilters: columnFilters.length > 0 || search.length > 0 || sorting.length > 0,
    clearFilters,
  };
}
