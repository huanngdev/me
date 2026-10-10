import { describe, expect, test } from "bun:test";
import { KEYS, type SlateEditor } from "platejs";
import { serializeHtml } from "platejs/static";

import {
  getLineHeight,
  getTextAlign,
  runEditorCommand,
  setLineHeight,
  setTextAlign,
} from "../lib/commands/editor-commands";
import { createEditorDocument, serializeEditorDocument } from "../lib/document/editor-document";
import {
  LINE_HEIGHTS,
  allowedElementAttrValues,
  isAllowedElementAttrValue,
  isAllowedValue,
} from "../lib/document/editor-document-schema";
import { parseEditorDocument } from "../lib/document/editor-document-validate";
import {
  blockIds,
  caret,
  createEditor,
  deserializeHtmlInDom,
  expectOk,
  expectUnsupported,
  field,
  plainText,
  texts,
} from "./test-utils";

function paragraph(text: string, id?: string) {
  return { type: "p" as const, id, children: [{ text }] };
}

function pasteHtml(html: string): SlateEditor {
  const editor = createEditor();
  editor.tf.select(caret([0, 0], 0));
  editor.tf.insertFragment(deserializeHtmlInDom(editor, html));
  return editor;
}

function lineHeightAt(editor: SlateEditor, index: number): unknown {
  return field(editor.children[index], "lineHeight");
}

