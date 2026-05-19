# REFERENCE.md — Strict rules for agents

**This portfolio is modeled on https://chanhdai.com/.** Treat that site as the structural and behavioral reference for every section, interaction, and information density decision. When this document and another doc disagree, the order of authority is:

1. **`CLAUDE.md`** (project root) — the source of truth for identity, palette, copy, and i18n.
2. **This file (`docs/REFERENCE.md`)** — the chanhdai-modeled structural rules.
3. **`docs/DESIGN.md`** — visual specifics.
4. **`docs/CODE_RULES.md`** — engineering style.

Anything not covered below: open chanhdai.com, look at how it behaves, match that behavior. Don't invent.

---

## R1. Section order is fixed

The home page renders sections in this exact order. Do not reorder, do not skip, do not introduce new top-level sections without an explicit request.

1. **Hero** — avatar (with state variants), name, tagline.
2. **Overview** — current role + location + contact line. One compact block, not a separate page.
3. **Social links** — icon row. GitHub, LinkedIn, X, Telegram, Discord, daily.dev if/when set up.
4. **About** — short bio paragraph + testimonials (deferred until quotes exist).
5. **GitHub contributions** — heatmap calendar of the current year.
6. **Tech stack** — icon grid grouped by category (per `content/profile/skills.md`).
7. **Components showcase** — live interactive component demos. **Required, not optional** (CLAUDE.md calls it "optional"; this rule overrides — chanhdai's distinctiveness comes from this section, and the same applies here).
8. **Blog** — list of posts.
9. **Sponsors** — only if/when sponsors exist. Hide the section entirely if empty; do not render a placeholder.
10. **Experience** — reverse-chronological timeline.
11. **Projects** — grid of projects (per `content/profile/projects.md`, hackathon-first).
12. **Awards** — collapsible after the first few.
13. **Certifications** — collapsible after the first few.
14. **Bookmarks** — collapsible.
15. **Footer** — links, copyright, "Built with …" line.

The command palette (⌘K) sits outside section order. It must reach every section above by section anchor.

---

## R2. Interactions that must exist

These are non-negotiable. Each is what makes the site feel like chanhdai's, not a template.

- **Avatar with state variants.** At minimum two states (lights-on / lights-off) per CLAUDE.md. Hover/focus crossfades; respects `prefers-reduced-motion`.
- **Command palette (⌘K / Ctrl+K).** Navigates to every section anchor, toggles theme, toggles locale, exposes social links. Built on `cmdk`.
- **Section anchors with smooth scroll.** Every section has an `id`; clicking a nav item or palette result smooth-scrolls to it.
- **Theme switcher.** Sun / Moon / System tri-state. Persists across reloads. Already wired via `next-themes` + the `d` hotkey.
- **Locale switcher.** EN ↔ VI toggle. Lives in the top bar to the left of the theme switcher.
- **Expandable lists.** Experience (older entries), Awards, Certifications, Bookmarks all collapse to N items with a "Show more / Show less" toggle. Default N: 4 for Experience, 5 for Awards/Certs/Bookmarks.
- **Live local time** in the hero (Asia/Ho_Chi_Minh, UTC+7). Updates every minute.
- **GitHub heatmap with tooltips.** Hover a cell to show contribution count + date.

---

## R3. Where this site DIVERGES from chanhdai

These deviations are intentional. Do NOT "fix" them to match chanhdai more closely.

- **Accent color.** Chanhdai uses warm yellow/gold. This site uses **muted purple** per CLAUDE.md. Keep purple. Use it on the same surfaces chanhdai uses gold: active states, hover underlines, hero gradient text, tag pills.
- **i18n.** Chanhdai is effectively English-only. This site is **first-class EN + VI** via next-intl. Every UI string, bio variant, project description, and post is locale-aware. Never hardcode English in JSX.
- **Tone.** Chanhdai mixes playful and professional (`hello`, `💛☕️`, flag emoji). This site is **quiet confidence** per CLAUDE.md — terser, less emoji, fewer cute lines. One small personality touch in the footer is fine; do not pepper the page with them.
- **Package-manager switcher.** Chanhdai has pnpm/yarn/npm/bun toggles on its components/docs pages. This site uses **bun only** for the developer-facing content; if a code snippet shows install commands, show bun by default. Other managers go in tooltips, not toggles.

---

## R4. Layout density rules

- **Single content column, max-width ~700px**, centered.
- **No cards on top-level sections.** Sections are separated by whitespace and at most a single hairline border (`border` token, low opacity).
- **No drop shadows beyond `shadow-xs`** on interactive elements. The visual identity is flat. Heavy shadows belong on hover states only, and even there sparingly.
- **No gradient backgrounds** except for the hero's optional gradient-text accent.
- **No background images** beyond the avatar.
- **Spacing scale:** sections separated by `space-y-16` (mobile) / `space-y-24` (desktop). Within a section, components use `space-y-4`–`space-y-8`.

---

## R5. Content density rules

For an early-career portfolio (0-1 year of professional experience), restraint matters more than breadth. Apply these caps:

- **Hero tagline:** ≤ 90 characters. One line on desktop, two max on mobile.
- **About bio:** ≤ 4 sentences for the visible paragraph. Anything longer goes into expandable "Read more".
- **Project cards:** description ≤ 80 characters. Tech tags ≤ 5.
- **Experience bullets:** ≤ 4 per role. Every bullet starts with a verb and names a concrete artifact + tech.
- **Tech stack icons:** ≤ 30 total. Each one must be something the user would survive being asked about in an interview.
- **Awards / Certs / Bookmarks:** show 5 by default, rest behind "Show more".

If a section has _less_ than the cap, fine. Less is fine. **Padding past the cap is a code review failure.**

---

## R6. Animation and motion rules

Inherited from CLAUDE.md `## Animations`, restated as enforceable rules:

- Every animation is gated by `prefers-reduced-motion`. No exceptions.
- Default durations: 150–300ms. Anything longer needs a one-line justification in the PR description.
- Easings: ease-out or spring. No linear timing.
- Scroll-triggered reveals use `whileInView` with `once: true`. They animate in once and stay. No infinite loops.
- The hero avatar lights-on/off is the only "playful" animation. Everywhere else, motion serves transition, not delight.

---

## R7. Information that must NEVER appear on the public page

Even though they exist in `content/profile/*.md`:

- The contact email **`ngogiahuan23122003@gmail.com`** (account-only; not for public scraping). Public contact is `huanngdev@gmail.com`.
- Internal TODOs, draft notes, or `_(to add)_` placeholders. The page renders only confirmed content. If a field is unconfirmed, omit it — do not render the placeholder text.
- Comparisons or references to other people's portfolios (including chanhdai). The reference is private to this doc.

---

## R8. When in doubt: open chanhdai.com

Every visual or interaction question has an answer there. Inspect, match the spirit, then apply the deviations in R3 and the caps in R4–R5. Don't ask the user "should this be a card or just a section" — chanhdai already answered.

If chanhdai changes meaningfully in the future, update this document; don't silently drift away from it.
