---
title: Projects
updated: 2026-09-03
---

# Projects

Ordered for the public page: **hackathon work first, then everything else.** Hackathon projects are the strongest proof-of-shipping signal for an early-career portfolio — they prove Ngô Gia Huấn can ship under pressure, on unfamiliar stacks, against deadlines.

> **CLAUDE.md correction:** the SealPass and AfterVault projects referenced in CLAUDE.md were placeholder names. The real hackathon projects are below.

---

## 1. WalForm — _featured / hero project_

- **One-liner:** On-chain form builder on Sui — forms with decentralized storage on Walrus.
- **Role:** Frontend Developer in a two-person team
- **Hackathon:** Walrus Session 2 (Form Tooling track)
- **Stack:** Sui, Walrus, Move, TypeScript, Next.js
- **Period:** Four weeks
- **Status:** **Live on Sui mainnet, deployed and reachable.**
- **Links:**
  - Live: https://walform.wal.app
  - GitHub: https://github.com/UyLeQuoc/sui-walform
  - Hackathon submission: _(URL to add)_

### Highlights

- Owned all frontend engineering for the drag-and-drop form builder.
- Delivered customizable, SEO-ready forms and AI-assisted form generation in four weeks.
- Integrated Sui objects, Seal encryption, and Walrus decentralized storage.
- Won Top 1 in the Form Tooling track and continued to support later Walrus sessions.

---

## 2. IELTS Practices Online

- **One-liner:** IELTS practice platform with AI-assisted authoring and performance analytics.
- **Role:** Solo Fullstack Developer / System Design
- **Stack:** Next.js, Hono, Drizzle, PostgreSQL on Neon, Redis, Better Auth, UploadThing, AI SDK
- **Period:** Three weeks
- **Status:** In development. Reading, Listening, and Writing flows are complete.
- **Links:** The repository is private and no public deployment is available.

### Highlights

- Designed and implemented the complete system architecture and full-stack application.
- Built teacher authoring flows with PDF and audio uploads through UploadThing.
- Used AI to generate answer keys from uploaded materials and review student Reading practice.
- Built analytics for band scores, attempt counts, and individual test results.

---

## 3. Sui Stream

- **One-liner:** On-chain short-video platform powered by Walrus storage and Sui contracts.
- **Role:** Solo Frontend and Smart Contract Developer
- **Hackathon:** CommandOSS HackerHouse, 17 April 2026
- **Stack:** Sui, Move, Walrus, TypeScript, Next.js
- **Status:** Complete working demo.
- **Links:**
  - Live demo: https://sui-stream-web.vercel.app/

### Highlights

- Built the responsive frontend and Move smart contracts.
- Streamed short-form video through Walrus's public aggregator.
- Created on-chain video objects and upload flows.
- Implemented donations, viewer mission campaigns, views, comments, and likes.

---

## 4. HuanPhim

- **One-liner:** No-code film streaming stack deployed and secured on a self-managed VPS.
- **Role:** Solo DevOps / System Administrator
- **Stack:** Ubuntu, Docker Compose, Jellyfin, Caddy, Tailscale
- **Status:** Live for a small private audience.
- **Links:**
  - Live: https://watch.huanphim.site

### Highlights

- Deployed Jellyfin and qBittorrent as isolated Docker Compose services with persistent storage and bounded logs.
- Published only Jellyfin through Caddy with automatic HTTPS while keeping application ports bound to localhost.
- Restricted administration to key-only SSH over Tailscale, a deny-by-default UFW policy, and an SSH-tunneled qBittorrent interface.
- Separated service ownership and mounted media read-only in Jellyfin to protect the underlying library.

---

## 5. MarkQ

- **One-liner:** Open-source quiz engine that turns Markdown files into interactive tests.
- **Role:** Solo Fullstack Developer / Maintainer
- **Stack:** Next.js, TypeScript, SQLite, Drizzle, shadcn/ui
- **Status:** Open source under the MIT license.
- **Links:**
  - GitHub: https://github.com/huanngdev/markq

### Highlights

- Built a Markdown-first quiz engine with validation, server-side answers, grading, explanations, and configurable quiz rules.
- Persisted autosaved attempts, scores, shuffled order, flags, and immutable review snapshots in SQLite.
- Added subject and topic analytics, linked knowledge articles, a protected Markdown editor, and an optional AI tutor.
- Shipped documentation, an example quiz, tests, CI, and a reusable quiz-authoring skill for contributors.

---

## 6. Relic of Lie — 🥈 Top 2

- **One-liner:** A decentralized take on the _Love Letter_ card game — bluffing and deduction, on-chain.
- **Hackathon:** First Mover, 3 February 2026 — **Top 2**
- **Stack:** _(to add — Sui? Move contracts? Web client? Smart-contract-driven game logic?)_
- **Status:** _(playable URL?)_
- **Links:**
  - Play: _(URL to add)_
  - GitHub: _(URL to add)_

The "first hackathon, first podium" line is the card subtitle — it's the freshest, lightest, most human signal in the projects grid. Also: card-game projects show range beyond standard CRUD apps, which reads well to startup recruiters.

---

## 7. This portfolio site

- **One-liner:** Personal portfolio built with Next.js 16, Tailwind v4, shadcn/ui, in a Turborepo monorepo with a shared `@repo/core` design-system package.
- **Stack:** Next.js (App Router, RSC, server actions), Tailwind v4, shadcn/ui, Radix, Framer Motion, Velite/Contentlayer for MDX content, Vercel hosting.
- **Status:** In progress.
- **Links:** This site itself + GitHub repo (add the repo URL once public).

Including the portfolio as a project is legitimate when it's craft-forward — readers can verify the code matches the polish.

---

## 8. MapCN components

- **One-liner:** MapLibre-powered React map components integrated into the portfolio, centered on Ho Chi Minh City.
- **Stack:** MapCN, MapLibre, React, TypeScript, Tailwind CSS.
- **Status:** Live.
- **Links:** https://www.mapcn.dev/

This belongs in the project list as a small UI-craft integration: it demonstrates third-party registry adoption, map rendering, theme-aware tiles, and location presentation without adding heavy product copy.

---

## Card template

When fleshing out the cards on the site, every project entry should fill all these fields. Missing fields are red flags to the reader.

```
Logo / icon
Name
One-line description (≤ 80 chars)
Period (Mon YYYY — Mon YYYY or Mon YYYY — present)
Status badge (Live / Hackathon / Archived / WIP)
Tech tags (3-5 max; the most distinctive, not the whole stack)
Live link
Source link
(Optional) Hackathon result badge — "Top 2", "Finalist", "Winner"
```
