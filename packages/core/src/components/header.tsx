import Link from "next/link";
import { siGithub } from "simple-icons";

import { IDENTITY, REPO_URL } from "../constants";
import { Button } from "./button";
import { StripedPattern } from "./striped-pattern";
import { Separator } from "./separator";
import { ThemeToggle } from "./theme-toggle";

const NAV_ITEMS = [
  { href: "/#projects", label: "Projects" },
  { href: "/#components", label: "Components" },
  { href: "/#blog", label: "Blog" },
] as const;

export function Header() {
  return (
    <header className="bg-background sticky top-0 z-40 w-full border-b backdrop-blur">
      <div className="relative h-14">
        <StripedPattern className="-z-10" />
        <div className="bg-background relative mx-auto flex h-full max-w-6xl items-center justify-between border-x px-4 sm:px-6 lg:px-8">
          <Link href="/" className="font-mono font-normal tracking-tight">
            {IDENTITY.displayName}
          </Link>
          <div className="flex items-center gap-1 sm:gap-2">
            <nav
              aria-label="Primary"
              className="hidden items-center gap-1 text-sm font-medium sm:flex sm:gap-2"
            >
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="hover:text-foreground text-muted-foreground rounded-md px-2 py-1 transition-colors"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <div className="flex h-full items-center">
              <Separator orientation="vertical" className="hidden h-6 sm:block" />
            </div>
            <Button asChild variant="outline" size="icon" aria-label="View source on GitHub">
              <a href={REPO_URL} target="_blank" rel="noreferrer noopener">
                <svg
                  role="img"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="currentColor"
                  className="size-4"
                >
                  <title>{siGithub.title}</title>
                  <path d={siGithub.path} />
                </svg>
              </a>
            </Button>
            <ThemeToggle />
          </div>
        </div>
      </div>
    </header>
  );
}
