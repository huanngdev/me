import { describe, expect, test } from "bun:test";
import { KEYS, type SlateEditor, type TElement } from "platejs";
import { Key, Plate, PlateContent, createPlateEditor } from "platejs/react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  createTurnIntoToggleHeading,
  getBlockType,
  runEditorCommand,
  TURN_INTO_HEADING,
  turnIntoToggle,
  type HeadingLevel,
} from "../lib/commands/editor-commands";
import { createEditorDocument } from "../lib/document/editor-document";
import {
  allowsFirstChild,
  firstChildTypes,
  reportedFirstChild,
} from "../lib/document/editor-document-schema";
import { parseEditorDocument } from "../lib/document/editor-document-validate";
import { createEditorPlugins } from "../lib/plugins/editor-plugins";
import { readToggleOpenIds, toggleOpen } from "../lib/plugins/editor-toggle";
import { headingAnchorId } from "../components/elements/heading-element";
import { TOGGLE_LABEL_MARGIN_CLASS } from "../components/elements/toggle-element";
import type { EditorValue } from "../lib/document/editor-value";
import {
  caret,
  createEditor,
  deserializeHtmlInDom,
  expectOk,
  expectUnsupported,
  field,
  isRecord,
} from "./test-utils";

function paragraph(
  text: string,
  id: string,
  extra: { indent?: number; listStyleType?: string; align?: string } = {},
): TElement {
  return { type: "p", id, ...extra, children: [{ text }] };
}

function heading(
  level: HeadingLevel,
  text: string,
  id: string,
  extra: { align?: string; bold?: boolean; listStyleType?: string } = {},
): TElement {
  const { bold, ...attrs } = extra;
  const leaf = bold ? { text, bold: true } : { text };
  return { type: `h${level}`, id, ...attrs, children: [leaf] };
}

