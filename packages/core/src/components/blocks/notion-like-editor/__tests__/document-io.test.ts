import { describe, expect, test } from "bun:test";
import { KEYS, type TElement } from "platejs";

import { runEditorCommand } from "../lib/commands/editor-commands";
import type { EditorValue } from "../lib/document/editor-value";
import {
  exportFileName,
  importFormatOf,
  replaceDocument,
} from "../lib/features/editor-document-io";
import { exportEditorDocument } from "../lib/io/export-document";
import { importEditorDocument } from "../lib/io/import-document";
import { createEditor, texts } from "./test-utils";

function paragraph(id: string, text: string): TElement {
  return { type: KEYS.p, id, children: [{ text }] };
}

function documentOf(...texts: string[]): EditorValue {
  return texts.map((text, index) => paragraph(`block-${String(index + 1)}`, text));
}

describe("importFormatOf", () => {
  test("maps each supported extension to its format", () => {
    expect(importFormatOf("notes.json")).toBe("json");
    expect(importFormatOf("page.html")).toBe("html");
    expect(importFormatOf("page.htm")).toBe("html");
    expect(importFormatOf("readme.md")).toBe("markdown");
    expect(importFormatOf("readme.markdown")).toBe("markdown");
  });

  test("ignores case", () => {
    expect(importFormatOf("NOTES.JSON")).toBe("json");
    expect(importFormatOf("Page.HtM")).toBe("html");
    expect(importFormatOf("README.Markdown")).toBe("markdown");
  });

  test("rejects names without a supported extension", () => {
    expect(importFormatOf("notes")).toBeNull();
    expect(importFormatOf("notes.txt")).toBeNull();
    expect(importFormatOf("a.json.txt")).toBeNull();
    expect(importFormatOf("")).toBeNull();
  });
});

describe("exportFileName", () => {
  test("slugs the first block's text", () => {
    expect(exportFileName(documentOf("Hello, World! 2026"), "md")).toBe("hello-world-2026.md");
  });

  test("uses the text of nested leaves", () => {
    const value: EditorValue = [
      {
        type: KEYS.p,
        id: "p",
        children: [{ text: "Plan " }, { text: "Q3", bold: true }, { text: "!" }],
      },
    ];
    expect(exportFileName(value, "json")).toBe("plan-q3.json");
  });

  test("falls back to document when nothing is left after slugging", () => {
    expect(exportFileName(documentOf("!!! ???"), "html")).toBe("document.html");
    expect(exportFileName(documentOf("日本語"), "html")).toBe("document.html");
    expect(exportFileName(documentOf(""), "json")).toBe("document.json");
  });

  test("cuts long titles to 60 characters without a trailing dash", () => {
    const title = `${"a".repeat(59)} ${"b".repeat(140)}`;
    const name = exportFileName(documentOf(title), "md");
    const slug = name.slice(0, -".md".length);
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug.endsWith("-")).toBe(false);
    expect(slug).toBe("a".repeat(59));
  });
});

describe("replaceDocument", () => {
  test("replaces the children with a copy of the payload", () => {
    const editor = createEditor(documentOf("Old"));
    const payload = documentOf("New one", "New two");
    const before = JSON.stringify(payload);

    expect(runEditorCommand(editor, replaceDocument, payload)).toBe(true);

    expect(editor.children).toEqual(payload);
    expect(editor.children).not.toBe(payload);
    expect(JSON.stringify(payload)).toBe(before);
    expect(editor.children[0]).not.toBe(payload[0]);
  });

  test("one undo restores the previous children and one redo re-applies them", () => {
    const editor = createEditor(documentOf("Old", "Older"));
    const previous = JSON.parse(JSON.stringify(editor.children));
    const payload = documentOf("New");

    runEditorCommand(editor, replaceDocument, payload);
    const replaced = JSON.parse(JSON.stringify(editor.children));

    editor.tf.undo();
    expect(JSON.parse(JSON.stringify(editor.children))).toEqual(previous);

    editor.tf.redo();
    expect(JSON.parse(JSON.stringify(editor.children))).toEqual(replaced);
  });

  test("an empty payload changes nothing", () => {
    const editor = createEditor(documentOf("Keep"));
    const children = editor.children;
    const undos = editor.history.undos.length;

    runEditorCommand(editor, replaceDocument, []);

    expect(editor.children).toBe(children);
    expect(editor.history.undos.length).toBe(undos);
  });

  test("a read-only editor refuses and changes nothing", () => {
    const editor = createEditor(documentOf("Keep"));
    const children = editor.children;
    const undos = editor.history.undos.length;

    const ran = runEditorCommand(editor, replaceDocument, documentOf("New"), { readOnly: true });

    expect(ran).toBe(false);
    expect(editor.children).toBe(children);
    expect(editor.history.undos.length).toBe(undos);
  });
});

describe("export and import round trip", () => {
  test("JSON export, import and replace keep block types and texts", async () => {
    const original: EditorValue = [
      paragraph("a", "First block"),
      { type: KEYS.h2, id: "b", children: [{ text: "Heading" }] },
      paragraph("c", "Last block"),
    ];
    const exported = await exportEditorDocument(original, "json");
    const imported = await importEditorDocument(exported.content, "json");
    expect(imported.ok).toBe(true);
    if (!imported.ok) {
      throw new Error("Expected the JSON import to succeed.");
    }

    const editor = createEditor(documentOf("Replace me"));
    runEditorCommand(editor, replaceDocument, imported.value);

    expect(editor.children.map((block) => block.type)).toEqual(original.map((block) => block.type));
    expect(texts(editor)).toEqual(["First block", "Heading", "Last block"]);
  });
});
