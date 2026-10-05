import { describe, expect, test } from "bun:test";
import { createSlateEditor, type SlateEditor, type TRange } from "platejs";

import { HISTORY_COMMANDS, runEditorCommand, type EditorCommand } from "./editor-commands";
import { createEditorPlugins } from "./editor-plugins";
import { captureSelection, releaseSelection } from "./editor-selection";

const insertX: EditorCommand = {
  id: "test.insert-x",
  label: "Insert X",
  group: "insert",
  run: (editor) => {
    editor.tf.insertText("X");
  },
};

function createEditor(text: string): SlateEditor {
  return createSlateEditor({
    plugins: createEditorPlugins(),
    value: [{ type: "p", children: [{ text }] }],
  });
}

function caret(offset: number): TRange {
  return {
    anchor: { path: [0, 0], offset },
    focus: { path: [0, 0], offset },
  };
}

function span(start: number, end: number): TRange {
  return {
    anchor: { path: [0, 0], offset: start },
    focus: { path: [0, 0], offset: end },
  };
}

function documentText(editor: SlateEditor): string {
  const parts: string[] = [];

  for (const block of editor.children) {
    for (const child of block.children) {
      if ("text" in child && typeof child.text === "string") {
        parts.push(child.text);
      }
    }
  }

  return parts.join("");
}

function historyCommand(id: string): EditorCommand {
  const command = HISTORY_COMMANDS.find((item) => item.id === id);
  if (!command) {
    throw new Error(`Missing ${id}.`);
  }

  return command;
}

describe("editor commands", () => {
  test("runs at a captured selection after the selection moved", () => {
    const editor = createEditor("Hello world");
    editor.tf.select(caret(5));
    const ref = captureSelection(editor);
    if (!ref) {
      throw new Error("Expected a selection ref.");
    }

    editor.tf.select(caret(0));
    const range = releaseSelection(ref);
    if (!range) {
      throw new Error("Expected a released range.");
    }

    expect(runEditorCommand(editor, insertX, undefined, { selection: range })).toBe(true);
    expect(documentText(editor)).toBe("HelloX world");
  });

  test("applies at a collapsed caret and an expanded range", () => {
    const collapsed = createEditor("Hello world");
    collapsed.tf.select(caret(5));
    expect(runEditorCommand(collapsed, insertX, undefined)).toBe(true);
    expect(documentText(collapsed)).toBe("HelloX world");

    const expanded = createEditor("Hello world");
    expanded.tf.select(span(6, 11));
    expect(runEditorCommand(expanded, insertX, undefined)).toBe(true);
    expect(documentText(expanded)).toBe("Hello X");
    expanded.tf.undo();
    expect(documentText(expanded)).toBe("Hello world");
  });

  test("one command is one undo step and stays separate from typing", () => {
    const editor = createEditor("Hello");
    editor.tf.select(caret(5));
    editor.tf.insertText("!");
    expect(runEditorCommand(editor, insertX, undefined)).toBe(true);
    expect(documentText(editor)).toBe("Hello!X");

    editor.tf.undo();
    expect(documentText(editor)).toBe("Hello!");
    editor.tf.redo();
    expect(documentText(editor)).toBe("Hello!X");

    editor.tf.insertText("Y");
    expect(documentText(editor)).toBe("Hello!XY");
    editor.tf.undo();
    expect(documentText(editor)).toBe("Hello!X");
  });

  test("two consecutive command runs are two undo steps", () => {
    const editor = createEditor("Hello");
    editor.tf.select(caret(5));
    expect(runEditorCommand(editor, insertX, undefined)).toBe(true);
    expect(runEditorCommand(editor, insertX, undefined)).toBe(true);
    expect(documentText(editor)).toBe("HelloXX");

    editor.tf.undo();
    expect(documentText(editor)).toBe("HelloX");
    editor.tf.undo();
    expect(documentText(editor)).toBe("Hello");
  });

  test("readOnly does nothing", () => {
    const editor = createEditor("Hello");
    editor.tf.select(caret(5));
    editor.tf.insertText("!");
    const text = documentText(editor);
    const undos = editor.history.undos.length;
    const redos = editor.history.redos.length;

    expect(runEditorCommand(editor, insertX, undefined, { readOnly: true })).toBe(false);
    expect(documentText(editor)).toBe(text);
    expect(editor.history.undos.length).toBe(undos);
    expect(editor.history.redos.length).toBe(redos);
  });

  test("a disabled command does nothing", () => {
    const editor = createEditor("Hello");
    editor.tf.select(caret(5));
    const disabled: EditorCommand = {
      ...insertX,
      id: "test.disabled",
      isEnabled: () => false,
    };

    expect(runEditorCommand(editor, disabled, undefined)).toBe(false);
    expect(documentText(editor)).toBe("Hello");
    expect(editor.history.undos).toEqual([]);
    expect(editor.history.redos).toEqual([]);
  });

  test("history undo and redo follow the stacks", () => {
    const editor = createEditor("Hi");
    editor.tf.select(caret(2));
    const undo = historyCommand("history.undo");
    const redo = historyCommand("history.redo");

    expect(undo.isEnabled?.(editor)).toBe(false);
    expect(redo.isEnabled?.(editor)).toBe(false);
    expect(runEditorCommand(editor, undo, undefined)).toBe(false);

    editor.tf.insertText("!");
    expect(documentText(editor)).toBe("Hi!");
    expect(undo.isEnabled?.(editor)).toBe(true);
    expect(runEditorCommand(editor, undo, undefined)).toBe(true);
    expect(documentText(editor)).toBe("Hi");
    expect(undo.isEnabled?.(editor)).toBe(false);
    expect(redo.isEnabled?.(editor)).toBe(true);
    expect(runEditorCommand(editor, redo, undefined)).toBe(true);
    expect(documentText(editor)).toBe("Hi!");
  });

  test("a captured selection stays on the same text after an insert before it", () => {
    const editor = createEditor("Hello world");
    editor.tf.select(span(6, 11));
    const ref = captureSelection(editor);
    if (!ref) {
      throw new Error("Expected a selection ref.");
    }

    editor.tf.select(caret(0));
    editor.tf.insertText("ABC");
    const range = releaseSelection(ref);
    if (!range) {
      throw new Error("Expected a released range.");
    }

    expect(editor.api.string(range)).toBe("world");
  });

  test("captureSelection is null without a selection", () => {
    const editor = createEditor("Hello");

    expect(editor.selection).toBeNull();
    expect(captureSelection(editor)).toBeNull();
  });
});
