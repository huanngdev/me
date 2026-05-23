import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

declare global {
  // Reuse the client across HMR reloads in dev so we don't pile up open sockets.
  var __pgClient: ReturnType<typeof postgres> | undefined;
}

function makeClient() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  return postgres(url, { max: 5, prepare: false });
}

const client = globalThis.__pgClient ?? makeClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__pgClient = client;
}

export const db = drizzle(client, { schema });
export { schema };
