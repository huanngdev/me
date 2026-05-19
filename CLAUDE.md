# CLAUDE.md — Personal Portfolio

## Project overview

A personal developer portfolio website for Ngo Gia — Fullstack Developer with a focus on Next.js ecosystem, blockchain (Sui), and product engineering. The site serves as a living resume, writing space, and project showcase. Tone is quiet confidence: the work speaks, not the decoration.

---

## Visual identity

### Design philosophy

Minimal and typographic-first. Every element earns its space. No decorative noise. The site feels like a well-crafted developer tool, not a marketing page. Inspired by chanhdai.com, tailwindcss.com, and shadcn/ui — clean grids, thoughtful whitespace, sharp hierarchy.

### Color palette

The base palette is near-neutral with a single accent ramp:

- **Background** — off-white in light mode, near-black (not pure black) in dark mode. The background has a very subtle warm tint to avoid clinical flatness.
- **Text** — high contrast primary, medium-contrast secondary for metadata and captions. Tertiary for timestamps and decorative labels.
- **Accent** — a muted purple / violet. Used sparingly: active states, hover underlines, tag pills, and gradient text in the hero. Never screaming, always deliberate.
- **Border** — single-pixel, low-opacity. Separates sections without visual weight.
- **Code blocks** — slightly darker surface than the page background, monospace font, subtle left-border accent.

Dark mode is first-class, not an afterthought. Every design decision is checked in both modes.

### Typography

Two fonts only:

- **Sans** — primary body and UI font. Clean, geometric, high legibility at small sizes (Geist Sans or Inter). Used for all body text, headings, navigation, and labels.
- **Mono** — for code snippets, tech tags, and timestamps. Subtle distinction from prose (Geist Mono or JetBrains Mono).

Type scale is restrained: large display heading in the hero, then a clean step-down through h2, h3, body, small, and caption. No decorative headline fonts. No mixed weights beyond regular and medium.

### Spacing and layout

Single-column content column, centered, max-width ~700px for reading comfort. Navigation is minimal — a sticky top bar with name on the left, nav links on the right, a theme toggle. Page sections breathe with generous vertical spacing. Section dividers are invisible or a single thin line — no cards, no colored banners.

---

## Sections and their purpose

### Hero

The first thing a visitor sees. Avatar image (with a subtle interactive hover state — lights on/off effect inspired by chanhdai.com), full name, one-line tagline, current role and location. Social links as small icon buttons. Local time displayed live. The tone is calm and personal, not a sales pitch.

### About

Two to four short bullet points or a compact paragraph. Describes who Ngo Gia is as an engineer: what he builds, what he cares about, notable metrics or projects. Concise — the experience section handles the full history.

### Tech stack

An icon grid of technologies Ngo Gia actively uses. Grouped loosely (languages, frameworks, tools). Each icon has a label. Hovering an icon shows a faint highlight. No ratings, no progress bars — those are noise.

### Experience

A vertical timeline of jobs, freelance work, and education. Each entry shows company name (with logo), role, employment type, period, duration, and bullet points for responsibilities and tech used. The most recent entry is at the top. Collapsible for older entries to keep the page tight.

### Projects

A grid or list of personal and open-source projects. Each project card shows: project logo or icon, name, short description, period, live link, source link, and tech tags. Hackathon projects (SealPass, AfterVault) are highlighted. Cards are flat — no heavy shadows or gradients.

### GitHub contributions

A heatmap of GitHub activity for the current year, pulled via the GitHub API or static data. Small, tucked in, shows consistent activity at a glance. Clicking opens GitHub profile.

### Blog

A list of published posts. Each entry shows title, publish date, and optionally a one-line description. Sorted by date descending. Powered by MDX with full syntax highlighting for code blocks. Posts live at `/blog/[slug]`. The blog page supports filtering by tag.

### Components (optional but high-impact)

A showcase of UI components Ngo Gia has built — interactive demos embedded directly on the page. Demonstrates frontend craftsmanship beyond what words can say. Each component has a name, short description, and live demo. This section separates good portfolios from great ones.

### Bookmarks

