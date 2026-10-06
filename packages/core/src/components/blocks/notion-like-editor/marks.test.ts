import { describe, expect, test } from "bun:test";
import { KEYS, type SlateEditor, type TRange } from "platejs";
import { serializeHtml } from "platejs/static";

import { DEMO_DOCUMENT_VALUE } from "./demo-document";
import {
  formatBold,
  formatCode,
  formatItalic,
  formatStrikethrough,
  formatSubscript,
  formatSuperscript,
  formatUnderline,
  runEditorCommand,
  type EditorCommand,
} from "./editor-commands";
import { createEditorDocument, serializeEditorDocument } from "./editor-document";
import { isAllowedMark } from "./editor-document-schema";
import { parseEditorDocument } from "./editor-document-validate";
import { caret, createEditor, expectOk, field, plainText, textRange } from "./test-utils";

type MarkKey =
  "bold" | "italic" | "underline" | "strikethrough" | "code" | "superscript" | "subscript";

type MarkCase = {
  key: MarkKey;
  label: string;
  command: EditorCommand;
  keys: readonly string[];
  demoId: string;
  sentence: string;
  sample: string;
  samples?: readonly string[];
};

type Leaf = {
  text: string;
  bold?: true;
  italic?: true;
  underline?: true;
  strikethrough?: true;
  code?: true;
  superscript?: true;
  subscript?: true;
};

function shortcutName(keys: readonly string[]): string {
  return keys.map((key) => (key.length === 1 ? key.toUpperCase() : key)).join("+");
}

