import { cn } from "@repo/core/lib/utils";
import Link from "next/link";

import { CONTENT_SHELL_CLASS } from "@/lib/layout";
import { SITE } from "@/lib/site";

import { BuyMeACoffee } from "./buy-me-a-coffee";
import { GitHubLink } from "./github-link";
import { SiteNav } from "./site-nav";
import { ThemeToggle } from "./theme-toggle";

export function SiteHeader() {
  return (
    <header className="bg-background/80 sticky top-0 z-40 w-full border-b backdrop-blur">
      <div className={cn(CONTENT_SHELL_CLASS, "flex h-14 items-center justify-between gap-2")}>
        <div className="flex min-w-0 items-center gap-2 sm:gap-4">
          <Link href="/" className="shrink-0 text-base font-semibold tracking-tight">
            {SITE.name}
          </Link>
          <SiteNav />
        </div>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <GitHubLink />
          <BuyMeACoffee />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
