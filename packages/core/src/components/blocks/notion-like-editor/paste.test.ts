import { describe, expect, test } from "bun:test";
import type { SlateEditor, TElement } from "platejs";

import { createEditorDocument } from "./editor-document";
import { allowedElementAttrs, isAllowedMark } from "./editor-document-schema";
import { parseEditorDocument } from "./editor-document-validate";
import { sanitizePastedFragment } from "./editor-paste";
import { PASTE_GOOGLE_DOCS } from "./fixtures/paste-google-docs";
import { PASTE_SLATE_FRAGMENT } from "./fixtures/paste-slate-fragment";
import { PASTE_WEBPAGE } from "./fixtures/paste-webpage";
import { PASTE_WORD_NOTION } from "./fixtures/paste-word-notion";
import { blockIds, caret, createEditor, texts } from "./test-utils";

function paste(fragment: TElement[]): SlateEditor {
  const editor = createEditor();
  editor.tf.select(caret([0, 0], 0));
  editor.tf.insertFragment(fragment);
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

    if (!allowed.has(key)) {
      return false;
    }
  }

  return value.children.every((child) => allowlisted(child));
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

describe("paste", () => {
  test("pasting Google Docs HTML keeps both paragraphs and drops unsupported bold", () => {
    const [first, ...rest] = structuredClone(PASTE_GOOGLE_DOCS);
    const marked = {
      ...first,
      children: first.children.map((child, index) =>
        index === 0 ? { ...child, bold: true } : child,
      ),
    };

    const editor = paste([marked, ...rest]);

    expect(texts(editor)).toEqual(["Bold and italic", "Second line"]);
    expect(JSON.stringify(editor.children)).not.toContain("bold");
    expectOpenable(editor);
  });

  test("pasting a web page keeps the heading, paragraph, and each list item", () => {
    const editor = paste(structuredClone(PASTE_WEBPAGE));

    expect(texts(editor)).toEqual(["Title", "Para with bold and link", "One", "Two"]);
    expect(editor.children.every((block) => block.type === "p")).toBe(true);
    expectOpenable(editor);
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

  test("a pasted block outside the allowlist becomes a paragraph without its extra keys", () => {
    const editor = paste([
      {
        type: "h1",
        id: "heading-1",
        url: "https://example.com",
        children: [{ text: "Title", italic: true }],
      },
      {
        type: "blockquote",
        children: [{ text: "Quoted" }],
      },
    ]);
    const serialized = JSON.stringify(editor.children);

    expect(texts(editor)).toEqual(["Title", "Quoted"]);
    expect(editor.children.every((block) => block.type === "p")).toBe(true);
    expect(serialized).not.toContain("italic");
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

  test("an inline link is unwrapped to its text and its bold mark is dropped", () => {
    const value = sanitizePastedFragment(
      [
        {
          type: "p",
          children: [{ type: "a", children: [{ text: "link", bold: true }] }],
        },
      ],
      { isInline: (node) => node.type === "a" },
    );

    expect(value).toEqual([{ type: "p", children: [{ text: "link" }] }]);
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

  test("an empty heading becomes an empty paragraph", () => {
    const value = sanitizePastedFragment([{ type: "h1", children: [] }]);

    expect(value).toEqual([{ type: "p", children: [{ text: "" }] }]);
  });
});
