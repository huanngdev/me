# CODE_RULES.md — Engineering Rules

The rules below apply to every line of code in this repository. They exist to keep the codebase small, fast, and consistent with the visual identity in `docs/DESIGN.md`. When a rule and a third-party convention disagree, the rule wins — but document the deviation in the PR description.

The hierarchy of authority is: **TypeScript types > lint rules > these rules > personal preference**. If a rule here ever conflicts with the type system or the lint config, fix the type or the config, not the code.

---

## 1. TypeScript

### 1.1 Strictness is non-negotiable

- `strict: true` in every `tsconfig.json`. Never relax it per-package.
- **Every value has an explicit, accurate type.** Function parameters, return values, props, hook return values, store state, and event handlers are all typed. Implicit `any` is a build failure, not a warning.
- **`any` is banned** — not in code, not in `// eslint-disable` lines, not in test files, not "just for now". If a value is genuinely unknown, use `unknown` and narrow it at the boundary. If a library's types are wrong, write a `.d.ts` augmentation; do not paper over it with `any`.
- No `as` casts except at well-defined I/O boundaries (parsing a `FormData`, a fetch response, or a third-party value with a runtime guard alongside it).
- No `@ts-ignore`. If you need to suppress an error, use `@ts-expect-error` with a one-line comment explaining why — `@ts-expect-error` fails the build the moment the underlying issue is fixed, which is what we want.

### 1.2 Types describe shape, not intent

- Prefer `type` over `interface` for everything that isn't a public class contract. Interfaces invite declaration merging, which is rarely what we want.
- Use discriminated unions for "this OR that" — never optional fields that only make sense together.
- Derive types instead of duplicating them: `type PostFrontmatter = z.infer<typeof PostSchema>`, `type Props = ComponentProps<typeof Button>`, etc.
- Never export a type whose only purpose is to mirror a function's return value — `ReturnType<typeof foo>` is the better callsite.

### 1.3 Runtime validation at boundaries only

Use Zod (or the Velite/Contentlayer schema layer) at the edges: MDX frontmatter, environment variables, API responses, form input. Internal code trusts its types — adding `z.parse` to a function that only ever receives internal values is overhead.

### 1.4 `noUncheckedIndexedAccess`

Enable it. Array and record access should return `T | undefined`, forcing the call site to handle the missing case. The portfolio has a content layer where missing translations and missing slugs are real possibilities — let the type system surface them.

---

## 2. React 19 & the React Compiler

### 2.1 Trust the compiler

The web app has `babel-plugin-react-compiler` enabled. That means:

- **Do not** wrap components in `React.memo` by default. The compiler memoizes automatically.
- **Do not** wrap callbacks in `useCallback` or values in `useMemo` unless you can name the specific reactivity bug they fix.
- **Do not** add `key` props as a memoization trick — keys are for identity, nothing else.

If you find yourself reaching for any of the above, first ask whether the rerender actually matters. The compiler's whole point is making manual memoization obsolete.

### 2.2 Composition over configuration

- Prefer many small components with focused props to one component with a dozen booleans. A `<Section variant="hero" withDivider compact dark />` is a smell — split it.
- Use slots / `children` instead of "render prop" props (`renderHeader`, `renderFooter`). Slots compose; render props do not.
- Lift state only as far as it needs to go. Co-locate state with the leaf component that owns it.

### 2.3 Hooks discipline

- One hook per concern. A component with five `useEffect`s is doing five things — split it, or move the logic into a custom hook.
- Custom hooks return tuples or objects, never bare values that could be confused for state.
- `useEffect` is the last resort, not the first. If you can compute the value during render, do that. If you can use an event handler, do that. Effects exist to synchronize with non-React systems (the DOM, timers, subscriptions) — nothing else.
- Never use `useEffect` to derive state from props. Compute it inline or with `useMemo` only if profiling shows it matters.

### 2.4 No `forwardRef` boilerplate

React 19 passes `ref` as a regular prop. Write `function Button({ ref, ...props }: ButtonProps) { ... }` instead of wrapping in `forwardRef`. Update existing shadcn-generated components when you touch them.

---

## 3. Next.js 16 (App Router)

### 3.1 Server-first by default

Every file in `app/` is a Server Component unless it genuinely needs to be a Client Component. Reasons that justify `"use client"`:

