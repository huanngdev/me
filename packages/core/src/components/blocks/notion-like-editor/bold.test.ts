import { describe, expect, test } from "bun:test";
import type { SlateEditor, TRange } from "platejs";

import { DEMO_DOCUMENT_VALUE } from "./demo-document";
import { formatBold, runEditorCommand } from "./editor-commands";
import { createEditorDocument, serializeEditorDocument } from "./editor-document";
import { isAllowedMark } from "./editor-document-schema";
import { parseEditorDocument } from "./editor-document-validate";
import { caret, createEditor, expectOk, plainText, textRange } from "./test-utils";

const BOLD_SHORTCUT = "bold.toggle";

function paragraph(text: string) {
  return { type: "p" as const, children: [{ text }] };
}

function boldState(editor: SlateEditor): "on" | "off" | "mixed" {
  const state = formatBold.getState?.(editor);
  if (state === undefined) {
    throw new Error("Missing bold state.");
  }

  return state;
}

function leaves(editor: SlateEditor, index: number): Array<{ text: string; bold?: true }> {
  const block = editor.children[index];
  if (!block) {
    return [];
  }

  const result: Array<{ text: string; bold?: true }> = [];
  for (const child of block.children) {
    if (!("text" in child) || typeof child.text !== "string" || "children" in child) {
      continue;
    }

    const leaf: { text: string; bold?: true } = { text: child.text };
    if ("bold" in child && child.bold === true) {
      leaf.bold = true;
    }
    result.push(leaf);
  }

  return result;
}

function pressBold(editor: SlateEditor): void {
  const shortcut = editor.meta.shortcuts[BOLD_SHORTCUT];
  if (!shortcut?.handler) {
    throw new Error("Missing bold shortcut.");
  }

  shortcut.handler({ editor });
}

function acrossParagraphs(): TRange {
  return {
    anchor: { path: [0, 0], offset: 6 },
    focus: { path: [1, 0], offset: 6 },
  };
}

