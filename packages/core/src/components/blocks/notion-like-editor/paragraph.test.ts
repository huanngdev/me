import { describe, expect, test } from "bun:test";
import { createSlateEditor, type SlateEditor, type TRange } from "platejs";

import { createEditorPlugins } from "./editor-plugins";
import { EMPTY_EDITOR_VALUE, type EditorValue } from "./editor-value";

function createEditor(value: EditorValue = EMPTY_EDITOR_VALUE): SlateEditor {
  return createSlateEditor({
    plugins: createEditorPlugins(),
    value,
  });
}

function caret(path: number[], offset: number): TRange {
  return {
    anchor: { path, offset },
    focus: { path, offset },
  };
}

function blockIds(editor: SlateEditor): string[] {
  const ids: string[] = [];
  for (const block of editor.children) {
    if ("id" in block && typeof block.id === "string") {
      ids.push(block.id);
    }
  }
  return ids;
}

function texts(editor: SlateEditor): string[] {
  const lines: string[] = [];
  for (const block of editor.children) {
    let line = "";
    for (const child of block.children) {
      if ("text" in child && typeof child.text === "string") {
        line += child.text;
      }
    }
    lines.push(line);
  }
  return lines;
}

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

    expect(editor.children).toHaveLength(1);
    expect(texts(editor)).toEqual([""]);
    expect(blockIds(editor)).toHaveLength(1);
    expect(blockIds(editor)[0]).not.toBe("");
  });

  test("enter splits the paragraph and keeps marks on both sides", () => {
    const editor = createEditor([
      { type: "p", id: "block-a", children: [{ text: "Hello world", bold: true }] },
    ]);
    editor.tf.select(caret([0, 0], 5));

    editor.tf.insertBreak();

    expect(texts(editor)).toEqual(["Hello", " world"]);
    expect(blockIds(editor)[0]).toBe("block-a");
    expect(blockIds(editor)[1]).not.toBe("block-a");
    expect(blockIds(editor)[1]).not.toBe("");
    expect(leafMark(editor, [0, 0], "bold")).toBe(true);
    expect(leafMark(editor, [1, 0], "bold")).toBe(true);
  });

  test("insertSoftBreak stores a newline in the same paragraph", () => {
    const editor = createEditor([
      { type: "p", id: "block-a", children: [{ text: "Hello world" }] },
    ]);
    editor.tf.select(caret([0, 0], 5));

    editor.tf.insertSoftBreak();

    expect(editor.children).toHaveLength(1);
    expect(blockIds(editor)).toEqual(["block-a"]);
    expect(texts(editor)).toEqual(["Hello\n world"]);
  });

  test("backspace and delete merge paragraphs and keep the first id", () => {
    const backspace = createEditor([
      { type: "p", id: "block-a", children: [{ text: "Hello" }] },
      { type: "p", id: "block-b", children: [{ text: " world" }] },
    ]);
    backspace.tf.select(caret([1, 0], 0));
    backspace.tf.deleteBackward();

    expect(texts(backspace)).toEqual(["Hello world"]);
    expect(blockIds(backspace)).toEqual(["block-a"]);

    const forward = createEditor([
      { type: "p", id: "block-a", children: [{ text: "Hello" }] },
      { type: "p", id: "block-b", children: [{ text: " world" }] },
    ]);
    forward.tf.select(caret([0, 0], 5));
    forward.tf.deleteForward();

    expect(texts(forward)).toEqual(["Hello world"]);
    expect(blockIds(forward)).toEqual(["block-a"]);
  });

  test("whitespace, unicode, and emoji survive split and merge", () => {
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

  test("deleteBackward removes one combined emoji grapheme", () => {
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

    expect(editor.children).toHaveLength(1);
    expect(texts(editor)).toEqual([""]);
    expect(blockIds(editor)).toHaveLength(1);
    expect(blockIds(editor)[0]).not.toBe("");
  });

  test("plain text line endings become one paragraph per line", () => {
    const editor = createEditor([{ type: "p", id: "block-a", children: [{ text: "" }] }]);
    editor.tf.select(caret([0, 0], 0));

    insertPlainText(editor, "a\r\nb\nc\rd");

    expect(texts(editor)).toEqual(["a", "b", "c", "d"]);
    expect(texts(editor).join("")).not.toContain("\r");
    expect(new Set(blockIds(editor)).size).toBe(4);
    expect(blockIds(editor)[0]).toBe("block-a");
  });

  test("undo and redo restore a split and a merge as one step each", () => {
    const split = createEditor([
      { type: "p", id: "block-a", children: [{ text: "Hello world", bold: true }] },
    ]);
    split.tf.select(caret([0, 0], 5));
    const beforeSplit = split.history.undos.length;
    split.tf.insertBreak();

    expect(split.history.undos.length - beforeSplit).toBe(1);
    split.tf.undo();
    expect(texts(split)).toEqual(["Hello world"]);
    expect(blockIds(split)).toEqual(["block-a"]);
    expect(leafMark(split, [0, 0], "bold")).toBe(true);

    split.tf.redo();
    expect(texts(split)).toEqual(["Hello", " world"]);
    expect(blockIds(split)[0]).toBe("block-a");
    expect(leafMark(split, [0, 0], "bold")).toBe(true);
    expect(leafMark(split, [1, 0], "bold")).toBe(true);

    const merge = createEditor([
      { type: "p", id: "block-a", children: [{ text: "Hello" }] },
      { type: "p", id: "block-b", children: [{ text: " world" }] },
    ]);
    merge.tf.select(caret([1, 0], 0));
    const beforeMerge = merge.history.undos.length;
    merge.tf.deleteBackward();

    expect(merge.history.undos.length - beforeMerge).toBe(1);
    merge.tf.undo();
    expect(texts(merge)).toEqual(["Hello", " world"]);
    expect(blockIds(merge)[0]).toBe("block-a");

    merge.tf.redo();
    expect(texts(merge)).toEqual(["Hello world"]);
    expect(blockIds(merge)).toEqual(["block-a"]);
  });
});
