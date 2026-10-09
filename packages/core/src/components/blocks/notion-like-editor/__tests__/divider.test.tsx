import { describe, expect, test } from "bun:test";
import { KEYS, type SlateEditor, type TElement } from "platejs";
import { createPlateEditor } from "platejs/react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  clearFormatting,
  getBlockType,
  insertDivider,
  runEditorCommand,
  setLineHeight,
  setTextAlign,
  toggleBulletedList,
  toggleNumberedList,
  toggleTodoChecked,
  toggleTodoList,
  turnIntoBlockquote,
  turnIntoHeading1,
  type EditorCommand,
} from "../lib/commands/editor-commands";
import { createEditorDocument } from "../lib/document/editor-document";
import { isVoidElementType } from "../lib/document/editor-document-schema";
import { parseEditorDocument } from "../lib/document/editor-document-validate";
import { createEditorPlugins } from "../lib/plugins/editor-plugins";
import { EditorSurface } from "../components/editor/editor-surface";
import type { EditorValue } from "../lib/document/editor-value";
import {
  HR_RULE_CLASS_NAME,
  HR_SELECTED_CLASS_NAME,
  hrElementClassName,
} from "../components/elements/hr-element";
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

function divider(id = "rule"): TElement {
  return { type: "hr", id, children: [{ text: "" }] };
}

function markedParagraph(text: string, id: string): TElement {
  return { type: "p", id, children: [{ text, bold: true }] };
}

function todo(text: string, id: string, checked = false): TElement {
  return {
    type: "p",
    id,
    indent: 1,
    listStyleType: "todo",
    checked,
    children: [{ text }],
  };
}

function between(): EditorValue {
  return [paragraph("Alpha", "a"), divider(), paragraph("Beta", "b")];
}

function typesOf(editor: SlateEditor): string[] {
  return editor.children.map((block) => block.type);
}

function anchorIndex(editor: SlateEditor): number | undefined {
  const index = editor.selection?.anchor.path[0];
  return typeof index === "number" ? index : undefined;
}

function selectBlock(editor: SlateEditor, index: number): void {
  const anchor = editor.api.start([index]);
  const focus = editor.api.end([index]);
  if (!anchor || !focus) {
    throw new Error(`Missing block ${index}.`);
  }

  editor.tf.select({ anchor, focus });
}

function selectAcross(editor: SlateEditor, from: number, to: number): void {
  const anchor = editor.api.start([from]);
  const focus = editor.api.end([to]);
  if (!anchor || !focus) {
    throw new Error("Missing selection.");
  }

  editor.tf.select({ anchor, focus });
}

function childIds(node: unknown): string[] {
  if (!isRecord(node) || !Array.isArray(node.children)) {
    return [];
  }

  return node.children.map((child) => {
    const id = field(child, "id");
    return typeof id === "string" ? id : "";
  });
}

function nestedText(node: unknown): string {
  if (!isRecord(node)) {
    return "";
  }

  if (typeof node.text === "string" && !("children" in node)) {
    return node.text;
  }

  if (!Array.isArray(node.children)) {
    return "";
  }

  return node.children.map((child) => nestedText(child)).join("");
}

function pasteHtml(html: string): SlateEditor {
  const editor = createEditor();
  editor.tf.select(caret([0, 0], 0));
  editor.tf.insertFragment(deserializeHtmlInDom(editor, html));
  return editor;
}

function renderDivider(value: EditorValue, readOnly = false): string {
  const editor = createPlateEditor({
    plugins: createEditorPlugins(),
    value,
  });

  return renderToStaticMarkup(
    <EditorSurface editor={editor} readOnly={readOnly} placeholder="" className="editor" />,
  );
}

