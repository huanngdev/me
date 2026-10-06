import { describe, expect, test } from "bun:test";
import { KEYS, type SlateEditor } from "platejs";
import { serializeHtml } from "platejs/static";

import { getTextColor, runEditorCommand, setTextColor } from "./editor-commands";
import { createEditorDocument, serializeEditorDocument } from "./editor-document";
import {
  allowedMarkValues,
  isAllowedMark,
  isAllowedMarkValue,
  isPaletteToken,
  TEXT_COLOR_TOKENS,
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

function colorValues(editor: SlateEditor): unknown[] {
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
      if ("color" in node) {
        found.push(node.color);
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

describe("text color", () => {
  test("setTextColor stores a palette token, replaces it, and reset removes the key", () => {
    const editor = createEditor([paragraph("Hello world")]);
    editor.tf.select(textRange([0, 0], 6, 11));

    expect(runEditorCommand(editor, setTextColor, "red")).toBe(true);
    expect(editor.children[0]?.children).toEqual([
      { text: "Hello " },
      { text: "world", color: "red" },
    ]);

    editor.tf.select(textRange([0, 1], 0, 5));
    runEditorCommand(editor, setTextColor, "blue");

    expect(editor.children[0]?.children).toEqual([
      { text: "Hello " },
      { text: "world", color: "blue" },
    ]);

    runEditorCommand(editor, setTextColor, null);

    expect(editor.children[0]?.children).toEqual([{ text: "Hello world" }]);
    expect(field(editor.children[0]?.children[0], "color")).toBeUndefined();
  });

  test("a text color at the caret applies to the next typed text", () => {
    const editor = createEditor([paragraph("Hello")]);
    editor.tf.select(caret([0, 0], 5));

    runEditorCommand(editor, setTextColor, "green");

    expect(getTextColor(editor)).toBe("green");

    editor.tf.insertText("!");

    expect(editor.children[0]?.children).toEqual([
      { text: "Hello" },
      { text: "!", color: "green" },
    ]);
  });

  test("a text color applies across two paragraphs and leaves the rest unchanged", () => {
    const editor = createEditor([paragraph("Hello world"), paragraph("Second line")]);
    editor.tf.select({
      anchor: { path: [0, 0], offset: 6 },
      focus: { path: [1, 0], offset: 6 },
    });

    runEditorCommand(editor, setTextColor, "green");

    expect(editor.children[0]?.children).toEqual([
      { text: "Hello " },
      { text: "world", color: "green" },
    ]);
    expect(editor.children[1]?.children).toEqual([
      { text: "Second", color: "green" },
      { text: " line" },
    ]);
  });

  test("getTextColor returns a token, null, or mixed", () => {
    const editor = createEditor([
      {
        type: "p",
        children: [
          { text: "red", color: "red" },
          { text: " and " },
          { text: "blue", color: "blue" },
        ],
      },
    ]);

    editor.tf.select(textRange([0, 0], 0, 3));
    expect(getTextColor(editor)).toBe("red");

    editor.tf.select(textRange([0, 1], 0, 5));
    expect(getTextColor(editor)).toBe(null);

    editor.tf.select({
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [0, 2], offset: 4 },
    });
    expect(getTextColor(editor)).toBe("mixed");

    editor.tf.select({
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [0, 1], offset: 5 },
    });
    expect(getTextColor(editor)).toBe("mixed");

    editor.tf.select(caret([0, 0], 1));
    expect(getTextColor(editor)).toBe("red");

    editor.tf.select(caret([0, 1], 1));
    expect(getTextColor(editor)).toBe(null);
  });

  test("a text color keeps bold and the other marks, and resetting color keeps them", () => {
    const marks = {
      text: "Hello",
      bold: true,
      italic: true,
      underline: true,
      strikethrough: true,
      code: true,
      superscript: true,
      subscript: true,
    };
    const editor = createEditor([{ type: "p", children: [marks] }]);
    editor.tf.select(textRange([0, 0], 0, 5));

    runEditorCommand(editor, setTextColor, "purple");

    expect(editor.children[0]?.children[0]).toEqual({ ...marks, color: "purple" });

    runEditorCommand(editor, setTextColor, null);

    const leaf = editor.children[0]?.children[0];
    expect(leaf).toEqual(marks);
    expect(field(leaf, "color")).toBeUndefined();
  });

  test("setting a text color is one undo step, and redo restores it", () => {
    const editor = createEditor([paragraph("Hello")]);
    editor.tf.select(caret([0, 0], 5));
    editor.tf.insertText("!");
    editor.tf.select(textRange([0, 0], 0, 5));
    const undos = editor.history.undos.length;

    runEditorCommand(editor, setTextColor, "pink");

    expect(editor.history.undos.length - undos).toBe(1);
    expect(editor.children[0]?.children).toEqual([{ text: "Hello", color: "pink" }, { text: "!" }]);

    editor.tf.undo();

    expect(editor.children[0]?.children).toEqual([{ text: "Hello!" }]);

    editor.tf.redo();

    expect(editor.children[0]?.children).toEqual([{ text: "Hello", color: "pink" }, { text: "!" }]);
  });

  test("a read-only editor refuses the text color command", () => {
    const editor = createEditor([paragraph("Hello")]);
    editor.tf.select(textRange([0, 0], 0, 5));
    const undos = editor.history.undos.length;

    const applied = runEditorCommand(editor, setTextColor, "red", { readOnly: true });

    expect(applied).toBe(false);
    expect(editor.children[0]?.children).toEqual([{ text: "Hello" }]);
    expect(editor.history.undos.length).toBe(undos);
  });

  test("setTextColor is a format command and has no shortcut", () => {
    const editor = createEditor();

    expect(KEYS.color).toBe("color");
    expect(setTextColor.id).toBe("format.text-color");
    expect(setTextColor.group).toBe("format");
    expect(editor.meta.shortcuts["color.toggle"]).toBeUndefined();
  });

  test("a palette color renders with the theme variable", async () => {
    const editor = createEditor([{ type: "p", children: [{ text: "red", color: "red" }] }]);

    const html = await serializeHtml(editor);

    expect(html).toContain("var(--editor-text-red)");
    expect(html).not.toContain("color:red");
    expect(html).not.toContain("color: red");
  });

  test.each([...TEXT_COLOR_TOKENS])("%s round-trips through serialize and parse", (token) => {
    const document = createEditorDocument("doc-color", [
      { type: "p", id: "p", children: [{ text: "Hi", color: token }] },
    ]);
    const serialized: unknown = JSON.parse(serializeEditorDocument(document));
    const parsed = expectOk(parseEditorDocument(serialized));

    expect(parsed.repairs).toEqual([]);
    expect(parsed.document.content).toEqual(document.content);
    expect(isPaletteToken(token)).toBe(true);
  });

  test("a color outside the palette is unsupported and the raw input is kept", () => {
    const raw = createEditorDocument("doc-lime", [
      { type: "p", id: "p", children: [{ text: "Hi", color: "lime" }] },
    ]);

    const result = expectUnsupported(parseEditorDocument(raw));

    expect(result.raw).toBe(raw);
    expect(result.issues[0]?.path).toEqual([0, 0]);
    expect(result.issues[0]?.message).toContain("lime");
    expect(field(raw.content[0]?.children[0], "color")).toBe("lime");
  });

  test("the color allowlist accepts palette tokens and rejects other values", () => {
    expect(isAllowedMark(KEYS.color)).toBe(true);
    expect(allowedMarkValues(KEYS.color)).toEqual([...TEXT_COLOR_TOKENS]);
    expect(isAllowedMarkValue(KEYS.color, "blue")).toBe(true);
    expect(isAllowedMarkValue(KEYS.color, "lime")).toBe(false);
    expect(isAllowedMarkValue(KEYS.color, null)).toBe(false);
    expect(isPaletteToken("red")).toBe(true);
    expect(isPaletteToken("#ff0000")).toBe(false);
  });

  test("pasting a hex color drops the color and keeps the text", () => {
    const editor = pasteHtml('<p><span style="color:#ff0000">x</span></p>');

    expect(plainText(editor)).toBe("x");
    expect(colorValues(editor)).toEqual([]);
  });

  test("pasting an rgb color drops the color and keeps the text", () => {
    const editor = pasteHtml('<p><span style="color:rgb(255, 0, 0)">x</span></p>');

    expect(plainText(editor)).toBe("x");
    expect(colorValues(editor)).toEqual([]);
  });

  test("pasting a named CSS color drops the color and keeps the text", () => {
    const editor = pasteHtml('<p><span style="color:crimson">x</span></p>');

    expect(plainText(editor)).toBe("x");
    expect(colorValues(editor)).toEqual([]);
  });

  test("pasting an invalid CSS color drops the color and keeps the text", () => {
    const editor = pasteHtml('<p><span style="color:not-a-color">x</span></p>');

    expect(plainText(editor)).toBe("x");
    expect(colorValues(editor)).toEqual([]);
  });

  test("pasting a CSS variable drops the color and keeps the text", () => {
    const editor = pasteHtml('<p><span style="color:var(--x)">x</span></p>');

    expect(plainText(editor)).toBe("x");
    expect(colorValues(editor)).toEqual([]);
  });

  test("pasting an editor fragment keeps a palette color", () => {
    const editor = createEditor();
    editor.tf.select(caret([0, 0], 0));
    editor.tf.insertFragment([{ type: "p", children: [{ text: "x", color: "blue" }] }]);

    expect(plainText(editor)).toBe("x");
    expect(colorValues(editor)).toEqual(["blue"]);
  });
});
