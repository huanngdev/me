import { describe, expect, test } from "bun:test";
import { type SlateEditor, type TElement } from "platejs";
import { Plate, PlateContent, createPlateEditor } from "platejs/react";
import { renderToStaticMarkup } from "react-dom/server";

import { BLOCKQUOTE_CLASS_NAME } from "./blockquote-element";
import {
  clearFormatting,
  getBlockType,
  runEditorCommand,
  setLineHeight,
  setTextAlign,
  turnIntoBlockquote,
  turnIntoHeading1,
} from "./editor-commands";
import { createEditorDocument } from "./editor-document";
import { allowedChildTypes } from "./editor-document-schema";
import { parseEditorDocument } from "./editor-document-validate";
import { createEditorPlugins } from "./editor-plugins";
import type { EditorValue } from "./editor-value";
import {
  blockIds,
  caret,
  createEditor,
  deserializeHtmlInDom,
  expectInvalid,
  expectOk,
  expectUnsupported,
  field,
  isRecord,
  texts,
} from "./test-utils";

function paragraph(
  text: string,
  id: string,
  extra: { align?: string; indent?: number; listStyleType?: string; lineHeight?: number } = {},
): TElement {
  return { type: "p", id, ...extra, children: [{ text }] };
}

function quote(id: string, children: TElement[]): TElement {
  return { type: "blockquote", id, children };
}

function childrenOf(node: unknown): unknown[] {
  if (!isRecord(node) || !Array.isArray(node.children)) {
    return [];
  }

  return node.children;
}

function nodeText(node: unknown): string {
  if (!isRecord(node)) {
    return "";
  }

  if (typeof node.text === "string" && !("children" in node)) {
    return node.text;
  }

  return childrenOf(node)
    .map((child) => nodeText(child))
    .join("");
}

function typesOf(editor: SlateEditor): string[] {
  return editor.children.map((block) => block.type);
}

function childIds(node: unknown): string[] {
  return childrenOf(node).map((child) => {
    const id = field(child, "id");
    return typeof id === "string" ? id : "";
  });
}

function renderQuote(value: EditorValue): string {
  const editor = createPlateEditor({
    plugins: createEditorPlugins(),
    value,
  });

  return renderToStaticMarkup(
    <Plate editor={editor}>
      <PlateContent />
    </Plate>,
  );
}

function pasteHtml(html: string): SlateEditor {
  const editor = createEditor();
  editor.tf.select(caret([0, 0], 0));
  editor.tf.insertFragment(deserializeHtmlInDom(editor, html));
  return editor;
}

// List HTML attrs are written by the list plugin's parser.transformData, which
// insertData runs before deserialize. Element-only deserialize skips that pass.
function pasteHtmlData(html: string): SlateEditor {
  const editor = createEditor();
  editor.tf.select(caret([0, 0], 0));
  const data = new DataTransfer();
  data.setData("text/html", html);
  editor.tf.insertData(data);
  return editor;
}

function documentOf(editor: SlateEditor) {
  return expectOk(parseEditorDocument(createEditorDocument("doc", editor.children)));
}

