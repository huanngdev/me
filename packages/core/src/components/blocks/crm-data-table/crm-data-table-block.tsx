"use client";

import { cn } from "@/lib/utils";

import { CrmDataTable } from "./crm-data-table";
import { CrmDataTablePagination } from "./crm-data-table-pagination";
import { CrmDataTableToolbar } from "./crm-data-table-toolbar";
import type { CrmCustomer } from "./types";
import { useCrmTable } from "./use-crm-table";

export type { CrmCustomer } from "./types";

export type CrmDataTableBlockProps = {
  data: CrmCustomer[];
  className?: string;
};

export function CrmDataTableBlock({ data, className }: CrmDataTableBlockProps) {
  "use no memo";

  const controller = useCrmTable(data);
  const teams = Array.from(new Set(data.map((customer) => customer.team))).sort();

  return (
    <div className={cn("bg-background flex h-full min-h-0 flex-col", className)}>
      <CrmDataTableToolbar
        table={controller.table}
        teams={teams}
        density={controller.density}
        onDensityChange={controller.setDensity}
        searchInput={controller.searchInput}
        onSearchChange={controller.setSearchInput}
        teamFilter={controller.teamFilter}
        onTeamFilterChange={controller.setTeamFilter}
        hasFilters={controller.hasFilters}
        onClearFilters={controller.clearFilters}
      />
      <CrmDataTable table={controller.table} density={controller.density} />
      <CrmDataTablePagination table={controller.table} />
    </div>
  );
}
