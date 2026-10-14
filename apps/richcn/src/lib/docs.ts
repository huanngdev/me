import type { Metadata } from "next";

import { OG_IMAGE_SIZE } from "@/lib/og";
import { SITE } from "@/lib/site";

/**
 * The docs registry. One entry per page, in reading order: it feeds the sidebar, the prev/next
 * links, each page's metadata, the sitemap, `llms.txt` and the per-doc OG images.
 *
 * Facts behind every page live in `packages/core/src/components/blocks/notion-like-editor` — the
 * README and the code next to it. Nothing here is written from memory.
 */

export const DOC_GROUPS = ["Get started", "Guides", "Reference", "More"] as const;

export type DocGroup = (typeof DOC_GROUPS)[number];

export type DocEntry = {
  /** `""` is the index at `/docs`. */
  slug: string;
  /** The `h1` and the sidebar label. Short, because it is a navigation label first. */
  title: string;
  /**
   * The `<title>` of the page. Leads with the phrase people search for, and is allowed to be much
   * longer than the label. Falls back to `title`.
   */
  seoTitle?: string;
  /** One sentence, for a search result. */
  description: string;
  group: DocGroup;
};

export const DOCS: readonly DocEntry[] = [
  {
    slug: "",
    title: "Introduction",
    seoTitle: "Notion-like editor for React: docs and quick start",
    description:
      "What the editor is built on, what it deliberately leaves out, the stack it needs, and a three-step quick start for a new project.",
    group: "Get started",
  },
  {
    slug: "installation",
    title: "Installation",
    seoTitle: "Install the notion-like editor with one shadcn add",
    description:
      "Install the notion-like editor into a Next.js or Vite project with one shadcn command, and see the files, packages and CSS it adds.",
    group: "Get started",
  },
  {
    slug: "usage",
    title: "Usage",
    seoTitle: "React block editor: initialValue, onChange and readOnly",
    description:
      "Mount the editor, seed it with initialValue, read changes with onChange, and render a saved document on the server without the editing surface.",
    group: "Get started",
  },
  {
    slug: "persistence",
    title: "Persistence",
    seoTitle: "Save to your API with the editor persistence adapter",
    description:
      "Implement EditorPersistenceAdapter to save documents to your own API, or use the built-in localStorage adapter with its autosave debounce.",
    group: "Guides",
  },
  {
    slug: "file-uploads",
    title: "File uploads",
    seoTitle: "Custom file upload handler for the React block editor",
    description:
      "Implement FileUploadAdapter so images, video, audio and files can be stored, with progress reporting, cancellation and URL resolution.",
    group: "Guides",
  },
  {
    slug: "mentions-and-page-links",
    title: "Mentions and page links",
    seoTitle: "Mentions and page links with your own providers",
    description:
      "Wire a MentionProvider and a PageProvider so the editor can search and resolve people and pages, and handle page clicks with onOpenPage.",
    group: "Guides",
  },
  {
    slug: "features",
    title: "Feature switches",
    seoTitle: "Turn editor features off: tables, media, slash menu",
    description:
      "Turn whole feature groups off with the features prop, from tables and media to the slash menu and block handle, without touching saved documents.",
    group: "Guides",
  },
  {
    slug: "options",
    title: "Options",
    seoTitle: "Editor options: handle spacing, autosave debounce, hints",
    description:
      "Every field of the options prop with its type and default: block handle spacing, autosave debounce, shortcut hints and the tail click.",
    group: "Guides",
  },
  {
    slug: "theming",
    title: "Theming",
    seoTitle: "Theme the editor with CSS variables and dark mode",
    description:
      "The editor's CSS variables, how to override them on an ancestor, the dark mode values, and how to widen or narrow the editing column.",
    group: "Guides",
  },
  {
    slug: "props",
    title: "Props",
    seoTitle: "Editor props reference: NotionLikeEditorBlock and Static",
    description:
      "The complete prop list for NotionLikeEditorBlock and NotionLikeEditorStatic, with the type, the default and the effect of every field.",
    group: "Reference",
  },
  {
    slug: "keyboard-shortcuts",
    title: "Keyboard shortcuts",
    seoTitle: "Keyboard shortcuts in the React block editor",
    description:
      "Every keyboard shortcut in the editor, on macOS and on Windows or Linux, from bold and headings through find, links and block selection.",
    group: "Reference",
  },
  {
    slug: "document-format",
    title: "Document format",
    seoTitle: "Document format: the JSON schema and its limits",
    description:
      "The JSON document envelope, its schema version and size limits, what the validator accepts, and what happens to content it rejects.",
    group: "Reference",
  },
  {
    slug: "known-limits",
    title: "Known limits",
    seoTitle: "Known limits of the notion-like editor",
    description:
      "The limits the editor has today: undo depth, table size, paste caps, PDF preview, touch support and the browser coverage that was measured.",
    group: "More",
  },
  {
    slug: "faq",
    title: "FAQ",
    seoTitle: "Notion-like editor FAQ: Vite, Base UI, uploads, autosave",
    description:
      "Short answers to the questions developers ask first: Vite, Base UI, saving to a database, uploads, collaboration, read-only rendering and tables.",
    group: "More",
  },
  {
    slug: "agent-skills",
    title: "Agent skill",
    seoTitle: "Agent skill for the notion-like editor",
    description:
      "An Agent Skill that teaches a coding agent how to install, mount and customise the notion-like editor using the installed types.",
    group: "More",
  },
];

