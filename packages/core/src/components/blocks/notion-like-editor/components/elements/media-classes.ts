import { cn } from "@/lib/utils";

import { HR_SELECTED_CLASS_NAME } from "./hr-classes";

// The frame shared by the placeholder, uploading and failed rows of a media block, and the ready row
// of a file. A single-line row is about 44px tall. The icon is the first child, then the text
// column, then the actions.
export const MEDIA_ROW_CLASS =
  "bg-muted text-foreground flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm";

export const MEDIA_ICON_CLASS = "text-muted-foreground size-4 shrink-0";

// The caret-selected fill of a media block. It gets the same 3px outset as the grab selection, so the
// gap is equal on every side of the media.
const MEDIA_SELECTED_CLASS = `${HR_SELECTED_CLASS_NAME} rounded-md shadow-[0_0_0_3px_var(--muted)]`;

// A media block has no vertical padding inside its box. The space around it is outside the box, so
// the grey fill and the grab selection have the same gap above, below and at the sides.
export function mediaBlockClassName(
  selected: boolean,
  focused: boolean,
  readOnly: boolean,
): string {
  return cn("relative", selected && focused && !readOnly && MEDIA_SELECTED_CLASS);
}
