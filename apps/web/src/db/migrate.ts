import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");

  const client = postgres(url, { max: 1, prepare: false });
  const db = drizzle(client);

  await migrate(db, { migrationsFolder: "./src/db/migrations" });
  await client.end();
  // eslint-disable-next-line no-console
  console.log("✓ migrations applied");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
