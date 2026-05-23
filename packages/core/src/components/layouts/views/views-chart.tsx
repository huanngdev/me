"use client";

import { useMemo, use, useState } from "react";
import { CalendarDaysIcon, EyeIcon, FlameIcon, TrendingUpIcon } from "lucide-react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "../../chart";
import type { ViewsData } from "../../../lib/get-views-data";

import { SeedButton } from "./seed-button";

const NUM = new Intl.NumberFormat("en");
const DATE_LABEL = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" });
const IS_DEV = process.env.NODE_ENV === "development";
const WINDOW_DAYS = 30;

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

function generateSeed(): ViewsData {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const dailyDeltas = Array.from({ length: WINDOW_DAYS }, () =>
    Math.random() < 0.65 ? Math.floor(Math.random() * 6) + 1 : 0,
  );

  let running = 0;
  const series = dailyDeltas.map((delta, i) => {
    const d = new Date(today);
    d.setUTCDate(today.getUTCDate() - (WINDOW_DAYS - 1 - i));
    running += delta;
    return { date: d.toISOString().slice(0, 10), count: running };
  });

  return {
    total: running,
    today: dailyDeltas[WINDOW_DAYS - 1] ?? 0,
    best: Math.max(...dailyDeltas, 0),
    days: dailyDeltas.filter((v) => v > 0).length,
    series,
  };
}

function ChartHeader({
  seeded,
  onSeed,
  onReset,
}: {
  seeded: boolean;
  onSeed: () => void;
  onReset: () => void;
}) {
  return (
    <div className="flex items-center justify-between border-b px-4 py-4 sm:px-6 sm:py-5 lg:px-8">
      <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">Portfolio Views</h2>
      {IS_DEV && <SeedButton seeded={seeded} onSeed={onSeed} onReset={onReset} />}
    </div>
  );
}

export function ViewsChart({ data }: { data: Promise<ViewsData> }) {
  const real = use(data);
  const [seed, setSeed] = useState<ViewsData | null>(null);
  const stats = seed ?? real;

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
      <ChartHeader
        seeded={seed !== null}
        onSeed={() => setSeed(generateSeed())}
        onReset={() => setSeed(null)}
      />

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
      <div className="flex items-center justify-between border-b px-4 py-4 sm:px-6 sm:py-5 lg:px-8">
        <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">Portfolio Views</h2>
      </div>
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
