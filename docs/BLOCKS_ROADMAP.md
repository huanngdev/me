# Blocks & Components Roadmap

A backlog of **library + shadcn/ui** pairings to build next for `/components` and `/blocks`. Each entry takes a proven headless library and gives it a shadcn look and an install command. Existing examples:

| Shipped                 | Library                          | Type      |
| ----------------------- | -------------------------------- | --------- |
| Notion-like Editor      | Plate (`platejs`), also `richcn` | Block     |
| CRM Data Table          | TanStack Table                   | Block     |
| Zod Data Table          | TanStack Table + Zod             | Component |
| Video / Audio Player    | Vidstack (+ hls.js, dash.js)     | Component |
| GitHub Contributions 3D | React Three Fiber + drei         | Component |
| Tags Input              | shadcn primitives                | Component |
| Scroll Minimap          | shadcn primitives                | Component |
| Tile Treemap            | custom layout                    | Component |
| CLI Command             | shadcn Tabs                      | Component |
| Error Page              | none                             | Block     |

## Selection rules

An item belongs here only if it meets all of these:

1. **The library is headless or themeable.** shadcn tokens (`bg-background`, `border`, `text-muted-foreground`) must style it fully in light and dark mode. Skip libraries whose CSS fights Tailwind.
2. **It installs with `shadcn add`.** It ships as a registry item (`scripts/registry/items.ts`), and `bun run registry:check` passes.
3. **The license allows it.** Use MIT, Apache 2.0, or ISC. Avoid watermarks and commercial licenses, and note them when unavoidable.
4. **It does more than the official shadcn example.** If ui.shadcn.com already ships the same thing, ours needs a clear extra, such as virtualization, persistence, or a real data flow.
5. **It is SSR-safe.** It renders on the server or lazy-loads behind `next/dynamic` with a skeleton. No layout shift.

## Tiers

- **Tier 0: quick wins.** The dependency is already in `packages/core/package.json`.
- **Tier 1: high impact.** It needs a new dependency, and it is the kind of demo people share.
- **Tier 2: nice to have.** It fills out the catalog.

Effort uses this scale: **S** is under a day, **M** is 2–4 days, and **L** is a week or more.

---

## Tier 0: dependencies already installed

| #    | Name                     | Library                         | Type      | Effort | What makes it stand out                                                                                                    |
| ---- | ------------------------ | ------------------------------- | --------- | ------ | -------------------------------------------------------------------------------------------------------------------------- |
| 0.1  | Kanban Board             | `@dnd-kit/core`                 | Block     | M      | Drag between columns, keyboard dragging, WIP limits, and persistence through an adapter, the same pattern as richcn        |
| 0.2  | File Tree                | `@headless-tree/react`          | Component | S      | Rename, drag to move, multi-select, and lazy children. Promotes the internal `block-file-explorer` into a public component |
| 0.3  | Date Range Picker        | `react-day-picker` + `date-fns` | Component | S      | Presets (last 7 days, this quarter), two-month view, and a time zone label                                                 |
| 0.4  | Mail / Inbox Layout      | `react-resizable-panels`        | Block     | M      | Three resizable panes with saved sizes, a collapsible sidebar, and keyboard navigation through the list                    |
| 0.5  | Code Block Pro           | `shiki`                         | Component | S      | Filename tabs, line highlights, diff (`+`/`-`), word wrap toggle, and a copy button. Reuses the CLI Command styling        |
| 0.6  | Math Input               | `katex`                         | Component | S      | Live LaTeX preview next to the input, with an error state for invalid TeX                                                  |
| 0.7  | Image Gallery + Lightbox | `embla-carousel-react`          | Component | M      | Thumbnail strip, fullscreen lightbox, swipe, and zoom. Can replace the project gallery                                     |
| 0.8  | Spotlight Command Menu   | `cmdk`                          | Block     | S      | Extracts the site's ⌘K palette: grouped results, nested pages, recent items, and actions                                   |
| 0.9  | OTP Sign-in              | `input-otp`                     | Block     | S      | Email → OTP → done flow with resend countdown, paste support, and error shake                                              |
| 0.10 | Notification Center      | `sonner` + Popover              | Component | S      | Inbox popover with unread badges and mark-all-read, with toasts that land in the inbox                                     |
| 0.11 | Visitor Dotted Map       | `svg-dotted-map`                | Component | S      | Pins with pulse markers and a tooltip per city. Theme-aware dots                                                           |
| 0.12 | Responsive Dialog        | `vaul` + Dialog                 | Component | S      | Dialog on desktop, drawer on mobile, with one API                                                                          |

## Tier 1: high impact, new dependency

