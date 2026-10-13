import { ElementApi, KEYS, PathApi, createSlatePlugin, type SlateEditor } from "platejs";

import { runEditorCommand, type EditorCommand } from "../commands/editor-commands";
import {
  inlineDateEntry,
  inlineDateRefusal,
  insertInlineDate,
  removeInlineDate,
  setInlineDate,
} from "../features/editor-inline-date";
import { todayStoredDate } from "../features/editor-date-value";
import { blockSelectionActive } from "./editor-block-selection";

// The popover holds only which chip is open. Every choice writes at once, so there is no draft.
export const inlineDateUiPlugin = createSlatePlugin({
  key: "inlineDateUi",
  options: { editingId: "" },
}).overrideEditor(({ editor }) => {
  const { onChange } = editor;
  if (isEditorOnChange(onChange)) {
    editor.onChange = (options?: { operation?: unknown }) => {
      onChange(options);
      // A node removed while open, or a switch to read-only, closes the popover without writing.
      const id = inlineDateEditingId(editor);
      if (
        id.length > 0 &&
        (editor.dom.readOnly === true || inlineDateEntry(editor, id) === undefined)
      ) {
        resetInlineDateEditor(editor);
      }
    };
  }
  return { transforms: {} };
});

function isEditorOnChange(value: unknown): value is (options?: { operation?: unknown }) => void {
  return typeof value === "function";
}

export function inlineDateEditingId(editor: SlateEditor): string {
  return editor.getOption(inlineDateUiPlugin, "editingId");
}

// Drops the popover state without writing the document or moving the selection.
export function resetInlineDateEditor(editor: SlateEditor): void {
  editor.setOption(inlineDateUiPlugin, "editingId", "");
}

// The caret goes right after the chip and the editor takes focus. Used by every close.
function finishInlineDateEditor(editor: SlateEditor, id: string): void {
  resetInlineDateEditor(editor);
  selectAfterInlineDate(editor, id);
  editor.tf.focus();
}

function selectAfterInlineDate(editor: SlateEditor, id: string): void {
  const entry = inlineDateEntry(editor, id);
  if (entry === undefined) {
    return;
  }

  const after = editor.api.after(entry[1]);
  if (after !== undefined) {
    editor.tf.select(after);
  }
}

// Opens the popover on one chip. Opening another chip closes the open one first, without writing.
export function openInlineDateEditor(editor: SlateEditor, id: string): void {
  if (editor.dom.readOnly === true || blockSelectionActive(editor) || id.length === 0) {
    return;
  }

  if (inlineDateEditingId(editor) === id) {
    return;
  }

  const entry = inlineDateEntry(editor, id);
  if (entry === undefined) {
    return;
  }

  editor.setOption(inlineDateUiPlugin, "editingId", id);
  editor.tf.select(entry[1]);
}

// Escape and a press outside. Nothing is written, and the chip stays where it is.
export function closeInlineDateEditor(editor: SlateEditor): void {
  const id = inlineDateEditingId(editor);
  if (id.length === 0) {
    return;
  }

  finishInlineDateEditor(editor, id);
}

// A calendar pick or Today. The write is one undo step, and the same day only closes.
export function pickInlineDate(editor: SlateEditor, id: string, date: string): void {
  const entry = inlineDateEntry(editor, id);
  if (inlineDateEditingId(editor) !== id || entry === undefined) {
    resetInlineDateEditor(editor);
    return;
  }

  if (entry[0].date !== date) {
    runEditorCommand(editor, setInlineDate, { id, date });
  }
  finishInlineDateEditor(editor, id);
}

// Removes the chip as one undo step and closes the popover.
export function removeInlineDateFromPopover(editor: SlateEditor, id: string): void {
  if (inlineDateEditingId(editor) !== id) {
    return;
  }

  resetInlineDateEditor(editor);
  const entry = inlineDateEntry(editor, id);
  if (entry === undefined) {
    return;
  }

  const previous = PathApi.previous(entry[1]);
  const block = editor.api.block({ at: entry[1] });
  runEditorCommand(editor, removeInlineDate, { id });

  const target = previous === undefined ? undefined : editor.api.end(previous);
  if (target !== undefined) {
    editor.tf.select(target);
  } else if (block !== undefined) {
    const start = editor.api.start(block[1]);
    if (start !== undefined) {
      editor.tf.select(start);
    }
  }
  editor.tf.focus();
}

// Creates today's date at the selection and opens its popover. Escape keeps the chip.
export const insertTodayDate: EditorCommand = {
  id: "inline.date",
  label: "Date",
  group: "insert",
  isEnabled: (editor) => editor.dom.readOnly !== true && inlineDateRefusal(editor) === undefined,
  disabledReason: (editor) => {
    const refusal = inlineDateRefusal(editor);
    if (refusal === "span") {
      return "Dates cannot span blocks.";
    }

    return refusal === undefined ? undefined : "Dates are not available here.";
  },
  run: (editor) => {
    if (editor.selection === null) {
      return;
    }

    const id = insertInlineDate(editor, todayStoredDate());
    if (id !== null) {
      openInlineDateEditor(editor, id);
    }
  },
};

type InlineDateKeyEvent = {
  key: string;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  defaultPrevented: boolean;
  preventDefault: () => void;
};

// Mod+; inserts today's date. Enter on a selected inline date opens it.
export function onInlineDateKeyDown(editor: SlateEditor, event: InlineDateKeyEvent): void {
  if (event.defaultPrevented || event.altKey || editor.dom.readOnly === true) {
    return;
  }

  if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key === ";") {
    if (runEditorCommand(editor, insertTodayDate, undefined)) {
      event.preventDefault();
    }
    return;
  }

  if (event.key !== "Enter" || event.shiftKey || event.metaKey || event.ctrlKey) {
    return;
  }

  if (blockSelectionActive(editor)) {
    return;
  }

  const block = editor.api.above({
    match: (node) => ElementApi.isElement(node) && node.type === KEYS.date,
  });
  if (block === undefined || !ElementApi.isElement(block[0])) {
    return;
  }

  const id = typeof block[0].id === "string" ? block[0].id : "";
  if (id.length === 0) {
    return;
  }

  event.preventDefault();
  openInlineDateEditor(editor, id);
}
