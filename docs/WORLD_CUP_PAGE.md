# World Cup 2026 Page — Plan

A standalone `/world-cup` page showing the FIFA World Cup 2026 (Canada · USA · Mexico,
11 Jun – 19 Jul 2026): live scores, group standings, the full fixture schedule, and the
knockout bracket. Built to the same bar as the rest of the site — static-first,
server-rendered, Lighthouse ≥ 95, no layout shift, minimal secrets, English-only.

This is a **separate page** (like `/stats`, `/components`), not a homepage section. The
portfolio flow on `/` stays untouched.

---

## 1. Data source — research & decision

The brief was "best **live**, **open**, and **free** API." No single free source is great at
all three, so the plan uses a **hybrid**: a public-domain dataset for the static backbone and
a free-tier API for the live layer.

### Options evaluated

| Source                                         | API key    | Live scores                           | Free limit                 | License / notes                                              |
| ---------------------------------------------- | ---------- | ------------------------------------- | -------------------------- | ------------------------------------------------------------ |
| **openfootball/worldcup.json**                 | none       | No — wiki-style, updated ~daily       | unlimited (static files)   | Public domain. Has the 2026 edition.                         |
| **football-data.org**                          | free token | Near-live (poll the matches endpoint) | **10 req/min**             | Free tier covers the World Cup (`WC`). No deep player stats. |
| **API-Football** (api-sports.io)               | free key   | Yes, ~15s updates                     | **100 req/day**            | Richest free data + free embed widgets. Hard daily cap.      |
| **TheSportsDB**                                | test key   | 2-min livescores behind $9/mo Patreon | crowd-sourced              | Great team badges/artwork on the free tier.                  |
| **worldcup26.ir** (rezarahiminia/worldcup2026) | free JWT   | Claims real-time during tournament    | 500 req/min, self-hostable | ISC, open-source, but solo-maintained → uptime risk.         |

### Decision

- **Backbone (build-time + ISR): `openfootball/worldcup.json`.** No key, public domain, no rate
  limit. Gives the schedule, 12 groups, 48 teams, completed results, and the knockout scaffold.
  It is also the **fallback** if the live API is down or quota-exhausted — the page is never blank.
  - Raw URL: `https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json`
  - Fields: `round`, `date`, `time`, `team1`, `team2`, `score.ft`, `score.ht`,
    `goals1[]`/`goals2[]` (player + minute), `group`, `ground`.

- **Live layer: `football-data.org`.** Chosen over API-Football because **10 req/min** supports a
  real polling cadence, whereas 100 req/day is exhausted in minutes of live polling. Used only for
  in-play scores and live standings, fetched server-side behind ISR.
  - `GET https://api.football-data.org/v4/competitions/WC/matches` (filter `?status=LIVE` / `?dateFrom&dateTo`)
  - `GET https://api.football-data.org/v4/competitions/WC/standings`
  - `GET https://api.football-data.org/v4/competitions/WC/teams`
  - Auth header: `X-Auth-Token: <FOOTBALL_DATA_TOKEN>`

- **Alternative, swappable:** API-Football (`league=1&season=2026`, header `x-apisports-key`) if we
  later want richer events/lineups or their drop-in widgets. The data layer is written behind an
  adapter (§5) so the live provider can be swapped without touching the UI.

---

## 2. Architecture

```
openfootball/worldcup.json ──┐  (build-time + daily ISR)
                             ├─► normalize() ─► typed WorldCup model ─► RSC page (static shell)
football-data.org ───────────┘  (ISR, short revalidate only during match windows)
                                            │
                                            └─► <LiveScores> client island polls a route handler
```

- **Static shell** (groups grid, schedule, bracket scaffold, finished results) is server-rendered
  from the openfootball dataset. This is what loads instantly and what SEO/crawlers see.
- **Live overlay** (in-play minute + score, live standings) is merged in server-side via ISR and
  refreshed client-side by a small polling island **only on this page**, matching the site rule:
  no client-side fetching on initial load except deliberate, isolated live widgets.

---

## 3. Routes & files

```
apps/web/src/app/world-cup/
  page.tsx              # RSC: fetch + normalize + compose sections, export metadata
  loading.tsx           # skeleton matching final layout (no CLS)
  opengraph-image.tsx   # @vercel/og branded card "World Cup 2026"

apps/web/src/app/api/world-cup/live/route.ts
                        # GET route handler the client island polls; server holds the token,
                        # returns only live fixtures. revalidate/cache headers set here.

apps/web/src/lib/worldcup/
  types.ts              # Team, Group, Match, Standing, Stage, MatchStatus
  openfootball.ts       # fetch + normalize the public-domain dataset (backbone + fallback)
  football-data.ts      # fetch live matches/standings (provider adapter)
  index.ts              # getWorldCup(): merge backbone + live, dedupe, return typed model

packages/core/src/components/layouts/world-cup/
  world-cup-hero.tsx        # title, host flags, tournament dates, countdown / "LIVE now" pill
  live-matches.tsx          # client island: in-play matches, pulsing live dot, polls the route
  group-standings.tsx       # 12 groups (A–L) as a responsive grid of mini standings tables
  fixtures-list.tsx         # schedule grouped by matchday/date, mono kickoff times (user TZ)
  knockout-bracket.tsx      # R32 → R16 → QF → SF → Final, horizontal scroll on mobile
  match-row.tsx             # shared row: flags, names, score/kickoff, status badge
  team-flag.tsx             # FIFA-code → flag (local SVG set, explicit dims, no CLS)
```

Add `/world-cup` to the `⌘K` command palette (`command-palette.tsx`) and, if it should be
discoverable from the nav, a link there. (Not the homepage TOC — that maps to `/` sections only.)

