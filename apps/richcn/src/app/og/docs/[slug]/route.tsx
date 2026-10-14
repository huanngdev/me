import { DOCS } from "@/lib/docs";
import { socialCard } from "@/lib/og-image";

/**
 * One shared generator for every doc social card, parameterised by the slug. `generateStaticParams`
 * builds one image per doc at build time, so the set follows the registry and cannot go stale.
 * Unknown slugs are not generated and answer 404.
 */

export function generateStaticParams() {
  return DOCS.filter((doc) => doc.slug !== "").map((doc) => ({ slug: doc.slug }));
}

/** Only the slugs in the registry exist. Anything else is a 404, not a request-time render. */
export const dynamicParams = false;

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = DOCS.find((candidate) => candidate.slug === slug);
  if (doc === undefined) {
    return new Response("No doc has that slug.", { status: 404 });
  }

  return socialCard({
    eyebrow: "richcn docs",
    title: doc.seoTitle ?? doc.title,
  });
}
