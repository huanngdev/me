import {
  ElementApi,
  KEYS,
  PathApi,
  RangeApi,
  createSlatePlugin,
  type SlateEditor,
  type TElement,
} from "platejs";

import { runEditorCommand, type EditorCommand } from "../commands/editor-commands";
import { isStoredEquationExpression } from "../document/editor-document-schema";
import {
  inlineEquationEntry,
  inlineEquationRefusal,
  insertInlineEquation,
} from "../features/editor-inline-equation";
import { blockSelectionActive } from "./editor-block-selection";
import { featureEnabled } from "./editor-config";

// The popover edits a draft held in these options. The document is written once, on commit.
// createdUndoDepth is the undo depth before the node was inserted, or -1 when it was not created here.
export const inlineEquationUiPlugin = createSlatePlugin({
  key: "inlineEquationUi",
  options: { editingId: "", draft: "", original: "", created: false, createdUndoDepth: -1 },
}).overrideEditor(({ editor }) => {
  const { onChange } = editor;
  if (isEditorOnChange(onChange)) {
    editor.onChange = (options?: { operation?: unknown }) => {
      onChange(options);
      // A node removed while open, or a switch to read-only, closes the popover without writing.
      const id = inlineEquationEditingId(editor);
      if (
        id.length > 0 &&
        (editor.dom.readOnly === true || inlineEquationEntry(editor, id) === undefined)
      ) {
        resetInlineEquationState(editor);
      }
    };
  }
  return { transforms: {} };
});

function isEditorOnChange(value: unknown): value is (options?: { operation?: unknown }) => void {
  return typeof value === "function";
}

export function inlineEquationEditingId(editor: SlateEditor): string {
  return editor.getOption(inlineEquationUiPlugin, "editingId");
}

function storedSource(node: TElement): string {
  return typeof node.texExpression === "string" ? node.texExpression : "";
}

function resetInlineEquationState(editor: SlateEditor): void {
  editor.setOption(inlineEquationUiPlugin, "editingId", "");
  editor.setOption(inlineEquationUiPlugin, "draft", "");
  editor.setOption(inlineEquationUiPlugin, "original", "");
  editor.setOption(inlineEquationUiPlugin, "created", false);
  editor.setOption(inlineEquationUiPlugin, "createdUndoDepth", -1);
}

export function setInlineEquationDraft(editor: SlateEditor, draft: string): void {
  if (inlineEquationEditingId(editor).length === 0) {
    return;
  }

  editor.setOption(inlineEquationUiPlugin, "draft", draft);
}

// Opening another equation commits the open one first. A refused commit keeps both as they are.
export function openInlineEquationEditor(
  editor: SlateEditor,
  id: string,
  options: { created?: boolean; createdUndoDepth?: number } = {},
): void {
  if (editor.dom.readOnly === true || blockSelectionActive(editor) || id.length === 0) {
    return;
  }

  if (inlineEquationEditingId(editor) === id) {
    return;
  }

  if (inlineEquationEditingId(editor).length > 0 && !commitInlineEquationEditor(editor)) {
    return;
  }

  // The commit can remove a node and shift paths, so the entry is read after it.
  const entry = inlineEquationEntry(editor, id);
  if (entry === undefined) {
    return;
  }

  const stored = storedSource(entry[0]);
  editor.setOption(inlineEquationUiPlugin, "editingId", id);
  editor.setOption(inlineEquationUiPlugin, "draft", stored);
  editor.setOption(inlineEquationUiPlugin, "original", stored);
  editor.setOption(inlineEquationUiPlugin, "created", options.created === true);
  editor.setOption(inlineEquationUiPlugin, "createdUndoDepth", options.createdUndoDepth ?? -1);
  editor.tf.select(entry[1]);
}

// Returns false when the draft cannot be written, so the popover stays open.
export function commitInlineEquationEditor(editor: SlateEditor): boolean {
  const id = inlineEquationEditingId(editor);
  if (id.length === 0) {
    return false;
  }

  const draft = editor.getOption(inlineEquationUiPlugin, "draft").trim();
  if (draft.length > 0 && !isStoredEquationExpression(draft)) {
    return false;
  }

  const created = editor.getOption(inlineEquationUiPlugin, "created");
  const createdUndoDepth = editor.getOption(inlineEquationUiPlugin, "createdUndoDepth");
  resetInlineEquationState(editor);
  const entry = inlineEquationEntry(editor, id);
  if (entry === undefined) {
    return true;
  }

  if (draft.length === 0) {
    if (created) {
      removeCreatedInlineEquation(editor, id, createdUndoDepth);
    } else {
      removeInlineEquation(editor, id);
    }
  } else {
    if (draft !== storedSource(entry[0])) {
      runEditorCommand(editor, setInlineEquationSource, { id, expression: draft });
    }
    selectAfterInlineEquation(editor, id);
  }
  editor.tf.focus();
  return true;
}