| #    | Name                  | Library                                               | Type      | Effort | What makes it stand out                                                                                                     |
| ---- | --------------------- | ----------------------------------------------------- | --------- | ------ | --------------------------------------------------------------------------------------------------------------------------- |
| 1.1  | AI Chat               | Vercel AI SDK (`ai`, `@ai-sdk/react`)                 | Block     | M      | Streaming markdown, tool-call cards, attachments, stop/regenerate, and a model picker. Runs in demo mode without an API key |
| 1.2  | Workflow Builder      | React Flow (`@xyflow/react`)                          | Block     | L      | Node palette, typed handles, auto-layout (`elkjs` or `dagre`), minimap, and export to JSON                                  |
| 1.3  | Form Builder          | `react-hook-form` + Zod + `@dnd-kit`                  | Block     | L      | Drag fields onto a canvas, edit the schema live, and preview the real form. Builds on WalForm experience                    |
| 1.4  | Event Calendar        | `date-fns` + `@dnd-kit` (custom)                      | Block     | L      | Month, week, and day views, with drag to move, resize to change duration, and overlap layout                                |
| 1.5  | Virtualized Data Grid | TanStack Table + TanStack Virtual                     | Block     | M      | 100k rows at 60fps, inline cell editing, column pinning, and copy/paste of ranges                                           |
| 1.6  | Collaborative richcn  | Yjs + `@platejs/yjs` (see `REALTIME_COLAB_CURSOR.md`) | Block     | L      | Two tabs editing one document with live cursors and presence. Turns richcn into a multiplayer editor                        |
| 1.7  | Sui Wallet Kit        | `@mysten/dapp-kit`                                    | Component | M      | Connect button, account dropdown, balance, and a network switcher in shadcn style. Ties to the Sui/Walrus background        |
| 1.8  | Code Editor           | CodeMirror 6 (`@uiw/react-codemirror`)                | Component | M      | shadcn theme for light and dark, language switch, and a vim toggle                                                          |
| 1.9  | File Upload           | `react-dropzone`                                      | Component | S      | Dropzone, per-file progress, previews, retry, and a validation list. Includes a mock uploader for the demo                  |
| 1.10 | Analytics Dashboard   | Recharts (shadcn charts) + TanStack Table             | Block     | M      | KPI tiles, a date range filter (0.3), linked charts and table, and a CSV export. Goes beyond the shadcn chart examples      |

## Tier 2: nice to have

| #    | Name              | Library                                     | Type      | Effort | Notes                                                                      |
| ---- | ----------------- | ------------------------------------------- | --------- | ------ | -------------------------------------------------------------------------- |
| 2.1  | Audio Waveform    | `wavesurfer.js`                             | Component | S      | Waveform scrubbing for the existing Audio Player                           |
| 2.2  | Image Cropper     | `react-easy-crop`                           | Component | S      | Avatar upload with round crop and zoom; pairs with File Upload             |
| 2.3  | Color Picker      | `react-colorful`                            | Component | S      | HEX/RGB/OKLCH inputs, saved swatches, and an eyedropper where supported    |
| 2.4  | Phone Input       | `react-phone-number-input`                  | Component | S      | Country select through shadcn Command, with validation                     |
| 2.5  | Emoji Picker      | `frimousse`                                 | Component | S      | Unstyled by design, so shadcn styling fits                                 |
| 2.6  | PDF Viewer        | `react-pdf`                                 | Component | M      | Thumbnails sidebar, zoom, and page jump. Lazy-load the worker              |
| 2.7  | Web Terminal      | `@xterm/xterm`                              | Component | M      | Themed terminal with a scripted demo session                               |
| 2.8  | Map Store Locator | `maplibre-gl`                               | Block     | M      | List and map in sync, with clustering. Use free OSM tiles                  |
| 2.9  | Mermaid Diagram   | `mermaid`                                   | Component | S      | Renders fenced diagrams with theme sync. Could also become a richcn plugin |
| 2.10 | Product Tour      | `driver.js`                                 | Component | S      | Step-by-step onboarding highlight with shadcn popovers                     |
| 2.11 | Checkout          | Stripe Elements (`@stripe/react-stripe-js`) | Block     | M      | Elements Appearance API mapped to shadcn tokens. Runs in test mode only    |
| 2.12 | Whiteboard        | `@excalidraw/excalidraw`                    | Block     | M      | MIT license. Theme sync only; heavy bundle, so it must lazy-load           |

Avoid `tldraw` for public blocks: its license requires a watermark or a paid key.

---

## Suggested order

Build order trades attention per hour against reuse:

1. **0.1 Kanban Board**: fast, visual, and the persistence adapter pattern from richcn carries over.
2. **1.1 AI Chat**: the most-searched block type in 2026.
3. **0.5 Code Block Pro** + **0.2 File Tree**: small, and they improve the site's own docs pages.
4. **1.2 Workflow Builder**: the flagship demo after richcn.
5. **1.7 Sui Wallet Kit**: a niche nobody else in the shadcn ecosystem covers well.
6. **1.5 Virtualized Data Grid**: an upgrade path for the CRM table.
7. **1.6 Collaborative richcn**: turns the flagship into multiplayer.

## Definition of done for each item

Follow `.agents/skills/build-components-page` and `docs/CODE_RULES.md`. An item is done when:

- [ ] Source lives in `packages/core/src/components/<slug>/` (component) or `packages/core/src/components/blocks/<slug>/` (block).
- [ ] The demo page `apps/web/src/app/{components|blocks}/<slug>/page.tsx` has a demo, install steps (`CliCommand`), usage, and an API table.
- [ ] The registry entry is added in `scripts/registry/items.ts`, `bun run registry` is run, and `bun run registry:check` passes.
- [ ] The list entry is added to `COMPONENT_LIST` or `BLOCK_LIST`. The homepage showcase picks it up automatically.
- [ ] `bun run llms` is regenerated and `bun run llms:check` passes.
- [ ] It works in light and dark mode, at 390px, by keyboard only, and with `prefers-reduced-motion`.
- [ ] Heavy libraries (three, xyflow, codemirror, excalidraw, pdf) load through `next/dynamic` with a skeleton.
- [ ] `format:check`, `lint`, `check-types`, and `build` pass.
- [ ] The snapshot image is left to the owner. Workers never regenerate `apps/web/public/images`.
