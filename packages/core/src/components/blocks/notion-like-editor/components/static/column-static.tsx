import type { CSSProperties } from "react";
import { KEYS, type TElement } from "platejs";
import { SlateElement, type SlateElementProps } from "platejs/static";

import { COLUMN_GROUP_LAYOUT_CLASS } from "../elements/column-classes";

function widths(element: TElement): string[] {
  return element.children.flatMap((child) => {
    if (
      typeof child !== "object" ||
      child === null ||
      !("type" in child) ||
      child.type !== KEYS.column
    ) {
      return [];
    }
    return [typeof child.width === "string" ? child.width : "1fr"];
  });
}

export function ColumnStatic(props: SlateElementProps) {
  return (
    <SlateElement {...props} className="min-w-0">
      <div className="min-w-0">{props.children}</div>
    </SlateElement>
  );
}

export function ColumnGroupStatic(props: SlateElementProps) {
  const template = widths(props.element)
    .map((width) => {
      const parsed = Number.parseFloat(width);
      return `${Number.isFinite(parsed) ? parsed : 1}fr`;
    })
    .join(" ");
  return (
    <SlateElement {...props} className="relative my-2">
      <div
        data-column-layout="stack"
        className={COLUMN_GROUP_LAYOUT_CLASS}
        style={{ "--column-widths": template } as CSSProperties}
      >
        {props.children}
      </div>
    </SlateElement>
  );
}
