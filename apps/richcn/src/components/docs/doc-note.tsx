import type { ReactNode } from "react";

import { cn } from "@repo/core/lib/utils";

export type DocNoteProps = {
  children: ReactNode;
  className?: string;
};

/** A short aside inside the docs column. One line of text, a left border, and nothing else. */
export function DocNote({ children, className }: DocNoteProps) {
  return (
    <div
      className={cn(
        "border-border text-muted-foreground border-l-2 pl-4 text-sm leading-relaxed",
        className,
      )}
    >
      {children}
    </div>
  );
}
