"use client";

import type { KeyboardEvent } from "react";

import { DropdownMenuCheckboxItem } from "@/components/dropdown-menu";
import { Input } from "@/components/input";

import type { CrmColumn } from "./crm-data-table-features";

export type CrmFilterVariant = "text" | "select" | "number" | "date";

export const CRM_FILTER_VARIANTS: Record<string, CrmFilterVariant> = {
  account: "text",
  location: "select",
  website: "text",
  lead: "select",
  team: "select",
  amount: "number",
  stock: "number",
  startDate: "date",
  communication: "select",
  onlinePresence: "select",
  founded: "number",
  founders: "text",
  employees: "number",
  email: "text",
  lastInteraction: "date",
  responseRate: "number",
};

const stopMenuKeyboard = (event: KeyboardEvent) => event.stopPropagation();

export function ColumnFilter({
  column,
  variant,
}: {
  column: CrmColumn;
  variant: CrmFilterVariant;
}) {
  switch (variant) {
    case "text":
      return <TextFilter column={column} />;
    case "select":
      return <SelectFilter column={column} />;
    case "number":
      return <NumberRangeFilter column={column} />;
    case "date":
      return <DateRangeFilter column={column} />;
  }
}

function TextFilter({ column }: { column: CrmColumn }) {
  const value = (column.getFilterValue() as string | undefined) ?? "";

  return (
    <div className="p-1">
      <Input
        value={value}
        placeholder="Contains..."
        className="h-7 text-xs"
        onKeyDown={stopMenuKeyboard}
        onChange={(event) => column.setFilterValue(event.target.value || undefined)}
      />
    </div>
  );
}

function SelectFilter({ column }: { column: CrmColumn }) {
  const selected = (column.getFilterValue() as string[] | undefined) ?? [];
  const values = Array.from(column.getFacetedUniqueValues().entries()).sort((a, b) =>
    String(a[0]).localeCompare(String(b[0])),
  );

  if (values.length === 0) {
    return <p className="text-muted-foreground px-2 py-1.5 text-xs">No values</p>;
  }

  return (
    <div className="max-h-56 overflow-y-auto">
      {values.map(([value, count]) => {
        const label = String(value);

        return (
          <DropdownMenuCheckboxItem
            key={label}
            checked={selected.includes(label)}
            onSelect={(event) => event.preventDefault()}
            onCheckedChange={(checked) => {
              const next = checked
                ? [...selected, label]
                : selected.filter((item) => item !== label);
              column.setFilterValue(next.length > 0 ? next : undefined);
            }}
          >
            <span className="flex-1 truncate">{label}</span>
            <span className="text-muted-foreground tabular-nums">{count}</span>
          </DropdownMenuCheckboxItem>
        );
      })}
    </div>
  );
}

function NumberRangeFilter({ column }: { column: CrmColumn }) {
  const [min, max] = (column.getFilterValue() as [number?, number?] | undefined) ?? [];

  const update = (nextMin: number | undefined, nextMax: number | undefined) => {
    const empty = nextMin === undefined && nextMax === undefined;
    column.setFilterValue(empty ? undefined : [nextMin, nextMax]);
  };

  return (
    <div className="flex items-center gap-1.5 p-1">
      <Input
        type="number"
        value={min ?? ""}
        placeholder="Min"
        className="h-7 text-xs"
        onKeyDown={stopMenuKeyboard}
        onChange={(event) =>
          update(event.target.value === "" ? undefined : Number(event.target.value), max)
        }
      />
      <span className="text-muted-foreground text-xs">to</span>
      <Input
        type="number"
        value={max ?? ""}
        placeholder="Max"
        className="h-7 text-xs"
        onKeyDown={stopMenuKeyboard}
        onChange={(event) =>
          update(min, event.target.value === "" ? undefined : Number(event.target.value))
        }
      />
    </div>
  );
}

function DateRangeFilter({ column }: { column: CrmColumn }) {
  const [from, to] = (column.getFilterValue() as [string?, string?] | undefined) ?? [];

  const update = (nextFrom: string | undefined, nextTo: string | undefined) => {
    const empty = nextFrom === undefined && nextTo === undefined;
    column.setFilterValue(empty ? undefined : [nextFrom, nextTo]);
  };

  return (
    <div className="flex flex-col gap-1.5 p-1">
      <Input
        type="date"
        value={from ?? ""}
        className="h-7 text-xs"
        onKeyDown={stopMenuKeyboard}
        onChange={(event) => update(event.target.value || undefined, to)}
      />
      <Input
        type="date"
        value={to ?? ""}
        className="h-7 text-xs"
        onKeyDown={stopMenuKeyboard}
        onChange={(event) => update(from, event.target.value || undefined)}
      />
    </div>
  );
}
