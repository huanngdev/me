import { describe, expect, test } from "bun:test";
import { createSlateEditor } from "platejs";

import {
  EDITOR_DOCUMENT_LIMITS,
  createEditorDocument,
  serializeEditorDocument,
} from "./editor-document";
import { normalizeBlockIds } from "./editor-document-ids";
import { migrateEditorDocument } from "./editor-document-migrate";
import { parseEditorDocument } from "./editor-document-validate";
import { createEditorPlugins } from "./editor-plugins";
import type { EditorValue } from "./editor-value";
import { V0_DOCUMENT } from "./fixtures/v0-document";
import { V1_DOCUMENT } from "./fixtures/v1-document";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function parseJson(text: string): unknown {
  const parsed: unknown = JSON.parse(text);
  return parsed;
}

function field(node: unknown, key: string): unknown {
  if (!isRecord(node) || !(key in node)) {
    return undefined;
  }

  return node[key];
}

function blockText(node: unknown): string {
  if (!isRecord(node) || !isUnknownArray(node.children)) {
    throw new Error("Expected a block.");
  }

  const child = node.children[0];
  if (!isRecord(child) || typeof child.text !== "string") {
    throw new Error("Expected text.");
  }

  return child.text;
}

function nestedParagraph(depth: number): unknown {
  if (depth === 0) {
    return { text: "x" };
  }

  return {
    type: "p",
    children: [nestedParagraph(depth - 1)],
  };
}

