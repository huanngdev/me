import { describe, expect, test } from "bun:test";
import { KEYS, type SlateEditor, type TRange } from "platejs";
import { serializeHtml } from "platejs/static";

import { DEMO_DOCUMENT_VALUE } from "./demo-document";
import { formatBold, formatItalic, runEditorCommand, type EditorCommand } from "./editor-commands";
import { createEditorDocument, serializeEditorDocument } from "./editor-document";
import { isAllowedMark } from "./editor-document-schema";
import { parseEditorDocument } from "./editor-document-validate";
import { caret, createEditor, expectOk, field, plainText, textRange } from "./test-utils";

type MarkKey = "bold" | "italic";

type MarkCase = {
  key: MarkKey;
  label: string;
  command: EditorCommand;
  hotkey: string;
  demoId: string;
  sentence: string;
  sample: string;
};

type Leaf = { text: string; bold?: true; italic?: true };

const MARKS: Array<[string, MarkCase]> = [
  [
    "bold",
    {
      key: KEYS.bold,
      label: "bold",
      command: formatBold,
      hotkey: "b",
      demoId: "demo-bold",
      sentence: "This is bold text. Select words and press Cmd+B or Ctrl+B.",
      sample: "bold text",
    },
  ],
  [
    "italic",
    {
      key: KEYS.italic,
      label: "italic",
      command: formatItalic,
      hotkey: "i",
      demoId: "demo-italic",
      sentence: "This is italic text. Press Cmd+I or Ctrl+I, and combine it with bold.",
      sample: "italic text",
    },
  ],
];

function paragraph(text: string) {
  return { type: "p" as const, children: [{ text }] };
}

function markState(editor: SlateEditor, command: EditorCommand): "on" | "off" | "mixed" {
  const state = command.getState?.(editor);
  if (state === undefined) {
    throw new Error(`Missing ${command.label} state.`);
  }

  return state;
}

function withMark(text: string, key: MarkKey): Leaf {
  if (key === KEYS.bold) {
    return { text, bold: true };
  }

  return { text, italic: true };
}

function leaves(editor: SlateEditor, index: number, key: MarkKey): Leaf[] {
  const block = editor.children[index];
  if (!block) {
    return [];
  }

  const result: Leaf[] = [];
  for (const child of block.children) {
    if (!("text" in child) || typeof child.text !== "string" || "children" in child) {
      continue;
    }

    const leaf: Leaf =
      field(child, key) === true ? withMark(child.text, key) : { text: child.text };
    result.push(leaf);
  }

  return result;
}

function marked(text: string, key: MarkKey): Leaf {
  return withMark(text, key);
}

function press(editor: SlateEditor, key: string): void {
  const shortcut = editor.meta.shortcuts[`${key}.toggle`];
  if (!shortcut?.handler) {
    throw new Error(`Missing ${key} shortcut.`);
  }

  shortcut.handler({ editor });
}

function acrossParagraphs(): TRange {
  return {
    anchor: { path: [0, 0], offset: 6 },
    focus: { path: [1, 0], offset: 6 },
  };
}

function textOf(block: (typeof DEMO_DOCUMENT_VALUE)[number]): string {
  return block.children.map((child) => child.text).join("");
}

