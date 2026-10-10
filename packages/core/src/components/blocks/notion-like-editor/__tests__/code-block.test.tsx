import { describe, expect, test } from "bun:test";
import { codeBlockToDecorations } from "@platejs/code-block";
import { type SlateEditor, type TElement } from "platejs";
import { Key, createPlateEditor } from "platejs/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";

import {
  exitCodeBlock,
  getBlockType,
  runEditorCommand,
  setCodeLanguage,
  turnIntoCodeBlock,
} from "../lib/commands/editor-commands";
import { ensureCodeLanguage } from "../lib/features/editor-code";
import { createEditorDocument } from "../lib/document/editor-document";
import {
  CODE_LANGS,
  allowedChildTypes,
  elementAllowsMarks,
  repairAttrKeys,
} from "../lib/document/editor-document-schema";
import { parseEditorDocument } from "../lib/document/editor-document-validate";
import { createEditorPlugins } from "../lib/plugins/editor-plugins";
import { EditorSurface } from "../components/editor/editor-surface";
import type { EditorValue } from "../lib/document/editor-value";
import { caret, createEditor, expectOk, expectUnsupported, field, isRecord } from "./test-utils";

function line(text: string, id: string, marks?: Record<string, boolean>): TElement {
  return {
    type: "code_line",
    id,
    children: [marks === undefined ? { text } : { text, ...marks }],
  };
}

function codeBlock(lines: TElement[], id = "code-1", lang?: string): EditorValue[number] {
  const block: EditorValue[number] = {
    type: "code_block",
    id,
    children: lines,
  };
  if (lang !== undefined) {
    block.lang = lang;
  }

  return block;
}

function paragraph(text: string, id: string, marks?: Record<string, boolean>): EditorValue[number] {
  return {
    type: "p",
    id,
    children: [marks === undefined ? { text } : { text, ...marks }],
  };
}

function quote(children: EditorValue): EditorValue[number] {
  return { type: "blockquote", id: "quote-1", children };
}

function callout(children: EditorValue): EditorValue[number] {
  return { type: "callout", id: "callout-1", children };
}

function toggle(children: EditorValue): EditorValue[number] {
  return { type: "toggle", id: "toggle-1", children };
}

function todo(text: string, checked = false): EditorValue[number] {
  return {
    type: "p",
    id: "todo-1",
    indent: 1,
    listStyleType: "todo",
    checked,
    children: [{ text }],
  };
}

function documentOf(content: EditorValue) {
  return parseEditorDocument(createEditorDocument("doc", content));
}

function snapshot(value: unknown): string {
  return JSON.stringify(value);
}

function decorationClass(range: object): string {
  if ("className" in range && typeof range.className === "string") {
    return range.className;
  }

  return "";
}

function isEditorElement(node: unknown): node is TElement {
  return isRecord(node) && typeof node.type === "string" && Array.isArray(node.children);
}

function blockAt(editor: SlateEditor, index = 0): Record<string, unknown> {
  const block = editor.children[index];
  if (!isRecord(block)) {
    throw new Error("Missing block.");
  }

  return block;
}

function childTexts(node: unknown): string[] {
  if (!isRecord(node) || !Array.isArray(node.children)) {
    return [];
  }

  return node.children.map((child) => {
    if (!isRecord(child) || !Array.isArray(child.children)) {
      return "";
    }

    return child.children
      .map((leaf) => (isRecord(leaf) && typeof leaf.text === "string" ? leaf.text : ""))
      .join("");
  });
}

function pressShortcut(editor: SlateEditor, id: string): void {
  const shortcut = editor.meta.shortcuts[id];
  if (!shortcut?.handler) {
    throw new Error(`Missing shortcut ${id}.`);
  }

  shortcut.handler({ editor });
}

function pasteData(editor: SlateEditor, plain?: string, html?: string): void {
  const data = new DataTransfer();
  if (plain !== undefined) {
    data.setData("text/plain", plain);
  }
  if (html !== undefined) {
    data.setData("text/html", html);
  }

  editor.tf.insertData(data);
}

