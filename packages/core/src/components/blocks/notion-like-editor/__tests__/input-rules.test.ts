import { describe, expect, test } from "bun:test";
import { KEYS, type SlateEditor } from "platejs";
import { createPlateEditor } from "platejs/react";

import { createEditorDocument } from "../lib/document/editor-document";
import { parseEditorDocument } from "../lib/document/editor-document-validate";
import { createTableNode } from "../lib/features/editor-table";
import { createEditorPlugins } from "../lib/plugins/editor-plugins";
import { blockIds, caret, createEditor, field, plainText, texts } from "./test-utils";
import type { EditorValue } from "../lib/document/editor-value";

function plateEditor(value: EditorValue): SlateEditor {
  return createPlateEditor({ plugins: createEditorPlugins(), value });
}

function openable(editor: SlateEditor): void {
  const parsed = parseEditorDocument(createEditorDocument("demo", editor.children));
  const ids = blockIds(editor);
  expect(parsed.status).toBe("ok");
  expect(new Set(ids).size).toBe(ids.length);
  expect(ids.every((id) => id.length > 0)).toBe(true);
}

function typeAt(editor: SlateEditor, path: number[]): string {
  const block = editor.api.node(path)?.[0];
  return field(block, "type") === undefined ? "" : String(field(block, "type"));
}

function typeChars(editor: SlateEditor, value: string): void {
  for (const character of value) {
    editor.tf.insertText(character);
  }
}

function paragraph(text = ""): EditorValue {
  return [{ type: KEYS.p, id: "p1", children: [{ text }] }];
}

