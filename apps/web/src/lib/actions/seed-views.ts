"use server";

import { revalidateTag } from "next/cache";

import { db } from "@repo/core/db";
import { pageViews } from "@repo/core/db/schema";
import { VIEWS_CACHE_TAG } from "@repo/core/lib/get-views-data";

const WINDOW_DAYS = 30;
const SEED_COUNT = 60;

export async function seedViews(): Promise<{ inserted: number }> {
  if (process.env.NODE_ENV !== "development") {
    return { inserted: 0 };
  }

  const now = Date.now();
  const rows = Array.from({ length: SEED_COUNT }, () => {
    const daysAgo = Math.random() * WINDOW_DAYS;
    return { viewedAt: new Date(now - daysAgo * 86_400_000) };
  });

  await db.insert(pageViews).values(rows);
  revalidateTag(VIEWS_CACHE_TAG, { expire: 0 });
  return { inserted: SEED_COUNT };
}