describe.each(MARKS)("%s", (_name, mark) => {
  test(`toggling ${mark.label} on a range sets ${mark.label} on that text and splits the leaf`, () => {
    const editor = createEditor([paragraph("Hello world")]);
    editor.tf.select(textRange([0, 0], 6, 11));

    const applied = runEditorCommand(editor, mark.command, undefined);

    expect(applied).toBe(true);
    expect(leaves(editor, 0, mark.key)).toEqual([{ text: "Hello " }, marked("world", mark.key)]);
  });

  test(`toggling ${mark.label} again on the same range removes the mark`, () => {
    const editor = createEditor([paragraph("Hello world")]);
    editor.tf.select(textRange([0, 0], 6, 11));
    runEditorCommand(editor, mark.command, undefined);
    editor.tf.select(textRange([0, 1], 0, 5));

    runEditorCommand(editor, mark.command, undefined);

    expect(leaves(editor, 0, mark.key)).toEqual([{ text: "Hello world" }]);
  });

  test(`a caret toggle makes the next inserted text ${mark.label}, and toggling back makes the next text plain`, () => {
    const editor = createEditor([paragraph("Hello")]);
    editor.tf.select(caret([0, 0], 5));

    runEditorCommand(editor, mark.command, undefined);

    expect(markState(editor, mark.command)).toBe("on");
    expect(plainText(editor)).toBe("Hello");

    editor.tf.insertText("!");

    expect(leaves(editor, 0, mark.key)).toEqual([{ text: "Hello" }, marked("!", mark.key)]);

    runEditorCommand(editor, mark.command, undefined);

    expect(markState(editor, mark.command)).toBe("off");

    editor.tf.insertText("x");

    expect(leaves(editor, 0, mark.key)).toEqual([
      { text: "Hello" },
      marked("!", mark.key),
      { text: "x" },
    ]);
  });

  test(`a range across two paragraphs sets ${mark.label} on both parts and leaves the outside text plain`, () => {
    const editor = createEditor([paragraph("Hello world"), paragraph("Second line")]);
    editor.tf.select(acrossParagraphs());

    runEditorCommand(editor, mark.command, undefined);

    expect(leaves(editor, 0, mark.key)).toEqual([{ text: "Hello " }, marked("world", mark.key)]);
    expect(leaves(editor, 1, mark.key)).toEqual([marked("Second", mark.key), { text: " line" }]);
  });

  test(`${mark.label} state is on, off, and mixed for fully marked, plain, and partly marked selections`, () => {
    const editor = createEditor([
      {
        type: "p",
        children: [{ text: "Hello " }, marked("world", mark.key)],
      },
    ]);

    editor.tf.select(textRange([0, 1], 0, 5));
    expect(markState(editor, mark.command)).toBe("on");

    editor.tf.select(textRange([0, 0], 0, 6));
    expect(markState(editor, mark.command)).toBe("off");

    editor.tf.select({
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [0, 1], offset: 5 },
    });
    expect(markState(editor, mark.command)).toBe("mixed");
  });

  test(`a partly ${mark.label} selection becomes fully ${mark.label}`, () => {
    const editor = createEditor([
      {
        type: "p",
        children: [{ text: "Hello " }, marked("world", mark.key)],
      },
    ]);
    editor.tf.select({
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [0, 1], offset: 5 },
    });

    runEditorCommand(editor, mark.command, undefined);

    expect(leaves(editor, 0, mark.key)).toEqual([marked("Hello world", mark.key)]);
    expect(markState(editor, mark.command)).toBe("on");
  });

  test(`removing ${mark.label} keeps an unrelated mark on the same text`, () => {
    const editor = createEditor([
      { type: "p", children: [{ text: "Hello", note: "keep", [mark.key]: true }] },
    ]);
    editor.tf.select(textRange([0, 0], 0, 5));

    runEditorCommand(editor, mark.command, undefined);
    const leaf = editor.children[0]?.children[0];

    expect(leaf).toEqual({ text: "Hello", note: "keep" });
  });

  test(`one ${mark.label} toggle is one undo step, and typing before and after stays separate`, () => {
    const editor = createEditor([paragraph("Hello")]);
    editor.tf.select(caret([0, 0], 5));
    editor.tf.insertText("!");
    editor.tf.select(textRange([0, 0], 0, 5));

    runEditorCommand(editor, mark.command, undefined);

    expect(leaves(editor, 0, mark.key)).toEqual([marked("Hello", mark.key), { text: "!" }]);

    editor.tf.undo();

    expect(leaves(editor, 0, mark.key)).toEqual([{ text: "Hello!" }]);

    editor.tf.redo();

    expect(leaves(editor, 0, mark.key)).toEqual([marked("Hello", mark.key), { text: "!" }]);

    editor.tf.select(caret([0, 1], 1));
    editor.tf.insertText("Y");

    expect(plainText(editor)).toBe("Hello!Y");

    editor.tf.undo();

    expect(leaves(editor, 0, mark.key)).toEqual([marked("Hello", mark.key), { text: "!" }]);
  });

  test(`a read-only editor refuses the ${mark.label} command`, () => {
    const editor = createEditor([paragraph("Hello")]);
    editor.tf.select(textRange([0, 0], 0, 5));
    const undos = editor.history.undos.length;

    const applied = runEditorCommand(editor, mark.command, undefined, { readOnly: true });

    expect(applied).toBe(false);
    expect(leaves(editor, 0, mark.key)).toEqual([{ text: "Hello" }]);
    expect(editor.history.undos.length).toBe(undos);
  });

  test(`${mark.label} survives serialize and parse with no repairs`, () => {
    const document = createEditorDocument("doc-mark", [
      { type: "p", id: "p", children: [{ text: "Hi", [mark.key]: true }, { text: " there" }] },
    ]);
    const serialized: unknown = JSON.parse(serializeEditorDocument(document));
    const parsed = expectOk(parseEditorDocument(serialized));

    expect(isAllowedMark(mark.key)).toBe(true);
    expect(parsed.repairs).toEqual([]);
    expect(parsed.document.content).toEqual(document.content);
  });

  test(`the ${mark.label} shortcut uses Mod+${mark.hotkey.toUpperCase()} and toggles a range in one undo step`, () => {
    const editor = createEditor([paragraph("Hello world")]);
    const shortcut = editor.meta.shortcuts[`${mark.key}.toggle`];
    editor.tf.select(textRange([0, 0], 6, 11));
    const undos = editor.history.undos.length;

    expect(shortcut?.keys).toEqual([["Mod", mark.hotkey]]);

    press(editor, mark.key);

    expect(editor.history.undos.length - undos).toBe(1);
    expect(leaves(editor, 0, mark.key)).toEqual([{ text: "Hello " }, marked("world", mark.key)]);

    editor.tf.undo();

    expect(leaves(editor, 0, mark.key)).toEqual([{ text: "Hello world" }]);
  });

  test(`the ${mark.label} shortcut at a caret marks the next inserted text`, () => {
    const editor = createEditor([paragraph("Hello")]);
    editor.tf.select(caret([0, 0], 5));

    press(editor, mark.key);
    editor.tf.insertText("!");

    expect(leaves(editor, 0, mark.key)).toEqual([{ text: "Hello" }, marked("!", mark.key)]);
  });

  test(`the ${mark.label} shortcut marks a range across two paragraphs`, () => {
    const editor = createEditor([paragraph("Hello world"), paragraph("Second line")]);
    editor.tf.select(acrossParagraphs());

    press(editor, mark.key);

    expect(leaves(editor, 0, mark.key)).toEqual([{ text: "Hello " }, marked("world", mark.key)]);
    expect(leaves(editor, 1, mark.key)).toEqual([marked("Second", mark.key), { text: " line" }]);
  });

  test(`the ${mark.label} shortcut does nothing in a read-only editor`, () => {
    const editor = createEditor([paragraph("Hello world")]);
    editor.tf.select(textRange([0, 0], 6, 11));
    editor.dom.readOnly = true;
    const undos = editor.history.undos.length;

    press(editor, mark.key);

    expect(leaves(editor, 0, mark.key)).toEqual([{ text: "Hello world" }]);
    expect(editor.history.undos.length).toBe(undos);
  });

  test(`the demo document parses with no repairs and marks only ${mark.sample}`, () => {
    const parsed = expectOk(parseEditorDocument(createEditorDocument("demo", DEMO_DOCUMENT_VALUE)));
    const block = DEMO_DOCUMENT_VALUE.find((item) => item.id === mark.demoId);
    const markedLeaves = block?.children
      .filter((child) => field(child, mark.key) === true)
      .map((child) => child.text);

    expect(parsed.repairs).toEqual([]);
    expect(DEMO_DOCUMENT_VALUE).toHaveLength(9);
    expect(block === undefined ? "" : textOf(block)).toBe(mark.sentence);
    expect(markedLeaves).toEqual([mark.sample]);
  });
});

