"use client";

import type { ReactNode } from "react";
import { Globe, Mail, MapPin, TrendingDown, TrendingUp } from "lucide-react";

import { Badge } from "@/components/badge";
import { cn } from "@/lib/utils";

import {
  currencyFormatter,
  dateFormatter,
  dicebearAvatar,
  ONLINE_TONE,
} from "./crm-data-table-format";
import type { CrmCustomer } from "./types";

export function RowDetail({ customer }: { customer: CrmCustomer }) {
  const stockUp = customer.stock.change >= 0;

  return (
    <div className="grid max-w-5xl gap-6 px-4 py-5 sm:px-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:px-8">
      <IdentityColumn customer={customer} />

      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
          <DetailStat label="Amount">{currencyFormatter.format(customer.amount)}</DetailStat>
          <DetailStat label="Employees">{customer.employees}</DetailStat>
          <DetailStat label="Stock">
            <span
              className={cn(
                "inline-flex items-center gap-1 tabular-nums",
                stockUp
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-red-600 dark:text-red-400",
              )}
            >
              {stockUp ? (
                <TrendingUp className="size-3.5" aria-hidden="true" />
              ) : (
                <TrendingDown className="size-3.5" aria-hidden="true" />
              )}
              {stockUp ? "+" : ""}
              {customer.stock.change.toFixed(2)}%
            </span>
          </DetailStat>
          <DetailStat label="Response rate">
            <div className="flex items-center gap-2">
              <span className="tabular-nums">{customer.responseRate}%</span>
              <span className="bg-muted hidden h-1 w-12 overflow-hidden rounded-full sm:block">
                <span
                  className="bg-primary block h-full rounded-full"
                  style={{ width: `${customer.responseRate}%` }}
                />
              </span>
            </div>
          </DetailStat>
        </div>

        <div className="border-border/60 grid gap-x-6 gap-y-4 border-t pt-4 sm:grid-cols-2 lg:grid-cols-3">
          <DetailField label="Lead">{customer.lead}</DetailField>
          <DetailField label="Founders">{customer.founders}</DetailField>
          <DetailField label="Founded">{customer.founded}</DetailField>
          <DetailField label="Start date">
            {dateFormatter.format(new Date(customer.startDate))}
          </DetailField>
          <DetailField label="Last interaction">
            {dateFormatter.format(new Date(customer.lastInteraction))}
          </DetailField>
          <DetailField label="Categories" truncate={false}>
            {customer.categories.length > 0 ? (
              <span className="flex flex-wrap gap-1.5">
                {customer.categories.map((category) => (
                  <span
                    key={category}
                    className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[11px] font-normal"
                  >
                    {category}
                  </span>
                ))}
              </span>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </DetailField>
        </div>
      </div>
    </div>
  );
}

function IdentityColumn({ customer }: { customer: CrmCustomer }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- DiceBear SVG avatar */}
        <img
          src={dicebearAvatar(customer.account, 80)}
          alt=""
          width={40}
          height={40}
          loading="lazy"
          decoding="async"
          className="bg-muted size-10 shrink-0 rounded-xl"
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold tracking-tight">{customer.account}</p>
          <a
            href={`https://${customer.website}`}
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs transition-colors"
          >
            <Globe className="size-3 shrink-0" aria-hidden="true" />
            <span className="truncate">{customer.website}</span>
          </a>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="secondary">{customer.team}</Badge>
        <Badge variant="outline">{customer.communication}</Badge>
        <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
          <span
            className={cn("size-1.5 rounded-full", ONLINE_TONE[customer.onlinePresence])}
            aria-hidden="true"
          />
          {customer.onlinePresence}
        </span>
      </div>

      <div className="text-muted-foreground flex flex-col gap-1.5 text-xs">
        <span className="inline-flex items-center gap-1.5">
          <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
          {customer.location}
        </span>
        <a
          href={`mailto:${customer.email}`}
          className="hover:text-foreground inline-flex items-center gap-1.5 transition-colors"
        >
          <Mail className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{customer.email}</span>
        </a>
      </div>
    </div>
  );
}

function DetailStat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-muted-foreground font-mono text-[10px] tracking-wider uppercase">
        {label}
      </p>
      <div className="mt-1.5 text-sm font-medium">{children}</div>
    </div>
  );
}

function DetailField({
  label,
  children,
  truncate = true,
}: {
  label: string;
  children: ReactNode;
  truncate?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="text-muted-foreground text-[11px]">{label}</p>
      <div className={cn("mt-0.5 text-sm", truncate && "truncate")}>{children}</div>
    </div>
  );
}