describe("blockquote schema", () => {
  test("childTypes allows paragraphs inside a quote and inline children everywhere else", () => {
    expect(allowedChildTypes("blockquote")).toEqual(["p"]);
    expect(allowedChildTypes("p")).toBeUndefined();
    expect(allowedChildTypes("h1")).toBeUndefined();
  });

  test("a quote with two paragraphs, marks, align, and a bullet round-trips", () => {
    const content = [
      quote("quote-1", [
        {
          type: "p",
          id: "para-1",
          align: "center",
          children: [{ text: "Hello ", bold: true }, { text: "there" }],
        },
        paragraph("Item", "para-2", { indent: 1, listStyleType: "disc" }),
      ]),
    ];
    const raw = createEditorDocument("doc-quote", content);

    const parsed = expectOk(parseEditorDocument(raw));

    expect(parsed.repairs).toEqual([]);
    expect(parsed.document.content).toEqual(content);
  });

  test("inline children are unsupported and the raw document is kept", () => {
    const raw = createEditorDocument("doc-inline", [
      { type: "blockquote", id: "quote-1", children: [{ text: "Quoted" }] },
    ]);

    const result = expectUnsupported(parseEditorDocument(raw));

    expect(result.issues[0]?.message).toContain("has inline children");
    expect(result.raw).toBe(raw);
  });

  test("an h1 child is unsupported and the raw document is kept", () => {
    const raw = createEditorDocument("doc-heading-child", [
      quote("quote-1", [{ type: "h1", id: "heading-1", children: [{ text: "Title" }] }]),
    ]);

    const result = expectUnsupported(parseEditorDocument(raw));

    expect(result.issues[0]?.message).toContain('has an unsupported child type "h1"');
    expect(result.raw).toBe(raw);
  });

  test("a nested quote is unsupported and the raw document is kept", () => {
    const raw = createEditorDocument("doc-nested", [
      quote("quote-1", [quote("quote-2", [paragraph("x", "para-1")])]),
    ]);

    const result = expectUnsupported(parseEditorDocument(raw));

    expect(result.issues[0]?.message).toContain('has an unsupported child type "blockquote"');
    expect(result.raw).toBe(raw);
  });

  test("a quote with no children is invalid and the raw document is kept", () => {
    const raw = createEditorDocument("doc-empty", [
      { type: "blockquote", id: "quote-1", children: [] },
    ]);

    const result = expectInvalid(parseEditorDocument(raw));

    expect(result.issues[0]?.message).toContain("has no children");
    expect(result.raw).toBe(raw);
  });

  test("a paragraph with a block child is unsupported and the raw document is kept", () => {
    const raw = createEditorDocument("doc-p-block", [
      {
        type: "p",
        id: "para-1",
        children: [{ type: "h1", id: "heading-1", children: [{ text: "Title" }] }],
      },
    ]);

    const result = expectUnsupported(parseEditorDocument(raw));

    expect(result.issues[0]?.message).toContain('has an unsupported child type "h1"');
    expect(result.raw).toBe(raw);
  });
});

describe("blockquote normalizer", () => {
  test("a nested quote is unwrapped so its paragraph lifts into the parent", () => {
    const editor = createEditor([quote("quote-1", [quote("quote-2", [paragraph("x", "para-1")])])]);
    editor.tf.normalize({ force: true });
    const container = editor.children[0];

    expect(typesOf(editor)).toEqual(["blockquote"]);
    expect(field(container, "id")).toBe("quote-1");
    expect(childrenOf(container).map((child) => field(child, "type"))).toEqual(["p"]);
    expect(childIds(container)).toEqual(["para-1"]);
    expect(nodeText(container)).toBe("x");
    expect(JSON.stringify(editor.children)).not.toContain("quote-2");
  });

  test("a heading inside a quote becomes a paragraph and keeps text, marks, id, and align", () => {
    const editor = createEditor([
      quote("quote-1", [
        {
          type: "h2",
          id: "heading-1",
          align: "right",
          url: "https://example.com",
          children: [{ text: "Title", bold: true }],
        },
      ]),
    ]);
    editor.tf.normalize({ force: true });
    const child = childrenOf(editor.children[0])[0];

    expect(field(child, "type")).toBe("p");
    expect(field(child, "id")).toBe("heading-1");
    expect(field(child, "align")).toBe("right");
    expect(field(child, "url")).toBeUndefined();
    expect(child && isRecord(child) ? child.children : undefined).toEqual([
      { text: "Title", bold: true },
    ]);
  });

  test("NodeId assigns an id to a quote and to its nested paragraph", () => {
    const editor = createEditor([
      { type: "blockquote", children: [{ type: "p", children: [{ text: "Hi" }] }] },
    ]);
    const quoteId = field(editor.children[0], "id");
    const paragraphId = field(childrenOf(editor.children[0])[0], "id");

    expect(typeof quoteId).toBe("string");
    expect(quoteId).not.toBe("");
    expect(typeof paragraphId).toBe("string");
    expect(paragraphId).not.toBe("");
    expect(paragraphId).not.toBe(quoteId);
  });
});

describe("blockquote rendering", () => {
  test("a quote renders as a blockquote with a left border and no italic", () => {
    const html = renderQuote([
      quote("quote-1", [paragraph("One", "para-1"), paragraph("Two", "para-2")]),
    ]);

    expect(html).toContain("<blockquote");
    expect(html).toContain("One");
    expect(html).toContain("Two");
    for (const token of BLOCKQUOTE_CLASS_NAME.split(" ")) {
      expect(html).toContain(token);
    }
    expect(html).not.toContain("italic");
  });

  test("list items inside a quote use the shared sibling gap rule", () => {
    const html = renderQuote([
      quote("quote-1", [
        paragraph("One", "para-1", { indent: 1, listStyleType: "disc" }),
        paragraph("Two", "para-2", { indent: 1, listStyleType: "disc" }),
      ]),
    ]);
    const open = html.match(/<blockquote[^>]*>/)?.[0] ?? "";

    expect(html).toContain('data-list-item="disc"');
    expect(open).toContain("data-list-item]:has(+[data-list-item])]:mb-1");
  });
});

