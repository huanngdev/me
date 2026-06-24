import { sql } from "drizzle-orm";
import { pgTable, timestamp, uuid, index } from "drizzle-orm/pg-core";

export const pageViews = pgTable(
  "page_views",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    viewedAt: timestamp("viewed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("page_views_viewed_at_idx").on(t.viewedAt.desc())],
);
