import { describe, expect, test } from "bun:test";
import { KEYS, type SlateEditor } from "platejs";
import { Key, Plate, PlateContent, createPlateEditor } from "platejs/react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  getBlockType,
  runEditorCommand,
  setFontSize,
  setLineHeight,
  setTextAlign,
  turnIntoHeading1,
} from "./editor-commands";
import { createEditorDocument, serializeEditorDocument } from "./editor-document";
import { createEditorPlugins } from "./editor-plugins";
import { headingAnchorId } from "./heading-element";
import { parseEditorDocument } from "./editor-document-validate";
import {
  blockIds,
  caret,
  createEditor,
  deserializeHtmlInDom,
  expectOk,
  expectUnsupported,
  field,
  textRange,
  texts,
} from "./test-utils";

function heading(text: string, id = "heading-a") {
  return { type: "h1" as const, id, children: [{ text }] };
}

function paragraph(text: string, id = "block-a") {
  return { type: "p" as const, id, children: [{ text }] };
}

function blockType(editor: SlateEditor, index: number): unknown {
  return field(editor.children[index], "type");
}

function pressHeading(editor: SlateEditor): void {
  const shortcut = editor.meta.shortcuts["h1.toggle"];
  if (!shortcut?.handler) {
    throw new Error("Missing h1 shortcut.");
  }

  shortcut.handler({ editor });
}

function pasteHtml(html: string): SlateEditor {
  const editor = createEditor();
  editor.tf.select(caret([0, 0], 0));
  editor.tf.insertFragment(deserializeHtmlInDom(editor, html));
  return editor;
}

