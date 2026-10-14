/**
 * The social card's fixed facts. Kept free of `next/og` on purpose: the docs registry needs the
 * size, and the registry is imported by a client component (`components/docs/docs-nav.tsx`). The
 * renderer itself lives in `lib/og-image.tsx`, which is server-only.
 */

export const OG_IMAGE_SIZE = { width: 1200, height: 630 } as const;

export const OG_IMAGE_CONTENT_TYPE = "image/png";

/** Near-black, off-white, and the one muted violet taken from the site's accent hue. */
export const OG_IMAGE_COLORS = {
  background: "#0a0a0a",
  text: "#fafafa",
  muted: "#a1a1aa",
  accent: "#8877c8",
} as const;