function toggle(id: string, children: TElement[]): TElement {
  return { type: "toggle", id, children };
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

function childTypes(node: unknown): string[] {
  return childrenOf(node).map((child) => {
    const type = field(child, "type");
    return typeof type === "string" ? type : "";
  });
}

function childIds(node: unknown): string[] {
  return childrenOf(node).map((child) => {
    const id = field(child, "id");
    return typeof id === "string" ? id : "";
  });
}

function childTexts(node: unknown): string[] {
  return childrenOf(node).map((child) => nodeText(child));
}

function typesOf(editor: SlateEditor): string[] {
  return editor.children.map((block) => block.type);
}

function bodyOf(node: unknown): unknown[] {
  return childrenOf(node).slice(1);
}

function snapshot(value: unknown): string {
  return JSON.stringify(value);
}

function storedToggle(level: HeadingLevel = 2): TElement {
  return toggle("toggle-1", [
    heading(level, "Title", "heading-1", { align: "center", bold: true }),
    paragraph("Body", "para-1"),
    paragraph("Item", "para-2", { indent: 1, listStyleType: "disc" }),
  ]);
}

function pasteHtml(html: string): SlateEditor {
  const editor = createEditor();
  editor.tf.select(caret([0, 0], 0));
  editor.tf.insertFragment(deserializeHtmlInDom(editor, html));
  return editor;
}

function pressHeading(editor: SlateEditor, level: HeadingLevel): void {
  const shortcut = editor.meta.shortcuts[`h${level}.toggle`];
  if (!shortcut?.handler) {
    throw new Error(`Missing h${level} shortcut.`);
  }

  shortcut.handler({ editor });
}

function renderToggle(value: EditorValue): string {
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

describe("toggle heading schema", () => {
  test("the label may be a paragraph or a heading, and the reported names come from the rule", () => {
    expect(firstChildTypes("toggle")).toEqual(["p", "h1", "h2", "h3"]);
    expect(allowsFirstChild("toggle", "h2")).toBe(true);
    expect(allowsFirstChild("toggle", "h4")).toBe(false);
    expect(allowsFirstChild("blockquote", "h2")).toBe(false);
    expect(reportedFirstChild("toggle", "h1")).toBe("toggle-h1");
    expect(reportedFirstChild("toggle", "h2")).toBe("toggle-h2");
    expect(reportedFirstChild("toggle", "h3")).toBe("toggle-h3");
    expect(reportedFirstChild("toggle", "p")).toBeUndefined();
  });

  test.each([1, 2, 3] as const)(
    "an h%i label round-trips with its align, mark, and body",
    (level) => {
      const content = [storedToggle(level)];
      const parsed = expectOk(parseEditorDocument(createEditorDocument("doc", content)));

      expect(parsed.repairs).toEqual([]);
      expect(parsed.document.content).toEqual(content);
    },
  );

  test("an h4 label is unsupported and the raw document is kept", () => {
    const raw = createEditorDocument("doc-h4", [
      toggle("toggle-1", [{ type: "h4", id: "heading-1", children: [{ text: "Title" }] }]),
    ]);
    const result = expectUnsupported(parseEditorDocument(raw));

    expect(result.issues[0]?.message).toContain('unsupported first child type "h4"');
    expect(result.raw).toBe(raw);
  });

  test("a heading in the content is unsupported and the raw document is kept", () => {
    const raw = createEditorDocument("doc-content", [
      toggle("toggle-1", [
        paragraph("Label", "para-1"),
        { type: "h2", id: "heading-1", children: [{ text: "Title" }] },
      ]),
    ]);
    const result = expectUnsupported(parseEditorDocument(raw));
    const messages = result.issues.map((issue) => issue.message).join("\n");

    expect(messages).toContain('unsupported child type "h2"');
    expect(result.raw).toBe(raw);
  });

  test("a heading label with listStyleType is unsupported and the raw document is kept", () => {
    const raw = createEditorDocument("doc-label-list", [
      toggle("toggle-1", [heading(2, "Title", "heading-1", { listStyleType: "disc" })]),
    ]);
    const result = expectUnsupported(parseEditorDocument(raw));
    const messages = result.issues.map((issue) => issue.message).join("\n");

    expect(messages).toContain("unsupported label listStyleType");
    expect(result.raw).toBe(raw);
  });

  test("normalizing keeps a heading label and turns a content heading into a paragraph", () => {
    const editor = createEditor([
      toggle("toggle-1", [
        heading(2, "Title", "heading-1", { align: "right" }),
        {
          type: "h3",
          id: "heading-2",
          align: "center",
          children: [{ text: "Inside", bold: true }],
        },
        paragraph("Body", "para-1"),
      ]),
    ]);
    editor.tf.normalize({ force: true });

    expect(childTypes(editor.children[0])).toEqual(["h2", "p", "p"]);
    expect(childTexts(editor.children[0])).toEqual(["Title", "Inside", "Body"]);
    expect(childIds(editor.children[0])).toEqual(["heading-1", "heading-2", "para-1"]);
    expect(field(childrenOf(editor.children[0])[0], "align")).toBe("right");
    expect(childrenOf(editor.children[0])[0]).toMatchObject({
      children: [{ text: "Title" }],
    });
    expect(field(childrenOf(editor.children[0])[1], "align")).toBe("center");
  });

  test("normalizing an h4 label demotes it to content under an empty paragraph label", () => {
    const editor = createEditor([
      toggle("toggle-1", [
        { type: "h4", id: "heading-1", children: [{ text: "Title" }] },
        paragraph("Body", "para-1"),
      ]),
    ]);
    editor.tf.normalize({ force: true });

    expect(childTypes(editor.children[0])).toEqual(["p", "p", "p"]);
    expect(childTexts(editor.children[0])).toEqual(["", "Title", "Body"]);
    expect(field(editor.children[0], "id")).toBe("toggle-1");
  });
});

describe("toggle heading commands", () => {
  test("turn into heading converts the label in place, keeps the body, and undoes in one step", () => {
    const editor = createEditor([storedToggle(2)]);
    editor.tf.setNodes({ type: "p" }, { at: [0, 0] });
    editor.tf.select(caret([0, 0, 0], 1));
    const body = snapshot(bodyOf(editor.children[0]));
    const before = editor.history.undos.length;

    expect(runEditorCommand(editor, TURN_INTO_HEADING[2], undefined)).toBe(true);

    expect(childTypes(editor.children[0])).toEqual(["h2", "p", "p"]);
    expect(field(editor.children[0], "id")).toBe("toggle-1");
    expect(field(childrenOf(editor.children[0])[0], "id")).toBe("heading-1");
    expect(snapshot(bodyOf(editor.children[0]))).toBe(body);
    expect(editor.history.undos.length - before).toBe(1);

    editor.tf.undo();

    expect(childTypes(editor.children[0])).toEqual(["p", "p", "p"]);
    expect(snapshot(bodyOf(editor.children[0]))).toBe(body);
  });

  test("the same heading command on a heading label toggles it back to a paragraph", () => {
    const editor = createEditor([storedToggle(2)]);
    editor.tf.select(caret([0, 0, 0], 1));
    const body = snapshot(bodyOf(editor.children[0]));
    const before = editor.history.undos.length;

    expect(runEditorCommand(editor, TURN_INTO_HEADING[2], undefined)).toBe(true);

    expect(typesOf(editor)).toEqual(["toggle"]);
    expect(childTypes(editor.children[0])).toEqual(["p", "p", "p"]);
    expect(field(editor.children[0], "id")).toBe("toggle-1");
    expect(nodeText(childrenOf(editor.children[0])[0])).toBe("Title");
    expect(snapshot(bodyOf(editor.children[0]))).toBe(body);
    expect(editor.history.undos.length - before).toBe(1);

    editor.tf.undo();

    expect(childTypes(editor.children[0])[0]).toBe("h2");
    expect(snapshot(bodyOf(editor.children[0]))).toBe(body);
  });

  test("turn into heading on toggle content lifts the heading out", () => {
    const editor = createEditor([
      toggle("toggle-1", [heading(2, "Title", "heading-1"), paragraph("Body", "para-1")]),
    ]);
    editor.tf.select(caret([0, 1, 0], 1));
    const before = editor.history.undos.length;

    expect(runEditorCommand(editor, TURN_INTO_HEADING[1], undefined)).toBe(true);

    expect(typesOf(editor)).toEqual(["toggle", "h1"]);
    expect(childTypes(editor.children[0])).toEqual(["h2"]);
    expect(childTexts(editor.children[0])).toEqual(["Title"]);
    expect(field(editor.children[0], "id")).toBe("toggle-1");
    expect(nodeText(editor.children[1])).toBe("Body");
    expect(field(editor.children[1], "id")).toBe("para-1");
    expect(editor.history.undos.length - before).toBe(1);

    editor.tf.undo();

    expect(typesOf(editor)).toEqual(["toggle"]);
    expect(childTexts(editor.children[0])).toEqual(["Title", "Body"]);
  });

  test("turn into toggle on a heading keeps it as the label and opens", () => {
    const editor = createEditor([
      heading(2, "Title", "heading-1", { align: "center", bold: true }),
      paragraph("Body", "para-1"),
    ]);
    editor.tf.select({
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [1, 0], offset: 4 },
    });
    const before = editor.history.undos.length;

    expect(runEditorCommand(editor, turnIntoToggle, undefined)).toBe(true);

    expect(typesOf(editor)).toEqual(["toggle"]);
    expect(childTypes(editor.children[0])).toEqual(["h2", "p"]);
    expect(childIds(editor.children[0])).toEqual(["heading-1", "para-1"]);
    expect(childTexts(editor.children[0])).toEqual(["Title", "Body"]);
    expect(field(childrenOf(editor.children[0])[0], "align")).toBe("center");
    expect(childrenOf(childrenOf(editor.children[0])[0])[0]).toEqual({ text: "Title", bold: true });
    expect(readToggleOpenIds(editor).has(String(field(editor.children[0], "id")))).toBe(true);
    expect(editor.history.undos.length - before).toBe(1);

    editor.tf.undo();

    expect(typesOf(editor)).toEqual(["h2", "p"]);
  });

  test("toggle heading from a paragraph wraps it and sets the label level in one undo", () => {
    const editor = createEditor([paragraph("Hello", "para-1")]);
    editor.tf.select(caret([0, 0], 1));
    const command = createTurnIntoToggleHeading(2);
    const before = editor.history.undos.length;

    expect(command.id).toBe("block.turn-into.toggle-h2");
    expect(command.label).toBe("Toggle heading 2");
    expect(command.group).toBe("turn-into");
    expect(runEditorCommand(editor, command, undefined)).toBe(true);

    expect(typesOf(editor)).toEqual(["toggle"]);
    expect(childTypes(editor.children[0])).toEqual(["h2"]);
    expect(nodeText(childrenOf(editor.children[0])[0])).toBe("Hello");
    expect(field(childrenOf(editor.children[0])[0], "id")).toBe("para-1");
    expect(readToggleOpenIds(editor).has(String(field(editor.children[0], "id")))).toBe(true);
    expect(editor.history.undos.length - before).toBe(1);

    editor.tf.undo();

    expect(typesOf(editor)).toEqual(["p"]);
    expect(nodeText(editor.children[0])).toBe("Hello");
    expect(field(editor.children[0], "id")).toBe("para-1");
  });

  test("toggle heading from a toggle sets the label level and keeps the body", () => {
    const editor = createEditor([
      toggle("toggle-1", [paragraph("Hello", "para-1"), paragraph("Body", "para-2")]),
    ]);
    editor.tf.select(caret([0, 0, 0], 1));
    const body = snapshot(bodyOf(editor.children[0]));
    const before = editor.history.undos.length;

    expect(runEditorCommand(editor, createTurnIntoToggleHeading(3), undefined)).toBe(true);

    expect(typesOf(editor)).toEqual(["toggle"]);
    expect(childTypes(editor.children[0])).toEqual(["h3", "p"]);
    expect(field(editor.children[0], "id")).toBe("toggle-1");
    expect(field(childrenOf(editor.children[0])[0], "id")).toBe("para-1");
    expect(nodeText(childrenOf(editor.children[0])[0])).toBe("Hello");
    expect(snapshot(bodyOf(editor.children[0]))).toBe(body);
    expect(editor.history.undos.length - before).toBe(1);

    editor.tf.undo();

    expect(childTypes(editor.children[0])).toEqual(["p", "p"]);
    expect(snapshot(bodyOf(editor.children[0]))).toBe(body);
  });

  test("toggle heading on the same level reverts the label to a paragraph", () => {
    const editor = createEditor([storedToggle(1)]);
    editor.tf.select(caret([0, 0, 0], 1));
    const body = snapshot(bodyOf(editor.children[0]));
    const before = editor.history.undos.length;

    expect(runEditorCommand(editor, createTurnIntoToggleHeading(1), undefined)).toBe(true);

    expect(typesOf(editor)).toEqual(["toggle"]);
    expect(childTypes(editor.children[0])).toEqual(["p", "p", "p"]);
    expect(field(editor.children[0], "id")).toBe("toggle-1");
    expect(nodeText(childrenOf(editor.children[0])[0])).toBe("Title");
    expect(snapshot(bodyOf(editor.children[0]))).toBe(body);
    expect(editor.history.undos.length - before).toBe(1);

    editor.tf.undo();

    expect(childTypes(editor.children[0])[0]).toBe("h1");
    expect(snapshot(bodyOf(editor.children[0]))).toBe(body);
  });

  test("changing heading level on the label keeps the toggle, the label, and the body", () => {
    const editor = createEditor([storedToggle(1)]);
    editor.tf.select(caret([0, 0, 0], 1));
    const body = snapshot(bodyOf(editor.children[0]));

    expect(runEditorCommand(editor, TURN_INTO_HEADING[2], undefined)).toBe(true);
    expect(runEditorCommand(editor, TURN_INTO_HEADING[3], undefined)).toBe(true);

    const label = childrenOf(editor.children[0])[0];
    expect(field(editor.children[0], "id")).toBe("toggle-1");
    expect(field(label, "type")).toBe("h3");
    expect(field(label, "id")).toBe("heading-1");
    expect(field(label, "align")).toBe("center");
    expect(childrenOf(label)[0]).toEqual({ text: "Title", bold: true });
    expect(snapshot(bodyOf(editor.children[0]))).toBe(body);
  });

  test("toggle heading commands do nothing in a read-only editor", () => {
    const editor = createEditor([storedToggle(2)]);
    editor.tf.select(caret([0, 0, 0], 1));
    const children = snapshot(editor.children);
    const undos = editor.history.undos.length;

    expect(runEditorCommand(editor, TURN_INTO_HEADING[1], undefined, { readOnly: true })).toBe(
      false,
    );
    expect(runEditorCommand(editor, turnIntoToggle, undefined, { readOnly: true })).toBe(false);
    expect(
      runEditorCommand(editor, createTurnIntoToggleHeading(3), undefined, { readOnly: true }),
    ).toBe(false);
    expect(snapshot(editor.children)).toBe(children);
    expect(editor.history.undos.length).toBe(undos);
  });
});

describe("toggle heading block type", () => {
  test.each([1, 2, 3] as const)(
    "the caret in an h%i label reports that toggle heading",
    (level) => {
      const editor = createEditor([storedToggle(level)]);
      editor.tf.select(caret([0, 0, 0], 1));

      expect(getBlockType(editor)).toBe(`toggle-h${level}`);
    },
  );

  test("a paragraph label reports toggle, and content keeps its own type", () => {
    const editor = createEditor([
      toggle("toggle-1", [
        paragraph("Label", "para-1"),
        paragraph("Body", "para-2"),
        paragraph("Item", "para-3", { indent: 1, listStyleType: "disc" }),
      ]),
    ]);

    editor.tf.select(caret([0, 0, 0], 1));
    expect(getBlockType(editor)).toBe("toggle");

    editor.tf.select(caret([0, 1, 0], 1));
    expect(getBlockType(editor)).toBe("p");

    editor.tf.select(caret([0, 2, 0], 1));
    expect(getBlockType(editor)).toBe("bulleted-list");
  });

  test("a selection from a heading label into the content is mixed", () => {
    const editor = createEditor([storedToggle(2)]);
    editor.tf.select({
      anchor: { path: [0, 0, 0], offset: 1 },
      focus: { path: [0, 1, 0], offset: 1 },
    });

    expect(getBlockType(editor)).toBe("mixed");
  });
});

describe("toggle heading rendering", () => {
  test.each([1, 2, 3] as const)(
    "an h%i label renders as that heading, with its anchor and chevron name",
    (level) => {
      const html = renderToggle([storedToggle(level)]);
      const escapedMargin = TOGGLE_LABEL_MARGIN_CLASS.replaceAll("&", "&amp;").replaceAll(
        ">",
        "&gt;",
      );

      expect(html).toContain(`<h${level}`);
      expect(html).toContain(`id="${headingAnchorId("heading-1")}"`);
      expect(html).toContain('aria-label="Expand Title"');
      expect(html).toContain("h-[1lh]");
      expect(html).toContain(level === 1 ? "text-3xl" : level === 2 ? "text-2xl" : "text-xl");
      expect(html).toContain("leading-tight");
      expect(html).toContain(escapedMargin);
    },
  );
});

describe("toggle heading keyboard", () => {
  test("Enter at the end of an open heading label inserts a paragraph at index 1", () => {
    const editor = createEditor([storedToggle(2)]);
    const plugin = editor.getPlugin({ key: KEYS.h2 });
    toggleOpen(editor, "toggle-1", true);
    editor.tf.select(caret([0, 0, 0], 5));

    editor.tf.insertBreak();

    expect(plugin.rules.break?.splitReset).toBe(true);
    expect(typesOf(editor)).toEqual(["toggle"]);
    expect(childTypes(editor.children[0])).toEqual(["h2", "p", "p", "p"]);
    expect(childTexts(editor.children[0])).toEqual(["Title", "", "Body", "Item"]);
    expect(childIds(editor.children[0])[0]).toBe("heading-1");
    expect(editor.selection).toEqual(caret([0, 1, 0], 0));
  });

  test("Enter at the end of a closed heading label inserts a paragraph after the toggle", () => {
    const editor = createEditor([storedToggle(3)]);
    editor.tf.select(caret([0, 0, 0], 5));

    editor.tf.insertBreak();

    expect(typesOf(editor)).toEqual(["toggle", "p"]);
    expect(childTypes(editor.children[0])).toEqual(["h3", "p", "p"]);
    expect(childTexts(editor.children[0])).toEqual(["Title", "Body", "Item"]);
    expect(nodeText(editor.children[1])).toBe("");
    expect(editor.selection).toEqual(caret([1, 0], 0));
  });

  test("Backspace at the start of a heading label unwraps and keeps the heading", () => {
    const editor = createEditor([storedToggle(1)]);
    editor.tf.select(caret([0, 0, 0], 0));

    editor.tf.deleteBackward();

    expect(typesOf(editor)).toEqual(["h1", "p", "p"]);
    expect(childIds({ children: editor.children })).toEqual(["heading-1", "para-1", "para-2"]);
    expect(editor.children.map((block) => nodeText(block))).toEqual(["Title", "Body", "Item"]);
    expect(field(editor.children[0], "align")).toBe("center");
    expect(editor.selection).toEqual(caret([0, 0], 0));
  });

  test("collapsing with the caret in the body moves it to the end of the heading label", () => {
    const editor = createEditor([storedToggle(2)]);
    toggleOpen(editor, "toggle-1", true);
    editor.tf.select(caret([0, 1, 0], 1));

    toggleOpen(editor, "toggle-1", false);

    expect(readToggleOpenIds(editor).has("toggle-1")).toBe(false);
    expect(editor.selection).toEqual(caret([0, 0, 0], 5));
    expect(childTexts(editor.children[0])).toEqual(["Title", "Body", "Item"]);
  });

  test("Mod+Alt+2 on a label converts it in place and toggles it back", () => {
    const editor = createEditor([
      toggle("toggle-1", [paragraph("Hello", "para-1"), paragraph("Body", "para-2")]),
    ]);
    editor.tf.select(caret([0, 0, 0], 1));
    const body = snapshot(bodyOf(editor.children[0]));

    expect(editor.meta.shortcuts["h2.toggle"]?.keys).toEqual([[Key.Mod, Key.Alt, "2"]]);

    pressHeading(editor, 2);

    expect(childTypes(editor.children[0])).toEqual(["h2", "p"]);
    expect(field(editor.children[0], "id")).toBe("toggle-1");
    expect(snapshot(bodyOf(editor.children[0]))).toBe(body);

    pressHeading(editor, 2);

    expect(childTypes(editor.children[0])).toEqual(["p", "p"]);
    expect(field(editor.children[0], "id")).toBe("toggle-1");
    expect(nodeText(childrenOf(editor.children[0])[0])).toBe("Hello");
    expect(snapshot(bodyOf(editor.children[0]))).toBe(body);
  });
});

describe("toggle heading paste", () => {
  test("details with an h2 summary becomes a toggle heading", () => {
    const editor = pasteHtml("<details><summary><h2>Title</h2></summary><p>a</p></details>");

    expect(typesOf(editor)).toEqual(["toggle"]);
    expect(childTypes(editor.children[0])).toEqual(["h2", "p"]);
    expect(childTexts(editor.children[0])).toEqual(["Title", "a"]);
    expect(readToggleOpenIds(editor).has(String(field(editor.children[0], "id")))).toBe(true);
  });

  test("a summary with mixed inline content stays a paragraph label", () => {
    const editor = pasteHtml("<details><summary><h2>Title</h2> extra</summary><p>a</p></details>");

    expect(typesOf(editor)).toEqual(["toggle"]);
    expect(childTypes(editor.children[0])[0]).toBe("p");
    expect(childTexts(editor.children[0])[0]).toContain("Title");
    expect(childTexts(editor.children[0])[0]).toContain("extra");
    expect(childTexts(editor.children[0])[1]).toBe("a");
  });

  test("an editor fragment keeps a toggle heading", () => {
    const editor = createEditor();
    editor.tf.select(caret([0, 0], 0));

    editor.tf.insertFragment([storedToggle(2)]);

    expect(typesOf(editor)).toEqual(["toggle"]);
    expect(childTypes(editor.children[0])).toEqual(["h2", "p", "p"]);
    expect(childTexts(editor.children[0])).toEqual(["Title", "Body", "Item"]);
    expect(childIds(editor.children[0])).toEqual(["heading-1", "para-1", "para-2"]);
    expect(field(editor.children[0], "id")).toBe("toggle-1");
    expect(field(childrenOf(editor.children[0])[0], "align")).toBe("center");
    expect(readToggleOpenIds(editor).has("toggle-1")).toBe(true);
  });
});
