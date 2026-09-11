"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/button";
import { NativeSelect, NativeSelectOption } from "@/components/native-select";

import type { CrmTable } from "./crm-data-table-features";

const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;

export function CrmDataTablePagination({ table }: { table: CrmTable }) {
  "use no memo";

  const { pageIndex, pageSize } = table.state.pagination;
  const pageCount = Math.max(table.getPageCount(), 1);
  const rowCount = table.getRowCount();
  const canPrevious = table.getCanPreviousPage();
  const canNext = table.getCanNextPage();

  return (
    <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-t px-3 text-xs">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">Rows per page</span>
        <NativeSelect
          size="sm"
          aria-label="Rows per page"
          value={String(pageSize)}
          onChange={(event) => table.setPageSize(Number(event.target.value))}
        >
          {PAGE_SIZE_OPTIONS.map((option) => (
            <NativeSelectOption key={option} value={option}>
              {option}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-muted-foreground tabular-nums">
          {rowCount} rows · Page {pageIndex + 1} of {pageCount}
        </span>
        <div className="flex items-center gap-1">
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
        </div>
      </div>
    </div>
  );
}