function renderCode(value: EditorValue, readOnly = false): string {
  const editor = createPlateEditor({
    plugins: createEditorPlugins(),
    value,
  });

  return renderToStaticMarkup(
    <EditorSurface editor={editor} readOnly={readOnly} placeholder="" className="editor" />,
  );
}

function isReactContainer(value: object): value is Parameters<typeof createRoot>[0] {
  return "nodeType" in value && value.nodeType === 1;
}

function isClickable(value: unknown): value is {
  dispatchEvent: (event: Event) => boolean;
  getAttribute: (name: string) => string | null;
  ownerDocument: {
    defaultView: {
      MouseEvent: new (type: string, init?: MouseEventInit) => MouseEvent;
    } | null;
  };
} {
  return (
    isRecord(value) &&
    typeof value.dispatchEvent === "function" &&
    typeof value.getAttribute === "function" &&
    isRecord(value.ownerDocument) &&
    isRecord(value.ownerDocument.defaultView) &&
    typeof value.ownerDocument.defaultView.MouseEvent === "function"
  );
}

function stubAnimationFrame(): () => void {
  const previousFrame = Reflect.get(globalThis, "requestAnimationFrame");
  const previousCancel = Reflect.get(globalThis, "cancelAnimationFrame");
  Reflect.set(globalThis, "requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  Reflect.set(globalThis, "cancelAnimationFrame", () => {});
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

  return () => {
    Reflect.set(globalThis, "requestAnimationFrame", previousFrame);
    Reflect.set(globalThis, "cancelAnimationFrame", previousCancel);
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT");
  };
}

async function mountCode(value: EditorValue, readOnly = false) {
  const restoreFrame = stubAnimationFrame();
  const before = new Set(Array.from(document.body.childNodes));
  const host = document.createElement("div");
  document.body.appendChild(host);
  const editor = createPlateEditor({
    plugins: createEditorPlugins(),
    value,
  });
  let root: Root | undefined;
  if (!isReactContainer(host)) {
    throw new Error("Missing mount node.");
  }

  await act(async () => {
    root = createRoot(host);
    root.render(
      <EditorSurface editor={editor} readOnly={readOnly} placeholder="" className="editor" />,
    );
  });

  return {
    host,
    cleanup: async () => {
      await act(async () => {
        root?.unmount();
      });
      for (const node of Array.from(document.body.childNodes)) {
        if (!before.has(node)) {
          node.remove();
        }
      }
      restoreFrame();
    },
  };
}

const sample = codeBlock(
  [line('  const name = "Ada";', "line-1"), line("", "line-2"), line("\treturn name;", "line-3")],
  "code-1",
  "typescript",
);

describe("code block schema", () => {
  test("code_block holds code lines and code lines hold unmarked text", () => {
    expect(allowedChildTypes("code_block")).toEqual(["code_line"]);
    expect(allowedChildTypes("code_line")).toBeUndefined();
    expect(elementAllowsMarks("code_line")).toBe(false);
    expect(repairAttrKeys("code_block")).toEqual(["lang"]);
    expect(CODE_LANGS).not.toContain("plaintext");
  });

  test("a code block with lang, tabs, and a blank line round-trips", () => {
    const parsed = expectOk(documentOf([sample]));
    const block = parsed.document.content[0];

    expect(parsed.repairs).toEqual([]);
    expect(field(block, "lang")).toBe("typescript");
    expect(childTexts(block)).toEqual(['  const name = "Ada";', "", "\treturn name;"]);
    expect(snapshot(parsed.document.content)).not.toContain("code_syntax");
  });

  test("a mark in a code line is rejected", () => {
    const parsed = expectUnsupported(
      documentOf([codeBlock([line("const", "line-1", { bold: true })])]),
    );

    expect(parsed.issues.some((issue) => issue.message.includes("unsupported mark"))).toBe(true);
  });

  test("an unknown lang is cleared and reported as plaintext", () => {
    const parsed = expectOk(
      documentOf([codeBlock([line("print(1)", "line-1")], "code-1", "cobol")]),
    );
    const block = parsed.document.content[0];

    expect(field(block, "lang")).toBeUndefined();
    expect(childTexts(block)).toEqual(["print(1)"]);
    expect(parsed.repairs.map((repair) => repair.message).join(" ")).toContain(
      "Invalid/unknown language fallback plaintext",
    );
  });

  test("an explicit plaintext lang is cleared and reported", () => {
    const parsed = expectOk(
      documentOf([codeBlock([line("hello", "line-1")], "code-1", "plaintext")]),
    );

    expect(field(parsed.document.content[0], "lang")).toBeUndefined();
    expect(parsed.repairs.map((repair) => repair.message).join(" ")).toContain("plaintext");
  });

  test("a paragraph child is invalid", () => {
    const parsed = expectUnsupported(documentOf([codeBlock([paragraph("no", "para-1")])]));

    expect(
      parsed.issues.some(
        (issue) => issue.message.includes("paragraph") || issue.message.includes('"p"'),
      ),
    ).toBe(true);
  });
});

describe("code block normalizer", () => {
  test("marks in a code line are stripped", () => {
    const editor = createEditor([codeBlock([line("const", "line-1", { bold: true })])]);
    editor.tf.normalize({ force: true });
    const block = blockAt(editor);
    const codeLine = Array.isArray(block.children) ? block.children[0] : undefined;
    const text =
      isRecord(codeLine) && Array.isArray(codeLine.children) ? codeLine.children[0] : undefined;

    expect(childTexts(block)).toEqual(["const"]);
    expect(isRecord(text) ? text.bold : "missing").toBeUndefined();
  });

  test("an unknown lang is dropped and the text stays", () => {
    const editor = createEditor([codeBlock([line("print(1)", "line-1")], "code-1", "cobol")]);
    editor.tf.normalize({ force: true });

    expect(field(blockAt(editor), "lang")).toBeUndefined();
    expect(field(blockAt(editor), "type")).toBe("code_block");
    expect(childTexts(blockAt(editor))).toEqual(["print(1)"]);
  });

  test("a code block in a quote becomes one paragraph per line", () => {
    const editor = createEditor([
      quote([
        codeBlock([line("alpha", "line-1"), line("beta\tgamma", "line-2")], "code-1", "python"),
      ]),
    ]);
    editor.tf.normalize({ force: true });
    const block = blockAt(editor);

    expect(field(block, "type")).toBe("blockquote");
    expect(
      Array.isArray(block.children) ? block.children.map((child) => field(child, "type")) : [],
    ).toEqual(["p", "p"]);
    expect(
      Array.isArray(block.children)
        ? block.children.map((child) =>
            isRecord(child) && Array.isArray(child.children) && isRecord(child.children[0])
              ? child.children[0].text
              : "",
          )
        : [],
    ).toEqual(["alpha", "beta\tgamma"]);
  });

  test("a code block in a callout becomes one paragraph per line", () => {
    const editor = createEditor([
      callout([codeBlock([line("one", "line-1"), line("two", "line-2")])]),
    ]);
    editor.tf.normalize({ force: true });
    const block = blockAt(editor);

    expect(field(block, "type")).toBe("callout");
    expect(Array.isArray(block.children) ? block.children.length : 0).toBe(2);
    expect(
      Array.isArray(block.children)
        ? block.children.every((child) => field(child, "type") === "p")
        : false,
    ).toBe(true);
  });

  test("a code block in toggle content stays a code block", () => {
    const editor = createEditor([
      toggle([
        paragraph("Label", "label-1"),
        codeBlock([line("inside", "line-1")], "code-1", "go"),
      ]),
    ]);
    const block = blockAt(editor);
    const content = Array.isArray(block.children) ? block.children[1] : undefined;

    expect(field(content, "type")).toBe("code_block");
    expect(field(content, "lang")).toBe("go");
    expect(childTexts(content)).toEqual(["inside"]);
  });
});

describe("code block commands", () => {
  test("paragraphs become one code block and turn back into paragraphs", () => {
    const editor = createEditor([
      paragraph("alpha", "para-1", { bold: true }),
      paragraph("beta", "para-2"),
    ]);
    editor.tf.select({
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [1, 0], offset: 4 },
    });
    const before = editor.history.undos.length;

    expect(runEditorCommand(editor, turnIntoCodeBlock, undefined)).toBe(true);
    expect(editor.history.undos.length - before).toBe(1);
    expect(field(blockAt(editor), "type")).toBe("code_block");
    expect(field(blockAt(editor), "id")).not.toBe("para-1");
    expect(childTexts(blockAt(editor))).toEqual(["alpha", "beta"]);
    const lines = blockAt(editor).children;
    if (!Array.isArray(lines)) {
      throw new Error("Missing code lines.");
    }
    expect(lines.map((child: unknown) => field(child, "id"))).toEqual(["para-1", "para-2"]);
    expect(snapshot(blockAt(editor))).not.toContain("bold");
    expect(getBlockType(editor)).toBe("code_block");

    editor.tf.undo();
    expect(editor.children.map((block) => field(block, "type"))).toEqual(["p", "p"]);
    expect(editor.children.map((block) => field(block, "id"))).toEqual(["para-1", "para-2"]);

    editor.tf.redo();
    expect(runEditorCommand(editor, turnIntoCodeBlock, undefined)).toBe(true);
    expect(editor.children.map((block) => field(block, "type"))).toEqual(["p", "p"]);
    expect(
      editor.children.map((block) =>
        isRecord(block) && Array.isArray(block.children) && isRecord(block.children[0])
          ? block.children[0].text
          : "",
      ),
    ).toEqual(["alpha", "beta"]);
  });

  test("setCodeLanguage sets, replaces, and clears in one undo each", () => {
    const editor = createEditor([codeBlock([line("const a = 1;", "line-1")])]);
    editor.tf.select(caret([0, 0, 0], 0));

    const set = editor.history.undos.length;
    expect(runEditorCommand(editor, setCodeLanguage, { lang: "typescript", at: [0] })).toBe(true);
    expect(editor.history.undos.length - set).toBe(1);
    expect(field(blockAt(editor), "lang")).toBe("typescript");
    const selection = editor.selection;

    expect(runEditorCommand(editor, setCodeLanguage, { lang: "json", at: [0] })).toBe(true);
    expect(field(blockAt(editor), "lang")).toBe("json");
    expect(editor.selection).toEqual(selection);

    expect(runEditorCommand(editor, setCodeLanguage, { lang: null, at: [0] })).toBe(true);
    expect(field(blockAt(editor), "lang")).toBeUndefined();

    editor.tf.undo();
    expect(field(blockAt(editor), "lang")).toBe("json");
    editor.tf.undo();
    expect(field(blockAt(editor), "lang")).toBe("typescript");
    editor.tf.undo();
    expect(field(blockAt(editor), "lang")).toBeUndefined();
  });

  test("read-only refuses turn into, language, and exit", () => {
    const editor = createEditor([paragraph("alpha", "para-1")]);
    editor.tf.select(caret([0, 0], 0));
    const undos = editor.history.undos.length;

    expect(runEditorCommand(editor, turnIntoCodeBlock, undefined, { readOnly: true })).toBe(false);
    expect(runEditorCommand(editor, setCodeLanguage, { lang: "python" }, { readOnly: true })).toBe(
      false,
    );
    expect(runEditorCommand(editor, exitCodeBlock, undefined, { readOnly: true })).toBe(false);
    expect(editor.history.undos.length).toBe(undos);
    expect(field(blockAt(editor), "type")).toBe("p");
  });

  test("the command is Code in the turn-into group and has no shortcut", () => {
    expect(turnIntoCodeBlock.id).toBe("block.turn-into.code-block");
    expect(turnIntoCodeBlock.label).toBe("Code");
    expect(turnIntoCodeBlock.group).toBe("turn-into");
    expect(setCodeLanguage.id).toBe("format.code-language");
    const editor = createEditor();
    const codeShortcuts = Object.values(editor.meta.shortcuts).filter(
      (shortcut) => isRecord(shortcut) && shortcut.handler === turnIntoCodeBlock.run,
    );

    expect(codeShortcuts).toEqual([]);
  });
});

