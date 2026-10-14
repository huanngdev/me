// Shared by the editor elements and the static renderer, so both produce the same markup.
// The reference is a superscript with line-height 0, so it does not grow the line box.
const FOOTNOTE_REF_CLASS =
  "text-[0.75em] font-medium text-muted-foreground px-0.5 rounded-sm cursor-pointer select-none";
const FOOTNOTE_REF_SELECTED_CLASS = "bg-muted text-foreground";

export function footnoteRefClassName(selected: boolean): string {
  return selected ? `${FOOTNOTE_REF_CLASS} ${FOOTNOTE_REF_SELECTED_CLASS}` : FOOTNOTE_REF_CLASS;
}

export const FOOTNOTE_DEF_CLASS = "flex items-baseline gap-2 text-sm";
// The first definition of a run gets a thin separator above the footnote list. The line is a
// pseudo-element 12px above the block, so the block's box starts at its text line. The
// 36px margin leaves 24px of space above the line, as the old padded box did.
export const FOOTNOTE_DEF_RUN_CLASS =
  "relative mt-9 before:absolute before:inset-x-0 before:-top-3 before:border-t before:content-['']";
export const FOOTNOTE_NUMBER_CLASS =
  "min-w-5 shrink-0 select-none text-right tabular-nums text-muted-foreground";
export const FOOTNOTE_NUMBER_LINK_CLASS = "cursor-pointer";
export const FOOTNOTE_TEXT_CLASS = "min-w-0 flex-1";
