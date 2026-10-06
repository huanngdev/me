import { describe, expect, test } from "bun:test";

import { DEMO_DOCUMENT_VALUE } from "./demo-document";
import { createEditorDocument } from "./editor-document";
import { EDITOR_ELEMENT_RULES, EDITOR_MARK_RULES, isAllowedMark } from "./editor-document-schema";
import { parseEditorDocument } from "./editor-document-validate";
import { createEditor, expectOk, field, isRecord } from "./test-utils";

function textOf(block: (typeof DEMO_DOCUMENT_VALUE)[number]): string {
  return block.children
    .map((child) => ("text" in child && typeof child.text === "string" ? child.text : ""))
    .join("");
}

function leafText(node: unknown): string {
  const text = field(node, "text");
  return typeof text === "string" ? text : "";
}

function elementChildren(node: unknown): unknown[] {
  const children = field(node, "children");
  return Array.isArray(children) ? children : [];
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

  test("every demo block is allowlisted", () => {
    const problems = DEMO_DOCUMENT_VALUE.flatMap((block) => allowlistProblems(block));

    expect(problems).toEqual([]);
  });

  test("demo text leaves contain only text and allowlisted marks", () => {
    const allowed = new Set<string>(["text", ...EDITOR_MARK_RULES.map((rule) => rule.type)]);
    const extra: string[] = [];
    const visit = (value: unknown): void => {
      if (!isRecord(value)) {
        return;
      }

      if (typeof value.text === "string" && !("children" in value)) {
        extra.push(...Object.keys(value).filter((key) => key !== "text" && !allowed.has(key)));
        return;
      }

      if (!Array.isArray(value.children)) {
        return;
      }

      for (const child of value.children) {
        visit(child);
      }
    };

    for (const block of DEMO_DOCUMENT_VALUE) {
      visit(block);
    }

    expect(extra).toEqual([]);
  });

  test("demo paragraph ids are unique", () => {
    const ids = DEMO_DOCUMENT_VALUE.map((block) => block.id);
    const unique = new Set(ids).size === ids.length;
    const present = ids.every((id) => id.length > 0);

    expect(unique).toBe(true);
    expect(present).toBe(true);
  });

  test("the first block is the heading", () => {
    const block = DEMO_DOCUMENT_VALUE[0];
    if (!block) {
      throw new Error("Missing heading.");
    }

    expect(block.type).toBe("h1");
    expect(block.id).toBe("demo-heading");
    expect(textOf(block)).toBe("Notion-like editor");
    expect(field(block, "lineHeight")).toBeUndefined();
  });

  test("the text styles heading sits directly before the bold paragraph", () => {
    const index = DEMO_DOCUMENT_VALUE.findIndex((item) => item.id === "demo-text-styles");
    const block = DEMO_DOCUMENT_VALUE[index];
    const next = DEMO_DOCUMENT_VALUE[index + 1];
    if (!block || !next) {
      throw new Error("Missing text styles heading.");
    }

    expect(block.type).toBe("h2");
    expect(textOf(block)).toBe("Text styles");
    expect(field(block, "lineHeight")).toBeUndefined();
    expect(next.id).toBe("demo-bold");
  });

  test("the block styles heading sits directly before the centered paragraph", () => {
    const index = DEMO_DOCUMENT_VALUE.findIndex((item) => item.id === "demo-block-styles");
    const block = DEMO_DOCUMENT_VALUE[index];
    const next = DEMO_DOCUMENT_VALUE[index + 1];
    if (!block || !next) {
      throw new Error("Missing block styles heading.");
    }

    expect(block.type).toBe("h3");
    expect(textOf(block)).toBe("Block styles");
    expect(field(block, "lineHeight")).toBeUndefined();
    expect(next.id).toBe("demo-align");
  });

  test("the lists heading follows the block styles section", () => {
    const clear = DEMO_DOCUMENT_VALUE.findIndex((item) => item.id === "demo-clear");
    const lists = DEMO_DOCUMENT_VALUE[clear + 1];
    const first = DEMO_DOCUMENT_VALUE[clear + 2];
    const nested = DEMO_DOCUMENT_VALUE[clear + 3];
    const third = DEMO_DOCUMENT_VALUE[clear + 4];
    if (!lists || !first || !nested || !third) {
      throw new Error("Missing lists section.");
    }

    expect(lists.type).toBe("h3");
    expect(lists.id).toBe("demo-lists");
    expect(textOf(lists)).toBe("Lists");
    expect(first.id).toBe("demo-bullet-1");
    expect(field(first, "listStyleType")).toBe("disc");
    expect(field(first, "indent")).toBe(1);
    expect(textOf(first)).toBe("Bulleted lists use Tab and Shift+Tab to nest.");
    expect(nested.id).toBe("demo-bullet-2");
    expect(field(nested, "indent")).toBe(2);
    expect(textOf(nested)).toBe("Nested items show a different marker.");
    expect(third.id).toBe("demo-bullet-3");
    expect(field(third, "indent")).toBe(1);
    expect(textOf(third)).toBe("Press Cmd+Shift+8 or Ctrl+Shift+8 to toggle a bullet.");

    const numbered = DEMO_DOCUMENT_VALUE[clear + 5];
    const nestedNumber = DEMO_DOCUMENT_VALUE[clear + 6];
    const numberedTail = DEMO_DOCUMENT_VALUE[clear + 7];
    if (!numbered || !nestedNumber || !numberedTail) {
      throw new Error("Missing numbered lists.");
    }

    expect(numbered.id).toBe("demo-number-1");
    expect(field(numbered, "listStyleType")).toBe("decimal");
    expect(field(numbered, "indent")).toBe(1);
    expect(field(numbered, "listStart")).toBeUndefined();
    expect(textOf(numbered)).toBe("Numbered lists count for you.");
    expect(nestedNumber.id).toBe("demo-number-2");
    expect(field(nestedNumber, "listStyleType")).toBe("decimal");
    expect(field(nestedNumber, "indent")).toBe(2);
    expect(textOf(nestedNumber)).toBe("Nested steps use letters.");
    expect(numberedTail.id).toBe("demo-number-3");
    expect(field(numberedTail, "listStyleType")).toBe("decimal");
    expect(field(numberedTail, "indent")).toBe(1);
    expect(field(numberedTail, "listStart")).toBe(2);
    expect(textOf(numberedTail)).toBe("Press Cmd+Shift+7 or Ctrl+Shift+7 to toggle numbering.");

    const todo = DEMO_DOCUMENT_VALUE[clear + 8];
    const openTodo = DEMO_DOCUMENT_VALUE[clear + 9];
    const nestedTodo = DEMO_DOCUMENT_VALUE[clear + 10];
    const todoHint = DEMO_DOCUMENT_VALUE[clear + 11];
    if (!todo || !openTodo || !nestedTodo || !todoHint) {
      throw new Error("Missing to-do lists.");
    }

    expect(todo.id).toBe("demo-todo-1");
    expect(field(todo, "listStyleType")).toBe("todo");
    expect(field(todo, "indent")).toBe(1);
    expect(field(todo, "checked")).toBe(true);
    expect(textOf(todo)).toBe("Write the spec.");
    expect(openTodo.id).toBe("demo-todo-2");
    expect(field(openTodo, "checked")).toBe(false);
    expect(textOf(openTodo)).toBe("Ship the to-do list.");
    expect(nestedTodo.id).toBe("demo-todo-3");
    expect(field(nestedTodo, "indent")).toBe(2);
    expect(field(nestedTodo, "checked")).toBe(false);
    expect(textOf(nestedTodo)).toBe("Nested tasks keep their own state.");
    expect(todoHint.id).toBe("demo-todo-4");
    expect(field(todoHint, "checked")).toBe(false);
    expect(textOf(todoHint)).toBe(
      "Press Cmd+Shift+9 or Ctrl+Shift+9 to make a to-do, and Cmd+Enter or Ctrl+Enter to check it.",
    );

    const divider = DEMO_DOCUMENT_VALUE.find((item) => item.id === "demo-divider");
    const quotes = DEMO_DOCUMENT_VALUE.find((item) => item.id === "demo-quotes");
    const quote = DEMO_DOCUMENT_VALUE.find((item) => item.id === "demo-quote");
    if (!divider || !quotes || !quote || quote.type !== "blockquote") {
      throw new Error("Missing the quotes demo.");
    }

    expect(divider.type).toBe("hr");
    expect(divider.children).toEqual([{ text: "" }]);
    expect(DEMO_DOCUMENT_VALUE.indexOf(divider)).toBe(DEMO_DOCUMENT_VALUE.indexOf(todoHint) + 1);
    expect(DEMO_DOCUMENT_VALUE.indexOf(quotes)).toBe(DEMO_DOCUMENT_VALUE.indexOf(divider) + 1);

    expect(quotes.type).toBe("h3");
    expect(textOf(quotes)).toBe("Quotes");
    const paragraphs = elementChildren(quote);
    expect(paragraphs.map((child) => field(child, "id"))).toEqual(["demo-quote-1", "demo-quote-2"]);
    expect(elementChildren(paragraphs[0])).toEqual([{ text: "Quotes hold a thought on its own." }]);
    expect(elementChildren(paragraphs[1])).toEqual([
      { text: "Press " },
      { text: "Enter", bold: true },
      { text: " for a new line in the quote, and " },
      { text: "Enter", bold: true },
      { text: " on an empty line to leave it." },
    ]);

    const callouts = DEMO_DOCUMENT_VALUE.find((item) => item.id === "demo-callouts");
    const callout = DEMO_DOCUMENT_VALUE.find((item) => item.id === "demo-callout");
    if (!callouts || !callout || callout.type !== "callout") {
      throw new Error("Missing the callouts demo.");
    }

    expect(callouts.type).toBe("h3");
    expect(textOf(callouts)).toBe("Callouts");
    expect(DEMO_DOCUMENT_VALUE.indexOf(callouts)).toBe(DEMO_DOCUMENT_VALUE.indexOf(quote) + 1);
    expect(DEMO_DOCUMENT_VALUE.indexOf(callout)).toBe(DEMO_DOCUMENT_VALUE.indexOf(callouts) + 1);
    expect(field(callout, "icon")).toBe("💡");
    expect(field(callout, "variant")).toBe("info");
    const calloutChildren = elementChildren(callout);
    expect(calloutChildren.map((child) => field(child, "id"))).toEqual([
      "demo-callout-1",
      "demo-callout-2",
    ]);
    expect(elementChildren(calloutChildren[0])).toEqual([
      { text: "Callouts hold a note with an icon and a color." },
    ]);
    expect(field(calloutChildren[1], "listStyleType")).toBe("disc");
    expect(field(calloutChildren[1], "indent")).toBe(1);
    expect(elementChildren(calloutChildren[1])).toEqual([
      { text: "Click the icon to change both." },
    ]);
  });

  test("normalizing the demo leaves every derived list attr unchanged", () => {
    const editor = createEditor(DEMO_DOCUMENT_VALUE);
    const before = JSON.parse(JSON.stringify(editor.children));

    editor.tf.normalize({ force: true });

    expect(editor.children).toEqual(before);
  });

  test("the italic paragraph marks only italic text", () => {
    const block = DEMO_DOCUMENT_VALUE.find((item) => item.id === "demo-italic");
    if (!block) {
      throw new Error("Missing italic paragraph.");
    }

    const marked = block.children
      .filter((child) => field(child, "italic") === true)
      .map((child) => leafText(child));

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
      .map((child) => leafText(child));

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
      .map((child) => leafText(child));

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
      .map((child) => leafText(child));

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
      .map((child) => leafText(child));

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
      .map((child) => leafText(child));

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
      .map((child) => [leafText(child), field(child, "color")]);

    expect(textOf(block)).toBe(
      "Text can be red, blue, or green. Colors come from a preset palette that adapts to light and dark mode.",
    );
    expect(marked).toEqual([
      ["red", "red"],
      ["blue", "blue"],
      ["green", "green"],
    ]);
  });

  test("the highlight paragraph marks highlighted text and a combined word", () => {
    const block = DEMO_DOCUMENT_VALUE.find((item) => item.id === "demo-highlight");
    if (!block) {
      throw new Error("Missing highlight paragraph.");
    }

    const marked = block.children
      .filter((child) => field(child, "backgroundColor") !== undefined)
      .map((child) => [
        leafText(child),
        field(child, "backgroundColor"),
        field(child, "color") ?? null,
      ]);

    expect(textOf(block)).toBe(
      "This is highlighted text. Highlights and text colors combine and stay readable in both themes.",
    );
    expect(marked).toEqual([
      ["highlighted text", "yellow", null],
      ["readable", "blue", "blue"],
    ]);
  });

  test("the font size paragraph marks small, large, and extra large", () => {
    const block = DEMO_DOCUMENT_VALUE.find((item) => item.id === "demo-font-size");
    if (!block) {
      throw new Error("Missing font size paragraph.");
    }

    const marked = block.children
      .filter((child) => field(child, "fontSize") !== undefined)
      .map((child) => [leafText(child), field(child, "fontSize")]);

    expect(textOf(block)).toBe("Text comes in sizes from small to large and extra large.");
    expect(marked).toEqual([
      ["small", "14px"],
      ["large", "24px"],
      ["extra large", "32px"],
    ]);
  });

  test("the font family paragraph marks sans, serif, and mono", () => {
    const block = DEMO_DOCUMENT_VALUE.find((item) => item.id === "demo-font-family");
    if (!block) {
      throw new Error("Missing font family paragraph.");
    }

    const marked = block.children
      .filter((child) => field(child, "fontFamily") !== undefined)
      .map((child) => [leafText(child), field(child, "fontFamily")]);

    expect(textOf(block)).toBe("Text can switch between sans, serif, and mono.");
    expect(marked).toEqual([
      ["sans", "sans"],
      ["serif", "serif"],
      ["mono", "mono"],
    ]);
  });

  test("the alignment paragraph is centered", () => {
    const block = DEMO_DOCUMENT_VALUE.find((item) => item.id === "demo-align");
    if (!block) {
      throw new Error("Missing alignment paragraph.");
    }

    expect(textOf(block)).toBe(
      "This paragraph is centered. Blocks can align left, center, right, or justify.",
    );
    expect(field(block, "align")).toBe("center");
  });

  test("the line height paragraph is double spaced", () => {
    const block = DEMO_DOCUMENT_VALUE.find((item) => item.id === "demo-line-height");
    if (!block) {
      throw new Error("Missing line height paragraph.");
    }

    expect(textOf(block)).toBe(
      "This paragraph uses double line height, so its wrapped lines sit further apart than the others. A second line stays in this same block.",
    );
    expect(field(block, "lineHeight")).toBe(2);
  });

  test("the clear formatting paragraph marks formatted text", () => {
    const block = DEMO_DOCUMENT_VALUE.find((item) => item.id === "demo-clear");
    if (!block) {
      throw new Error("Missing clear formatting paragraph.");
    }

    const marked = block.children
      .filter((child) => field(child, "bold") === true)
      .map((child) => [leafText(child), field(child, "italic"), field(child, "color")]);

    expect(textOf(block)).toBe("Select formatted text and press Cmd+\\ or Ctrl+\\ to clear it.");
    expect(marked).toEqual([["formatted text", true, "red"]]);
  });

  test("the line-break paragraph contains exactly one newline", () => {
    const block = DEMO_DOCUMENT_VALUE.find((item) => item.id === "demo-break");
    const text = block === undefined ? "" : textOf(block);
    const newlines = text.match(/\n/g);

    expect(newlines).toEqual(["\n"]);
  });
});
