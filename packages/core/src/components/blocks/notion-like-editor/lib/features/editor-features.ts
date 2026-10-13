import { KEYS } from "platejs";

import { AUDIO_KEY } from "./editor-audio";
import { BOOKMARK_KEY } from "./editor-bookmark-url";
import { EMBED_KEY } from "./editor-embed";
import { FILE_KEY } from "./editor-file";
import { IMAGE_KEY } from "./editor-image";
import { PAGE_LINK_KEY } from "./editor-page-link";
import { VIDEO_KEY } from "./editor-video";
import { FOOTNOTE_DEF_KEY, FOOTNOTE_REF_KEY } from "../document/editor-document-schema";

// The feature groups a host can turn off. Each one names what it hides in README.md, "Features".
export const EDITOR_FEATURES = [
  "media",
  "embeds",
  "tables",
  "columns",
  "code",
  "equations",
  "mentions",
  "pageLinks",
  "footnotes",
  "dates",
  "emoji",
  "toc",
  "find",
  "slashMenu",
  "selectionToolbar",
  "blockHandle",
] as const;

export type EditorFeature = (typeof EDITOR_FEATURES)[number];

// What a host passes. A feature is on unless it is set to false.
export type EditorFeatures = Partial<Record<EditorFeature, boolean>>;

export type ResolvedEditorFeatures = Record<EditorFeature, boolean>;

export const DEFAULT_EDITOR_FEATURES: ResolvedEditorFeatures = {
  media: true,
  embeds: true,
  tables: true,
  columns: true,
  code: true,
  equations: true,
  mentions: true,
  pageLinks: true,
  footnotes: true,
  dates: true,
  emoji: true,
  toc: true,
  find: true,
  slashMenu: true,
  selectionToolbar: true,
  blockHandle: true,
};

// Only the boolean false turns a feature off. Anything else, and any unknown key, is ignored.
// A value that is not an object gives the defaults.
export function resolveEditorFeatures(features?: EditorFeatures): ResolvedEditorFeatures {
  const source: unknown = features;
  const resolved: ResolvedEditorFeatures = { ...DEFAULT_EDITOR_FEATURES };
  if (typeof source !== "object" || source === null) {
    return resolved;
  }

  for (const feature of EDITOR_FEATURES) {
    if (Reflect.get(source, feature) === false) {
      resolved[feature] = false;
    }
  }
  return resolved;
}

// Two resolved values with the same flags have the same key, in the order of EDITOR_FEATURES.
export function editorFeaturesKey(resolved: ResolvedEditorFeatures): string {
  return JSON.stringify(EDITOR_FEATURES.map((feature) => resolved[feature]));
}

// Slash and picker item ids that a feature gates. An item not listed here is always available.
const ITEM_FEATURES = new Map<string, EditorFeature>([
  ["image", "media"],
  ["video", "media"],
  ["audio", "media"],
  ["file", "media"],
  ["embed", "embeds"],
  ["bookmark", "embeds"],
  ["table", "tables"],
  ["columns", "columns"],
  ["code", "code"],
  ["toc", "toc"],
  ["equation", "equations"],
  ["mention", "mentions"],
  ["page-link", "pageLinks"],
  ["footnote", "footnotes"],
]);

export function itemFeature(itemId: string): EditorFeature | undefined {
  return ITEM_FEATURES.get(itemId);
}

// The feature that gates a paste node type, or undefined when no feature does. A pasted node of a
// gated type with its feature off is read as its text, or as a dropped media label. It never
// becomes a node of that type. This is a function, not a table, so the key constants are read
// on each call and an import cycle cannot make them undefined.
export function nodeFeature(type: string): EditorFeature | undefined {
  switch (type) {
    case IMAGE_KEY:
    case FILE_KEY:
    case VIDEO_KEY:
    case AUDIO_KEY:
      return "media";
    case EMBED_KEY:
    case BOOKMARK_KEY:
      return "embeds";
    case KEYS.table:
    case KEYS.tr:
    case KEYS.td:
    case KEYS.th:
      return "tables";
    case KEYS.columnGroup:
    case KEYS.column:
      return "columns";
    case KEYS.codeBlock:
      return "code";
    case KEYS.equation:
    case KEYS.inlineEquation:
      return "equations";
    case KEYS.mention:
      return "mentions";
    case PAGE_LINK_KEY:
      return "pageLinks";
    case FOOTNOTE_REF_KEY:
    case FOOTNOTE_DEF_KEY:
      return "footnotes";
    case KEYS.date:
      return "dates";
    case KEYS.toc:
      return "toc";
    default:
      return undefined;
  }
}
