import { describe, expect, test } from "bun:test";

import { DEMO_DOCUMENT_VALUE } from "./demo-document";
import { createEditorDocument } from "./editor-document";
import { EDITOR_ELEMENT_RULES } from "./editor-document-schema";
import { parseEditorDocument } from "./editor-document-validate";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textOf(block: (typeof DEMO_DOCUMENT_VALUE)[number]): string {
  return block.children.map((child) => child.text).join("");
}

function walk(value: unknown): void {
  if (!isRecord(value)) {
    return;
  }

  if (typeof value.text === "string" && !("children" in value)) {
    expect(Object.keys(value)).toEqual(["text"]);
    return;
  }

  if (typeof value.type === "string") {
    expect(EDITOR_ELEMENT_RULES.some((rule) => rule.type === value.type)).toBe(true);
  }

  if (!Array.isArray(value.children)) {
    return;
  }

  for (const child of value.children) {
    walk(child);
  }
}

describe("demo document", () => {
  test("the demo document parses with no repairs", () => {
    const parsed = parseEditorDocument(createEditorDocument("demo", DEMO_DOCUMENT_VALUE));

    expect(parsed.status).toBe("ok");
    if (parsed.status !== "ok") {
      return;
    }

    expect(parsed.repairs).toEqual([]);
  });

  test("every demo block is an allowlisted paragraph", () => {
    for (const block of DEMO_DOCUMENT_VALUE) {
      walk(block);
    }
  });

  test("demo text leaves contain only text", () => {
    for (const block of DEMO_DOCUMENT_VALUE) {
      for (const child of block.children) {
        expect(Object.keys(child)).toEqual(["text"]);
      }
    }
  });

  test("demo paragraph ids are unique", () => {
    const ids = DEMO_DOCUMENT_VALUE.map((block) => block.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.length > 0)).toBe(true);
  });

  test("the line-break paragraph contains one newline", () => {
    const block = DEMO_DOCUMENT_VALUE.find((item) => item.id === "demo-break");
    const text = block === undefined ? "" : textOf(block);

    expect(text.match(/\n/g)).toEqual(["\n"]);
  });
});
