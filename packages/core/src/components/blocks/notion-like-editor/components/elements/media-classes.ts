// The frame shared by the placeholder, uploading and failed rows of a media block, and the ready row
// of a file. A single-line row is about 44px tall. The icon is the first child, then the text
// column, then the actions.
export const MEDIA_ROW_CLASS =
  "bg-muted text-foreground flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm";

export const MEDIA_ICON_CLASS = "text-muted-foreground size-4 shrink-0";

// The card of a ready audio block: a frame with the name and size on the first line and the player
// under them, full width.
export const MEDIA_CARD_CLASS =
  "bg-muted text-foreground flex w-full flex-col gap-2 rounded-md px-3 py-2.5 text-sm";
