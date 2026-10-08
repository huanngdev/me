import { describe, expect, test } from "bun:test";
import { KEYS, type SlateEditor } from "platejs";
import { serializeHtml } from "platejs/static";

import { getFontSize, runEditorCommand, setFontSize } from "./editor-commands";
import { createEditorDocument, serializeEditorDocument } from "./editor-document";
import {
  FONT_SIZES,
  PALETTE_TOKENS,
  allowedMarkValues,
  isAllowedMark,
  isAllowedMarkValue,
  isAllowedValue,
  isPaletteToken,
} from "./editor-document-schema";
import { parseEditorDocument } from "./editor-document-validate";
import {
  caret,
  createEditor,
  deserializeHtmlInDom,
  expectOk,
  expectUnsupported,
  field,
  isRecord,
  plainText,
  textRange,
} from "./test-utils";

function paragraph(text: string) {
  return { type: "p" as const, children: [{ text }] };
}

function pasteHtml(html: string): SlateEditor {
  const editor = createEditor();
  editor.tf.select(caret([0, 0], 0));
  editor.tf.insertFragment(deserializeHtmlInDom(editor, html));
  return editor;
}

function fontSizeValues(editor: SlateEditor): unknown[] {
  const found: unknown[] = [];

  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const child of node) {
        visit(child);
      }
      return;
    }

    if (!isRecord(node)) {
      return;
    }

    if (typeof node.text === "string" && !("children" in node)) {
      if ("fontSize" in node) {
        found.push(node.fontSize);
      }
      return;
    }

    if ("children" in node) {
      visit(node.children);
    }
  };

  visit(editor.children);
  return found;
}

