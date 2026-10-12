import type { CSSProperties } from "react";

import type { ImageAlign } from "../../lib/features/editor-image";

export const IMAGE_ROW_CLASS =
  "text-muted-foreground flex min-h-16 items-center justify-center gap-2 rounded-xl border border-dashed border-border px-4 py-6 text-sm";

export const IMAGE_SKELETON_CLASS = "aspect-video w-full rounded-xl";

export const IMAGE_CAPTION_CLASS = "text-muted-foreground mt-2 text-sm";

const ALIGN_CLASSES: Readonly<Record<ImageAlign, string>> = {
  left: "mr-auto",
  center: "mx-auto",
  right: "ml-auto",
};

// Absence of align is center.
export function imageAlignClass(align: ImageAlign | undefined): string {
  return ALIGN_CLASSES[align ?? "center"];
}

// Absence of width is the natural size, so the figure shrinks to fit.
export function imageFigureClassName(
  width: number | undefined,
  align: ImageAlign | undefined,
): string {
  const parts = ["flex max-w-full flex-col", imageAlignClass(align)];
  if (width === undefined) {
    parts.push("w-fit");
  }
  return parts.join(" ");
}

export function imageFigureStyle(width: number | undefined): CSSProperties | undefined {
  return width === undefined ? undefined : { width: `${width}%` };
}

// The loading box takes the figure's width, or the full column when there is no width yet.
export function imageLoadingStyle(width: number | undefined): CSSProperties {
  return { width: `${width ?? 100}%` };
}

export function imageMediaClassName(width: number | undefined): string {
  const size = width === undefined ? "h-auto max-w-full" : "h-auto w-full";
  return `block ${size} rounded-xl border border-border`;
}