describe("turn into quote", () => {
  test("wraps the selected blocks into one quote, turns a heading into a paragraph, and keeps a list", () => {
    const editor = createEditor([
      {
        type: "h2",
        id: "heading-1",
        align: "center",
        children: [{ text: "Title", bold: true }],
      },
      paragraph("Next", "para-2"),
      paragraph("Item", "para-3", { indent: 1, listStyleType: "disc" }),
    ]);
    editor.tf.select({
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [2, 0], offset: 1 },
    });
    const before = editor.history.undos.length;

    expect(runEditorCommand(editor, turnIntoBlockquote, undefined)).toBe(true);

    const container = editor.children[0];
    const [first, second, third] = childrenOf(container);
    expect(typesOf(editor)).toEqual(["blockquote"]);
    expect(field(container, "id")).not.toBe("heading-1");
    expect(field(container, "id")).not.toBe("");
    expect(childrenOf(container).map((child) => field(child, "type"))).toEqual(["p", "p", "p"]);
    expect(childIds(container)).toEqual(["heading-1", "para-2", "para-3"]);
    expect(field(first, "align")).toBe("center");
    expect(first && isRecord(first) ? first.children : undefined).toEqual([
      { text: "Title", bold: true },
    ]);
    expect(nodeText(second)).toBe("Next");
    expect(field(third, "listStyleType")).toBe("disc");
    expect(field(third, "indent")).toBe(1);
    expect(editor.history.undos.length - before).toBe(1);

    editor.tf.undo();

    expect(typesOf(editor)).toEqual(["h2", "p", "p"]);
    expect(blockIds(editor)).toEqual(["heading-1", "para-2", "para-3"]);
  });

  test("a selection inside a quote unwraps every selected paragraph", () => {
    const editor = createEditor([
      quote("quote-1", [paragraph("One", "para-1"), paragraph("Two", "para-2")]),
    ]);
    editor.tf.select({
      anchor: { path: [0, 0, 0], offset: 0 },
      focus: { path: [0, 1, 0], offset: 3 },
    });

    runEditorCommand(editor, turnIntoBlockquote, undefined);

    expect(typesOf(editor)).toEqual(["p", "p"]);
    expect(blockIds(editor)).toEqual(["para-1", "para-2"]);
    expect(texts(editor)).toEqual(["One", "Two"]);
  });

  test("a partial selection splits the quote around the lifted paragraph", () => {
    const editor = createEditor([
      quote("quote-1", [
        paragraph("One", "para-1"),
        paragraph("Two", "para-2"),
        paragraph("Three", "para-3"),
      ]),
    ]);
    editor.tf.select(caret([0, 1, 0], 0));

    runEditorCommand(editor, turnIntoBlockquote, undefined);

    expect(typesOf(editor)).toEqual(["blockquote", "p", "blockquote"]);
    expect(field(editor.children[0], "id")).toBe("quote-1");
    expect(childIds(editor.children[0])).toEqual(["para-1"]);
    expect(blockIds(editor)[1]).toBe("para-2");
    expect(nodeText(editor.children[1])).toBe("Two");
    expect(childIds(editor.children[2])).toEqual(["para-3"]);
    expect(nodeText(editor.children[0])).toBe("One");
    expect(nodeText(editor.children[2])).toBe("Three");
  });

  test("a read-only editor refuses turn into quote", () => {
    const editor = createEditor([paragraph("Hello", "para-1")]);
    editor.tf.select(caret([0, 0], 1));
    const undos = editor.history.undos.length;

    expect(runEditorCommand(editor, turnIntoBlockquote, undefined, { readOnly: true })).toBe(false);
    expect(typesOf(editor)).toEqual(["p"]);
    expect(editor.history.undos.length).toBe(undos);
  });
});

