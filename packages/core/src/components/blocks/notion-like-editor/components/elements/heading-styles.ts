// A plugin className cannot derive a DOM id from the block id.
const HEADING_SIZE = {
  h1: "text-3xl",
  h2: "text-2xl",
  h3: "text-xl",
} as const;

const HEADING_MARGIN = {
  h1: "mt-8",
  h2: "mt-6",
  h3: "mt-4",
} as const;

// scroll-mt-24 is the in-page anchor offset used on component pages. The site
// header is sticky top-1 with an h-14 bar, and scrollIntoView({ block: "start" })
// then keeps a heading below that bar.
const HEADING_SCROLL = "scroll-mt-24";

export const HEADING_STYLES = {
  h1: `${HEADING_MARGIN.h1} ${HEADING_SIZE.h1} font-medium leading-tight text-foreground first:mt-0 ${HEADING_SCROLL}`,
  h2: `${HEADING_MARGIN.h2} ${HEADING_SIZE.h2} font-medium leading-tight text-foreground first:mt-0 ${HEADING_SCROLL}`,
  h3: `${HEADING_MARGIN.h3} ${HEADING_SIZE.h3} font-medium leading-tight text-foreground first:mt-0 ${HEADING_SCROLL}`,
} as const;

export type HeadingTag = keyof typeof HEADING_STYLES;

export { headingAnchorId } from "../../lib/features/heading-anchor";
