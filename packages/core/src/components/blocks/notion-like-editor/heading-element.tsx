import { PlateElement, type PlateElementProps } from "platejs/react";

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

export const HEADING_STYLES = {
  h1: `${HEADING_MARGIN.h1} ${HEADING_SIZE.h1} font-medium leading-tight text-foreground first:mt-0`,
  h2: `${HEADING_MARGIN.h2} ${HEADING_SIZE.h2} font-medium leading-tight text-foreground first:mt-0`,
  h3: `${HEADING_MARGIN.h3} ${HEADING_SIZE.h3} font-medium leading-tight text-foreground first:mt-0`,
} as const;

function isHeadingSize(type: string): type is keyof typeof HEADING_SIZE {
  return Object.hasOwn(HEADING_SIZE, type);
}

/** Font size and line height shared with a toggle chevron centered on the first line. */
export function headingLineClass(type: string): string | undefined {
  if (!isHeadingSize(type)) {
    return undefined;
  }

  return `${HEADING_SIZE[type]} leading-tight`;
}

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

  return (
    <PlateElement
      {...props}
      element={element}
      attributes={anchorId === undefined ? attributes : { ...attributes, id: anchorId }}
      as={tag}
      className={HEADING_STYLES[tag]}
    />
  );
}