describe("code block keyboard", () => {
  test("Enter keeps the current line's leading spaces", () => {
    const editor = createEditor([
      codeBlock([line("  const title = note.title;", "line-1")], "code-1", "typescript"),
    ]);
    editor.tf.select(caret([0, 0, 0], 8));

    editor.tf.insertBreak();

    expect(field(blockAt(editor), "type")).toBe("code_block");
    // Offset 8 is after the indent and "const ". Plate copies that indent onto the new line.
    expect(childTexts(blockAt(editor))).toEqual(["  const ", "  title = note.title;"]);
  });

  test("Shift+Enter inserts a code line instead of a soft break", () => {
    const editor = createEditor([codeBlock([line("  keep", "line-1")])]);
    // Past the leading spaces, so the new line receives the same two-space indent.
    editor.tf.select(caret([0, 0, 0], 4));

    editor.tf.insertSoftBreak();

    expect(field(blockAt(editor), "type")).toBe("code_block");
    expect(childTexts(blockAt(editor))).toEqual(["  ke", "  ep"]);
    expect(childTexts(blockAt(editor)).every((text) => !text.includes("\n"))).toBe(true);
  });

  test("Enter on an empty last line stays inside the code block", () => {
    const editor = createEditor([codeBlock([line("kept", "line-1"), line("", "line-2")])]);
    editor.tf.select(caret([0, 1, 0], 0));

    editor.tf.insertBreak();

    expect(editor.children.map((block) => field(block, "type"))).toEqual(["code_block"]);
    expect(childTexts(blockAt(editor))[0]).toBe("kept");
    expect(childTexts(blockAt(editor)).length).toBeGreaterThan(2);
  });

  test("Mod+Enter exits a code block and still checks a to-do", () => {
    const editor = createEditor([codeBlock([line("inside", "line-1")]), todo("Task", false)]);
    const keys = JSON.stringify(editor.meta.shortcuts["list.toggleChecked"]?.keys);
    const collisions = Object.entries(editor.meta.shortcuts).filter(([id, shortcut]) => {
      return (
        id !== "list.toggleChecked" && isRecord(shortcut) && JSON.stringify(shortcut.keys) === keys
      );
    });

    expect(editor.meta.shortcuts["list.toggleChecked"]?.keys).toEqual([[Key.Mod, "Enter"]]);
    expect(collisions).toEqual([]);

    editor.tf.select(caret([0, 0, 0], 2));
    pressShortcut(editor, "list.toggleChecked");

    expect(editor.children.map((block) => field(block, "type"))).toEqual(["code_block", "p", "p"]);
    expect(editor.selection?.anchor.path[0]).toBe(1);

    editor.tf.select(caret([2, 0], 0));
    pressShortcut(editor, "list.toggleChecked");

    expect(field(editor.children[2], "checked")).toBe(true);
  });

  test("Tab and Shift+Tab indent code lines and leave a paragraph alone", () => {
    const inside = createEditor([codeBlock([line("const a = 1;", "line-1")])]);
    inside.tf.select(caret([0, 0, 0], 0));

    expect(inside.tf.tab({ reverse: false })).toBe(true);
    expect(childTexts(blockAt(inside))).toEqual(["  const a = 1;"]);

    expect(inside.tf.tab({ reverse: true })).toBe(true);
    expect(childTexts(blockAt(inside))).toEqual(["const a = 1;"]);

    const outside = createEditor([paragraph("plain", "para-1")]);
    outside.tf.select(caret([0, 0], 0));

    expect(outside.tf.tab({ reverse: false })).toBe(false);
    expect(
      isRecord(outside.children[0]) &&
        Array.isArray(outside.children[0].children) &&
        isRecord(outside.children[0].children[0])
        ? outside.children[0].children[0].text
        : "",
    ).toBe("plain");
  });

  test("Backspace at the start of the first line keeps the text", () => {
    const editor = createEditor([codeBlock([line("kept", "line-1")])]);
    editor.tf.select(caret([0, 0, 0], 0));

    editor.tf.deleteBackward();

    expect(childTexts(blockAt(editor))).toEqual(["kept"]);
    expect(editor.children).toHaveLength(1);
  });

  test("Enter at offset 0 inserts a code line above and keeps the text", () => {
    const editor = createEditor([
      paragraph("before", "para-1"),
      codeBlock([line("  kept", "line-1")]),
    ]);
    editor.tf.select(caret([1, 0, 0], 0));

    editor.tf.insertBreak();

    expect(editor.children.map((block) => field(block, "type"))).toEqual(["p", "code_block"]);
    expect(childTexts(blockAt(editor, 1)).join("")).toContain("kept");
    expect(childTexts(blockAt(editor, 1)).length).toBe(2);
  });

  test("three backticks typed in a code block stay text", () => {
    const editor = createEditor([codeBlock([line("run", "line-1")])]);
    editor.tf.select(caret([0, 0, 0], 3));

    editor.tf.insertText("```");

    expect(field(blockAt(editor), "type")).toBe("code_block");
    expect(childTexts(blockAt(editor))).toEqual(["run```"]);
  });
});

