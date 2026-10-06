import { describe, expect, test } from "bun:test";

import { DEMO_DOCUMENT_VALUE } from "./demo-document";
import { createEditorDocument } from "./editor-document";
import { EDITOR_ELEMENT_RULES, EDITOR_MARK_RULES, isAllowedMark } from "./editor-document-schema";
import { parseEditorDocument } from "./editor-document-validate";
import { expectOk, field, isRecord } from "./test-utils";

function textOf(block: (typeof DEMO_DOCUMENT_VALUE)[number]): string {
  return block.children.map((child) => child.text).join("");
}

function allowlistProblems(value: unknown): string[] {
  if (!isRecord(value)) {
    return [];
  }

  if (typeof value.text === "string" && !("children" in value)) {
    const extra = Object.keys(value).filter((key) => key !== "text" && !isAllowedMark(key));
    return extra.length === 0 ? [] : ["text leaf has extra keys"];
  }

  const problems: string[] = [];
  if (typeof value.type === "string") {
    const allowed = EDITOR_ELEMENT_RULES.some((rule) => rule.type === value.type);
    if (!allowed) {
      problems.push(`${value.type} is not allowlisted`);
    }
  }

  if (!Array.isArray(value.children)) {
    return problems;
  }

  for (const child of value.children) {
    problems.push(...allowlistProblems(child));
  }

  return problems;
}

describe("demo document", () => {
  test("the demo document parses with no repairs", () => {
    const parsed = expectOk(parseEditorDocument(createEditorDocument("demo", DEMO_DOCUMENT_VALUE)));

    expect(parsed.repairs).toEqual([]);
  });

  test("every demo block is an allowlisted paragraph", () => {
    const problems = DEMO_DOCUMENT_VALUE.flatMap((block) => allowlistProblems(block));

    expect(problems).toEqual([]);
  });

  test("demo text leaves contain only text and allowlisted marks", () => {
    const allowed = new Set<string>(["text", ...EDITOR_MARK_RULES.map((rule) => rule.type)]);
    const extra = DEMO_DOCUMENT_VALUE.flatMap((block) =>
      block.children.flatMap((child) => Object.keys(child).filter((key) => !allowed.has(key))),
    );

    expect(extra).toEqual([]);
  });

  test("demo paragraph ids are unique", () => {
    const ids = DEMO_DOCUMENT_VALUE.map((block) => block.id);
    const unique = new Set(ids).size === ids.length;
    const present = ids.every((id) => id.length > 0);

    expect(unique).toBe(true);
    expect(present).toBe(true);
  });

  test("the italic paragraph marks only italic text", () => {
    const block = DEMO_DOCUMENT_VALUE.find((item) => item.id === "demo-italic");
    if (!block) {
      throw new Error("Missing italic paragraph.");
    }

    const marked = block.children
      .filter((child) => field(child, "italic") === true)
      .map((child) => child.text);

    expect(textOf(block)).toBe(
      "This is italic text. Press Cmd+I or Ctrl+I, and combine it with bold.",
    );
    expect(marked).toEqual(["italic text"]);
  });

  test("the underline paragraph marks only underlined text", () => {
    const block = DEMO_DOCUMENT_VALUE.find((item) => item.id === "demo-underline");
    if (!block) {
      throw new Error("Missing underline paragraph.");
    }

    const marked = block.children
      .filter((child) => field(child, "underline") === true)
      .map((child) => child.text);

    expect(textOf(block)).toBe("This is underlined text. Press Cmd+U or Ctrl+U.");
    expect(marked).toEqual(["underlined text"]);
  });

  test("the strikethrough paragraph marks only strikethrough text", () => {
    const block = DEMO_DOCUMENT_VALUE.find((item) => item.id === "demo-strikethrough");
    if (!block) {
      throw new Error("Missing strikethrough paragraph.");
    }

    const marked = block.children
      .filter((child) => field(child, "strikethrough") === true)
      .map((child) => child.text);

    expect(textOf(block)).toBe("This is strikethrough text. Press Cmd+Shift+X or Ctrl+Shift+X.");
    expect(marked).toEqual(["strikethrough text"]);
  });

  test("the code paragraph marks only inline code", () => {
    const block = DEMO_DOCUMENT_VALUE.find((item) => item.id === "demo-code");
    if (!block) {
      throw new Error("Missing code paragraph.");
    }

    const marked = block.children
      .filter((child) => field(child, "code") === true)
      .map((child) => child.text);

    expect(textOf(block)).toBe("This is inline code. Press Cmd+E or Ctrl+E.");
    expect(marked).toEqual(["inline code"]);
  });

  test("the superscript paragraph marks only the two 2 characters", () => {
    const block = DEMO_DOCUMENT_VALUE.find((item) => item.id === "demo-superscript");
    if (!block) {
      throw new Error("Missing superscript paragraph.");
    }

    const marked = block.children
      .filter((child) => field(child, "superscript") === true)
      .map((child) => child.text);

    expect(textOf(block)).toBe("This is superscript: x2 and E = mc2. Press Cmd+. or Ctrl+.");
    expect(marked).toEqual(["2", "2"]);
  });

  test("the subscript paragraph marks only the 2", () => {
    const block = DEMO_DOCUMENT_VALUE.find((item) => item.id === "demo-subscript");
    if (!block) {
      throw new Error("Missing subscript paragraph.");
    }

    const marked = block.children
      .filter((child) => field(child, "subscript") === true)
      .map((child) => child.text);

    expect(textOf(block)).toBe("This is subscript: H2O. Press Cmd+, or Ctrl+,");
    expect(marked).toEqual(["2"]);
  });

  test("the color paragraph marks red, blue, and green", () => {
    const block = DEMO_DOCUMENT_VALUE.find((item) => item.id === "demo-color");
    if (!block) {
      throw new Error("Missing color paragraph.");
    }

    const marked = block.children
      .filter((child) => field(child, "color") !== undefined)
      .map((child) => [child.text, field(child, "color")]);

    expect(textOf(block)).toBe(
      "Text can be red, blue, or green. Colors come from a preset palette that adapts to light and dark mode.",
    );
    expect(marked).toEqual([
      ["red", "red"],
      ["blue", "blue"],
      ["green", "green"],
    ]);
  });

  test("the line-break paragraph contains exactly one newline", () => {
    const block = DEMO_DOCUMENT_VALUE.find((item) => item.id === "demo-break");
    const text = block === undefined ? "" : textOf(block);
    const newlines = text.match(/\n/g);

    expect(newlines).toEqual(["\n"]);
  });
});
