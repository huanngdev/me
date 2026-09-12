"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { formatDistanceToNow } from "date-fns";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ChevronsUpDown,
  EyeOff,
  MoreHorizontal,
  Pin,
  PinOff,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";

import { Badge } from "@/components/badge";
import { Checkbox } from "@/components/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/dropdown-menu";
import { cn } from "@/lib/utils";

import type { CRM_FEATURES, CrmColumn, CrmCoreTable } from "./crm-data-table-features";
import { ColumnFilter, CRM_FILTER_VARIANTS } from "./crm-data-table-filter";
import {
  currencyFormatter,
  dateFormatter,
  dicebearAvatar,
  ONLINE_TONE,
} from "./crm-data-table-format";
import type { CrmCustomer } from "./types";

export const CRM_COLUMN_LABELS: Record<string, string> = {
  account: "Account",
  location: "Location",
  website: "Website",
  lead: "Lead",
  team: "Team",
  amount: "Amount",
  stock: "Stonk",
  startDate: "Start Date",
  communication: "Communication",
  onlinePresence: "Online Presence",
  founded: "Founded",
  founders: "Founders",
  employees: "Employees",
  email: "Email",
  lastInteraction: "Last Interaction",
  responseRate: "Response Rate",
};

export function createCrmColumns(): Array<ColumnDef<typeof CRM_FEATURES, CrmCustomer, unknown>> {
  return [
    {
      id: "expander",
      enableSorting: false,
      enableHiding: false,
      enableColumnFilter: false,
      header: () => null,
      cell: ({ row }) =>
        row.getCanExpand() ? (
          <button
            type="button"
            onClick={row.getToggleExpandedHandler()}
            aria-label={row.getIsExpanded() ? "Collapse row" : "Expand row"}
            aria-expanded={row.getIsExpanded()}
            className="text-muted-foreground hover:text-foreground flex h-full w-full items-center justify-center transition-colors"
          >
            <ChevronRight
              className={cn("size-4 transition-transform", row.getIsExpanded() && "rotate-90")}
            />
          </button>
        ) : null,
    },
    {
      id: "select",
      enableSorting: false,
      enableHiding: false,
      enableColumnFilter: false,
      header: ({ table }) => (
        <div className="flex h-full items-center justify-center">
          <Checkbox
            aria-label="Select all rows"
            checked={
              table.getIsAllRowsSelected()
                ? true
                : table.getIsSomeRowsSelected()
                  ? "indeterminate"
                  : false
            }
            onCheckedChange={(value) => table.toggleAllRowsSelected(value === true)}
          />
        </div>
      ),
      cell: ({ row }) => (
        <div className="flex h-full items-center justify-center">
          <Checkbox
            aria-label={`Select ${row.original.account}`}
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(value === true)}
          />
        </div>
      ),
    },
    {
      id: "index",
      enableSorting: false,
      enableHiding: false,
      enablePinning: false,
      enableColumnFilter: false,
      header: () => <div className="flex h-full items-center justify-center font-medium">#</div>,
      cell: ({ row }) => (
        <div className="flex h-full items-center justify-center">
          <span className="text-muted-foreground font-mono text-xs tabular-nums">
            {row.index + 1}
          </span>
        </div>
      ),
    },
    {
      accessorKey: "account",
      filterFn: "includesString",
      header: ({ column, table }) => (
        <CrmColumnHeader column={column} table={table} title="Account" />
      ),
      enableHiding: false,
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- DiceBear SVG avatar */}
          <img
            src={dicebearAvatar(row.original.account)}
            alt=""
            width={24}
            height={24}
            loading="lazy"
            decoding="async"
            className="bg-muted size-6 shrink-0 rounded-md"
          />
          <span className="font-medium">{row.original.account}</span>
        </div>
      ),
    },
    {
      accessorKey: "location",
      filterFn: "arrHas",
      header: ({ column, table }) => (
        <CrmColumnHeader column={column} table={table} title="Location" />
      ),
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.location}</span>,
    },
    {
      accessorKey: "website",
      filterFn: "includesString",
      header: ({ column, table }) => (
        <CrmColumnHeader column={column} table={table} title="Website" />
      ),
      cell: ({ row }) => (
        <a
          href={`https://${row.original.website}`}
          target="_blank"
          rel="noreferrer"
          className="text-primary hover:underline"
        >
          {row.original.website}
        </a>
      ),
    },
    {
      accessorKey: "lead",
      filterFn: "arrHas",
      header: ({ column, table }) => <CrmColumnHeader column={column} table={table} title="Lead" />,
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- DiceBear SVG avatar */}
          <img
            src={dicebearAvatar(row.original.lead)}
            alt=""
            width={24}
            height={24}
            loading="lazy"
            decoding="async"
            className="bg-muted size-6 shrink-0 rounded-full"
          />
          <span>{row.original.lead}</span>
        </div>
      ),
    },
    {
      accessorKey: "team",
      filterFn: "arrHas",
      header: ({ column, table }) => <CrmColumnHeader column={column} table={table} title="Team" />,
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.team}</span>,
    },
    {
      accessorKey: "amount",
      filterFn: "inNumberRange",
      header: ({ column, table }) => (
        <CrmColumnHeader column={column} table={table} title="Amount" />
      ),
      cell: ({ row }) => (
        <span className="font-medium tabular-nums">
          {currencyFormatter.format(row.original.amount)}
        </span>
      ),
    },
    {
      id: "stock",
      accessorFn: (row) => row.stock.change,
      filterFn: "inNumberRange",
      header: ({ column, table }) => (
        <CrmColumnHeader column={column} table={table} title="Stonk" />
      ),
      cell: ({ row }) => {
        const { change } = row.original.stock;
        const up = change >= 0;

        return (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 text-xs font-medium tabular-nums",
              up ? "text-emerald-500" : "text-red-500",
            )}
          >
            {up ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
            {up ? "+" : ""}
            {change.toFixed(2)}%
          </span>
        );
      },
    },
    {
      accessorKey: "startDate",
      filterFn: "inDateRange",
      header: ({ column, table }) => (
        <CrmColumnHeader column={column} table={table} title="Start Date" />
      ),
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {dateFormatter.format(new Date(row.original.startDate))}
        </span>
      ),
    },
    {
      accessorKey: "communication",
      filterFn: "arrHas",
      header: ({ column, table }) => (
        <CrmColumnHeader column={column} table={table} title="Communication" />
      ),
      cell: ({ row }) => <Badge variant="outline">{row.original.communication}</Badge>,
    },
    {
      accessorKey: "onlinePresence",
      filterFn: "arrHas",
      header: ({ column, table }) => (
        <CrmColumnHeader column={column} table={table} title="Online Presence" />
      ),
      cell: ({ row }) => (
        <span className="text-muted-foreground inline-flex items-center gap-1.5">
          <span
            className={`size-1.5 rounded-full ${ONLINE_TONE[row.original.onlinePresence]}`}
            aria-hidden
          />
          {row.original.onlinePresence}
        </span>
      ),
    },
    {
      accessorKey: "founded",
      filterFn: "inNumberRange",
      header: ({ column, table }) => (
        <CrmColumnHeader column={column} table={table} title="Founded" />
      ),
      cell: ({ row }) => <span className="tabular-nums">{row.original.founded}</span>,
    },
    {
      accessorKey: "founders",
      filterFn: "includesString",
      header: ({ column, table }) => (
        <CrmColumnHeader column={column} table={table} title="Founders" />
      ),
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.founders}</span>,
    },
    {
      accessorKey: "employees",
      filterFn: "inNumberRange",
      header: ({ column, table }) => (
        <CrmColumnHeader column={column} table={table} title="Employees" />
      ),
      cell: ({ row }) => <span className="tabular-nums">{row.original.employees}</span>,
    },
    {
      accessorKey: "email",
      filterFn: "includesString",
      header: ({ column, table }) => (
        <CrmColumnHeader column={column} table={table} title="Email" />
      ),
      cell: ({ row }) => (
        <a href={`mailto:${row.original.email}`} className="text-primary hover:underline">
          {row.original.email}
        </a>
      ),
    },
    {
      accessorKey: "lastInteraction",
      filterFn: "inDateRange",
      header: ({ column, table }) => (
        <CrmColumnHeader column={column} table={table} title="Last Interaction" />
      ),
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {formatDistanceToNow(new Date(row.original.lastInteraction), { addSuffix: true })}
        </span>
      ),
    },
    {
      accessorKey: "responseRate",
      filterFn: "inNumberRange",
      header: ({ column, table }) => (
        <CrmColumnHeader column={column} table={table} title="Response Rate" />
      ),
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <div className="bg-muted h-1.5 w-16 overflow-hidden rounded-full">
            <div
              className="bg-primary h-full rounded-full"
              style={{ width: `${row.original.responseRate}%` }}
            />
          </div>
          <span className="text-muted-foreground text-xs tabular-nums">
            {row.original.responseRate}%
          </span>
        </div>
      ),
    },
    {
      id: "actions",
      enableSorting: false,
      enableHiding: false,
      enablePinning: false,
      enableColumnFilter: false,
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => {
        const pinned = row.getIsPinned();
        return (
          <div className="flex h-full items-center justify-center">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={`Actions for ${row.original.account}`}
                  className="text-muted-foreground hover:bg-muted hover:text-foreground flex size-7 items-center justify-center rounded-md transition-colors"
                >
                  <MoreHorizontal className="size-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem onClick={() => row.pin(pinned === "top" ? false : "top")}>
                  {pinned === "top" ? <PinOff /> : <Pin />}
                  {pinned === "top" ? "Unpin row" : "Pin row to top"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    },
  ];
}

export function CrmColumnHeader({
  column,
  table,
  title,
}: {
  column: CrmColumn;
  table: CrmCoreTable;
  title: string;
}) {
  "use no memo";

  if (
    !column.getCanSort() &&
    !column.getCanHide() &&
    !column.getCanPin() &&
    !column.getCanFilter()
  ) {
    return <div className="flex h-full items-center px-2 font-medium">{title}</div>;
  }

  const sorted = column.getIsSorted();
  const pinned = column.getIsPinned();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="hover:bg-muted focus-visible:ring-ring/50 flex h-full w-full items-center justify-between gap-1 px-2 text-left font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-inset"
        >
          <span className="flex min-w-0 items-center gap-1">
            {pinned && <Pin className="text-primary size-3 shrink-0" aria-hidden="true" />}
            <span className="truncate">{title}</span>
          </span>
          {sorted === "asc" ? (
            <ArrowUp className="size-3.5 shrink-0" />
          ) : sorted === "desc" ? (
            <ArrowDown className="size-3.5 shrink-0" />
          ) : (
            <ChevronsUpDown className="text-muted-foreground size-3.5 shrink-0" />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {column.getCanSort() && (
          <>
            <DropdownMenuItem onClick={() => column.toggleSorting(false)}>
              <ArrowUp />
              Ascending
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => column.toggleSorting(true)}>
              <ArrowDown />
              Descending
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => column.clearSorting()}>
              <X />
              No sorting
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        {column.getCanFilter() && CRM_FILTER_VARIANTS[column.id] && (
          <>
            <DropdownMenuLabel>Filter</DropdownMenuLabel>
            <ColumnFilter column={column} variant={CRM_FILTER_VARIANTS[column.id]} />
            {column.getFilterValue() !== undefined && (
              <DropdownMenuItem onClick={() => column.setFilterValue(undefined)}>
                <X />
                Clear filter
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
          </>
        )}
        {column.getCanPin() && (
          <>
            <ColumnPinningItems column={column} />
            <DropdownMenuSeparator />
          </>
        )}
        {column.getCanHide() && (
          <>
            <DropdownMenuItem
              disabled={column.getIsFirstColumn()}
              onClick={() => moveColumn(table, column.id, "start")}
            >
              <ChevronsLeft />
              Move to left end
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={column.getIsFirstColumn()}
              onClick={() => moveColumn(table, column.id, "left")}
            >
              <ChevronLeft />
              Move left
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={column.getIsLastColumn()}
              onClick={() => moveColumn(table, column.id, "right")}
            >
              <ChevronRight />
              Move right
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={column.getIsLastColumn()}
              onClick={() => moveColumn(table, column.id, "end")}
            >
              <ChevronsRight />
              Move to right end
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => column.toggleVisibility(false)}>
              <EyeOff />
              Hide column
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ColumnPinningItems({ column }: { column: CrmColumn }) {
  const pinned = column.getIsPinned();

  return (
    <>
      <DropdownMenuItem disabled={pinned === "start"} onClick={() => column.pin("start")}>
        <Pin />
        Pin to left
      </DropdownMenuItem>
      <DropdownMenuItem disabled={pinned === "end"} onClick={() => column.pin("end")}>
        <Pin />
        Pin to right
      </DropdownMenuItem>
      {pinned && (
        <DropdownMenuItem onClick={() => column.pin(false)}>
          <PinOff />
          Unpin
        </DropdownMenuItem>
      )}
    </>
  );
}

function moveColumn(
  table: CrmCoreTable,
  columnId: string,
  direction: "left" | "right" | "start" | "end",
) {
  const order = table.getAllLeafColumns().map((column) => column.id);
  const from = order.indexOf(columnId);
  if (from === -1) return;

  const to =
    direction === "left"
      ? from - 1
      : direction === "right"
        ? from + 1
        : direction === "start"
          ? 0
          : order.length - 1;

  if (to < 0 || to >= order.length || to === from) return;

  const next = [...order];
  next.splice(from, 1);
  next.splice(to, 0, columnId);
  table.setColumnOrder(next);
}
