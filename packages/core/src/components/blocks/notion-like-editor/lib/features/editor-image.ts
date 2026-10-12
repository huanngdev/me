import type { TElement } from "platejs";

import {
  MEDIA_MIME_PREFIXES,
  cleanMediaSourceFields,
  isStoredMediaAttr,
  sanitizeMediaEmbedUrl,
} from "./editor-media-source";
import {
  MEDIA_ALIGNS,
  MEDIA_CAPTION_MAX,
  MEDIA_RESIZE_FINE_STEP,
  MEDIA_RESIZE_STEP,
  MEDIA_WIDTH_MAX,
  MEDIA_WIDTH_MIN,
  clampMediaWidth,
  cleanMediaLayoutFields,
  dragMediaWidth,
  isMediaAlign,
  isMediaCaption,
  isMediaWidth,
  keyMediaWidth,
  naturalMediaPercent,
  type MediaAlign,
} from "./editor-media-layout";

// The image block. The shared source fields (url, name, size, mime) are in editor-media-source.ts.
// Width, alignment and caption are in editor-media-layout.ts. The commands are in
// editor-image-commands.ts. This module imports no command code, so the static renderer can use it.

export const IMAGE_KEY = "image";

// The image names of the shared layout rules.
export const IMAGE_WIDTH_MIN = MEDIA_WIDTH_MIN;
export const IMAGE_WIDTH_MAX = MEDIA_WIDTH_MAX;
export const IMAGE_ALIGNS = MEDIA_ALIGNS;
export type ImageAlign = MediaAlign;
export const IMAGE_CAPTION_MAX = MEDIA_CAPTION_MAX;
export const IMAGE_RESIZE_STEP = MEDIA_RESIZE_STEP;
export const IMAGE_RESIZE_FINE_STEP = MEDIA_RESIZE_FINE_STEP;

export const IMAGE_URL_REMOVED =
  "An image has an unsupported url. The image was cleared to an empty placeholder.";
export const IMAGE_ATTRS_CLEANED =
  "An image lost an attribute that is not valid. The image was kept.";

export type ImageFields = {
  url?: string;
  name?: string;
  size?: number;
  mime?: string;
  width?: number;
  align?: ImageAlign;
  caption?: string;
};

export type CleanedImage = {
  fields: ImageFields;
  dropped: boolean; // true when a field was present and removed
};

// A literal list. The image fields are written in this order.
const IMAGE_FIELD_KEYS = [
  "url",
  "name",
  "size",
  "mime",
  "width",
  "align",
  "caption",
] as const satisfies readonly (keyof ImageFields)[];

export const isImageWidth = isMediaWidth;
export const isImageAlign = isMediaAlign;
export const isImageCaption = isMediaCaption;
export const clampImageWidth = clampMediaWidth;
export const naturalImagePercent = naturalMediaPercent;
export const dragImageWidth = dragMediaWidth;
export const keyImageWidth = keyMediaWidth;

// The check for one stored image attribute. The validator uses it for each attribute the image has.
export function isStoredImageAttr(attr: string, value: unknown): boolean {
  switch (attr) {
    case "width":
      return isMediaWidth(value);
    case "align":
      return isMediaAlign(value);
    case "caption":
      return isMediaCaption(value);
    default:
      return isStoredMediaAttr(attr, value, MEDIA_MIME_PREFIXES.image);
  }
}

// An embed link must be http or https. It is trimmed and at most 2048 characters.
export function sanitizeImageEmbedUrl(raw: unknown): string | null {
  return sanitizeMediaEmbedUrl(raw);
}

// Cleans each field of a raw image, the way paste does. A stored image comes out unchanged.
// A field that cannot be cleaned is left out and sets `dropped`.
export function cleanImageFields(raw: Record<string, unknown>): CleanedImage {
  const shared = cleanMediaSourceFields(raw, MEDIA_MIME_PREFIXES.image);
  const layout = cleanMediaLayoutFields(raw);
  const fields: ImageFields = { ...shared.fields, ...layout.fields };
  return { fields, dropped: shared.dropped || layout.dropped };
}

export function imageElement(fields: ImageFields, id?: string): TElement {
  const node: TElement = { type: IMAGE_KEY, children: [{ text: "" }] };
  if (id !== undefined) {
    node.id = id;
  }

  for (const key of IMAGE_FIELD_KEYS) {
    const value = fields[key];
    if (value !== undefined) {
      node[key] = value;
    }
  }
  return node;
}