describe("divider schema", () => {
  test("the void rule is hr and only hr", () => {
    expect(isVoidElementType(KEYS.hr)).toBe(true);
    expect(isVoidElementType("hr")).toBe(true);
    expect(isVoidElementType("p")).toBe(false);
    expect(isVoidElementType("blockquote")).toBe(false);
    expect(isVoidElementType("h1")).toBe(false);
  });

  test("an hr round-trips and keeps the same content array", () => {
    const content = [divider("rule-1"), paragraph("After", "para-1")];
    const raw = createEditorDocument("doc-hr", content);
    const parsed = expectOk(parseEditorDocument(raw));

    expect(parsed.repairs).toEqual([]);
    expect(parsed.document.content).toBe(content);
  });

  test("a document that ends with a divider is valid", () => {
    const content = [paragraph("Before", "para-1"), divider()];
    const parsed = expectOk(parseEditorDocument(createEditorDocument("doc-end", content)));

    expect(parsed.document.content).toBe(content);
  });

  test("an hr with text is unsupported and the raw document is kept", () => {
    const raw = createEditorDocument("doc-text", [
      { type: "hr", id: "rule", children: [{ text: "nope" }] },
    ]);
    const result = expectUnsupported(parseEditorDocument(raw));

    expect(result.issues[0]?.message).toContain("must contain one empty text node");
    expect(result.raw).toBe(raw);
  });

  test("an hr with a mark is unsupported and the raw document is kept", () => {
    const raw = createEditorDocument("doc-mark", [
      { type: "hr", id: "rule", children: [{ text: "", bold: true }] },
    ]);
    const result = expectUnsupported(parseEditorDocument(raw));

    expect(result.issues[0]?.message).toContain("must contain one empty text node");
    expect(result.raw).toBe(raw);
  });

  test("an hr with two children is unsupported and the raw document is kept", () => {
    const raw = createEditorDocument("doc-two", [
      { type: "hr", id: "rule", children: [{ text: "" }, { text: "" }] },
    ]);
    const result = expectUnsupported(parseEditorDocument(raw));

    expect(result.issues[0]?.message).toContain("must contain one empty text node");
    expect(result.raw).toBe(raw);
  });

  test("an hr with no children is invalid and the raw document is kept", () => {
    const raw = createEditorDocument("doc-empty", [{ type: "hr", id: "rule", children: [] }]);
    const result = expectInvalid(parseEditorDocument(raw));

    expect(result.issues[0]?.message).toContain("has no children");
    expect(result.raw).toBe(raw);
  });

  test("align on an hr is unsupported and the raw document is kept", () => {
    const raw = createEditorDocument("doc-align", [
      { type: "hr", id: "rule", align: "center", children: [{ text: "" }] },
    ]);
    const result = expectUnsupported(parseEditorDocument(raw));

    expect(result.issues[0]?.message).toContain("align");
    expect(result.raw).toBe(raw);
  });

  test("listStyleType on an hr is unsupported and the raw document is kept", () => {
    const raw = createEditorDocument("doc-list", [
      { type: "hr", id: "rule", listStyleType: "disc", children: [{ text: "" }] },
    ]);
    const result = expectUnsupported(parseEditorDocument(raw));

    expect(result.issues[0]?.message).toContain("listStyleType");
    expect(result.raw).toBe(raw);
  });

  test("an hr inside a quote is unsupported and the raw document is kept", () => {
    const raw = createEditorDocument("doc-quote", [quote("quote-1", [divider()])]);
    const result = expectUnsupported(parseEditorDocument(raw));

    expect(result.issues[0]?.message).toContain('has an unsupported child type "hr"');
    expect(result.raw).toBe(raw);
  });
});

