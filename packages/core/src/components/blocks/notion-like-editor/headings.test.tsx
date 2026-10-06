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
  turnIntoHeading2,
  type EditorCommand,
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
  isRecord,
  textRange,
  texts,
} from "./test-utils";

type Level = 1 | 2;
type HeadingType = "h1" | "h2";

function headingType(level: Level): HeadingType {
  return level === 1 ? "h1" : "h2";
}

function turnInto(level: Level): EditorCommand {
  return level === 1 ? turnIntoHeading1 : turnIntoHeading2;
}

function heading(level: Level, text: string, id = "heading-a") {
  return { type: headingType(level), id, children: [{ text }] };
}

function paragraph(text: string, id = "block-a") {
  return { type: "p" as const, id, children: [{ text }] };
}

function blockType(editor: SlateEditor, index: number): unknown {
  return field(editor.children[index], "type");
}

function pressHeading(editor: SlateEditor, level: Level): void {
  const shortcut = editor.meta.shortcuts[`${headingType(level)}.toggle`];
  if (!shortcut?.handler) {
    throw new Error(`Missing h${level} shortcut.`);
  }

  shortcut.handler({ editor });
}

function pasteHtml(html: string): SlateEditor {
  const editor = createEditor();
  editor.tf.select(caret([0, 0], 0));
  editor.tf.insertFragment(deserializeHtmlInDom(editor, html));
  return editor;
}

