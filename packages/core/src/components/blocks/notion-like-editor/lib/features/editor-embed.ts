import type { TElement } from "platejs";

import {
  cleanMediaLayoutFields,
  isMediaAlign,
  isMediaCaption,
  isMediaWidth,
  type MediaLayoutFields,
} from "./editor-media-layout";
import {
  isEmbedHash,
  isEmbedVideoId,
  parseEmbedUrl,
  type EmbedProvider,
  type ParsedEmbed,
} from "./editor-embed-url";

// The embed block: a YouTube or Vimeo video that plays from its link. It has the video block's width,
// alignment and caption. The commands are in editor-embed-commands.ts. This module imports no command
// code, so the static renderer can use it.

export const EMBED_KEY = "embed";

export const EMBED_SOURCE_REMOVED =
  "An embed has a provider, video id or hash that is not valid. The embed was cleared to an empty placeholder.";
export const EMBED_ATTRS_CLEANED =
  "An embed lost an attribute that is not valid. The embed was kept.";

// The attributes that make up the video. A bad one clears the block, so they are read together.
export const EMBED_SOURCE_ATTRS = ["provider", "videoId", "hash", "startSeconds", "url"] as const;

// A literal list. The embed fields are written in this order.
export const EMBED_FIELD_KEYS = [
  "provider",
  "videoId",
  "hash",
  "startSeconds",
  "url",
  "width",
  "align",
  "caption",
] as const;

type EmbedFields = MediaLayoutFields & {
  provider?: EmbedProvider;
  videoId?: string;
  hash?: string;
  startSeconds?: number;
  url?: string; // the normalized https link the embed came from, for Open original
};

type CleanedEmbed = {
  fields: EmbedFields;
  dropped: boolean; // true when a field was present and removed
  cleared: boolean; // true when the source was not valid, so the block is a placeholder
};

// The check for one stored embed attribute. A url must parse as a YouTube or Vimeo link.
export function isStoredEmbedAttr(attr: string, value: unknown): boolean {
  switch (attr) {
    case "provider":
      return value === "youtube" || value === "vimeo";
    case "videoId":
      return (
        typeof value === "string" &&
        (isEmbedVideoId("youtube", value) || isEmbedVideoId("vimeo", value))
      );
    case "hash":
      return typeof value === "string" && isEmbedHash(value);
    case "startSeconds":
      return isStartSeconds(value);
    case "url":
      return typeof value === "string" && parseEmbedUrl(value) !== undefined;
    case "width":
      return isMediaWidth(value);
    case "align":
      return isMediaAlign(value);
    case "caption":
      return isMediaCaption(value);
    default:
      return false;
  }
}

function isStartSeconds(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

// The provider, id and hash together. A hash is only valid for Vimeo, and a key that is present must
// be valid. Undefined means the source is not valid.
function embedCore(
  raw: Record<string, unknown>,
): { provider: EmbedProvider; videoId: string; hash?: string } | undefined {
  const { provider, videoId } = raw;
  if (
    (provider !== "youtube" && provider !== "vimeo") ||
    typeof videoId !== "string" ||
    !isEmbedVideoId(provider, videoId)
  ) {
    return undefined;
  }

  if (!("hash" in raw)) {
    return { provider, videoId };
  }

  const hash = raw.hash;
  return provider === "vimeo" && typeof hash === "string" && isEmbedHash(hash)
    ? { provider, videoId, hash }
    : undefined;
}

// A url is kept only when it is a YouTube or Vimeo link for the same provider and id.
function sameSource(url: string, core: { provider: EmbedProvider; videoId: string }): boolean {
  const parsed = parseEmbedUrl(url);
  return (
    parsed !== undefined && parsed.provider === core.provider && parsed.videoId === core.videoId
  );
}

// Cleans each field of a raw embed block, the way the validator and paste do. A stored embed comes out
// unchanged. A bad provider, id or hash clears the source, and the layout stays. Any other bad field is
// left out and sets `dropped`. Keys the embed does not have are dropped too.
export function cleanEmbedFields(raw: Record<string, unknown>): CleanedEmbed {
  const layout = cleanMediaLayoutFields(raw);
  const touched = EMBED_SOURCE_ATTRS.some((key) => key in raw);
  const core = embedCore(raw);
  if (touched && core === undefined) {
    return { fields: layout.fields, dropped: true, cleared: true };
  }

  const fields: EmbedFields = { ...layout.fields };
  let dropped = layout.dropped;
  if (core !== undefined) {
    fields.provider = core.provider;
    fields.videoId = core.videoId;
    if (core.hash !== undefined) {
      fields.hash = core.hash;
    }
  }

  if ("startSeconds" in raw) {
    if (isStartSeconds(raw.startSeconds)) {
      fields.startSeconds = raw.startSeconds;
    } else {
      dropped = true;
    }
  }

  if ("url" in raw) {
    const url = raw.url;
    if (core !== undefined && typeof url === "string" && sameSource(url, core)) {
      fields.url = url;
    } else {
      dropped = true;
    }
  }

  const known = new Set<string>(["id", "type", "children", ...EMBED_FIELD_KEYS]);
  if (Object.keys(raw).some((key) => !known.has(key))) {
    dropped = true;
  }

  return { fields, dropped, cleared: false };
}

// The fields of a parsed link, as the block stores them.
export function embedFieldsOf(parsed: ParsedEmbed): EmbedFields {
  const fields: EmbedFields = { provider: parsed.provider, videoId: parsed.videoId };
  if (parsed.hash !== undefined) {
    fields.hash = parsed.hash;
  }
  if (parsed.startSeconds !== undefined) {
    fields.startSeconds = parsed.startSeconds;
  }
  fields.url = parsed.sourceUrl;
  return fields;
}

export function embedElement(fields: EmbedFields, id?: string): TElement {
  const node: TElement = { type: EMBED_KEY, children: [{ text: "" }] };
  if (id !== undefined) {
    node.id = id;
  }

  for (const key of EMBED_FIELD_KEYS) {
    const value = fields[key];
    if (value !== undefined) {
      node[key] = value;
    }
  }
  return node;
}

// Rewrites a raw embed block to its cleaned fields. Its id and children stay.
export function applyCleanedEmbed(node: Record<string, unknown>): void {
  const cleaned = cleanEmbedFields(node);
  for (const key of Object.keys(node)) {
    if (key !== "id" && key !== "type" && key !== "children") {
      Reflect.deleteProperty(node, key);
    }
  }
  Object.assign(node, cleaned.fields);
}
