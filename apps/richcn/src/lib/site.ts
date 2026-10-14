const COFFEE_SLUG = "huanngdevf";

const NAME = "richcn";
const TAGLINE = "Notion-style block editor for React and shadcn/ui";

/**
 * The home `<title>`, brand included. `title.template` only applies to **child** route segments, and
 * the home page is the same segment as the root layout, so the root page states the whole string
 * rather than relying on the `%s — richcn` template. The template itself is `%s — ${NAME}`.
 */
const TITLE = `${TAGLINE} — ${NAME}`;

/**
 * `NEXT_PUBLIC_SITE_URL` overrides the public origin, for a preview deployment or a domain change.
 * A trailing slash is stripped, so `new URL(path, SITE.url)` never produces a double slash.
 */
const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://richcn.huanngdev.site").replace(
  /\/+$/,
  "",
);

export const SITE = {
  url: siteUrl,
  name: NAME,
  tagline: TAGLINE,
  /** The full home title, brand included. Used by the home page, the OG card and `manifest`. */
  title: TITLE,
  /** The home page description, and the default for pages that do not set their own. */
  description:
    "A Plate-based block editor you install with shadcn: slash menu, tables, media blocks, mentions and a persistence adapter with autosave.",
  author: {
    name: "Ngo Gia",
    url: "https://github.com/huanngdev",
  },
  repoSlug: "huanngdev/me",
  repoUrl: "https://github.com/huanngdev/me",
  coffeeUrl: `https://buymeacoffee.com/${COFFEE_SLUG}`,
  editorSourceUrl:
    "https://github.com/huanngdev/me/tree/main/packages/core/src/components/blocks/notion-like-editor",
  skillUrl: "https://github.com/huanngdev/me/tree/main/skills/richcn-editor",
} as const;