describe("headings", () => {
  test("duplicate titles derive different anchor ids from the block id", () => {
    expect(headingAnchorId("alpha")).toBe("heading-alpha");
    expect(headingAnchorId("beta")).toBe("heading-beta");
    expect(headingAnchorId("alpha")).not.toBe(headingAnchorId("beta"));
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

  test("h3 remains unsupported until its task and the raw input is kept", () => {
    const raw = createEditorDocument("doc-heading", [
      { type: "h3", id: "block-a", children: [{ text: "Title" }] },
    ]);
    const result = expectUnsupported(parseEditorDocument(raw));

    expect(result.raw).toBe(raw);
    expect(result.issues[0]?.message).toContain('unsupported block type "h3"');
    expect(field(raw.content[0], "type")).toBe("h3");
  });

  test("pasting an h3 element stays a paragraph", () => {
    const editor = pasteHtml("<h3>Title</h3>");

    expect(texts(editor)).toEqual(["Title"]);
    expect(blockType(editor, 0)).toBe("p");
  });

  test("pasting an h4 element still becomes a paragraph", () => {
    const editor = pasteHtml("<h4>Title</h4>");

    expect(texts(editor)).toEqual(["Title"]);
    expect(blockType(editor, 0)).toBe("p");
  });

  test("pasting plain text stays a paragraph", () => {
    const editor = pasteHtml("<p># Title</p>");

    expect(texts(editor)).toEqual(["# Title"]);
    expect(blockType(editor, 0)).toBe("p");
  });

  test("turning heading 1 into heading 2 and back keeps id, text, marks, and align", () => {
    const editor = createEditor([
      {
        type: "h1",
        id: "block-a",
        align: "center",
        children: [{ text: "Hello", bold: true }],
      },
    ]);
    editor.tf.select(caret([0, 0], 1));

    expect(runEditorCommand(editor, turnIntoHeading2, undefined)).toBe(true);

    expect(blockType(editor, 0)).toBe("h2");
    expect(blockIds(editor)).toEqual(["block-a"]);
    expect(texts(editor)).toEqual(["Hello"]);
    expect(editor.children[0]?.children[0]).toEqual({ text: "Hello", bold: true });
    expect(field(editor.children[0], "align")).toBe("center");

    runEditorCommand(editor, turnIntoHeading1, undefined);

    expect(blockType(editor, 0)).toBe("h1");
    expect(blockIds(editor)).toEqual(["block-a"]);
    expect(texts(editor)).toEqual(["Hello"]);
    expect(editor.children[0]?.children[0]).toEqual({ text: "Hello", bold: true });
    expect(field(editor.children[0], "align")).toBe("center");
  });

  test("getBlockType across a heading 1 and a heading 2 returns mixed", () => {
    const editor = createEditor([
      { type: "h1", id: "block-a", children: [{ text: "One" }] },
      { type: "h2", id: "block-b", children: [{ text: "Two" }] },
    ]);
    editor.tf.select({
      anchor: { path: [0, 0], offset: 1 },
      focus: { path: [1, 0], offset: 1 },
    });

    expect(getBlockType(editor)).toBe("mixed");
  });

  test("Mod+Alt+2 does not share its keys with another editor shortcut", () => {
    const editor = createEditor();
    const keys = JSON.stringify(editor.meta.shortcuts["h2.toggle"]?.keys);
    const collisions = Object.entries(editor.meta.shortcuts).filter(([id, shortcut]) => {
      if (id === "h2.toggle" || !isRecord(shortcut) || !("keys" in shortcut)) {
        return false;
      }

      return JSON.stringify(shortcut.keys) === keys;
    });

    expect(editor.meta.shortcuts["h2.toggle"]?.keys).toEqual([[Key.Mod, Key.Alt, "2"]]);
    expect(collisions).toEqual([]);
  });
});

describe.each([1, 2])("heading %i", (value) => {
  if (value !== 1 && value !== 2) {
    throw new Error("Unexpected heading level.");
  }

  const level = value;
  const type = headingType(level);
  const command = turnInto(level);

  test(`a heading renders as h${level} with the derived anchor id`, () => {
    const editor = createPlateEditor({
      plugins: createEditorPlugins(),
      value: [heading(level, "Same title", "alpha"), heading(level, "Same title", "beta")],
    });
    const html = renderToStaticMarkup(
      <Plate editor={editor}>
        <PlateContent />
      </Plate>,
    );

    expect(html).toContain(`<h${level}`);
    expect(html).toContain('id="heading-alpha"');
    expect(html).toContain('id="heading-beta"');
    expect(html).toContain(level === 1 ? "text-3xl" : "text-2xl");
    expect(html).toContain(level === 1 ? "mt-8" : "mt-6");
    expect(html).toContain("font-medium");
    expect(html).toContain("leading-tight");
    expect(html).toContain("first:mt-0");
    expect(html).not.toContain("font-bold");
    expect(html).not.toContain("font-semibold");
    expect(html).not.toContain(level === 1 ? "text-2xl" : "text-3xl");
  });

  test(`turn into heading ${level} keeps text, marks, id, and align, drops line height, and undoes in one step`, () => {
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

    expect(runEditorCommand(editor, command, undefined)).toBe(true);

    expect(blockType(editor, 0)).toBe(type);
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

    runEditorCommand(editor, command, undefined);
    runEditorCommand(editor, command, undefined);

    expect(blockType(editor, 0)).toBe("p");
    expect(field(editor.children[0], "lineHeight")).toBeUndefined();
    expect(field(editor.children[0], "align")).toBe("center");
    expect(editor.children[0]?.children[0]).toEqual({ text: "Hello", bold: true });
    expect(blockIds(editor)).toEqual(["block-a"]);
    expect(texts(editor)).toEqual(["Hello"]);
  });

  test(`a read-only editor refuses turn into heading ${level}`, () => {
    const editor = createEditor([paragraph("Hello", "block-a")]);
    editor.tf.select(caret([0, 0], 1));
    const undos = editor.history.undos.length;

    const applied = runEditorCommand(editor, command, undefined, { readOnly: true });

    expect(applied).toBe(false);
    expect(blockType(editor, 0)).toBe("p");
    expect(editor.history.undos.length).toBe(undos);
  });

  test(`turn into heading ${level} converts every paragraph in the selection`, () => {
    const editor = createEditor([
      { type: "p", id: "block-a", lineHeight: 1.5, children: [{ text: "One" }] },
      { type: "p", id: "block-b", lineHeight: 2, children: [{ text: "Two" }] },
    ]);
    editor.tf.select({
      anchor: { path: [0, 0], offset: 1 },
      focus: { path: [1, 0], offset: 1 },
    });

    runEditorCommand(editor, command, undefined);

    expect(blockType(editor, 0)).toBe(type);
    expect(blockType(editor, 1)).toBe(type);
    expect(field(editor.children[0], "lineHeight")).toBeUndefined();
    expect(field(editor.children[1], "lineHeight")).toBeUndefined();
    expect(blockIds(editor)).toEqual(["block-a", "block-b"]);
    expect(texts(editor)).toEqual(["One", "Two"]);
  });

  test(`a selection that mixes a paragraph and a heading ${level} turns both into paragraphs`, () => {
    const editor = createEditor([paragraph("One", "block-a"), heading(level, "Two", "block-b")]);
    editor.tf.select({
      anchor: { path: [0, 0], offset: 1 },
      focus: { path: [1, 0], offset: 1 },
    });

    runEditorCommand(editor, command, undefined);

    expect(blockType(editor, 0)).toBe("p");
    expect(blockType(editor, 1)).toBe("p");
    expect(texts(editor)).toEqual(["One", "Two"]);
    expect(blockIds(editor)).toEqual(["block-a", "block-b"]);
  });

  test("getBlockType returns one type or mixed across the selection", () => {
    const editor = createEditor([paragraph("One", "block-a"), heading(level, "Two", "block-b")]);

    expect(getBlockType(editor)).toBeNull();

    editor.tf.select(caret([0, 0], 1));
    expect(getBlockType(editor)).toBe("p");

    editor.tf.select(caret([1, 0], 1));
    expect(getBlockType(editor)).toBe(type);

    editor.tf.select({
      anchor: { path: [0, 0], offset: 1 },
      focus: { path: [1, 0], offset: 1 },
    });
    expect(getBlockType(editor)).toBe("mixed");
  });

  test("Enter at the end of a heading creates a paragraph with a new id", () => {
    const editor = createEditor([heading(level, "Hello", "block-a")]);
    editor.tf.select(caret([0, 0], 5));

    editor.tf.insertBreak();

    expect(texts(editor)).toEqual(["Hello", ""]);
    expect(blockType(editor, 0)).toBe(type);
    expect(blockType(editor, 1)).toBe("p");
    expect(blockIds(editor)[0]).toBe("block-a");
    expect(blockIds(editor)[1]).not.toBe("block-a");
    expect(blockIds(editor)[1]).not.toBe("");
  });

  test(`Enter in the middle of a heading leaves the first part as h${level} and resets the second part to a paragraph`, () => {
    const editor = createEditor([heading(level, "Hello world", "block-a")]);
    editor.tf.select(caret([0, 0], 5));

    editor.tf.insertBreak();

    expect(texts(editor)).toEqual(["Hello", " world"]);
    expect(blockType(editor, 0)).toBe(type);
    expect(blockType(editor, 1)).toBe("p");
    expect(blockIds(editor)[0]).toBe("block-a");
    expect(blockIds(editor)[1]).not.toBe("block-a");
  });

  test("Enter at the start of a non-empty heading inserts an empty paragraph before it and keeps the heading id", () => {
    const editor = createEditor([
      {
        type,
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
    expect(blockType(editor, 1)).toBe(type);
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
    expect(blockType(editor, 0)).toBe(type);
    expect(blockIds(editor)).toEqual(["block-a"]);
    expect(field(editor.children[0], "align")).toBe("center");
    expect(field(editor.children[0]?.children[0], "bold")).toBe(true);
  });

  test("Backspace in an empty heading turns it into a paragraph and keeps its id", () => {
    const editor = createEditor([
      { type, id: "block-a", align: "center", children: [{ text: "" }] },
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
      { type, id: "block-b", align: "center", children: [{ text: " world", bold: true }] },
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
    const editor = createEditor([heading(level, "Hello", "block-a")]);
    editor.tf.select(caret([0, 0], 0));

    editor.tf.deleteBackward();

    expect(texts(editor)).toEqual(["Hello"]);
    expect(blockType(editor, 0)).toBe("p");
    expect(blockIds(editor)).toEqual(["block-a"]);
  });

  test("setting font size on heading text keeps the heading", () => {
    const editor = createEditor([heading(level, "Title", "block-a")]);
    editor.tf.select(textRange([0, 0], 0, 5));

    runEditorCommand(editor, setFontSize, "32px");

    expect(blockType(editor, 0)).toBe(type);
    expect(editor.children[0]?.children[0]).toEqual({ text: "Title", fontSize: "32px" });
    expect(blockIds(editor)).toEqual(["block-a"]);
  });

  test("setTextAlign stores align on a heading and setLineHeight does not", () => {
    const editor = createEditor([heading(level, "Title", "block-a")]);
    editor.tf.select(caret([0, 0], 1));

    runEditorCommand(editor, setTextAlign, "center");
    runEditorCommand(editor, setLineHeight, 2);

    expect(field(editor.children[0], "align")).toBe("center");
    expect(field(editor.children[0], "lineHeight")).toBeUndefined();
    expect(blockType(editor, 0)).toBe(type);
  });

  test("a heading round-trips through serialize and parse", () => {
    const document = createEditorDocument("doc-heading", [
      {
        type,
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
      { type, id: "block-a", lineHeight: 2, children: [{ text: "Title" }] },
    ]);
    const result = expectUnsupported(parseEditorDocument(raw));

    expect(result.raw).toBe(raw);
    expect(result.issues[0]?.path).toEqual([0]);
    expect(result.issues[0]?.message).toContain("lineHeight");
    expect(field(raw.content[0], "lineHeight")).toBe(2);
  });

  test(`pasting an h${level} element becomes a heading`, () => {
    const editor = pasteHtml(`<h${level}>Title</h${level}>`);

    expect(texts(editor)).toEqual(["Title"]);
    expect(blockType(editor, 0)).toBe(type);
  });

  test("pasting an editor fragment keeps the heading", () => {
    const editor = createEditor();
    editor.tf.select(caret([0, 0], 0));

    editor.tf.insertFragment([
      { type, id: "kept", align: "center", children: [{ text: "Title", bold: true }] },
    ]);

    expect(texts(editor)).toEqual(["Title"]);
    expect(editor.children.map((block) => block.type)).toEqual([type]);
    expect(blockIds(editor)).toEqual(["kept"]);
    expect(field(editor.children[0], "align")).toBe("center");
    expect(editor.children[0]?.children[0]).toEqual({ text: "Title", bold: true });
  });

  test(`heading ${level} has no markdown input rule`, () => {
    const editor = createEditor();
    const plugin = editor.getPlugin({ key: level === 1 ? KEYS.h1 : KEYS.h2 });

    expect(level === 1 ? KEYS.h1 : KEYS.h2).toBe(type);
    expect(plugin.rules.delete).toEqual({ empty: "reset", start: "default" });
    expect(plugin.rules.break?.splitReset).toBe(true);
    expect(plugin.rules.merge?.removeEmpty).toBe(true);
    expect(plugin.inputRules ?? []).toEqual([]);
    expect(command.id).toBe(`block.turn-into.h${level}`);
    expect(command.label).toBe(`Heading ${level}`);
    expect(command.group).toBe("turn-into");
    expect(editor.meta.shortcuts[`${type}.toggle`]?.keys).toEqual([
      [Key.Mod, Key.Alt, String(level)],
    ]);
  });

  test(`Mod+Alt+${level} toggles a paragraph to a heading and back`, () => {
    const editor = createEditor([
      { type: "p", id: "block-a", align: "right", lineHeight: 2, children: [{ text: "Hello" }] },
    ]);
    editor.tf.select(caret([0, 0], 1));

    pressHeading(editor, level);

    expect(blockType(editor, 0)).toBe(type);
    expect(field(editor.children[0], "lineHeight")).toBeUndefined();
    expect(field(editor.children[0], "align")).toBe("right");
    expect(blockIds(editor)).toEqual(["block-a"]);

    pressHeading(editor, level);

    expect(blockType(editor, 0)).toBe("p");
    expect(field(editor.children[0], "lineHeight")).toBeUndefined();
    expect(texts(editor)).toEqual(["Hello"]);
  });

  test(`Mod+Alt+${level} on a range turns every selected paragraph into a heading`, () => {
    const editor = createEditor([
      { type: "p", id: "block-a", lineHeight: 1.5, children: [{ text: "One" }] },
      { type: "p", id: "block-b", lineHeight: 2, children: [{ text: "Two" }] },
    ]);
    editor.tf.select({
      anchor: { path: [0, 0], offset: 1 },
      focus: { path: [1, 0], offset: 1 },
    });

    pressHeading(editor, level);

    expect(blockType(editor, 0)).toBe(type);
    expect(blockType(editor, 1)).toBe(type);
    expect(field(editor.children[0], "lineHeight")).toBeUndefined();
    expect(field(editor.children[1], "lineHeight")).toBeUndefined();
    expect(blockIds(editor)).toEqual(["block-a", "block-b"]);
  });

  test(`Mod+Alt+${level} does nothing in a read-only editor`, () => {
    const editor = createEditor([paragraph("Hello", "block-a")]);
    editor.tf.select(caret([0, 0], 1));
    editor.dom.readOnly = true;
    const undos = editor.history.undos.length;

    pressHeading(editor, level);

    expect(blockType(editor, 0)).toBe("p");
    expect(editor.history.undos.length).toBe(undos);
  });
});