describe("code block paste", () => {
  test("plain text with tabs and blank lines becomes code lines", () => {
    const editor = createEditor([codeBlock([line("start", "line-1")])]);
    editor.tf.select(caret([0, 0, 0], 5));

    pasteData(editor, "a\n\tb\n\nc");

    expect(childTexts(blockAt(editor))).toEqual(["starta", "\tb", "", "c"]);
  });

  test("HTML-like text is inserted literally", () => {
    const editor = createEditor([codeBlock([line("", "line-1")])]);
    editor.tf.select(caret([0, 0, 0], 0));

    pasteData(editor, undefined, "<div>&amp;</div>");

    expect(childTexts(blockAt(editor))).toEqual(["<div>&amp;</div>"]);
  });

  test("a pre element outside a code block keeps the mapped language and whitespace", () => {
    const editor = createEditor([paragraph("", "para-1")]);
    editor.tf.select(caret([0, 0], 0));

    pasteData(
      editor,
      "const a = 1;\n  const b = 2;",
      '<pre><code class="language-ts">const a = 1;\n  const b = 2;</code></pre>',
    );

    const block = editor.children.find((node) => field(node, "type") === "code_block");
    expect(field(block, "lang")).toBe("typescript");
    expect(childTexts(block)).toEqual(["const a = 1;", "  const b = 2;"]);
  });

  test("an editor fragment keeps the code block and its lang", () => {
    const editor = createEditor([paragraph("", "para-1")]);
    editor.tf.select(caret([0, 0], 0));

    editor.tf.insertFragment([
      codeBlock([line("kept", "line-1"), line("  next", "line-2")], "code-9", "rust"),
    ]);

    const block = editor.children.find((node) => field(node, "type") === "code_block");
    expect(field(block, "lang")).toBe("rust");
    expect(childTexts(block)).toEqual(["kept", "  next"]);
  });
});

