import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { KEYS, type SlateEditor } from "platejs";
import { serializeHtml } from "platejs/static";

import { getFontFamily, runEditorCommand, setFontFamily } from "./editor-commands";
import { createEditorDocument, serializeEditorDocument } from "./editor-document";
import {
  FONT_FAMILIES,
  allowedMarkValues,
  isAllowedMark,
  isAllowedMarkValue,
  isAllowedValue,
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

const MONO_STACK = "var(--font-mono), ui-monospace, SFMono-Regular, Menlo, monospace";
const SANS_STACK = "var(--font-sans), ui-sans-serif, system-ui, sans-serif";
const SERIF_STACK = 'ui-serif, Georgia, Cambria, "Times New Roman", serif';

function paragraph(text: string) {
  return { type: "p" as const, children: [{ text }] };
}

function pasteHtml(html: string): SlateEditor {
  const editor = createEditor();
  editor.tf.select(caret([0, 0], 0));
  editor.tf.insertFragment(deserializeHtmlInDom(editor, html));
  return editor;
}

function fontFamilyValues(editor: SlateEditor): unknown[] {
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
      if ("fontFamily" in node) {
        found.push(node.fontFamily);
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

function codeMarks(editor: SlateEditor): boolean[] {
  const found: boolean[] = [];

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
      found.push(node.code === true);
      return;
    }

    if ("children" in node) {
      visit(node.children);
    }
  };

  visit(editor.children);
  return found;
}

function computedFamily(html: string, sample: string): string {
  const style = document.createElement("style");
  const host = document.createElement("div");
  style.textContent = `:root { --font-mono: "JetBrains Mono"; --font-sans: Inter; ${[
    `--editor-font-sans: ${SANS_STACK}`,
    `--editor-font-mono: ${MONO_STACK}`,
    `--editor-font-serif: ${SERIF_STACK}`,
  ].join("; ")}; }`;
  host.innerHTML = html;
  document.body.append(style, host);

  try {
    const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      const parent = node.parentElement;
      if (node.textContent === sample && parent && parent.tagName !== "STYLE") {
        return getComputedStyle(parent).fontFamily;
      }
      node = walker.nextNode();
    }

    throw new Error("The rendered HTML has no matching text.");
  } finally {
    style.remove();
    host.remove();
  }
}

