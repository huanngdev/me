"use client";

import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Columns3,
  ListFilter,
  Search,
  Settings2,
  X,
} from "lucide-react";

import { Button } from "@/components/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/dropdown-menu";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/input-group";

import { CRM_COLUMN_LABELS } from "./crm-data-table-columns";
import type { CrmTable } from "./crm-data-table-features";
import type { CrmDensity } from "./types";

type CrmDataTableToolbarProps = {
  table: CrmTable;
  teams: string[];
  density: CrmDensity;
  onDensityChange: (density: CrmDensity) => void;
  searchInput: string;
  onSearchChange: (value: string) => void;
  teamFilter: string;
  onTeamFilterChange: (value: string) => void;
  selectedCount: number;
  onClearSelection: () => void;
  hasFilters: boolean;
  onClearFilters: () => void;
};

export function CrmDataTableToolbar({
  table,
  teams,
  density,
  onDensityChange,
  searchInput,
  onSearchChange,
  teamFilter,
  onTeamFilterChange,
  selectedCount,
  onClearSelection,
  hasFilters,
  onClearFilters,
}: CrmDataTableToolbarProps) {
  "use no memo";

  const filterCount = table.state.columnFilters.length;
  const sortedCount = table.state.sorting.length;
  const activeSort = table.state.sorting[0];
  const sortableColumns = table.getAllLeafColumns().filter((column) => column.getCanSort());

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
      <div className="flex items-center gap-1">
        {selectedCount > 0 && (
          <>
            <span className="text-muted-foreground px-1 text-xs tabular-nums">
              {selectedCount} selected
            </span>
            <Button variant="ghost" size="sm" onClick={onClearSelection}>
              <X />
              Clear
            </Button>
          </>
        )}
        {hasFilters && (
          <Button variant="ghost" onClick={onClearFilters}>
            <X />
            Clear filters
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <InputGroup className="h-8 w-52">
          <InputGroupAddon align="inline-start">
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            aria-label="Search all columns"
            placeholder="Search..."
            value={searchInput}
            onChange={(event) => onSearchChange(event.target.value)}
          />
          {searchInput && (
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                size="icon-xs"
                aria-label="Clear search"
                onClick={() => onSearchChange("")}
              >
                <X />
              </InputGroupButton>
            </InputGroupAddon>
          )}
        </InputGroup>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">
              <ListFilter />
              Filter
              {filterCount > 0 ? ` (${filterCount})` : ""}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuLabel>Team</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={teamFilter || "all"}
              onValueChange={(value) => onTeamFilterChange(value === "all" ? "" : value)}
            >
              <DropdownMenuRadioItem value="all">All teams</DropdownMenuRadioItem>
              {teams.map((team) => (
                <DropdownMenuRadioItem key={team} value={team}>
                  {team}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">
              <Columns3 />
              Layout
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {table
              .getAllLeafColumns()
              .filter((column) => column.getCanHide())
              .map((column) => (
                <DropdownMenuCheckboxItem
                  key={column.id}
                  checked={column.getIsVisible()}
                  onCheckedChange={(value) => column.toggleVisibility(!!value)}
                >
                  {CRM_COLUMN_LABELS[column.id] ?? column.id}
                </DropdownMenuCheckboxItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">
              {activeSort ? activeSort.desc ? <ArrowDown /> : <ArrowUp /> : <ArrowUpDown />}
              Sort
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {sortableColumns.map((column) => {
              const sorted = column.getIsSorted();
              return (
                <DropdownMenuItem
                  key={column.id}
                  onClick={() => column.toggleSorting(sorted === "asc")}
                >
                  <span className="flex-1">{CRM_COLUMN_LABELS[column.id] ?? column.id}</span>
                  {sorted === "asc" ? (
                    <ArrowUp className="size-3.5" />
                  ) : sorted === "desc" ? (
                    <ArrowDown className="size-3.5" />
                  ) : null}
                </DropdownMenuItem>
              );
            })}
            {sortedCount > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => table.setSorting([])}>
                  <X />
                  Clear sorting
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" aria-label="View settings">
              <Settings2 />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuLabel>Row density</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={density}
              onValueChange={(value) => onDensityChange(value as CrmDensity)}
            >
              <DropdownMenuRadioItem value="comfortable">Comfortable</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="compact">Compact</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
