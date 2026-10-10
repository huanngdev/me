import { describe, expect, test } from "bun:test";
import { ElementApi, type SlateEditor } from "platejs";

import { clearFormatting, formatBold, runEditorCommand } from "../lib/commands/editor-commands";
import { CLEARABLE_MARK_KEYS, EDITOR_MARK_RULES } from "../lib/document/editor-document-schema";
import { caret, createEditor, field, isRecord, textRange } from "./test-utils";

const markedLeaf = {
  text: "Hello world",
  bold: true,
  italic: true,
  color: "red",
};

function paragraph(text: string, id?: string) {
  return { type: "p" as const, id, children: [{ text }] };
}

function pressClear(editor: SlateEditor): void {
  const shortcut = editor.meta.shortcuts["clearFormatting.clear"];
  if (!shortcut?.handler) {
    throw new Error("Missing clear formatting shortcut.");
  }

  shortcut.handler({ editor });
}

function childrenOf(node: unknown): unknown[] {
  if (!isRecord(node) || !Array.isArray(node.children)) {
    return [];
  }

  return node.children;
}

describe("clear formatting", () => {
  test("the clear list equals the allowlist mark types", () => {
    expect([...CLEARABLE_MARK_KEYS]).toEqual(EDITOR_MARK_RULES.map((rule) => rule.type));

    for (const rule of EDITOR_MARK_RULES) {
      const value = rule.values?.[0] ?? true;
      const editor = createEditor([paragraph("Hello", "block-a")]);
      editor.tf.select(textRange([0, 0], 0, 5));
      editor.tf.addMark(rule.type, value);

      expect(clearFormatting.isEnabled?.(editor)).toBe(true);
      expect(field(editor.children[0]?.children[0], rule.type)).toBe(value);

      expect(runEditorCommand(editor, clearFormatting, undefined)).toBe(true);
      expect(field(editor.children[0]?.children[0], rule.type)).toBeUndefined();
      expect(clearFormatting.isEnabled?.(editor)).toBe(false);
    }
  });

  test("clears only the selected middle of a marked leaf", () => {
    const editor = createEditor([{ type: "p", id: "block-a", children: [markedLeaf] }]);
    editor.tf.select(textRange([0, 0], 3, 8));

    runEditorCommand(editor, clearFormatting, undefined);

    expect(editor.children[0]?.children).toEqual([
      { text: "Hel", bold: true, italic: true, color: "red" },
      { text: "lo wo" },
      { text: "rld", bold: true, italic: true, color: "red" },
    ]);
  });

  test("clears the selected portion of every block in a multi-block range", () => {
    const editor = createEditor([
      { type: "p", id: "block-a", children: [{ text: "Hello world", bold: true }] },
      { type: "p", id: "block-b", children: [{ text: "Second line", italic: true }] },
    ]);
    editor.tf.select({
      anchor: { path: [0, 0], offset: 6 },
      focus: { path: [1, 0], offset: 6 },
    });

    runEditorCommand(editor, clearFormatting, undefined);

    expect(editor.children[0]?.children).toEqual([
      { text: "Hello ", bold: true },
      { text: "world" },
    ]);
    expect(editor.children[1]?.children).toEqual([
      { text: "Second" },
      { text: " line", italic: true },
    ]);
  });

  test("keeps block type, id, align, and line height", () => {
    const editor = createEditor([
      {
        type: "p",
        id: "block-a",
        align: "right",
        lineHeight: 1.75,
        children: [{ text: "Hello", bold: true, italic: true, color: "red" }],
      },
    ]);
    editor.tf.select(textRange([0, 0], 0, 5));

    runEditorCommand(editor, clearFormatting, undefined);

    const block = editor.children[0];
    expect(field(block, "type")).toBe("p");
    expect(field(block, "id")).toBe("block-a");
    expect(field(block, "align")).toBe("right");
    expect(field(block, "lineHeight")).toBe(1.75);
    expect(block?.children).toEqual([{ text: "Hello" }]);
  });

  test("a collapsed caret clears pending marks and leaves the surrounding word marked", () => {
    const editor = createEditor([{ type: "p", children: [{ text: "Hello", bold: true }] }]);
    editor.tf.select(caret([0, 0], 3));
    const undos = editor.history.undos.length;

    expect(clearFormatting.isEnabled?.(editor)).toBe(true);
    runEditorCommand(editor, clearFormatting, undefined);

    expect(editor.history.undos.length).toBe(undos);
    expect(editor.children[0]?.children).toEqual([{ text: "Hello", bold: true }]);

    editor.tf.insertText("X");

    expect(editor.children[0]?.children).toEqual([
      { text: "Hel", bold: true },
      { text: "X" },
      { text: "lo", bold: true },
    ]);
  });

  test("pending marks at the end of plain text are cleared before the next character", () => {
    const editor = createEditor([paragraph("Hello")]);
    editor.tf.select(caret([0, 0], 5));
    runEditorCommand(editor, formatBold, undefined);

    expect(clearFormatting.isEnabled?.(editor)).toBe(true);
    runEditorCommand(editor, clearFormatting, undefined);
    editor.tf.insertText("X");

    expect(editor.children[0]?.children).toEqual([{ text: "HelloX" }]);
  });

  test("one undo step restores a cleared range and redo clears it again", () => {
    const editor = createEditor([{ type: "p", id: "block-a", children: [markedLeaf] }]);
    editor.tf.select(textRange([0, 0], 3, 8));
    const before = JSON.parse(JSON.stringify(editor.children));
    const undos = editor.history.undos.length;

    runEditorCommand(editor, clearFormatting, undefined);
    const cleared = JSON.parse(JSON.stringify(editor.children));

    expect(editor.history.undos.length - undos).toBe(1);

    editor.tf.undo();
    expect(editor.children).toEqual(before);

    editor.tf.redo();
    expect(editor.children).toEqual(cleared);
  });

  test("read-only refuses to clear formatting", () => {
    const editor = createEditor([{ type: "p", children: [{ text: "Hello", bold: true }] }]);
    editor.tf.select(textRange([0, 0], 0, 5));
    const undos = editor.history.undos.length;

    const applied = runEditorCommand(editor, clearFormatting, undefined, { readOnly: true });

    expect(applied).toBe(false);
    expect(editor.children[0]?.children).toEqual([{ text: "Hello", bold: true }]);
    expect(editor.history.undos.length).toBe(undos);
  });

  test("isEnabled is false on plain text and true on marked text", () => {
    const plain = createEditor([paragraph("Hello")]);
    expect(clearFormatting.isEnabled?.(plain)).toBe(false);

    plain.tf.select(textRange([0, 0], 0, 5));
    expect(clearFormatting.isEnabled?.(plain)).toBe(false);
    expect(runEditorCommand(plain, clearFormatting, undefined)).toBe(false);

    plain.tf.select(caret([0, 0], 2));
    expect(clearFormatting.isEnabled?.(plain)).toBe(false);

    const marked = createEditor([{ type: "p", children: [{ text: "Hello", bold: true }] }]);
    marked.tf.select(textRange([0, 0], 1, 4));
    expect(clearFormatting.isEnabled?.(marked)).toBe(true);

    marked.tf.select(caret([0, 0], 2));
    expect(clearFormatting.isEnabled?.(marked)).toBe(true);
  });

  test("clear formatting removes marks inside a real link and keeps the link", () => {
    const editor = createEditor([
      {
        type: "p",
        id: "block-a",
        children: [
          { text: "Before " },
          {
            type: "a",
            url: "https://example.com",
            children: [{ text: "link", bold: true, italic: true, color: "red" }],
          },
          { text: " after" },
        ],
      },
    ]);
    const inline = childrenOf(editor.children[0])[1];
    if (!ElementApi.isElement(inline)) {
      throw new Error("Missing inline element.");
    }

    expect(editor.api.isInline(inline)).toBe(true);
    editor.tf.select(textRange([0, 1, 0], 0, 4));
    runEditorCommand(editor, clearFormatting, undefined);

    const kept = childrenOf(editor.children[0])[1];
    expect(field(kept, "type")).toBe("a");
    expect(field(kept, "url")).toBe("https://example.com");
    expect(childrenOf(kept)[0]).toEqual({ text: "link" });
    expect(field(childrenOf(editor.children[0])[0], "text")).toBe("Before ");
    expect(field(childrenOf(editor.children[0])[2], "text")).toBe(" after");
  });

  test("the clear formatting shortcut clears a range", () => {
    const editor = createEditor([{ type: "p", children: [markedLeaf] }]);
    editor.tf.select(textRange([0, 0], 3, 8));

    pressClear(editor);

    expect(editor.children[0]?.children).toEqual([
      { text: "Hel", bold: true, italic: true, color: "red" },
      { text: "lo wo" },
      { text: "rld", bold: true, italic: true, color: "red" },
    ]);
  });

  test("the clear formatting shortcut clears pending marks at a caret", () => {
    const editor = createEditor([{ type: "p", children: [{ text: "Hello", bold: true }] }]);
    editor.tf.select(caret([0, 0], 3));

    pressClear(editor);
    editor.tf.insertText("X");

    expect(editor.children[0]?.children).toEqual([
      { text: "Hel", bold: true },
      { text: "X" },
      { text: "lo", bold: true },
    ]);
  });

  test("the clear formatting shortcut does nothing in a read-only editor", () => {
    const editor = createEditor([{ type: "p", children: [{ text: "Hello", bold: true }] }]);
    editor.tf.select(textRange([0, 0], 0, 5));
    editor.dom.readOnly = true;
    const undos = editor.history.undos.length;

    pressClear(editor);

    expect(editor.children[0]?.children).toEqual([{ text: "Hello", bold: true }]);
    expect(editor.history.undos.length).toBe(undos);
  });
});
