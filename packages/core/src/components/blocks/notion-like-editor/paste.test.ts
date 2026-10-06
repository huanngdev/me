import { describe, expect, test } from "bun:test";
import type { SlateEditor, TElement } from "platejs";

import { createEditorDocument } from "./editor-document";
import {
  allowedElementAttrs,
  isAllowedElementAttrValue,
  isAllowedMark,
} from "./editor-document-schema";
import { parseEditorDocument } from "./editor-document-validate";
import { sanitizePastedFragment } from "./editor-paste";
import { PASTE_SLATE_FRAGMENT } from "./fixtures/paste-slate-fragment";
import { PASTE_WORD_NOTION } from "./fixtures/paste-word-notion";
import {
  blockIds,
  caret,
  createEditor,
  deserializeHtmlInDom,
  field,
  plainText,
  texts,
} from "./test-utils";

function paste(fragment: TElement[]): SlateEditor {
  const editor = createEditor();
  editor.tf.select(caret([0, 0], 0));
  editor.tf.insertFragment(fragment);
  return editor;
}

function pasteHtml(html: string): SlateEditor {
  const editor = createEditor();
  editor.tf.select(caret([0, 0], 0));
  editor.tf.insertFragment(deserializeHtmlInDom(editor, html));
  return editor;
}

function allowlisted(value: unknown): boolean {
  if (typeof value !== "object" || value === null) {
    return true;
  }

  if ("text" in value && typeof value.text === "string" && !("children" in value)) {
    for (const key of Object.keys(value)) {
      if (key !== "text" && !isAllowedMark(key)) {
        return false;
      }
    }

    return true;
  }

  if (!("children" in value) || !Array.isArray(value.children)) {
    return true;
  }

  const type = "type" in value && typeof value.type === "string" ? value.type : "";
  const allowed = allowedElementAttrs(type);
  if (allowed === undefined) {
    return false;
  }

  for (const key of Object.keys(value)) {
    if (key === "type" || key === "children" || key === "id") {
      continue;
    }

    if (!allowed.has(key) || !isAllowedElementAttrValue(type, key, field(value, key))) {
      return false;
    }
  }

  return value.children.every((child) => allowlisted(child));
}

function markedText(editor: SlateEditor, mark: string): string[] {
  const pieces: string[] = [];
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const child of node) {
        visit(child);
      }
      return;
    }

    if (typeof node !== "object" || node === null) {
      return;
    }

    if ("text" in node && typeof node.text === "string" && !("children" in node)) {
      if (field(node, mark) === true) {
        pieces.push(node.text);
      }
      return;
    }

    if ("children" in node && Array.isArray(node.children)) {
      for (const child of node.children) {
        visit(child);
      }
    }
  };

  visit(editor.children);
  return pieces;
}

function expectOpenable(editor: SlateEditor): void {
  const parsed = parseEditorDocument(createEditorDocument("demo", editor.children));
  const ids = blockIds(editor);
  const unique = new Set(ids).size === ids.length;
  const present = ids.every((id) => id.length > 0);

  expect(parsed.status).toBe("ok");
  expect(allowlisted(editor.children)).toBe(true);
  expect(unique).toBe(true);
  expect(present).toBe(true);
}

const GOOGLE_DOCS_HTML =
  '<b style="font-weight:normal" id="docs-internal-guid-abc"><p><span style="font-weight:700">Bold</span><span style="font-weight:400"> and </span><span style="font-style:italic">italic</span></p><p>Second line</p></b>';

const WEBPAGE_HTML =
  '<h1>Title</h1><p>Para with <strong>bold</strong> and <a href="https://example.com">link</a></p><ul><li>One</li><li>Two</li></ul>';

