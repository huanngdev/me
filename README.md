# [huanngdev.site](https://huanngdev.site)

My personal developer portfolio — a living resume, writing space, and project showcase.

→ Check out the live site: [huanngdev.site](https://huanngdev.site)

## Overview

### Stack

- Next.js 16
- Tailwind CSS v4
- shadcn/ui
- Turborepo
- Bun

### Featured

- Clean & minimal design
- Light/Dark themes
- One-click profile export (PDF, Markdown, JSON)
- Live GitHub contributions heatmap
- Section-aware TOC minimap
- SEO optimized (sitemap, robots)
- Self-hosted typography (Inter + JetBrains Mono)

### Content

Profile data is centralized in `content/profile/*.md` (the source of truth) and mirrored into typed constants at `packages/core/src/constants.ts`.

Blog and project content live as MDX with shared frontmatter (title, date, tags). UI strings are inline at the call site — no translation layer; the site is English-only.

## Development

This is a [Turborepo](https://turborepo.dev) monorepo using [Bun](https://bun.sh) as the package manager.

Install dependencies:

```sh
bun install
```

Run the web app in dev:

```sh
bun --filter=web dev
```

Typecheck everything:

```sh
bun run check-types
```

Lint everything:

```sh
bun run lint
```

### Layout

- `apps/web` — the Next.js 16 site.
- `packages/core` — shared UI components, hooks, lib, and the profile constants.
- `content/profile/*.md` — canonical personal data.
- `docs/` — internal docs (commit rules, structural reference).

## Reference

This repo is inspired by [chanhdai.com](https://chanhdai.com) by [@ncdai](https://github.com/ncdai). The structural rules, section choices, and density decisions trace back to that portfolio — see [`docs/REFERENCE.md`](./docs/REFERENCE.md) for the intentional deviations.

## License

MIT.

You're free to use my code! Just make sure to <ins>remove all my personal information</ins> before publishing your website.

## Stats

![Stats](https://repobeats.axiom.co/api/embed/huanngdev-me.svg "Repobeats analytics image")

## Star History

[![Star History](https://starchart.cc/huanngdev/me.svg?variant=adaptive&line=%23f59e0b)](https://starchart.cc/huanngdev/me)
