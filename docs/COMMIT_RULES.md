# COMMIT_RULES.md — Commit & Git workflow

This repo enforces a small set of rules at commit-time. They exist so the history reads cleanly, releases can be automated later, and code review focuses on the change — not on formatting noise or missing types.

The rules below are **enforced automatically** via `husky` + `lint-staged` + `commitlint`. Bypassing them with `--no-verify` is allowed only when the user explicitly asks for it.

---

## 1. Conventional Commits

Every commit message follows the [Conventional Commits 1.0](https://www.conventionalcommits.org) spec:

```
<type>(<scope>)<!>: <subject>

<body>

<footer>
```

- **`<type>`** — see the allowed list below.
- **`<scope>`** — optional. The area touched (`web`, `core`, `ui`, `docs`, `ci`, etc.). Use lowercase, single word where possible.
- **`<!>`** — optional breaking-change marker. Use it OR a `BREAKING CHANGE:` footer.
- **`<subject>`** — imperative mood ("add", not "added"), no trailing period, ≤ 72 chars.
- **`<body>`** — optional. Explain the _why_, not the _what_. Wrap at 100 chars.
- **`<footer>`** — optional. References issues, breaking-change details, co-authors.

### Allowed types

| Type       | Use when                                                                  |
| ---------- | ------------------------------------------------------------------------- |
| `feat`     | A new user-visible feature.                                               |
| `fix`      | A bug fix.                                                                |
| `refactor` | A code change that neither adds a feature nor fixes a bug.                |
| `perf`     | A change that improves performance.                                       |
| `style`    | Whitespace, formatting, semicolons — no logic change.                     |
| `docs`     | Documentation only (`docs/**`, `README`, comments, JSDoc, `content/**`).  |
| `test`     | Adding or fixing tests.                                                   |
| `build`    | Build system, dependencies, package manifests.                            |
| `ci`       | CI configuration (GitHub Actions, etc.).                                  |
| `chore`    | Routine maintenance that doesn't fit anything above.                      |
| `revert`   | Reverts a previous commit (use `git revert`, which produces this format). |

### Subject line — what's allowed

- ✅ `feat(web): add hero section with avatar lights interaction`
- ✅ `fix(core): correct twMerge import path in utils.ts`
- ✅ `docs(reference): clarify section order rules`
- ✅ `chore: bump turbo to 2.9.14`
- ❌ `Add hero section.` — wrong case, ends with period, missing type
- ❌ `feat: Added hero section` — subject must be imperative ("add", not "added")
- ❌ `feat(web): added a new hero section that includes the avatar lights interaction and the live local time and the social links` — too long (cap is 72 chars)

### Body — when to write one

Write a body when the change isn't obvious from the diff. The body answers **why**, the diff already shows **what**.

```
fix(core): re-export utils through @repo/core/lib/utils

Web app imports broke after the components.json alias change.
Adding the explicit export keeps the shorter import path working
without forcing every callsite to use @/ui/lib/utils.
```

### Breaking changes

Two equivalent ways:

```
feat(core)!: drop default export of cn()
```

or

```
feat(core): drop default export of cn()

BREAKING CHANGE: `cn` is now a named export only. Update imports
from `import cn from "@repo/core/lib/utils"` to
`import { cn } from "@repo/core/lib/utils"`.
```

Use the footer form when the breaking change deserves explanation.

---

## 2. Pre-commit hook (husky + lint-staged)

On every `git commit`, the `.husky/pre-commit` hook runs `lint-staged`, which:

1. Picks up the **staged** files only — not the whole repo.
2. For `*.ts` / `*.tsx` / `*.js` / `*.mjs` / `*.cjs`:
   - Runs `eslint --fix` (auto-fixes what it can, fails the commit on remaining errors).
   - Runs `prettier --write`.
3. For `*.json` / `*.md` / `*.mdx` / `*.css` / `*.yml` / `*.yaml`:
   - Runs `prettier --write`.
4. Re-stages the files so the formatting changes land in the same commit.

Config lives at `lint-staged.config.mjs` at the repo root.

### What this means for you

- You almost never need to run `bun run lint` or `bun run format` manually before committing — the hook does it.
- If the hook fails, **read the error**. Most of the time it's a real ESLint error that needs fixing. Don't `--no-verify` past it.
- If the hook auto-fixes formatting, the fixed files are staged for you. Commit normally.

---

## 3. Commit-msg hook (commitlint)

Every commit message is parsed by `commitlint` against the rules in `commitlint.config.mjs`. If the message violates Conventional Commits (wrong type, sentence-case subject, missing colon, etc.), the commit is rejected.

### To check a message before committing

```bash
echo "feat(web): add hero section" | bunx commitlint
```

---

## 4. CI also enforces

The `.github/workflows/ci.yml` workflow runs on every push and PR:

1. `bun run format:check` — Prettier validation (no auto-fix in CI).
2. `bun run lint` — full-repo ESLint via Turbo.
3. `bun run check-types` — TypeScript `tsc --noEmit`.
4. `bun run build` — production build of every workspace.
5. On PRs: `commitlint` validates every commit in the PR range.

Local hooks are advisory and fast. CI is authoritative and complete. A green CI is required to merge.

---

## 5. PRs and branches

- **Branch from `main`.** Branch names: `feat/<short-desc>`, `fix/<short-desc>`, `chore/<short-desc>`. Match the commit type.
- **One concern per PR.** A PR that touches the hero AND adds the GitHub heatmap should be two PRs.
- **PR title follows commit format.** When merging via squash, the PR title becomes the commit message — make it conform.
- **Rebase, don't merge.** Linear history. Use `git rebase main` to update a branch; reserve merge commits for actual merges into `main`.

---

## 6. Manual commands

```bash
# Run lint-staged on currently staged files (what the hook does).
bunx lint-staged

# Validate the latest commit message manually.
bunx commitlint --from HEAD~1 --to HEAD

# Format everything (the nuclear option — usually let the hook do it).
bun run format
```

---

## 7. Why this setup

- **`husky`** — git hooks that survive `bun install` for everyone on the team.
- **`lint-staged`** — running ESLint/Prettier on the entire repo for every commit is slow (~10s+ in a real monorepo). Staged-only is sub-second.
- **`commitlint` + Conventional Commits** — enables automated changelogs, semantic versioning, and clean `git log --oneline` output. Costs almost nothing per commit.
- **CI workflow** — local hooks can be bypassed; CI cannot. Both layers exist on purpose.

---

## 8. Not adopted (and why)

- **`knip`** — finds unused exports, files, and dependencies in a monorepo. Skipped: the portfolio is actively being built and many components/utilities exist before their first consumer. Knip would flag code intended for upcoming sections as "unused" and tempt premature deletion. Reconsider once the page is feature-complete.
- **`commitizen` (`cz` CLI)** — interactive commit-message builder. Skipped: another step in every commit, marginal value for solo dev. Reconsider if multiple contributors join.
- **`changesets`** — versioning workflow for publishable packages. Skipped: nothing in this repo is published to npm.
- **`semantic-release`** — auto-tagged releases from commit history. Skipped: portfolio doesn't have releases.
- **`renovate` / `dependabot`** — automated dep updates. Not adopted yet; easy to add later via GitHub repo settings.
- **`turbo-ignore` / `turbo prune`** — Vercel auto-detects monorepo and uses Turbo's affected-package logic. No extra config needed for now.
