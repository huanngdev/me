import Link from "next/link";

import { ThemeToggle } from "./theme-toggle";

const NAV_ITEMS = [
  { href: "/#projects", label: "Projects" },
  { href: "/#components", label: "Components" },
  { href: "/#blog", label: "Blog" },
] as const;

export function Header() {
  return (
    <header className="bg-background sticky top-0 z-40 w-full border-b backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between border-x px-4 sm:px-6 lg:px-8">
        <nav aria-label="Primary" className="flex items-center gap-1 sm:gap-4">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="hover:text-foreground text-muted-foreground rounded-md px-2 py-1 text-sm font-medium transition-colors"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-1">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
