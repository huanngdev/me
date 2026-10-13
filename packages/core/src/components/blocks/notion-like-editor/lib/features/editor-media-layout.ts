import { cleanFileText } from "./editor-file-url";

// The layout of a media block that shows its media large: width, alignment and caption. The image and
// video blocks have it. The file and audio blocks have none. The image module re-exports these
// under its own names.

// Width is a percent of the editor column. Absence means the natural size, capped at 100%.
export const MEDIA_WIDTH_MIN = 10;
export const MEDIA_WIDTH_MAX = 100;

// Absence means center. Commands store the align they are given.
const MEDIA_ALIGNS = ["left", "center", "right"] as const;
export type MediaAlign = (typeof MEDIA_ALIGNS)[number];

export const MEDIA_CAPTION_MAX = 500;

// Keyboard steps on a resize handle. Shift uses the fine step.
const MEDIA_RESIZE_STEP = 5;
const MEDIA_RESIZE_FINE_STEP = 1;

export type MediaLayoutFields = {
  width?: number;
  align?: MediaAlign;
  caption?: string;
};

type CleanedMediaLayout = {
  fields: MediaLayoutFields;
  dropped: boolean; // true when a field was present and removed
};

export function isMediaWidth(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= MEDIA_WIDTH_MIN &&
    value <= MEDIA_WIDTH_MAX
  );
}

export function isMediaAlign(value: unknown): value is MediaAlign {
  return MEDIA_ALIGNS.some((align) => align === value);
}

// A stored caption is already cleaned and no longer than the limit.
export function isMediaCaption(value: unknown): value is string {
  return typeof value === "string" && cleanFileText(value, MEDIA_CAPTION_MAX) === value;
}

export function clampMediaWidth(value: number): number {
  return Math.min(MEDIA_WIDTH_MAX, Math.max(MEDIA_WIDTH_MIN, Math.round(value)));
}

// The rendered width of a media block as a whole percent of the column. Null when either is not laid
// out yet (an image that has not loaded renders 0px wide).
export function naturalMediaPercent(renderedPx: number, columnPx: number): number | undefined {
  if (!(columnPx > 0) || !(renderedPx > 0)) {
    return undefined;
  }

  return clampMediaWidth((renderedPx / columnPx) * 100);
}

// The width after a pointer drag on one handle. Dragging a handle outward grows the block. A centred
// block grows on both sides, so it changes twice as fast. `columnPx` is the editor column width.
export function dragMediaWidth(options: {
  start: number;
  deltaPx: number;
  columnPx: number;
  handle: "left" | "right";
  align: MediaAlign | undefined;
}): number {
  if (!(options.columnPx > 0)) {
    return clampMediaWidth(options.start);
  }

  const sides = options.align === undefined || options.align === "center" ? 2 : 1;
  const outward = options.handle === "right" ? options.deltaPx : -options.deltaPx;
  return clampMediaWidth(options.start + (sides * outward * 100) / options.columnPx);
}

// The width after a key on a resize handle, or null when the key is not a resize key.
export function keyMediaWidth(current: number, key: string, fine: boolean): number | null {
  const step = fine ? MEDIA_RESIZE_FINE_STEP : MEDIA_RESIZE_STEP;
  switch (key) {
    case "ArrowRight":
      return clampMediaWidth(current + step);
    case "ArrowLeft":
      return clampMediaWidth(current - step);
    case "Home":
      return MEDIA_WIDTH_MIN;
    case "End":
      return MEDIA_WIDTH_MAX;
    default:
      return null;
  }
}

// Cleans a raw caption, the way paste does. An empty caption is left out and sets `dropped`.
export function cleanMediaCaptionField(raw: Record<string, unknown>): {
  fields: { caption?: string };
  dropped: boolean;
} {
  if (!("caption" in raw)) {
    return { fields: {}, dropped: false };
  }

  const caption =
    typeof raw.caption === "string" ? cleanFileText(raw.caption, MEDIA_CAPTION_MAX) : undefined;
  return caption === undefined
    ? { fields: {}, dropped: true }
    : { fields: { caption }, dropped: false };
}

// Cleans the width, align and caption of a raw media block. A field that cannot be cleaned is left
// out and sets `dropped`.
export function cleanMediaLayoutFields(raw: Record<string, unknown>): CleanedMediaLayout {
  const fields: MediaLayoutFields = {};
  let dropped = false;

  if ("width" in raw) {
    if (isMediaWidth(raw.width)) {
      fields.width = raw.width;
    } else {
      dropped = true;
    }
  }

  if ("align" in raw) {
    if (isMediaAlign(raw.align)) {
      fields.align = raw.align;
    } else {
      dropped = true;
    }
  }

  const caption = cleanMediaCaptionField(raw);
  Object.assign(fields, caption.fields);
  dropped = dropped || caption.dropped;

  return { fields, dropped };
}
