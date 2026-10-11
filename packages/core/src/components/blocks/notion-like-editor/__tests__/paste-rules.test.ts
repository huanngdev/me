import { writeFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import { createPlateEditor } from "platejs/react";
import { KEYS, type SlateEditor, type TElement } from "platejs";

import { createEditorDocument } from "../lib/document/editor-document";
import { parseEditorDocument } from "../lib/document/editor-document-validate";
import { runEditorCommand } from "../lib/commands/editor-commands";
import { insertTable } from "../lib/commands/editor-table-commands";
import {
  PASTE_BLOCK_LIMIT,
  PASTE_HTML_CHAR_LIMIT,
  PASTE_TEXT_CHAR_LIMIT,
  pasteRepairsOf,
  pasteTooLargeMessage,
} from "../lib/paste/editor-paste";
import { createEditorPlugins } from "../lib/plugins/editor-plugins";
import { onBlockSelectionPaste, setBlockSelection } from "../lib/plugins/editor-block-selection";
import {
  GOOGLE_DOCS_FIXTURE,
  MALICIOUS_FIXTURE,
  NOTION_FIXTURE,
  WORD_FIXTURE,
} from "./fixtures/paste-apps";
import { blockIds, caret, createEditor, field } from "./test-utils";
import type { EditorValue } from "../lib/document/editor-value";

function plate(value?: EditorValue): SlateEditor {
  return createPlateEditor({
    plugins: createEditorPlugins(),
    value: value ?? [{ type: KEYS.p, id: "p", children: [{ text: "" }] }],
  });
}

function openable(editor: SlateEditor): void {
  const parsed = parseEditorDocument(createEditorDocument("demo", editor.children));
  const ids = blockIds(editor);
  expect(parsed.status).toBe("ok");
  expect(new Set(ids).size).toBe(ids.length);
}

function deepText(node: unknown): string {
  if (Array.isArray(node)) {
    return node.map((child) => deepText(child)).join("");
  }

  if (typeof node !== "object" || node === null) {
    return "";
  }
  if ("text" in node && typeof node.text === "string" && !("children" in node)) {
    return node.text;
  }
  if (!("children" in node) || !Array.isArray(node.children)) {
    return "";
  }
  return node.children.map((child) => deepText(child)).join("");
}

function pasteData(
  editor: SlateEditor,
  plain?: string,
  html?: string,
  fragment?: TElement[],
): void {
  const data = new DataTransfer();
  if (plain !== undefined) {
    data.setData("text/plain", plain);
  }
  if (html !== undefined) {
    data.setData("text/html", html);
  }
  if (fragment !== undefined) {
    data.setData(
      "application/x-slate-fragment",
      window.btoa(encodeURIComponent(JSON.stringify(fragment))),
    );
  }
  editor.tf.insertData(data);
}

describe("paste rules", () => {
  test("slate fragment wins over html and plain, and duplicate ids are fresh", () => {
    const editor = plate([{ type: KEYS.p, id: "src-a", children: [{ text: "Already" }] }]);
    editor.tf.select(caret([0, 0], 7));
    pasteData(editor, "plain", "<h1>HTML</h1>", [
      { type: KEYS.p, id: "src-a", children: [{ text: "Fragment" }] },
    ]);
    expect(deepText(editor.children)).toContain("Fragment");
    expect(deepText(editor.children)).not.toContain("HTML");
    expect(deepText(editor.children)).not.toContain("plain");
    const ids = blockIds(editor);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter((id) => id === "src-a")).toEqual(["src-a"]);
    openable(editor);
  });

  test("html wins over plain text", () => {
    const editor = plate();
    editor.tf.select(caret([0, 0], 0));
    pasteData(editor, "plain", "<h1>HTML</h1>");
    expect(editor.children[0]?.type).toBe(KEYS.h1);
    expect(deepText(editor.children)).toBe("HTML");
  });

  test("plain text keeps lines, blank lines, tabs, spaces, and a long line", () => {
    const samples = [
      "one",
      "a\nb",
      "a\r\nb",
      "a\n\nb",
      "a\n",
      "\tlead",
      "  lead",
      "x".repeat(5000),
    ];
    const results = samples.map((sample) => {
      const editor = plate();
      editor.tf.select(caret([0, 0], 0));
      pasteData(editor, sample);
      return {
        types: editor.children.map((block) => block.type),
        text: editor.children.map((block) => deepText(block)),
      };
    });
    expect(results[0]).toEqual({ types: ["p"], text: ["one"] });
    expect(results[1]).toEqual({ types: ["p", "p"], text: ["a", "b"] });
    expect(results[2]).toEqual({ types: ["p", "p"], text: ["a", "b"] });
    expect(results[3]).toEqual({ types: ["p", "p", "p"], text: ["a", "", "b"] });
    expect(results[4]).toEqual({ types: ["p", "p"], text: ["a", ""] });
    expect(results[5]?.text.join("")).toContain("\tlead");
    expect(results[6]?.text.join("")).toContain("  lead");
    expect(results[7]?.text.join("")).toHaveLength(5000);
    expect(results.map((item) => item.text.join("")).join("")).not.toContain("\r");
  });

  test("a paste into a code block is plain text lines", () => {
    const editor = plate([
      {
        type: KEYS.codeBlock,
        id: "code",
        children: [{ type: KEYS.codeLine, id: "line", children: [{ text: "" }] }],
      },
    ] as EditorValue);
    editor.tf.select(caret([0, 0, 0], 0));
    pasteData(editor, "a\nb", "<h1>No</h1><p><strong>Bold</strong></p>");
    expect(editor.children[0]?.type).toBe(KEYS.codeBlock);
    expect(JSON.stringify(editor.children)).not.toContain("bold");
    expect(deepText(editor.children)).toContain("a");
    expect(deepText(editor.children)).toContain("b");
    expect(deepText(editor.children)).not.toContain("No");
  });

  test("a paste into a code mark stays plain text with that mark", () => {
    const editor = plate([
      { type: KEYS.p, id: "p", children: [{ text: "z", code: true }] },
    ] as EditorValue);
    editor.tf.select(caret([0, 0], 1));
    pasteData(editor, "ab", "<strong>NO</strong>");
    expect(deepText(editor.children)).toContain("zab");
    expect(JSON.stringify(editor.children)).not.toContain('"bold":true');
    const leaves = editor.children[0]?.children ?? [];
    expect(
      leaves.some((leaf) => field(leaf, "code") === true && deepText(leaf).includes("ab")),
    ).toBe(true);
  });

  test("malicious html keeps safe text only", () => {
    const editor = plate();
    editor.tf.select(caret([0, 0], 0));
    pasteData(editor, "fallback", MALICIOUS_FIXTURE);
    const serialized = JSON.stringify(editor.children);
    expect(serialized).not.toContain("script");
    expect(serialized).not.toContain("javascript:");
    expect(serialized).not.toContain("data:text/html");
    expect(serialized).not.toContain("onerror");
    expect(serialized).not.toContain("onclick");
    expect(serialized).not.toContain("iframe");
    expect(deepText(editor.children).length).toBeGreaterThan(0);
    openable(editor);
  });

  test("external html drops scripts, styles, handlers, unsafe urls, and embedded documents", () => {
    const html = [
      "<style>body{color:red}.evil{background:url(javascript:alert(1))}</style>",
      `<script>alert("x")</script>`,
      '<p>Keep <span onclick="alert(1)" onerror="alert(2)" style="position:absolute">safe</span></p>',
      '<a href="javascript:alert(1)">js link</a>',
      '<a href="data:text/html,hi">data link</a>',
      '<a href="vbscript:msgbox(1)">vb link</a>',
      '<iframe src="https://evil.example/embed"></iframe>',
      '<object data="evil.swf"><param name="x"><span>object safe</span></object>',
      '<embed src="evil.swf">',
      '<form action="/steal"><input name="q" value="x"><button>submit safe</button></form>',
    ].join("");
    const editor = plate();
    editor.tf.select(caret([0, 0], 0));
    pasteData(editor, "fallback", html);
    const serialized = JSON.stringify(editor.children);
    expect(serialized).not.toContain("script");
    expect(serialized).not.toContain("javascript:");
    expect(serialized).not.toContain("vbscript:");
    expect(serialized).not.toContain("onerror");
    expect(serialized).not.toContain("onclick");
    expect(serialized).not.toContain("iframe");
    expect(serialized).not.toContain("evil.example");
    expect(serialized).not.toContain("evil.swf");
    expect(serialized).not.toContain("body{color:red}");
    expect(serialized).not.toContain("position");
    expect(serialized).not.toContain("/steal");
    const text = deepText(editor.children);
    expect(text).toContain("safe");
    expect(text).toContain("js link");
    expect(text).toContain("data link");
    expect(text).toContain("vb link");
    expect(text).toContain("object safe");
    expect(text).toContain("submit safe");
    expect(pasteRepairsOf(editor).some((repair) => repair.message.includes("unsafe URL"))).toBe(
      true,
    );
    expect(pasteRepairsOf(editor).some((repair) => repair.message.includes("not supported"))).toBe(
      true,
    );
    openable(editor);
  });

  test("supported color and font-size styles survive the sanitizer", () => {
    const editor = plate();
    editor.tf.select(caret([0, 0], 0));
    pasteData(
      editor,
      "fallback",
      '<p><span style="color:rgb(255, 0, 0)">red</span> <span style="font-size:18px">big</span></p>',
    );
    const serialized = JSON.stringify(editor.children);
    expect(serialized).toContain("red");
    expect(serialized).toContain("big");
    expect(serialized).not.toContain("color:rgb");
    expect(serialized).not.toContain("font-size");
    expect(serialized).toMatch(/"(color|fontSize)":/);
  });

  test("an image keeps its alt text and reports the drop", () => {
    const editor = plate();
    editor.tf.select(caret([0, 0], 0));
    pasteData(editor, "caption", '<p>Hi <img alt="A cat" src="https://example.com/cat.png"></p>');
    expect(deepText(editor.children)).toContain("A cat");
    expect(JSON.stringify(editor.children)).not.toContain("cat.png");
    expect(pasteRepairsOf(editor).some((repair) => repair.message.includes("not supported"))).toBe(
      true,
    );
    openable(editor);
  });

  test("an oversized html payload falls back to plain text", () => {
    const editor = plate();
    editor.tf.select(caret([0, 0], 0));
    pasteData(editor, "plain words", `<p>${"y".repeat(PASTE_HTML_CHAR_LIMIT + 1)}</p>`);
    expect(deepText(editor.children)).toContain("plain words");
    expect(deepText(editor.children)).not.toContain("y".repeat(100));
  });

  test("a paste over the block limit inserts the first blocks and says so", () => {
    const html = Array.from(
      { length: PASTE_BLOCK_LIMIT + 5 },
      (_, index) => `<p>p${index}</p>`,
    ).join("");
    const editor = plate();
    editor.tf.select(caret([0, 0], 0));
    const started = performance.now();
    pasteData(editor, "plain", html);
    const elapsed = performance.now() - started;
    expect(editor.children.length).toBeLessThanOrEqual(PASTE_BLOCK_LIMIT + 1);
    expect(
      pasteRepairsOf(editor).some((repair) => repair.message === pasteTooLargeMessage("blocks")),
    ).toBe(true);
    expect(elapsed).toBeLessThan(10_000);
    openable(editor);
  }, 20_000);

  test("a 2000 paragraph paste reports its unit-test time", () => {
    const html = Array.from({ length: 2000 }, (_, index) => `<p>row ${index}</p>`).join("");
    const editor = plate();
    editor.tf.select(caret([0, 0], 0));
    const started = performance.now();
    pasteData(editor, "plain", html);
    const elapsed = performance.now() - started;
    expect(editor.children.length).toBeGreaterThan(1000);
    writeFileSync("/tmp/dev-126-paste-time.txt", `${elapsed.toFixed(1)}ms`);
    expect(elapsed).toBeLessThan(10_000);
  }, 20_000);

  test("text over the character limit is truncated and reported", () => {
    const editor = createEditor();
    editor.tf.select(caret([0, 0], 0));
    const chunk = "a".repeat(100_000);
    const fragment = Array.from({ length: 12 }, (_, index) => ({
      type: KEYS.p,
      id: `p${index}`,
      children: [{ text: chunk }],
    }));
    editor.tf.insertFragment(fragment);
    expect(deepText(editor.children).length).toBeLessThanOrEqual(PASTE_TEXT_CHAR_LIMIT + 100);
    expect(pasteRepairsOf(editor).map((repair) => repair.message)).toContain(
      pasteTooLargeMessage("characters"),
    );
  });

  test("one undo reverts a paste that reports a repair", () => {
    const editor = plate();
    editor.tf.select(caret([0, 0], 0));
    pasteData(editor, "caption", '<p>Hello</p><img alt="Shot" src="https://example.com/a.png">');
    expect(pasteRepairsOf(editor).length).toBeGreaterThan(0);
    const undos = editor.history.undos.length;
    expect(undos).toBe(1);
    editor.tf.undo();
    expect(deepText(editor.children)).toBe("");
  });

  test("pasting over a text range replaces that range", () => {
    const editor = plate([{ type: KEYS.p, id: "p", children: [{ text: "abcd" }] }]);
    editor.tf.select({ anchor: { path: [0, 0], offset: 1 }, focus: { path: [0, 0], offset: 3 } });
    pasteData(editor, "XY", "<p>XY</p>");
    expect(deepText(editor.children[0])).toBe("aXYd");
  });

  test("pasting over a two-block selection replaces that run", () => {
    const editor = plate([
      { type: KEYS.p, id: "a", children: [{ text: "Alpha" }] },
      { type: KEYS.p, id: "b", children: [{ text: "Beta" }] },
      { type: KEYS.p, id: "c", children: [{ text: "Keep" }] },
    ] as EditorValue);
    setBlockSelection(editor, ["a", "b"]);
    const data = new DataTransfer();
    data.setData("text/html", "<p>Pasted</p>");
    data.setData("text/plain", "Pasted");
    expect(onBlockSelectionPaste(editor, { clipboardData: data, preventDefault() {} })).toBe(true);
    const text = editor.children.map((block) => deepText(block));
    expect(text).toContain("Pasted");
    expect(text).toContain("Keep");
    expect(text).not.toContain("Alpha");
    expect(text).not.toContain("Beta");
    openable(editor);
  });

  test("a paste into an empty paragraph replaces it", () => {
    const editor = plate();
    editor.tf.select(caret([0, 0], 0));
    pasteData(editor, "Hi", "<h1>Title</h1>");
    expect(editor.children.map((block) => block.type)).toEqual([KEYS.h1]);
    expect(deepText(editor.children)).toBe("Title");
  });

  test("a paste into the middle of a paragraph splits it", () => {
    const editor = plate([{ type: KEYS.p, id: "p", children: [{ text: "abcd" }] }]);
    editor.tf.select(caret([0, 0], 2));
    pasteData(editor, "Z", "<p>Z</p><p>Y</p>");
    expect(editor.children.map((block) => deepText(block))).toEqual(["abZ", "Ycd"]);
  });

  test("a paste inside a table cell stays in the cell", () => {
    const editor = plate();
    editor.tf.select(caret([0, 0], 0));
    runEditorCommand(editor, insertTable, { rows: 1, cols: 1 });
    const before = editor.children.length;
    pasteData(editor, "cell", "<h1>Head</h1><p>Body</p>");
    expect(editor.children.length).toBe(before);
    const table = editor.children.find((block) => block.type === KEYS.table);
    expect(table).toBeDefined();
    expect(deepText(table)).toContain("Head");
    expect(deepText(table)).toContain("Body");
    expect(deepText(editor.children.filter((block) => block.type !== KEYS.table))).toBe("");
    expect(deepText(editor.children)).toContain("Head");
    expect(deepText(editor.children)).toContain("Body");
    openable(editor);
  });

  const fixtures = [
    ["Notion", NOTION_FIXTURE, "Notion heading", "Notion shot"],
    ["Word", WORD_FIXTURE, "Word heading", "Word shot"],
    ["Google Docs", GOOGLE_DOCS_FIXTURE, "Docs heading", "Docs shot"],
  ] as const;

  function listStyles(nodes: readonly unknown[]): Set<string> {
    const styles = new Set<string>();
    const visit = (node: unknown): void => {
      if (typeof node !== "object" || node === null) {
        return;
      }
      const style = field(node, "listStyleType");
      if (typeof style === "string") {
        styles.add(style);
      }
      const children = field(node, "children");
      if (Array.isArray(children)) {
        for (const child of children) {
          visit(child);
        }
      }
    };
    for (const node of nodes) {
      visit(node);
    }
    return styles;
  }

  for (const [name, html, heading, alt] of fixtures) {
    test(`${name} fixture keeps the supported blocks, texts, marks, link, and repairs`, () => {
      const editor = plate();
      editor.tf.select(caret([0, 0], 0));
      pasteData(editor, "fallback", html);
      const serialized = JSON.stringify(editor.children);
      const types = editor.children.map((block) => block.type);
      expect(types).toContain(KEYS.h1);
      expect(types).toContain(KEYS.blockquote);
      expect(types).toContain(KEYS.codeBlock);
      expect(types).toContain(KEYS.table);
      const styles = listStyles(editor.children);
      expect(styles.has("disc")).toBe(true);
      expect(styles.has("decimal")).toBe(true);
      if (name === "Notion") {
        expect(styles.has("todo")).toBe(true);
        expect(serialized).toContain('"checked":true');
      }
      const text = deepText(editor.children);
      expect(text).toContain(heading);
      expect(text).toContain("Nested");
      expect(text).toContain("First");
      expect(text).toContain("Second");
      expect(text).toContain(alt);
      expect(serialized).toContain('"bold":true');
      expect(serialized).toContain('"italic":true');
      expect(serialized).toContain('"underline":true');
      expect(serialized).toContain('"strikethrough":true');
      expect(serialized).toContain('"code":true');
      expect(serialized).toContain('"url":"https://example.com/docs"');
      const repairs = pasteRepairsOf(editor).map((repair) => repair.message);
      expect(repairs.some((message) => message.includes("not supported"))).toBe(true);
      openable(editor);
    });
  }

  test("vietnamese text and emoji survive plain and html paste", () => {
    const text = "Tiếng Việt\u0301 😀";
    const plainEditor = plate();
    plainEditor.tf.select(caret([0, 0], 0));
    pasteData(plainEditor, text);
    expect(deepText(plainEditor.children)).toBe(text);
    const htmlEditor = plate();
    htmlEditor.tf.select(caret([0, 0], 0));
    pasteData(htmlEditor, text, `<p>${text}</p>`);
    expect(deepText(htmlEditor.children)).toBe(text);
    const fragmentEditor = createEditor();
    fragmentEditor.tf.select(caret([0, 0], 0));
    fragmentEditor.tf.insertFragment([{ type: KEYS.p, children: [{ text }] }]);
    expect(deepText(fragmentEditor.children)).toBe(text);
  });
});
