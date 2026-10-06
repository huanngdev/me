import { PlateElement, type PlateElementProps } from "platejs/react";

// A plugin className cannot derive a DOM id from the block id.
const HEADING_CLASS_NAME = "mt-8 text-3xl font-medium leading-tight text-foreground first:mt-0";

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

  return (
    <PlateElement
      {...props}
      element={element}
      attributes={anchorId === undefined ? attributes : { ...attributes, id: anchorId }}
      as="h1"
      className={HEADING_CLASS_NAME}
    />
  );
}