- It uses state, effects, refs, or browser APIs.
- It uses an event handler that closes over interactive state.
- It uses a hook from a client-only library (Framer Motion, `cmdk`, theme context).

If a component only renders props and JSX, it does not need `"use client"` — even if a parent imports it from a client component. Push the directive to the leaf, not the trunk.

### 3.2 Data fetching

- Fetch in the Server Component that owns the data. Do not pass fetched data through props to a child that could have fetched it itself.
- Use `fetch` with explicit `cache` and `next.revalidate` options — never rely on defaults. The GitHub heatmap is `revalidate: 86400`; static content is `force-cache`; never use `no-store` unless the data is truly per-request.
- No client-side data fetching for content that exists at build time. The blog, projects, experience, and bookmarks must be statically generated.

### 3.3 Routing

- Routes live flat under `app/...` — no locale segment. The site is English-only (see `CLAUDE.md ## Language`).
- Use `Link` from `next/link` directly.
- Hardcode user-visible strings at the call site. No translation layer.

### 3.4 Images

- `next/image` always. Explicit `width` and `height` always.
- For above-the-fold images (avatar, hero OG image), set `priority`. For the rest, lazy load is the default — don't override it.
- Decorative images get `alt=""`; meaningful images get descriptive alt text.

### 3.5 Metadata

Every page exports `generateMetadata` (or a static `metadata`) returning a `Metadata` object with `title`, `description`, `openGraph`, and `twitter` set. No exceptions, even for sub-routes.

---

## 4. Tailwind CSS v4

### 4.1 Tokens, not magic numbers

- Use design tokens from the `@theme` block in `app/globals.css`. The palette, type scale, and spacing scale defined in `docs/DESIGN.md` are the source of truth.
- Never inline a hex color, never use `rgb(...)`, never write `text-[#a78bfa]`. If a token doesn't exist, add it to `@theme` first.
- Arbitrary values (`mt-[13px]`, `w-[742px]`) are a code smell. The only exception is one-off page-level layout constants that have no semantic meaning elsewhere — and even then, prefer a token.

### 4.2 Class organization

- Order classes consistently. The Tailwind Prettier plugin handles this — do not disable it.
- Use `cn()` (the `clsx` + `tailwind-merge` helper that ships with shadcn) for conditional classes. Never concatenate class strings with `+` or template literals.
- Extract a component the moment a `className` exceeds ~6 distinct concerns. Long class lists are fine; long class lists repeated in three places are not.

### 4.3 Dark mode

- Use the `dark:` variant on the same element, never duplicate components. The repo standardizes on the `class` strategy — the theme provider toggles a class on `<html>`.
- Test every change in both modes before committing. The visual identity treats dark mode as first-class.

### 4.4 Responsiveness — mobile is non-negotiable

**Every UI component ships with a mobile version. No exceptions.** A PR that adds or modifies UI without proving it works at mobile width is not done. Recruiters open this site on their phones at least as often as on desktop; a broken mobile layout reads as "didn't care" and you don't get a second first impression.

Mobile is the default, not a breakpoint. Write base styles for the smallest viewport (≈360px wide), then layer `sm:` / `md:` / `lg:` utilities to scale up. Never write desktop-first and reverse-engineer mobile — that path produces brittle layouts that fail on the next phone you try.

Hard requirements on every UI change:

1. **Verify in browser at 360px wide.** Chrome DevTools device toolbar → iPhone SE or narrower. If anything overflows, wraps badly, or becomes unreadable, fix it before opening the PR.
2. **Tap targets ≥ 44×44px.** Buttons, links, icon buttons, switches. `size-11` minimum for interactive icons. Don't shrink to "fit the design" — interactivity wins.
3. **No horizontal page scroll.** Any element that pushes the body wider than `100vw` is a bug. Watch out for fixed widths, long unbreakable strings, and overflow on `pre` / `code` blocks (use `overflow-x-auto` on them).
4. **Body text ≥ 16px** (`text-base`). Smaller is reserved for metadata, timestamps, captions — never primary content. `text-xs` requires justification.
5. **Navigation has a mobile pattern.** If the nav row doesn't fit at 360px it gets a sheet/drawer (hamburger), a horizontally scrollable row, or a collapsed-to-essentials state. Never let nav items wrap onto multiple lines.
6. **Every hover interaction has a touch alternative.** `hover:` reveals must also be reachable via `focus:` or tap. Tooltips, hover dropdowns, hidden-until-hover icons — all need a touch-friendly fallback (long-press, explicit button, or always-visible).
7. **Spacing scales down on mobile.** The default site rhythm is `space-y-16` / `space-y-24` on desktop; mobile usually wants `space-y-10` / `space-y-12`. Don't ship desktop spacing as-is.
8. **Container padding starts at 16px.** `px-4` (`sm:px-6 lg:px-8`) is the default for top-level containers. Edges touching the viewport read as cramped.

