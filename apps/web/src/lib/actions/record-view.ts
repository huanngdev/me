"use server";

import { createHash } from "node:crypto";
import { revalidateTag } from "next/cache";
import { headers } from "next/headers";

import { db } from "@repo/core/db";
import { pageViews } from "@repo/core/db/schema";
import { getClientIp } from "@repo/core/lib/client-ip";
import { redis } from "@repo/core/lib/redis";
import { VIEWS_CACHE_TAG } from "@repo/core/lib/get-views-data";

const BOT_UA = /bot|crawl|spider|preview|facebookexternalhit|slackbot|discordbot/i;
const DEDUP_TTL_SECONDS = 3600;
const RATE_LIMIT = { max: 20, windowSec: 60 };

export type RecordViewResult =
  | { counted: true }
  | {
      counted: false;
      reason: "dnt" | "bot" | "rate_limit" | "deduped" | "db_error";
    };

export async function recordView(): Promise<RecordViewResult> {
  const h = await headers();

  if (h.get("dnt") === "1") return { counted: false, reason: "dnt" };

  const ua = h.get("user-agent") ?? "";
  if (!ua || BOT_UA.test(ua)) return { counted: false, reason: "bot" };

  const ip = getClientIp(h);

  const rlKey = `view:rl:${ip}`;
  const hits = await redis.incr(rlKey);
  if (hits === 1) await redis.expire(rlKey, RATE_LIMIT.windowSec);
  if (hits > RATE_LIMIT.max) return { counted: false, reason: "rate_limit" };

  const salt = process.env.VIEW_HASH_SALT;
  if (!salt) return { counted: false, reason: "db_error" };
  const hash = createHash("sha256").update(`${ip}|${ua}|${salt}`).digest("hex");
  const dedupKey = `view:dedup:${hash}`;

  const setResult = await redis.set(dedupKey, "1", "EX", DEDUP_TTL_SECONDS, "NX");
  if (setResult !== "OK") return { counted: false, reason: "deduped" };

  try {
    await db.insert(pageViews).values({});
  } catch (err) {
    console.error("[recordView] insert failed:", err);
    return { counted: false, reason: "db_error" };
  }

  revalidateTag(VIEWS_CACHE_TAG, { expire: 0 });
  return { counted: true };
}
