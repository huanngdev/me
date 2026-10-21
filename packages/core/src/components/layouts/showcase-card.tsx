import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

export type ShowcaseCardProps = {
  href: string;
  name: string;
  /** Accessible name of the overlay link, e.g. "View CRM Data Table block". */
  linkLabel: string;
  /** The aspect-video media area: snapshot images, a live preview, or an icon. */
  children: ReactNode;
};

export function ShowcaseCard({ href, name, linkLabel, children }: ShowcaseCardProps) {
  return (
    <article className="group relative overflow-hidden rounded-xl border">
      <div className="relative aspect-video w-full overflow-hidden">{children}</div>
      <div className="flex items-center gap-3 border-t px-3 py-2.5">
        <h2 className="min-w-0 flex-1 truncate text-sm font-medium">{name}</h2>
        <ArrowUpRight className="text-muted-foreground mt-0.5 size-4 shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
      </div>
      <Link
        href={href}
        aria-label={linkLabel}
        className="focus-visible:ring-ring absolute inset-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-inset"
      />
    </article>
  );
}
