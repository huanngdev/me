"use client";

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

import { Button } from "@/components/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/select";

import type { CrmTable } from "./crm-data-table-features";

const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;

export function CrmDataTablePagination({ table }: { table: CrmTable }) {
  "use no memo";

  const { pageIndex, pageSize } = table.state.pagination;
  const rowCount = table.getRowCount();
  const canPrevious = table.getCanPreviousPage();
  const canNext = table.getCanNextPage();
  const firstRow = rowCount === 0 ? 0 : pageIndex * pageSize + 1;
  const lastRow = Math.min(rowCount, (pageIndex + 1) * pageSize);

  return (
    <div className="flex h-10 shrink-0 items-center justify-between gap-2 px-3 text-xs">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">Rows per page</span>
        <Select
          value={String(pageSize)}
          onValueChange={(value) => table.setPageSize(Number(value))}
        >
          <SelectTrigger size="sm" aria-label="Rows per page" className="w-16">
            <SelectValue>{pageSize}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZE_OPTIONS.map((option) => (
              <SelectItem key={option} value={String(option)}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-muted-foreground tabular-nums">
          {firstRow}–{lastRow} of {rowCount} rows
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="First page"
            disabled={!canPrevious}
            onClick={() => table.firstPage()}
          >
            <ChevronsLeft />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Previous page"
            disabled={!canPrevious}
            onClick={() => table.previousPage()}
          >
            <ChevronLeft />
          </Button>
          {table.getPageOptions().map((page) => (
            <Button
              key={page}
              variant={page === pageIndex ? "secondary" : "outline"}
              size="icon-sm"
              aria-current={page === pageIndex ? "page" : undefined}
              onClick={() => table.setPageIndex(page)}
            >
              {page + 1}
            </Button>
          ))}
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Next page"
            disabled={!canNext}
            onClick={() => table.nextPage()}
          >
            <ChevronRight />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Last page"
            disabled={!canNext}
            onClick={() => table.lastPage()}
          >
            <ChevronsRight />
          </Button>
        </div>
      </div>
    </div>
  );
}