describe("blockquote getBlockType", () => {
  test("a paragraph inside a quote reports blockquote, and a list inside a quote reports the list", () => {
    const editor = createEditor([
      quote("quote-1", [
        paragraph("Said", "para-1"),
        paragraph("Item", "para-2", { indent: 1, listStyleType: "disc" }),
      ]),
      paragraph("After", "para-3"),
    ]);

    editor.tf.select(caret([0, 0, 0], 1));
    expect(getBlockType(editor)).toBe("blockquote");

    editor.tf.select(caret([0, 1, 0], 1));
    expect(getBlockType(editor)).toBe("bulleted-list");

    editor.tf.select({
      anchor: { path: [0, 0, 0], offset: 1 },
      focus: { path: [0, 1, 0], offset: 1 },
    });
    expect(getBlockType(editor)).toBe("mixed");

    editor.tf.select({
      anchor: { path: [0, 0, 0], offset: 1 },
      focus: { path: [1, 0], offset: 1 },
    });
    expect(getBlockType(editor)).toBe("mixed");
  });
});

describe("blockquote commands inside a quote", () => {
  test("turning a quote paragraph into a heading lifts it out and the document validates", () => {
    const editor = createEditor([
      quote("quote-1", [
        {
          type: "p",
          id: "para-1",
          align: "center",
          lineHeight: 2,
          children: [{ text: "Hello", bold: true }],
        },
        paragraph("Next", "para-2"),
      ]),
    ]);
    editor.tf.select(caret([0, 0, 0], 1));

    runEditorCommand(editor, turnIntoHeading1, undefined);

    expect(typesOf(editor)).toEqual(["h1", "blockquote"]);
    expect(field(editor.children[0], "id")).toBe("para-1");
    expect(field(editor.children[0], "align")).toBe("center");
    expect(field(editor.children[0], "lineHeight")).toBeUndefined();
    expect(editor.children[0]?.children[0]).toEqual({ text: "Hello", bold: true });
    expect(childIds(editor.children[1])).toEqual(["para-2"]);
    expect(documentOf(editor).repairs).toEqual([]);
  });

  test("clear formatting removes marks on the quote paragraph and leaves the container alone", () => {
    const editor = createEditor([
      quote("quote-1", [{ type: "p", id: "para-1", children: [{ text: "Hello", bold: true }] }]),
    ]);
    editor.tf.select({
      anchor: { path: [0, 0, 0], offset: 0 },
      focus: { path: [0, 0, 0], offset: 5 },
    });

    runEditorCommand(editor, clearFormatting, undefined);

    const child = childrenOf(editor.children[0])[0];
    expect(field(editor.children[0], "type")).toBe("blockquote");
    expect(isRecord(child) ? child.children : undefined).toEqual([{ text: "Hello" }]);
  });

  test("align and line height change the quote paragraph and not the container", () => {
    const editor = createEditor([quote("quote-1", [paragraph("Hello", "para-1")])]);
    editor.tf.select(caret([0, 0, 0], 1));

    runEditorCommand(editor, setTextAlign, "center");
    runEditorCommand(editor, setLineHeight, 2);

    const child = childrenOf(editor.children[0])[0];
    expect(field(editor.children[0], "align")).toBeUndefined();
    expect(field(editor.children[0], "lineHeight")).toBeUndefined();
    expect(field(child, "align")).toBe("center");
    expect(field(child, "lineHeight")).toBe(2);
  });
});

