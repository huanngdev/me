import { docBySlug } from "@/lib/docs";
import { socialCard } from "@/lib/og-image";

/**
 * The social card for the docs index. The rest of the docs get their own card from the dynamic
 * route next to this file, generated at build time from the same registry. `ImageResponse` is a
 * `Response`, so a route handler can return it directly.
 */

export const dynamic = "force-static";

export function GET() {
  const doc = docBySlug("");

  return socialCard({
    eyebrow: "richcn docs",
    title: doc.seoTitle ?? doc.title,
  });
}
