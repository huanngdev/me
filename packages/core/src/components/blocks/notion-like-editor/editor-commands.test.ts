import { describe, expect, test } from "bun:test";

import { HISTORY_COMMANDS, runEditorCommand, type EditorCommand } from "./editor-commands";
import { captureSelection, releaseSelection } from "./editor-selection";
import { caret, createEditor, plainText, textRange } from "./test-utils";

const insertX: EditorCommand = {
  id: "test.insert-x",
  label: "Insert X",
  group: "insert",
  run: (editor) => {
    editor.tf.insertText("X");
  },
};

function editorWith(text: string) {
  return createEditor([{ type: "p", children: [{ text }] }]);
}

function historyCommand(id: string): EditorCommand {
  const command = HISTORY_COMMANDS.find((item) => item.id === id);
  if (!command) {
    throw new Error(`Missing ${id}.`);
  }

  return command;
}

describe("commands", () => {
  test("a command runs at the captured selection after the caret moved", () => {
    const editor = editorWith("Hello world");
    editor.tf.select(caret([0, 0], 5));
    const ref = captureSelection(editor);
    if (!ref) {
      throw new Error("Expected a selection ref.");
    }

    editor.tf.select(caret([0, 0], 0));
    const range = releaseSelection(ref);
    if (!range) {
      throw new Error("Expected a released range.");
    }
    const applied = runEditorCommand(editor, insertX, undefined, { selection: range });

    expect(applied).toBe(true);
    expect(plainText(editor)).toBe("HelloX world");
  });

  test("a command inserts at a collapsed caret", () => {
    const editor = editorWith("Hello world");
    editor.tf.select(caret([0, 0], 5));

    const applied = runEditorCommand(editor, insertX, undefined);

    expect(applied).toBe(true);
    expect(plainText(editor)).toBe("HelloX world");
  });

  test("a command replaces an expanded range and undo restores the original text", () => {
    const editor = editorWith("Hello world");
    editor.tf.select(textRange([0, 0], 6, 11));

    const applied = runEditorCommand(editor, insertX, undefined);

    expect(applied).toBe(true);
    expect(plainText(editor)).toBe("Hello X");

    editor.tf.undo();

    expect(plainText(editor)).toBe("Hello world");
  });

  test("one command is one undo step, separate from text typed before it", () => {
    const editor = editorWith("Hello");
    editor.tf.select(caret([0, 0], 5));
    editor.tf.insertText("!");

    const applied = runEditorCommand(editor, insertX, undefined);

    expect(applied).toBe(true);
    expect(plainText(editor)).toBe("Hello!X");

    editor.tf.undo();

    expect(plainText(editor)).toBe("Hello!");

    editor.tf.redo();

    expect(plainText(editor)).toBe("Hello!X");
  });

  test("text typed after a command is its own undo step", () => {
    const editor = editorWith("Hello");
    editor.tf.select(caret([0, 0], 5));
    editor.tf.insertText("!");
    runEditorCommand(editor, insertX, undefined);

    editor.tf.insertText("Y");

    expect(plainText(editor)).toBe("Hello!XY");

    editor.tf.undo();

    expect(plainText(editor)).toBe("Hello!X");
  });

  test("two consecutive command runs are two undo steps", () => {
    const editor = editorWith("Hello");
    editor.tf.select(caret([0, 0], 5));

    const first = runEditorCommand(editor, insertX, undefined);
    const second = runEditorCommand(editor, insertX, undefined);

    expect(first).toBe(true);
    expect(second).toBe(true);
    expect(plainText(editor)).toBe("HelloXX");

    editor.tf.undo();

    expect(plainText(editor)).toBe("HelloX");

    editor.tf.undo();

    expect(plainText(editor)).toBe("Hello");
  });

  test("a read-only editor ignores a command and leaves history unchanged", () => {
    const editor = editorWith("Hello");
    editor.tf.select(caret([0, 0], 5));
    editor.tf.insertText("!");
    const text = plainText(editor);
    const undos = editor.history.undos.length;
    const redos = editor.history.redos.length;

    const applied = runEditorCommand(editor, insertX, undefined, { readOnly: true });

    expect(applied).toBe(false);
    expect(plainText(editor)).toBe(text);
    expect(editor.history.undos.length).toBe(undos);
    expect(editor.history.redos.length).toBe(redos);
  });

  test("a disabled command does nothing", () => {
    const editor = editorWith("Hello");
    editor.tf.select(caret([0, 0], 5));
    const disabled: EditorCommand = {
      ...insertX,
      id: "test.disabled",
      isEnabled: () => false,
    };

    const applied = runEditorCommand(editor, disabled, undefined);

    expect(applied).toBe(false);
    expect(plainText(editor)).toBe("Hello");
    expect(editor.history.undos).toEqual([]);
    expect(editor.history.redos).toEqual([]);
  });

  test("history undo is disabled on a new document and restores the previous text", () => {
    const editor = editorWith("Hi");
    editor.tf.select(caret([0, 0], 2));
    const undo = historyCommand("history.undo");

    expect(undo.isEnabled?.(editor)).toBe(false);

    const refused = runEditorCommand(editor, undo, undefined);

    expect(refused).toBe(false);

    editor.tf.insertText("!");

    expect(plainText(editor)).toBe("Hi!");
    expect(undo.isEnabled?.(editor)).toBe(true);

    const applied = runEditorCommand(editor, undo, undefined);

    expect(applied).toBe(true);
    expect(plainText(editor)).toBe("Hi");
    expect(undo.isEnabled?.(editor)).toBe(false);
  });

  test("history redo restores the text removed by history undo", () => {
    const editor = editorWith("Hi");
    editor.tf.select(caret([0, 0], 2));
    const undo = historyCommand("history.undo");
    const redo = historyCommand("history.redo");
    editor.tf.insertText("!");
    runEditorCommand(editor, undo, undefined);

    expect(redo.isEnabled?.(editor)).toBe(true);

    const applied = runEditorCommand(editor, redo, undefined);

    expect(applied).toBe(true);
    expect(plainText(editor)).toBe("Hi!");
  });

  test("history redo is disabled before anything is undone", () => {
    const editor = editorWith("Hi");
    const redo = historyCommand("history.redo");

    expect(redo.isEnabled?.(editor)).toBe(false);
  });

  test("a captured selection stays on the same text after an insert before it", () => {
    const editor = editorWith("Hello world");
    editor.tf.select(textRange([0, 0], 6, 11));
    const ref = captureSelection(editor);
    if (!ref) {
      throw new Error("Expected a selection ref.");
    }

    editor.tf.select(caret([0, 0], 0));
    editor.tf.insertText("ABC");
    const range = releaseSelection(ref);
    if (!range) {
      throw new Error("Expected a released range.");
    }

    expect(editor.api.string(range)).toBe("world");
  });

  test("captureSelection is null when the editor has no selection", () => {
    const editor = editorWith("Hello");

    expect(editor.selection).toBeNull();
    expect(captureSelection(editor)).toBeNull();
  });
});
