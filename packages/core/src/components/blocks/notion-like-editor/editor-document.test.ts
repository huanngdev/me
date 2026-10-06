import { describe, expect, test } from "bun:test";

import {
  EDITOR_DOCUMENT_LIMITS,
  createEditorDocument,
  serializeEditorDocument,
} from "./editor-document";
import { normalizeBlockIds } from "./editor-document-ids";
import { migrateEditorDocument } from "./editor-document-migrate";
import { parseEditorDocument } from "./editor-document-validate";
import type { EditorValue } from "./editor-value";
import { V0_DOCUMENT } from "./fixtures/v0-document";
import { V1_DOCUMENT } from "./fixtures/v1-document";
import {
  blockIds,
  createEditor,
  expectFuture,
  expectInvalid,
  expectOk,
  expectUnsupported,
  field,
  isRecord,
  texts,
} from "./test-utils";

function parseJson(text: string): unknown {
  const parsed: unknown = JSON.parse(text);
  return parsed;
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

function envelope<T>(documentId: string, content: T, revision = 0) {
  return {
    schemaVersion: 1,
    documentId,
    revision,
    content,
  };
}

describe("document validation", () => {
  test("a serialized document round-trips through parse", () => {
    const document = createEditorDocument(V1_DOCUMENT.documentId, V0_DOCUMENT);
    const serialized = serializeEditorDocument(document);

    const parsed = expectOk(parseEditorDocument(parseJson(serialized)));

    expect(document).toEqual(V1_DOCUMENT);
    expect(serializeEditorDocument(document)).toBe(serialized);
    expect(parsed.document.content).toEqual(V0_DOCUMENT);
    expect(parsed.document).toEqual(V1_DOCUMENT);
    expect(parsed.repairs).toEqual([]);
    expect(texts(createEditor(parsed.document.content))).toEqual(["Hello"]);
    expect(field(parsed.document.content[0], "id")).toBe("p1");
  });

  test("a valid paragraph keeps its id and text", () => {
    const content = [
      {
        type: "p",
        id: "p1",
        children: [{ text: "Hello" }],
      },
    ] satisfies EditorValue;

    const result = expectOk(parseEditorDocument(envelope("doc-shape", content)));

    expect(result.document.content).toEqual([
      {
        type: "p",
        id: "p1",
        children: [{ text: "Hello" }],
      },
    ]);
    expect(field(result.document.content[0], "id")).toBe("p1");
    expect(texts(createEditor(result.document.content))).toEqual(["Hello"]);
  });

  test("parse returns the same content array when no id repair is needed", () => {
    const content = [
      {
        type: "p",
        id: "p1",
        children: [{ text: "Hello" }],
      },
    ] satisfies EditorValue;

    const result = expectOk(parseEditorDocument(envelope("doc-ref", content)));

    expect(result.document.content).toBe(content);
    expect(result.repairs).toEqual([]);
  });

  test("a negative revision is invalid", () => {
    const result = parseEditorDocument(envelope("doc-revision", V0_DOCUMENT, -1));

    expect(result.status).toBe("invalid");
  });

  test("a fractional revision is invalid", () => {
    const result = parseEditorDocument(envelope("doc-revision", V0_DOCUMENT, 1.5));

    expect(result.status).toBe("invalid");
  });

  test("an empty document id is invalid", () => {
    const result = parseEditorDocument(envelope("", V0_DOCUMENT));

    expect(result.status).toBe("invalid");
  });

  test("a missing document is invalid", () => {
    const result = expectInvalid(parseEditorDocument(undefined));

    expect(result.issues[0]?.path).toEqual([]);
    expect(result.issues[0]?.message).toBe(
      "This document is missing a schema version, document id, revision, or content. Restore from a backup.",
    );
    expect(result.raw).toBeUndefined();
  });

  test("a document that cannot be serialized as JSON is invalid", () => {
    const raw = {
      schemaVersion: 1,
      documentId: "doc-bigint",
      revision: 0,
      content: [],
      extra: BigInt(1),
    };

    const result = expectInvalid(parseEditorDocument(raw));

    expect(result.issues).toEqual([
      {
        path: [],
        message: "This document cannot be saved as JSON. Restore from a backup.",
      },
    ]);
    expect(result.raw).toBe(raw);
  });

  test("an empty content array parses with no repairs", () => {
    const content: unknown[] = [];

    const result = expectOk(parseEditorDocument(envelope("doc-empty", content)));

    expect(result.repairs).toEqual([]);
    expect(result.document.content).toEqual([]);
  });

  test("a tree nested deeper than the depth limit is invalid and keeps the raw input", () => {
    const raw = envelope("doc-depth", [nestedParagraph(EDITOR_DOCUMENT_LIMITS.maxDepth + 8)]);

    const result = expectInvalid(parseEditorDocument(raw));

    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]?.path.length).toBe(EDITOR_DOCUMENT_LIMITS.maxDepth + 1);
    expect(result.issues[0]?.message).toContain("Restore from a backup");
    expect(result.raw).toBe(raw);
  });

  test("a tree with more nodes than the node limit is invalid and keeps the raw input", () => {
    const children = Array.from({ length: EDITOR_DOCUMENT_LIMITS.maxNodes }, () => ({ text: "x" }));
    const raw = envelope("doc-nodes", [{ type: "p", id: "root", children }]);

    const result = expectInvalid(parseEditorDocument(raw));

    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]?.message).toContain(String(EDITOR_DOCUMENT_LIMITS.maxNodes));
    expect(result.issues[0]?.message).toContain("Restore from a backup");
    expect(result.raw).toBe(raw);
  });

  test("a nested block past the node limit is invalid and keeps the raw input", () => {
    const children = [
      ...Array.from({ length: EDITOR_DOCUMENT_LIMITS.maxNodes - 1 }, () => ({ text: "x" })),
      { type: "p", children: [{ text: "overflow" }] },
    ];
    const raw = envelope("doc-element-nodes", [{ type: "p", id: "root", children }]);

    const result = expectInvalid(parseEditorDocument(raw));

    expect(result.issues).toEqual([
      {
        path: [0, EDITOR_DOCUMENT_LIMITS.maxNodes - 1],
        message: `This document has more than ${EDITOR_DOCUMENT_LIMITS.maxNodes} blocks. Restore from a backup or remove content.`,
      },
    ]);
    expect(result.raw).toBe(raw);
  });

  test("a document larger than the byte limit is invalid and keeps the raw input", () => {
    const raw = envelope("doc-bytes", [
      {
        type: "p",
        id: "big",
        children: [{ text: "x".repeat(EDITOR_DOCUMENT_LIMITS.maxBytes) }],
      },
    ]);

    const result = expectInvalid(parseEditorDocument(raw));

    expect(result.issues[0]?.path).toEqual([]);
    expect(result.issues[0]?.message).toContain(String(EDITOR_DOCUMENT_LIMITS.maxBytes));
    expect(result.raw).toBe(raw);
  });

  test("an unknown element type is unsupported and the raw input is kept", () => {
    const raw = envelope("doc-unknown", [
      { type: "callout", id: "h", children: [{ text: "Title" }] },
    ]);

    const result = expectUnsupported(parseEditorDocument(raw));

    expect(result.raw).toBe(raw);
    expect(result.issues[0]?.path).toEqual([0]);
    expect(result.issues[0]?.message).toContain("callout");
    expect(field(raw.content[0], "type")).toBe("callout");
  });

  test("an unknown attribute is unsupported and the raw input is kept", () => {
    const raw = envelope("doc-attr", [
      { type: "p", id: "p", indent: 1, children: [{ text: "Hi" }] },
    ]);

    const result = expectUnsupported(parseEditorDocument(raw));

    expect(result.raw).toBe(raw);
    expect(result.issues[0]?.path).toEqual([0]);
    expect(result.issues[0]?.message).toContain("indent");
    expect(field(raw.content[0], "indent")).toBe(1);
  });

  test("an unknown mark is unsupported and the raw input is kept", () => {
    const raw = envelope("doc-mark", [
      { type: "p", id: "p", children: [{ text: "Hi", sparkle: true }] },
    ]);

    const result = expectUnsupported(parseEditorDocument(raw));
    const text = isRecord(raw.content[0]) ? raw.content[0].children : undefined;
    const textNode = Array.isArray(text) ? text[0] : undefined;

    expect(result.raw).toBe(raw);
    expect(result.issues[0]?.path).toEqual([0, 0]);
    expect(result.issues[0]?.message).toContain("sparkle");
    expect(field(textNode, "sparkle")).toBe(true);
  });

  test("a future schema version is reported without reading the tree", () => {
    const raw = {
      schemaVersion: 2,
      content: [{ type: "p", id: "x" }, { text: "x".repeat(EDITOR_DOCUMENT_LIMITS.maxBytes) }],
    };

    const result = expectFuture(parseEditorDocument(raw));

    expect(result.schemaVersion).toBe(2);
    expect(result.raw).toBe(raw);
  });

  test("an element with an empty children array is invalid", () => {
    const raw = envelope("doc-empty-children", [{ type: "p", id: "p", children: [] }]);

    const result = expectInvalid(parseEditorDocument(raw));

    expect(result.issues).toEqual([
      {
        path: [0],
        message: "Block 1 has no children. Restore from a backup or remove the block.",
      },
    ]);
    expect(result.raw).toBe(raw);
  });

  test("a block with no children is invalid and the raw input is kept", () => {
    const raw = envelope("doc-children", [
      { type: "p", id: "a", children: [{ text: "a" }] },
      { type: "p", id: "b", children: [{ text: "b" }] },
      { type: "p", id: "c" },
    ]);

    const result = expectInvalid(parseEditorDocument(raw));

    expect(result.issues).toEqual([
      {
        path: [2],
        message: "Block 3 has no children. Restore from a backup or remove the block.",
      },
    ]);
    expect(result.raw).toBe(raw);
  });

  test("a block whose type is empty is invalid", () => {
    const raw = envelope("doc-type", [{ type: "", children: [{ text: "a" }] }]);

    const result = expectInvalid(parseEditorDocument(raw));

    expect(result.issues).toEqual([
      {
        path: [0],
        message: "Block 1 has no block type. Restore from a backup or remove the block.",
      },
    ]);
    expect(result.raw).toBe(raw);
  });

  test("a text node whose text is not a string is invalid", () => {
    const raw = envelope("doc-text", [{ type: "p", id: "p", children: [{ text: 1 }] }]);

    const result = expectInvalid(parseEditorDocument(raw));

    expect(result.issues).toEqual([
      {
        path: [0, 0],
        message:
          "Block 1.1 has text that is not a string. Restore from a backup or retype that block.",
      },
    ]);
    expect(result.raw).toBe(raw);
  });

  test("a null child is invalid", () => {
    const raw = envelope("doc-null", [{ type: "p", id: "p", children: [null] }]);

    const result = expectInvalid(parseEditorDocument(raw));

    expect(result.issues).toEqual([
      {
        path: [0, 0],
        message: "Block 1.1 is not a block. Restore from a backup or remove the block.",
      },
    ]);
    expect(result.raw).toBe(raw);
  });

  test("a child object with no type or text is invalid", () => {
    const raw = envelope("doc-empty-object", [{ type: "p", id: "p", children: [{}] }]);

    const result = expectInvalid(parseEditorDocument(raw));

    expect(result.issues).toEqual([
      {
        path: [0, 0],
        message: "Block 1.1 is not a block. Restore from a backup or remove the block.",
      },
    ]);
    expect(result.raw).toBe(raw);
  });

  test("a top-level text node is invalid", () => {
    const raw = envelope("doc-top-text", [{ text: "hi" }]);

    const result = expectInvalid(parseEditorDocument(raw));

    expect(result.issues).toEqual([
      {
        path: [0],
        message: "Block 1 is not a block. Restore from a backup or remove the block.",
      },
    ]);
    expect(result.raw).toBe(raw);
  });

  test("a top-level number is invalid", () => {
    const raw = envelope("doc-top-number", [1]);

    const result = expectInvalid(parseEditorDocument(raw));

    expect(result.issues).toEqual([
      {
        path: [0],
        message: "Block 1 is not a block. Restore from a backup or remove the block.",
      },
    ]);
    expect(result.raw).toBe(raw);
  });

  test("a blob url is invalid and the raw input is kept", () => {
    const raw = envelope("doc-blob", [
      {
        type: "p",
        id: "p",
        url: "blob:http://localhost/1",
        children: [{ text: "a" }],
      },
    ]);

    const result = expectInvalid(parseEditorDocument(raw));

    expect(result.issues[0]?.path).toEqual([0]);
    expect(result.issues[0]?.message).toContain("blob:");
    expect(result.issues[0]?.message).toContain("Restore from a backup");
    expect(result.raw).toBe(raw);
  });

  test("a data url is invalid and the raw input is kept", () => {
    const raw = envelope("doc-data", [
      {
        type: "p",
        id: "p",
        src: "data:image/png;base64,aaaa",
        children: [{ text: "a" }],
      },
    ]);

    const result = expectInvalid(parseEditorDocument(raw));

    expect(result.issues[0]?.path).toEqual([0]);
    expect(result.issues[0]?.message).toContain("data:");
    expect(result.raw).toBe(raw);
  });

  test("parse assigns a missing id, reports the repair, and leaves the input unchanged", () => {
    const raw = envelope("doc-repair", [{ type: "p", children: [{ text: "Hi" }] }]);
    const before = JSON.stringify(raw);

    const result = expectOk(parseEditorDocument(raw));
    const again = expectOk(parseEditorDocument(result.document));
    const assigned = field(result.document.content[0], "id");

    expect(JSON.stringify(raw)).toBe(before);
    expect(result.repairs).toHaveLength(1);
    expect(result.repairs[0]?.path).toEqual([0]);
    expect(typeof assigned).toBe("string");
    expect(assigned).not.toBe("");
    expect(again.repairs).toEqual([]);
    expect(again.document.content).toEqual(result.document.content);
  });
});