The content column is `max-w-[700px]` per `docs/DESIGN.md` — that's the reading width, not the container width. Top-level shells (header, footer, page wrapper) use `container mx-auto` for breakpoint-aware width; the content within can sit narrower.

When you genuinely need to branch _behavior_ (not just styling) on viewport size, use `useIsMobile()` from `@repo/core/hooks` (768px boundary, backed by `useSyncExternalStore`). Default to CSS-only responsiveness; reach for the hook only when JS state actually depends on the form factor.

---

## 5. shadcn/ui

### 5.1 Customize, don't fork

- Add components via `pnpm dlx shadcn add ...` (or the `shadcn` skill). Edit the generated file in place — that's the point of the registry model.
- When the generated component uses `forwardRef`, refactor to React 19's ref-as-prop on first touch (see §2.4).
- When the generated component uses `class-variance-authority`, keep `cva` — it's the project's variant system. Don't replace it with bespoke conditional logic.

### 5.2 One source of truth for tokens

shadcn components reference CSS variables (`--background`, `--foreground`, `--accent`, etc.). Those variables live in the `@theme` block. Never override them inline on a component — fix the token if it's wrong.

### 5.3 Composition shape

- A component file exports the primitive(s) needed by callers and nothing else. If a Dialog needs a Trigger, Content, Header, Title, Description, and Footer, export all six — but don't export internal slot helpers.
- Wrap shadcn primitives in project-specific components only when there's a real semantic addition (`<BlogPostDialog>` wraps `<Dialog>` because it adds blog-specific structure). A pass-through wrapper is dead weight.

---

## 6. Animation (Framer Motion)

- Animations exist to communicate state or guide attention. Decorative motion is rejected in review.
- Default durations: 150–300ms. Default easing: `ease-out` for entrances, spring for interactions.
- Always check `prefers-reduced-motion` — either disable the animation or reduce it to a fade.
- Centralize shared variants in `lib/motion.ts`. Repeating `{ initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 } }` across files is a refactor target.

---

## 7. Module layout

### 7.1 Split UI and hooks per feature

Every feature is organized as two layers: a presentational layer (pure components, no business logic) and a logic layer (custom hooks that own state, effects, derived values, and any orchestration). A feature folder ships both, and the components import the hooks — never the other way around.

- A component's job is to render JSX from props. If a file has more than a few lines of non-render logic, lift that logic into a hook in the same feature.
- Hooks are the only place `useState`, `useEffect`, data fetching helpers, and Zustand store calls appear. Components should read the values the hook returns and call the handlers the hook exposes.
- The split is per-feature, not per-file. Small one-off components (a single icon button, a presentational divider) don't need a hook companion — but anything with interactive state does.
- This separation makes the UI trivially storybook-able and lets the logic be unit-tested without rendering.

### 7.2 Naming

- Files: `kebab-case.ts` for everything except React components, which are `PascalCase.tsx`.
- Components: one component per file, file name matches the default export.
- Hooks: `use-thing.ts` exporting `useThing`.
- Types/utilities live next to their primary consumer. Promote to `lib/` only when a second consumer appears.

### 7.3 Imports

- Use the `@/` path alias for everything inside `apps/web/src`. No relative imports that climb more than one `../`.
- Workspace packages use `@repo/...`. Never reach into another workspace package's `src/` directly — only through its public exports.
- Order: third-party first, then `@repo/*`, then `@/*`, then relative — separated by blank lines. The ESLint config enforces this; don't disable it.

---

## 8. State & content

### 8.1 State

- URL state for anything shareable or back-button-relevant (active blog tag, theme override).
- React state for ephemeral UI local to one component (open/closed, hover, in-progress form input).
- **Zustand** for state shared across components or features (command palette open state, theme preference cache, in-flight filters that several sections read). One store per concern — do not create a monolithic "app store". Each store is colocated with the feature that owns it and exports a typed hook.
- No other global state library. Redux, MobX, Jotai, Recoil, etc. are out — Zustand is the one choice for this project.

