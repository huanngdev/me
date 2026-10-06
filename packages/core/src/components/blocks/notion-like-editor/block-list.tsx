import { isOrderedList } from "@platejs/list";
import { KEYS } from "platejs";
import {
  PlateElement,
  useReadOnly,
  type PlateElementProps,
  type RenderNodeWrapper,
} from "platejs/react";

import { Checkbox } from "@/components/checkbox";
import { cn } from "@/lib/utils";

import { writeChecked } from "./editor-commands";
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

export function todoTextId(blockId: string): string {
  return `todo-text-${blockId}`;
}

function blockIdOf(element: PlateElementProps["element"]): string | undefined {
  if (!("id" in element) || typeof element.id !== "string" || element.id.length === 0) {
    return undefined;
  }

  return element.id;
}

function isChecked(element: PlateElementProps["element"]): boolean {
  return "checked" in element && element.checked === true;
}

// useTodoListElement prevents mousedown so the editor selection stays put
// (react/index.js). The checkbox stays focusable for Space and Enter.
function TodoCheck({
  checked,
  editor,
  element,
}: {
  checked: boolean;
  editor: PlateElementProps["editor"];
  element: PlateElementProps["element"];
}) {
  const readOnly = useReadOnly();
  const blockId = blockIdOf(element);

  return (
    <span contentEditable={false} className="absolute top-1 -left-5 flex">
      <Checkbox
        checked={checked}
        disabled={readOnly}
        aria-labelledby={blockId ? todoTextId(blockId) : undefined}
        aria-label={blockId ? undefined : "To-do"}
        onMouseDown={(event) => {
          event.preventDefault();
        }}
        onCheckedChange={(value) => {
          if (readOnly || value === "indeterminate") {
            return;
          }

          const path = editor.api.findPath(element);
          if (!path) {
            return;
          }

          writeChecked(editor, [path], value);
        }}
      />
    </span>
  );
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
    if (stored === KEYS.listTodo) {
      const checked = isChecked(element);
      const blockId = blockIdOf(element);

      return (
        <ul className={cn("relative m-0 list-none py-0 pr-0", listIndentClass(stored, indent))}>
          <li className="relative">
            <TodoCheck checked={checked} editor={nodeProps.editor} element={element} />
            <span
              id={blockId ? todoTextId(blockId) : undefined}
              data-checked={checked ? "" : undefined}
              className="data-checked:text-muted-foreground data-checked:line-through"
            >
              {nodeProps.children}
            </span>
          </li>
        </ul>
      );
    }

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
