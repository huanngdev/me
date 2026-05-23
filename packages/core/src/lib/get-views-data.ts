import "server-only";
import { sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";

import { db } from "../db";
import { pageViews } from "../db/schema";

export type ViewsData = {
  total: number;
  today: number;
  best: number;
  days: number;
  series: Array<{ date: string; count: number }>;
};

const EMPTY: ViewsData = { total: 0, today: 0, best: 0, days: 0, series: [] };
const WINDOW_DAYS = 30;

export const VIEWS_CACHE_TAG = "views";

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function buildWindow(): Array<{ date: string; count: number }> {
  const out: Array<{ date: string; count: number }> = [];
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  for (let i = WINDOW_DAYS - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(today.getUTCDate() - i);
    out.push({ date: isoDay(d), count: 0 });
  }
  return out;
}

async function fetchViewsData(): Promise<ViewsData> {
  try {
    const rows = await db
      .select({
        day: sql<string>`to_char(date_trunc('day', ${pageViews.viewedAt}), 'YYYY-MM-DD')`,
        count: sql<number>`count(*)::int`,
      })
      .from(pageViews)
      .groupBy(sql`1`)
      .orderBy(sql`1`);

    const byDay = new Map(rows.map((r) => [r.day, r.count]));

    const total = rows.reduce((sum, r) => sum + r.count, 0);
    const days = rows.length;
    const best = rows.reduce((max, r) => (r.count > max ? r.count : max), 0);

    const window = buildWindow();
    const windowStartISO = window[0]?.date ?? "";
    const todayISO = window[window.length - 1]?.date ?? "";

    // Cumulative starting offset = all views recorded before the window starts.
    const preWindow = rows
      .filter((r) => r.day < windowStartISO)
      .reduce((sum, r) => sum + r.count, 0);

    let running = preWindow;
    const series = window.map((bucket) => {
      running += byDay.get(bucket.date) ?? 0;
      return { date: bucket.date, count: running };
    });

    const today = byDay.get(todayISO) ?? 0;

    return { total, today, best, days, series };
  } catch {
    return EMPTY;
  }
}

export const getViewsData = unstable_cache(fetchViewsData, ["views-data"], {
  revalidate: 60,
  tags: [VIEWS_CACHE_TAG],
});
