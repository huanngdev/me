import { isOrderedList } from "@platejs/list";
import { PlateElement, type PlateElementProps, type RenderNodeWrapper } from "platejs/react";

import { cn } from "@/lib/utils";

import { LIST_INDENTS, type ListIndent } from "./editor-document-schema";

// Rendering only. The stored listStyleType stays "disc" or "decimal" at every depth.
const MARKER_CYCLE = {
  disc: ["disc", "circle", "square"],
  decimal: ["decimal", "lower-alpha", "lower-roman"],
} as const;

// Bullets use a 1.5rem step. Numbers use the same step with an extra 1rem so a
// two-digit marker sits in the gutter. list-style-position: outside right-aligns
// the marker to that padding, so 9 and 10 share the same text start.
const LIST_INDENT_CLASS = {
  disc: {
    1: "pl-6",
    2: "pl-12",
    3: "pl-18",
    4: "pl-24",
    5: "pl-30",
    6: "pl-36",
  },
  decimal: {
    1: "pl-10",
    2: "pl-16",
    3: "pl-22",
    4: "pl-28",
    5: "pl-34",
    6: "pl-40",
  },
} as const;

type MarkerStyle = keyof typeof MARKER_CYCLE;

function isMarkerStyle(style: string): style is MarkerStyle {
  return Object.hasOwn(MARKER_CYCLE, style);
}

function isListIndent(indent: number): indent is ListIndent {
  return LIST_INDENTS.some((level) => level === indent);
}

export function listMarker<Style extends MarkerStyle>(
  style: Style,
  indent: number,
): (typeof MARKER_CYCLE)[Style][number] {
  const cycle = MARKER_CYCLE[style];
  const level = indent >= 1 ? indent : 1;
  const marker = cycle[(level - 1) % cycle.length];
  return marker ?? cycle[0];
}

function listIndentClass(style: string, indent: number): string {
  const classes = isMarkerStyle(style) ? LIST_INDENT_CLASS[style] : LIST_INDENT_CLASS.disc;
  if (isListIndent(indent)) {
    return classes[indent];
  }

  return classes[1];
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
    const ordered = isOrderedList(element);
    const Tag = ordered ? "ol" : "ul";
    const listStart = element.listStart;
    const marker = isMarkerStyle(stored) ? listMarker(stored, indent) : stored;

    return (
      <Tag
        className={cn("relative m-0 list-outside py-0 pr-0", listIndentClass(stored, indent))}
        style={{ listStyleType: marker }}
        start={ordered && typeof listStart === "number" ? listStart : undefined}
      >
        <li>{nodeProps.children}</li>
      </Tag>
    );
  };
};
