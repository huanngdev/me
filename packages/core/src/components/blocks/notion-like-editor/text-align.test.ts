import { describe, expect, test } from "bun:test";
import { KEYS, type SlateEditor } from "platejs";
import { serializeHtml } from "platejs/static";

import { getTextAlign, runEditorCommand, setTextAlign } from "./editor-commands";
import { createEditorDocument, serializeEditorDocument } from "./editor-document";
import {
  TEXT_ALIGNS,
  allowedElementAttrValues,
  allowedElementAttrs,
  isAllowedElementAttrValue,
  isAllowedValue,
} from "./editor-document-schema";
import { parseEditorDocument } from "./editor-document-validate";
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

function alignAt(editor: SlateEditor, index: number): unknown {
  return field(editor.children[index], "align");
}

describe("text align", () => {
  test("setTextAlign stores align, replaces it, and reset removes the attribute", () => {
    const editor = createEditor([paragraph("Hello", "block-a")]);
    editor.tf.select(caret([0, 0], 2));

    expect(runEditorCommand(editor, setTextAlign, "left")).toBe(true);
    expect(alignAt(editor, 0)).toBe("left");

    runEditorCommand(editor, setTextAlign, "center");

    expect(alignAt(editor, 0)).toBe("center");

    runEditorCommand(editor, setTextAlign, null);

    expect(alignAt(editor, 0)).toBeUndefined();
    expect("align" in (editor.children[0] ?? {})).toBe(false);
  });

  test("a collapsed caret aligns its block", () => {
    const editor = createEditor([
      paragraph("One", "block-a"),
      paragraph("Two", "block-b"),
      paragraph("Three", "block-c"),
    ]);
    editor.tf.select(caret([1, 0], 1));

    runEditorCommand(editor, setTextAlign, "right");

    expect(alignAt(editor, 0)).toBeUndefined();
    expect(alignAt(editor, 1)).toBe("right");
    expect(alignAt(editor, 2)).toBeUndefined();
    expect(texts(editor)).toEqual(["One", "Two", "Three"]);
    expect(blockIds(editor)).toEqual(["block-a", "block-b", "block-c"]);
  });

  test("a selection across paragraphs aligns each selected paragraph and leaves the rest", () => {
    const editor = createEditor([
      paragraph("One", "block-a"),
      paragraph("Two", "block-b"),
      paragraph("Three", "block-c"),
    ]);
    editor.tf.select({
      anchor: { path: [0, 0], offset: 1 },
      focus: { path: [1, 0], offset: 2 },
    });

    runEditorCommand(editor, setTextAlign, "justify");

    expect(alignAt(editor, 0)).toBe("justify");
    expect(alignAt(editor, 1)).toBe("justify");
    expect(alignAt(editor, 2)).toBeUndefined();
    expect(texts(editor)).toEqual(["One", "Two", "Three"]);
    expect(blockIds(editor)).toEqual(["block-a", "block-b", "block-c"]);
  });

  test("getTextAlign returns a value, null, or mixed", () => {
    const editor = createEditor([
      { type: "p", id: "a", align: "center", children: [{ text: "Center" }] },
      { type: "p", id: "b", children: [{ text: "Default" }] },
      { type: "p", id: "c", align: "right", children: [{ text: "Right" }] },
    ]);

    editor.tf.select(caret([0, 0], 1));
    expect(getTextAlign(editor)).toBe("center");

    editor.tf.select(caret([1, 0], 1));
    expect(getTextAlign(editor)).toBe(null);

    editor.tf.select({
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [0, 0], offset: 6 },
    });
    expect(getTextAlign(editor)).toBe("center");

    editor.tf.select({
      anchor: { path: [0, 0], offset: 1 },
      focus: { path: [1, 0], offset: 3 },
    });
    expect(getTextAlign(editor)).toBe("mixed");

    editor.tf.select({
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [2, 0], offset: 5 },
    });
    expect(getTextAlign(editor)).toBe("mixed");

    editor.selection = null;
    expect(getTextAlign(editor)).toBe(null);
  });

  test("alignment keeps marks, text, and ids", () => {
    const editor = createEditor([
      {
        type: "p",
        id: "block-a",
        children: [{ text: "Hello", bold: true, italic: true }],
      },
    ]);
    editor.tf.select(caret([0, 0], 2));

    runEditorCommand(editor, setTextAlign, "center");

    expect(texts(editor)).toEqual(["Hello"]);
    expect(blockIds(editor)).toEqual(["block-a"]);
    expect(editor.children[0]?.children[0]).toEqual({ text: "Hello", bold: true, italic: true });
    expect(alignAt(editor, 0)).toBe("center");

    runEditorCommand(editor, setTextAlign, null);

    expect(editor.children[0]?.children[0]).toEqual({ text: "Hello", bold: true, italic: true });
    expect(blockIds(editor)).toEqual(["block-a"]);
    expect(alignAt(editor, 0)).toBeUndefined();
  });

  test("setting alignment is one undo step, and redo restores it", () => {
    const editor = createEditor([paragraph("Hello", "block-a")]);
    editor.tf.select(caret([0, 0], 5));
    editor.tf.insertText("!");
    const undos = editor.history.undos.length;

    runEditorCommand(editor, setTextAlign, "right");

    expect(editor.history.undos.length - undos).toBe(1);
    expect(alignAt(editor, 0)).toBe("right");
    expect(texts(editor)).toEqual(["Hello!"]);

    editor.tf.undo();

    expect(alignAt(editor, 0)).toBeUndefined();
    expect(texts(editor)).toEqual(["Hello!"]);

    editor.tf.redo();

    expect(alignAt(editor, 0)).toBe("right");
    expect(texts(editor)).toEqual(["Hello!"]);
  });

  test("a read-only editor refuses the alignment command", () => {
    const editor = createEditor([paragraph("Hello", "block-a")]);
    editor.tf.select(caret([0, 0], 1));
    const undos = editor.history.undos.length;

    const applied = runEditorCommand(editor, setTextAlign, "center", { readOnly: true });

    expect(applied).toBe(false);
    expect(alignAt(editor, 0)).toBeUndefined();
    expect(editor.history.undos.length).toBe(undos);
  });

  test("setTextAlign is a format command, targets paragraphs and headings, and has no shortcut", () => {
    const editor = createEditor();
    const plugin = editor.getPlugin({ key: KEYS.textAlign });

    expect(KEYS.textAlign).toBe("textAlign");
    expect(editor.getType(KEYS.textAlign)).toBe("align");
    expect(plugin.inject.targetPlugins).toEqual([KEYS.p, KEYS.h1, KEYS.h2, KEYS.h3]);
    expect(setTextAlign.id).toBe("format.align");
    expect(setTextAlign.group).toBe("format");
    expect(setTextAlign.label).toBe("Text align");
    expect(editor.meta.shortcuts["textAlign.toggle"]).toBeUndefined();
    expect(editor.meta.shortcuts["align.toggle"]).toBeUndefined();
  });

  test.each([...TEXT_ALIGNS])("%s round-trips through serialize and parse", (align) => {
    const document = createEditorDocument("doc-align", [
      { type: "p", id: "p", align, children: [{ text: "Hi" }] },
    ]);
    const serialized: unknown = JSON.parse(serializeEditorDocument(document));
    const parsed = expectOk(parseEditorDocument(serialized));

    expect(parsed.repairs).toEqual([]);
    expect(parsed.document.content).toEqual(document.content);
  });

  test.each(["start", "end", "-webkit-center", "middle"])(
    "%s outside the allowlist is unsupported and the raw input is kept",
    (align) => {
      const raw = createEditorDocument("doc-align", [
        { type: "p", id: "p", align, children: [{ text: "Hi" }] },
      ]);

      const result = expectUnsupported(parseEditorDocument(raw));

      expect(result.raw).toBe(raw);
      expect(result.issues[0]?.path).toEqual([0]);
      expect(result.issues[0]?.message).toContain(`unsupported align "${align}"`);
      expect(field(raw.content[0], "align")).toBe(align);
    },
  );

  test("a numeric align value is unsupported and the raw input is kept", () => {
    const raw = createEditorDocument("doc-align", [
      { type: "p", id: "p", children: [{ text: "Hi" }] },
    ]);
    const block = raw.content[0];
    if (block) {
      Object.assign(block, { align: 1 });
    }

    const result = expectUnsupported(parseEditorDocument(raw));

    expect(result.raw).toBe(raw);
    expect(result.issues[0]?.path).toEqual([0]);
    expect(result.issues[0]?.message).toContain('unsupported align "1"');
    expect(field(raw.content[0], "align")).toBe(1);
  });

  test("the align allowlist accepts the four values and rejects the rest", () => {
    expect(allowedElementAttrs(KEYS.p)?.has("align")).toBe(true);
    expect(allowedElementAttrs(KEYS.p)?.has("id")).toBe(true);
    expect(allowedElementAttrValues(KEYS.p, "align")).toEqual([...TEXT_ALIGNS]);
    expect(allowedElementAttrValues(KEYS.p, "id")).toBeUndefined();
    expect(isAllowedElementAttrValue(KEYS.p, "id", "any-id")).toBe(true);
    expect(isAllowedElementAttrValue(KEYS.p, "align", "center")).toBe(true);
    expect(isAllowedElementAttrValue(KEYS.p, "align", "start")).toBe(false);
    expect(isAllowedElementAttrValue(KEYS.p, "align", "end")).toBe(false);
    expect(isAllowedElementAttrValue(KEYS.p, "align", "-webkit-center")).toBe(false);
    expect(isAllowedElementAttrValue(KEYS.p, "align", "middle")).toBe(false);
    expect(isAllowedElementAttrValue(KEYS.p, "align", 1)).toBe(false);
    expect(isAllowedValue("justify", TEXT_ALIGNS)).toBe(true);
    expect(isAllowedValue("start", TEXT_ALIGNS)).toBe(false);
  });

  test.each([...TEXT_ALIGNS])("%s renders as text-align", async (align) => {
    const editor = createEditor([{ type: "p", align, children: [{ text: "Hello" }] }]);

    const html = await serializeHtml(editor);

    expect(html).toMatch(new RegExp(`text-align:\\s*${align}`));
  });

  test("a paragraph without align does not render text-align", async () => {
    const editor = createEditor([paragraph("Hello")]);

    const html = await serializeHtml(editor);

    expect(html).not.toMatch(/text-align/);
  });

  test("pasting text-align center stores align on the paragraph", () => {
    const editor = pasteHtml('<p style="text-align:center">a</p>');

    expect(plainText(editor)).toBe("a");
    expect(alignAt(editor, 0)).toBe("center");
  });

  test("pasting the legacy align attribute does not store align", () => {
    const editor = pasteHtml('<p align="right">a</p>');

    expect(plainText(editor)).toBe("a");
    expect(alignAt(editor, 0)).toBeUndefined();
  });

  test.each(["start", "-webkit-center"])(
    "pasting text-align %s drops the value and keeps the text",
    (align) => {
      const editor = pasteHtml(`<p style="text-align:${align}">b</p>`);

      expect(plainText(editor)).toBe("b");
      expect(alignAt(editor, 0)).toBeUndefined();
    },
  );

  test("pasting an editor fragment keeps align", () => {
    const editor = createEditor();
    editor.tf.select(caret([0, 0], 0));
    editor.tf.insertFragment([
      { type: "p", align: "justify", children: [{ text: "x", bold: true }] },
    ]);

    expect(plainText(editor)).toBe("x");
    expect(alignAt(editor, 0)).toBe("justify");
    expect(field(editor.children[0]?.children[0], "bold")).toBe(true);
  });

  test("Enter at the end of a centered paragraph copies align and assigns a new id", () => {
    const editor = createEditor([
      {
        type: "p",
        id: "block-a",
        align: "center",
        children: [{ text: "Hello", bold: true }],
      },
    ]);
    editor.tf.select(caret([0, 0], 5));

    editor.tf.insertBreak();
    const ids = blockIds(editor);

    expect(texts(editor)).toEqual(["Hello", ""]);
    expect(ids[0]).toBe("block-a");
    expect(ids[1]).not.toBe("block-a");
    expect(ids[1]).not.toBe("");
    expect(alignAt(editor, 0)).toBe("center");
    expect(alignAt(editor, 1)).toBe("center");
    expect(field(editor.children[0]?.children[0], "bold")).toBe(true);
  });
});