describe("divider rendering", () => {
  test("renders a semantic hr that is not editable", () => {
    const html = renderDivider([paragraph("Before", "a"), divider(), paragraph("After", "b")]);

    expect(html).toContain("<hr");
    expect(html.toLowerCase()).toContain('contenteditable="false"');
    expect(html).toContain(HR_RULE_CLASS_NAME);
    expect(html).not.toContain(HR_SELECTED_CLASS_NAME);
  });

  test("a read-only divider has the same rule and no selected ring", () => {
    const html = renderDivider([divider()], true);

    expect(html).toContain("<hr");
    expect(html).toContain(HR_RULE_CLASS_NAME);
    expect(html).not.toContain(HR_SELECTED_CLASS_NAME);
  });

  test("the selected ring requires selection, focus, and an editable editor", () => {
    expect(hrElementClassName(true, true, false)).toBe(HR_SELECTED_CLASS_NAME);
    expect(hrElementClassName(true, false, false)).toBeUndefined();
    expect(hrElementClassName(false, true, false)).toBeUndefined();
    expect(hrElementClassName(true, true, true)).toBeUndefined();
  });
});

describe("insert divider", () => {
  test("an empty top-level paragraph becomes the divider and the caret moves to the next paragraph", () => {
    const editor = createEditor([
      paragraph("", "empty", { align: "center" }),
      paragraph("Next", "next"),
    ]);
    editor.tf.select(caret([0, 0], 0));

    expect(runEditorCommand(editor, insertDivider, undefined)).toBe(true);
    expect(typesOf(editor)).toEqual(["hr", "p"]);
    expect(blockIds(editor)).toEqual(["empty", "next"]);
    expect(field(editor.children[0], "align")).toBeUndefined();
    expect(editor.children[0]?.children).toEqual([{ text: "" }]);
    expect(anchorIndex(editor)).toBe(1);
  });

  test("a non-empty paragraph inserts the divider after it", () => {
    const editor = createEditor([paragraph("Hello", "a"), paragraph("World", "b")]);
    editor.tf.select(caret([0, 0], 2));

    runEditorCommand(editor, insertDivider, undefined);

    expect(typesOf(editor)).toEqual(["p", "hr", "p"]);
    expect(blockIds(editor)[0]).toBe("a");
    expect(blockIds(editor)[2]).toBe("b");
    expect(texts(editor)).toEqual(["Hello", "", "World"]);
    expect(anchorIndex(editor)).toBe(2);
    expect(typeof blockIds(editor)[1]).toBe("string");
    expect(blockIds(editor)[1]?.length).toBeGreaterThan(0);
  });

  test("inserting at the end creates a paragraph after the divider", () => {
    const editor = createEditor([paragraph("Hello", "a")]);
    editor.tf.select(caret([0, 0], 5));

    runEditorCommand(editor, insertDivider, undefined);

    expect(typesOf(editor)).toEqual(["p", "hr", "p"]);
    expect(blockIds(editor)[0]).toBe("a");
    expect(texts(editor)).toEqual(["Hello", "", ""]);
    expect(field(editor.children[2], "listStyleType")).toBeUndefined();
    expect(anchorIndex(editor)).toBe(2);
  });

  test("a caret inside a quote inserts the divider after the quote", () => {
    const editor = createEditor([
      quote("q", [paragraph("Keep", "qa"), paragraph("Me", "qb")]),
      paragraph("After", "after"),
    ]);
    editor.tf.select(caret([0, 0, 0], 1));

    runEditorCommand(editor, insertDivider, undefined);

    expect(typesOf(editor)).toEqual(["blockquote", "hr", "p"]);
    expect(childIds(editor.children[0])).toEqual(["qa", "qb"]);
    expect(nestedText(editor.children[0])).toBe("KeepMe");
    expect(blockIds(editor)[2]).toBe("after");
    expect(anchorIndex(editor)).toBe(2);
  });

  test("a caret in a list item inserts a plain paragraph after the divider", () => {
    const editor = createEditor([
      paragraph("Item", "li", { indent: 1, listStyleType: "disc" }),
      paragraph("Next", "n2", { indent: 1, listStyleType: "disc" }),
    ]);
    editor.tf.select(caret([0, 0], 1));

    runEditorCommand(editor, insertDivider, undefined);

    expect(typesOf(editor)).toEqual(["p", "hr", "p", "p"]);
    expect(blockIds(editor)[0]).toBe("li");
    expect(blockIds(editor)[3]).toBe("n2");
    expect(field(editor.children[0], "listStyleType")).toBe("disc");
    expect(field(editor.children[2], "listStyleType")).toBeUndefined();
    expect(field(editor.children[3], "listStyleType")).toBe("disc");
    expect(texts(editor)[2]).toBe("");
    expect(anchorIndex(editor)).toBe(2);
  });

  test("one undo removes the divider and the paragraph it created", () => {
    const editor = createEditor([paragraph("Hello", "a")]);
    editor.tf.select(caret([0, 0], 5));
    const before = JSON.parse(JSON.stringify(editor.children));
    const undos = editor.history.undos.length;

    runEditorCommand(editor, insertDivider, undefined);

    expect(editor.history.undos.length - undos).toBe(1);
    editor.tf.undo();
    expect(editor.children).toEqual(before);
  });

  test("read-only refuses the insert", () => {
    const editor = createEditor([paragraph("Hello", "a")]);
    editor.tf.select(caret([0, 0], 1));
    const before = JSON.parse(JSON.stringify(editor.children));
    const undos = editor.history.undos.length;

    expect(runEditorCommand(editor, insertDivider, undefined, { readOnly: true })).toBe(false);
    expect(editor.children).toEqual(before);
    expect(editor.history.undos.length).toBe(undos);
  });

  test("the divider command is the insert group and has no shortcut", () => {
    const editor = createEditor();

    expect(insertDivider.id).toBe("block.insert.divider");
    expect(insertDivider.label).toBe("Divider");
    expect(insertDivider.group).toBe("insert");
    expect(editor.getPlugin({ key: KEYS.hr }).node.isVoid).toBe(true);
    expect(editor.getPlugin({ key: KEYS.hr }).node.isElement).toBe(true);
    expect(editor.getPlugin({ key: KEYS.hr }).inputRules ?? []).toEqual([]);
    const shortcuts = Object.keys(editor.meta.shortcuts).filter(
      (id) => id.startsWith("hr") || id.includes("divider") || id.includes("horizontal"),
    );
    expect(shortcuts).toEqual([]);
  });
});

