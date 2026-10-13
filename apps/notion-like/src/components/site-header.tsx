import { Button } from "@repo/core/components/button";
import { Coffee } from "lucide-react";
import Link from "next/link";

import { SITE } from "@/lib/site";

import { GitHubLink } from "./github-link";
import { SiteNav } from "./site-nav";
import { ThemeToggle } from "./theme-toggle";

export function SiteHeader() {
  return (
    <header className="bg-background/80 sticky top-0 z-40 w-full border-b backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-2 px-2 sm:px-4">
        <div className="flex min-w-0 items-center gap-2 sm:gap-4">
          <Link href="/" className="shrink-0 text-sm font-semibold tracking-tight">
            {SITE.name}
          </Link>
          <SiteNav />
        </div>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <GitHubLink />
          <Button asChild variant="outline" size="sm" className="px-2 sm:px-2.5">
            <a
              href={SITE.coffeeUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Buy me a coffee"
            >
              <Coffee />
              <span className="hidden sm:inline">Buy me a coffee</span>
            </a>
          </Button>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