describe("blockquote keyboard", () => {
  test("Enter at the end of a paragraph inserts a paragraph inside the quote", () => {
    const editor = createEditor([quote("quote-1", [paragraph("Hello", "para-1")])]);
    editor.tf.select(caret([0, 0, 0], 5));

    editor.tf.insertBreak();

    expect(typesOf(editor)).toEqual(["blockquote"]);
    expect(childrenOf(editor.children[0]).map((child) => nodeText(child))).toEqual(["Hello", ""]);
    expect(childIds(editor.children[0])[0]).toBe("para-1");
    expect(childIds(editor.children[0])[1]).not.toBe("para-1");
    expect(childIds(editor.children[0])[1]).not.toBe("");
  });

  test("Enter on the last empty paragraph lifts it out after the quote", () => {
    const editor = createEditor([
      quote("quote-1", [paragraph("Hello", "para-1"), paragraph("", "para-2")]),
    ]);
    editor.tf.select(caret([0, 1, 0], 0));

    editor.tf.insertBreak();

    expect(typesOf(editor)).toEqual(["blockquote", "p"]);
    expect(childIds(editor.children[0])).toEqual(["para-1"]);
    expect(nodeText(editor.children[0])).toBe("Hello");
    expect(field(editor.children[1], "id")).toBe("para-2");
    expect(nodeText(editor.children[1])).toBe("");
  });

  test("Enter on an empty paragraph in the middle splits the quote", () => {
    const editor = createEditor([
      quote("quote-1", [
        paragraph("One", "para-1"),
        paragraph("", "para-2"),
        paragraph("Three", "para-3"),
      ]),
    ]);
    editor.tf.select(caret([0, 1, 0], 0));

    editor.tf.insertBreak();

    expect(typesOf(editor)).toEqual(["blockquote", "p", "blockquote"]);
    expect(field(editor.children[0], "id")).toBe("quote-1");
    expect(childIds(editor.children[0])).toEqual(["para-1"]);
    expect(field(editor.children[1], "id")).toBe("para-2");
    expect(nodeText(editor.children[1])).toBe("");
    expect(childIds(editor.children[2])).toEqual(["para-3"]);
  });

  test("Shift+Enter inserts a soft break inside the quote paragraph", () => {
    const editor = createEditor([quote("quote-1", [paragraph("Hello", "para-1")])]);
    editor.tf.select(caret([0, 0, 0], 5));

    editor.tf.insertSoftBreak();

    expect(typesOf(editor)).toEqual(["blockquote"]);
    expect(childIds(editor.children[0])).toEqual(["para-1"]);
    expect(nodeText(editor.children[0])).toBe("Hello\n");
  });

  test("Backspace at the start of the first non-empty paragraph lifts it out", () => {
    const editor = createEditor([
      quote("quote-1", [paragraph("Hello", "para-1"), paragraph("Next", "para-2")]),
    ]);
    editor.tf.select(caret([0, 0, 0], 0));

    editor.tf.deleteBackward();

    expect(typesOf(editor)).toEqual(["p", "blockquote"]);
    expect(field(editor.children[0], "id")).toBe("para-1");
    expect(nodeText(editor.children[0])).toBe("Hello");
    expect(field(editor.children[1], "id")).toBe("quote-1");
    expect(childIds(editor.children[1])).toEqual(["para-2"]);
  });

  test("Backspace at the start of the first empty paragraph lifts it out", () => {
    const editor = createEditor([
      quote("quote-1", [paragraph("", "para-1"), paragraph("Next", "para-2")]),
    ]);
    editor.tf.select(caret([0, 0, 0], 0));

    editor.tf.deleteBackward();

    expect(typesOf(editor)).toEqual(["p", "blockquote"]);
    expect(field(editor.children[0], "id")).toBe("para-1");
    expect(nodeText(editor.children[0])).toBe("");
    expect(childIds(editor.children[1])).toEqual(["para-2"]);
  });

  test("Backspace at the start of a later paragraph merges it into the previous one", () => {
    const editor = createEditor([
      quote("quote-1", [paragraph("Hello", "para-1"), paragraph("Next", "para-2")]),
    ]);
    editor.tf.select(caret([0, 1, 0], 0));

    editor.tf.deleteBackward();

    expect(typesOf(editor)).toEqual(["blockquote"]);
    expect(field(editor.children[0], "id")).toBe("quote-1");
    expect(childIds(editor.children[0])).toEqual(["para-1"]);
    expect(nodeText(editor.children[0])).toBe("HelloNext");
  });

  test("Enter at the start of a non-empty quote paragraph inserts an empty paragraph above it", () => {
    const editor = createEditor([quote("quote-1", [paragraph("Hello", "para-1")])]);
    editor.tf.select(caret([0, 0, 0], 0));

    editor.tf.insertBreak();

    expect(typesOf(editor)).toEqual(["blockquote"]);
    expect(childrenOf(editor.children[0]).map((child) => nodeText(child))).toEqual(["", "Hello"]);
    expect(childIds(editor.children[0])[1]).toBe("para-1");
    expect(childIds(editor.children[0])[0]).not.toBe("para-1");
    expect(childIds(editor.children[0])[0]).not.toBe("");
  });

  test("Tab nests a list item inside a quote and does nothing in a plain quote paragraph", () => {
    const listed = createEditor([
      quote("quote-1", [paragraph("Item", "para-1", { indent: 1, listStyleType: "disc" })]),
    ]);
    listed.tf.select(caret([0, 0, 0], 1));

    expect(listed.tf.tab({ reverse: false })).toBe(true);

    const item = childrenOf(listed.children[0])[0];
    expect(typesOf(listed)).toEqual(["blockquote"]);
    expect(field(item, "indent")).toBe(2);
    expect(field(item, "listStyleType")).toBe("disc");
    expect(field(item, "id")).toBe("para-1");

    const plain = createEditor([quote("quote-1", [paragraph("Hello", "para-1")])]);
    plain.tf.select(caret([0, 0, 0], 1));

    expect(plain.tf.tab({ reverse: false })).toBe(false);
    expect(typesOf(plain)).toEqual(["blockquote"]);
    expect(childIds(plain.children[0])).toEqual(["para-1"]);
    expect(nodeText(plain.children[0])).toBe("Hello");
  });

  test("typing > does not turn a paragraph into a quote", () => {
    const editor = createEditor([paragraph("Hello", "para-1")]);
    editor.tf.select(caret([0, 0], 0));
    editor.tf.insertText("> ");
    editor.tf.select(caret([0, 0], 4));
    editor.tf.insertText(">");

    expect(typesOf(editor)).toEqual(["p"]);
    expect(texts(editor)).toEqual(["> He>llo"]);
    expect(editor.meta.shortcuts["blockquote.toggle"]).toBeUndefined();
  });
});

