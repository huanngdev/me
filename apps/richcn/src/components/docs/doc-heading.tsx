import { Link2 } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@repo/core/lib/utils";

export type DocHeadingProps = {
  /** The heading level. Only `h2` and `h3` are used in the docs. */
  level?: 2 | 3;
  /** The anchor id. It must be unique on the page and stable across releases. */
  id: string;
  children: ReactNode;
  className?: string;
};

const LEVEL_CLASS = {
  2: "text-xl font-semibold tracking-tight",
  3: "text-base font-medium",
} as const;

/**
 * A section heading with a stable `id` and an anchor link next to it. The link is a real URL, so
 * a reader can copy it and a search engine can follow it.
 */
export function DocHeading({ level = 2, id, children, className }: DocHeadingProps) {
  const Tag = level === 2 ? "h2" : "h3";

  return (
    <Tag id={id} className={cn("group scroll-mt-24", LEVEL_CLASS[level], className)}>
      <a
        href={`#${id}`}
        className="text-foreground decoration-border hover:decoration-foreground inline-flex items-center gap-1.5 underline-offset-4 hover:underline"
      >
        {children}
        <Link2
          aria-hidden="true"
          className="text-muted-foreground size-4 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
        />
      </a>
    </Tag>
  );
}
