---
title: Profile data — index
updated: 2026-05-19
---

# Profile data

Single source of truth for everything personal about Chris (Ngô Gia Huân) that appears on the portfolio site. Each file maps to one part of the page — keeping them split lets the content schema evolve independently per section.

## Files

- [\_\_meta.md](./_meta.md) — portfolio strategy: career stage, positioning, audience.
- [identity.md](./identity.md) — name, location, roles, languages, birth year. Powers the hero.
- [contact.md](./contact.md) — email, social handles, domain plan, tagline drafts.
- [about.md](./about.md) — narrative anchor + draft bio.
- [skills.md](./skills.md) — tech stack for the icon grid.
- [education.md](./education.md) — FPT University.
- [experience.md](./experience.md) — Formo, FPT Software internship.
- [projects.md](./projects.md) — WalForm, hackathon projects, this portfolio.
- [awards.md](./awards.md) — First Mover (Top 2), CommandOSS HackerHouse.

## Open TODOs across all files

The data captured below is the first pass. Refine with these gaps closed:

1. **Project deep-dives** — stack, repo URL, live URL, screenshots for each project.
2. **Hackathon game project name** — the Feb 2026 First Mover game needs a name.
3. **Experience bullets** — specific shipped work at Formo and FPT Software (current bullets are placeholders).
4. **CLAUDE.md correction** — SealPass and AfterVault are NOT real projects; they were placeholders. Update CLAUDE.md to replace them with WalForm + the real hackathon projects.
5. **Confirm:** FPTU degree program, FPTU campus location, X handle URL format, Drizzle-vs-Prisma preference, what "Mini" refers to in the backend stack.

## How to use this data

When building the portfolio site:

- The Hero pulls from `identity.md` + `contact.md` + the recommended tagline in `contact.md`.
- The About section pulls from `about.md` — the draft bio is the starting copy.
- The Tech stack icon grid mirrors the grouping in `skills.md`.
- The Experience timeline pulls from `experience.md` in reverse-chronological order.
- The Projects grid pulls from `projects.md` in the order defined there (hackathon-first).
- The Awards section pulls from `awards.md`.

These files are intentionally NOT MDX yet — they're prose-and-data drafts. When the content pipeline (Velite/Contentlayer per CLAUDE.md) is wired, convert each into the schema the pipeline expects.
