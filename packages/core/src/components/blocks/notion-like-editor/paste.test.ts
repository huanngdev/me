import { describe, expect, test } from "bun:test";
import { createSlateEditor, type SlateEditor, type TElement } from "platejs";

import { createEditorDocument } from "./editor-document";
import { allowedElementAttrs, isAllowedMark } from "./editor-document-schema";
import { parseEditorDocument } from "./editor-document-validate";
import { createEditorPlugins } from "./editor-plugins";
import { EMPTY_EDITOR_VALUE, type EditorValue } from "./editor-value";
import { PASTE_GOOGLE_DOCS } from "./fixtures/paste-google-docs";
import { PASTE_SLATE_FRAGMENT } from "./fixtures/paste-slate-fragment";
import { PASTE_WEBPAGE } from "./fixtures/paste-webpage";
import { PASTE_WORD_NOTION } from "./fixtures/paste-word-notion";

function createEditor(value: EditorValue = EMPTY_EDITOR_VALUE): SlateEditor {
  return createSlateEditor({
    plugins: createEditorPlugins(),
    value,
    selection: {
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [0, 0], offset: 0 },
    },
  });
}

function paste(fragment: TElement[]): SlateEditor {
  const editor = createEditor();
  editor.tf.insertFragment(fragment);
  return editor;
}

function texts(editor: SlateEditor): string[] {
  return editor.children.map((block) => {
    let line = "";
    for (const child of block.children) {
      if ("text" in child && typeof child.text === "string") {
        line += child.text;
      }
    }

    return line;
  });
}

function ids(editor: SlateEditor): string[] {
  const found: string[] = [];
  for (const block of editor.children) {
    if ("id" in block && typeof block.id === "string") {
      found.push(block.id);
    }
  }

  return found;
}

function assertAllowlisted(value: unknown): void {
  if (typeof value !== "object" || value === null) {
    return;
  }

  if ("text" in value && typeof value.text === "string" && !("children" in value)) {
    for (const key of Object.keys(value)) {
      if (key === "text") {
        continue;
      }

      expect(isAllowedMark(key)).toBe(true);
    }

    return;
  }

  if (!("children" in value) || !Array.isArray(value.children)) {
    return;
  }

  const type = "type" in value && typeof value.type === "string" ? value.type : "";
  const allowed = allowedElementAttrs(type);
  expect(allowed).toBeDefined();

  for (const key of Object.keys(value)) {
    if (key === "type" || key === "children" || key === "id") {
      continue;
    }

    expect(allowed?.has(key)).toBe(true);
  }

  for (const child of value.children) {
    assertAllowlisted(child);
  }
}

function expectOpenable(editor: SlateEditor): void {
  const parsed = parseEditorDocument(createEditorDocument("demo", editor.children));
  expect(parsed.status).toBe("ok");
  assertAllowlisted(editor.children);
  expect(new Set(ids(editor)).size).toBe(editor.children.length);
  expect(ids(editor).every((id) => id.length > 0)).toBe(true);
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

  test("pasting this editor's Slate fragment keeps paragraphs and hard breaks", () => {
    const editor = paste(structuredClone(PASTE_SLATE_FRAGMENT));

    expect(texts(editor)).toEqual(["Hello\nworld", "Next"]);
    expect(ids(editor)).toEqual(["src-a", "src-b"]);
    expectOpenable(editor);
  });

  test("pasting a fragment assigns a new id when the document already uses that id", () => {
    const editor = createEditor([{ type: "p", id: "src-a", children: [{ text: "Already" }] }]);
    editor.tf.select({
      anchor: { path: [0, 0], offset: 7 },
      focus: { path: [0, 0], offset: 7 },
    });
    editor.tf.insertFragment(structuredClone(PASTE_SLATE_FRAGMENT));

    const found = ids(editor);
    expect(new Set(found).size).toBe(found.length);
    expect(found.filter((id) => id === "src-a")).toEqual(["src-a"]);
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

    expect(texts(editor)).toEqual(["Title", "Quoted"]);
    expect(editor.children.every((block) => block.type === "p")).toBe(true);
    expect(JSON.stringify(editor.children)).not.toContain("italic");
    expect(JSON.stringify(editor.children)).not.toContain("example.com");
    expectOpenable(editor);
  });
});