/**
 * The element type. `DOCS` is not `as const`: every entry carries `seoTitle`, and a literal tuple
 * would make the field non-nullable, which in turn narrows `doc.seoTitle ?? doc.title` to `never` on
 * the right-hand side.
 */
export type Doc = DocEntry;

/** The `/docs` path for a slug, or the index itself. */
export function docHref(slug: string): string {
  return slug === "" ? "/docs" : `/docs/${slug}`;
}

/**
 * The path of a doc's social card. One route handler serves them all, generated at build time from
 * the same registry the pages come from.
 */
export function ogImagePath(slug: string): string {
  return slug === "" ? "/og/docs" : `/og/docs/${slug}`;
}

export function docBySlug(slug: string): Doc {
  const found = DOCS.find((doc) => doc.slug === slug);
  if (found === undefined) {
    throw new Error(`No docs page has the slug ${JSON.stringify(slug)}.`);
  }

  return found;
}

export function docsInGroup(group: DocGroup): Doc[] {
  return DOCS.filter((doc) => doc.group === group);
}

/** Reading order is the order of `DOCS`, so prev/next also cross group boundaries. */
export function docNeighbours(slug: string): { prev?: Doc; next?: Doc } {
  const index = DOCS.findIndex((doc) => doc.slug === slug);
  if (index === -1) {
    throw new Error(`No docs page has the slug ${JSON.stringify(slug)}.`);
  }

  return { prev: DOCS.at(index - 1), next: DOCS.at(index + 1) };
}

/**
 * The metadata for one docs page: the search-facing title and the description from the registry, a
 * canonical path, and the per-page Open Graph image. The absolute URLs come from `metadataBase`,
 * which the root layout sets.
 */
export function docMetadata(slug: string): Metadata {
  const doc = docBySlug(slug);
  const image = {
    url: `${SITE.url}${ogImagePath(slug)}`,
    width: OG_IMAGE_SIZE.width,
    height: OG_IMAGE_SIZE.height,
    alt: `${doc.seoTitle ?? doc.title} — richcn docs`,
  };

  return {
    title: doc.seoTitle ?? doc.title,
    description: doc.description,
    alternates: { canonical: docHref(slug) },
    openGraph: {
      type: "article",
      title: doc.seoTitle ?? doc.title,
      description: doc.description,
      url: docHref(slug),
      siteName: SITE.name,
      locale: "en_US",
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title: doc.seoTitle ?? doc.title,
      description: doc.description,
      images: [image],
    },
  };
}