describe("document ids", () => {
  test("normalizing ids fills gaps, keeps the input unchanged, and is idempotent", () => {
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
    const nested = isRecord(first.content[5]) ? first.content[5].children : undefined;
    const nestedBlock = Array.isArray(nested) ? nested[0] : undefined;
    const second = normalizeBlockIds(first.content, createId);

    expect(JSON.stringify(input)).toBe(before);
    expect(field(input[0], "id")).toBeUndefined();
    expect(first.content[1]).toBe(input[1]);
    expect(field(first.content[0], "id")).toBe("id-a");
    expect(field(first.content[1], "id")).toBe("dup");
    expect(field(first.content[2], "id")).toBe("id-b");
    expect(field(first.content[3], "id")).toBe("id-c");
    expect(field(first.content[4], "id")).toBe("id-d");
    expect(field(first.content[5], "id")).toBe("parent");
    expect(isRecord(first.content[5]) && Array.isArray(first.content[5].children)).toBe(true);
    expect(field(nestedBlock, "id")).toBe("id-e");
    expect(first.repairs.map((repair) => repair.path)).toEqual([[0], [2], [3], [4], [5, 0]]);
    expect(second.repairs).toEqual([]);
    expect(second.content).toBe(first.content);
    expect(second.content).toEqual(first.content);
  });

  test("a generated id does not replace an id that already exists later in the document", () => {
    const input = [
      { type: "p", children: [{ text: "missing" }] },
      {
        type: "p",
        id: "taken",
        children: [{ type: "p", id: "taken-1", children: [{ text: "nested" }] }],
      },
    ] satisfies EditorValue;

    const result = normalizeBlockIds(input, () => "taken");
    const nested = isRecord(result.content[1]) ? result.content[1].children : undefined;
    const nestedBlock = Array.isArray(nested) ? nested[0] : undefined;

    expect(field(result.content[0], "id")).toBe("taken-2");
    expect(field(result.content[1], "id")).toBe("taken");
    expect(field(nestedBlock, "id")).toBe("taken-1");
    expect(result.repairs.map((repair) => repair.path)).toEqual([[0]]);
  });

  test("an empty generated id receives a numeric suffix", () => {
    const input = [{ type: "p", children: [{ text: "x" }] }] satisfies EditorValue;

    const result = normalizeBlockIds(input, () => "");

    expect(field(result.content[0], "id")).toBe("-1");
    expect(result.repairs.map((repair) => repair.path)).toEqual([[0]]);
  });

  test("moving a block keeps its id", () => {
    const editor = createEditor([
      { type: "p", id: "keep-a", children: [{ text: "one" }] },
      { type: "p", id: "keep-b", children: [{ text: "two" }] },
    ]);

    editor.tf.moveNodes({ at: [1], to: [0] });

    expect(blockIds(editor)).toEqual(["keep-b", "keep-a"]);
    expect(texts(editor)).toEqual(["two", "one"]);
  });

  test("inserting a block gives it a new non-empty id", () => {
    const editor = createEditor([
      { type: "p", id: "keep-a", children: [{ text: "one" }] },
      { type: "p", id: "keep-b", children: [{ text: "two" }] },
    ]);

    editor.tf.insertNodes(
      { type: "p", children: [{ text: "three" }] },
      { at: [editor.children.length] },
    );
    const insertedId = blockIds(editor)[2];

    expect(typeof insertedId).toBe("string");
    expect(insertedId).not.toBe("keep-a");
    expect(insertedId).not.toBe("keep-b");
    expect(insertedId).not.toBe("");
    expect(texts(editor)[2]).toBe("three");
  });
});

describe("document migration", () => {
  test("a v0 value is wrapped in a v1 envelope and migrating again returns the same object", () => {
    const once = migrateEditorDocument(V0_DOCUMENT, "doc-golden");

    const parsed = expectOk(parseEditorDocument(once));

    expect(once).toEqual(V1_DOCUMENT);
    expect(migrateEditorDocument(once, "other-id")).toBe(once);
    expect(migrateEditorDocument(once, "other-id")).toEqual(once);
    expect(migrateEditorDocument(V1_DOCUMENT, "other-id")).toBe(V1_DOCUMENT);
    expect(parsed.document).toEqual(V1_DOCUMENT);
    expect(parsed.repairs).toEqual([]);
  });
});
