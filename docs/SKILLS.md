# SKILLS.md — Recommended Skills, Agents & Tools

A curated guide to the Claude Code skills, subagents, and workflows that best fit this project. The stack is a Turborepo monorepo with Next.js 16, React 19 (with the React Compiler), TypeScript 5.9, Tailwind CSS v4, and shadcn/ui as the component layer. The site is internationalized (en/vi), content-driven via MDX, and prizes performance and craft over decoration.

The goal of this document is to keep the team — and Claude — focused on the few skills that materially raise quality, and to avoid burning time on tools that don't fit the shape of the work.

---

## Tier 1 — use these routinely

### `shadcn`

This is the highest-leverage skill for the project. Every interactive UI element on the site flows through shadcn primitives: the command palette (`cmdk`), navigation, theme toggle, dialogs, tooltips on the GitHub heatmap, and the component showcase section.

Use it when:

- Installing a new shadcn component (`button`, `dialog`, `command`, `tooltip`, `dropdown-menu`, `tabs`, `sheet`, `popover`).
- Switching or composing presets — the visual identity in `docs/DESIGN.md` is a custom near-neutral palette with a muted violet accent, which maps cleanly to a tuned shadcn theme rather than the default.
- Resolving registry conflicts, debugging style drift between light and dark mode, or adjusting tokens in `components.json`.
- Verifying that a component is wired into `app/globals.css`, the Tailwind v4 `@theme` block, and the React Server Component boundary correctly.

Tip: shadcn in a Tailwind v4 project relies on CSS variables defined in `@theme`, not the v3 `tailwind.config.ts`. When the skill suggests a v3-style config edit, redirect it to the v4 token block.

### `simplify`

Run this after every meaningful change before committing. The portfolio's design philosophy is "every element earns its space" — `simplify` enforces the same principle in code: it scans changed files for duplicated logic, premature abstractions, dead branches, and unnecessary state.

Particularly valuable for:

- Reviewing new MDX components and content-layer transforms (Velite/Contentlayer schemas tend to grow boilerplate).
- Auditing client/server boundary code in the Next.js App Router — it's easy to accidentally over-mark files with `"use client"`.
- Compressing repeated Framer Motion variant objects into shared presets.

### `review`

The end-of-PR pass. Catches what `simplify` and ESLint miss: OG image misconfigurations, accessibility regressions, and consistency with the visual identity rules in `docs/DESIGN.md`.

### `security-review`

Run before any PR that touches:

- The MDX pipeline (untrusted markdown can inject script tags if rendered raw).
- API routes (GitHub heatmap revalidation, OG image generation).
- Dynamic `next/image` `src` values, redirects, or rewrites in `next.config.ts`.
- Anything reading from `process.env` on the client side.

The site has a small attack surface, but the MDX layer and any future contact form deserve a second look.

---

## Tier 2 — use when relevant

### `init`

Already used to author the root `CLAUDE.md`. Re-run only if the project's scope changes substantially (e.g., adding a backend service or a second app). Do not re-run for incremental edits — `CLAUDE.md` should be updated by hand.

### `update-config`

For configuring `~/.claude/settings.json` or `.claude/settings.local.json` — hooks, permissions, environment variables. Useful here for:

- Allowing `bun`, `turbo`, `next`, and `pnpm dlx shadcn` commands without prompts.
- Adding a post-edit hook that runs `prettier` on `.ts`, `.tsx`, `.md`, and `.mdx` files.
- Adding a pre-commit hook that runs `bun run check-types` against the workspace.

### `fewer-permission-prompts`

Run once early in the project lifecycle to allowlist the noisy read-only commands the agent uses most (`ls`, `cat`, `bun pm ls`, `git status`, `gh pr view`). Re-run after a few weeks of usage to catch new patterns.

### `claude-api`

Only relevant if the portfolio adds a feature that calls the Anthropic API directly — e.g., an AI-powered "ask my portfolio" chat widget or an LLM-generated bio summary. If that ships, this skill is the right entry point. Until then, skip it.

---

## Tier 3 — situational

- **`keybindings-help`** — personal preference; not project-specific.
- **`schedule` / `loop`** — for running recurring tasks like a weekly Lighthouse audit, scraping bookmarks, or regenerating the GitHub heatmap snapshot. Optional.

Skip everything else (`statusline-setup`, the various MCP authenticators) unless you actively need the integration.

---

## Subagents — when to delegate

The agents available in this harness map onto specific moments in the development loop.

### `Explore`

Use this for any "where is X defined / which files reference Y" question across the monorepo. Faster and lighter than letting the main agent grep the workspace itself. Examples:

- Finding every place a translation key is used before renaming it.
- Locating all components that import a specific shadcn primitive.
- Tracing how a Velite collection flows from `content/` to a page.

Specify search breadth honestly — `quick` for a single lookup, `very thorough` only when you genuinely need cross-cutting coverage.

### `Plan`

Use before any task that touches more than two files or introduces a new architectural seam. Good fits for this project:

- Designing the MDX content pipeline (frontmatter schema, type generation).
- Integrating Framer Motion shared-layout transitions between the blog list and the post page.
- Designing a non-trivial section (command palette, GitHub heatmap, component showcase).

Skip for trivial edits — a plan agent for a one-line copy change is overhead.

### `general-purpose`

Reserve for open-ended research that spans multiple tools (web + code + docs) and doesn't fit `Explore`. Example: "find the current best practice for MDX + Velite in Next.js 16" — that needs WebSearch plus code reading.

### `claude-code-guide`

Use when a question is specifically about Claude Code itself (hooks, MCP, slash commands, the SDK) rather than the portfolio code.

### `statusline-setup`

Personal preference; ignore unless customizing the status line is on the to-do list.

---

## Recommended development loop

A typical change in this project should flow like this:

1. **Understand** — `Explore` to locate the relevant files. Read `docs/DESIGN.md` for visual decisions and `docs/CODE_RULES.md` for engineering rules.
2. **Plan** (for non-trivial changes) — `Plan` agent to lay out the approach.
3. **Build** — make the edits. Reach for `shadcn` when adding or tuning UI primitives.
4. **Verify** — `bun run check-types && bun run lint` at the workspace root. Run `next dev` and exercise the feature in the browser in both light and dark mode, including at 360px width.
5. **Polish** — `simplify` on the changed files.
6. **Ship** — `review` on the PR diff, plus `security-review` if the change touches MDX, API routes, or any boundary that handles external input.

This sequence keeps the surface area each tool covers distinct and avoids redundant passes.

---

## Tools to deliberately avoid

- **Heavy code-generation agents for content edits.** Blog posts, bio copy, and project descriptions are short and personal — write them by hand. Generated prose conflicts with the "direct, specific, free of buzzwords" tone the project enforces.
- **Auto-formatting commits.** Prettier should run via pre-commit hook, not as a separate "format the whole repo" pass — that pollutes diffs.
- **MCP integrations the project doesn't use** (Slack, Notion, Linear, Asana, etc.). They add tool-search noise without any payoff here.

---

## Open questions / future considerations

- If the blog grows past ~20 posts, consider adding a dedicated agent workflow for translation parity checks (every `[slug].en.mdx` has a sibling `[slug].vi.mdx` or vice-versa, with matching frontmatter).
- If the component showcase section ships, an automated visual-regression skill (Percy / Chromatic-style) becomes valuable — there isn't a first-party Claude Code skill for that yet, but `loop` + a Playwright script is a reasonable approximation.