A curated list of articles, tools, and resources Ngo Gia finds valuable. Shows title, author, source, and date bookmarked. Treated as a public reading log, not a link dump.

### Awards and certifications

A compact list of hackathon placements, competition prizes, and certifications. Shows prize, issuing body, date, and optional evidence link. Collapsible after the first few entries.

### Testimonials

Social proof from colleagues, open-source maintainers, or hackathon judges. Displayed as quote cards with attribution. Links to original source (tweet, LinkedIn, etc.) where possible.

---

## Command palette

A `⌘K` command palette accessible from anywhere on the site. Opens a modal with a search input. Supports: navigating to any section or page, toggling dark/light mode, switching language between Vietnamese and English, opening social links, copying contact info. Built with `cmdk`. This is the most distinctive UX feature of the site.

---

## Internationalization (i18n)

The site supports two languages: **Vietnamese (vi)** and **English (en)**. English is the default — it reaches a broader audience and is expected by international recruiters. Vietnamese is the secondary locale, for local context and personal connection.

### Implementation approach

Built with `next-intl`. Locale is stored in the URL path prefix: `/en/...` and `/vi/...`. The root path `/` redirects to the detected locale based on the browser's `Accept-Language` header, falling back to English. All routes are available in both locales — there are no English-only or Vietnamese-only pages.

### What gets translated

**All UI strings** — navigation labels, section headings, button text, metadata labels (period, duration, employment type), placeholder text, command palette commands, error messages, and the "show more / show less" controls.

**Bio and about section** — written separately in each language. The Vietnamese version can be slightly warmer and more personal in tone. The English version is crisper and more formal.

**Project descriptions** — short descriptions on project cards are translated. The detailed project content (if any) is also available in both languages.

**Blog posts** — a post does not need to exist in both languages. If a Vietnamese post has no English translation, the English locale falls back to showing the Vietnamese original with a notice banner: "This post is only available in Vietnamese." The reverse applies for English-only posts. The blog list filters to posts available in the active locale by default, with an option to show all.

**Experience and education** — role titles stay in English (they are proper names). Company names and school names are not translated. Bullet point descriptions under each role are translated.

**Awards and certifications** — award names stay in their original language. The issuing body name stays as-is. Descriptive context around them is translated.

**Timestamps and dates** — formatted according to locale conventions. Vietnamese uses `DD/MM/YYYY`, English uses `MMM DD, YYYY` (e.g. "May 19, 2026"). Relative time ("2 years ago" / "2 năm trước") uses the locale-aware format.

**SEO metadata** — each locale has its own `<title>`, `<meta description>`, and Open Graph tags. `hreflang` alternates are set on every page pointing to the equivalent page in the other locale. The sitemap includes both locale variants.

**RSS feed** — two separate feeds: `/en/rss.xml` and `/vi/rss.xml`, each containing only posts in that language.

### What does NOT get translated

- Tech stack icon labels — technology names are universal (TypeScript, Docker, etc.)
- Project and company URLs
- Code blocks inside blog posts
- Dates in code or technical content
- The avatar and visual assets

### Language switcher UI

A small toggle in the navigation bar, to the left of the theme toggle. Displays the current locale as a short label: `EN` or `VI`. Clicking it switches to the other locale and navigates to the equivalent page in the new locale, preserving the current path. No dropdown — with only two languages, a direct toggle is faster and cleaner.

The switcher is also available as a command in the `⌘K` palette: "Switch to Vietnamese" / "Switch to English".

### Language switcher animation

Switching locale triggers a brief fade-out and fade-in of the page content (150ms each, opacity only — no layout shift). The URL updates instantly. The transition signals that content has changed without being disruptive.

### Content authoring

Translation strings for UI live in JSON locale files — one file per language, flat key-value structure with namespaces by section (e.g. `nav.blog`, `hero.tagline`, `experience.present`). Blog and project content live as separate MDX files per locale, co-located by slug. The content schema enforces that both locale variants share the same frontmatter fields (title, date, tags) so the list view can render consistently regardless of active language.

---

## Animations

All animations follow a single principle: **motion serves meaning, not decoration**. Animations communicate state, guide attention, or make interactions feel physical. Nothing plays on loop purely for aesthetics.

