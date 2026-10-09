import { PlateElement, useReadOnly, type PlateElementProps } from "platejs/react";

// A plugin className cannot derive a DOM id from the block id.
const HEADING_SIZE = {
  h1: "text-3xl",
  h2: "text-2xl",
  h3: "text-xl",
} as const;

const HEADING_MARGIN = {
  h1: "mt-8",
  h2: "mt-6",
  h3: "mt-4",
} as const;

// scroll-mt-24 is the in-page anchor offset used on component pages. The site
// header is sticky top-1 with an h-14 bar, and scrollIntoView({ block: "start" })
// then keeps a heading below that bar.
const HEADING_SCROLL = "scroll-mt-24";

export const HEADING_STYLES = {
  h1: `${HEADING_MARGIN.h1} ${HEADING_SIZE.h1} font-medium leading-tight text-foreground first:mt-0 ${HEADING_SCROLL}`,
  h2: `${HEADING_MARGIN.h2} ${HEADING_SIZE.h2} font-medium leading-tight text-foreground first:mt-0 ${HEADING_SCROLL}`,
  h3: `${HEADING_MARGIN.h3} ${HEADING_SIZE.h3} font-medium leading-tight text-foreground first:mt-0 ${HEADING_SCROLL}`,
} as const;

type HeadingTag = keyof typeof HEADING_STYLES;

function isHeadingTag(type: string): type is HeadingTag {
  return Object.hasOwn(HEADING_STYLES, type);
}

function headingTag(type: string): HeadingTag {
  if (isHeadingTag(type)) {
    return type;
  }

  return "h1";
}

// The DOM id is derived from the block id. It is not stored on the node.
export function headingAnchorId(blockId: string): string {
  return `heading-${blockId}`;
}

function blockAnchor(element: PlateElementProps["element"]): string | undefined {
  if (!("id" in element)) {
    return undefined;
  }

  const id = element.id;
  return typeof id === "string" && id.length > 0 ? headingAnchorId(id) : undefined;
}

export function HeadingElement({ attributes, element, ...props }: PlateElementProps) {
  const anchorId = blockAnchor(element);
  const tag = headingTag(element.type);
  const readOnly = useReadOnly();
  // A tabindex inside the editable surface takes the click away from Slate.
  // Read-only navigation focuses the heading without moving the selection.
  const anchorAttributes =
    anchorId === undefined
      ? attributes
      : readOnly
        ? { ...attributes, id: anchorId, tabIndex: -1 }
        : { ...attributes, id: anchorId };

  return (
    <PlateElement
      {...props}
      element={element}
      attributes={anchorAttributes}
      as={tag}
      className={HEADING_STYLES[tag]}
    />
  );
}