describe("markdown input rules", () => {
  const blockCases: {
    typed: string;
    type: string;
    list?: string;
    checked?: boolean;
    restart?: number;
  }[] = [
    { typed: "# ", type: KEYS.h1 },
    { typed: "## ", type: KEYS.h2 },
    { typed: "### ", type: KEYS.h3 },
    { typed: "- ", type: KEYS.p, list: "disc" },
    { typed: "* ", type: KEYS.p, list: "disc" },
    { typed: "+ ", type: KEYS.p, list: "disc" },
    { typed: "1. ", type: KEYS.p, list: "decimal" },
    { typed: "2. ", type: KEYS.p, list: "decimal", restart: 2 },
    { typed: "3) ", type: KEYS.p, list: "decimal", restart: 3 },
    { typed: "[] ", type: KEYS.p, list: "todo", checked: false },
    { typed: "[ ] ", type: KEYS.p, list: "todo", checked: false },
    { typed: "[x] ", type: KEYS.p, list: "todo", checked: true },
    { typed: "[X] ", type: KEYS.p, list: "todo", checked: true },
    { typed: "> ", type: KEYS.blockquote },
    { typed: "```", type: KEYS.codeBlock },
    { typed: "---", type: KEYS.hr },
  ];

  for (const item of blockCases) {
    test(`${JSON.stringify(item.typed)} converts and one undo restores the characters`, () => {
      const editor = createEditor(paragraph());
      editor.tf.select(caret([0, 0], 0));
      typeChars(editor, item.typed);
      expect(typeAt(editor, [0])).toBe(item.type);
      if (item.list !== undefined) {
        expect(field(editor.children[0], "listStyleType")).toBe(item.list);
      }
      if (item.checked !== undefined) {
        expect(field(editor.children[0], "checked")).toBe(item.checked);
      }
      if (item.restart !== undefined) {
        expect(field(editor.children[0], "listRestart")).toBe(item.restart);
      }
      if (item.type === KEYS.hr) {
        expect(typeAt(editor, [1])).toBe(KEYS.p);
      }
      if (item.type === KEYS.codeBlock) {
        expect(field(editor.children[0], "lang")).toBeUndefined();
      }
      openable(editor);
      editor.tf.undo();
      expect(typeAt(editor, [0])).toBe(KEYS.p);
      expect(plainText(editor)).toBe(item.typed);
      editor.tf.insertText("z");
      expect(typeAt(editor, [0])).toBe(KEYS.p);
      expect(plainText(editor)).toBe(`${item.typed}z`);
    });

    test(`${JSON.stringify(item.typed)} redo restores the conversion and backspace matches undo`, () => {
      const editor = createEditor(paragraph());
      editor.tf.select(caret([0, 0], 0));
      editor.tf.insertText(item.typed);
      expect(typeAt(editor, [0])).toBe(item.type);
      editor.tf.redo();
      expect(typeAt(editor, [0])).toBe(item.type);
      editor.tf.undo();
      editor.tf.redo();
      expect(typeAt(editor, [0])).toBe(item.type);
      editor.tf.undo();
      const again = createEditor(paragraph());
      again.tf.select(caret([0, 0], 0));
      again.tf.insertText(item.typed);
      again.tf.deleteBackward();
      expect(typeAt(again, [0])).toBe(KEYS.p);
      expect(plainText(again)).toBe(item.typed);
    });
  }

  test("kept text and marks stay on the converted block", () => {
    const editor = createEditor([
      { type: KEYS.p, id: "p1", children: [{ text: "Keep", bold: true }] },
    ] as EditorValue);
    editor.tf.select(caret([0, 0], 0));
    typeChars(editor, "# ");
    expect(typeAt(editor, [0])).toBe(KEYS.h1);
    expect(texts(editor)).toEqual(["Keep"]);
    expect(field(editor.children[0]?.children[0], "bold")).toBe(true);
    openable(editor);
  });

  test("a code fence keeps the text that was already after the caret", () => {
    const editor = createEditor(paragraph("body"));
    editor.tf.select(caret([0, 0], 0));
    editor.tf.insertText("```");
    expect(typeAt(editor, [0])).toBe(KEYS.codeBlock);
    expect(editor.api.string(editor.children[0] ?? { text: "" })).toContain("body");
  });

  test("a heading trigger inside a table cell stays typed", () => {
    const table = createTableNode(1, 1);
    table.id = "table";
    const editor = createEditor([table] as EditorValue);
    const cell = [0, 0, 0, 0, 0];
    editor.tf.select(caret(cell, 0));
    editor.tf.insertText("# ");
    expect(editor.api.string(editor.api.node(cell.slice(0, 4))?.[0] ?? { text: "" })).toContain(
      "# ",
    );
    expect(typeAt(editor, cell.slice(0, 4))).toBe(KEYS.p);
  });

  const excluded: { name: string; value: EditorValue; path: number[] }[] = [
    {
      name: "heading",
      value: [{ type: KEYS.h1, id: "h", children: [{ text: "" }] }],
      path: [0, 0],
    },
    {
      name: "list item",
      value: [
        { type: KEYS.p, id: "li", listStyleType: "disc", indent: 1, children: [{ text: "" }] },
      ],
      path: [0, 0],
    },
    {
      name: "code block",
      value: [
        {
          type: KEYS.codeBlock,
          id: "code",
          children: [{ type: KEYS.codeLine, id: "line", children: [{ text: "" }] }],
        },
      ],
      path: [0, 0, 0],
    },
    {
      name: "table header",
      value: [
        {
          type: KEYS.table,
          id: "table",
          children: [
            {
              type: KEYS.tr,
              id: "row",
              children: [
                {
                  type: KEYS.th,
                  id: "th",
                  children: [{ type: KEYS.p, id: "hp", children: [{ text: "" }] }],
                },
              ],
            },
          ],
        },
      ],
      path: [0, 0, 0, 0, 0],
    },
    {
      name: "code mark",
      value: [{ type: KEYS.p, id: "p", children: [{ text: "", code: true }] }],
      path: [0, 0],
    },
  ];

  for (const item of excluded) {
    test(`#  does not convert in a ${item.name}`, () => {
      const editor = createEditor(item.value);
      editor.tf.select(caret(item.path, 0));
      editor.tf.insertText("# ");
      expect(JSON.stringify(editor.children)).toContain("# ");
      expect(editor.children[0]?.type === KEYS.h1).toBe(item.name === "heading");
    });
  }

  test("a range selection does not convert", () => {
    const editor = createEditor(paragraph("ab"));
    editor.tf.select({ anchor: { path: [0, 0], offset: 0 }, focus: { path: [0, 0], offset: 2 } });
    editor.tf.insertText("# ");
    expect(typeAt(editor, [0])).toBe(KEYS.p);
    expect(plainText(editor)).toBe("# ");
  });

  test("IME composition and its commit do not convert", () => {
    const editor = createEditor(paragraph());
    editor.tf.select(caret([0, 0], 0));
    editor.composing = true;
    editor.tf.insertText("#");
    editor.composing = false;
    editor.tf.insertText(" ");
    expect(typeAt(editor, [0])).toBe(KEYS.p);
    expect(plainText(editor)).toBe("# ");
  });

  test("paste does not convert a typed-looking fragment", () => {
    const editor = createEditor(paragraph());
    editor.tf.select(caret([0, 0], 0));
    const data = new DataTransfer();
    data.setData("text/plain", "# ");
    editor.tf.insertData(data);
    expect(typeAt(editor, [0])).toBe(KEYS.p);
    expect(JSON.stringify(editor.children)).toContain("#");
    expect(editor.children.some((block) => block.type === KEYS.h1)).toBe(false);
  });

  const inlineCases: { typed: string; mark: string; text: string }[] = [
    { typed: "**bold**", mark: "bold", text: "bold" },
    { typed: "*em*", mark: "italic", text: "em" },
    { typed: "_em_", mark: "italic", text: "em" },
    { typed: "~~gone~~", mark: "strikethrough", text: "gone" },
    { typed: "`code`", mark: "code", text: "code" },
  ];

  for (const item of inlineCases) {
    test(`${item.typed} applies ${item.mark} and undo restores the delimiters`, () => {
      const editor = createEditor(paragraph());
      editor.tf.select(caret([0, 0], 0));
      editor.tf.insertText(item.typed);
      expect(plainText(editor)).toBe(item.text);
      const leaf = editor.children[0]?.children[0];
      expect(field(leaf, item.mark)).toBe(true);
      editor.tf.insertText("Z");
      expect(plainText(editor)).toBe(`${item.text}Z`);
      expect(field(editor.children[0]?.children.at(-1), item.mark)).not.toBe(true);
      editor.tf.undo();
      editor.tf.undo();
      expect(plainText(editor)).toBe(item.typed);
      editor.tf.redo();
      expect(plainText(editor)).toBe(item.text);
      openable(editor);
    });

    test(`backspace after ${item.typed} restores the delimiters`, () => {
      const editor = createEditor(paragraph());
      editor.tf.select(caret([0, 0], 0));
      typeChars(editor, item.typed);
      editor.tf.deleteBackward();
      expect(plainText(editor)).toBe(item.typed);
    });
  }

  const rejected = ["snake_case_name", "2 * 3 * 4", "a*b*c", "*", "**", "** **"];

  for (const typed of rejected) {
    test(`${JSON.stringify(typed)} stays plain`, () => {
      const editor = createEditor(paragraph());
      editor.tf.select(caret([0, 0], 0));
      editor.tf.insertText(typed);
      expect(plainText(editor)).toBe(typed);
      expect(field(editor.children[0]?.children[0], "italic")).not.toBe(true);
      expect(field(editor.children[0]?.children[0], "bold")).not.toBe(true);
    });
  }

  test("delimiters split across two blocks do not convert", () => {
    const editor = createEditor([
      { type: KEYS.p, id: "a", children: [{ text: "**hello" }] },
      { type: KEYS.p, id: "b", children: [{ text: "" }] },
    ] as EditorValue);
    editor.tf.select(caret([1, 0], 0));
    editor.tf.insertText("**");
    expect(texts(editor)).toEqual(["**hello", "**"]);
  });

  test("delimiters across a link do not convert", () => {
    const editor = createEditor([
      {
        type: KEYS.p,
        id: "p",
        children: [
          { text: "**" },
          { type: KEYS.link, id: "link", url: "https://example.com", children: [{ text: "go" }] },
          { text: "" },
        ],
      },
    ] as EditorValue);
    editor.tf.select(caret([0, 2], 0));
    editor.tf.insertText("**");
    expect(plainText(editor)).toContain("**");
    expect(field(editor.children[0]?.children[0], "bold")).not.toBe(true);
  });

  test("fast typing of a trigger converts once", () => {
    const editor = createEditor(paragraph());
    editor.tf.select(caret([0, 0], 0));
    editor.tf.insertText("**once**");
    expect(plainText(editor)).toBe("once");
    expect(
      editor.children[0]?.children.filter((node) => field(node, "bold") === true),
    ).toHaveLength(1);
  });

  test("a trigger that is not at the block start stays plain", () => {
    const editor = createEditor(paragraph("a"));
    editor.tf.select(caret([0, 0], 1));
    typeChars(editor, "# ");
    expect(plainText(editor)).toBe("a# ");
    expect(typeAt(editor, [0])).toBe(KEYS.p);
  });

  test("text after the caret is kept when a bullet converts", () => {
    const editor = createEditor(paragraph("body"));
    editor.tf.select(caret([0, 0], 0));
    typeChars(editor, "- ");
    expect(typeAt(editor, [0])).toBe(KEYS.p);
    expect(field(editor.children[0], "listStyleType")).toBe("disc");
    expect(plainText(editor)).toBe("body");
    openable(editor);
  });

  test("one undo for a bullet puts the caret after the typed characters", () => {
    const editor = createEditor(paragraph());
    editor.tf.select(caret([0, 0], 0));
    typeChars(editor, "- ");
    editor.tf.undo();
    expect(typeAt(editor, [0])).toBe(KEYS.p);
    expect(plainText(editor)).toBe("- ");
    expect(editor.selection?.anchor.path).toEqual([0, 0]);
    expect(editor.selection?.anchor.offset).toBe(2);
  });

  test("a heading trigger is refused inside a callout and the characters stay", () => {
    const editor = createEditor([
      {
        type: KEYS.callout,
        id: "callout",
        children: [{ type: KEYS.p, id: "cp", children: [{ text: "" }] }],
      },
    ] as EditorValue);
    editor.tf.select(caret([0, 0, 0], 0));
    editor.tf.insertText("# ");
    expect(JSON.stringify(editor.children)).toContain("# ");
    expect(typeAt(editor, [0, 0])).toBe(KEYS.p);
  });

  test("a bullet trigger converts inside a callout", () => {
    const editor = createEditor([
      {
        type: KEYS.callout,
        id: "callout",
        children: [{ type: KEYS.p, id: "cp", children: [{ text: "" }] }],
      },
    ] as EditorValue);
    editor.tf.select(caret([0, 0, 0], 0));
    editor.tf.insertText("- ");
    expect(field(editor.children[0]?.children?.[0], "listStyleType")).toBe("disc");
    expect(plainText(editor)).toBe("");
  });

  test("an inline rule does not fire inside a code block", () => {
    const editor = createEditor([
      {
        type: KEYS.codeBlock,
        id: "code",
        children: [{ type: KEYS.codeLine, id: "line", children: [{ text: "" }] }],
      },
    ] as EditorValue);
    editor.tf.select(caret([0, 0, 0], 0));
    typeChars(editor, "**b**");
    expect(editor.api.string(editor.children[0] ?? { text: "" })).toBe("**b**");
  });

  test("an inline rule does not fire with the code mark", () => {
    const editor = createEditor([
      { type: KEYS.p, id: "p", children: [{ text: "", code: true }] },
    ] as EditorValue);
    editor.tf.select(caret([0, 0], 0));
    typeChars(editor, "**b**");
    expect(plainText(editor)).toBe("**b**");
    expect(field(editor.children[0]?.children?.[0], "bold")).not.toBe(true);
  });

  test("an inline rule does not fire during IME composition", () => {
    const editor = createEditor(paragraph());
    editor.tf.select(caret([0, 0], 0));
    editor.composing = true;
    editor.tf.insertText("**b**");
    editor.composing = false;
    expect(plainText(editor)).toBe("**b**");
    expect(field(editor.children[0]?.children?.[0], "bold")).not.toBe(true);
  });

  test("an inline rule does not fire on paste", () => {
    const editor = plateEditor(paragraph());
    editor.tf.select(caret([0, 0], 0));
    const data = new DataTransfer();
    data.setData("text/plain", "**b**");
    editor.tf.insertData(data);
    expect(plainText(editor)).toBe("**b**");
    expect(field(editor.children[0]?.children?.[0], "bold")).not.toBe(true);
  });

  test("one undo restores the inline delimiters and typing keeps them", () => {
    const editor = createEditor(paragraph());
    editor.tf.select(caret([0, 0], 0));
    editor.tf.insertText("**bold**");
    expect(plainText(editor)).toBe("bold");
    editor.tf.undo();
    expect(plainText(editor)).toBe("**bold**");
    expect(field(editor.children[0]?.children?.[0], "bold")).not.toBe(true);
    editor.tf.insertText("z");
    expect(plainText(editor)).toBe("**bold**z");
    expect(typeAt(editor, [0])).toBe(KEYS.p);
  });
});
