import Image from "next/image";

import { ShowcaseCard } from "./showcase-card";

export type BlockItem = {
  slug: string;
  name: string;
  snapshot: {
    lightSrc: string;
    darkSrc: string;
    alt: string;
  };
};

export const BLOCK_LIST: readonly BlockItem[] = [
  {
    slug: "crm-data-table",
    name: "CRM Data Table",
    snapshot: {
      lightSrc: "/images/blocks/crm-data-table-light.png",
      darkSrc: "/images/blocks/crm-data-table-dark.png",
      alt: "CRM customers table with sorting, filtering, and column controls",
    },
  },
  {
    slug: "error-page",
    name: "Error Page",
    snapshot: {
      lightSrc: "/images/blocks/error-page-light.png",
      darkSrc: "/images/blocks/error-page-dark.png",
      alt: "Centered 500 error page with a message and recovery actions",
    },
  },
  {
    slug: "notion-like-editor",
    name: "Notion-like Editor",
    snapshot: {
      lightSrc: "/images/blocks/notion-like-editor-light.png",
      darkSrc: "/images/blocks/notion-like-editor-dark.png",
      alt: "Notion-style editor with paragraphs, a line break, and saved text",
    },
  },
];

export const BLOCK_COUNT = BLOCK_LIST.length;

export function BlocksSection() {
  return (
    <ul className="grid grid-cols-1 sm:grid-cols-3">
      {BLOCK_LIST.map((block) => (
        <li key={block.slug} className="border-b p-3 sm:border-r">
          <ShowcaseCard
            href={`/blocks/${block.slug}`}
            name={block.name}
            linkLabel={`View ${block.name} block`}
          >
            <Image
              src={block.snapshot.lightSrc}
              alt={block.snapshot.alt}
              fill
              loading="eager"
              sizes="(min-width: 640px) 18rem, calc(100vw - 3.5rem)"
              className="object-cover dark:hidden"
            />
            <Image
              src={block.snapshot.darkSrc}
              alt={block.snapshot.alt}
              fill
              loading="eager"
              sizes="(min-width: 640px) 18rem, calc(100vw - 3.5rem)"
              className="hidden object-cover dark:block"
            />
          </ShowcaseCard>
        </li>
      ))}
    </ul>
  );
}
