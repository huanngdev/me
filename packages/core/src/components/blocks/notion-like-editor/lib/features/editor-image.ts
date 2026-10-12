import type { TElement } from "platejs";

import {
  cleanFileName,
  cleanFileText,
  isHttpFileUrl,
  sanitizeMimeType,
  sanitizeStoredFileUrl,
} from "./editor-file-url";
import {
  MEDIA_MIME_PREFIXES,
  isStoredMediaAttr,
  isStoredMediaSize,
  isStoredMediaUrl,
} from "./editor-media-source";

// The image block. The shared source fields (url, name, size, mime) are in editor-media-source.ts.
// The commands are in editor-image-commands.ts. This module imports no command code, so the static
// renderer can use it.

export const IMAGE_KEY = "image";

// Width is a percent of the editor column. Absence means the natural size, capped at 100%.
export const IMAGE_WIDTH_MIN = 10;
export const IMAGE_WIDTH_MAX = 100;

// Absence means center. Commands store the align they are given.
export const IMAGE_ALIGNS = ["left", "center", "right"] as const;
export type ImageAlign = (typeof IMAGE_ALIGNS)[number];

export const IMAGE_CAPTION_MAX = 500;
export const IMAGE_ID_MAX = 128;

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

export function isImageWidth(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= IMAGE_WIDTH_MIN &&
    value <= IMAGE_WIDTH_MAX
  );
}

export function isImageAlign(value: unknown): value is ImageAlign {
  return IMAGE_ALIGNS.some((align) => align === value);
}

// Keyboard steps on a resize handle. Shift uses the fine step.
export const IMAGE_RESIZE_STEP = 5;
export const IMAGE_RESIZE_FINE_STEP = 1;

export function clampImageWidth(value: number): number {
  return Math.min(IMAGE_WIDTH_MAX, Math.max(IMAGE_WIDTH_MIN, Math.round(value)));
}

// The rendered width of an image as a whole percent of the column. Null when either is not laid out
// yet (an image that has not loaded renders 0px wide).
export function naturalImagePercent(renderedPx: number, columnPx: number): number | undefined {
  if (!(columnPx > 0) || !(renderedPx > 0)) {
    return undefined;
  }

  return clampImageWidth((renderedPx / columnPx) * 100);
}

// The width after a pointer drag on one handle. Dragging a handle outward grows the image. A centred
// image grows on both sides, so it changes twice as fast. `columnPx` is the editor column width.
export function dragImageWidth(options: {
  start: number;
  deltaPx: number;
  columnPx: number;
  handle: "left" | "right";
  align: ImageAlign | undefined;
}): number {
  if (!(options.columnPx > 0)) {
    return clampImageWidth(options.start);
  }

  const sides = options.align === undefined || options.align === "center" ? 2 : 1;
  const outward = options.handle === "right" ? options.deltaPx : -options.deltaPx;
  return clampImageWidth(options.start + (sides * outward * 100) / options.columnPx);
}

// The width after a key on a resize handle, or null when the key is not a resize key.
export function keyImageWidth(current: number, key: string, fine: boolean): number | null {
  const step = fine ? IMAGE_RESIZE_FINE_STEP : IMAGE_RESIZE_STEP;
  switch (key) {
    case "ArrowRight":
      return clampImageWidth(current + step);
    case "ArrowLeft":
      return clampImageWidth(current - step);
    case "Home":
      return IMAGE_WIDTH_MIN;
    case "End":
      return IMAGE_WIDTH_MAX;
    default:
      return null;
  }
}

// A stored caption is already cleaned and no longer than the limit.
export function isImageCaption(value: unknown): value is string {
  return typeof value === "string" && cleanFileText(value, IMAGE_CAPTION_MAX) === value;
}

// The check for one stored image attribute. The validator uses it for each attribute the image has.
export function isStoredImageAttr(attr: string, value: unknown): boolean {
  switch (attr) {
    case "width":
      return isImageWidth(value);
    case "align":
      return isImageAlign(value);
    case "caption":
      return isImageCaption(value);
    default:
      return isStoredMediaAttr(attr, value, MEDIA_MIME_PREFIXES.image);
  }
}

// An embed link must be http or https. It is trimmed and at most 2048 characters.
export function sanitizeImageEmbedUrl(raw: unknown): string | null {
  const clean = sanitizeStoredFileUrl(raw);
  return clean !== null && isHttpFileUrl(clean) ? clean : null;
}

// Cleans each field of a raw image, the way paste does. A stored image comes out unchanged.
// A field that cannot be cleaned is left out and sets `dropped`.
export function cleanImageFields(raw: Record<string, unknown>): CleanedImage {
  const fields: ImageFields = {};
  let dropped = false;

  if ("url" in raw) {
    const url = sanitizeStoredFileUrl(raw.url);
    if (url !== null && isStoredMediaUrl(url)) {
      fields.url = url;
    } else {
      dropped = true;
    }
  }

  if ("name" in raw) {
    const name = typeof raw.name === "string" ? cleanFileName(raw.name) : undefined;
    if (name !== undefined) {
      fields.name = name;
    } else {
      dropped = true;
    }
  }

  if ("size" in raw) {
    if (isStoredMediaSize(raw.size)) {
      fields.size = raw.size;
    } else {
      dropped = true;
    }
  }

  if ("mime" in raw) {
    const mime = sanitizeMimeType(raw.mime);
    if (mime !== undefined && mime.startsWith(MEDIA_MIME_PREFIXES.image)) {
      fields.mime = mime;
    } else {
      dropped = true;
    }
  }

  if ("width" in raw) {
    if (isImageWidth(raw.width)) {
      fields.width = raw.width;
    } else {
      dropped = true;
    }
  }

  if ("align" in raw) {
    if (isImageAlign(raw.align)) {
      fields.align = raw.align;
    } else {
      dropped = true;
    }
  }

  if ("caption" in raw) {
    const caption =
      typeof raw.caption === "string" ? cleanFileText(raw.caption, IMAGE_CAPTION_MAX) : undefined;
    if (caption !== undefined) {
      fields.caption = caption;
    } else {
      dropped = true;
    }
  }

  return { fields, dropped };
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
