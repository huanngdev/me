import type { CSSProperties } from "react";
import { KEYS, type TElement } from "platejs";
import { SlateElement, type SlateElementProps } from "platejs/static";

import { isPaletteToken, TEXT_ALIGNS } from "../../lib/document/editor-document-schema";

const CELL_BORDER_CLASS = "min-w-12 border-r border-b border-border";
const ROW_CLASS =
  "hover:bg-muted/50 border-b border-0 bg-transparent transition-colors hover:bg-transparent data-[state=selected]:bg-transparent";
const HEAD_CLASS = "text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap";
const CELL_CLASS = "p-2 align-middle whitespace-nowrap";

function spanOf(value: unknown): number | undefined {
  return typeof value === "number" && value > 1 ? value : undefined;
}

function cellStyle(element: TElement): CSSProperties | undefined {
  const style: React.CSSProperties = {};
  if (typeof element.align === "string" && TEXT_ALIGNS.some((item) => item === element.align)) {
    style.textAlign = element.align as CSSProperties["textAlign"];
  }
  if (isPaletteToken(element.background)) {
    style.backgroundColor = `var(--editor-bg-${element.background})`;
  }
  return Object.keys(style).length > 0 ? style : undefined;
}

export function TableStatic(props: SlateElementProps) {
  const sizes = Array.isArray(props.element.colSizes) ? props.element.colSizes : [];
  const width = sizes.reduce<number>(
    (total, size) => total + (typeof size === "number" ? size : 0),
    0,
  );
  const tableWidth = width > 0 ? width : undefined;
  return (
    <SlateElement
      {...props}
      className="group [&_[data-slot=table-container]]:scroll-fade-x relative my-2 max-w-full"
    >
      <div data-slot="table-container" className="scroll-fade-x relative w-full">
        <table
          data-slot="table"
          className="w-full caption-bottom border-separate border-spacing-0 text-sm"
          style={
            tableWidth === undefined
              ? undefined
              : { width: tableWidth, minWidth: tableWidth, borderCollapse: "separate" }
          }
        >
          {sizes.length > 0 ? (
            <colgroup>
              {sizes.map((size, index) => (
                <col key={index} style={typeof size === "number" ? { width: size } : undefined} />
              ))}
            </colgroup>
          ) : null}
          <tbody data-slot="table-body">{props.children}</tbody>
        </table>
      </div>
    </SlateElement>
  );
}

function structuralElement(element: TElement): TElement {
  if (typeof element.id !== "string") {
    return element;
  }
  const { id: _id, ...rest } = element;
  return rest as TElement;
}

export function TableRowStatic(props: SlateElementProps) {
  return (
    <SlateElement
      {...props}
      element={structuralElement(props.element)}
      as="tr"
      className={ROW_CLASS}
    />
  );
}

export function TableCellStatic(props: SlateElementProps) {
  const header = props.element.type === KEYS.th;
  const column = props.path.at(-1) ?? 0;
  const row = props.path.at(-2) ?? 0;
  const edge = `${column === 0 ? "border-l" : ""} ${row === 0 ? "border-t" : ""}`;
  return (
    <SlateElement
      {...props}
      element={structuralElement(props.element)}
      as={header ? "th" : "td"}
      className={`${header ? HEAD_CLASS : CELL_CLASS} ${CELL_BORDER_CLASS} ${edge}`}
      style={cellStyle(props.element)}
      attributes={{
        ...props.attributes,
        colSpan: spanOf(props.element.colSpan),
        rowSpan: spanOf(props.element.rowSpan),
      }}
    />
  );
}
