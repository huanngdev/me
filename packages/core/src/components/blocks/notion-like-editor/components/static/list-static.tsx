import { isOrderedList } from "@platejs/list";
import { KEYS } from "platejs";
import { Check } from "lucide-react";
import { type ReactNode } from "react";
import { SlateElement, type SlateElementProps } from "platejs/static";

import { LIST_INDENTS, type ListIndent } from "../../lib/document/editor-document-schema";
import { todoTextId } from "../elements/block-list-metrics";

const MARKER_CYCLE = {
  disc: ["disc", "circle", "square"],
  decimal: ["decimal", "lower-alpha", "lower-roman"],
} as const;

const LIST_INDENT_CLASS = {
  disc: { 1: "pl-6", 2: "pl-12", 3: "pl-18", 4: "pl-24", 5: "pl-30", 6: "pl-36" },
  decimal: { 1: "pl-10", 2: "pl-16", 3: "pl-22", 4: "pl-28", 5: "pl-34", 6: "pl-40" },
} as const;

type MarkerStyle = keyof typeof MARKER_CYCLE;

function listMarker(style: MarkerStyle, indent: number): string {
  const cycle = MARKER_CYCLE[style];
  const level = indent >= 1 ? indent : 1;
  return cycle[(level - 1) % cycle.length] ?? cycle[0];
}

function indentClass(style: string, indent: number): string {
  const classes = style === "decimal" ? LIST_INDENT_CLASS.decimal : LIST_INDENT_CLASS.disc;
  const level = LIST_INDENTS.find((item) => item === indent);
  return level === undefined ? classes[1] : classes[level as ListIndent];
}

const CHECKBOX_CLASS =
  "border-input relative flex size-4 shrink-0 items-center justify-center rounded-[4px] border data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground";

function TodoBox({ checked }: { checked: boolean }) {
  return (
    <span className="absolute top-1 -left-5 flex">
      <span
        role="checkbox"
        aria-checked={checked}
        aria-disabled="true"
        data-checked={checked ? "" : undefined}
        className={`${CHECKBOX_CLASS} pointer-events-none`}
      >
        {checked ? <Check aria-hidden="true" className="size-3.5" /> : null}
      </span>
    </span>
  );
}

export function ListParagraphStatic(props: SlateElementProps) {
  const listStyleType = props.element.listStyleType;
  const attributes =
    typeof listStyleType === "string"
      ? { ...props.attributes, "data-list-item": listStyleType }
      : props.attributes;
  return <SlateElement {...props} attributes={attributes} />;
}

export function listBelowNodes(props: { element: SlateElementProps["element"] }) {
  if (typeof props.element.listStyleType !== "string") {
    return;
  }

  return function List(nodeProps: { children?: ReactNode; element: SlateElementProps["element"] }) {
    const element = nodeProps.element;
    const stored = typeof element.listStyleType === "string" ? element.listStyleType : "disc";
    const indent = typeof element.indent === "number" ? element.indent : 1;
    if (stored === KEYS.listTodo) {
      const checked = element.checked === true;
      const blockId = typeof element.id === "string" ? element.id : "";
      return (
        <ul className={`relative m-0 list-none py-0 pr-0 ${indentClass(stored, indent)}`}>
          <li className="relative">
            <TodoBox checked={checked} />
            <span
              id={blockId.length > 0 ? todoTextId(blockId) : undefined}
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
    const marker = stored === "disc" || stored === "decimal" ? listMarker(stored, indent) : stored;
    const listStart = element.listStart;
    return (
      <Tag
        className={`relative m-0 list-outside py-0 pr-0 ${indentClass(stored, indent)}`}
        style={{ listStyleType: marker }}
        start={ordered && typeof listStart === "number" ? listStart : undefined}
      >
        <li>{nodeProps.children}</li>
      </Tag>
    );
  };
}