### Philosophy

- **Subtle and fast.** Most transitions are 150–300ms. Nothing drags.
- **Easing always.** Linear motion feels robotic. Everything uses an ease-out or spring curve.
- **Reduced motion respected.** All animations check `prefers-reduced-motion` and either disable or reduce to a simple fade.
- **Never distract from content.** If an animation is noticed more than the content it reveals, it's too much.

### Specific animations

**Page load / initial render**
Content fades in and rises slightly (8–12px translateY) as it enters the viewport. Staggered by section — not all at once. The hero loads first, then subsequent sections animate in as the user scrolls.

**Scroll-triggered reveals**
Sections and list items animate in as they enter the viewport. Uses Framer Motion's `whileInView` with a `once: true` flag — they animate in once and stay. The delay between staggered items is short (30–60ms) to feel snappy.

**Hero avatar — lights interaction**
The avatar has two states: lights off (default) and lights on (hover/focus). Transitioning between them is a crossfade of two images. This is the one playful, distinctive interaction on the site.

**Link and button hovers**
Nav links use an animated underline that grows from left to right on hover. Buttons have a subtle scale (0.97 on press) to feel physical. Icon links have a slight upward translate on hover.

**Command palette**
Opens with a scale-in (from 0.95 to 1.0) and fade. Closes with reverse. The backdrop fades in separately. Filter/search results animate in as a list — items slide in from slightly below with a stagger.

**Blog post transitions**
When navigating to a blog post, the title of the post in the list expands into the post heading via a shared layout animation (Framer Motion `layoutId`). This is optional but very polished if implemented.

**Tech stack icons**
On hover, individual tech icons scale up slightly (1.1×) with a spring easing. No bouncing, just a gentle pop.

**GitHub heatmap**
Cells fade in with a stagger on initial render — left to right, week by week. Very fast (total duration ~500ms). Each cell has a hover state showing contribution count in a tooltip.

**Experience timeline**
Timeline entries animate in from the left as the user scrolls down. The connecting vertical line draws itself downward using a `scaleY` transform from 0 to 1 as each entry appears.

**Dark/light mode toggle**
The icon morphs between sun and moon. The page background transitions smoothly via a CSS transition on the root background-color (not a flash).

---

## SEO and metadata

Every page has a unique `<title>`, `<meta description>`, and Open Graph block in both locales. Blog posts generate dynamic OG images using `@vercel/og` — the post title rendered in the site's font on a dark or light branded card. The homepage OG image is a static branded asset. `hreflang` alternate links are set on every page pointing to the equivalent URL in the other locale. `/sitemap.xml` includes both `/en/...` and `/vi/...` variants for all pages. `/robots.txt` is generated at build time. `/en/rss.xml` and `/vi/rss.xml` expose blog posts per locale. `/llms.txt` exposes a plain-text summary of the site for AI agents.

---

## Content management

Blog posts and bookmarks are authored as MDX files in the repository. No CMS. Velite (or Contentlayer) handles the MDX pipeline — frontmatter parsing, schema validation, and build-time type generation. The result is a fully typed content layer with zero runtime overhead.

Content is split by locale: each blog post has a `[slug].en.mdx` and optionally a `[slug].vi.mdx` sibling. The pipeline resolves the correct file for the active locale and falls back gracefully when a translation is missing. UI translation strings are plain JSON files, one per locale, organized by section namespace.

---

## Performance targets

- Lighthouse score ≥ 95 across all categories on desktop.
- No layout shift. All images have explicit dimensions. Fonts are preloaded and self-hosted.
- Zero client-side data fetching on initial load — everything is statically generated or server-rendered at build time except the GitHub heatmap (ISR, revalidate every 24h) and the live clock in the hero.

---

## Tone and voice

Writing on the site — bio, project descriptions, blog posts — is direct, specific, and free of buzzwords. "Built a decentralized password manager using Sui blockchain, Seal encryption, and Walrus blob storage" is better than "Developed an innovative Web3 security solution." Metrics and concrete outcomes over vague adjectives.
