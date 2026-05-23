import { defineConfig } from "drizzle-kit";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required for drizzle-kit");

export default defineConfig({
  schema: "../../packages/core/src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