const MARKS: Array<[string, MarkCase]> = [
  [
    "bold",
    {
      key: KEYS.bold,
      label: "bold",
      command: formatBold,
      keys: ["Mod", "b"],
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
      keys: ["Mod", "i"],
      demoId: "demo-italic",
      sentence: "This is italic text. Press Cmd+I or Ctrl+I, and combine it with bold.",
      sample: "italic text",
    },
  ],
  [
    "underline",
    {
      key: KEYS.underline,
      label: "underline",
      command: formatUnderline,
      keys: ["Mod", "u"],
      demoId: "demo-underline",
      sentence: "This is underlined text. Press Cmd+U or Ctrl+U.",
      sample: "underlined text",
    },
  ],
  [
    "strikethrough",
    {
      key: KEYS.strikethrough,
      label: "strikethrough",
      command: formatStrikethrough,
      keys: ["Mod", "Shift", "x"],
      demoId: "demo-strikethrough",
      sentence: "This is strikethrough text. Press Cmd+Shift+X or Ctrl+Shift+X.",
      sample: "strikethrough text",
    },
  ],
  [
    "code",
    {
      key: KEYS.code,
      label: "code",
      command: formatCode,
      keys: ["Mod", "e"],
      demoId: "demo-code",
      sentence: "This is inline code. Press Cmd+E or Ctrl+E.",
      sample: "inline code",
    },
  ],
  [
    "superscript",
    {
      key: KEYS.sup,
      label: "superscript",
      command: formatSuperscript,
      keys: ["Mod", "period"],
      demoId: "demo-superscript",
      sentence: "This is superscript: x2 and E = mc2. Press Cmd+. or Ctrl+.",
      sample: "2",
      samples: ["2", "2"],
    },
  ],
  [
    "subscript",
    {
      key: KEYS.sub,
      label: "subscript",
      command: formatSubscript,
      keys: ["Mod", "comma"],
      demoId: "demo-subscript",
      sentence: "This is subscript: H2O. Press Cmd+, or Ctrl+,",
      sample: "2",
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

  if (key === KEYS.italic) {
    return { text, italic: true };
  }

  if (key === KEYS.underline) {
    return { text, underline: true };
  }

  if (key === KEYS.strikethrough) {
    return { text, strikethrough: true };
  }

  if (key === KEYS.code) {
    return { text, code: true };
  }

  if (key === KEYS.sup) {
    return { text, superscript: true };
  }

  if (key === KEYS.sub) {
    return { text, subscript: true };
  }

  const unreachable: never = key;
  throw new Error(`Unknown mark ${unreachable}`);
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

  test(`the ${mark.label} shortcut uses ${shortcutName(mark.keys)} and toggles a range in one undo step`, () => {
    const editor = createEditor([paragraph("Hello world")]);
    const shortcut = editor.meta.shortcuts[`${mark.key}.toggle`];
    editor.tf.select(textRange([0, 0], 6, 11));
    const undos = editor.history.undos.length;

    expect(shortcut?.keys).toEqual([[...mark.keys]]);

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

    const expected = mark.samples === undefined ? [mark.sample] : [...mark.samples];

    expect(parsed.repairs).toEqual([]);
    expect(DEMO_DOCUMENT_VALUE).toHaveLength(35);
    expect(block === undefined ? "" : textOf(block)).toBe(mark.sentence);
    expect(markedLeaves).toEqual(expected);
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

  test("removing underline keeps bold and italic on the same text", () => {
    const editor = createEditor([
      {
        type: "p",
        children: [{ text: "Hello", bold: true, italic: true, underline: true }],
      },
    ]);
    editor.tf.select(textRange([0, 0], 0, 5));

    runEditorCommand(editor, formatUnderline, undefined);

    expect(editor.children[0]?.children[0]).toEqual({ text: "Hello", bold: true, italic: true });
  });

  test("bold, italic, and underline on the same text round-trip together", () => {
    const document = createEditorDocument("doc-three", [
      {
        type: "p",
        id: "p",
        children: [{ text: "Hi", bold: true, italic: true, underline: true }],
      },
    ]);
    const serialized: unknown = JSON.parse(serializeEditorDocument(document));
    const parsed = expectOk(parseEditorDocument(serialized));

    expect(parsed.repairs).toEqual([]);
    expect(parsed.document.content).toEqual(document.content);
  });

  test("bold, italic, and underline on the same text render as strong, em, and u", async () => {
    const editor = createEditor([
      {
        type: "p",
        children: [{ text: "Hi", bold: true, italic: true, underline: true }],
      },
    ]);

    const html = await serializeHtml(editor);
    const strong = html.match(/<strong\b[^>]*>([\s\S]*?)<\/strong>/);
    const em = html.match(/<em\b[^>]*>([\s\S]*?)<\/em>/);
    const underline = html.match(/<u\b[^>]*>([\s\S]*?)<\/u>/);

    expect(strong?.[1]).toContain("Hi");
    expect(em?.[1]).toContain("Hi");
    expect(underline?.[1]).toContain("Hi");
  });

  test("removing strikethrough keeps bold, italic, and underline on the same text", () => {
    const editor = createEditor([
      {
        type: "p",
        children: [
          {
            text: "Hello",
            bold: true,
            italic: true,
            underline: true,
            strikethrough: true,
          },
        ],
      },
    ]);
    editor.tf.select(textRange([0, 0], 0, 5));

    runEditorCommand(editor, formatStrikethrough, undefined);

    expect(editor.children[0]?.children[0]).toEqual({
      text: "Hello",
      bold: true,
      italic: true,
      underline: true,
    });
  });

  test("bold, italic, underline, and strikethrough on the same text round-trip together", () => {
    const document = createEditorDocument("doc-four", [
      {
        type: "p",
        id: "p",
        children: [{ text: "Hi", bold: true, italic: true, underline: true, strikethrough: true }],
      },
    ]);
    const serialized: unknown = JSON.parse(serializeEditorDocument(document));
    const parsed = expectOk(parseEditorDocument(serialized));

    expect(parsed.repairs).toEqual([]);
    expect(parsed.document.content).toEqual(document.content);
  });

  test("bold, italic, underline, and strikethrough on the same text render as strong, em, u, and s", async () => {
    const editor = createEditor([
      {
        type: "p",
        children: [{ text: "Hi", bold: true, italic: true, underline: true, strikethrough: true }],
      },
    ]);

    const html = await serializeHtml(editor);
    const strong = html.match(/<strong\b[^>]*>([\s\S]*?)<\/strong>/);
    const em = html.match(/<em\b[^>]*>([\s\S]*?)<\/em>/);
    const underline = html.match(/<u\b[^>]*>([\s\S]*?)<\/u>/);
    const strikethrough = html.match(/<s\b[^>]*>([\s\S]*?)<\/s>/);

    expect(strong?.[1]).toContain("Hi");
    expect(em?.[1]).toContain("Hi");
    expect(underline?.[1]).toContain("Hi");
    expect(strikethrough?.[1]).toContain("Hi");
  });

  test("adding code keeps strikethrough on the same text", () => {
    const editor = createEditor([
      { type: "p", children: [{ text: "Hello", strikethrough: true }] },
    ]);
    editor.tf.select(textRange([0, 0], 0, 5));

    runEditorCommand(editor, formatCode, undefined);

    expect(editor.children[0]?.children[0]).toEqual({
      text: "Hello",
      strikethrough: true,
      code: true,
    });
    expect(editor.children[0]?.type).toBe("p");
  });

  test("removing code keeps strikethrough on the same text", () => {
    const editor = createEditor([
      { type: "p", children: [{ text: "Hello", strikethrough: true, code: true }] },
    ]);
    editor.tf.select(textRange([0, 0], 0, 5));

    runEditorCommand(editor, formatCode, undefined);

    expect(editor.children[0]?.children[0]).toEqual({ text: "Hello", strikethrough: true });
  });

  test("removing strikethrough keeps code on the same text", () => {
    const editor = createEditor([
      { type: "p", children: [{ text: "Hello", strikethrough: true, code: true }] },
    ]);
    editor.tf.select(textRange([0, 0], 0, 5));

    runEditorCommand(editor, formatStrikethrough, undefined);

    expect(editor.children[0]?.children[0]).toEqual({ text: "Hello", code: true });
  });

  test("removing code keeps bold, italic, underline, and strikethrough", () => {
    const editor = createEditor([
      {
        type: "p",
        children: [
          {
            text: "Hello",
            bold: true,
            italic: true,
            underline: true,
            strikethrough: true,
            code: true,
          },
        ],
      },
    ]);
    editor.tf.select(textRange([0, 0], 0, 5));

    runEditorCommand(editor, formatCode, undefined);

    expect(editor.children[0]?.children[0]).toEqual({
      text: "Hello",
      bold: true,
      italic: true,
      underline: true,
      strikethrough: true,
    });
  });

  test("removing bold keeps code, italic, underline, and strikethrough", () => {
    const editor = createEditor([
      {
        type: "p",
        children: [
          {
            text: "Hello",
            bold: true,
            italic: true,
            underline: true,
            strikethrough: true,
            code: true,
          },
        ],
      },
    ]);
    editor.tf.select(textRange([0, 0], 0, 5));

    runEditorCommand(editor, formatBold, undefined);

    expect(editor.children[0]?.children[0]).toEqual({
      text: "Hello",
      italic: true,
      underline: true,
      strikethrough: true,
      code: true,
    });
  });

  test("bold, italic, underline, strikethrough, and code on the same text round-trip together", () => {
    const document = createEditorDocument("doc-five", [
      {
        type: "p",
        id: "p",
        children: [
          {
            text: "Hi",
            bold: true,
            italic: true,
            underline: true,
            strikethrough: true,
            code: true,
          },
        ],
      },
    ]);
    const serialized: unknown = JSON.parse(serializeEditorDocument(document));
    const parsed = expectOk(parseEditorDocument(serialized));

    expect(parsed.repairs).toEqual([]);
    expect(parsed.document.content).toEqual(document.content);
  });

  test("bold, italic, underline, strikethrough, and code on the same text render as strong, em, u, s, and code", async () => {
    const editor = createEditor([
      {
        type: "p",
        children: [
          {
            text: "Hi",
            bold: true,
            italic: true,
            underline: true,
            strikethrough: true,
            code: true,
          },
        ],
      },
    ]);

    const html = await serializeHtml(editor);
    const strong = html.match(/<strong\b[^>]*>([\s\S]*?)<\/strong>/);
    const em = html.match(/<em\b[^>]*>([\s\S]*?)<\/em>/);
    const underline = html.match(/<u\b[^>]*>([\s\S]*?)<\/u>/);
    const strikethrough = html.match(/<s\b[^>]*>([\s\S]*?)<\/s>/);
    const code = html.match(/<code\b[^>]*>([\s\S]*?)<\/code>/);

    const props = editor.getPlugin({ key: KEYS.code })?.node.props;
    const className =
      typeof props === "object" &&
      props !== null &&
      "className" in props &&
      typeof props.className === "string"
        ? props.className
        : "";

    expect(strong?.[1]).toContain("Hi");
    expect(em?.[1]).toContain("Hi");
    expect(underline?.[1]).toContain("Hi");
    expect(strikethrough?.[1]).toContain("Hi");
    expect(code?.[1]).toContain("Hi");
    expect(className).toContain("font-mono");
    expect(className).toContain("bg-muted");
    expect(className).toContain("text-base");
  });

  test("text with backticks, angle brackets, an ampersand, and surrounding spaces stays exact when code is toggled and parsed", () => {
    const sample = " `a<b>&` ";
    const editor = createEditor([paragraph(sample)]);
    editor.tf.select(textRange([0, 0], 0, sample.length));

    runEditorCommand(editor, formatCode, undefined);

    expect(editor.children[0]?.children).toEqual([{ text: sample, code: true }]);
    expect(editor.children[0]?.type).toBe("p");

    runEditorCommand(editor, formatCode, undefined);

    expect(editor.children[0]?.children).toEqual([{ text: sample }]);

    const document = createEditorDocument("doc-code-chars", [
      { type: "p", id: "p", children: [{ text: sample, code: true }] },
    ]);
    const serialized: unknown = JSON.parse(serializeEditorDocument(document));
    const parsed = expectOk(parseEditorDocument(serialized));

    expect(parsed.repairs).toEqual([]);
    expect(parsed.document.content).toEqual(document.content);
  });

  test("inserting Tiếng Việt at a caret inside code keeps code on that text", () => {
    const editor = createEditor([{ type: "p", children: [{ text: "ab", code: true }] }]);
    editor.tf.select(caret([0, 0], 1));

    editor.tf.insertText("Tiếng Việt");

    expect(editor.children[0]?.children).toEqual([{ text: "aTiếng Việtb", code: true }]);
  });

  test("toggling code on a whitespace-only selection marks those spaces", () => {
    const editor = createEditor([paragraph("   ")]);
    editor.tf.select(textRange([0, 0], 0, 3));

    runEditorCommand(editor, formatCode, undefined);

    expect(editor.children[0]?.children).toEqual([{ text: "   ", code: true }]);
    expect(editor.children[0]?.type).toBe("p");
  });

  test("adding superscript keeps bold and italic on the same text", () => {
    const editor = createEditor([
      { type: "p", children: [{ text: "Hello", bold: true, italic: true }] },
    ]);
    editor.tf.select(textRange([0, 0], 0, 5));

    runEditorCommand(editor, formatSuperscript, undefined);

    expect(editor.children[0]?.children[0]).toEqual({
      text: "Hello",
      bold: true,
      italic: true,
      superscript: true,
    });
  });

  test("removing superscript keeps bold and italic on the same text", () => {
    const editor = createEditor([
      {
        type: "p",
        children: [{ text: "Hello", bold: true, italic: true, superscript: true }],
      },
    ]);
    editor.tf.select(textRange([0, 0], 0, 5));

    runEditorCommand(editor, formatSuperscript, undefined);

    expect(editor.children[0]?.children[0]).toEqual({ text: "Hello", bold: true, italic: true });
  });

  test("removing superscript keeps bold, italic, underline, strikethrough, and code", () => {
    const editor = createEditor([
      {
        type: "p",
        children: [
          {
            text: "Hello",
            bold: true,
            italic: true,
            underline: true,
            strikethrough: true,
            code: true,
            superscript: true,
          },
        ],
      },
    ]);
    editor.tf.select(textRange([0, 0], 0, 5));

    runEditorCommand(editor, formatSuperscript, undefined);

    expect(editor.children[0]?.children[0]).toEqual({
      text: "Hello",
      bold: true,
      italic: true,
      underline: true,
      strikethrough: true,
      code: true,
    });
  });

  test("bold, italic, underline, strikethrough, code, and superscript on the same text round-trip together", () => {
    const document = createEditorDocument("doc-six", [
      {
        type: "p",
        id: "p",
        children: [
          {
            text: "Hi",
            bold: true,
            italic: true,
            underline: true,
            strikethrough: true,
            code: true,
            superscript: true,
          },
        ],
      },
    ]);
    const serialized: unknown = JSON.parse(serializeEditorDocument(document));
    const parsed = expectOk(parseEditorDocument(serialized));

    expect(parsed.repairs).toEqual([]);
    expect(parsed.document.content).toEqual(document.content);
  });

  test("bold, italic, underline, strikethrough, code, and superscript on the same text render as strong, em, u, s, code, and sup", async () => {
    const editor = createEditor([
      {
        type: "p",
        children: [
          {
            text: "Hi",
            bold: true,
            italic: true,
            underline: true,
            strikethrough: true,
            code: true,
            superscript: true,
          },
        ],
      },
    ]);

    const html = await serializeHtml(editor);
    const strong = html.match(/<strong\b[^>]*>([\s\S]*?)<\/strong>/);
    const em = html.match(/<em\b[^>]*>([\s\S]*?)<\/em>/);
    const underline = html.match(/<u\b[^>]*>([\s\S]*?)<\/u>/);
    const strikethrough = html.match(/<s\b[^>]*>([\s\S]*?)<\/s>/);
    const code = html.match(/<code\b[^>]*>([\s\S]*?)<\/code>/);
    const superscript = html.match(/<sup\b[^>]*>([\s\S]*?)<\/sup>/);

    expect(strong?.[1]).toContain("Hi");
    expect(em?.[1]).toContain("Hi");
    expect(underline?.[1]).toContain("Hi");
    expect(strikethrough?.[1]).toContain("Hi");
    expect(code?.[1]).toContain("Hi");
    expect(superscript?.[1]).toContain("Hi");
  });
});

function leafHasBothScripts(node: unknown): boolean {
  return field(node, "superscript") === true && field(node, "subscript") === true;
}

function hasBothScripts(editor: SlateEditor): boolean {
  const block = editor.children[0];
  if (!block) {
    return false;
  }

  return block.children.some((child) => leafHasBothScripts(child));
}

describe("superscript and subscript", () => {
  test("superscript and subscript use the plate mark keys", () => {
    expect(KEYS.sup).toBe("superscript");
    expect(KEYS.sub).toBe("subscript");
    expect(isAllowedMark(KEYS.sup)).toBe(true);
    expect(isAllowedMark(KEYS.sub)).toBe(true);
  });

  test("applying superscript to a subscript range removes subscript and sets superscript in one undo step", () => {
    const editor = createEditor([paragraph("H2O")]);
    editor.tf.select(textRange([0, 0], 0, 3));
    runEditorCommand(editor, formatSubscript, undefined);
    const undos = editor.history.undos.length;

    runEditorCommand(editor, formatSuperscript, undefined);

    expect(editor.history.undos.length - undos).toBe(1);
    expect(hasBothScripts(editor)).toBe(false);
    expect(editor.children[0]?.children).toEqual([{ text: "H2O", superscript: true }]);

    editor.tf.undo();

    expect(hasBothScripts(editor)).toBe(false);
    expect(editor.children[0]?.children).toEqual([{ text: "H2O", subscript: true }]);
  });

  test("applying superscript to a mixed subscript range marks the whole range and leaves no subscript", () => {
    const editor = createEditor([paragraph("H2O")]);
    editor.tf.select(textRange([0, 0], 0, 1));
    runEditorCommand(editor, formatSubscript, undefined);
    editor.tf.select({
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [0, 1], offset: 2 },
    });

    runEditorCommand(editor, formatSuperscript, undefined);

    expect(plainText(editor)).toBe("H2O");
    expect(hasBothScripts(editor)).toBe(false);
    expect(editor.children[0]?.children).toEqual([{ text: "H2O", superscript: true }]);
  });

  test("a caret inside subscript text makes the next typed text superscript and not subscript", () => {
    const editor = createEditor([paragraph("H2O")]);
    editor.tf.select(textRange([0, 0], 0, 3));
    runEditorCommand(editor, formatSubscript, undefined);
    editor.tf.select(caret([0, 0], 1));

    expect(markState(editor, formatSuperscript)).toBe("off");

    runEditorCommand(editor, formatSuperscript, undefined);
    editor.tf.insertText("x");

    expect(hasBothScripts(editor)).toBe(false);
    expect(editor.children[0]?.children).toEqual([
      { text: "H", subscript: true },
      { text: "x", superscript: true },
      { text: "2O", subscript: true },
    ]);
  });

  test("removing superscript never adds or removes subscript", () => {
    const both = createEditor([
      { type: "p", children: [{ text: "Hi", superscript: true, subscript: true }] },
    ]);
    both.tf.select(textRange([0, 0], 0, 2));

    runEditorCommand(both, formatSuperscript, undefined);

    expect(both.children[0]?.children).toEqual([{ text: "Hi", subscript: true }]);

    const only = createEditor([paragraph("Hi")]);
    only.tf.select(textRange([0, 0], 0, 2));
    runEditorCommand(only, formatSuperscript, undefined);

    runEditorCommand(only, formatSuperscript, undefined);

    expect(only.children[0]?.children).toEqual([{ text: "Hi" }]);
  });

  test("applying subscript to a superscript range removes superscript and sets subscript in one undo step", () => {
    const editor = createEditor([paragraph("H2O")]);
    editor.tf.select(textRange([0, 0], 0, 3));
    runEditorCommand(editor, formatSuperscript, undefined);
    const undos = editor.history.undos.length;

    runEditorCommand(editor, formatSubscript, undefined);

    expect(editor.history.undos.length - undos).toBe(1);
    expect(hasBothScripts(editor)).toBe(false);
    expect(editor.children[0]?.children).toEqual([{ text: "H2O", subscript: true }]);

    editor.tf.undo();

    expect(hasBothScripts(editor)).toBe(false);
    expect(editor.children[0]?.children).toEqual([{ text: "H2O", superscript: true }]);
  });

  test("applying subscript to a mixed superscript range marks the whole range and leaves no superscript", () => {
    const editor = createEditor([paragraph("H2O")]);
    editor.tf.select(textRange([0, 0], 0, 1));
    runEditorCommand(editor, formatSuperscript, undefined);
    editor.tf.select({
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [0, 1], offset: 2 },
    });

    runEditorCommand(editor, formatSubscript, undefined);

    expect(plainText(editor)).toBe("H2O");
    expect(hasBothScripts(editor)).toBe(false);
    expect(editor.children[0]?.children).toEqual([{ text: "H2O", subscript: true }]);
  });

  test("a caret inside superscript text makes the next typed text subscript and not superscript", () => {
    const editor = createEditor([paragraph("H2O")]);
    editor.tf.select(textRange([0, 0], 0, 3));
    runEditorCommand(editor, formatSuperscript, undefined);
    editor.tf.select(caret([0, 0], 1));

    expect(markState(editor, formatSubscript)).toBe("off");

    runEditorCommand(editor, formatSubscript, undefined);
    editor.tf.insertText("x");

    expect(hasBothScripts(editor)).toBe(false);
    expect(editor.children[0]?.children).toEqual([
      { text: "H", superscript: true },
      { text: "x", subscript: true },
      { text: "2O", superscript: true },
    ]);
  });

  test("removing subscript never adds or removes superscript", () => {
    const both = createEditor([
      { type: "p", children: [{ text: "Hi", superscript: true, subscript: true }] },
    ]);
    both.tf.select(textRange([0, 0], 0, 2));

    runEditorCommand(both, formatSubscript, undefined);

    expect(both.children[0]?.children).toEqual([{ text: "Hi", superscript: true }]);

    const only = createEditor([paragraph("Hi")]);
    only.tf.select(textRange([0, 0], 0, 2));
    runEditorCommand(only, formatSubscript, undefined);

    runEditorCommand(only, formatSubscript, undefined);

    expect(only.children[0]?.children).toEqual([{ text: "Hi" }]);
  });

  test("superscript then subscript then superscript never leaves both marks on one leaf", () => {
    const editor = createEditor([paragraph("H2O")]);
    editor.tf.select(textRange([0, 0], 0, 3));

    runEditorCommand(editor, formatSuperscript, undefined);

    expect(hasBothScripts(editor)).toBe(false);
    expect(editor.children[0]?.children).toEqual([{ text: "H2O", superscript: true }]);

    runEditorCommand(editor, formatSubscript, undefined);

    expect(hasBothScripts(editor)).toBe(false);
    expect(editor.children[0]?.children).toEqual([{ text: "H2O", subscript: true }]);

    runEditorCommand(editor, formatSuperscript, undefined);

    expect(hasBothScripts(editor)).toBe(false);
    expect(editor.children[0]?.children).toEqual([{ text: "H2O", superscript: true }]);
  });

  test("bold, italic, underline, strikethrough, code, superscript, and subscript round-trip as two leaves", () => {
    const document = createEditorDocument("doc-seven", [
      {
        type: "p",
        id: "p",
        children: [
          {
            text: "H",
            bold: true,
            italic: true,
            underline: true,
            strikethrough: true,
            code: true,
            superscript: true,
          },
          {
            text: "2",
            bold: true,
            italic: true,
            underline: true,
            strikethrough: true,
            code: true,
            subscript: true,
          },
        ],
      },
    ]);
    const serialized: unknown = JSON.parse(serializeEditorDocument(document));
    const parsed = expectOk(parseEditorDocument(serialized));
    const leaves = parsed.document.content[0]?.children ?? [];

    expect(parsed.repairs).toEqual([]);
    expect(parsed.document.content).toEqual(document.content);
    expect(leaves.some((leaf) => leafHasBothScripts(leaf))).toBe(false);
    expect(leaves.map((leaf) => leaf.text)).toEqual(["H", "2"]);
  });

  test("subscript renders as sub", async () => {
    const editor = createEditor([{ type: "p", children: [{ text: "2", subscript: true }] }]);

    const html = await serializeHtml(editor);
    const sub = html.match(/<sub\b[^>]*>([\s\S]*?)<\/sub>/);

    expect(sub?.[1]).toContain("2");
  });
});
