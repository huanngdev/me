import type { Doc } from "@/lib/docs";
import { SITE } from "@/lib/site";
import { FAQ } from "@/lib/faq";

/**
 * The structured data for the site. Plain objects, one builder per shape, so the pages only choose
 * which ones to render. No ratings, no review counts and no invented dates: fields that would need a
 * fact the project does not have are left out rather than filled with a guess.
 */

export type JsonLdNode = Record<string, unknown>;

const PUBLISHER: JsonLdNode = {
  "@type": "Person",
  name: SITE.author.name,
  url: SITE.author.url,
};

/** The home page: the app itself, plus the site it is published on. */
export function softwareApplicationJsonLd(): JsonLdNode[] {
  const image = `${SITE.url}/opengraph-image`;

  return [
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: SITE.name,
      applicationCategory: "DeveloperApplication",
      applicationSubCategory: "Rich text editor",
      operatingSystem: "Web",
      description: SITE.description,
      url: SITE.url,
      image,
      author: PUBLISHER,
      publisher: PUBLISHER,
      isAccessibleForFree: true,
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
      // No `license`: the repository has no LICENSE file and no `license` field, so there is nothing
      // to point at. `sameAs` links the source without claiming terms for it.
      sameAs: [SITE.repoUrl],
      keywords: [
        "notion-like editor",
        "block editor",
        "rich text editor",
        "React",
        "shadcn",
        "Plate",
        "Tailwind CSS",
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: SITE.name,
      url: SITE.url,
      description: SITE.description,
      publisher: PUBLISHER,
      inLanguage: "en",
    },
  ];
}

/** One doc page: the article, plus the trail back to the docs index. */
export function docJsonLd(doc: Doc): JsonLdNode[] {
  const url = `${SITE.url}${doc.slug === "" ? "/docs" : `/docs/${doc.slug}`}`;
  const title = doc.seoTitle ?? doc.title;

  return [
    {
      "@context": "https://schema.org",
      "@type": "TechArticle",
      headline: title,
      name: title,
      description: doc.description,
      url,
      mainEntityOfPage: url,
      image: `${SITE.url}${doc.slug === "" ? "/og/docs" : `/og/docs/${doc.slug}`}`,
      inLanguage: "en",
      author: PUBLISHER,
      publisher: PUBLISHER,
      about: {
        "@type": "SoftwareApplication",
        name: SITE.name,
        applicationCategory: "DeveloperApplication",
        operatingSystem: "Web",
      },
      isPartOf: {
        "@type": "WebSite",
        name: SITE.name,
        url: SITE.url,
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "richcn",
          item: SITE.url,
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "Docs",
          item: `${SITE.url}/docs`,
        },
        ...(doc.slug === ""
          ? []
          : [
              {
                "@type": "ListItem",
                position: 3,
                name: doc.title,
                item: url,
              },
            ]),
      ],
    },
  ];
}

/** The FAQ page, from the same array the page renders. */
export function faqJsonLd(): JsonLdNode {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    url: `${SITE.url}/docs/faq`,
    inLanguage: "en",
    mainEntity: FAQ.map((entry) => ({
      "@type": "Question",
      name: entry.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: entry.answer,
      },
    })),
  };
}