describe("editor document", () => {
  test("round-trips a serialized document", () => {
    const document = createEditorDocument(V1_DOCUMENT.documentId, V0_DOCUMENT);

    expect(document).toEqual(V1_DOCUMENT);
    expect(serializeEditorDocument(document)).toBe(serializeEditorDocument(document));

    const parsed = parseEditorDocument(parseJson(serializeEditorDocument(document)));

    expect(parsed.status).toBe("ok");
    if (parsed.status !== "ok") {
      return;
    }

    expect(parsed.document.content).toEqual(V0_DOCUMENT);
    expect(parsed.document).toEqual(V1_DOCUMENT);
    expect(parsed.repairs).toEqual([]);
    expect(blockText(parsed.document.content[0])).toBe("Hello");
    expect(field(parsed.document.content[0], "id")).toBe("p1");
  });

  test("keeps a valid paragraph id and text node", () => {
    const content = [
      {
        type: "p",
        id: "p1",
        children: [{ text: "Hello" }],
      },
    ] satisfies EditorValue;
    const result = parseEditorDocument({
      schemaVersion: 1,
      documentId: "doc-shape",
      revision: 0,
      content,
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") {
      return;
    }

    expect(result.document.content).toEqual([
      {
        type: "p",
        id: "p1",
        children: [{ text: "Hello" }],
      },
    ]);
    expect(field(result.document.content[0], "id")).toBe("p1");
    expect(blockText(result.document.content[0])).toBe("Hello");
  });

  test("returns the input content array when no id repair is needed", () => {
    const content = [
      {
        type: "p",
        id: "p1",
        children: [{ text: "Hello" }],
      },
    ] satisfies EditorValue;
    const result = parseEditorDocument({
      schemaVersion: 1,
      documentId: "doc-ref",
      revision: 0,
      content,
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") {
      return;
    }

    expect(result.document.content).toBe(content);
    expect(result.repairs).toEqual([]);
  });

  test("rejects a negative or fractional revision", () => {
    const negative = parseEditorDocument({
      schemaVersion: 1,
      documentId: "doc-revision",
      revision: -1,
      content: V0_DOCUMENT,
    });
    const fractional = parseEditorDocument({
      schemaVersion: 1,
      documentId: "doc-revision",
      revision: 1.5,
      content: V0_DOCUMENT,
    });

    expect(negative.status).toBe("invalid");
    expect(fractional.status).toBe("invalid");
  });

  test("rejects an empty document id", () => {
    const result = parseEditorDocument({
      schemaVersion: 1,
      documentId: "",
      revision: 0,
      content: V0_DOCUMENT,
    });

    expect(result.status).toBe("invalid");
  });

  test("assigns missing ids, repairs duplicate ids, and does not mutate the input", () => {
    const input = [
      { type: "p", children: [{ text: "one" }] },
      { type: "p", id: "dup", children: [{ text: "two" }] },
      { type: "p", id: "dup", children: [{ text: "three" }] },
      { type: "p", id: "", children: [{ text: "four" }] },
      { type: "p", id: 4, children: [{ text: "five" }] },
      {
        type: "p",
        id: "parent",
        children: [{ type: "p", children: [{ text: "child" }] }],
      },
    ] satisfies EditorValue;
    const before = JSON.stringify(input);
    const ids = ["id-a", "id-b", "id-c", "id-d", "id-e"];
    let cursor = 0;
    const createId = (): string => {
      const next = ids[cursor] ?? `extra-${cursor}`;
      cursor += 1;
      return next;
    };

    const first = normalizeBlockIds(input, createId);

    expect(JSON.stringify(input)).toBe(before);
    expect(field(input[0], "id")).toBeUndefined();
    expect(first.content[1]).toBe(input[1]);
    expect(field(first.content[0], "id")).toBe("id-a");
    expect(field(first.content[1], "id")).toBe("dup");
    expect(field(first.content[2], "id")).toBe("id-b");
    expect(field(first.content[3], "id")).toBe("id-c");
    expect(field(first.content[4], "id")).toBe("id-d");
    expect(field(first.content[5], "id")).toBe("parent");
    expect(isRecord(first.content[5]) && isUnknownArray(first.content[5].children)).toBe(true);
    const nested = isRecord(first.content[5]) ? first.content[5].children : undefined;
    const nestedBlock = isUnknownArray(nested) ? nested[0] : undefined;
    expect(field(nestedBlock, "id")).toBe("id-e");
    expect(first.repairs.map((repair) => repair.path)).toEqual([[0], [2], [3], [4], [5, 0]]);

    const second = normalizeBlockIds(first.content, createId);

    expect(second.repairs).toEqual([]);
    expect(second.content).toBe(first.content);
    expect(second.content).toEqual(first.content);
  });

  test("rejects a tree nested deeper than maxDepth", () => {
    const raw = {
      schemaVersion: 1,
      documentId: "doc-depth",
      revision: 0,
      content: [nestedParagraph(EDITOR_DOCUMENT_LIMITS.maxDepth + 8)],
    };
    const result = parseEditorDocument(raw);

    expect(result.status).toBe("invalid");
    if (result.status !== "invalid") {
      return;
    }

    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]?.path.length).toBe(EDITOR_DOCUMENT_LIMITS.maxDepth + 1);
    expect(result.issues[0]?.message).toContain("Restore from a backup");
    expect(result.raw).toBe(raw);
  });

  test("rejects a tree with more nodes than maxNodes", () => {
    const children = Array.from({ length: EDITOR_DOCUMENT_LIMITS.maxNodes }, () => ({ text: "x" }));
    const raw = {
      schemaVersion: 1,
      documentId: "doc-nodes",
      revision: 0,
      content: [{ type: "p", id: "root", children }],
    };
    const result = parseEditorDocument(raw);

    expect(result.status).toBe("invalid");
    if (result.status !== "invalid") {
      return;
    }

    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]?.message).toContain(String(EDITOR_DOCUMENT_LIMITS.maxNodes));
    expect(result.issues[0]?.message).toContain("Restore from a backup");
    expect(result.raw).toBe(raw);
  });

  test("rejects a document larger than maxBytes", () => {
    const raw = {
      schemaVersion: 1,
      documentId: "doc-bytes",
      revision: 0,
      content: [
        {
          type: "p",
          id: "big",
          children: [{ text: "x".repeat(EDITOR_DOCUMENT_LIMITS.maxBytes) }],
        },
      ],
    };
    const result = parseEditorDocument(raw);

    expect(result.status).toBe("invalid");
    if (result.status !== "invalid") {
      return;
    }

    expect(result.issues[0]?.path).toEqual([]);
    expect(result.issues[0]?.message).toContain(String(EDITOR_DOCUMENT_LIMITS.maxBytes));
    expect(result.raw).toBe(raw);
  });

  test("reports an unknown element type as unsupported and keeps the raw input", () => {
    const raw = {
      schemaVersion: 1,
      documentId: "doc-unknown",
      revision: 0,
      content: [{ type: "h1", id: "h", children: [{ text: "Title" }] }],
    };
    const result = parseEditorDocument(raw);

    expect(result.status).toBe("unsupported");
    if (result.status !== "unsupported") {
      return;
    }

    expect(result.raw).toBe(raw);
    expect(result.issues[0]?.path).toEqual([0]);
    expect(result.issues[0]?.message).toContain("h1");
    expect(field(raw.content[0], "type")).toBe("h1");
  });

  test("reports an unknown attribute as unsupported and keeps the raw input", () => {
    const raw = {
      schemaVersion: 1,
      documentId: "doc-attr",
      revision: 0,
      content: [{ type: "p", id: "p", align: "center", children: [{ text: "Hi" }] }],
    };
    const result = parseEditorDocument(raw);

    expect(result.status).toBe("unsupported");
    if (result.status !== "unsupported") {
      return;
    }

    expect(result.raw).toBe(raw);
    expect(result.issues[0]?.path).toEqual([0]);
    expect(result.issues[0]?.message).toContain("align");
    expect(field(raw.content[0], "align")).toBe("center");
  });

  test("reports an unknown mark as unsupported and keeps the raw input", () => {
    const raw = {
      schemaVersion: 1,
      documentId: "doc-mark",
      revision: 0,
      content: [{ type: "p", id: "p", children: [{ text: "Hi", bold: true }] }],
    };
    const result = parseEditorDocument(raw);

    expect(result.status).toBe("unsupported");
    if (result.status !== "unsupported") {
      return;
    }

    expect(result.raw).toBe(raw);
    expect(result.issues[0]?.path).toEqual([0, 0]);
    expect(result.issues[0]?.message).toContain("bold");
    const text = isRecord(raw.content[0]) ? raw.content[0].children : undefined;
    const textNode = isUnknownArray(text) ? text[0] : undefined;
    expect(field(textNode, "bold")).toBe(true);
  });

  test("reports a future schema version without reading the tree", () => {
    const raw = {
      schemaVersion: 2,
      content: [{ type: "p", id: "x" }, { text: "x".repeat(EDITOR_DOCUMENT_LIMITS.maxBytes) }],
    };
    const result = parseEditorDocument(raw);

    expect(result.status).toBe("future-version");
    if (result.status !== "future-version") {
      return;
    }

    expect(result.schemaVersion).toBe(2);
    expect(result.raw).toBe(raw);
  });

  test("reports a block with no children", () => {
    const raw = {
      schemaVersion: 1,
      documentId: "doc-children",
      revision: 0,
      content: [
        { type: "p", id: "a", children: [{ text: "a" }] },
        { type: "p", id: "b", children: [{ text: "b" }] },
        { type: "p", id: "c" },
      ],
    };
    const result = parseEditorDocument(raw);

    expect(result.status).toBe("invalid");
    if (result.status !== "invalid") {
      return;
    }

    expect(result.issues).toEqual([
      {
        path: [2],
        message: "Block 3 has no children. Restore from a backup or remove the block.",
      },
    ]);
    expect(result.raw).toBe(raw);
  });

  test("reports a text node whose text is not a string", () => {
    const raw = {
      schemaVersion: 1,
      documentId: "doc-text",
      revision: 0,
      content: [{ type: "p", id: "p", children: [{ text: 1 }] }],
    };
    const result = parseEditorDocument(raw);

    expect(result.status).toBe("invalid");
    if (result.status !== "invalid") {
      return;
    }

    expect(result.issues).toEqual([
      {
        path: [0, 0],
        message:
          "Block 1.1 has text that is not a string. Restore from a backup or retype that block.",
      },
    ]);
    expect(result.raw).toBe(raw);
  });

  test("rejects blob and data urls", () => {
    const blob = {
      schemaVersion: 1,
      documentId: "doc-blob",
      revision: 0,
      content: [
        {
          type: "p",
          id: "p",
          url: "blob:http://localhost/1",
          children: [{ text: "a" }],
        },
      ],
    };
    const blobResult = parseEditorDocument(blob);

    expect(blobResult.status).toBe("invalid");
    if (blobResult.status !== "invalid") {
      return;
    }

    expect(blobResult.issues[0]?.path).toEqual([0]);
    expect(blobResult.issues[0]?.message).toContain("blob:");
    expect(blobResult.issues[0]?.message).toContain("Restore from a backup");
    expect(blobResult.raw).toBe(blob);

    const data = {
      schemaVersion: 1,
      documentId: "doc-data",
      revision: 0,
      content: [
        {
          type: "p",
          id: "p",
          src: "data:image/png;base64,aaaa",
          children: [{ text: "a" }],
        },
      ],
    };
    const dataResult = parseEditorDocument(data);

    expect(dataResult.status).toBe("invalid");
    if (dataResult.status !== "invalid") {
      return;
    }

    expect(dataResult.issues[0]?.path).toEqual([0]);
    expect(dataResult.issues[0]?.message).toContain("data:");
    expect(dataResult.raw).toBe(data);
  });

  test("wraps a v0 value in a v1 envelope and leaves v1 unchanged", () => {
    const once = migrateEditorDocument(V0_DOCUMENT, "doc-golden");

    expect(once).toEqual(V1_DOCUMENT);
    expect(migrateEditorDocument(once, "other-id")).toBe(once);
    expect(migrateEditorDocument(once, "other-id")).toEqual(once);
    expect(migrateEditorDocument(V1_DOCUMENT, "other-id")).toBe(V1_DOCUMENT);

    const parsed = parseEditorDocument(once);

    expect(parsed.status).toBe("ok");
    if (parsed.status !== "ok") {
      return;
    }

    expect(parsed.document).toEqual(V1_DOCUMENT);
    expect(parsed.repairs).toEqual([]);
  });

  test("parse assigns a missing id and reports the repair", () => {
    const raw = {
      schemaVersion: 1,
      documentId: "doc-repair",
      revision: 0,
      content: [{ type: "p", children: [{ text: "Hi" }] }],
    };
    const before = JSON.stringify(raw);
    const result = parseEditorDocument(raw);

    expect(JSON.stringify(raw)).toBe(before);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") {
      return;
    }

    expect(result.repairs).toHaveLength(1);
    expect(result.repairs[0]?.path).toEqual([0]);
    expect(typeof field(result.document.content[0], "id")).toBe("string");
    expect(field(result.document.content[0], "id")).not.toBe("");

    const again = parseEditorDocument(result.document);

    expect(again.status).toBe("ok");
    if (again.status !== "ok") {
      return;
    }

    expect(again.repairs).toEqual([]);
    expect(again.document.content).toEqual(result.document.content);
  });

  test("moving a block keeps its id and inserting a block gets a new id", () => {
    const editor = createSlateEditor({
      plugins: createEditorPlugins(),
      value: [
        { type: "p", id: "keep-a", children: [{ text: "one" }] },
        { type: "p", id: "keep-b", children: [{ text: "two" }] },
      ],
    });

    editor.tf.moveNodes({ at: [1], to: [0] });

    expect(field(editor.children[0], "id")).toBe("keep-b");
    expect(blockText(editor.children[0])).toBe("two");
    expect(field(editor.children[1], "id")).toBe("keep-a");
    expect(blockText(editor.children[1])).toBe("one");

    editor.tf.insertNodes(
      { type: "p", children: [{ text: "three" }] },
      { at: [editor.children.length] },
    );

    const insertedId = field(editor.children[2], "id");

    expect(typeof insertedId).toBe("string");
    expect(insertedId).not.toBe("keep-a");
    expect(insertedId).not.toBe("keep-b");
    expect(insertedId).not.toBe("");
    expect(blockText(editor.children[2])).toBe("three");
  });
});
