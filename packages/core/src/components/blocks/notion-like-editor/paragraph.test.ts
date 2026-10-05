import { describe, expect, test } from "bun:test";
import type { SlateEditor } from "platejs";

import { blockIds, caret, createEditor, texts } from "./test-utils";

function leafMark(editor: SlateEditor, path: number[], key: string): unknown {
  const block = editor.children[path[0] ?? -1];
  const leaf = block && "children" in block ? block.children[path[1] ?? -1] : undefined;
  if (!leaf || typeof leaf !== "object" || !(key in leaf)) {
    return undefined;
  }

  return leaf[key];
}

// slate-dom withDOM insertTextData (dist/index.js:2006) splits on this pattern,
// then splitNodes + insertText. Headless Plate leaves insertTextData unimplemented.
function insertPlainText(editor: SlateEditor, text: string): void {
  const lines = text.split(/\r\n|\r|\n/);
  let split = false;
  for (const line of lines) {
    if (split) {
      editor.tf.splitNodes({ always: true });
    }
    editor.tf.insertText(line);
    split = true;
  }
}

describe("paragraph", () => {
  test("a new document is one empty paragraph with an id", () => {
    const editor = createEditor();
    const ids = blockIds(editor);

    expect(editor.children).toHaveLength(1);
    expect(texts(editor)).toEqual([""]);
    expect(ids).toHaveLength(1);
    expect(ids[0]).not.toBe("");
  });

  test("Enter in the middle of a paragraph splits it and gives the new paragraph a new id", () => {
    const editor = createEditor([
      { type: "p", id: "block-a", children: [{ text: "Hello world", bold: true }] },
    ]);
    editor.tf.select(caret([0, 0], 5));

    editor.tf.insertBreak();
    const ids = blockIds(editor);

    expect(texts(editor)).toEqual(["Hello", " world"]);
    expect(ids[0]).toBe("block-a");
    expect(ids[1]).not.toBe("block-a");
    expect(ids[1]).not.toBe("");
    expect(leafMark(editor, [0, 0], "bold")).toBe(true);
    expect(leafMark(editor, [1, 0], "bold")).toBe(true);
  });

  test("Shift+Enter stores a newline in the same paragraph", () => {
    const editor = createEditor([
      { type: "p", id: "block-a", children: [{ text: "Hello world" }] },
    ]);
    editor.tf.select(caret([0, 0], 5));

    editor.tf.insertSoftBreak();

    expect(editor.children).toHaveLength(1);
    expect(blockIds(editor)).toEqual(["block-a"]);
    expect(texts(editor)).toEqual(["Hello\n world"]);
  });

  test("Backspace at the start of a paragraph merges it into the previous one and keeps the first id", () => {
    const editor = createEditor([
      { type: "p", id: "block-a", children: [{ text: "Hello" }] },
      { type: "p", id: "block-b", children: [{ text: " world" }] },
    ]);
    editor.tf.select(caret([1, 0], 0));

    editor.tf.deleteBackward();

    expect(texts(editor)).toEqual(["Hello world"]);
    expect(blockIds(editor)).toEqual(["block-a"]);
  });

  test("Delete at the end of a paragraph merges the next one and keeps the first id", () => {
    const editor = createEditor([
      { type: "p", id: "block-a", children: [{ text: "Hello" }] },
      { type: "p", id: "block-b", children: [{ text: " world" }] },
    ]);
    editor.tf.select(caret([0, 0], 5));

    editor.tf.deleteForward();

    expect(texts(editor)).toEqual(["Hello world"]);
    expect(blockIds(editor)).toEqual(["block-a"]);
  });

  test("a split and merge keep whitespace, unicode, and emoji in the same paragraph", () => {
    const source = "  Tiếng 👩‍💻👍🏽  ";
    const editor = createEditor([{ type: "p", id: "block-a", children: [{ text: source }] }]);
    editor.tf.select(caret([0, 0], 8));

    editor.tf.insertBreak();

    expect(texts(editor).join("")).toBe(source);
    expect(blockIds(editor)[0]).toBe("block-a");

    editor.tf.select(caret([1, 0], 0));
    editor.tf.deleteBackward();

    expect(texts(editor)).toEqual([source]);
    expect(blockIds(editor)).toEqual(["block-a"]);
  });

  test("Backspace removes one combined emoji grapheme", () => {
    const editor = createEditor([{ type: "p", id: "block-a", children: [{ text: "x👩‍💻👍🏽" }] }]);
    const end = "x👩‍💻👍🏽".length;
    editor.tf.select(caret([0, 0], end));

    editor.tf.deleteBackward();

    expect(texts(editor)).toEqual(["x👩‍💻"]);

    editor.tf.deleteBackward();

    expect(texts(editor)).toEqual(["x"]);
  });

  test("deleting all content leaves one empty paragraph with an id", () => {
    const editor = createEditor([
      { type: "p", id: "block-a", children: [{ text: "Hello" }] },
      { type: "p", id: "block-b", children: [{ text: "world" }] },
    ]);
    const anchor = editor.api.start([]);
    const focus = editor.api.end([]);
    if (!anchor || !focus) {
      throw new Error("expected a document range");
    }
    editor.tf.select({ anchor, focus });

    editor.tf.deleteFragment();
    const ids = blockIds(editor);

    expect(editor.children).toHaveLength(1);
    expect(texts(editor)).toEqual([""]);
    expect(ids).toHaveLength(1);
    expect(ids[0]).not.toBe("");
  });

  test("plain text with CR, LF, and CRLF becomes one paragraph per line", () => {
    const editor = createEditor([{ type: "p", id: "block-a", children: [{ text: "" }] }]);
    editor.tf.select(caret([0, 0], 0));

    insertPlainText(editor, "a\r\nb\nc\rd");
    const lines = texts(editor);
    const ids = blockIds(editor);

    expect(lines).toEqual(["a", "b", "c", "d"]);
    expect(lines.join("")).not.toContain("\r");
    expect(new Set(ids).size).toBe(4);
    expect(ids[0]).toBe("block-a");
  });

  test("undo of Enter restores the original paragraph in one step", () => {
    const editor = createEditor([
      { type: "p", id: "block-a", children: [{ text: "Hello world", bold: true }] },
    ]);
    editor.tf.select(caret([0, 0], 5));
    const before = editor.history.undos.length;

    editor.tf.insertBreak();

    expect(editor.history.undos.length - before).toBe(1);

    editor.tf.undo();

    expect(texts(editor)).toEqual(["Hello world"]);
    expect(blockIds(editor)).toEqual(["block-a"]);
    expect(leafMark(editor, [0, 0], "bold")).toBe(true);
  });

  test("redo of Enter restores the split and the marks", () => {
    const editor = createEditor([
      { type: "p", id: "block-a", children: [{ text: "Hello world", bold: true }] },
    ]);
    editor.tf.select(caret([0, 0], 5));
    editor.tf.insertBreak();
    editor.tf.undo();

    editor.tf.redo();

    expect(texts(editor)).toEqual(["Hello", " world"]);
    expect(blockIds(editor)[0]).toBe("block-a");
    expect(leafMark(editor, [0, 0], "bold")).toBe(true);
    expect(leafMark(editor, [1, 0], "bold")).toBe(true);
  });

  test("undo of a paragraph merge restores both paragraphs in one step", () => {
    const editor = createEditor([
      { type: "p", id: "block-a", children: [{ text: "Hello" }] },
      { type: "p", id: "block-b", children: [{ text: " world" }] },
    ]);
    editor.tf.select(caret([1, 0], 0));
    const before = editor.history.undos.length;

    editor.tf.deleteBackward();

    expect(editor.history.undos.length - before).toBe(1);

    editor.tf.undo();

    expect(texts(editor)).toEqual(["Hello", " world"]);
    expect(blockIds(editor)[0]).toBe("block-a");
  });

  test("redo of a paragraph merge joins them again and keeps the first id", () => {
    const editor = createEditor([
      { type: "p", id: "block-a", children: [{ text: "Hello" }] },
      { type: "p", id: "block-b", children: [{ text: " world" }] },
    ]);
    editor.tf.select(caret([1, 0], 0));
    editor.tf.deleteBackward();
    editor.tf.undo();

    editor.tf.redo();

    expect(texts(editor)).toEqual(["Hello world"]);
    expect(blockIds(editor)).toEqual(["block-a"]);
  });
});
