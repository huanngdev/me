import Link from "next/link";

export function Header() {
  return (
    <header className="bg-background/80 sticky top-0 z-40 w-full border-b backdrop-blur">
      <div className="container mx-auto flex h-14 items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="text-sm font-medium tracking-tight transition-opacity hover:opacity-70"
        >
          Chris
        </Link>
        <nav aria-label="Primary" className="flex items-center gap-2">
          {/* placeholder — nav links, locale toggle, theme toggle land here */}
        </nav>
      </div>
    </header>
  );
}
