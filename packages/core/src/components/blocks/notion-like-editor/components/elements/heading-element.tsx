import { PlateElement, useReadOnly, type PlateElementProps } from "platejs/react";

import { HEADING_STYLES, headingAnchorId, type HeadingTag } from "./heading-styles";

export { HEADING_STYLES, headingAnchorId, type HeadingTag };

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
