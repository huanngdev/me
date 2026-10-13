import { LLMS_CATALOG } from "../llms/catalog.ts";

import type { ItemDefinition } from "./lib/build.ts";

/**
 * Items whose shadcn primitives must be Radix-based. They fail on Base UI styles (see
 * `next-src-base` in verify-install.ts), so the generator marks them `meta.primitives: "radix"`
 * when they depend on bare shadcn components.
 */
export const RADIX_ONLY_ITEMS: readonly string[] = [
  "audio-player",
  "video-player",
  "crm-data-table",
  "notion-like-editor",
];
export const RADIX_NOTE =
  "Requires Radix-based shadcn components. Base UI styles are not supported.";

/**
 * The registry items. Titles and descriptions come from the llms catalogue so the
 * two never disagree. `entries` are the public entry points; everything else is
 * found by crawling imports (see lib/build.ts).
 */

function catalogEntry(slug: string): { title: string; description: string } {
  const entry = LLMS_CATALOG.find((candidate) => candidate.slug === slug);
  if (entry === undefined) {
    throw new Error(`registry item ${slug} has no catalogue entry`);
  }
  return { title: entry.name, description: entry.description };
}

const SRC = "packages/core/src";

const VIDSTACK_BASE_CSS = "@vidstack/react/player/styles/base.css";
const VIDSTACK_CAPTIONS_CSS = "@vidstack/react/player/styles/default/captions.css";

export const ITEMS: readonly ItemDefinition[] = [
  {
    name: "github-contributions-3d",
    type: "registry:component",
    ...catalogEntry("github-contributions-3d"),
    sourcePrefix: "components/github-contributions-3d",
    targetRoot: "components/github-contributions-3d",
    entries: [`${SRC}/components/github-contributions-3d.tsx`],
  },
  {
    name: "shadcn-tags-input",
    type: "registry:component",
    ...catalogEntry("shadcn-tags-input"),
    sourcePrefix: "components/shadcn-tags-input",
    targetRoot: "components/shadcn-tags-input",
    entries: [`${SRC}/components/shadcn-tags-input/tags-input.tsx`],
  },
  {
    name: "scroll-minimap",
    type: "registry:component",
    ...catalogEntry("scroll-minimap"),
    sourcePrefix: "components/scroll-minimap",
    targetRoot: "components/scroll-minimap",
    entries: [`${SRC}/components/scroll-minimap.tsx`],
  },
  {
    name: "audio-player",
    type: "registry:component",
    ...catalogEntry("audio-player"),
    sourcePrefix: "components/audio-player",
    targetRoot: "components/audio-player",
    entries: [`${SRC}/components/audio-player/audio-player.tsx`],
    css: { [`@import "${VIDSTACK_BASE_CSS}"`]: {} },
  },
  {
    name: "video-player",
    type: "registry:component",
    ...catalogEntry("video-player"),
    sourcePrefix: "components/video-player",
    targetRoot: "components/video-player",
    entries: [
      `${SRC}/components/video-player/video-player.tsx`,
      `${SRC}/components/video-player/use-video-player.ts`,
    ],
    css: {
      [`@import "${VIDSTACK_BASE_CSS}"`]: {},
      [`@import "${VIDSTACK_CAPTIONS_CSS}"`]: {},
    },
  },
  {
    name: "zod-data-table",
    type: "registry:component",
    ...catalogEntry("zod-data-table"),
    sourcePrefix: "components/zod-data-table",
    targetRoot: "components/zod-data-table",
    entries: [`${SRC}/components/zod-data-table/zod-data-table.tsx`],
  },
  {
    name: "tile-treemap",
    type: "registry:component",
    ...catalogEntry("tile-treemap"),
    sourcePrefix: "components/tile-treemap",
    targetRoot: "components/tile-treemap",
    entries: [`${SRC}/components/tile-treemap.tsx`, `${SRC}/components/tile-treemap.utils.ts`],
  },
  {
    name: "crm-data-table",
    type: "registry:block",
    ...catalogEntry("crm-data-table"),
    sourcePrefix: "components/blocks/crm-data-table",
    targetRoot: "components/blocks/crm-data-table",
    entries: [
      `${SRC}/components/blocks/crm-data-table/crm-data-table-block.tsx`,
      `${SRC}/components/blocks/crm-data-table/crm-data-table.tsx`,
    ],
  },
  {
    name: "error-page",
    type: "registry:block",
    ...catalogEntry("error-page"),
    sourcePrefix: "components/blocks/error-page-block",
    targetRoot: "components/blocks/error-page",
    entries: [`${SRC}/components/blocks/error-page-block.tsx`],
    meta: { framework: "next" },
    docs: "Requires Next.js (uses next/link).",
  },
  {
    name: "notion-like-editor",
    type: "registry:block",
    ...catalogEntry("notion-like-editor"),
    sourcePrefix: "components/blocks/notion-like-editor",
    targetRoot: "components/blocks/notion-like-editor",
    entries: [
      `${SRC}/components/blocks/notion-like-editor/index.tsx`,
      `${SRC}/components/blocks/notion-like-editor/notion-like-editor-block.tsx`,
      `${SRC}/components/blocks/notion-like-editor/notion-like-editor-static.tsx`,
    ],
    exclude: ["__tests__/**", "demo/**", "notion-like-editor-demo.tsx", "*.test.*", "README.md"],
    styles: {
      selectors: [".slate-editor", ".editor-code"],
      utilities: ["link-underline"],
      variables: ["--editor-", "--color-editor-"],
    },
  },
];