describe("bold", () => {
  test("toggling bold on a range sets bold on that text and splits the leaf", () => {
    const editor = createEditor([paragraph("Hello world")]);
    editor.tf.select(textRange([0, 0], 6, 11));

    const applied = runEditorCommand(editor, formatBold, undefined);

    expect(applied).toBe(true);
    expect(leaves(editor, 0)).toEqual([{ text: "Hello " }, { text: "world", bold: true }]);
  });

  test("toggling bold again on the same range removes the mark", () => {
    const editor = createEditor([paragraph("Hello world")]);
    editor.tf.select(textRange([0, 0], 6, 11));
    runEditorCommand(editor, formatBold, undefined);
    editor.tf.select(textRange([0, 1], 0, 5));

    runEditorCommand(editor, formatBold, undefined);

    expect(leaves(editor, 0)).toEqual([{ text: "Hello world" }]);
  });

  test("a caret toggle makes the next inserted text bold, and toggling back makes the next text plain", () => {
    const editor = createEditor([paragraph("Hello")]);
    editor.tf.select(caret([0, 0], 5));

    runEditorCommand(editor, formatBold, undefined);

    expect(boldState(editor)).toBe("on");
    expect(plainText(editor)).toBe("Hello");

    editor.tf.insertText("!");

    expect(leaves(editor, 0)).toEqual([{ text: "Hello" }, { text: "!", bold: true }]);

    runEditorCommand(editor, formatBold, undefined);

    expect(boldState(editor)).toBe("off");

    editor.tf.insertText("x");

    expect(leaves(editor, 0)).toEqual([
      { text: "Hello" },
      { text: "!", bold: true },
      { text: "x" },
    ]);
  });

  test("a range across two paragraphs bolds both parts and leaves the outside text plain", () => {
    const editor = createEditor([paragraph("Hello world"), paragraph("Second line")]);
    editor.tf.select(acrossParagraphs());

    runEditorCommand(editor, formatBold, undefined);

    expect(leaves(editor, 0)).toEqual([{ text: "Hello " }, { text: "world", bold: true }]);
    expect(leaves(editor, 1)).toEqual([{ text: "Second", bold: true }, { text: " line" }]);
  });

  test("bold state is on, off, and mixed for fully bold, plain, and partly bold selections", () => {
    const editor = createEditor([
      {
        type: "p",
        children: [{ text: "Hello " }, { text: "world", bold: true }],
      },
    ]);

    editor.tf.select(textRange([0, 1], 0, 5));
    expect(boldState(editor)).toBe("on");

    editor.tf.select(textRange([0, 0], 0, 6));
    expect(boldState(editor)).toBe("off");

    editor.tf.select({
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [0, 1], offset: 5 },
    });
    expect(boldState(editor)).toBe("mixed");
  });

  test("a partly bold selection becomes fully bold", () => {
    const editor = createEditor([
      {
        type: "p",
        children: [{ text: "Hello " }, { text: "world", bold: true }],
      },
    ]);
    editor.tf.select({
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [0, 1], offset: 5 },
    });

    runEditorCommand(editor, formatBold, undefined);

    expect(leaves(editor, 0)).toEqual([{ text: "Hello world", bold: true }]);
    expect(boldState(editor)).toBe("on");
  });

  test("removing bold keeps an unrelated mark on the same text", () => {
    const editor = createEditor([
      { type: "p", children: [{ text: "Hello", bold: true, note: "keep" }] },
    ]);
    editor.tf.select(textRange([0, 0], 0, 5));

    runEditorCommand(editor, formatBold, undefined);
    const leaf = editor.children[0]?.children[0];

    expect(leaf).toEqual({ text: "Hello", note: "keep" });
  });

  test("one bold toggle is one undo step, and typing before and after stays separate", () => {
    const editor = createEditor([paragraph("Hello")]);
    editor.tf.select(caret([0, 0], 5));
    editor.tf.insertText("!");
    editor.tf.select(textRange([0, 0], 0, 5));

    runEditorCommand(editor, formatBold, undefined);

    expect(leaves(editor, 0)).toEqual([{ text: "Hello", bold: true }, { text: "!" }]);

    editor.tf.undo();

    expect(leaves(editor, 0)).toEqual([{ text: "Hello!" }]);

    editor.tf.redo();

    expect(leaves(editor, 0)).toEqual([{ text: "Hello", bold: true }, { text: "!" }]);

    editor.tf.select(caret([0, 1], 1));
    editor.tf.insertText("Y");

    expect(plainText(editor)).toBe("Hello!Y");

    editor.tf.undo();

    expect(leaves(editor, 0)).toEqual([{ text: "Hello", bold: true }, { text: "!" }]);
  });

  test("a read-only editor refuses the bold command", () => {
    const editor = createEditor([paragraph("Hello")]);
    editor.tf.select(textRange([0, 0], 0, 5));
    const undos = editor.history.undos.length;

    const applied = runEditorCommand(editor, formatBold, undefined, { readOnly: true });

    expect(applied).toBe(false);
    expect(leaves(editor, 0)).toEqual([{ text: "Hello" }]);
    expect(editor.history.undos.length).toBe(undos);
  });

  test("bold survives serialize and parse with no repairs", () => {
    const document = createEditorDocument("doc-bold", [
      { type: "p", id: "p", children: [{ text: "Hi", bold: true }, { text: " there" }] },
    ]);
    const serialized: unknown = JSON.parse(serializeEditorDocument(document));
    const parsed = expectOk(parseEditorDocument(serialized));

    expect(isAllowedMark("bold")).toBe(true);
    expect(parsed.repairs).toEqual([]);
    expect(parsed.document.content).toEqual(document.content);
  });

  test("the bold shortcut uses Mod+B and toggles a range in one undo step", () => {
    const editor = createEditor([paragraph("Hello world")]);
    const shortcut = editor.meta.shortcuts[BOLD_SHORTCUT];
    editor.tf.select(textRange([0, 0], 6, 11));
    const undos = editor.history.undos.length;

    expect(shortcut?.keys).toEqual([["Mod", "b"]]);

    pressBold(editor);

    expect(editor.history.undos.length - undos).toBe(1);
    expect(leaves(editor, 0)).toEqual([{ text: "Hello " }, { text: "world", bold: true }]);

    editor.tf.undo();

    expect(leaves(editor, 0)).toEqual([{ text: "Hello world" }]);
  });

  test("the bold shortcut at a caret bolds the next inserted text", () => {
    const editor = createEditor([paragraph("Hello")]);
    editor.tf.select(caret([0, 0], 5));

    pressBold(editor);
    editor.tf.insertText("!");

    expect(leaves(editor, 0)).toEqual([{ text: "Hello" }, { text: "!", bold: true }]);
  });

  test("the bold shortcut bolds a range across two paragraphs", () => {
    const editor = createEditor([paragraph("Hello world"), paragraph("Second line")]);
    editor.tf.select(acrossParagraphs());

    pressBold(editor);

    expect(leaves(editor, 0)).toEqual([{ text: "Hello " }, { text: "world", bold: true }]);
    expect(leaves(editor, 1)).toEqual([{ text: "Second", bold: true }, { text: " line" }]);
  });

  test("the bold shortcut does nothing in a read-only editor", () => {
    const editor = createEditor([paragraph("Hello world")]);
    editor.tf.select(textRange([0, 0], 6, 11));
    editor.dom.readOnly = true;
    const undos = editor.history.undos.length;

    pressBold(editor);

    expect(leaves(editor, 0)).toEqual([{ text: "Hello world" }]);
    expect(editor.history.undos.length).toBe(undos);
  });

  test("the demo document parses with no repairs and bolds only bold text", () => {
    const parsed = expectOk(parseEditorDocument(createEditorDocument("demo", DEMO_DOCUMENT_VALUE)));
    const block = DEMO_DOCUMENT_VALUE.find((item) => item.id === "demo-bold");
    const boldLeaves = block?.children
      .filter((child) => child.bold === true)
      .map((child) => child.text);

    expect(parsed.repairs).toEqual([]);
    expect(DEMO_DOCUMENT_VALUE).toHaveLength(8);
    expect(block?.children.map((child) => child.text).join("")).toBe(
      "This is bold text. Select words and press Cmd+B or Ctrl+B.",
    );
    expect(boldLeaves).toEqual(["bold text"]);
  });
});
