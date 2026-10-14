"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@repo/core/lib/utils";

import { DOC_GROUPS, DOCS, docHref, docsInGroup } from "@/lib/docs";

/** The slug of the page that is open, or `""` when the path is not a docs page. */
function activeSlug(pathname: string): string {
  return pathname === "/docs" ? "" : pathname.replace(/^\/docs\//, "");
}

function NavGroups({ active }: { active: string }) {
  return (
    <div className="space-y-5">
      {DOC_GROUPS.map((group) => (
        <div key={group}>
          <p className="text-muted-foreground text-xs font-medium">{group}</p>
          <ul className="mt-2 space-y-0.5">
            {docsInGroup(group).map((doc) => {
              const isActive = doc.slug === active;

              return (
                <li key={doc.slug}>
                  <Link
                    href={docHref(doc.slug)}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "block rounded-md px-2 py-1 text-sm transition-colors",
                      isActive
                        ? "bg-muted text-foreground font-medium"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {doc.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** The desktop sidebar. Hidden below `lg`, where `DocsMobileNav` takes over. */
export function DocsSidebar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Docs"
      className="hidden lg:sticky lg:top-20 lg:block lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-y-auto lg:pr-2"
    >
      <NavGroups active={activeSlug(pathname)} />
    </nav>
  );
}

/** The compact "On this section" disclosure shown in place of the sidebar below `lg`. */
export function DocsMobileNav() {
  const pathname = usePathname();
  const active = activeSlug(pathname);
  const current = DOCS.find((doc) => doc.slug === active);

  return (
    <details className="border-border mb-8 rounded-lg border lg:hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm [&::-webkit-details-marker]:hidden">
        <span className="text-muted-foreground">On this section</span>
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate font-medium">{current?.title}</span>
          <ChevronDown aria-hidden="true" className="text-muted-foreground size-4 shrink-0" />
        </span>
      </summary>
      <div className="border-border border-t p-3">
        <NavGroups active={active} />
      </div>
    </details>
  );
}
