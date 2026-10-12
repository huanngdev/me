import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

import { DEMO_DOCUMENT_VALUE } from "../demo/demo-document";
import { createEditorDocument, EDITOR_SCHEMA_VERSION } from "../lib/document/editor-document";
import { exportEditorDocument } from "../lib/io/export-document";
import { importEditorDocument } from "../lib/io/import-document";
import { IO_ALL_NODES } from "./fixtures/io-all-nodes";
import { comparableDocument, freezeDeep, missingSchemaCoverage } from "./io-test-utils";

const golden = readFileSync(path.join(import.meta.dir, "fixtures/io/all-nodes.json"), "utf8");

describe("json io", () => {
  test("the fixture covers every schema node, attribute, and mark", () => {
    expect(missingSchemaCoverage(IO_ALL_NODES)).toEqual([]);
  });

  test("export matches the golden file and does not mutate or vary", async () => {
    const frozen = structuredClone(IO_ALL_NODES);
    freezeDeep(frozen);
    const first = await exportEditorDocument(frozen, "json");
    const second = await exportEditorDocument(frozen, "json");
    expect(first.content).toBe(golden);
    expect(second.content).toBe(first.content);
    expect(first.warnings).toEqual([]);
    expect(first.mimeType).toBe("application/json");
    expect(first.extension).toBe("json");
    expect(frozen).toEqual(structuredClone(IO_ALL_NODES));
  });

  test("round trip keeps the fixture and the demo except ids", async () => {
    for (const value of [IO_ALL_NODES, DEMO_DOCUMENT_VALUE]) {
      const exported = await exportEditorDocument(value, "json");
      const imported = await importEditorDocument(exported.content, "json");
      expect(imported.ok).toBe(true);
      if (!imported.ok) {
        return;
      }

      expect(comparableDocument(imported.value)).toEqual(comparableDocument(value));
      expect(imported.warnings).toEqual([]);
    }
  });

  test("refuses text that is not json", async () => {
    const result = await importEditorDocument("hello", "json");
    expect(result).toEqual({ ok: false, error: "This file is not JSON." });
  });

  test("refuses a future schema version", async () => {
    const result = await importEditorDocument(
      JSON.stringify({
        schemaVersion: EDITOR_SCHEMA_VERSION + 1,
        documentId: "x",
        revision: 0,
        content: [],
      }),
      "json",
    );
    expect(result).toEqual({
      ok: false,
      error: "This file was made by a newer version of the editor.",
    });
  });

  test("refuses the wrong shape", async () => {
    const result = await importEditorDocument(JSON.stringify({ schemaVersion: 1 }), "json");
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error.length).toBeGreaterThan(0);
  });

  test("accepts a bare array of blocks", async () => {
    const result = await importEditorDocument(JSON.stringify(IO_ALL_NODES), "json");
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(comparableDocument(result.value)).toEqual(comparableDocument(IO_ALL_NODES));
  });

  test("refuses an invalid document and keeps the first messages", async () => {
    const document = createEditorDocument("document", [
      { type: "nope", children: [{ text: "x" }] },
    ]);
    const result = await importEditorDocument(JSON.stringify(document), "json");
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error).toContain("nope");
  });

  test("vietnamese text and emoji survive", async () => {
    const value = [
      {
        type: "p",
        id: "uni",
        children: [{ text: "Tiếng Việt \u0065\u0302 👩‍💻" }],
      },
    ];
    const exported = await exportEditorDocument(value, "json");
    const imported = await importEditorDocument(exported.content, "json");
    expect(imported.ok).toBe(true);
    if (!imported.ok) {
      return;
    }

    expect(JSON.stringify(imported.value)).toContain("Tiếng Việt \u0065\u0302 👩‍💻");
  });
});
