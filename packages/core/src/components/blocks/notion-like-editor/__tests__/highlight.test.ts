import { describe, expect, test } from "bun:test";
import { KEYS, type SlateEditor } from "platejs";
import { serializeHtml } from "platejs/static";

import {
  getHighlight,
  getTextColor,
  runEditorCommand,
  setHighlight,
  setTextColor,
} from "../lib/commands/editor-commands";
import { createEditorDocument, serializeEditorDocument } from "../lib/document/editor-document";
import {
  HIGHLIGHT_TOKENS,
  allowedMarkValues,
  isAllowedMark,
  isAllowedMarkValue,
  isPaletteToken,
} from "../lib/document/editor-document-schema";
import { parseEditorDocument } from "../lib/document/editor-document-validate";
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

function highlightValues(editor: SlateEditor): unknown[] {
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
      if ("backgroundColor" in node) {
        found.push(node.backgroundColor);
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

describe("highlight", () => {
  test("setHighlight stores a palette token, replaces it, and reset removes the key", () => {
    const editor = createEditor([paragraph("Hello world")]);
    editor.tf.select(textRange([0, 0], 6, 11));

    expect(runEditorCommand(editor, setHighlight, "yellow")).toBe(true);
    expect(editor.children[0]?.children).toEqual([
      { text: "Hello " },
      { text: "world", backgroundColor: "yellow" },
    ]);

    editor.tf.select(textRange([0, 1], 0, 5));
    runEditorCommand(editor, setHighlight, "blue");

    expect(editor.children[0]?.children).toEqual([
      { text: "Hello " },
      { text: "world", backgroundColor: "blue" },
    ]);

    runEditorCommand(editor, setHighlight, null);

    expect(editor.children[0]?.children).toEqual([{ text: "Hello world" }]);
    expect(field(editor.children[0]?.children[0], "backgroundColor")).toBeUndefined();
  });

  test("a highlight at the caret applies to the next typed text", () => {
    const editor = createEditor([paragraph("Hello")]);
    editor.tf.select(caret([0, 0], 5));

    runEditorCommand(editor, setHighlight, "green");

    expect(getHighlight(editor)).toBe("green");

    editor.tf.insertText("!");

    expect(editor.children[0]?.children).toEqual([
      { text: "Hello" },
      { text: "!", backgroundColor: "green" },
    ]);
  });

  test("a highlight applies across two paragraphs and leaves the rest unchanged", () => {
    const editor = createEditor([paragraph("Hello world"), paragraph("Second line")]);
    editor.tf.select({
      anchor: { path: [0, 0], offset: 6 },
      focus: { path: [1, 0], offset: 6 },
    });

    runEditorCommand(editor, setHighlight, "green");

    expect(editor.children[0]?.children).toEqual([
      { text: "Hello " },
      { text: "world", backgroundColor: "green" },
    ]);
    expect(editor.children[1]?.children).toEqual([
      { text: "Second", backgroundColor: "green" },
      { text: " line" },
    ]);
  });

  test("a highlight applies across a hard break and the next paragraph", () => {
    const editor = createEditor([
      { type: "p", children: [{ text: "Hello\nworld" }] },
      paragraph("Second line"),
    ]);
    editor.tf.select({
      anchor: { path: [0, 0], offset: 4 },
      focus: { path: [1, 0], offset: 6 },
    });

    runEditorCommand(editor, setHighlight, "orange");

    expect(editor.children[0]?.children).toEqual([
      { text: "Hell" },
      { text: "o\nworld", backgroundColor: "orange" },
    ]);
    expect(editor.children[1]?.children).toEqual([
      { text: "Second", backgroundColor: "orange" },
      { text: " line" },
    ]);
  });

  test("getHighlight returns a token, null, or mixed", () => {
    const editor = createEditor([
      {
        type: "p",
        children: [
          { text: "red", backgroundColor: "red" },
          { text: " and " },
          { text: "blue", backgroundColor: "blue" },
        ],
      },
    ]);

    editor.tf.select(textRange([0, 0], 0, 3));
    expect(getHighlight(editor)).toBe("red");

    editor.tf.select(textRange([0, 1], 0, 5));
    expect(getHighlight(editor)).toBe(null);

    editor.tf.select({
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [0, 2], offset: 4 },
    });
    expect(getHighlight(editor)).toBe("mixed");

    editor.tf.select({
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [0, 1], offset: 5 },
    });
    expect(getHighlight(editor)).toBe("mixed");

    editor.tf.select(caret([0, 0], 1));
    expect(getHighlight(editor)).toBe("red");

    editor.tf.select(caret([0, 1], 1));
    expect(getHighlight(editor)).toBe(null);
  });

  test("a highlight keeps bold and the other marks, and resetting highlight keeps them", () => {
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

    runEditorCommand(editor, setHighlight, "purple");

    expect(editor.children[0]?.children[0]).toEqual({ ...marks, backgroundColor: "purple" });

    runEditorCommand(editor, setHighlight, null);

    const leaf = editor.children[0]?.children[0];
    expect(leaf).toEqual(marks);
    expect(field(leaf, "backgroundColor")).toBeUndefined();
  });

  test("setting a highlight keeps the text color, and clearing the highlight keeps it", () => {
    const editor = createEditor([{ type: "p", children: [{ text: "Hello", color: "red" }] }]);
    editor.tf.select(textRange([0, 0], 0, 5));

    runEditorCommand(editor, setHighlight, "yellow");

    expect(editor.children[0]?.children[0]).toEqual({
      text: "Hello",
      color: "red",
      backgroundColor: "yellow",
    });
    expect(getTextColor(editor)).toBe("red");
    expect(getHighlight(editor)).toBe("yellow");

    runEditorCommand(editor, setHighlight, null);

    expect(editor.children[0]?.children[0]).toEqual({ text: "Hello", color: "red" });
    expect(getTextColor(editor)).toBe("red");
    expect(getHighlight(editor)).toBe(null);
  });

  test("setting a text color keeps the highlight, and clearing the color keeps it", () => {
    const editor = createEditor([
      { type: "p", children: [{ text: "Hello", backgroundColor: "green" }] },
    ]);
    editor.tf.select(textRange([0, 0], 0, 5));

    runEditorCommand(editor, setTextColor, "blue");

    expect(editor.children[0]?.children[0]).toEqual({
      text: "Hello",
      backgroundColor: "green",
      color: "blue",
    });
    expect(getHighlight(editor)).toBe("green");

    runEditorCommand(editor, setTextColor, null);

    expect(editor.children[0]?.children[0]).toEqual({ text: "Hello", backgroundColor: "green" });
    expect(getHighlight(editor)).toBe("green");
    expect(getTextColor(editor)).toBe(null);
  });

  test("setting a highlight is one undo step, and redo restores it", () => {
    const editor = createEditor([paragraph("Hello")]);
    editor.tf.select(caret([0, 0], 5));
    editor.tf.insertText("!");
    editor.tf.select(textRange([0, 0], 0, 5));
    const undos = editor.history.undos.length;

    runEditorCommand(editor, setHighlight, "pink");

    expect(editor.history.undos.length - undos).toBe(1);
    expect(editor.children[0]?.children).toEqual([
      { text: "Hello", backgroundColor: "pink" },
      { text: "!" },
    ]);

    editor.tf.undo();

    expect(editor.children[0]?.children).toEqual([{ text: "Hello!" }]);

    editor.tf.redo();

    expect(editor.children[0]?.children).toEqual([
      { text: "Hello", backgroundColor: "pink" },
      { text: "!" },
    ]);
  });

  test("a read-only editor refuses the highlight command", () => {
    const editor = createEditor([paragraph("Hello")]);
    editor.tf.select(textRange([0, 0], 0, 5));
    const undos = editor.history.undos.length;

    const applied = runEditorCommand(editor, setHighlight, "red", { readOnly: true });

    expect(applied).toBe(false);
    expect(editor.children[0]?.children).toEqual([{ text: "Hello" }]);
    expect(editor.history.undos.length).toBe(undos);
  });

  test("setHighlight is a format command and has no shortcut", () => {
    const editor = createEditor();

    expect(KEYS.backgroundColor).toBe("backgroundColor");
    expect(setHighlight.id).toBe("format.highlight");
    expect(setHighlight.group).toBe("format");
    expect(setHighlight.label).toBe("Highlight");
    expect(editor.meta.shortcuts["backgroundColor.toggle"]).toBeUndefined();
    expect(editor.meta.shortcuts["highlight.toggle"]).toBeUndefined();
  });

  test("a palette highlight renders with the theme variable", async () => {
    const editor = createEditor([
      { type: "p", children: [{ text: "note", backgroundColor: "yellow" }] },
    ]);

    const html = await serializeHtml(editor);

    expect(html).toContain("var(--editor-bg-yellow)");
    expect(html).not.toContain("background-color:yellow");
    expect(html).not.toContain("background-color: yellow");
  });

  test.each([...HIGHLIGHT_TOKENS])("%s round-trips through serialize and parse", (token) => {
    const document = createEditorDocument("doc-highlight", [
      { type: "p", id: "p", children: [{ text: "Hi", backgroundColor: token }] },
    ]);
    const serialized: unknown = JSON.parse(serializeEditorDocument(document));
    const parsed = expectOk(parseEditorDocument(serialized));

    expect(parsed.repairs).toEqual([]);
    expect(parsed.document.content).toEqual(document.content);
    expect(isPaletteToken(token)).toBe(true);
  });

  test("a highlight outside the palette is unsupported and the raw input is kept", () => {
    const raw = createEditorDocument("doc-lime", [
      { type: "p", id: "p", children: [{ text: "Hi", backgroundColor: "lime" }] },
    ]);

    const result = expectUnsupported(parseEditorDocument(raw));

    expect(result.raw).toBe(raw);
    expect(result.issues[0]?.path).toEqual([0, 0]);
    expect(result.issues[0]?.message).toContain("lime");
    expect(field(raw.content[0]?.children[0], "backgroundColor")).toBe("lime");
  });

  test("the highlight allowlist accepts palette tokens and rejects other values", () => {
    expect(isAllowedMark(KEYS.backgroundColor)).toBe(true);
    expect(allowedMarkValues(KEYS.backgroundColor)).toEqual([...HIGHLIGHT_TOKENS]);
    expect(isAllowedMarkValue(KEYS.backgroundColor, "blue")).toBe(true);
    expect(isAllowedMarkValue(KEYS.backgroundColor, "lime")).toBe(false);
    expect(isAllowedMarkValue(KEYS.backgroundColor, null)).toBe(false);
    expect(isPaletteToken("yellow")).toBe(true);
    expect(isPaletteToken("#fff2cc")).toBe(false);
  });

  test("pasting a mark element stores the yellow token", () => {
    const editor = pasteHtml("<p><mark>m</mark></p>");

    expect(plainText(editor)).toBe("m");
    expect(highlightValues(editor)).toEqual(["yellow"]);
  });

  test("pasting a Google Docs background color drops the color and keeps the text", () => {
    const editor = pasteHtml('<p><span style="background-color:#fff2cc">g</span></p>');

    expect(plainText(editor)).toBe("g");
    expect(highlightValues(editor)).toEqual([]);
  });

  test("pasting an arbitrary background color drops the color and keeps the text", () => {
    const editor = pasteHtml('<p><span style="background-color:rgb(255, 242, 204)">g</span></p>');

    expect(plainText(editor)).toBe("g");
    expect(highlightValues(editor)).toEqual([]);
  });

  test("pasting an editor fragment keeps a palette highlight", () => {
    const editor = createEditor();
    editor.tf.select(caret([0, 0], 0));
    editor.tf.insertFragment([{ type: "p", children: [{ text: "x", backgroundColor: "blue" }] }]);

    expect(plainText(editor)).toBe("x");
    expect(highlightValues(editor)).toEqual(["blue"]);
  });
});