describe("commands skip voids", () => {
  const selected: readonly [string, EditorCommand][] = [
    ["heading", turnIntoHeading1],
    ["bulleted list", toggleBulletedList],
    ["numbered list", toggleNumberedList],
    ["to-do list", toggleTodoList],
    ["quote", turnIntoBlockquote],
  ];

  for (const [label, command] of selected) {
    test(`${label} leaves a selected divider as a divider`, () => {
      const editor = createEditor(between());
      selectBlock(editor, 1);
      const before = JSON.parse(JSON.stringify(editor.children[1]));

      runEditorCommand(editor, command, undefined);

      expect(editor.children[1]).toEqual(before);
      expect(getBlockType(editor)).toBe("hr");
    });
  }

  test("align, line height, clear formatting, and to-do checked leave a selected divider unchanged", () => {
    const editor = createEditor(between());
    selectBlock(editor, 1);
    const before = JSON.parse(JSON.stringify(editor.children));

    expect(runEditorCommand(editor, setTextAlign, "center")).toBe(true);
    expect(runEditorCommand(editor, setLineHeight, 2)).toBe(true);
    expect(runEditorCommand(editor, clearFormatting, undefined)).toBe(false);
    expect(runEditorCommand(editor, toggleTodoChecked, undefined)).toBe(false);
    expect(editor.children).toEqual(before);
  });

  test("a heading range turns only the paragraphs", () => {
    const editor = createEditor(between());
    selectAcross(editor, 0, 2);

    runEditorCommand(editor, turnIntoHeading1, undefined);

    expect(typesOf(editor)).toEqual(["h1", "hr", "h1"]);
    expect(blockIds(editor)).toEqual(["a", "rule", "b"]);
    expect(texts(editor)).toEqual(["Alpha", "", "Beta"]);
  });

  test("a quote range leaves the divider between two quotes", () => {
    const editor = createEditor(between());
    selectAcross(editor, 0, 2);

    runEditorCommand(editor, turnIntoBlockquote, undefined);

    expect(typesOf(editor)).toEqual(["blockquote", "hr", "blockquote"]);
    expect(field(editor.children[1], "id")).toBe("rule");
    expect(nestedText(editor.children[0])).toBe("Alpha");
    expect(nestedText(editor.children[2])).toBe("Beta");
  });

  test("a list range sets the paragraphs and not the divider", () => {
    const editor = createEditor(between());
    selectAcross(editor, 0, 2);

    runEditorCommand(editor, toggleBulletedList, undefined);

    expect(field(editor.children[0], "listStyleType")).toBe("disc");
    expect(field(editor.children[2], "listStyleType")).toBe("disc");
    expect(editor.children[1]?.type).toBe("hr");
    expect(field(editor.children[1], "listStyleType")).toBeUndefined();
  });

  test("align and line height skip the divider in a range", () => {
    const editor = createEditor(between());
    selectAcross(editor, 0, 2);

    runEditorCommand(editor, setTextAlign, "center");
    runEditorCommand(editor, setLineHeight, 2);

    expect(field(editor.children[0], "align")).toBe("center");
    expect(field(editor.children[2], "align")).toBe("center");
    expect(field(editor.children[0], "lineHeight")).toBe(2);
    expect(field(editor.children[2], "lineHeight")).toBe(2);
    expect(field(editor.children[1], "align")).toBeUndefined();
    expect(field(editor.children[1], "lineHeight")).toBeUndefined();
    expect(editor.children[1]?.type).toBe("hr");
  });

  test("clear formatting skips the divider in a range", () => {
    const editor = createEditor([
      markedParagraph("Alpha", "a"),
      divider(),
      markedParagraph("Beta", "b"),
    ]);
    selectAcross(editor, 0, 2);

    runEditorCommand(editor, clearFormatting, undefined);

    expect(editor.children[0]?.children[0]).toEqual({ text: "Alpha" });
    expect(editor.children[2]?.children[0]).toEqual({ text: "Beta" });
    expect(editor.children[1]).toEqual(divider());
  });

  test("checking a to-do range does not add checked to the divider", () => {
    const editor = createEditor([todo("Alpha", "a"), divider(), todo("Beta", "b")]);
    selectAcross(editor, 0, 2);

    runEditorCommand(editor, toggleTodoChecked, undefined);

    expect(field(editor.children[0], "checked")).toBe(true);
    expect(field(editor.children[2], "checked")).toBe(true);
    expect(editor.children[1]?.type).toBe("hr");
    expect(field(editor.children[1], "checked")).toBeUndefined();
  });

  test("an object match changes only the blockquote", () => {
    const editor = createEditor([
      paragraph("Alpha", "a"),
      divider(),
      quote("q", [paragraph("Quoted", "qp")]),
    ]);
    selectAcross(editor, 0, 2);
    const paragraphBefore = JSON.parse(JSON.stringify(editor.children[0]));
    const dividerBefore = JSON.parse(JSON.stringify(editor.children[1]));

    editor.tf.setNodes({ id: "quote-next" }, { match: { type: KEYS.blockquote } });

    expect(editor.children[0]).toEqual(paragraphBefore);
    expect(editor.children[1]).toEqual(dividerBefore);
    expect(field(editor.children[2], "id")).toBe("quote-next");
    expect(editor.children[2]?.type).toBe("blockquote");
    expect(childIds(editor.children[2])).toEqual(["qp"]);
  });

  test("a function match still changes only the paragraphs", () => {
    const editor = createEditor(between());
    selectAcross(editor, 0, 2);

    editor.tf.setNodes(
      { align: "center" },
      {
        match: (node) => "type" in node && node.type === KEYS.p,
      },
    );

    expect(field(editor.children[0], "align")).toBe("center");
    expect(field(editor.children[2], "align")).toBe("center");
    expect(editor.children[0]?.type).toBe("p");
    expect(editor.children[2]?.type).toBe("p");
    expect(editor.children[1]).toEqual(divider());
  });

  test("setNodes writes an allowed id on a divider and does not change its type", () => {
    const editor = createEditor(between());

    editor.tf.setNodes({ id: "renamed" }, { at: [1] });

    expect(editor.children[1]?.type).toBe("hr");
    expect(field(editor.children[1], "id")).toBe("renamed");

    editor.tf.setNodes({ type: KEYS.p }, { at: [1] });

    expect(editor.children[1]?.type).toBe("hr");
    expect(field(editor.children[1], "id")).toBe("renamed");
  });

  test("a divider skips a call that sets type beside an allowed id", () => {
    const editor = createEditor(between());
    const before = JSON.parse(JSON.stringify(editor.children[1]));

    editor.tf.setNodes({ id: "renamed", type: KEYS.p }, { at: [1] });

    expect(editor.children[1]).toEqual(before);
    expect(editor.children[0]?.type).toBe("p");
    expect(field(editor.children[0], "id")).toBe("a");
  });

  test("getBlockType reports hr and mixed", () => {
    const editor = createEditor(between());
    selectBlock(editor, 1);
    expect(getBlockType(editor)).toBe("hr");

    selectAcross(editor, 0, 2);
    expect(getBlockType(editor)).toBe("mixed");

    selectBlock(editor, 0);
    expect(getBlockType(editor)).toBe("p");
  });
});

