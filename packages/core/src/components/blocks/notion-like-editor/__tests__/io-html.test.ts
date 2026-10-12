import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createPlateEditor } from "platejs/react";
import { KEYS } from "platejs";

import "../../../../../test/setup-dom";
import { DEMO_DOCUMENT_VALUE } from "../demo/demo-document";
import { serializeEditorDocument, createEditorDocument } from "../lib/document/editor-document";
import {
  PASTE_BLOCK_LIMIT,
  PASTE_HTML_CHAR_LIMIT,
  pasteRepairsOf,
} from "../lib/paste/editor-paste";
import { createEditorPlugins } from "../lib/plugins/editor-plugins";
import { exportEditorDocument } from "../lib/io/export-document";
import { importEditorDocument } from "../lib/io/import-document";
import {
  GOOGLE_DOCS_FIXTURE,
  MALICIOUS_FIXTURE,
  NOTION_FIXTURE,
  WORD_FIXTURE,
} from "./fixtures/paste-apps";
import { IO_ALL_NODES } from "./fixtures/io-all-nodes";
import { comparableDocument, freezeDeep } from "./io-test-utils";

const golden = readFileSync(path.join(import.meta.dir, "fixtures/io/all-nodes.html"), "utf8");

describe("html io", () => {
  test("export matches the golden file and does not mutate", async () => {
    const frozen = structuredClone(IO_ALL_NODES);
    freezeDeep(frozen);
    const first = await exportEditorDocument(frozen, "html");
    const second = await exportEditorDocument(frozen, "html");
    expect(first.content).toBe(golden);
    expect(second.content).toBe(first.content);
    expect(first.extension).toBe("html");
    expect(first.mimeType).toBe("text/html");
    expect(frozen).toEqual(structuredClone(IO_ALL_NODES));
  });

  test("round trip keeps every schema node except fresh ids", async () => {
    for (const value of [IO_ALL_NODES, DEMO_DOCUMENT_VALUE]) {
      const exported = await exportEditorDocument(value, "html");
      const imported = await importEditorDocument(exported.content, "html");
      expect(imported.ok).toBe(true);
      if (!imported.ok) {
        return;
      }

      expect(comparableDocument(imported.value)).toEqual(comparableDocument(value));
    }
  });

  test("malicious html imports without active content", async () => {
    const imported = await importEditorDocument(MALICIOUS_FIXTURE, "html");
    expect(imported.ok).toBe(true);
    if (!imported.ok) {
      return;
    }

    const serialized = serializeEditorDocument(createEditorDocument("document", imported.value));
    expect(serialized).not.toContain("script");
    expect(serialized).not.toContain("javascript:");
    expect(serialized).not.toContain("data:text/html");
    expect(serialized).not.toContain("onerror");
    expect(serialized).not.toContain("onclick");
    expect(serialized).not.toContain("iframe");
    expect(imported.warnings.some((warning) => warning.code === "media-dropped")).toBe(true);
  });

  test("unsafe text exports inert html and imports the same text", async () => {
    const value = [
      {
        type: "p",
        id: "safe",
        children: [
          { text: "<script>&\"'</title>" },
          { type: "a", id: "bad", url: "javascript:alert(1)", children: [{ text: "click" }] },
        ],
      },
    ];
    const exported = await exportEditorDocument(value, "html");
    expect(exported.content).not.toContain("<script>");
    expect(exported.content).not.toContain("javascript:");
    expect(exported.content).toContain("&lt;script&gt;");
    expect(
      exported.warnings.some((warning) => warning.code === "unsafe-link" && warning.count === 1),
    ).toBe(true);
    const imported = await importEditorDocument(exported.content, "html");
    expect(imported.ok).toBe(true);
    if (!imported.ok) {
      return;
    }

    const text = JSON.stringify(imported.value);
    expect(text).toContain("<script>");
    expect(text).toContain("click");
    expect(text).not.toContain("javascript:");
  });

  test("html over the character limit is refused", async () => {
    const result = await importEditorDocument("x".repeat(PASTE_HTML_CHAR_LIMIT + 1), "html");
    expect(result.ok).toBe(false);
  });

  test("too many blocks are truncated with a warning", async () => {
    const blocks = Array.from(
      { length: PASTE_BLOCK_LIMIT + 1 },
      (_, index) => `<p>Block ${String(index)}</p>`,
    ).join("");
    const result = await importEditorDocument(blocks, "html");
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value).toHaveLength(PASTE_BLOCK_LIMIT);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: "block-limit", count: 1 }),
    );
  });

  test("vietnamese text and emoji survive", async () => {
    const value = [{ type: "p", id: "uni", children: [{ text: "Tiếng Việt \u0065\u0302 👩‍💻" }] }];
    const exported = await exportEditorDocument(value, "html");
    const imported = await importEditorDocument(exported.content, "html");
    expect(imported.ok).toBe(true);
    if (!imported.ok) {
      return;
    }

    expect(JSON.stringify(imported.value)).toContain("Tiếng Việt \u0065\u0302 👩‍💻");
  });

  test("every table of contents link points at a heading id", async () => {
    const exported = await exportEditorDocument(DEMO_DOCUMENT_VALUE, "html");
    const hrefs = [...exported.content.matchAll(/href="#([^"]+)"/g)].map((match) => match[1]);
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      expect(exported.content).toContain(`id="${href}"`);
    }
  });

  test("foreign HTML matches a paste into an empty document", async () => {
    const strip = (value: unknown): unknown => {
      if (Array.isArray(value)) {
        return value.map((item) => strip(item));
      }

      if (typeof value !== "object" || value === null) {
        return value;
      }

      const record = value as Record<string, unknown>;
      const next: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(record)) {
        if (key === "id") {
          continue;
        }

        next[key] = strip(item);
      }

      return next;
    };

    for (const html of [NOTION_FIXTURE, WORD_FIXTURE, GOOGLE_DOCS_FIXTURE, MALICIOUS_FIXTURE]) {
      const editor = createPlateEditor({
        plugins: createEditorPlugins(),
        value: [{ type: KEYS.p, id: "p", children: [{ text: "" }] }],
      });
      const data = new DataTransfer();
      data.setData("text/html", html);
      editor.tf.insertData(data);
      const imported = await importEditorDocument(html, "html");
      expect(imported.ok).toBe(true);
      if (!imported.ok) {
        return;
      }

      expect(strip(imported.value)).toEqual(strip(editor.children));
      const repairMessages = pasteRepairsOf(editor).map((repair) => repair.message);
      for (const message of repairMessages) {
        expect(imported.warnings.some((warning) => warning.message.includes(message))).toBe(true);
      }
    }
  });
});
