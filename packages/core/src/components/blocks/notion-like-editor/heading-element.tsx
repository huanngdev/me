import { PlateElement, type PlateElementProps } from "platejs/react";

// A plugin className cannot derive a DOM id from the block id.
export const HEADING_STYLES = {
  h1: "mt-8 text-3xl font-medium leading-tight text-foreground first:mt-0",
  h2: "mt-6 text-2xl font-medium leading-tight text-foreground first:mt-0",
  h3: "mt-4 text-xl font-medium leading-tight text-foreground first:mt-0",
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