describe("divider keyboard", () => {
  test("backspace on a selected divider removes only it and leaves the caret at the end of the previous block", () => {
    const editor = createEditor([
      markedParagraph("Hello", "a"),
      divider(),
      markedParagraph("World", "b"),
    ]);
    selectBlock(editor, 1);

    editor.tf.deleteBackward();

    expect(typesOf(editor)).toEqual(["p", "p"]);
    expect(blockIds(editor)).toEqual(["a", "b"]);
    expect(editor.children[0]?.children[0]).toEqual({ text: "Hello", bold: true });
    expect(editor.children[1]?.children[0]).toEqual({ text: "World", bold: true });
    expect(editor.selection?.anchor).toEqual({ path: [0, 0], offset: 5 });
  });

  test("delete on a selected divider removes only it", () => {
    const editor = createEditor([paragraph("Hello", "a"), divider(), paragraph("World", "b")]);
    selectBlock(editor, 1);

    editor.tf.deleteForward();

    expect(typesOf(editor)).toEqual(["p", "p"]);
    expect(blockIds(editor)).toEqual(["a", "b"]);
    expect(texts(editor)).toEqual(["Hello", "World"]);
    expect(editor.selection?.anchor).toEqual({ path: [0, 0], offset: 5 });
  });

  test("backspace on a leading divider moves the caret to the start of the next block", () => {
    const editor = createEditor([divider(), paragraph("After", "a")]);
    selectBlock(editor, 0);

    editor.tf.deleteBackward();

    expect(typesOf(editor)).toEqual(["p"]);
    expect(blockIds(editor)).toEqual(["a"]);
    expect(texts(editor)).toEqual(["After"]);
    expect(editor.selection?.anchor).toEqual({ path: [0, 0], offset: 0 });
  });

  test("enter on a selected divider inserts an empty paragraph after it", () => {
    const editor = createEditor([paragraph("Hello", "a"), divider(), paragraph("World", "b")]);
    selectBlock(editor, 1);

    editor.tf.insertBreak();

    expect(typesOf(editor)).toEqual(["p", "hr", "p", "p"]);
    expect(blockIds(editor)[0]).toBe("a");
    expect(blockIds(editor)[1]).toBe("rule");
    expect(blockIds(editor)[3]).toBe("b");
    expect(texts(editor)).toEqual(["Hello", "", "", "World"]);
    expect(anchorIndex(editor)).toBe(2);
    expect(field(editor.children[2], "listStyleType")).toBeUndefined();
  });

  test("backspace at the start of the paragraph after a divider selects the divider and keeps the paragraph", () => {
    const editor = createEditor([
      markedParagraph("Hello", "a"),
      divider(),
      markedParagraph("World", "b"),
    ]);
    editor.tf.select(caret([2, 0], 0));

    editor.tf.deleteBackward();

    expect(blockIds(editor)).toEqual(["a", "rule", "b"]);
    expect(editor.children[0]?.children[0]).toEqual({ text: "Hello", bold: true });
    expect(editor.children[2]?.children[0]).toEqual({ text: "World", bold: true });
    expect(anchorIndex(editor)).toBe(1);
    expect(editor.children[1]?.type).toBe("hr");
  });

  test("backspace in an empty paragraph after a divider removes that paragraph and selects the divider", () => {
    const editor = createEditor([paragraph("Hello", "a"), divider(), paragraph("", "empty")]);
    editor.tf.select(caret([2, 0], 0));

    editor.tf.deleteBackward();

    expect(typesOf(editor)).toEqual(["p", "hr"]);
    expect(blockIds(editor)).toEqual(["a", "rule"]);
    expect(texts(editor)).toEqual(["Hello", ""]);
    expect(anchorIndex(editor)).toBe(1);
  });

  test("delete at the end of the paragraph before a divider selects the divider and keeps the paragraph", () => {
    const editor = createEditor([
      markedParagraph("Hello", "a"),
      divider(),
      markedParagraph("World", "b"),
    ]);
    editor.tf.select(caret([0, 0], 5));

    editor.tf.deleteForward();

    expect(blockIds(editor)).toEqual(["a", "rule", "b"]);
    expect(editor.children[0]?.children[0]).toEqual({ text: "Hello", bold: true });
    expect(editor.children[2]?.children[0]).toEqual({ text: "World", bold: true });
    expect(anchorIndex(editor)).toBe(1);
  });

  test("break above does not run when the divider is selected", () => {
    const editor = createEditor([paragraph("Hello", "a"), divider(), paragraph("World", "b")]);
    selectBlock(editor, 1);
    const hello = JSON.parse(JSON.stringify(editor.children[0]));

    editor.tf.insertBreak();

    expect(editor.children[0]).toEqual(hello);
    expect(editor.children[1]?.type).toBe("hr");
    expect(anchorIndex(editor)).not.toBe(0);
  });

  test("deleting a range across a divider removes it, and undo restores the original ids", () => {
    const editor = createEditor(between());
    const before = JSON.parse(JSON.stringify(editor.children));
    selectAcross(editor, 0, 2);

    editor.tf.deleteFragment();

    expect(texts(editor).join("")).not.toContain("Alpha");
    expect(texts(editor).join("")).not.toContain("Beta");
    expect(blockIds(editor)).not.toContain("rule");

    editor.tf.undo();

    expect(editor.children).toEqual(before);
  });

  test("backspace between consecutive dividers removes only the selected one", () => {
    const editor = createEditor([
      paragraph("A", "a"),
      divider("r1"),
      divider("r2"),
      paragraph("B", "b"),
    ]);
    selectBlock(editor, 2);

    editor.tf.deleteBackward();

    expect(typesOf(editor)).toEqual(["p", "hr", "p"]);
    expect(blockIds(editor)).toEqual(["a", "r1", "b"]);
    expect(texts(editor)).toEqual(["A", "", "B"]);
  });

  test("a line move from the end of the paragraph above selects the divider", () => {
    const editor = createEditor(between());
    editor.tf.select(caret([0, 0], "Alpha".length));

    editor.tf.move({ unit: "line" });

    expect(anchorIndex(editor)).toBe(1);

    editor.tf.move({ unit: "line" });

    expect(anchorIndex(editor)).toBe(2);

    editor.tf.select(caret([2, 0], 0));
    editor.tf.move({ unit: "line", reverse: true });

    expect(anchorIndex(editor)).toBe(1);
  });

  test("the caret cannot move before a divider that is the first block", () => {
    const editor = createEditor([divider(), paragraph("After", "a")]);
    selectBlock(editor, 0);

    editor.tf.move({ unit: "line", reverse: true });

    expect(anchorIndex(editor)).toBe(0);
    expect(editor.api.start([])?.path[0]).toBe(0);
  });

  test("plain text --- stays text", () => {
    const editor = createEditor();
    editor.tf.select(caret([0, 0], 0));

    editor.tf.insertText("---");

    expect(typesOf(editor)).toEqual(["p"]);
    expect(texts(editor)).toEqual(["---"]);
  });
});

