import { useRef } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Columns3,
  Rows3,
  Table2,
  Trash2,
} from "lucide-react";
import { ElementApi, type TElement } from "platejs";
import { useEditorRef } from "platejs/react";

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/dropdown-menu";

import {
  deleteTable,
  deleteTableColumn,
  deleteTableRow,
  insertTableColumn,
  insertTableRow,
  runEditorCommand,
  toggleTableHeaderColumn,
  toggleTableHeaderRow,
  type EditorCommand,
} from "./editor-commands";
import { columnIsHeader, rowIsHeader } from "./editor-table";

const TOOLBAR_CLASS_NAME =
  "absolute top-1 right-1 z-10 opacity-0 pointer-events-none group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100";

function keepEditorSelection(event: { preventDefault: () => void }): void {
  event.preventDefault();
}

export function TableControls({ element }: { element: TElement }) {
  const editor = useEditorRef();
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
        <DropdownMenuTrigger
          aria-label="Table options"
          className="text-muted-foreground hover:bg-foreground/5 inline-flex size-7 items-center justify-center rounded-md"
          onMouseDown={keepEditorSelection}
          onPointerDown={() => {
            savedSelection.current = editor.selection;
          }}
        >
          <Table2 aria-hidden="true" className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-52"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const selection = savedSelection.current;
            editor.tf.withoutSaving(() => {
              editor.tf.focus();
              if (selection) {
                editor.tf.select(selection);
              }
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
          <DropdownMenuItem
            onMouseDown={keepEditorSelection}
            onSelect={() => {
              apply(deleteTableRow, undefined);
            }}
          >
            <Rows3 aria-hidden="true" />
            Delete row
          </DropdownMenuItem>
          <DropdownMenuItem
            onMouseDown={keepEditorSelection}
            onSelect={() => {
              apply(deleteTableColumn, undefined);
            }}
          >
            <Columns3 aria-hidden="true" />
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
