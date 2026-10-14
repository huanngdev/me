import { ArrowLeft, ArrowRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@repo/core/lib/utils";

import { JsonLd } from "@/components/json-ld";
import { docBySlug, docHref, docNeighbours, type Doc } from "@/lib/docs";
import { docJsonLd, type JsonLdNode } from "@/lib/json-ld";

export type DocPageProps = {
  /** The registry slug. `""` is the index at `/docs`. */
  slug: string;
  /** Structured data beyond the article and the breadcrumb, for example the FAQ page. */
  jsonLd?: readonly JsonLdNode[];
  children: ReactNode;
};

const LINK_CLASS =
  "border-border hover:bg-muted/50 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors";

function NeighbourLink({ doc, direction }: { doc: Doc; direction: "prev" | "next" }) {
  const isNext = direction === "next";

  return (
    <Link href={docHref(doc.slug)} className={cn(LINK_CLASS, isNext && "justify-between")}>
      {isNext ? null : <ArrowLeft aria-hidden="true" className="size-4 shrink-0" />}
      <span className="min-w-0">
        <span className="text-muted-foreground block text-xs">{isNext ? "Next" : "Previous"}</span>
        <span className="block truncate font-medium">{doc.title}</span>
      </span>
      {isNext ? <ArrowRight aria-hidden="true" className="size-4 shrink-0" /> : null}
    </Link>
  );
}

/**
 * One docs page: the `h1`, the lead description from the registry, the body, and prev/next links.
 * The page body is server-rendered; nothing here is interactive.
 */
export function DocPage({ slug, jsonLd, children }: DocPageProps) {
  const doc = docBySlug(slug);
  const { prev, next } = docNeighbours(slug);

  return (
    <article className="min-w-0">
      <JsonLd data={[...docJsonLd(doc), ...(jsonLd ?? [])]} />
      <header className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight text-balance">{doc.title}</h1>
        <p className="text-muted-foreground text-base leading-relaxed text-pretty">
          {doc.description}
        </p>
      </header>
      <div className="text-foreground/80 mt-8 space-y-8 text-base leading-relaxed">{children}</div>
      <nav
        aria-label="Docs pages"
        className="border-border mt-12 grid gap-3 border-t pt-6 sm:grid-cols-2"
      >
        {prev === undefined ? (
          <span className="hidden sm:block" />
        ) : (
          <NeighbourLink doc={prev} direction="prev" />
        )}
        {next === undefined ? null : <NeighbourLink doc={next} direction="next" />}
      </nav>
    </article>
  );
}