---

## 4. Data model (typed, provider-agnostic)

```ts
type MatchStatus = "scheduled" | "live" | "finished" | "postponed";
type Stage = "group" | "r32" | "r16" | "qf" | "sf" | "third" | "final";

interface Team {
  fifaCode: string;
  name: string;
  group?: string;
  flagUrl: string;
}
interface Match {
  id: string;
  stage: Stage;
  group?: string;
  kickoff: string; // ISO 8601 UTC
  status: MatchStatus;
  minute?: number;
  home: Team;
  away: Team;
  score?: { home: number; away: number; ht?: { home: number; away: number } };
  venue?: string;
}
interface Standing {
  team: Team;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
}
interface GroupTable {
  group: string;
  standings: Standing[];
}
interface WorldCup {
  teams: Team[];
  groups: GroupTable[];
  matches: Match[];
  lastUpdated: string;
}
```

`getWorldCup()` returns the backbone immediately and merges live fields when the live fetch
succeeds; on live failure it returns the backbone alone (degraded, never broken).

---

## 5. Live strategy & rate-limit handling

- **ISR on the page**: `export const revalidate = 86400` (daily) for the static backbone.
- **Route handler `/api/world-cup/live`**: server-side fetch to football-data.org with
  `next: { revalidate: 30 }` so multiple visitors share one upstream call per 30 s — this keeps
  us comfortably under 10 req/min regardless of traffic.
- **Client polling island**: `setInterval(() => mutate(), 30_000)` (or `router.refresh()`),
  **only while there is at least one live match**; otherwise it doesn't poll at all.
- **Respect `prefers-reduced-motion`**: the live pulse animation degrades to a static dot.
- **Token stays server-side** — never shipped to the browser; the client only ever calls our own
  route handler. (Same posture as the views Server Action in `VIEWS_SETUP.md`.)

---

## 6. Design language (match the site)

- Container: `mx-auto w-full max-w-4xl border-x`, section header `border-b px-4 py-4 … text-xl font-semibold`.
- Mono font for kickoff times, minutes, and scores; sans for names. Violet accent used sparingly
  (live pill, current matchday marker). Flat surfaces, single-pixel borders, dark mode first-class.
- **Live indicator**: small violet dot with a gentle pulse + `LIVE 67'`. Finished = muted score.
  Scheduled = mono kickoff in the visitor's local timezone.
- **Groups**: responsive grid (1 col mobile → 2 → 3) of compact tables, qualifying positions
  subtly tinted (top-2 advance).
- **Bracket**: horizontal columns per round; on mobile it scrolls inside its own
  `overflow-x-auto` container so the page body never scrolls sideways.
- **Motion**: reuse `Reveal` / `StaggerList`; rows rise 8–12px on scroll-in, `once: true`.
  Nothing loops purely for decoration.

---

## 7. SEO & metadata

- `export const metadata` with unique title/description + Open Graph block.
- `opengraph-image.tsx` via `@vercel/og` — "FIFA World Cup 2026" on the branded card.
- Add `/world-cup` to `sitemap.xml` and mention it in `llms.txt`.

---

## 8. Env & secrets

`apps/web/.env.example` (and Vercel project settings):

```
FOOTBALL_DATA_TOKEN=<free token from football-data.org/client/register>
```

No key is needed for the openfootball backbone. The optional API-Football path would add
`API_FOOTBALL_KEY` instead.

---

## 9. Implementation phases

1. **Backbone (static, shippable on its own).** Types + `openfootball.ts` normalizer; page with
   hero, group standings, fixtures, bracket; loading skeleton; metadata + OG image; palette entry.
   No secrets, no live calls. This already delivers a complete, useful page.
2. **Live layer.** `football-data.ts` adapter, `/api/world-cup/live` route handler, `<LiveMatches>`
   polling island, live merge in `getWorldCup()`, live standings.
3. **Polish.** Countdown when no match is live, "today's matches" emphasis, team flag set,
   reduced-motion checks, Lighthouse pass, timezone formatting QA.

Phase 1 is a clean stopping point if we want to ship before wiring live data.

---

## 10. Risks & fallbacks

- **Live API down / quota hit** → page falls back to the openfootball backbone automatically.
- **openfootball lag** (updated ~daily) → live layer covers in-play freshness during phase 2.
- **Flag assets** → bundle a local FIFA-code → SVG set (explicit dimensions) to avoid CLS and
  third-party image requests.
- **Provider lock-in** → avoided: UI depends only on the typed model in §4; swapping live
  providers is one adapter file.

---

## 11. Open decisions (defaults assumed unless you say otherwise)

- Route is `/world-cup` (kebab, consistent with the rest of the app).
- Ship **phase 1 static first**, add live in phase 2.
- Live provider: **football-data.org** (swap to API-Football if we want widgets/richer events).

---

## Sources

- [openfootball/worldcup.json](https://github.com/openfootball/worldcup.json) — public-domain dataset (incl. 2026)
- [football-data.org](https://www.football-data.org/) · World Cup matches: `…/v4/competitions/WC/matches`
- [API-Football — World Cup 2026 guide](https://www.api-football.com/news/post/fifa-world-cup-2026-guide-to-using-data-with-api-sports) (`league=1&season=2026`)
- [TheSportsDB free API](https://www.thesportsdb.com/free_sports_api)
- [rezarahiminia/worldcup2026](https://github.com/rezarahiminia/worldcup2026) — open-source WC2026 API (`worldcup26.ir`)
- [Best Football APIs in 2026 — Highlightly](https://highlightly.net/blogs/best-football-apis-in-2026)
- [Best World Cup 2026 APIs — TheStatsAPI](https://www.thestatsapi.com/blog/best-world-cup-2026-apis)