describe("paste", () => {
  test("pasting Google Docs HTML marks the bold word and the italic word", () => {
    const editor = pasteHtml(GOOGLE_DOCS_HTML);

    expect(texts(editor)).toEqual(["Bold and italic", "Second line"]);
    expect(markedText(editor, "bold")).toEqual(["Bold"]);
    expect(markedText(editor, "italic")).toEqual(["italic"]);
    expectOpenable(editor);
  });

  test("pasting a web page keeps the heading, paragraph, and each list item", () => {
    const editor = pasteHtml(WEBPAGE_HTML);

    expect(texts(editor)).toEqual(["Title", "Para with bold and link", "One", "Two"]);
    expect(markedText(editor, "bold")).toEqual(["bold"]);
    expect(editor.children.map((block) => block.type)).toEqual(["h1", "p", "p", "p"]);
    expectOpenable(editor);
  });

  test("pasting strong makes only that text bold", () => {
    const editor = pasteHtml("<p>a <strong>b</strong> c</p>");

    expect(plainText(editor)).toBe("a b c");
    expect(markedText(editor, "bold")).toEqual(["b"]);
  });

  test("pasting b makes only that text bold", () => {
    const editor = pasteHtml("<p>a <b>b</b> c</p>");

    expect(plainText(editor)).toBe("a b c");
    expect(markedText(editor, "bold")).toEqual(["b"]);
  });

  test("pasting font-weight 700 makes only that text bold", () => {
    const editor = pasteHtml('<p>a <span style="font-weight:700">b</span> c</p>');

    expect(plainText(editor)).toBe("a b c");
    expect(markedText(editor, "bold")).toEqual(["b"]);
  });

  test("pasting font-weight bold makes only that text bold", () => {
    const editor = pasteHtml('<p>a <span style="font-weight:bold">b</span> c</p>');

    expect(plainText(editor)).toBe("a b c");
    expect(markedText(editor, "bold")).toEqual(["b"]);
  });

  test("a Google Docs font-weight normal wrapper does not bold the clipboard", () => {
    const editor = pasteHtml(GOOGLE_DOCS_HTML);

    expect(plainText(editor)).toBe("Bold and italicSecond line");
    expect(markedText(editor, "bold")).toEqual(["Bold"]);
    expect(markedText(editor, "italic")).toEqual(["italic"]);
  });

  test("pasting em makes only that text italic", () => {
    const editor = pasteHtml("<p>a <em>b</em> c</p>");

    expect(plainText(editor)).toBe("a b c");
    expect(markedText(editor, "italic")).toEqual(["b"]);
  });

  test("pasting i makes only that text italic", () => {
    const editor = pasteHtml("<p>a <i>b</i> c</p>");

    expect(plainText(editor)).toBe("a b c");
    expect(markedText(editor, "italic")).toEqual(["b"]);
  });

  test("pasting font-style italic makes only that text italic", () => {
    const editor = pasteHtml('<p>a <span style="font-style:italic">b</span> c</p>');

    expect(plainText(editor)).toBe("a b c");
    expect(markedText(editor, "italic")).toEqual(["b"]);
  });

  test("an em with font-style normal stays plain", () => {
    const editor = pasteHtml('<p>a <em style="font-style:normal">b</em> c</p>');

    expect(plainText(editor)).toBe("a b c");
    expect(markedText(editor, "italic")).toEqual([]);
  });

  test("a font-style italic wrapper with a font-style normal child stays plain", () => {
    const editor = pasteHtml(
      '<p>a <span style="font-style:italic"><span style="font-style:normal">b</span></span> c</p>',
    );

    expect(plainText(editor)).toBe("a b c");
    expect(markedText(editor, "italic")).toEqual([]);
  });

  test("a font-style normal ancestor leaves an em child italic", () => {
    const editor = pasteHtml('<p>a <span style="font-style:normal"><em>b</em></span> c</p>');

    expect(plainText(editor)).toBe("a b c");
    expect(markedText(editor, "italic")).toEqual(["b"]);
  });

  test("pasting u makes only that text underlined", () => {
    const editor = pasteHtml("<p>a <u>b</u> c</p>");

    expect(plainText(editor)).toBe("a b c");
    expect(markedText(editor, "underline")).toEqual(["b"]);
  });

  test("pasting text-decoration underline makes only that text underlined", () => {
    const editor = pasteHtml('<p>a <span style="text-decoration: underline">b</span> c</p>');

    expect(plainText(editor)).toBe("a b c");
    expect(markedText(editor, "underline")).toEqual(["b"]);
  });

  test("pasting a Google Docs underline span makes only that text underlined", () => {
    const editor = pasteHtml('<p>a <span style="text-decoration:underline">b</span> c</p>');

    expect(plainText(editor)).toBe("a b c");
    expect(markedText(editor, "underline")).toEqual(["b"]);
  });

  test("pasting an anchor unwraps to plain text without an underline", () => {
    const editor = pasteHtml('<p><a href="https://example.com">x</a></p>');
    const serialized = JSON.stringify(editor.children);

    expect(plainText(editor)).toBe("x");
    expect(markedText(editor, "underline")).toEqual([]);
    expect(serialized).not.toContain("underline");
    expect(serialized).not.toContain("example.com");
  });

  test("pasting an underlined word beside a link underlines only the word", () => {
    const editor = pasteHtml('<p>a <u>b</u> <a href="https://example.com">c</a></p>');

    expect(plainText(editor)).toBe("a b c");
    expect(markedText(editor, "underline")).toEqual(["b"]);
  });

  test("pasting underline and line-through marks that text with both", () => {
    const editor = pasteHtml(
      '<p>a <span style="text-decoration: underline line-through">b</span> c</p>',
    );

    expect(plainText(editor)).toBe("a b c");
    expect(markedText(editor, "underline")).toEqual(["b"]);
    expect(markedText(editor, "strikethrough")).toEqual(["b"]);
  });

  test("pasting line-through and underline marks that text with both", () => {
    const editor = pasteHtml(
      '<p>a <span style="text-decoration: line-through underline">b</span> c</p>',
    );

    expect(plainText(editor)).toBe("a b c");
    expect(markedText(editor, "underline")).toEqual(["b"]);
    expect(markedText(editor, "strikethrough")).toEqual(["b"]);
  });

  test("pasting text-decoration-line underline makes only that text underlined", () => {
    const editor = pasteHtml('<p>a <span style="text-decoration-line: underline">b</span> c</p>');

    expect(plainText(editor)).toBe("a b c");
    expect(markedText(editor, "underline")).toEqual(["b"]);
    expect(markedText(editor, "strikethrough")).toEqual([]);
  });

  test("pasting text-decoration-line underline and line-through marks that text with both", () => {
    const editor = pasteHtml(
      '<p>a <span style="text-decoration-line: underline line-through">b</span> c</p>',
    );

    expect(plainText(editor)).toBe("a b c");
    expect(markedText(editor, "underline")).toEqual(["b"]);
    expect(markedText(editor, "strikethrough")).toEqual(["b"]);
  });

  test("pasting text-decoration-line line-through and underline marks that text with both", () => {
    const editor = pasteHtml(
      '<p>a <span style="text-decoration-line: line-through underline">b</span> c</p>',
    );

    expect(plainText(editor)).toBe("a b c");
    expect(markedText(editor, "underline")).toEqual(["b"]);
    expect(markedText(editor, "strikethrough")).toEqual(["b"]);
  });

  test("a u with text-decoration none stays plain", () => {
    const editor = pasteHtml('<p>a <u style="text-decoration: none">b</u> c</p>');

    expect(plainText(editor)).toBe("a b c");
    expect(markedText(editor, "underline")).toEqual([]);
  });

  test("a u with text-decoration-line none stays plain", () => {
    const editor = pasteHtml('<p>a <u style="text-decoration-line: none">b</u> c</p>');

    expect(plainText(editor)).toBe("a b c");
    expect(markedText(editor, "underline")).toEqual([]);
  });

  test("pasting s makes only that text strikethrough", () => {
    const editor = pasteHtml("<p>a <s>b</s> c</p>");

    expect(plainText(editor)).toBe("a b c");
    expect(markedText(editor, "strikethrough")).toEqual(["b"]);
    expect(markedText(editor, "underline")).toEqual([]);
  });

  test("pasting del makes only that text strikethrough", () => {
    const editor = pasteHtml("<p>a <del>b</del> c</p>");

    expect(plainText(editor)).toBe("a b c");
    expect(markedText(editor, "strikethrough")).toEqual(["b"]);
  });

  test("pasting strike makes only that text strikethrough", () => {
    const editor = pasteHtml("<p>a <strike>b</strike> c</p>");

    expect(plainText(editor)).toBe("a b c");
    expect(markedText(editor, "strikethrough")).toEqual(["b"]);
  });

  test("pasting text-decoration line-through makes only that text strikethrough", () => {
    const editor = pasteHtml('<p>a <span style="text-decoration: line-through">b</span> c</p>');

    expect(plainText(editor)).toBe("a b c");
    expect(markedText(editor, "strikethrough")).toEqual(["b"]);
    expect(markedText(editor, "underline")).toEqual([]);
  });

  test("pasting text-decoration-line line-through makes only that text strikethrough", () => {
    const editor = pasteHtml(
      '<p>a <span style="text-decoration-line: line-through">b</span> c</p>',
    );

    expect(plainText(editor)).toBe("a b c");
    expect(markedText(editor, "strikethrough")).toEqual(["b"]);
    expect(markedText(editor, "underline")).toEqual([]);
  });

  test("an s with text-decoration none stays plain", () => {
    const editor = pasteHtml('<p>a <s style="text-decoration: none">b</s> c</p>');

    expect(plainText(editor)).toBe("a b c");
    expect(markedText(editor, "strikethrough")).toEqual([]);
  });

  test("pasting code makes only that text code", () => {
    const editor = pasteHtml("<p>a <code>b&lt;c</code> d</p>");

    expect(plainText(editor)).toBe("a b<c d");
    expect(markedText(editor, "code")).toEqual(["b<c"]);
    expect(editor.children.every((block) => block.type === "p")).toBe(true);
  });

  test("pasting font-family Consolas makes only that text code", () => {
    const editor = pasteHtml('<p>a <span style="font-family: Consolas">b</span> c</p>');

    expect(plainText(editor)).toBe("a b c");
    expect(markedText(editor, "code")).toEqual(["b"]);
  });

  test("pasting font-family monospace stays plain", () => {
    const editor = pasteHtml('<p>a <span style="font-family: monospace">b</span> c</p>');

    expect(plainText(editor)).toBe("a b c");
    expect(markedText(editor, "code")).toEqual([]);
  });

  test("pasting a pre code block with two lines becomes one paragraph without a code mark", () => {
    const editor = pasteHtml("<pre><code>one<br>two</code></pre>");
    const serialized = JSON.stringify(editor.children);

    expect(texts(editor)).toEqual(["one\ntwo"]);
    expect(editor.children.every((block) => block.type === "p")).toBe(true);
    expect(markedText(editor, "code")).toEqual([]);
    expect(serialized).not.toContain("code_block");
  });

  test("pasting sup makes only that text superscript", () => {
    const editor = pasteHtml("<p>x<sup>2</sup></p>");

    expect(plainText(editor)).toBe("x2");
    expect(markedText(editor, "superscript")).toEqual(["2"]);
  });

  test("pasting vertical-align super makes only that text superscript", () => {
    const editor = pasteHtml('<p>x<span style="vertical-align: super">2</span></p>');

    expect(plainText(editor)).toBe("x2");
    expect(markedText(editor, "superscript")).toEqual(["2"]);
  });

  test("pasting vertical-align sub makes only that text subscript", () => {
    const editor = pasteHtml('<p>x<span style="vertical-align: sub">2</span></p>');

    expect(plainText(editor)).toBe("x2");
    expect(markedText(editor, "subscript")).toEqual(["2"]);
    expect(markedText(editor, "superscript")).toEqual([]);
  });

  test("pasting sub makes only that text subscript", () => {
    const editor = pasteHtml("<p>x<sub>2</sub></p>");

    expect(plainText(editor)).toBe("x2");
    expect(markedText(editor, "subscript")).toEqual(["2"]);
    expect(markedText(editor, "superscript")).toEqual([]);
  });

  test("pasting sub and sup in one paragraph marks each character", () => {
    const editor = pasteHtml("<p>H<sub>2</sub>O and x<sup>2</sup></p>");

    expect(plainText(editor)).toBe("H2O and x2");
    expect(markedText(editor, "subscript")).toEqual(["2"]);
    expect(markedText(editor, "superscript")).toEqual(["2"]);
  });

  test("pasting kbd stays plain text", () => {
    const editor = pasteHtml("<p>a <kbd>b</kbd> c</p>");
    const serialized = JSON.stringify(editor.children);

    expect(plainText(editor)).toBe("a b c");
    expect(markedText(editor, "code")).toEqual([]);
    expect(serialized).not.toContain('"kbd"');
    expect(editor.children.every((block) => block.type === "p")).toBe(true);
  });

  test("an s with text-decoration-line none stays plain", () => {
    const editor = pasteHtml('<p>a <s style="text-decoration-line: none">b</s> c</p>');

    expect(plainText(editor)).toBe("a b c");
    expect(markedText(editor, "strikethrough")).toEqual([]);
  });

  test("pasting Word or Notion HTML keeps each div and turns br into a newline", () => {
    const editor = paste(structuredClone(PASTE_WORD_NOTION));

    expect(texts(editor)).toEqual(["Hello bold\nnext line", "Nested inner", "Sibling div"]);
    expectOpenable(editor);
  });

  test("pasting this editor's fragment keeps paragraphs, hard breaks, and source ids", () => {
    const editor = paste(structuredClone(PASTE_SLATE_FRAGMENT));

    expect(texts(editor)).toEqual(["Hello\nworld", "Next"]);
    expect(blockIds(editor)).toEqual(["src-a", "src-b"]);
    expectOpenable(editor);
  });

  test("pasting a fragment assigns a new id when the document already uses that id", () => {
    const editor = createEditor([{ type: "p", id: "src-a", children: [{ text: "Already" }] }]);
    editor.tf.select(caret([0, 0], 7));

    editor.tf.insertFragment(structuredClone(PASTE_SLATE_FRAGMENT));
    const found = blockIds(editor);
    const duplicates = found.filter((id) => id === "src-a");

    expect(new Set(found).size).toBe(found.length);
    expect(duplicates).toEqual(["src-a"]);
    expect(texts(editor)).toEqual(["AlreadyHello\nworld", "Next"]);
    expectOpenable(editor);
  });

  test("a pasted heading stays a heading and a block outside the allowlist becomes a paragraph", () => {
    const editor = paste([
      {
        type: "h1",
        id: "heading-1",
        url: "https://example.com",
        children: [{ text: "Title", sparkle: true }],
      },
      {
        type: "blockquote",
        children: [{ text: "Quoted" }],
      },
    ]);
    const serialized = JSON.stringify(editor.children);

    expect(texts(editor)).toEqual(["Title", "Quoted"]);
    expect(editor.children.map((block) => block.type)).toEqual(["h1", "p"]);
    expect(blockIds(editor)[0]).toBe("heading-1");
    expect(serialized).not.toContain("sparkle");
    expect(serialized).not.toContain("example.com");
    expectOpenable(editor);
  });

  test("a string child inside a pasted paragraph becomes text", () => {
    const value = sanitizePastedFragment([{ type: "p", id: "p1", children: ["Hello"] }]);

    expect(value).toEqual([{ type: "p", id: "p1", children: [{ text: "Hello" }] }]);
  });

  test("a null child is dropped from a pasted paragraph", () => {
    const value = sanitizePastedFragment([
      { type: "p", id: "p1", children: [null, { text: "Hi" }] },
    ]);

    expect(value).toEqual([{ type: "p", id: "p1", children: [{ text: "Hi" }] }]);
  });

  test("a top-level string becomes a paragraph", () => {
    const value = sanitizePastedFragment(["loose"]);

    expect(value).toEqual([{ type: "p", children: [{ text: "loose" }] }]);
  });

  test("a top-level empty text node produces no paragraph", () => {
    const value = sanitizePastedFragment([{ text: "" }]);

    expect(value).toEqual([]);
  });

  test("a null fragment entry is dropped", () => {
    const value = sanitizePastedFragment([
      null,
      { type: "p", id: "p", children: [{ text: "ok" }] },
    ]);

    expect(value).toEqual([{ type: "p", id: "p", children: [{ text: "ok" }] }]);
  });

  test("an inline link is unwrapped to its text and keeps its bold mark", () => {
    const value = sanitizePastedFragment(
      [
        {
          type: "p",
          children: [{ type: "a", children: [{ text: "link", bold: true }] }],
        },
      ],
      { isInline: (node) => node.type === "a" },
    );

    expect(value).toEqual([{ type: "p", children: [{ text: "link", bold: true }] }]);
  });

  test("a block nested in an unwrapped inline is dropped and the sibling text remains", () => {
    const value = sanitizePastedFragment(
      [
        {
          type: "a",
          children: [{ text: "keep" }, { type: "p", children: [{ text: "drop" }] }],
        },
      ],
      { isInline: (node) => node.type === "a" },
    );

    expect(value).toEqual([{ type: "p", children: [{ text: "keep" }] }]);
  });

  test("an allowlisted inline keeps its id and text inside the paragraph", () => {
    const value = sanitizePastedFragment(
      [
        {
          type: "p",
          id: "outer",
          children: [{ type: "p", id: "inner", children: [{ text: "inside" }] }],
        },
      ],
      { isInline: (node) => node.id === "inner" },
    );

    expect(value).toEqual([
      {
        type: "p",
        id: "outer",
        children: [{ type: "p", id: "inner", children: [{ text: "inside" }] }],
      },
    ]);
  });

  test("an empty allowlisted paragraph keeps its id", () => {
    const value = sanitizePastedFragment([{ type: "p", id: "keep", children: [] }]);

    expect(value).toEqual([{ type: "p", id: "keep", children: [{ text: "" }] }]);
  });

  test("an object that is neither text nor an element is dropped", () => {
    const value = sanitizePastedFragment([
      { type: "p", id: "p1", children: [{ foo: 1 }, { text: "ok" }] },
    ]);

    expect(value).toEqual([{ type: "p", id: "p1", children: [{ text: "ok" }] }]);
  });

  test("a nested allowlisted inline stays inside its parent", () => {
    const value = sanitizePastedFragment(
      [
        {
          type: "p",
          id: "outer",
          children: [
            {
              type: "p",
              id: "mid",
              children: [{ type: "p", id: "deep", children: [{ text: "nested" }] }],
            },
          ],
        },
      ],
      { isInline: (node) => node.id === "mid" || node.id === "deep" },
    );

    expect(value).toEqual([
      {
        type: "p",
        id: "outer",
        children: [
          {
            type: "p",
            id: "mid",
            children: [{ type: "p", id: "deep", children: [{ text: "nested" }] }],
          },
        ],
      },
    ]);
  });

  test("an allowlisted inline inside an unwrapped inline stays in the paragraph", () => {
    const value = sanitizePastedFragment(
      [
        {
          type: "a",
          children: [{ type: "p", id: "inner", children: [{ text: "kept" }] }],
        },
      ],
      { isInline: (node) => node.type === "a" || node.type === "p" },
    );

    expect(value).toEqual([
      {
        type: "p",
        children: [{ type: "p", id: "inner", children: [{ text: "kept" }] }],
      },
    ]);
  });

  test("an empty heading stays an empty heading", () => {
    const value = sanitizePastedFragment([{ type: "h1", children: [] }]);

    expect(value).toEqual([{ type: "h1", children: [{ text: "" }] }]);
  });
});
