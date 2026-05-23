"use client";

import { useMemo, use } from "react";
import { CalendarDaysIcon, EyeIcon, FlameIcon, TrendingUpIcon } from "lucide-react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "../../chart";
import type { ViewsData } from "../../../lib/get-views-data";

const NUM = new Intl.NumberFormat("en");
const DATE_LABEL = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" });

const config = {
  count: { label: "Views", color: "#e79d2e" },
} satisfies ChartConfig;

const FIELDS = [
  { key: "total", label: "Total", Icon: EyeIcon },
  { key: "today", label: "Today", Icon: TrendingUpIcon },
  { key: "best", label: "Best day", Icon: FlameIcon },
  { key: "days", label: "Days", Icon: CalendarDaysIcon },
] as const satisfies ReadonlyArray<{
  key: keyof Pick<ViewsData, "total" | "today" | "best" | "days">;
  label: string;
  Icon: typeof EyeIcon;
}>;

export function ViewsChart({ data }: { data: Promise<ViewsData> }) {
  const stats = use(data);

  const chartData = useMemo(
    () =>
      stats.series.map((point) => ({
        ...point,
        label: DATE_LABEL.format(new Date(point.date)),
      })),
    [stats.series],
  );

  const hasAny = chartData.some((p) => p.count > 0);

  return (
    <div>
      <dl className="divide-border flex divide-x border-b">
        {FIELDS.map(({ key, label, Icon }) => (
          <div key={label} className="flex flex-1 flex-col items-start gap-1 px-3 py-2 font-mono">
            <dt className="text-muted-foreground flex items-center gap-1.5 text-xs">
              <Icon className="size-3.5" />
              {label}
            </dt>
            <dd className="text-base font-medium tracking-tight tabular-nums">
              {NUM.format(stats[key])}
            </dd>
          </div>
        ))}
      </dl>

      <ChartContainer config={config} className="px-2 py-3 sm:px-4">
        <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={32} />
          <YAxis
            allowDecimals={false}
            tickLine={false}
            axisLine={false}
            width={32}
            tickMargin={4}
            domain={[0, (max: number) => Math.max(1, max)]}
          />
          <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" />} />
          <Line
            dataKey="count"
            type="monotone"
            stroke="var(--color-count)"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ChartContainer>

      {!hasAny && (
        <p className="text-muted-foreground border-t px-4 py-2 text-xs sm:px-6">
          Last 30 days — no views recorded yet.
        </p>
      )}
    </div>
  );
}

export function ViewsChartFallback() {
  return (
    <div>
      <dl className="divide-border flex divide-x border-b">
        {FIELDS.map(({ label, Icon }) => (
          <div key={label} className="flex flex-1 flex-col items-start gap-1 px-3 py-2 font-mono">
            <dt className="text-muted-foreground flex items-center gap-1.5 text-xs">
              <Icon className="size-3.5" />
              {label}
            </dt>
            <dd className="text-muted-foreground text-base font-medium tabular-nums">—</dd>
          </div>
        ))}
      </dl>
      <div className="bg-muted/30 mx-2 my-3 aspect-video animate-pulse rounded-md sm:mx-4" />
    </div>
  );
}
