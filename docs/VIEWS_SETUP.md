# Page-View Counter — Setup

The feature uses Drizzle ORM against a Postgres `DATABASE_URL` and `ioredis` against a TCP `REDIS_URL`. The write path is a Next.js **Server Action** (`recordView`) — no public HTTP endpoint, no CORS surface, no browser-side service credentials.

## 1. Env

Copy `apps/web/.env.example` → `apps/web/.env` and fill in:

```
DATABASE_URL=postgres://user:password@host:5432/dbname
REDIS_URL=redis://default:password@host:6379
VIEW_HASH_SALT=<openssl rand -hex 32>
```

Generate the salt:

```bash
openssl rand -hex 32
```

## 2. Run migrations

From `apps/web/`:

```bash
bun run db:migrate
```

That applies `src/db/migrations/0000_init_page_views.sql`, which creates:

```sql
CREATE TABLE "page_views" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "viewed_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX "page_views_viewed_at_idx"
  ON "page_views" ("viewed_at" DESC NULLS LAST);
```

Need a fresh migration after a schema change?

```bash
bun run db:generate   # diffs schema.ts → new SQL file in src/db/migrations
bun run db:migrate    # applies pending migrations
bun run db:studio     # open Drizzle Studio in the browser
```

## 3. Verify

```bash
bun dev
```

Open `http://localhost:3000`:

1. **First load** — open devtools, "Network" panel, filter to `record-view`. The Server Action POST (under `/`) returns `{ counted: true }`. The chart re-fetches and the total goes up by one.
2. **Refresh within an hour** — same action returns `{ counted: false, reason: "deduped" }`. No new row, total stays put.
3. **Reset dedup** — `redis-cli -u "$REDIS_URL" KEYS 'view:dedup:*' | xargs redis-cli -u "$REDIS_URL" DEL` (or wait an hour). Refresh → counts again.
4. **Bot UA** — change your UA to `Googlebot/2.1` in devtools and reload → `{ counted: false, reason: "bot" }`.
5. **Rate limit** — call `recordView()` >20× from the same IP in one minute → `{ counted: false, reason: "rate_limit" }`.
6. **DNT** — send `DNT: 1` via devtools "Privacy → Send Do Not Track" → `{ counted: false, reason: "dnt" }`.
7. **DB check** — `psql "$DATABASE_URL" -c 'select count(*) from page_views;'` matches the displayed total.

## 4. How dedup works

```
hash = sha256(ip + "|" + user_agent + "|" + VIEW_HASH_SALT)
redis SET view:dedup:<hash> 1 EX 3600 NX
```

- `NX` = set only if not already there. If the key existed, the visitor was already counted in the last hour, and we skip the insert.
- TTL 3600s = 1 hour. After it expires the same browser counts as +1 again.
- The salt makes the stored key irreversible.
- Nothing personal lands in Postgres — only `id` and `viewed_at`.

## 5. Why server actions instead of an API route

- **No public HTTP surface.** The action is invoked over Next's internal RSC RPC, same-origin only by default. No CORS to maintain.
- **Secrets never leave the server.** No Supabase anon key shipped to the browser, no Upstash REST tokens.
- **Trivial to call.** A client component imports `recordView` and `await`s it — Next handles serialization.

The trade-off: there's no browser-side Realtime subscription, so other visitors' views don't tick in live for you. The chart shows what was true at last server fetch (revalidating every 60s, or immediately when _you_ record a view via `router.refresh()`).

If you later want live updates, add polling in `views-chart.tsx` (`setInterval(() => router.refresh(), 30_000)`) — still purely server-action / RSC-driven.

## Production (Vercel)

- Set `DATABASE_URL`, `REDIS_URL`, `VIEW_HASH_SALT` in project settings.
- The `client-ip` helper trusts `x-forwarded-for` only when `process.env.VERCEL === "1"` (Vercel injects this).
- Migrations are not part of `next build`. Run `bun run db:migrate` from CI or a one-off shell after each deploy that ships a new migration.