### 8.2 Content

- MDX frontmatter is validated by a Zod schema in the Velite/Contentlayer config. Adding a frontmatter field means updating the schema in the same change.
- Code blocks in MDX use `rehype-pretty-code` (or equivalent) with a theme that respects light/dark mode.
- User-visible strings live inline at the call site (the site is English-only — see `CLAUDE.md ## Language`).

---

## 9. Comments & documentation

- Default to no comments. Identifiers should explain what; structure should explain how.
- Write a comment only when the **why** is non-obvious: a workaround, a constraint from a library bug, an invariant a future reader would otherwise miss.
- Never write comments that reference the current task, ticket, or author (`// for the new blog feature`, `// per @ngo`). Those belong in commit messages and PR descriptions.
- No JSDoc on internal functions. The types are the documentation. JSDoc is reserved for public package exports in `packages/*`.

---

## 10. Performance

- Lighthouse ≥ 95 on every category, on desktop. Run it in CI on each PR via `@lhci/cli`.
- No client-side data fetching on initial load except the GitHub heatmap and the live clock.
- Bundle size is a budget, not an afterthought. Run `next build` and inspect the route summary before merging anything that adds a dependency. A new client-side dependency over ~20kB gzipped needs a justification.
- Self-host fonts. No `<link rel="stylesheet" href="https://fonts.googleapis.com/...">` ever — `next/font` only.

---

## 11. Accessibility

- Every interactive element has a visible focus state. The default browser ring is acceptable; a custom ring is fine if it meets contrast requirements.
- Color contrast meets WCAG AA in both light and dark mode. The muted violet accent has been chosen to clear AA on both backgrounds — don't introduce a new accent that doesn't.
- Icon-only buttons have an `aria-label`.
- The command palette is fully keyboard navigable, including the `Esc` to close, `↑ / ↓` to navigate, `Enter` to select.

---

## 12. Testing

- The portfolio is small enough that exhaustive unit tests would be busywork. Test the things that:
  - Have non-trivial logic (date formatting, MDX schema validation).
  - Have failed before.
  - Are tedious to verify by hand (e.g., that every blog post in `content/` has well-formed frontmatter).
- Use Vitest for unit tests and Playwright for the handful of integration tests (command palette, theme toggle).
- No snapshot tests on rendered HTML. They rot. Test behavior, not markup.

---

## 13. Git & PRs

- Branch names: `feature/...`, `fix/...`, `chore/...`, `content/...`.
- Commit messages: short imperative subject (≤72 chars), then a paragraph explaining **why** if it isn't obvious. The diff explains **what**.
- One concern per PR. A PR that "adds the blog and also refactors the nav" gets split. A PR that "adds the blog, including necessary type updates and a new dependency for MDX" is fine.
- Every PR description includes: what changed, why, screenshots (for UI) in both light and dark mode, and a checklist of the rules above that were verified.

---

## 14. Definition of done

**Before any task is considered complete — by a human or by Claude — the following must pass on the changed code:**

1. `bun run format` (Prettier across the workspace, or the per-package script).
2. `bun run lint` — zero errors. Warnings are reviewed, not ignored.
3. `bun run check-types` — clean.
4. **For any UI change** — verified in browser at 360px width per §4.4. If you only checked at desktop width, the task is not done.

If any of those fail, the task is not done. Do not hand a change back to review, do not open a PR, do not mark a todo as completed until they all pass. This applies equally to one-line copy edits and to large refactors — the cost of running them is tiny, the cost of a broken `main` is not.

When working in a single app, scope the commands to that app (`bun --filter web run lint`) — but never skip them.

## 15. Tooling enforcement

These rules are enforced where possible:

- **TypeScript** — `strict`, `noUncheckedIndexedAccess`, `noImplicitAny`.
- **ESLint** — `@repo/eslint-config` covers React, hooks, accessibility, import order, Tailwind, and bans `any` via `@typescript-eslint/no-explicit-any`.
- **Prettier** — `@repo/prettier-config` with the Tailwind plugin.
- **Pre-commit hook** — runs `prettier`, `eslint --fix`, and `tsc --noEmit` on changed files.
- **CI** — runs `bun run lint`, `bun run check-types`, the full test suite, and Lighthouse on every PR.

If a rule above isn't enforced by tooling, that's a gap. Open an issue and fix the tooling rather than relying on review to catch it.
