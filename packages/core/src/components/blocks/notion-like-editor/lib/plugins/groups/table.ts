import { insertTableRow } from "@platejs/table";
import {
  TableCellHeaderPlugin,
  TableCellPlugin,
  TablePlugin,
  TableRowPlugin,
} from "@platejs/table/react";
import { ElementApi, KEYS, PathApi, TextApi, type Descendant, type SlateEditor } from "platejs";
import {
  clearHtmlTableWidths,
  preparePastedFragment,
  rememberHtmlTableWidths,
  setPasteRepairs,
} from "../../paste/editor-paste";
import {
  TableCellElement,
  TableElement,
  TableRowElement,
} from "../../../components/elements/table-element";
import {
  caretAtCellStart,
  fillTableWithTsv,
  pastedTableTruncationMessage,
  replaceTableWithParagraph,
  selectedCellContext,
  tableCellContext,
  tableMaxRows,
  wholeTableSelection,
} from "../../features/editor-table";
import { annotatePastedLists } from "./lists";

function htmlHasTable(html: string): boolean {
  return html.toLowerCase().includes("<table");
}

// The empty top-level paragraph that holds a collapsed caret, when a single table is pasted.
// A paste into a non-empty block or a table cell returns undefined.

function emptyParagraphForTablePaste(
  editor: SlateEditor,
  fragment: readonly Descendant[],
): { path: number[]; id: unknown } | undefined {
  const first = fragment[0];
  if (fragment.length !== 1 || !ElementApi.isElement(first) || first.type !== KEYS.table) {
    return undefined;
  }

  if (!editor.selection || !editor.api.isCollapsed()) {
    return undefined;
  }

  const top = editor.selection.anchor.path[0];
  const block = top === undefined ? undefined : editor.children[top];
  if (top === undefined || !ElementApi.isElement(block) || block.type !== KEYS.p) {
    return undefined;
  }

  if (!block.children.every((child) => TextApi.isText(child) && child.text === "")) {
    return undefined;
  }

  return { path: [top], id: block.id };
}

// Removes the paragraph the table was pasted into, if it is still that empty paragraph and a table follows it.

function removeEmptyParagraphBeforeTable(
  editor: SlateEditor,
  replaced: { path: number[]; id: unknown },
): void {
  const entry = editor.api.node(replaced.path);
  const next = editor.api.node(PathApi.next(replaced.path));
  if (!entry || !ElementApi.isElement(entry[0]) || entry[0].id !== replaced.id) {
    return;
  }

  if (!entry[0].children.every((child) => TextApi.isText(child) && child.text === "")) {
    return;
  }

  if (!next || !ElementApi.isElement(next[0]) || next[0].type !== KEYS.table) {
    return;
  }

  editor.tf.removeNodes({ at: replaced.path });
}

// Tab inside a table, including a list item in a cell, belongs to the table.
// Registered after codeBlock and listKeyboard, so this tab runs first and the
// previous tab is code, then list. Outside a table, Tab is unchanged.
// Plate's tab stops on the last cell. Appending a row there is editable only.
// No insert shortcut. Slash menu and toolbar are DEV-122/125.
// initialTableWidth stays unset. Column insert still writes a 0 into colSizes
// when widths already exist; the command rewrites that 0 to null before normalize.

export const tablePlugin = TablePlugin.configure({
  options: {
    disableMerge: false,
  },
  render: { node: TableElement },
})
  .configurePlugin(TableRowPlugin, { render: { node: TableRowElement } })
  .configurePlugin(TableCellPlugin, { render: { node: TableCellElement } })
  .configurePlugin(TableCellHeaderPlugin, { render: { node: TableCellElement } })
  .overrideEditor(
    ({ editor, tf: { deleteBackward, deleteFragment, insertData, insertFragment, tab } }) => ({
      transforms: {
        // withInsertFragmentTable inserts a single table before PasteFallback.
        // Sanitize here so that path keeps spans, caps the grid, and
        // omits an id the document already uses.
        insertFragment(fragment, options) {
          const prepared = preparePastedFragment(editor, fragment);
          const replaced = emptyParagraphForTablePaste(editor, prepared);
          insertFragment(prepared, options);
          if (replaced !== undefined) {
            removeEmptyParagraphBeforeTable(editor, replaced);
          }
        },
        tab(options?: { reverse?: boolean }) {
          // Plate's tab reads options.reverse and throws when options is missing.
          // The keydown handler always passes { reverse }.
          // Selecting the next cell expands the range inside that cell, so the
          // last-cell check uses the cell that contains both ends.
          const reverse = options?.reverse === true;
          const cell = selectedCellContext(editor);
          if (!cell) {
            return tab({ reverse });
          }

          const atLastCell =
            !reverse &&
            cell.rowIndex + cell.rowSpan - 1 === cell.rowCount - 1 &&
            cell.columnIndex + cell.colSpan - 1 === cell.columnCount - 1;
          if (atLastCell) {
            if (!editor.dom.readOnly && cell.rowCount < tableMaxRows()) {
              insertTableRow(editor, {
                select: false,
                fromRow: cell.tablePath.concat(cell.rowCount - 1),
              });
              const start = editor.api.start(cell.tablePath.concat(cell.rowCount, 0));
              if (start) {
                editor.tf.select(start);
              }
            }
            return true;
          }

          return tab({ reverse });
        },
        deleteBackward(unit) {
          const cell = tableCellContext(editor);
          if (cell && caretAtCellStart(editor, cell.cellPath)) {
            return;
          }

          deleteBackward(unit);
        },
        deleteFragment(direction) {
          const tablePath = wholeTableSelection(editor);
          if (tablePath) {
            replaceTableWithParagraph(editor, tablePath);
            return;
          }

          deleteFragment(direction);
          if (editor.children.length === 0) {
            editor.tf.insertNodes(
              { type: KEYS.p, children: [{ text: "" }] },
              { at: [0], select: true },
            );
          }
        },
        insertData(data: DataTransfer) {
          const html = data.getData("text/html");
          if (htmlHasTable(html)) {
            // Plate's data pipe inserts the fragment inside withoutNormalizing.
            // A table inserted that way is still inside the paragraph when
            // normalize runs, and the paragraph unwraps the rows. Deserialize,
            // then insertFragment so the sanitized table is normalized as a block.
            // Plate's cell parser keeps colspan on attributes and ignores widths.
            rememberHtmlTableWidths(html);
            try {
              const body = new DOMParser().parseFromString(html, "text/html").body;
              annotatePastedLists(body);
              // happy-dom hoists a bare <col> out of the table. Widths are already
              // recorded; leaving the column in the body pastes an empty paragraph.
              for (const column of Array.from(body.querySelectorAll("col, colgroup"))) {
                column.remove();
              }
              editor.tf.insertFragment(editor.api.html.deserialize({ element: body }));
            } finally {
              clearHtmlTableWidths();
            }
            return;
          }

          const filled = fillTableWithTsv(editor, data.getData("text/plain"));
          if (!filled.handled) {
            insertData(data);
            return;
          }

          setPasteRepairs(
            editor,
            filled.truncated ? [{ path: [], message: pastedTableTruncationMessage() }] : [],
          );
        },
      },
    }),
  );

// Core skips its node-id plugin when NODE_ENV is "test" and no nodeId option is set.
// Plate splices NodeIdPlugin out of the plugins array it receives.
// TablePlugin's api override copies editor.api.onChange back onto editor.onChange
// after the toggle plugin has wrapped it. Priority 0 runs after those overrides,
// so a selection in hidden toggle content still opens the toggle.
