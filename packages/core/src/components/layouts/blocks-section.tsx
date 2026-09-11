import { ArrowUpRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

type BlockItem = {
  slug: string;
  name: string;
  snapshot: {
    lightSrc: string;
    darkSrc: string;
    alt: string;
  };
};

const BLOCK_LIST: readonly BlockItem[] = [
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
];

export const BLOCK_COUNT = BLOCK_LIST.length;

export function BlocksSection() {
  return (
    <ul className="grid grid-cols-1 sm:grid-cols-3">
      {BLOCK_LIST.map((block) => (
        <li key={block.slug} className="border-b p-3 sm:border-r">
          <article className="group relative overflow-hidden rounded-xl border">
            <div className="relative aspect-video w-full overflow-hidden">
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
            </div>
            <div className="flex items-center gap-3 border-t px-3 py-2.5">
              <h2 className="min-w-0 flex-1 truncate text-sm font-medium">{block.name}</h2>
              <ArrowUpRight className="text-muted-foreground mt-0.5 size-4 shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </div>
            <Link
              href={`/blocks/${block.slug}`}
              aria-label={`View ${block.name} block`}
              className="focus-visible:ring-ring absolute inset-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-inset"
            />
          </article>
        </li>
      ))}
    </ul>
  );
}
