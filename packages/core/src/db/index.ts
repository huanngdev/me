import "server-only";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

declare global {
  // Reuse the client across HMR reloads in dev so we don't pile up open sockets.
  var __db: PostgresJsDatabase<typeof schema> | undefined;
}

let instance: PostgresJsDatabase<typeof schema> | undefined;

function getDb(): PostgresJsDatabase<typeof schema> {
  if (instance) return instance;
  if (globalThis.__db) return (instance = globalThis.__db);

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");

  instance = drizzle(postgres(url, { max: 5, prepare: false }), { schema });
  if (process.env.NODE_ENV !== "production") globalThis.__db = instance;
  return instance;
}

// Lazy proxy: the client is built on first query, not at import time. This lets
// `next build` collect page data without DATABASE_URL set — the queries that run
// during static generation are wrapped in try/catch and degrade to empty data.
export const db = new Proxy({} as PostgresJsDatabase<typeof schema>, {
  get(_target, prop: string | symbol) {
    const real = getDb();
    const value = real[prop as keyof PostgresJsDatabase<typeof schema>];
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export { schema };