describe("code block highlight", () => {
  test("a TypeScript line is decorated after the grammar loads and nothing is stored", async () => {
    await ensureCodeLanguage("typescript");
    const editor = createEditor([
      codeBlock([line('const name: string = "Ada";', "line-1")], "code-1", "typescript"),
    ]);
    const block = editor.children[0];
    if (!isEditorElement(block) || block.type !== "code_block") {
      throw new Error("Missing code block.");
    }

    const decorations = codeBlockToDecorations(editor, [block, [0]]);
    const ranges = [...decorations.values()].flat();

    expect(ranges.length).toBeGreaterThan(0);
    expect(ranges.some((range) => decorationClass(range).includes("hljs-keyword"))).toBe(true);
    expect(snapshot(editor.children)).not.toContain("hljs-");
    expect(snapshot(editor.children)).not.toContain("code_syntax");
  });

  test("plaintext has no decorations", () => {
    const editor = createEditor([codeBlock([line("const name = 1;", "line-1")])]);
    const block = editor.children[0];
    if (!isEditorElement(block)) {
      throw new Error("Missing code block.");
    }

    const decorations = codeBlockToDecorations(editor, [block, [0]]);
    const ranges = [...decorations.values()].flat();

    expect(ranges).toEqual([]);
  });

  test("a 20,000 character line decorates without throwing", async () => {
    await ensureCodeLanguage("typescript");
    const text = "const value = ".repeat(1_429).slice(0, 20_000);
    expect(text).toHaveLength(20_000);
    const editor = createEditor([codeBlock([line(text, "line-1")], "code-1", "typescript")]);
    const block = editor.children[0];
    if (!isEditorElement(block)) {
      throw new Error("Missing code block.");
    }

    const started = performance.now();
    const decorations = codeBlockToDecorations(editor, [block, [0]]);
    const elapsed = performance.now() - started;

    expect([...decorations.values()].flat().length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(1000);
    console.warn(`code block 20000-character decorate ${elapsed.toFixed(1)}ms`);
  });
});

describe("code block render", () => {
  test("the block is a pre and the toolbar is not editable", () => {
    const html = renderCode([sample]);

    expect(html).toContain("<pre");
    expect(html).toMatch(/contenteditable="false"/i);
    expect(html).toContain("Change code language");
    expect(html).toContain("TypeScript");
    expect(html).toContain("bg-muted");
    expect(html).not.toContain("border-l-2");
    expect(html).not.toContain("var(--editor-code-border)");
    expect(html).not.toContain("var(--editor-code-bg)");
  });

  test("read-only shows the language as text and still offers copy", () => {
    const html = renderCode([sample], true);

    expect(html).not.toContain("Change code language");
    expect(html).toContain("TypeScript");
    expect(html).toContain("Copy code");
  });

  test("a grammar that loads after mount paints hljs token classes", async () => {
    const mounted = await mountCode([
      codeBlock(
        [line("def answer():", "line-1"), line("    return 42", "line-2")],
        "code-py",
        "python",
      ),
    ]);

    try {
      await act(async () => {
        await ensureCodeLanguage("python");
        await Promise.resolve();
      });

      expect(mounted.host.innerHTML).toContain("hljs-keyword");
    } finally {
      await mounted.cleanup();
    }
  });

  test("copy writes the code lines joined by newlines", async () => {
    const writes: string[] = [];
    const previous = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText(text: string) {
          writes.push(text);
          return Promise.resolve();
        },
      },
    });
    const mounted = await mountCode([sample]);
    const button = mounted.host.querySelector('[aria-label="Copy code"]');
    const view = isClickable(button) ? button.ownerDocument.defaultView : null;
    if (!isClickable(button) || view === null) {
      throw new Error("Missing copy button.");
    }

    try {
      await act(async () => {
        button.dispatchEvent(
          new view.MouseEvent("click", {
            bubbles: true,
            cancelable: true,
          }),
        );
        await Promise.resolve();
      });

      expect(writes).toEqual(['  const name = "Ada";\n\n\treturn name;']);
      expect(mounted.host.querySelector('[aria-label="Copied"]')).not.toBeNull();
    } finally {
      if (previous) {
        Object.defineProperty(navigator, "clipboard", previous);
      } else {
        Reflect.deleteProperty(navigator, "clipboard");
      }
      await mounted.cleanup();
    }
  });
});
