import { sql } from "drizzle-orm";
import { boolean, pgTable, text, timestamp, uuid, index } from "drizzle-orm/pg-core";

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

export const blogPosts = pgTable(
  "blog_posts",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    title: text("title").notNull(),
    slug: text("slug").notNull().unique(),
    content: text("content").notNull(),
    excerpt: text("excerpt"),
    tags: text("tags")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    aiGenerated: boolean("ai_generated").notNull().default(false),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("blog_posts_published_at_idx").on(t.publishedAt.desc()),
    index("blog_posts_slug_idx").on(t.slug),
  ],
);
