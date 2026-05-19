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

### 3.3 Routing & i18n

- All routes live under `app/[locale]/...`. The middleware in `middleware.ts` handles locale detection and the `/` → `/en` (or `/vi`) redirect.
- Use `Link` from `@/i18n/navigation` (or whatever wrapper `next-intl` exposes), never `next/link` directly — the wrapper preserves the active locale.
- Server Components read translations via `getTranslations`. Client Components use `useTranslations`. Never pass a translated string through props if you can pass the key and translate at the leaf.

### 3.4 Images

- `next/image` always. Explicit `width` and `height` always.
- For above-the-fold images (avatar, hero OG image), set `priority`. For the rest, lazy load is the default — don't override it.
- Decorative images get `alt=""`; meaningful images get descriptive alt text in the active locale.

### 3.5 Metadata

Every page exports `generateMetadata` returning a locale-aware `Metadata` object with `title`, `description`, `openGraph`, `twitter`, and `alternates.languages` set for both locales. No exceptions, even for sub-routes.

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

### 4.4 Responsiveness

- Mobile-first. Default styles target the smallest screen, breakpoint utilities (`md:`, `lg:`) layer on top.
- The content column is `max-w-[700px]` mirroring the reading width in `docs/DESIGN.md`. Don't fight it without a reason.

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

## 8. State, content & i18n

### 8.1 State

- URL state for anything shareable or back-button-relevant (active blog tag, locale, theme override).
- React state for ephemeral UI local to one component (open/closed, hover, in-progress form input).
- **Zustand** for state shared across components or features (command palette open state, theme preference cache, in-flight filters that several sections read). One store per concern — do not create a monolithic "app store". Each store is colocated with the feature that owns it and exports a typed hook.
- No other global state library. Redux, MobX, Jotai, Recoil, etc. are out — Zustand is the one choice for this project.

### 8.2 Content

- MDX frontmatter is validated by a Zod schema in the Velite/Contentlayer config. Adding a frontmatter field means updating the schema in the same change.
- Both locale siblings of a content file must share the same frontmatter shape (title, date, tags) so list views render consistently. The schema enforces this.
- Code blocks in MDX use `rehype-pretty-code` (or equivalent) with a theme that respects light/dark mode.

### 8.3 i18n

- Every user-visible string is in the locale JSON files. There are no hardcoded strings in components.
- Translation keys are namespaced by section: `hero.tagline`, `nav.blog`, `experience.present`. Flat keys live in flat files; the namespace is part of the key, not the directory structure.
- When adding a key, add it to **both** `en.json` and `vi.json` in the same commit. CI fails if the two files have different key sets.

---

## 9. Comments & documentation

- Default to no comments. Identifiers should explain what; structure should explain how.
- Write a comment only when the **why** is non-obvious: a workaround, a constraint from a library bug, an invariant a future reader would otherwise miss.
- Never write comments that reference the current task, ticket, or author (`// for the new blog feature`, `// per @ngo`). Those belong in commit messages and PR descriptions.
- No JSDoc on internal functions. The types are the documentation. JSDoc is reserved for public package exports in `packages/*`.

---

## 10. Performance

- Lighthouse ≥ 95 on every category, on desktop, on every locale. Run it in CI on each PR via `@lhci/cli`.
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
  - Have non-trivial logic (date formatting, locale fallback, MDX schema validation).
  - Have failed before.
  - Are tedious to verify by hand (e.g., that every blog post in `content/` has matching frontmatter in both locales).
- Use Vitest for unit tests and Playwright for the handful of integration tests (command palette, theme toggle, language switcher).
- No snapshot tests on rendered HTML. They rot. Test behavior, not markup.

---

## 13. Git & PRs

- Branch names: `feature/...`, `fix/...`, `chore/...`, `content/...`.
- Commit messages: short imperative subject (≤72 chars), then a paragraph explaining **why** if it isn't obvious. The diff explains **what**.
- One concern per PR. A PR that "adds the blog and also refactors the nav" gets split. A PR that "adds the blog, including necessary type updates and a new dependency for MDX" is fine.
- Every PR description includes: what changed, why, screenshots (for UI) in both light and dark mode and both locales, and a checklist of the rules above that were verified.

---

## 14. Definition of done

**Before any task is considered complete — by a human or by Claude — the following must pass on the changed code:**

1. `bun run format` (Prettier across the workspace, or the per-package script).
2. `bun run lint` — zero errors. Warnings are reviewed, not ignored.
3. `bun run check-types` — clean.

If any of those fail, the task is not done. Do not hand a change back to review, do not open a PR, do not mark a todo as completed until the three commands above pass. This applies equally to one-line copy edits and to large refactors — the cost of running them is tiny, the cost of a broken `main` is not.

When working in a single app, scope the commands to that app (`bun --filter web run lint`) — but never skip them.

## 15. Tooling enforcement

These rules are enforced where possible:

- **TypeScript** — `strict`, `noUncheckedIndexedAccess`, `noImplicitAny`.
- **ESLint** — `@repo/eslint-config` covers React, hooks, accessibility, import order, Tailwind, and bans `any` via `@typescript-eslint/no-explicit-any`.
- **Prettier** — `@repo/prettier-config` with the Tailwind plugin.
- **Pre-commit hook** — runs `prettier`, `eslint --fix`, and `tsc --noEmit` on changed files.
- **CI** — runs `bun run lint`, `bun run check-types`, the full test suite, and Lighthouse on every PR.

If a rule above isn't enforced by tooling, that's a gap. Open an issue and fix the tooling rather than relying on review to catch it.
