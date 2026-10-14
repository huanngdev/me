import type { MetadataRoute } from "next";

import { DOCS, docHref } from "@/lib/docs";
import { SITE } from "@/lib/site";

/**
 * Every page the site publishes, from the same registry the pages and the sidebar come from. No doc
 * is left out: the index, all fourteen guides and reference pages, and the home page.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return [
    {
      url: SITE.url,
      lastModified,
      changeFrequency: "weekly",
      priority: 1,
    },
    ...DOCS.map((doc) => ({
      url: `${SITE.url}${docHref(doc.slug)}`,
      lastModified,
      changeFrequency: "monthly" as const,
      // The docs index sits below the home page and above the individual pages.
      priority: doc.slug === "" ? 0.9 : 0.8,
    })),
  ];
}
