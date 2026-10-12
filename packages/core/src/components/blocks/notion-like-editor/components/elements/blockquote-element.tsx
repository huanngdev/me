import { PlateElement, type PlateElementProps } from "platejs/react";

import { cn } from "@/lib/utils";

import { LIST_SIBLING_GAP_CLASS } from "./block-list";

import { BLOCKQUOTE_CLASS_NAME } from "./blockquote-classes";

export { BLOCKQUOTE_CLASS_NAME };

export function BlockquoteElement(props: PlateElementProps) {
  return (
    <PlateElement
      {...props}
      as="blockquote"
      className={cn(BLOCKQUOTE_CLASS_NAME, LIST_SIBLING_GAP_CLASS)}
    />
  );
}
