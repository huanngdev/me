import type { TElement } from "platejs";

import {
  MEDIA_MIME_PREFIXES,
  cleanMediaSourceFields,
  isStoredMediaAttr,
  type MediaSource,
} from "./editor-media-source";
import {
  cleanMediaLayoutFields,
  isMediaAlign,
  isMediaCaption,
  isMediaWidth,
  type MediaLayoutFields,
} from "./editor-media-layout";

// The video block: a player for a video file, with the same width, alignment and caption as an
// image. The shared source fields are in editor-media-source.ts. The commands are in
// editor-video-commands.ts. This module imports no command code, so the static renderer can use it.

export const VIDEO_KEY = "video";

export const VIDEO_URL_REMOVED =
  "A video has an unsupported url. The video was cleared to an empty placeholder.";
export const VIDEO_ATTRS_CLEANED =
  "A video lost an attribute that is not valid. The video was kept.";

export type VideoFields = Partial<MediaSource> & MediaLayoutFields;

export type CleanedVideo = {
  fields: VideoFields;
  dropped: boolean; // true when a field was present and removed
};

// A literal list. The video fields are written in this order.
const VIDEO_FIELD_KEYS = [
  "url",
  "name",
  "size",
  "mime",
  "width",
  "align",
  "caption",
] as const satisfies readonly (keyof VideoFields)[];

// The check for one stored video attribute. A mime type must start with video/.
export function isStoredVideoAttr(attr: string, value: unknown): boolean {
  switch (attr) {
    case "width":
      return isMediaWidth(value);
    case "align":
      return isMediaAlign(value);
    case "caption":
      return isMediaCaption(value);
    default:
      return isStoredMediaAttr(attr, value, MEDIA_MIME_PREFIXES.video);
  }
}

// Cleans each field of a raw video block, the way paste does. A stored video comes out unchanged.
// A field that cannot be cleaned is left out and sets `dropped`.
export function cleanVideoFields(raw: Record<string, unknown>): CleanedVideo {
  const shared = cleanMediaSourceFields(raw, MEDIA_MIME_PREFIXES.video);
  const layout = cleanMediaLayoutFields(raw);
  const fields: VideoFields = { ...shared.fields, ...layout.fields };
  return { fields, dropped: shared.dropped || layout.dropped };
}

export function videoElement(fields: VideoFields, id?: string): TElement {
  const node: TElement = { type: VIDEO_KEY, children: [{ text: "" }] };
  if (id !== undefined) {
    node.id = id;
  }

  for (const key of VIDEO_FIELD_KEYS) {
    const value = fields[key];
    if (value !== undefined) {
      node[key] = value;
    }
  }
  return node;
}
