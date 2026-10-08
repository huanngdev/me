import { describe, expect, test } from "bun:test";

import { DEMO_DOCUMENT_ID, DEMO_DOCUMENT_VALUE, demoDocumentId } from "./demo-document";
import type { EditorValue } from "./editor-value";
import { createEditorDocument } from "./editor-document";
import {
  CALLOUT_DEFAULT_ICON,
  CALLOUT_ICONS,
  CALLOUT_TONES,
  EDITOR_ELEMENT_RULES,
  EDITOR_MARK_RULES,
  FONT_FAMILIES,
  FONT_SIZES,
  HIGHLIGHT_TOKENS,
  LINE_HEIGHTS,
  LIST_STYLES,
  PALETTE_TOKENS,
  CODE_LANGS,
  TEXT_ALIGNS,
  isAllowedMark,
} from "./editor-document-schema";
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
  test("the demo id follows the content and ignores a copied edit", () => {
    const copy: unknown = JSON.parse(JSON.stringify(DEMO_DOCUMENT_VALUE));
    if (!Array.isArray(copy) || !isRecord(copy[0]) || !Array.isArray(copy[0].children)) {
      throw new Error("Demo copy is not a document.");
    }

    const title = copy[0].children[0];
    if (!isRecord(title) || typeof title.text !== "string") {
      throw new Error("Demo title is missing.");
    }

    title.text = `${title.text}!`;

    expect(DEMO_DOCUMENT_ID).toBe(demoDocumentId(DEMO_DOCUMENT_VALUE));
    expect(DEMO_DOCUMENT_ID).toMatch(/^demo-[0-9a-f]{8}$/);
    expect(demoDocumentId(copy as EditorValue)).not.toBe(DEMO_DOCUMENT_ID);
    expect(textOf(DEMO_DOCUMENT_VALUE[0] ?? { children: [] })).toBe("Notion-like editor");
  });

  test("the demo document parses with no repairs", () => {
    const parsed = expectOk(parseEditorDocument(createEditorDocument("demo", DEMO_DOCUMENT_VALUE)));

    expect(parsed.repairs).toEqual([]);
  });

  test("demo code languages are stored members of the allowlist", () => {
    const langs: string[] = [];
    const visit = (value: unknown): void => {
      if (!isRecord(value)) {
        return;
      }

      if (value.type === "code_block" && typeof value.lang === "string") {
        langs.push(value.lang);
      }

      for (const child of elementChildren(value)) {
        visit(child);
      }
    };

    for (const block of DEMO_DOCUMENT_VALUE) {
      visit(block);
    }

    expect(langs.some((lang) => lang !== "plaintext")).toBe(true);
    expect(langs.every((lang) => CODE_LANGS.some((allowed) => allowed === lang))).toBe(true);
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
    const ids: string[] = [];
    const visit = (value: unknown): void => {
      if (!isRecord(value)) {
        return;
      }

      const id = field(value, "id");
      if (typeof id === "string") {
        ids.push(id);
      }

      for (const child of elementChildren(value)) {
        visit(child);
      }
    };

    for (const block of DEMO_DOCUMENT_VALUE) {
      visit(block);
    }

    const unique = new Set(ids).size === ids.length;
    const present = ids.every((id) => id.length > 0);

    expect(ids.length).toBeGreaterThan(DEMO_DOCUMENT_VALUE.length);
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

  test("the block styles heading sits directly before the left-aligned paragraph", () => {
    const index = DEMO_DOCUMENT_VALUE.findIndex((item) => item.id === "demo-block-styles");
    const block = DEMO_DOCUMENT_VALUE[index];
    const next = DEMO_DOCUMENT_VALUE[index + 1];
    if (!block || !next) {
      throw new Error("Missing block styles heading.");
    }

    expect(block.type).toBe("h3");
    expect(textOf(block)).toBe("Block styles");
    expect(field(block, "lineHeight")).toBeUndefined();
    expect(next.id).toBe("demo-align-left");
    expect(field(next, "align")).toBe("left");
  });

  test("the headings section names the heading shortcuts", () => {
    const index = DEMO_DOCUMENT_VALUE.findIndex((item) => item.id === "demo-headings");
    const heading = DEMO_DOCUMENT_VALUE[index];
    const note = DEMO_DOCUMENT_VALUE[index + 1];
    const heading2 = DEMO_DOCUMENT_VALUE[index + 2];
    const heading3 = DEMO_DOCUMENT_VALUE[index + 3];
    const textStyles = DEMO_DOCUMENT_VALUE[index + 4];
    if (!heading || !note || !heading2 || !heading3 || !textStyles) {
      throw new Error("Missing headings section.");
    }

    expect(heading.type).toBe("h2");
    expect(textOf(heading)).toBe("Headings");
    expect(note.id).toBe("demo-heading-1");
    expect(textOf(note)).toBe(
      "The title above is a heading 1. Press Cmd+Alt+1 or Ctrl+Alt+1 to toggle it.",
    );
    expect(heading2.type).toBe("h2");
    expect(heading2.id).toBe("demo-heading-2");
    expect(textOf(heading2)).toBe("Heading 2. Press Cmd+Alt+2 or Ctrl+Alt+2.");
    expect(heading3.type).toBe("h3");
    expect(heading3.id).toBe("demo-heading-3");
    expect(textOf(heading3)).toBe("Heading 3. Press Cmd+Alt+3 or Ctrl+Alt+3.");
    expect(textStyles.id).toBe("demo-text-styles");
  });

  test("the lists heading follows the block styles section", async () => {
    const lineHeight = DEMO_DOCUMENT_VALUE.findIndex((item) => item.id === "demo-line-height");
    const lists = DEMO_DOCUMENT_VALUE[lineHeight + 1];
    const first = DEMO_DOCUMENT_VALUE[lineHeight + 2];
    const nested = DEMO_DOCUMENT_VALUE[lineHeight + 3];
    const third = DEMO_DOCUMENT_VALUE[lineHeight + 4];
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
    expect(field(third, "indent")).toBe(3);
    expect(textOf(third)).toBe(
      "The third level uses a square. Press Cmd+Shift+8 or Ctrl+Shift+8 to toggle a bullet.",
    );

    const numbered = DEMO_DOCUMENT_VALUE[lineHeight + 5];
    const nestedNumber = DEMO_DOCUMENT_VALUE[lineHeight + 6];
    const numberedTail = DEMO_DOCUMENT_VALUE[lineHeight + 7];
    const restarted = DEMO_DOCUMENT_VALUE[lineHeight + 8];
    const restartedNext = DEMO_DOCUMENT_VALUE[lineHeight + 9];
    if (!numbered || !nestedNumber || !numberedTail || !restarted || !restartedNext) {
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
    expect(field(numberedTail, "indent")).toBe(3);
    expect(field(numberedTail, "listStart")).toBeUndefined();
    expect(textOf(numberedTail)).toBe(
      "The third level uses roman numerals. Press Cmd+Shift+7 or Ctrl+Shift+7 to toggle numbering.",
    );
    expect(restarted.id).toBe("demo-number-restart");
    expect(field(restarted, "listStyleType")).toBe("decimal");
    expect(field(restarted, "indent")).toBe(1);
    expect(field(restarted, "listRestart")).toBe(3);
    expect(field(restarted, "listStart")).toBe(3);
    expect(textOf(restarted)).toBe("This numbered run starts at 3.");
    expect(restartedNext.id).toBe("demo-number-next");
    expect(field(restartedNext, "listStart")).toBe(4);
    expect(field(restartedNext, "listRestart")).toBeUndefined();

    const todo = DEMO_DOCUMENT_VALUE[lineHeight + 10];
    const openTodo = DEMO_DOCUMENT_VALUE[lineHeight + 11];
    const nestedTodo = DEMO_DOCUMENT_VALUE[lineHeight + 12];
    const todoHint = DEMO_DOCUMENT_VALUE[lineHeight + 13];
    const markedBullet = DEMO_DOCUMENT_VALUE[lineHeight + 14];
    if (!todo || !openTodo || !nestedTodo || !todoHint || !markedBullet) {
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

    expect(markedBullet.id).toBe("demo-bullet-marks");
    expect(field(markedBullet, "listStyleType")).toBe("disc");
    expect(field(markedBullet, "indent")).toBe(1);
    expect(elementChildren(markedBullet)).toEqual([
      { text: "A bullet can mix " },
      { text: "bold", bold: true },
      { text: ", " },
      { text: "italic", italic: true },
      { text: ", and " },
      { text: "color", color: "purple" },
      { text: "." },
    ]);

    expect(divider.type).toBe("hr");
    expect(divider.children).toEqual([{ text: "" }]);
    expect(DEMO_DOCUMENT_VALUE.indexOf(divider)).toBe(
      DEMO_DOCUMENT_VALUE.indexOf(markedBullet) + 1,
    );
    expect(DEMO_DOCUMENT_VALUE.indexOf(quotes)).toBe(DEMO_DOCUMENT_VALUE.indexOf(divider) + 1);

    expect(quotes.type).toBe("h3");
    expect(textOf(quotes)).toBe("Quotes");
    const paragraphs = elementChildren(quote);
    expect(paragraphs.map((child) => field(child, "id"))).toEqual([
      "demo-quote-1",
      "demo-quote-2",
      "demo-quote-3",
    ]);
    expect(elementChildren(paragraphs[0])).toEqual([{ text: "Quotes hold a thought on its own." }]);
    expect(elementChildren(paragraphs[1])).toEqual([
      { text: "Press " },
      { text: "Enter", bold: true },
      { text: " for a new line in the quote, and " },
      { text: "Enter", bold: true },
      { text: " on an empty line to leave it." },
    ]);
    expect(field(paragraphs[2], "listStyleType")).toBe("disc");
    expect(field(paragraphs[2], "indent")).toBe(1);
    expect(elementChildren(paragraphs[2])).toEqual([{ text: "A quote can hold a bullet." }]);

    const callouts = DEMO_DOCUMENT_VALUE.find((item) => item.id === "demo-callouts");
    const defaultCallout = DEMO_DOCUMENT_VALUE.find((item) => item.id === "demo-callout-default");
    const callout = DEMO_DOCUMENT_VALUE.find((item) => item.id === "demo-callout");
    if (
      !callouts ||
      !defaultCallout ||
      defaultCallout.type !== "callout" ||
      !callout ||
      callout.type !== "callout"
    ) {
      throw new Error("Missing the callouts demo.");
    }

    expect(callouts.type).toBe("h3");
    expect(textOf(callouts)).toBe("Callouts");
    expect(DEMO_DOCUMENT_VALUE.indexOf(callouts)).toBe(DEMO_DOCUMENT_VALUE.indexOf(quote) + 1);
    expect(DEMO_DOCUMENT_VALUE.indexOf(defaultCallout)).toBe(
      DEMO_DOCUMENT_VALUE.indexOf(callouts) + 1,
    );
    expect(field(defaultCallout, "icon")).toBe("lightbulb");
    expect(field(defaultCallout, "variant")).toBeUndefined();
    expect(DEMO_DOCUMENT_VALUE.indexOf(callout)).toBe(
      DEMO_DOCUMENT_VALUE.indexOf(defaultCallout) + 1,
    );
    expect(field(callout, "icon")).toBe("info");
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

    const toggles = DEMO_DOCUMENT_VALUE.find((item) => item.id === "demo-toggles");
    const toggle = DEMO_DOCUMENT_VALUE.find((item) => item.id === "demo-toggle");
    const message = DEMO_DOCUMENT_VALUE.find((item) => item.id === "demo-callout-message");
    const nestedToggle = DEMO_DOCUMENT_VALUE.find((item) => item.id === "demo-toggle-nest");
    const quoteToggle = DEMO_DOCUMENT_VALUE.find((item) => item.id === "demo-toggle-quote");
    const headingToggle = DEMO_DOCUMENT_VALUE.find((item) => item.id === "demo-toggle-heading");
    const codeHeading = DEMO_DOCUMENT_VALUE.find((item) => item.id === "demo-code-heading");
    const codeTs = DEMO_DOCUMENT_VALUE.find((item) => item.id === "demo-code-ts");
    const codeJson = DEMO_DOCUMENT_VALUE.find((item) => item.id === "demo-code-json");
    const tables = DEMO_DOCUMENT_VALUE.find((item) => item.id === "demo-tables");
    const table = DEMO_DOCUMENT_VALUE.find((item) => item.id === "demo-table");
    const release = DEMO_DOCUMENT_VALUE.find((item) => item.id === "demo-release");
    const images = DEMO_DOCUMENT_VALUE.find((item) => item.id === "demo-images");
    const image = DEMO_DOCUMENT_VALUE.find((item) => item.id === "demo-image");
    const video = DEMO_DOCUMENT_VALUE.find((item) => item.id === "demo-video");
    const audio = DEMO_DOCUMENT_VALUE.find((item) => item.id === "demo-audio");
    const file = DEMO_DOCUMENT_VALUE.find((item) => item.id === "demo-file");
    const pdf = DEMO_DOCUMENT_VALUE.find((item) => item.id === "demo-pdf");
    const embed = DEMO_DOCUMENT_VALUE.find((item) => item.id === "demo-embed");
    const paste = DEMO_DOCUMENT_VALUE.find((item) => item.id === "demo-paste");
    if (
      !toggles ||
      !toggle ||
      toggle.type !== "toggle" ||
      !message ||
      !nestedToggle ||
      nestedToggle.type !== "toggle" ||
      !quoteToggle ||
      quoteToggle.type !== "toggle" ||
      !headingToggle ||
      headingToggle.type !== "toggle" ||
      !codeHeading ||
      !codeTs ||
      !codeJson ||
      !tables ||
      !table ||
      table.type !== "table" ||
      !images ||
      !image ||
      image.type !== "img" ||
      !video ||
      video.type !== "video" ||
      !audio ||
      audio.type !== "audio" ||
      !file ||
      file.type !== "file" ||
      !pdf ||
      pdf.type !== "file" ||
      !embed ||
      embed.type !== "media_embed" ||
      !release ||
      release.type !== "table" ||
      !paste
    ) {
      throw new Error("Missing the toggles demo.");
    }

    expect(toggles.type).toBe("h3");
    expect(textOf(toggles)).toBe("Toggles");
    expect(DEMO_DOCUMENT_VALUE.indexOf(toggles)).toBe(DEMO_DOCUMENT_VALUE.indexOf(message) + 1);
    expect(DEMO_DOCUMENT_VALUE.indexOf(toggle)).toBe(DEMO_DOCUMENT_VALUE.indexOf(toggles) + 1);
    expect(DEMO_DOCUMENT_VALUE.indexOf(nestedToggle)).toBe(DEMO_DOCUMENT_VALUE.indexOf(toggle) + 1);
    expect(DEMO_DOCUMENT_VALUE.indexOf(quoteToggle)).toBe(
      DEMO_DOCUMENT_VALUE.indexOf(nestedToggle) + 1,
    );
    expect(DEMO_DOCUMENT_VALUE.indexOf(headingToggle)).toBe(
      DEMO_DOCUMENT_VALUE.indexOf(quoteToggle) + 1,
    );
    expect(DEMO_DOCUMENT_VALUE.indexOf(codeHeading)).toBe(
      DEMO_DOCUMENT_VALUE.indexOf(headingToggle) + 1,
    );
    expect(codeHeading.type).toBe("h3");
    expect(DEMO_DOCUMENT_VALUE.indexOf(codeTs)).toBe(DEMO_DOCUMENT_VALUE.indexOf(codeHeading) + 1);
    expect(DEMO_DOCUMENT_VALUE.indexOf(codeJson)).toBe(DEMO_DOCUMENT_VALUE.indexOf(codeTs) + 1);
    expect(DEMO_DOCUMENT_VALUE.indexOf(tables)).toBe(DEMO_DOCUMENT_VALUE.indexOf(codeJson) + 1);
    expect(tables.type).toBe("h3");
    expect(textOf(tables)).toBe("Tables");
    expect(DEMO_DOCUMENT_VALUE.indexOf(table)).toBe(DEMO_DOCUMENT_VALUE.indexOf(tables) + 1);
    const headerRow = elementChildren(table)[0];
    const headerCells = elementChildren(headerRow);
    expect(headerCells.map((cell) => field(cell, "type"))).toEqual(["th", "th", "th"]);
    expect(
      headerCells.map((cell) => leafText(elementChildren(elementChildren(cell)[0])[0])),
    ).toEqual(["Block", "Shortcut", "Notes"]);
    expect(DEMO_DOCUMENT_VALUE.indexOf(release)).toBe(DEMO_DOCUMENT_VALUE.indexOf(table) + 1);
    expect(field(release, "colSizes")).toEqual([160, 240, 120]);
    const releaseHeader = elementChildren(elementChildren(release)[0]);
    expect(field(releaseHeader[0], "colSpan")).toBe(2);
    expect(leafText(elementChildren(elementChildren(releaseHeader[0])[0])[0])).toBe("Release plan");
    const releaseBody = elementChildren(elementChildren(release)[1]);
    expect(field(releaseBody[0], "rowSpan")).toBe(2);
    expect(DEMO_DOCUMENT_VALUE.indexOf(images)).toBe(DEMO_DOCUMENT_VALUE.indexOf(release) + 1);
    expect(images.type).toBe("h3");
    expect(textOf(images)).toBe("Media and files");
    expect(DEMO_DOCUMENT_VALUE.indexOf(image)).toBe(DEMO_DOCUMENT_VALUE.indexOf(images) + 1);
    expect(field(image, "url")).toBe("/blocks/notion-like-editor/image-demo.svg");
    expect(field(image, "alt")).toBe("A small window looking onto a violet hill and a pale sun");
    expect(field(image, "naturalWidth")).toBe(640);
    expect(field(image, "naturalHeight")).toBe(400);
    expect(field(image, "caption")).toEqual([
      { text: "A drawing stored with the block, not an uploaded file." },
    ]);
    expect(DEMO_DOCUMENT_VALUE.indexOf(video)).toBe(DEMO_DOCUMENT_VALUE.indexOf(image) + 1);
    expect(field(video, "url")).toBe("/blocks/notion-like-editor/video-demo.webm");
    expect(field(video, "mimeType")).toBe("video/webm");
    expect(field(video, "naturalWidth")).toBe(160);
    expect(field(video, "naturalHeight")).toBe(90);
    expect(field(video, "durationMs")).toBe(1000);
    expect(DEMO_DOCUMENT_VALUE.indexOf(audio)).toBe(DEMO_DOCUMENT_VALUE.indexOf(video) + 1);
    expect(field(audio, "url")).toBe("/blocks/notion-like-editor/audio-demo.wav");
    expect(field(audio, "mimeType")).toBe("audio/wav");
    expect(field(audio, "name")).toBe("audio-demo.wav");
    expect(field(audio, "durationMs")).toBe(1000);
    expect(field(audio, "caption")).toEqual([
      { text: "A one-second tone, written into a WAV file." },
    ]);
    expect(DEMO_DOCUMENT_VALUE.indexOf(file)).toBe(DEMO_DOCUMENT_VALUE.indexOf(audio) + 1);
    expect(field(file, "url")).toBe("/blocks/notion-like-editor/file-demo.txt");
    expect(field(file, "mimeType")).toBe("application/octet-stream");
    expect(field(file, "name")).toBe("file-demo.txt");
    expect(field(file, "caption")).toEqual([{ text: "A text file stored with the block." }]);
    const demoFile = Bun.file(
      `${import.meta.dir}/../../../../../../apps/web/public/blocks/notion-like-editor/file-demo.txt`,
    );
    const demoFileSize = demoFile.size;
    expect(field(file, "byteSize")).toBe(demoFileSize);
    expect(demoFileSize).toBeLessThanOrEqual(2048);
    expect(DEMO_DOCUMENT_VALUE.indexOf(pdf)).toBe(DEMO_DOCUMENT_VALUE.indexOf(file) + 1);
    expect(field(pdf, "url")).toBe("/blocks/notion-like-editor/pdf-demo.pdf");
    expect(field(pdf, "mimeType")).toBe("application/pdf");
    expect(field(pdf, "name")).toBe("pdf-demo.pdf");
    expect(field(pdf, "assetId")).toBeUndefined();
    expect(field(pdf, "caption")).toEqual([{ text: "A one-page PDF. Paste a PDF to preview it." }]);
    const demoPdf = Bun.file(
      `${import.meta.dir}/../../../../../../apps/web/public/blocks/notion-like-editor/pdf-demo.pdf`,
    );
    const demoPdfSize = demoPdf.size;
    expect(field(pdf, "byteSize")).toBe(demoPdfSize);
    expect(demoPdfSize).toBeLessThanOrEqual(2048);
    expect(DEMO_DOCUMENT_VALUE.indexOf(embed)).toBe(DEMO_DOCUMENT_VALUE.indexOf(pdf) + 1);
    expect(field(embed, "provider")).toBe("youtube");
    expect(field(embed, "videoId")).toBe("jNQXAC9IVRw");
    expect(field(embed, "sourceUrl")).toBe("https://www.youtube.com/watch?v=jNQXAC9IVRw");
    expect(field(embed, "url")).toBeUndefined();
    expect(field(embed, "caption")).toEqual([
      { text: "Me at the zoo, the first video uploaded to YouTube." },
    ]);
    const demoPdfBytes = new Uint8Array(await demoPdf.arrayBuffer());
    expect(Array.from(demoPdfBytes.slice(0, 5))).toEqual([0x25, 0x50, 0x44, 0x46, 0x2d]);
    const demoAudio = Bun.file(
      `${import.meta.dir}/../../../../../../apps/web/public/blocks/notion-like-editor/audio-demo.wav`,
    );
    const demoAudioSize = demoAudio.size;
    expect(demoAudioSize).toBeGreaterThan(44);
    expect(demoAudioSize).toBeLessThanOrEqual(60 * 1024);
    expect(DEMO_DOCUMENT_VALUE.indexOf(paste)).toBe(DEMO_DOCUMENT_VALUE.indexOf(embed) + 1);
    const toggleChildren = elementChildren(toggle);
    expect(toggleChildren.map((child) => field(child, "id"))).toEqual([
      "demo-toggle-1",
      "demo-toggle-2",
      "demo-toggle-3",
    ]);
    expect(elementChildren(toggleChildren[0])).toEqual([
      { text: "Click the arrow to show what is inside." },
    ]);
    expect(field(toggleChildren[0], "listStyleType")).toBeUndefined();
    expect(elementChildren(toggleChildren[1])).toEqual([
      { text: "Toggles hide content until you open them." },
    ]);
    expect(field(toggleChildren[2], "listStyleType")).toBe("disc");
    expect(field(toggleChildren[2], "indent")).toBe(1);
    expect(elementChildren(toggleChildren[2])).toEqual([
      { text: "Content stays in the document while hidden." },
    ]);

    const middle = elementChildren(nestedToggle)[2];
    const inner = elementChildren(middle)[2];
    expect(elementChildren(nestedToggle).map((child) => field(child, "id"))).toEqual([
      "demo-toggle-nest-label",
      "demo-toggle-nest-body",
      "demo-toggle-nest-2",
    ]);
    expect(field(middle, "type")).toBe("toggle");
    expect(elementChildren(middle).map((child) => field(child, "id"))).toEqual([
      "demo-toggle-nest-2-label",
      "demo-toggle-nest-2-body",
      "demo-toggle-nest-3",
    ]);
    expect(field(inner, "type")).toBe("toggle");
    expect(elementChildren(inner).map((child) => field(child, "id"))).toEqual([
      "demo-toggle-nest-3-label",
      "demo-toggle-nest-3-body",
    ]);
    expect(elementChildren(quoteToggle).map((child) => field(child, "id"))).toEqual([
      "demo-toggle-quote-label",
      "demo-toggle-quote-body",
    ]);
    expect(field(elementChildren(quoteToggle)[1], "type")).toBe("blockquote");
    const headingChildren = elementChildren(headingToggle);
    expect(headingChildren.map((child) => field(child, "id"))).toEqual([
      "demo-toggle-heading-label",
      "demo-toggle-heading-body",
      "demo-toggle-heading-item",
    ]);
    expect(field(headingChildren[0], "type")).toBe("h2");
    expect(elementChildren(headingChildren[0])).toEqual([
      { text: "A toggle heading folds a whole section." },
    ]);
    expect(field(headingChildren[2], "listStyleType")).toBe("disc");
    expect(field(headingChildren[2], "indent")).toBe(1);
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

  test("the color paragraph marks every palette token", () => {
    const block = DEMO_DOCUMENT_VALUE.find((item) => item.id === "demo-color");
    if (!block) {
      throw new Error("Missing color paragraph.");
    }

    const marked = block.children
      .filter((child) => field(child, "color") !== undefined)
      .map((child) => [leafText(child), field(child, "color")]);

    expect(textOf(block)).toBe(
      "Colors: gray, brown, orange, yellow, green, blue, purple, pink, and red.",
    );
    expect(marked).toEqual(PALETTE_TOKENS.map((token) => [token, token]));
  });

  test("the combined paragraph stacks bold, italic, underline, color, and highlight", () => {
    const block = DEMO_DOCUMENT_VALUE.find((item) => item.id === "demo-combined");
    if (!block) {
      throw new Error("Missing combined paragraph.");
    }

    const marked = block.children.filter((child) => field(child, "bold") === true);

    expect(textOf(block)).toBe(
      "One phrase can be bold, italic, underlined, colored, and highlighted at once.",
    );
    expect(marked).toEqual([
      {
        text: "bold, italic, underlined, colored, and highlighted",
        bold: true,
        italic: true,
        underline: true,
        color: "red",
        backgroundColor: "yellow",
      },
    ]);
  });

  test("the highlight paragraph marks every highlight token", () => {
    const block = DEMO_DOCUMENT_VALUE.find((item) => item.id === "demo-highlight");
    if (!block) {
      throw new Error("Missing highlight paragraph.");
    }

    const marked = block.children
      .filter((child) => field(child, "backgroundColor") !== undefined)
      .map((child) => [leafText(child), field(child, "backgroundColor")]);

    expect(textOf(block)).toBe(
      "Highlights: gray, brown, orange, yellow, green, blue, purple, pink, and red.",
    );
    expect(marked).toEqual(HIGHLIGHT_TOKENS.map((token) => [token, token]));
  });

  test("the font size paragraph marks every preset", () => {
    const block = DEMO_DOCUMENT_VALUE.find((item) => item.id === "demo-font-size");
    if (!block) {
      throw new Error("Missing font size paragraph.");
    }

    const marked = block.children
      .filter((child) => field(child, "fontSize") !== undefined)
      .map((child) => [leafText(child), field(child, "fontSize")]);

    expect(textOf(block)).toBe("Sizes: 12px, 14px, 16px, 18px, 24px, and 32px.");
    expect(marked).toEqual(FONT_SIZES.map((size) => [size, size]));
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

  test("the demo uses every palette, highlight, font, align, line-height, list, callout tone, and callout icon", () => {
    const colors: string[] = [];
    const highlights: string[] = [];
    const fontSizes: string[] = [];
    const fontFamilies: string[] = [];
    const aligns: string[] = [];
    const lineHeights: number[] = [];
    const listStyles: string[] = [];
    const calloutTones: string[] = [];
    const calloutIcons: string[] = [];

    const visit = (value: unknown): void => {
      if (!isRecord(value)) {
        return;
      }

      if (typeof value.text === "string" && !("children" in value)) {
        if (typeof value.color === "string") {
          colors.push(value.color);
        }
        if (typeof value.backgroundColor === "string") {
          highlights.push(value.backgroundColor);
        }
        if (typeof value.fontSize === "string") {
          fontSizes.push(value.fontSize);
        }
        if (typeof value.fontFamily === "string") {
          fontFamilies.push(value.fontFamily);
        }
        return;
      }

      if (value.type === "callout") {
        calloutTones.push(typeof value.variant === "string" ? value.variant : "default");
        calloutIcons.push(typeof value.icon === "string" ? value.icon : CALLOUT_DEFAULT_ICON);
      }
      if (typeof value.align === "string") {
        aligns.push(value.align);
      }
      if (typeof value.lineHeight === "number") {
        lineHeights.push(value.lineHeight);
      }
      if (typeof value.listStyleType === "string") {
        listStyles.push(value.listStyleType);
      }

      for (const child of elementChildren(value)) {
        visit(child);
      }
    };

    for (const block of DEMO_DOCUMENT_VALUE) {
      visit(block);
    }

    const members = (values: readonly (string | number)[]) =>
      [...new Set(values)].map(String).sort();

    expect(members(colors)).toEqual([...PALETTE_TOKENS].map(String).sort());
    expect(members(highlights)).toEqual([...HIGHLIGHT_TOKENS].map(String).sort());
    expect(members(fontSizes)).toEqual([...FONT_SIZES].map(String).sort());
    expect(members(fontFamilies)).toEqual([...FONT_FAMILIES].map(String).sort());
    expect(members(aligns)).toEqual([...TEXT_ALIGNS].map(String).sort());
    expect(members(lineHeights)).toEqual([...LINE_HEIGHTS].map(String).sort());
    expect(members(listStyles)).toEqual([...LIST_STYLES].map(String).sort());
    expect(members(calloutTones)).toEqual(["default", ...CALLOUT_TONES].map(String).sort());
    expect(members(calloutIcons)).toEqual([...CALLOUT_ICONS].map(String).sort());
  });

  test("the line-break paragraph contains exactly one newline", () => {
    const block = DEMO_DOCUMENT_VALUE.find((item) => item.id === "demo-break");
    const text = block === undefined ? "" : textOf(block);
    const newlines = text.match(/\n/g);

    expect(newlines).toEqual(["\n"]);
  });
});