describe("font size", () => {
  test("setFontSize stores a preset, replaces it, and reset removes the key", () => {
    const editor = createEditor([paragraph("Hello world")]);
    editor.tf.select(textRange([0, 0], 6, 11));

    expect(runEditorCommand(editor, setFontSize, "14px")).toBe(true);
    expect(editor.children[0]?.children).toEqual([
      { text: "Hello " },
      { text: "world", fontSize: "14px" },
    ]);

    editor.tf.select(textRange([0, 1], 0, 5));
    runEditorCommand(editor, setFontSize, "24px");

    expect(editor.children[0]?.children).toEqual([
      { text: "Hello " },
      { text: "world", fontSize: "24px" },
    ]);

    runEditorCommand(editor, setFontSize, null);

    expect(editor.children[0]?.children).toEqual([{ text: "Hello world" }]);
    expect(field(editor.children[0]?.children[0], "fontSize")).toBeUndefined();
  });

  test("a font size at the caret applies to the next typed text", () => {
    const editor = createEditor([paragraph("Hello")]);
    editor.tf.select(caret([0, 0], 5));

    runEditorCommand(editor, setFontSize, "18px");

    expect(getFontSize(editor)).toBe("18px");

    editor.tf.insertText("!");

    expect(editor.children[0]?.children).toEqual([
      { text: "Hello" },
      { text: "!", fontSize: "18px" },
    ]);
  });

  test("a font size applies across two paragraphs and leaves the rest unchanged", () => {
    const editor = createEditor([paragraph("Hello world"), paragraph("Second line")]);
    editor.tf.select({
      anchor: { path: [0, 0], offset: 6 },
      focus: { path: [1, 0], offset: 6 },
    });

    runEditorCommand(editor, setFontSize, "32px");

    expect(editor.children[0]?.children).toEqual([
      { text: "Hello " },
      { text: "world", fontSize: "32px" },
    ]);
    expect(editor.children[1]?.children).toEqual([
      { text: "Second", fontSize: "32px" },
      { text: " line" },
    ]);
  });

  test("getFontSize returns a value, null, or mixed", () => {
    const editor = createEditor([
      {
        type: "p",
        children: [
          { text: "small", fontSize: "14px" },
          { text: " and " },
          { text: "large", fontSize: "24px" },
        ],
      },
    ]);

    editor.tf.select(textRange([0, 0], 0, 5));
    expect(getFontSize(editor)).toBe("14px");

    editor.tf.select(textRange([0, 1], 0, 5));
    expect(getFontSize(editor)).toBe(null);

    editor.tf.select({
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [0, 2], offset: 5 },
    });
    expect(getFontSize(editor)).toBe("mixed");

    editor.tf.select({
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [0, 1], offset: 5 },
    });
    expect(getFontSize(editor)).toBe("mixed");

    editor.tf.select(caret([0, 0], 1));
    expect(getFontSize(editor)).toBe("14px");

    editor.tf.select(caret([0, 1], 1));
    expect(getFontSize(editor)).toBe(null);
  });

  test("a font size keeps bold, code, color, and highlight, and clearing size keeps them", () => {
    const marks = {
      text: "Hello",
      bold: true,
      code: true,
      color: "red",
      backgroundColor: "yellow",
    };
    const editor = createEditor([{ type: "p", children: [marks] }]);
    editor.tf.select(textRange([0, 0], 0, 5));

    runEditorCommand(editor, setFontSize, "18px");

    expect(editor.children[0]?.children[0]).toEqual({ ...marks, fontSize: "18px" });

    runEditorCommand(editor, setFontSize, null);

    const leaf = editor.children[0]?.children[0];
    expect(leaf).toEqual(marks);
    expect(field(leaf, "fontSize")).toBeUndefined();
  });

  test("setting a font size is one undo step, and redo restores it", () => {
    const editor = createEditor([paragraph("Hello")]);
    editor.tf.select(caret([0, 0], 5));
    editor.tf.insertText("!");
    editor.tf.select(textRange([0, 0], 0, 5));
    const undos = editor.history.undos.length;

    runEditorCommand(editor, setFontSize, "12px");

    expect(editor.history.undos.length - undos).toBe(1);
    expect(editor.children[0]?.children).toEqual([
      { text: "Hello", fontSize: "12px" },
      { text: "!" },
    ]);

    editor.tf.undo();

    expect(editor.children[0]?.children).toEqual([{ text: "Hello!" }]);

    editor.tf.redo();

    expect(editor.children[0]?.children).toEqual([
      { text: "Hello", fontSize: "12px" },
      { text: "!" },
    ]);
  });

  test("a read-only editor refuses the font size command", () => {
    const editor = createEditor([paragraph("Hello")]);
    editor.tf.select(textRange([0, 0], 0, 5));
    const undos = editor.history.undos.length;

    const applied = runEditorCommand(editor, setFontSize, "24px", { readOnly: true });

    expect(applied).toBe(false);
    expect(editor.children[0]?.children).toEqual([{ text: "Hello" }]);
    expect(editor.history.undos.length).toBe(undos);
  });

  test("setFontSize is a format command and has no shortcut", () => {
    const editor = createEditor();

    expect(KEYS.fontSize).toBe("fontSize");
    expect(setFontSize.id).toBe("format.font-size");
    expect(setFontSize.group).toBe("format");
    expect(setFontSize.label).toBe("Font size");
    expect(editor.meta.shortcuts["fontSize.toggle"]).toBeUndefined();
  });

  test("a preset font size renders as the stored CSS length", async () => {
    const editor = createEditor([{ type: "p", children: [{ text: "note", fontSize: "24px" }] }]);

    const html = await serializeHtml(editor);

    expect(html).toMatch(/font-size:\s*24px/);
  });

  test.each([...FONT_SIZES])("%s round-trips through serialize and parse", (size) => {
    const document = createEditorDocument("doc-font-size", [
      { type: "p", id: "p", children: [{ text: "Hi", fontSize: size }] },
    ]);
    const serialized: unknown = JSON.parse(serializeEditorDocument(document));
    const parsed = expectOk(parseEditorDocument(serialized));

    expect(parsed.repairs).toEqual([]);
    expect(parsed.document.content).toEqual(document.content);
  });

  test.each(["15px", "1rem"])(
    "%s outside the presets is unsupported and the raw input is kept",
    (size) => {
      const raw = createEditorDocument("doc-font-size", [
        { type: "p", id: "p", children: [{ text: "Hi", fontSize: size }] },
      ]);

      const result = expectUnsupported(parseEditorDocument(raw));

      expect(result.raw).toBe(raw);
      expect(result.issues[0]?.path).toEqual([0, 0]);
      expect(result.issues[0]?.message).toContain(`unsupported fontSize "${size}"`);
      expect(field(raw.content[0]?.children[0], "fontSize")).toBe(size);
    },
  );

  test("the font size allowlist accepts presets and rejects other values", () => {
    expect(isAllowedMark(KEYS.fontSize)).toBe(true);
    expect(allowedMarkValues(KEYS.fontSize)).toEqual([...FONT_SIZES]);
    expect(isAllowedMarkValue(KEYS.fontSize, "16px")).toBe(true);
    expect(isAllowedMarkValue(KEYS.fontSize, "15px")).toBe(false);
    expect(isAllowedMarkValue(KEYS.fontSize, null)).toBe(false);
  });

  test("isAllowedValue checks the given list and isPaletteToken only accepts palette tokens", () => {
    expect(isAllowedValue("16px", FONT_SIZES)).toBe(true);
    expect(isAllowedValue("15px", FONT_SIZES)).toBe(false);
    expect(isAllowedValue("1rem", FONT_SIZES)).toBe(false);
    expect(isAllowedValue(16, FONT_SIZES)).toBe(false);
    expect(isAllowedValue("red", PALETTE_TOKENS)).toBe(true);
    expect(isAllowedValue("16px", PALETTE_TOKENS)).toBe(false);
    expect(isPaletteToken("red")).toBe(true);
    expect(isPaletteToken("16px")).toBe(false);
    expect(isPaletteToken("15px")).toBe(false);
  });

  test.each([
    ["12pt", "16px"],
    ["9pt", "12px"],
    ["10.5pt", "14px"],
    ["13.5pt", "18px"],
    ["18pt", "24px"],
    ["24pt", "32px"],
  ])("pasting %s stores %s", (input, expected) => {
    const editor = pasteHtml(`<p><span style="font-size:${input}">a</span></p>`);

    expect(plainText(editor)).toBe("a");
    expect(fontSizeValues(editor)).toEqual([expected]);
  });

  test.each(["11pt", "15px", "1.5rem", "large"])(
    "pasting %s drops the size and keeps the text",
    (input) => {
      const editor = pasteHtml(`<p><span style="font-size:${input}">b</span></p>`);

      expect(plainText(editor)).toBe("b");
      expect(fontSizeValues(editor)).toEqual([]);
    },
  );

  test("pasting a 16px span keeps the preset", () => {
    const editor = pasteHtml('<p><span style="font-size:16px">a</span></p>');

    expect(plainText(editor)).toBe("a");
    expect(fontSizeValues(editor)).toEqual(["16px"]);
  });

  test("pasting 12pt next to 11pt keeps only the converted preset", () => {
    const editor = pasteHtml(
      '<p><span style="font-size:12pt">a</span> <span style="font-size:11pt">b</span></p>',
    );

    expect(plainText(editor)).toBe("a b");
    expect(fontSizeValues(editor)).toEqual(["16px"]);
    const leaves = editor.children[0]?.children ?? [];
    const sized = leaves.find((leaf) => {
      const text = field(leaf, "text");
      return typeof text === "string" && text.includes("a");
    });
    const plain = leaves.find((leaf) => {
      const text = field(leaf, "text");
      return typeof text === "string" && text.includes("b");
    });
    expect(field(sized, "fontSize")).toBe("16px");
    expect(field(plain, "fontSize")).toBeUndefined();
  });

  test("pasting an editor fragment keeps a preset font size", () => {
    const editor = createEditor();
    editor.tf.select(caret([0, 0], 0));
    editor.tf.insertFragment([{ type: "p", children: [{ text: "x", fontSize: "32px" }] }]);

    expect(plainText(editor)).toBe("x");
    expect(fontSizeValues(editor)).toEqual(["32px"]);
  });
});
