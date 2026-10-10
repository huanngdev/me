import { useRef, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CopyPlus,
  Merge,
  Split,
  StretchHorizontal,
  Table2,
  Trash2,
} from "lucide-react";
import { ElementApi, type TElement } from "platejs";
import { useEditorRef, useEditorSelector } from "platejs/react";

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/dropdown-menu";

import { runEditorCommand, type EditorCommand } from "../../lib/commands/editor-commands";
import {
  deleteTable,
  deleteTableColumn,
  deleteTableRow,
  duplicateTableColumn,
  duplicateTableRow,
  fitTableToWidth,
  insertTableColumn,
  insertTableRow,
  mergeTableCells,
  moveTableColumnLeft,
  moveTableColumnRight,
  moveTableRowDown,
  moveTableRowUp,
  splitTableCell,
  toggleTableHeaderColumn,
  toggleTableHeaderRow,
} from "../../lib/commands/editor-table-commands";
import { columnIsHeader, rowIsHeader } from "../../lib/features/editor-table";
import { EditorMenuTrigger, retainScroll } from "./block-toolbar";

const TOOLBAR_CLASS_NAME =
  "absolute top-1 right-1 z-10 opacity-0 pointer-events-none group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100";

function keepEditorSelection(event: { preventDefault: () => void }): void {
  event.preventDefault();
}

function CommandMenuItem<Payload>({
  command,
  payload,
  icon,
  onApply,
}: {
  command: EditorCommand<Payload>;
  payload: Payload;
  icon: ReactNode;
  onApply: (command: EditorCommand<Payload>, payload: Payload) => void;
}) {
  const editor = useEditorRef();
  const reason = command.disabledReason?.(editor);

  return (
    <DropdownMenuItem
      disabled={reason !== undefined}
      onMouseDown={keepEditorSelection}
      onSelect={() => {
        onApply(command, payload);
      }}
    >
      {icon}
      <span className="flex min-w-0 flex-col items-start">
        <span>{command.label}</span>
        {reason === undefined ? null : (
          <span className="text-muted-foreground text-xs whitespace-normal">{reason}</span>
        )}
      </span>
    </DropdownMenuItem>
  );
}

export function TableControls({
  element,
  measureFit,
}: {
  element: TElement;
  measureFit: () => { tablePath: number[]; available: number; widths: number[] } | undefined;
}) {
  const editor = useEditorRef();
  useEditorSelector((instance) => instance.selection, []);
  const savedSelection = useRef(editor.selection);
  const headerRow = ElementApi.isElement(element) && rowIsHeader(element);
  const headerColumn = ElementApi.isElement(element) && columnIsHeader(element);

  function apply<Payload>(command: EditorCommand<Payload>, payload: Payload): void {
    runEditorCommand(editor, command, payload, {
      selection: savedSelection.current ?? undefined,
    });
  }

  return (
    <div className={TOOLBAR_CLASS_NAME} contentEditable={false}>
      <DropdownMenu modal={false}>
        <EditorMenuTrigger
          label="Table options"
          icon={<Table2 aria-hidden="true" />}
          onMouseDown={keepEditorSelection}
          onPointerDown={() => {
            savedSelection.current = editor.selection;
          }}
        />
        <DropdownMenuContent
          align="end"
          className="w-64"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const selection = savedSelection.current;
            retainScroll(() => {
              editor.tf.withoutSaving(() => {
                editor.tf.focus();
                if (selection) {
                  editor.tf.select(selection);
                }
              });
            });
          }}
        >
          <DropdownMenuItem
            onMouseDown={keepEditorSelection}
            onSelect={() => {
              apply(insertTableRow, { before: true });
            }}
          >
            <ArrowUp aria-hidden="true" />
            Insert row above
          </DropdownMenuItem>
          <DropdownMenuItem
            onMouseDown={keepEditorSelection}
            onSelect={() => {
              apply(insertTableRow, { before: false });
            }}
          >
            <ArrowDown aria-hidden="true" />
            Insert row below
          </DropdownMenuItem>
          <DropdownMenuItem
            onMouseDown={keepEditorSelection}
            onSelect={() => {
              apply(insertTableColumn, { before: true });
            }}
          >
            <ArrowLeft aria-hidden="true" />
            Insert column left
          </DropdownMenuItem>
          <DropdownMenuItem
            onMouseDown={keepEditorSelection}
            onSelect={() => {
              apply(insertTableColumn, { before: false });
            }}
          >
            <ArrowRight aria-hidden="true" />
            Insert column right
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <CommandMenuItem
            command={mergeTableCells}
            payload={undefined}
            icon={<Merge aria-hidden="true" />}
            onApply={apply}
          />
          <CommandMenuItem
            command={splitTableCell}
            payload={undefined}
            icon={<Split aria-hidden="true" />}
            onApply={apply}
          />
          <CommandMenuItem
            command={duplicateTableRow}
            payload={undefined}
            icon={<CopyPlus aria-hidden="true" />}
            onApply={apply}
          />
          <CommandMenuItem
            command={duplicateTableColumn}
            payload={undefined}
            icon={<CopyPlus aria-hidden="true" />}
            onApply={apply}
          />
          <CommandMenuItem
            command={moveTableRowUp}
            payload={undefined}
            icon={<ArrowUp aria-hidden="true" />}
            onApply={apply}
          />
          <CommandMenuItem
            command={moveTableRowDown}
            payload={undefined}
            icon={<ArrowDown aria-hidden="true" />}
            onApply={apply}
          />
          <CommandMenuItem
            command={moveTableColumnLeft}
            payload={undefined}
            icon={<ArrowLeft aria-hidden="true" />}
            onApply={apply}
          />
          <CommandMenuItem
            command={moveTableColumnRight}
            payload={undefined}
            icon={<ArrowRight aria-hidden="true" />}
            onApply={apply}
          />
          <DropdownMenuItem
            onMouseDown={keepEditorSelection}
            onSelect={() => {
              const measured = measureFit();
              if (!measured) {
                return;
              }

              apply(fitTableToWidth, measured);
            }}
          >
            <StretchHorizontal aria-hidden="true" />
            {fitTableToWidth.label}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onMouseDown={keepEditorSelection}
            onSelect={() => {
              apply(deleteTableRow, undefined);
            }}
          >
            <Trash2 aria-hidden="true" />
            Delete row
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onMouseDown={keepEditorSelection}
            onSelect={() => {
              apply(deleteTableColumn, undefined);
            }}
          >
            <Trash2 aria-hidden="true" />
            Delete column
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem
            checked={headerRow}
            onMouseDown={keepEditorSelection}
            onSelect={() => {
              apply(toggleTableHeaderRow, undefined);
            }}
          >
            Header row
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={headerColumn}
            onMouseDown={keepEditorSelection}
            onSelect={() => {
              apply(toggleTableHeaderColumn, undefined);
            }}
          >
            Header column
          </DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onMouseDown={keepEditorSelection}
            onSelect={() => {
              apply(deleteTable, undefined);
            }}
          >
            <Trash2 aria-hidden="true" />
            Delete table
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