describe("heading 1", () => {
  test("duplicate titles derive different anchor ids from the block id", () => {
    expect(headingAnchorId("alpha")).toBe("heading-alpha");
    expect(headingAnchorId("beta")).toBe("heading-beta");
    expect(headingAnchorId("alpha")).not.toBe(headingAnchorId("beta"));
  });

  test("a heading renders as h1 with the derived anchor id", () => {
    const editor = createPlateEditor({
      plugins: createEditorPlugins(),
      value: [heading("Same title", "alpha"), heading("Same title", "beta")],
    });
    const html = renderToStaticMarkup(
      <Plate editor={editor}>
        <PlateContent />
      </Plate>,
    );

    expect(html).toContain("<h1");
    expect(html).toContain('id="heading-alpha"');
    expect(html).toContain('id="heading-beta"');
    expect(html).toContain("text-3xl");
    expect(html).toContain("font-medium");
    expect(html).toContain("leading-tight");
    expect(html).not.toContain("font-bold");
    expect(html).not.toContain("font-semibold");
  });

  test("turn into heading 1 keeps text, marks, id, and align, drops line height, and undoes in one step", () => {
    const editor = createEditor([
      {
        type: "p",
        id: "block-a",
        align: "center",
        lineHeight: 2,
        children: [{ text: "Hello", bold: true }],
      },
    ]);
    editor.tf.select(caret([0, 0], 2));
    const before = editor.history.undos.length;

    expect(runEditorCommand(editor, turnIntoHeading1, undefined)).toBe(true);

    expect(blockType(editor, 0)).toBe("h1");
    expect(blockIds(editor)).toEqual(["block-a"]);
    expect(texts(editor)).toEqual(["Hello"]);
    expect(editor.children[0]?.children[0]).toEqual({ text: "Hello", bold: true });
    expect(field(editor.children[0], "align")).toBe("center");
    expect(field(editor.children[0], "lineHeight")).toBeUndefined();
    expect("lineHeight" in (editor.children[0] ?? {})).toBe(false);
    expect(editor.history.undos.length - before).toBe(1);

    editor.tf.undo();

    expect(blockType(editor, 0)).toBe("p");
    expect(field(editor.children[0], "lineHeight")).toBe(2);
    expect(field(editor.children[0], "align")).toBe("center");
    expect(editor.children[0]?.children[0]).toEqual({ text: "Hello", bold: true });
    expect(blockIds(editor)).toEqual(["block-a"]);

    runEditorCommand(editor, turnIntoHeading1, undefined);
    runEditorCommand(editor, turnIntoHeading1, undefined);

    expect(blockType(editor, 0)).toBe("p");
    expect(field(editor.children[0], "lineHeight")).toBeUndefined();
    expect(field(editor.children[0], "align")).toBe("center");
    expect(editor.children[0]?.children[0]).toEqual({ text: "Hello", bold: true });
    expect(blockIds(editor)).toEqual(["block-a"]);
    expect(texts(editor)).toEqual(["Hello"]);
  });

  test("a read-only editor refuses turn into heading 1", () => {
    const editor = createEditor([paragraph("Hello", "block-a")]);
    editor.tf.select(caret([0, 0], 1));
    const undos = editor.history.undos.length;

    const applied = runEditorCommand(editor, turnIntoHeading1, undefined, { readOnly: true });

    expect(applied).toBe(false);
    expect(blockType(editor, 0)).toBe("p");
    expect(editor.history.undos.length).toBe(undos);
  });

  test("turn into heading 1 converts every paragraph in the selection", () => {
    const editor = createEditor([
      { type: "p", id: "block-a", lineHeight: 1.5, children: [{ text: "One" }] },
      { type: "p", id: "block-b", lineHeight: 2, children: [{ text: "Two" }] },
    ]);
    editor.tf.select({
      anchor: { path: [0, 0], offset: 1 },
      focus: { path: [1, 0], offset: 1 },
    });

    runEditorCommand(editor, turnIntoHeading1, undefined);

    expect(blockType(editor, 0)).toBe("h1");
    expect(blockType(editor, 1)).toBe("h1");
    expect(field(editor.children[0], "lineHeight")).toBeUndefined();
    expect(field(editor.children[1], "lineHeight")).toBeUndefined();
    expect(blockIds(editor)).toEqual(["block-a", "block-b"]);
    expect(texts(editor)).toEqual(["One", "Two"]);
  });

  test("a selection that mixes a paragraph and a heading turns both into paragraphs", () => {
    const editor = createEditor([paragraph("One", "block-a"), heading("Two", "block-b")]);
    editor.tf.select({
      anchor: { path: [0, 0], offset: 1 },
      focus: { path: [1, 0], offset: 1 },
    });

    runEditorCommand(editor, turnIntoHeading1, undefined);

    expect(blockType(editor, 0)).toBe("p");
    expect(blockType(editor, 1)).toBe("p");
    expect(texts(editor)).toEqual(["One", "Two"]);
    expect(blockIds(editor)).toEqual(["block-a", "block-b"]);
  });

  test("getBlockType returns one type or mixed across the selection", () => {
    const editor = createEditor([paragraph("One", "block-a"), heading("Two", "block-b")]);

    expect(getBlockType(editor)).toBeNull();

    editor.tf.select(caret([0, 0], 1));
    expect(getBlockType(editor)).toBe("p");

    editor.tf.select(caret([1, 0], 1));
    expect(getBlockType(editor)).toBe("h1");

    editor.tf.select({
      anchor: { path: [0, 0], offset: 1 },
      focus: { path: [1, 0], offset: 1 },
    });
    expect(getBlockType(editor)).toBe("mixed");
  });

  test("Enter at the end of a heading creates a paragraph with a new id", () => {
    const editor = createEditor([heading("Hello", "block-a")]);
    editor.tf.select(caret([0, 0], 5));

    editor.tf.insertBreak();

    expect(texts(editor)).toEqual(["Hello", ""]);
    expect(blockType(editor, 0)).toBe("h1");
    expect(blockType(editor, 1)).toBe("p");
    expect(blockIds(editor)[0]).toBe("block-a");
    expect(blockIds(editor)[1]).not.toBe("block-a");
    expect(blockIds(editor)[1]).not.toBe("");
  });

  test("Enter in the middle of a heading leaves the first part as h1 and resets the second part to a paragraph", () => {
    const editor = createEditor([heading("Hello world", "block-a")]);
    editor.tf.select(caret([0, 0], 5));

    editor.tf.insertBreak();

    expect(texts(editor)).toEqual(["Hello", " world"]);
    expect(blockType(editor, 0)).toBe("h1");
    expect(blockType(editor, 1)).toBe("p");
    expect(blockIds(editor)[0]).toBe("block-a");
    expect(blockIds(editor)[1]).not.toBe("block-a");
  });

  test("Enter at the start of a non-empty heading inserts an empty paragraph before it and keeps the heading id", () => {
    const editor = createEditor([
      {
        type: "h1",
        id: "block-a",
        align: "center",
        children: [{ text: "Hello", bold: true }],
      },
    ]);
    editor.tf.select(caret([0, 0], 0));
    const before = editor.history.undos.length;

    editor.tf.insertBreak();
    const ids = blockIds(editor);

    expect(texts(editor)).toEqual(["", "Hello"]);
    expect(blockType(editor, 0)).toBe("p");
    expect(blockType(editor, 1)).toBe("h1");
    expect(ids[0]).not.toBe("block-a");
    expect(ids[0]).not.toBe("");
    expect(ids[1]).toBe("block-a");
    expect(headingAnchorId(ids[1] ?? "")).toBe("heading-block-a");
    expect(field(editor.children[1], "align")).toBe("center");
    expect(field(editor.children[1]?.children[0], "bold")).toBe(true);
    expect(field(editor.children[0], "align")).toBeUndefined();
    expect(editor.selection).toEqual(caret([1, 0], 0));
    expect(editor.history.undos.length - before).toBe(1);

    editor.tf.undo();

    expect(texts(editor)).toEqual(["Hello"]);
    expect(blockType(editor, 0)).toBe("h1");
    expect(blockIds(editor)).toEqual(["block-a"]);
    expect(field(editor.children[0], "align")).toBe("center");
    expect(field(editor.children[0]?.children[0], "bold")).toBe(true);
  });

  test("Backspace in an empty heading turns it into a paragraph and keeps its id", () => {
    const editor = createEditor([
      { type: "h1", id: "block-a", align: "center", children: [{ text: "" }] },
    ]);
    editor.tf.select(caret([0, 0], 0));

    editor.tf.deleteBackward();

    expect(texts(editor)).toEqual([""]);
    expect(blockType(editor, 0)).toBe("p");
    expect(blockIds(editor)).toEqual(["block-a"]);
    expect(field(editor.children[0], "align")).toBeUndefined();
  });

  test("Backspace at the start of a non-empty heading merges it into the previous paragraph", () => {
    const editor = createEditor([
      { type: "p", id: "block-a", align: "right", children: [{ text: "Hello" }] },
      { type: "h1", id: "block-b", align: "center", children: [{ text: " world", bold: true }] },
    ]);
    editor.tf.select(caret([1, 0], 0));

    editor.tf.deleteBackward();

    expect(texts(editor)).toEqual(["Hello world"]);
    expect(editor.children).toHaveLength(1);
    expect(blockType(editor, 0)).toBe("p");
    expect(blockIds(editor)).toEqual(["block-a"]);
    expect(field(editor.children[0], "align")).toBe("right");
    expect(editor.children[0]?.children[1]).toEqual({ text: " world", bold: true });
  });

  test("Backspace at the start of a non-empty heading with nothing above turns it into a paragraph and keeps its id", () => {
    const editor = createEditor([heading("Hello", "block-a")]);
    editor.tf.select(caret([0, 0], 0));

    editor.tf.deleteBackward();

    expect(texts(editor)).toEqual(["Hello"]);
    expect(blockType(editor, 0)).toBe("p");
    expect(blockIds(editor)).toEqual(["block-a"]);
  });

  test("setting font size on heading text keeps the heading", () => {
    const editor = createEditor([heading("Title", "block-a")]);
    editor.tf.select(textRange([0, 0], 0, 5));

    runEditorCommand(editor, setFontSize, "32px");

    expect(blockType(editor, 0)).toBe("h1");
    expect(editor.children[0]?.children[0]).toEqual({ text: "Title", fontSize: "32px" });
    expect(blockIds(editor)).toEqual(["block-a"]);
  });

  test("setTextAlign stores align on a heading and setLineHeight does not", () => {
    const editor = createEditor([heading("Title", "block-a")]);
    editor.tf.select(caret([0, 0], 1));

    runEditorCommand(editor, setTextAlign, "center");
    runEditorCommand(editor, setLineHeight, 2);

    expect(field(editor.children[0], "align")).toBe("center");
    expect(field(editor.children[0], "lineHeight")).toBeUndefined();
    expect(blockType(editor, 0)).toBe("h1");
  });

  test("a heading round-trips through serialize and parse", () => {
    const document = createEditorDocument("doc-heading", [
      {
        type: "h1",
        id: "block-a",
        align: "center",
        children: [{ text: "Title", bold: true }],
      },
    ]);
    const serialized: unknown = JSON.parse(serializeEditorDocument(document));
    const parsed = expectOk(parseEditorDocument(serialized));

    expect(parsed.repairs).toEqual([]);
    expect(parsed.document.content).toEqual(document.content);
  });

  test("line height on a heading is unsupported and the raw input is kept", () => {
    const raw = createEditorDocument("doc-heading", [
      { type: "h1", id: "block-a", lineHeight: 2, children: [{ text: "Title" }] },
    ]);
    const result = expectUnsupported(parseEditorDocument(raw));

    expect(result.raw).toBe(raw);
    expect(result.issues[0]?.path).toEqual([0]);
    expect(result.issues[0]?.message).toContain("lineHeight");
    expect(field(raw.content[0], "lineHeight")).toBe(2);
  });

  test("an unknown heading level h7 is unsupported and the raw input is kept", () => {
    const raw = createEditorDocument("doc-heading", [
      { type: "h7", id: "block-a", children: [{ text: "Title" }] },
    ]);
    const result = expectUnsupported(parseEditorDocument(raw));

    expect(result.raw).toBe(raw);
    expect(result.issues[0]?.message).toContain('unsupported block type "h7"');
    expect(field(raw.content[0], "type")).toBe("h7");
  });

  test("h2 remains unsupported until its task and the raw input is kept", () => {
    const raw = createEditorDocument("doc-heading", [
      { type: "h2", id: "block-a", children: [{ text: "Title" }] },
    ]);
    const result = expectUnsupported(parseEditorDocument(raw));

    expect(result.raw).toBe(raw);
    expect(result.issues[0]?.message).toContain('unsupported block type "h2"');
    expect(field(raw.content[0], "type")).toBe("h2");
  });

  test("pasting an h1 element becomes a heading", () => {
    const editor = pasteHtml("<h1>Title</h1>");

    expect(texts(editor)).toEqual(["Title"]);
    expect(blockType(editor, 0)).toBe("h1");
  });

  test("pasting an h4 element still becomes a paragraph", () => {
    const editor = pasteHtml("<h4>Title</h4>");

    expect(texts(editor)).toEqual(["Title"]);
    expect(blockType(editor, 0)).toBe("p");
  });

  test("pasting an editor fragment keeps the heading", () => {
    const editor = createEditor();
    editor.tf.select(caret([0, 0], 0));

    editor.tf.insertFragment([
      { type: "h1", id: "kept", align: "center", children: [{ text: "Title", bold: true }] },
    ]);

    expect(texts(editor)).toEqual(["Title"]);
    expect(editor.children.map((block) => block.type)).toEqual(["h1"]);
    expect(blockIds(editor)).toEqual(["kept"]);
    expect(field(editor.children[0], "align")).toBe("center");
    expect(editor.children[0]?.children[0]).toEqual({ text: "Title", bold: true });
  });

  test("pasting plain text stays a paragraph", () => {
    const editor = pasteHtml("<p># Title</p>");

    expect(texts(editor)).toEqual(["# Title"]);
    expect(blockType(editor, 0)).toBe("p");
  });

  test("heading 1 has no markdown input rule", () => {
    const editor = createEditor();
    const plugin = editor.getPlugin({ key: KEYS.h1 });

    expect(KEYS.h1).toBe("h1");
    expect(plugin.rules.delete).toEqual({ empty: "reset", start: "default" });
    expect(plugin.rules.break?.splitReset).toBe(true);
    expect(plugin.rules.merge?.removeEmpty).toBe(true);
    expect(plugin.inputRules ?? []).toEqual([]);
    expect(turnIntoHeading1.id).toBe("block.turn-into.h1");
    expect(turnIntoHeading1.group).toBe("turn-into");
    expect(editor.meta.shortcuts["h1.toggle"]?.keys).toEqual([[Key.Mod, Key.Alt, "1"]]);
  });

  test("Mod+Alt+1 toggles a paragraph to a heading and back", () => {
    const editor = createEditor([
      { type: "p", id: "block-a", align: "right", lineHeight: 2, children: [{ text: "Hello" }] },
    ]);
    editor.tf.select(caret([0, 0], 1));

    pressHeading(editor);

    expect(blockType(editor, 0)).toBe("h1");
    expect(field(editor.children[0], "lineHeight")).toBeUndefined();
    expect(field(editor.children[0], "align")).toBe("right");
    expect(blockIds(editor)).toEqual(["block-a"]);

    pressHeading(editor);

    expect(blockType(editor, 0)).toBe("p");
    expect(field(editor.children[0], "lineHeight")).toBeUndefined();
    expect(texts(editor)).toEqual(["Hello"]);
  });

  test("Mod+Alt+1 does nothing in a read-only editor", () => {
    const editor = createEditor([paragraph("Hello", "block-a")]);
    editor.tf.select(caret([0, 0], 1));
    editor.dom.readOnly = true;
    const undos = editor.history.undos.length;

    pressHeading(editor);

    expect(blockType(editor, 0)).toBe("p");
    expect(editor.history.undos.length).toBe(undos);
  });
});
