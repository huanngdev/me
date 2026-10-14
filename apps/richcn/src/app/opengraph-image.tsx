import { socialCard } from "@/lib/og-image";
import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE } from "@/lib/og";
import { SITE } from "@/lib/site";

/**
 * The home social card. The file convention is used here, so Next emits the `og:image` tags,
 * including the width, height and type, from this one file.
 */

export const alt = SITE.tagline;

export const size = OG_IMAGE_SIZE;

export const contentType = OG_IMAGE_CONTENT_TYPE;

export default function Image() {
  return socialCard({ eyebrow: SITE.name, title: SITE.tagline });
}