describe("font family", () => {
  test("setFontFamily stores a token, replaces it, and reset removes the key", () => {
    const editor = createEditor([paragraph("Hello world")]);
    editor.tf.select(textRange([0, 0], 6, 11));

    expect(runEditorCommand(editor, setFontFamily, "mono")).toBe(true);
    expect(editor.children[0]?.children).toEqual([
      { text: "Hello " },
      { text: "world", fontFamily: "mono" },
    ]);

    editor.tf.select(textRange([0, 1], 0, 5));
    runEditorCommand(editor, setFontFamily, "serif");

    expect(editor.children[0]?.children).toEqual([
      { text: "Hello " },
      { text: "world", fontFamily: "serif" },
    ]);

    runEditorCommand(editor, setFontFamily, null);

    expect(editor.children[0]?.children).toEqual([{ text: "Hello world" }]);
    expect(field(editor.children[0]?.children[0], "fontFamily")).toBeUndefined();
  });

  test("a font family at the caret applies to the next typed text", () => {
    const editor = createEditor([paragraph("Hello")]);
    editor.tf.select(caret([0, 0], 5));

    runEditorCommand(editor, setFontFamily, "sans");

    expect(getFontFamily(editor)).toBe("sans");

    editor.tf.insertText("!");

    expect(editor.children[0]?.children).toEqual([
      { text: "Hello" },
      { text: "!", fontFamily: "sans" },
    ]);
  });

  test("a font family applies across two paragraphs and leaves the rest unchanged", () => {
    const editor = createEditor([paragraph("Hello world"), paragraph("Second line")]);
    editor.tf.select({
      anchor: { path: [0, 0], offset: 6 },
      focus: { path: [1, 0], offset: 6 },
    });

    runEditorCommand(editor, setFontFamily, "mono");

    expect(editor.children[0]?.children).toEqual([
      { text: "Hello " },
      { text: "world", fontFamily: "mono" },
    ]);
    expect(editor.children[1]?.children).toEqual([
      { text: "Second", fontFamily: "mono" },
      { text: " line" },
    ]);
  });

  test("getFontFamily returns a value, null, or mixed", () => {
    const editor = createEditor([
      {
        type: "p",
        children: [
          { text: "sans", fontFamily: "sans" },
          { text: " and " },
          { text: "mono", fontFamily: "mono" },
        ],
      },
    ]);

    editor.tf.select(textRange([0, 0], 0, 4));
    expect(getFontFamily(editor)).toBe("sans");

    editor.tf.select(textRange([0, 1], 0, 5));
    expect(getFontFamily(editor)).toBe(null);

    editor.tf.select({
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [0, 2], offset: 4 },
    });
    expect(getFontFamily(editor)).toBe("mixed");

    editor.tf.select({
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [0, 1], offset: 5 },
    });
    expect(getFontFamily(editor)).toBe("mixed");

    editor.tf.select(caret([0, 0], 1));
    expect(getFontFamily(editor)).toBe("sans");

    editor.tf.select(caret([0, 1], 1));
    expect(getFontFamily(editor)).toBe(null);
  });

  test("a font family keeps bold, size, color, and highlight, and clearing family keeps them", () => {
    const marks = {
      text: "Hello",
      bold: true,
      fontSize: "18px",
      color: "red",
      backgroundColor: "yellow",
    };
    const editor = createEditor([{ type: "p", children: [marks] }]);
    editor.tf.select(textRange([0, 0], 0, 5));

    runEditorCommand(editor, setFontFamily, "serif");

    expect(editor.children[0]?.children[0]).toEqual({ ...marks, fontFamily: "serif" });

    runEditorCommand(editor, setFontFamily, null);

    const leaf = editor.children[0]?.children[0];
    expect(leaf).toEqual(marks);
    expect(field(leaf, "fontFamily")).toBeUndefined();
  });

  test("setting a font family is one undo step, and redo restores it", () => {
    const editor = createEditor([paragraph("Hello")]);
    editor.tf.select(caret([0, 0], 5));
    editor.tf.insertText("!");
    editor.tf.select(textRange([0, 0], 0, 5));
    const undos = editor.history.undos.length;

    runEditorCommand(editor, setFontFamily, "mono");

    expect(editor.history.undos.length - undos).toBe(1);
    expect(editor.children[0]?.children).toEqual([
      { text: "Hello", fontFamily: "mono" },
      { text: "!" },
    ]);

    editor.tf.undo();

    expect(editor.children[0]?.children).toEqual([{ text: "Hello!" }]);

    editor.tf.redo();

    expect(editor.children[0]?.children).toEqual([
      { text: "Hello", fontFamily: "mono" },
      { text: "!" },
    ]);
  });

  test("a read-only editor refuses the font family command", () => {
    const editor = createEditor([paragraph("Hello")]);
    editor.tf.select(textRange([0, 0], 0, 5));
    const undos = editor.history.undos.length;

    const applied = runEditorCommand(editor, setFontFamily, "serif", { readOnly: true });

    expect(applied).toBe(false);
    expect(editor.children[0]?.children).toEqual([{ text: "Hello" }]);
    expect(editor.history.undos.length).toBe(undos);
  });

  test("setFontFamily is a format command and has no shortcut", () => {
    const editor = createEditor();

    expect(KEYS.fontFamily).toBe("fontFamily");
    expect(setFontFamily.id).toBe("format.font-family");
    expect(setFontFamily.group).toBe("format");
    expect(setFontFamily.label).toBe("Font family");
    expect(editor.meta.shortcuts["fontFamily.toggle"]).toBeUndefined();
  });

  test("the font stacks live on the editor font variables", () => {
    const css = readFileSync(new URL("../../../styles/globals.css", import.meta.url), "utf8");

    expect(css).toContain(`--editor-font-sans: ${SANS_STACK};`);
    expect(css).toContain(`--editor-font-mono: ${MONO_STACK};`);
    expect(css).toContain(`--editor-font-serif: ${SERIF_STACK};`);
  });

  test.each([...FONT_FAMILIES])("%s renders as its theme variable", async (token) => {
    const editor = createEditor([{ type: "p", children: [{ text: token, fontFamily: token }] }]);

    const html = await serializeHtml(editor);

    expect(html).toContain(`var(--editor-font-${token})`);
    expect(html).not.toContain(`font-family:${token}`);
    expect(html).not.toContain(`font-family: ${token}`);
  });

  test("inline code with a serif mark renders the mono stack", async () => {
    const editor = createEditor([
      { type: "p", children: [{ text: "token", code: true, fontFamily: "serif" }] },
    ]);

    const html = await serializeHtml(editor);

    expect(html).toContain("var(--editor-font-mono)");
    expect(html).not.toContain("var(--editor-font-serif)");
    expect(computedFamily(html, "token")).toBe(
      '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
    );
  });

  test.each([...FONT_FAMILIES])("%s round-trips through serialize and parse", (token) => {
    const document = createEditorDocument("doc-font-family", [
      { type: "p", id: "p", children: [{ text: "Hi", fontFamily: token }] },
    ]);
    const serialized: unknown = JSON.parse(serializeEditorDocument(document));
    const parsed = expectOk(parseEditorDocument(serialized));

    expect(parsed.repairs).toEqual([]);
    expect(parsed.document.content).toEqual(document.content);
  });

  test.each(["Arial", "cursive"])(
    "%s outside the tokens is unsupported and the raw input is kept",
    (family) => {
      const raw = createEditorDocument("doc-font-family", [
        { type: "p", id: "p", children: [{ text: "Hi", fontFamily: family }] },
      ]);

      const result = expectUnsupported(parseEditorDocument(raw));

      expect(result.raw).toBe(raw);
      expect(result.issues[0]?.path).toEqual([0, 0]);
      expect(result.issues[0]?.message).toContain(`unsupported fontFamily "${family}"`);
      expect(field(raw.content[0]?.children[0], "fontFamily")).toBe(family);
    },
  );

  test("the font family allowlist accepts tokens and rejects other values", () => {
    expect(isAllowedMark(KEYS.fontFamily)).toBe(true);
    expect(allowedMarkValues(KEYS.fontFamily)).toEqual([...FONT_FAMILIES]);
    expect(isAllowedMarkValue(KEYS.fontFamily, "mono")).toBe(true);
    expect(isAllowedMarkValue(KEYS.fontFamily, "Arial")).toBe(false);
    expect(isAllowedMarkValue(KEYS.fontFamily, null)).toBe(false);
    expect(isAllowedValue("serif", FONT_FAMILIES)).toBe(true);
    expect(isAllowedValue("cursive", FONT_FAMILIES)).toBe(false);
  });

  test.each(["Arial", '"Times New Roman"', "Inter", "sans-serif", "monospace"])(
    "pasting font-family %s drops the family and keeps the text",
    (family) => {
      const editor = pasteHtml(`<p><span style="font-family:${family}">a</span></p>`);

      expect(plainText(editor)).toBe("a");
      expect(fontFamilyValues(editor)).toEqual([]);
    },
  );

  test("pasting font-family Consolas becomes code and stores no font family", () => {
    const editor = pasteHtml('<p><span style="font-family:Consolas">a</span></p>');

    expect(plainText(editor)).toBe("a");
    expect(fontFamilyValues(editor)).toEqual([]);
    expect(codeMarks(editor)).toEqual([true]);
  });

  test("pasting an editor fragment keeps a font family token", () => {
    const editor = createEditor();
    editor.tf.select(caret([0, 0], 0));
    editor.tf.insertFragment([{ type: "p", children: [{ text: "x", fontFamily: "mono" }] }]);

    expect(plainText(editor)).toBe("x");
    expect(fontFamilyValues(editor)).toEqual(["mono"]);
  });
});