describe("marks", () => {
  test("adding italic keeps bold on the same text", () => {
    const editor = createEditor([{ type: "p", children: [{ text: "Hello", bold: true }] }]);
    editor.tf.select(textRange([0, 0], 0, 5));

    runEditorCommand(editor, formatItalic, undefined);

    expect(editor.children[0]?.children[0]).toEqual({ text: "Hello", bold: true, italic: true });
  });

  test("adding bold keeps italic on the same text", () => {
    const editor = createEditor([{ type: "p", children: [{ text: "Hello", italic: true }] }]);
    editor.tf.select(textRange([0, 0], 0, 5));

    runEditorCommand(editor, formatBold, undefined);

    expect(editor.children[0]?.children[0]).toEqual({ text: "Hello", bold: true, italic: true });
  });

  test("removing italic keeps bold on the same text", () => {
    const editor = createEditor([
      { type: "p", children: [{ text: "Hello", bold: true, italic: true }] },
    ]);
    editor.tf.select(textRange([0, 0], 0, 5));

    runEditorCommand(editor, formatItalic, undefined);

    expect(editor.children[0]?.children[0]).toEqual({ text: "Hello", bold: true });
  });

  test("removing bold keeps italic on the same text", () => {
    const editor = createEditor([
      { type: "p", children: [{ text: "Hello", bold: true, italic: true }] },
    ]);
    editor.tf.select(textRange([0, 0], 0, 5));

    runEditorCommand(editor, formatBold, undefined);

    expect(editor.children[0]?.children[0]).toEqual({ text: "Hello", italic: true });
  });

  test("bold and italic on the same text round-trip together", () => {
    const document = createEditorDocument("doc-both", [
      { type: "p", id: "p", children: [{ text: "Hi", bold: true, italic: true }] },
    ]);
    const serialized: unknown = JSON.parse(serializeEditorDocument(document));
    const parsed = expectOk(parseEditorDocument(serialized));

    expect(parsed.repairs).toEqual([]);
    expect(parsed.document.content).toEqual(document.content);
  });

  test("bold and italic on the same text render as strong and em", async () => {
    const editor = createEditor([
      { type: "p", children: [{ text: "Hi", bold: true, italic: true }] },
    ]);

    const html = await serializeHtml(editor);
    const strong = html.match(/<strong\b[^>]*>([\s\S]*?)<\/strong>/);
    const em = html.match(/<em\b[^>]*>([\s\S]*?)<\/em>/);

    expect(strong?.[1]).toContain("Hi");
    expect(em?.[1]).toContain("Hi");
  });

  test("a selection that is fully bold and partly italic reports bold on and italic mixed", () => {
    const editor = createEditor([
      {
        type: "p",
        children: [
          { text: "Hello ", bold: true },
          { text: "world", bold: true, italic: true },
        ],
      },
    ]);
    editor.tf.select({
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [0, 1], offset: 5 },
    });

    expect(markState(editor, formatBold)).toBe("on");
    expect(markState(editor, formatItalic)).toBe("mixed");
  });
});