describe("line height", () => {
  test("setLineHeight stores a number, replaces it, and reset removes the attribute", () => {
    const editor = createEditor([paragraph("Hello", "block-a")]);
    editor.tf.select(caret([0, 0], 2));

    expect(runEditorCommand(editor, setLineHeight, 1)).toBe(true);
    expect(lineHeightAt(editor, 0)).toBe(1);
    expect(typeof lineHeightAt(editor, 0)).toBe("number");

    runEditorCommand(editor, setLineHeight, 1.5);

    expect(lineHeightAt(editor, 0)).toBe(1.5);

    runEditorCommand(editor, setLineHeight, null);

    expect(lineHeightAt(editor, 0)).toBeUndefined();
    expect("lineHeight" in (editor.children[0] ?? {})).toBe(false);
  });

  test("a collapsed caret sets line height on its block", () => {
    const editor = createEditor([
      paragraph("One", "block-a"),
      paragraph("Two", "block-b"),
      paragraph("Three", "block-c"),
    ]);
    editor.tf.select(caret([1, 0], 1));

    runEditorCommand(editor, setLineHeight, 1.75);

    expect(lineHeightAt(editor, 0)).toBeUndefined();
    expect(lineHeightAt(editor, 1)).toBe(1.75);
    expect(lineHeightAt(editor, 2)).toBeUndefined();
    expect(texts(editor)).toEqual(["One", "Two", "Three"]);
    expect(blockIds(editor)).toEqual(["block-a", "block-b", "block-c"]);
  });

  test("a selection across paragraphs sets each selected paragraph and leaves the rest", () => {
    const editor = createEditor([
      paragraph("One", "block-a"),
      paragraph("Two", "block-b"),
      paragraph("Three", "block-c"),
    ]);
    editor.tf.select({
      anchor: { path: [0, 0], offset: 1 },
      focus: { path: [1, 0], offset: 2 },
    });

    runEditorCommand(editor, setLineHeight, 2);

    expect(lineHeightAt(editor, 0)).toBe(2);
    expect(lineHeightAt(editor, 1)).toBe(2);
    expect(lineHeightAt(editor, 2)).toBeUndefined();
  });

  test("getLineHeight returns a value, null, or mixed", () => {
    const editor = createEditor([
      { type: "p", id: "a", lineHeight: 2, children: [{ text: "Double" }] },
      { type: "p", id: "b", children: [{ text: "Default" }] },
      { type: "p", id: "c", lineHeight: 1.25, children: [{ text: "Tight" }] },
    ]);

    editor.tf.select(caret([0, 0], 1));
    expect(getLineHeight(editor)).toBe(2);

    editor.tf.select(caret([1, 0], 1));
    expect(getLineHeight(editor)).toBe(null);

    editor.tf.select({
      anchor: { path: [0, 0], offset: 1 },
      focus: { path: [1, 0], offset: 3 },
    });
    expect(getLineHeight(editor)).toBe("mixed");

    editor.tf.select({
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [2, 0], offset: 5 },
    });
    expect(getLineHeight(editor)).toBe("mixed");

    editor.selection = null;
    expect(getLineHeight(editor)).toBe(null);
  });

  test("line height keeps text, marks, ids, and alignment", () => {
    const editor = createEditor([
      {
        type: "p",
        id: "block-a",
        align: "center",
        children: [{ text: "Hello", bold: true }],
      },
    ]);
    editor.tf.select(caret([0, 0], 2));

    runEditorCommand(editor, setLineHeight, 2);

    expect(texts(editor)).toEqual(["Hello"]);
    expect(blockIds(editor)).toEqual(["block-a"]);
    expect(field(editor.children[0], "align")).toBe("center");
    expect(editor.children[0]?.children[0]).toEqual({ text: "Hello", bold: true });
    expect(lineHeightAt(editor, 0)).toBe(2);
    expect(getTextAlign(editor)).toBe("center");

    editor.tf.select(caret([0, 0], 2));
    runEditorCommand(editor, setTextAlign, "right");

    expect(field(editor.children[0], "align")).toBe("right");
    expect(lineHeightAt(editor, 0)).toBe(2);
    expect(getLineHeight(editor)).toBe(2);

    runEditorCommand(editor, setLineHeight, null);

    expect(lineHeightAt(editor, 0)).toBeUndefined();
    expect(field(editor.children[0], "align")).toBe("right");
    expect(editor.children[0]?.children[0]).toEqual({ text: "Hello", bold: true });
    expect(blockIds(editor)).toEqual(["block-a"]);
  });

  test("setting line height is one undo step, and redo restores it", () => {
    const editor = createEditor([paragraph("Hello", "block-a")]);
    editor.tf.select(caret([0, 0], 5));
    editor.tf.insertText("!");
    const undos = editor.history.undos.length;

    runEditorCommand(editor, setLineHeight, 1.25);

    expect(editor.history.undos.length - undos).toBe(1);
    expect(lineHeightAt(editor, 0)).toBe(1.25);
    expect(texts(editor)).toEqual(["Hello!"]);

    editor.tf.undo();

    expect(lineHeightAt(editor, 0)).toBeUndefined();
    expect(texts(editor)).toEqual(["Hello!"]);

    editor.tf.redo();

    expect(lineHeightAt(editor, 0)).toBe(1.25);
  });

  test("a read-only editor refuses the line height command", () => {
    const editor = createEditor([paragraph("Hello", "block-a")]);
    editor.tf.select(caret([0, 0], 1));
    const undos = editor.history.undos.length;

    const applied = runEditorCommand(editor, setLineHeight, 2, { readOnly: true });

    expect(applied).toBe(false);
    expect(lineHeightAt(editor, 0)).toBeUndefined();
    expect(editor.history.undos.length).toBe(undos);
  });

  test("setLineHeight is a format command, targets paragraphs, and has no shortcut", () => {
    const editor = createEditor();
    const plugin = editor.getPlugin({ key: KEYS.lineHeight });

    expect(KEYS.lineHeight).toBe("lineHeight");
    expect(editor.getType(KEYS.lineHeight)).toBe("lineHeight");
    expect(plugin.inject.nodeProps?.defaultNodeValue).toBe(0);
    expect(plugin.inject.nodeProps?.nodeKey).toBe("lineHeight");
    expect(plugin.inject.targetPlugins).toEqual([KEYS.p]);
    expect(setLineHeight.id).toBe("format.line-height");
    expect(setLineHeight.group).toBe("format");
    expect(setLineHeight.label).toBe("Line height");
    expect(editor.meta.shortcuts["lineHeight.toggle"]).toBeUndefined();
  });

  test.each(LINE_HEIGHTS.map((lineHeight) => [String(lineHeight), lineHeight] as const))(
    "%s round-trips through serialize and parse",
    (_label, lineHeight) => {
      const document = createEditorDocument("doc-line-height", [
        { type: "p", id: "p", lineHeight, children: [{ text: "Hi" }] },
      ]);
      const serialized: unknown = JSON.parse(serializeEditorDocument(document));
      const parsed = expectOk(parseEditorDocument(serialized));

      expect(parsed.repairs).toEqual([]);
      expect(parsed.document.content).toEqual(document.content);
      expect(field(parsed.document.content[0], "lineHeight")).toBe(lineHeight);
    },
  );

  test("1.3 outside the presets is unsupported and the raw input is kept", () => {
    const raw = createEditorDocument("doc-line-height", [
      { type: "p", id: "p", lineHeight: 1.3, children: [{ text: "Hi" }] },
    ]);

    const result = expectUnsupported(parseEditorDocument(raw));

    expect(result.raw).toBe(raw);
    expect(result.issues[0]?.path).toEqual([0]);
    expect(result.issues[0]?.message).toContain('unsupported lineHeight "1.3"');
    expect(field(raw.content[0], "lineHeight")).toBe(1.3);
  });

  test.each(["1.5", "normal"])(
    "%s outside the numeric presets is unsupported and the raw input is kept",
    (lineHeight) => {
      const raw = createEditorDocument("doc-line-height", [
        { type: "p", id: "p", children: [{ text: "Hi" }] },
      ]);
      const block = raw.content[0];
      if (block) {
        Object.assign(block, { lineHeight });
      }

      const result = expectUnsupported(parseEditorDocument(raw));

      expect(result.raw).toBe(raw);
      expect(result.issues[0]?.message).toContain(`unsupported lineHeight "${lineHeight}"`);
      expect(field(raw.content[0], "lineHeight")).toBe(lineHeight);
    },
  );

  test("the line height allowlist accepts the presets and rejects other values", () => {
    expect(allowedElementAttrValues(KEYS.p, "lineHeight")).toEqual([...LINE_HEIGHTS]);
    expect(isAllowedElementAttrValue(KEYS.p, "lineHeight", 1.5)).toBe(true);
    expect(isAllowedElementAttrValue(KEYS.p, "lineHeight", 2)).toBe(true);
    expect(isAllowedElementAttrValue(KEYS.p, "lineHeight", "1.5")).toBe(false);
    expect(isAllowedElementAttrValue(KEYS.p, "lineHeight", 1.3)).toBe(false);
    expect(isAllowedElementAttrValue(KEYS.p, "lineHeight", "normal")).toBe(false);
    expect(isAllowedElementAttrValue(KEYS.p, "lineHeight", "24px")).toBe(false);
    expect(isAllowedElementAttrValue(KEYS.p, "lineHeight", "150%")).toBe(false);
    expect(isAllowedValue(1.25, LINE_HEIGHTS)).toBe(true);
    expect(isAllowedValue("1.25", LINE_HEIGHTS)).toBe(false);
    expect(isAllowedValue("center", ["left", "center", "right", "justify"])).toBe(true);
  });

  test.each(LINE_HEIGHTS.map((lineHeight) => [String(lineHeight), lineHeight] as const))(
    "%s renders as line-height",
    async (_label, lineHeight) => {
      const editor = createEditor([{ type: "p", lineHeight, children: [{ text: "Hello" }] }]);

      const html = await serializeHtml(editor);

      expect(html).toMatch(new RegExp(`line-height:\\s*${lineHeight}(?![\\d.])`));
    },
  );

  test("a paragraph without line height does not render line-height", async () => {
    const editor = createEditor([paragraph("Hello")]);

    const html = await serializeHtml(editor);

    expect(html).not.toMatch(/line-height/);
  });

  test.each([
    ["2", 2],
    ["1.5", 1.5],
  ] as const)("pasting line-height %s stores the number", (label, lineHeight) => {
    const editor = pasteHtml(`<p style="line-height:${label}">a</p>`);

    expect(plainText(editor)).toBe("a");
    expect(lineHeightAt(editor, 0)).toBe(lineHeight);
    expect(typeof lineHeightAt(editor, 0)).toBe("number");
  });

  test.each(["1.38", "normal", "24px", "150%"])(
    "pasting line-height %s drops the value and keeps the text",
    (lineHeight) => {
      const editor = pasteHtml(`<p style="line-height:${lineHeight}">b</p>`);

      expect(plainText(editor)).toBe("b");
      expect(lineHeightAt(editor, 0)).toBeUndefined();
    },
  );

  test("pasting an editor fragment keeps a numeric line height", () => {
    const editor = createEditor();
    editor.tf.select(caret([0, 0], 0));
    editor.tf.insertFragment([
      { type: "p", lineHeight: 1.75, align: "right", children: [{ text: "x", bold: true }] },
    ]);

    expect(plainText(editor)).toBe("x");
    expect(lineHeightAt(editor, 0)).toBe(1.75);
    expect(field(editor.children[0], "align")).toBe("right");
    expect(field(editor.children[0]?.children[0], "bold")).toBe(true);
  });
});