describe("divider paste", () => {
  test("an hr element becomes a divider", () => {
    const editor = pasteHtml("<hr>");

    expect(typesOf(editor)).toEqual(["hr"]);
    expect(editor.children[0]?.children).toEqual([{ text: "" }]);
    expect(typeof field(editor.children[0], "id")).toBe("string");
  });

  test("a paragraph, hr, and paragraph stay in that order", () => {
    const editor = pasteHtml("<p>a</p><hr><p>b</p>");

    expect(typesOf(editor)).toEqual(["p", "hr", "p"]);
    expect(texts(editor)).toEqual(["a", "", "b"]);
  });

  test("an hr inside a quote splits the quote around the divider", () => {
    const editor = pasteHtml("<blockquote><p>a</p><hr><p>b</p></blockquote>");

    expect(typesOf(editor)).toEqual(["blockquote", "hr", "blockquote"]);
    expect(nestedText(editor.children[0])).toBe("a");
    expect(nestedText(editor.children[2])).toBe("b");
    expect(editor.children[1]?.children).toEqual([{ text: "" }]);
  });

  test("an editor fragment keeps the divider", () => {
    const editor = createEditor([paragraph("Here", "here"), paragraph("", "slot")]);
    editor.tf.select(caret([1, 0], 0));

    editor.tf.insertFragment(structuredClone([divider()]));

    expect(typesOf(editor)).toContain("hr");
    const hr = editor.children.find((block) => block.type === "hr");
    expect(field(hr, "id")).toBe("rule");
    expect(texts(editor)[0]).toBe("Here");
  });

  test("pasted --- stays a paragraph", () => {
    const editor = pasteHtml("<p>---</p>");

    expect(typesOf(editor)).toEqual(["p"]);
    expect(texts(editor)).toEqual(["---"]);
  });
});

describe("divider normalizer", () => {
  test("an hr inside a quote is lifted out and not retyped", () => {
    const editor = createEditor([
      quote("q", [paragraph("A", "a"), divider(), paragraph("B", "b")]),
    ]);

    editor.tf.normalize({ force: true });

    expect(typesOf(editor)).toEqual(["blockquote", "hr", "blockquote"]);
    expect(field(editor.children[1], "id")).toBe("rule");
    expect(editor.children[1]?.type).toBe("hr");
    expect(childIds(editor.children[0])).toEqual(["a"]);
    expect(childIds(editor.children[2])).toEqual(["b"]);
    expect(nestedText(editor.children[0])).toBe("A");
    expect(nestedText(editor.children[2])).toBe("B");
  });

  test("a quote whose only child is an hr becomes the hr", () => {
    const editor = createEditor([quote("q", [divider()])]);

    editor.tf.normalize({ force: true });

    expect(typesOf(editor)).toEqual(["hr"]);
    expect(blockIds(editor)).toEqual(["rule"]);
  });
});
