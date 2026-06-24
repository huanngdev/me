import "server-only";
import IORedis, { type Redis } from "ioredis";

declare global {
  var __redisClient: Redis | undefined;
}

let instance: Redis | undefined;

function getRedis(): Redis {
  if (instance) return instance;
  if (globalThis.__redisClient) return (instance = globalThis.__redisClient);

  const url = process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL is required");

  instance = new IORedis(url, {
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
    lazyConnect: false,
  });
  if (process.env.NODE_ENV !== "production") globalThis.__redisClient = instance;
  return instance;
}

// Lazy proxy so importing this module never opens a socket or throws at build
// time; the client is created on first use (request time).
export const redis: Redis = new Proxy({} as Redis, {
  get(_target, prop: string | symbol) {
    const real = getRedis();
    const value = real[prop as keyof Redis];
    return typeof value === "function" ? value.bind(real) : value;
  },
});
