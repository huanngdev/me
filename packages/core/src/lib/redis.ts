import "server-only";
import IORedis, { type Redis } from "ioredis";

declare global {
  var __redisClient: Redis | undefined;
}

function makeClient(): Redis {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL is required");
  return new IORedis(url, {
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
    lazyConnect: false,
  });
}

export const redis: Redis = globalThis.__redisClient ?? makeClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__redisClient = redis;
}
