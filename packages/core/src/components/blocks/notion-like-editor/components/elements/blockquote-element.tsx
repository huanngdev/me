import { PlateElement, type PlateElementProps } from "platejs/react";

import { cn } from "@/lib/utils";

import { LIST_SIBLING_GAP_CLASS } from "./block-list";

// AGENTS.md keeps the accent for active states, underlines, pills, and the hero.
// A quote uses the same low-opacity border as the rest of the page. space-y-2 is
// tighter than the surface space-y-4. The list gap class is the surface's rule.
export const BLOCKQUOTE_CLASS_NAME =
  "border-l-2 border-border text-foreground space-y-2 pl-4 font-normal";

export function BlockquoteElement(props: PlateElementProps) {
  return (
    <PlateElement
      {...props}
      as="blockquote"
      className={cn(BLOCKQUOTE_CLASS_NAME, LIST_SIBLING_GAP_CLASS)}
    />
  );
}