// Removes a node that was just created with an empty source. Any other cancel only leaves the caret after it.
export function cancelInlineEquationEditor(editor: SlateEditor): void {
  const id = inlineEquationEditingId(editor);
  if (id.length === 0) {
    return;
  }

  const created = editor.getOption(inlineEquationUiPlugin, "created");
  const createdUndoDepth = editor.getOption(inlineEquationUiPlugin, "createdUndoDepth");
  resetInlineEquationState(editor);
  const entry = inlineEquationEntry(editor, id);
  if (entry !== undefined) {
    if (created && storedSource(entry[0]).length === 0) {
      removeCreatedInlineEquation(editor, id, createdUndoDepth);
    } else {
      selectAfterInlineEquation(editor, id);
    }
  }
  editor.tf.focus();
}

function selectAfterInlineEquation(editor: SlateEditor, id: string): void {
  const entry = inlineEquationEntry(editor, id);
  if (entry === undefined) {
    return;
  }

  const after = editor.api.after(entry[1]);
  if (after !== undefined) {
    editor.tf.select(after);
  }
}

// When the insertion is the only entry since it was made, undo it and drop its redo, so
// neither undo nor redo brings the empty node back. Otherwise remove it with a new entry.
function removeCreatedInlineEquation(
  editor: SlateEditor,
  id: string,
  createdUndoDepth: number,
): void {
  if (createdUndoDepth >= 0 && editor.history.undos.length === createdUndoDepth + 1) {
    const redoDepth = editor.history.redos.length;
    editor.tf.undo();
    editor.history.redos.splice(redoDepth);
    return;
  }

  removeInlineEquation(editor, id);
}

// The caret goes to the end of the text before the node, or to the start of the block when there is none.
function removeInlineEquation(editor: SlateEditor, id: string): void {
  const entry = inlineEquationEntry(editor, id);
  if (entry === undefined) {
    return;
  }

  const previous = PathApi.previous(entry[1]);
  const block = editor.api.block({ at: entry[1] });
  runEditorCommand(editor, removeInlineEquationNode, { id });

  const target = previous === undefined ? undefined : editor.api.end(previous);
  if (target !== undefined) {
    editor.tf.select(target);
  } else if (block !== undefined) {
    const start = editor.api.start(block[1]);
    if (start !== undefined) {
      editor.tf.select(start);
    }
  }
}

const setInlineEquationSource: EditorCommand<{ id: string; expression: string }> = {
  id: "inline.equation.source",
  label: "Edit equation",
  group: "action",
  run: (editor, { id, expression }) => {
    const entry = inlineEquationEntry(editor, id);
    if (entry !== undefined) {
      editor.tf.setNodes({ texExpression: expression }, { at: entry[1], voids: true });
    }
  },
};

const removeInlineEquationNode: EditorCommand<{ id: string }> = {
  id: "inline.equation.remove",
  label: "Remove equation",
  group: "action",
  run: (editor, { id }) => {
    const entry = inlineEquationEntry(editor, id);
    if (entry !== undefined) {
      editor.tf.removeNodes({ at: entry[1], voids: true });
    }
  },
};

export const toggleInlineEquation: EditorCommand = {
  id: "inline.equation",
  label: "Equation",
  group: "insert",
  isEnabled: (editor) =>
    editor.dom.readOnly !== true &&
    featureEnabled(editor, "equations") &&
    inlineEquationRefusal(editor) === undefined,
  disabledReason: (editor) => {
    const refusal = inlineEquationRefusal(editor);
    if (refusal === "span") {
      return "Equations cannot span blocks.";
    }

    return refusal === undefined ? undefined : "Equations are not available here.";
  },
  run: (editor) => {
    const selection = editor.selection;
    if (selection === null) {
      return;
    }

    // A caret makes an empty equation. A selection becomes its source, and cancel keeps it.
    const created = RangeApi.isCollapsed(selection);
    const undoDepth = editor.history.undos.length;
    const id = insertInlineEquation(editor, created ? "" : editor.api.string(selection));
    if (id !== null) {
      openInlineEquationEditor(editor, id, { created, createdUndoDepth: undoDepth });
    }
  },
};

type InlineEquationKeyEvent = {
  key: string;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  defaultPrevented: boolean;
  preventDefault: () => void;
};

// Mod+Shift+E inserts or wraps an equation. Enter on a selected inline equation opens it.
export function onInlineEquationKeyDown(editor: SlateEditor, event: InlineEquationKeyEvent): void {
  if (event.defaultPrevented || event.altKey || editor.dom.readOnly === true) {
    return;
  }

  if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "e") {
    // With equations off the key is not handled, so the browser keeps its default.
    if (!featureEnabled(editor, "equations")) {
      return;
    }
    event.preventDefault();
    runEditorCommand(editor, toggleInlineEquation, undefined);
    return;
  }

  if (event.key !== "Enter" || event.shiftKey || event.metaKey || event.ctrlKey) {
    return;
  }

  if (blockSelectionActive(editor)) {
    return;
  }

  const block = editor.api.above({
    match: (node) => ElementApi.isElement(node) && node.type === KEYS.inlineEquation,
  });
  if (block === undefined || !ElementApi.isElement(block[0])) {
    return;
  }

  const id = typeof block[0].id === "string" ? block[0].id : "";
  if (id.length === 0) {
    return;
  }

  event.preventDefault();
  openInlineEquationEditor(editor, id);
}
