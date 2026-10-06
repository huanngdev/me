import { isOrderedList } from "@platejs/list";
import { PlateElement, type PlateElementProps, type RenderNodeWrapper } from "platejs/react";

import { cn } from "@/lib/utils";

// Rendering only. The stored listStyleType stays "disc" at every depth.
const BULLET_MARKERS = ["disc", "circle", "square"] as const;

const LIST_INDENT_CLASS = {
  1: "pl-6",
  2: "pl-12",
  3: "pl-18",
  4: "pl-24",
  5: "pl-30",
  6: "pl-36",
} as const;

type BulletMarker = (typeof BULLET_MARKERS)[number];
type ListIndentLevel = keyof typeof LIST_INDENT_CLASS;

export function bulletMarker(indent: number): BulletMarker {
  const level = indent >= 1 ? indent : 1;
  const marker = BULLET_MARKERS[(level - 1) % BULLET_MARKERS.length];
  return marker ?? "disc";
}

function isListIndent(indent: number): indent is ListIndentLevel {
  return Object.hasOwn(LIST_INDENT_CLASS, indent);
}

function listIndentClass(indent: number): string {
  if (isListIndent(indent)) {
    return LIST_INDENT_CLASS[indent];
  }

  return LIST_INDENT_CLASS[1];
}

function listIndent(element: PlateElementProps["element"]): number {
  return typeof element.indent === "number" ? element.indent : 1;
}

function storedListStyle(element: PlateElementProps["element"]): string {
  return typeof element.listStyleType === "string" ? element.listStyleType : "disc";
}

// The gap between items is a sibling rule on the editor surface. This render reads only its own element.
export function ListParagraph({ attributes, element, ...props }: PlateElementProps) {
  const listStyleType = element.listStyleType;
  const listAttributes =
    typeof listStyleType === "string"
      ? { ...attributes, "data-list-item": listStyleType }
      : attributes;

  return <PlateElement {...props} attributes={listAttributes} element={element} />;
}

// Plate wraps each flat list item on its own. Grouping consecutive items is not a Plate API.
export const BlockList: RenderNodeWrapper = (props) => {
  if (typeof props.element.listStyleType !== "string") {
    return;
  }

  return function List(nodeProps: PlateElementProps) {
    const element = nodeProps.element;
    const stored = storedListStyle(element);
    const indent = listIndent(element);
    const Tag = isOrderedList(element) ? "ol" : "ul";

    return (
      <Tag
        className={cn("relative m-0 list-outside py-0 pr-0", listIndentClass(indent))}
        style={{ listStyleType: stored === "disc" ? bulletMarker(indent) : stored }}
      >
        <li>{nodeProps.children}</li>
      </Tag>
    );
  };
};
