import { KEYS } from "platejs";
import {
  PlateElement,
  useEditorRef,
  useElement,
  useReadOnly,
  type PlateElementProps,
} from "platejs/react";
import { useIsCellSelected, useSelectedCells } from "@platejs/table/react";

import { cn } from "@/lib/utils";

import { TableControls } from "./table-controls";

const CELL_CLASS =
  "min-w-32 border border-[var(--editor-table-border)] px-2 py-1.5 align-top text-foreground";

const HEADER_CLASS =
  "bg-[var(--editor-table-header-bg)] font-medium text-[var(--editor-table-header-fg)]";

const SELECTED_CLASS = "editor-table-cell-selected bg-[var(--editor-table-selected)]";

export function TableElement(props: PlateElementProps) {
  const editor = useEditorRef();
  const element = useElement();
  const readOnly = useReadOnly();
  const path = editor.api.findPath(element);
  useSelectedCells();

  return (
    <PlateElement {...props} className="group relative my-2 max-w-full">
      {readOnly || path === undefined ? null : <TableControls element={element} />}
      <div className="max-w-full overflow-x-auto">
        <table className="w-max min-w-full border-collapse">
          <tbody>{props.children}</tbody>
        </table>
      </div>
    </PlateElement>
  );
}

export function TableRowElement(props: PlateElementProps) {
  return <PlateElement {...props} as="tr" />;
}

export function TableCellElement(props: PlateElementProps) {
  const selected = useIsCellSelected(props.element);
  const header = props.element.type === KEYS.th;

  return (
    <PlateElement
      {...props}
      as={header ? "th" : "td"}
      className={cn(CELL_CLASS, header && HEADER_CLASS, selected && SELECTED_CLASS)}
    />
  );
}