describe("blockquote paste", () => {
  test("a blockquote with text becomes a quote with one paragraph", () => {
    const editor = pasteHtml("<blockquote>Quote</blockquote>");
    const child = childrenOf(editor.children[0])[0];

    expect(typesOf(editor)).toEqual(["blockquote"]);
    expect(field(child, "type")).toBe("p");
    expect(nodeText(child)).toBe("Quote");
  });

  test("a blockquote with two paragraphs stays two paragraphs", () => {
    const editor = pasteHtml("<blockquote><p>a</p><p>b</p></blockquote>");

    expect(typesOf(editor)).toEqual(["blockquote"]);
    expect(childrenOf(editor.children[0]).map((child) => nodeText(child))).toEqual(["a", "b"]);
    expect(childrenOf(editor.children[0]).map((child) => field(child, "type"))).toEqual(["p", "p"]);
  });

  test("a nested blockquote pastes as one flat quote", () => {
    const editor = pasteHtml("<blockquote><blockquote>x</blockquote></blockquote>");

    expect(typesOf(editor)).toEqual(["blockquote"]);
    expect(childrenOf(editor.children[0]).map((child) => field(child, "type"))).toEqual(["p"]);
    expect(nodeText(editor.children[0])).toBe("x");
  });

  test("a heading inside a pasted quote becomes a paragraph and the text is kept", () => {
    const editor = pasteHtml("<blockquote><h2>t</h2><p>b</p></blockquote>");

    expect(typesOf(editor)).toEqual(["blockquote"]);
    expect(childrenOf(editor.children[0]).map((child) => field(child, "type"))).toEqual(["p", "p"]);
    expect(childrenOf(editor.children[0]).map((child) => nodeText(child))).toEqual(["t", "b"]);
  });

  test("a list inside a pasted quote becomes a disc list paragraph", () => {
    const editor = pasteHtmlData("<blockquote><ul><li>a</li></ul></blockquote>");
    const child = childrenOf(editor.children[0])[0];

    expect(typesOf(editor)).toEqual(["blockquote"]);
    expect(field(child, "type")).toBe("p");
    expect(field(child, "listStyleType")).toBe("disc");
    expect(nodeText(child)).toBe("a");
  });

  test("an editor fragment keeps the quote and regenerates an id the document already uses", () => {
    const fragment = [
      quote("quote-1", [paragraph("Kept", "inner-a"), paragraph("Also", "inner-b")]),
    ];
    const fresh = createEditor();
    fresh.tf.select(caret([0, 0], 0));
    fresh.tf.insertFragment(structuredClone(fragment));

    expect(typesOf(fresh)).toEqual(["blockquote"]);
    expect(field(fresh.children[0], "id")).toBe("quote-1");
    expect(childIds(fresh.children[0])).toEqual(["inner-a", "inner-b"]);

    const taken = createEditor([paragraph("Already", "inner-a"), paragraph("", "empty")]);
    taken.tf.select(caret([1, 0], 0));
    taken.tf.insertFragment(structuredClone(fragment));
    const pastedQuote = taken.children.find((block) => block.type === "blockquote");
    const ids = [
      field(taken.children[0], "id"),
      ...childIds(pastedQuote),
      field(pastedQuote, "id"),
    ];

    expect(field(pastedQuote, "type")).toBe("blockquote");
    expect(childIds(pastedQuote)).not.toContain("inner-a");
    expect(childIds(pastedQuote)).toContain("inner-b");
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("plain text that starts with > stays text", () => {
    const editor = createEditor([paragraph("", "para-1")]);
    editor.tf.select(caret([0, 0], 0));
    editor.tf.insertText("> a");

    expect(typesOf(editor)).toEqual(["p"]);
    expect(texts(editor)).toEqual(["> a"]);
  });
});
