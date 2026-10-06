import { describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { KEYS, type SlateEditor } from "platejs";
import { Key, Plate, PlateContent, createPlateEditor } from "platejs/react";
import { renderToStaticMarkup } from "react-dom/server";

import { listMarker } from "./block-list";
import { createEditorPlugins } from "./editor-plugins";
import {
  BULLETED_LIST_TYPE,
  getBlockType,
  runEditorCommand,
  toggleBulletedList,
} from "./editor-commands";
import { parseEditorDocument } from "./editor-document-validate";
import { LIST_INDENTS, unsatisfiedDependentAttrs } from "./editor-document-schema";
import type { EditorValue } from "./editor-value";
import {
  blockIds,
  caret,
  createEditor,
  expectOk,
  expectUnsupported,
  field,
  isRecord,
  texts,
} from "./test-utils";

function envelope(content: unknown) {
  return {
    schemaVersion: 1,
    documentId: "doc",
    revision: 0,
    content,
  };
}

function bullet(text: string, id: string, indent = 1): EditorValue[number] {
  return {
    type: "p",
    id,
    indent,
    listStyleType: "disc",
    children: [{ text }],
  };
}

function pressBulletedList(editor: SlateEditor): void {
  const shortcut = editor.meta.shortcuts["list.toggleBulleted"];
  if (!shortcut?.handler) {
    throw new Error("Missing bulleted list shortcut.");
  }

  shortcut.handler({ editor });
}

function hasTab(tf: object): tf is { tab: (options?: { reverse?: boolean }) => boolean } {
  return "tab" in tf && typeof tf.tab === "function";
}

function pressTab(editor: SlateEditor, reverse = false): boolean {
  if (!hasTab(editor.tf)) {
    throw new Error("Missing tab transform.");
  }

  return editor.tf.tab({ reverse }) === true;
}

function restoreGlobal(key: string, had: boolean, previous: unknown): void {
  if (had) {
    Reflect.set(globalThis, key, previous);
    return;
  }

  Reflect.deleteProperty(globalThis, key);
}

// List HTML attrs are written by the list plugin's parser.transformData, which
// insertData runs before deserialize. Element-only deserialize skips that pass.
function pasteHtml(html: string): SlateEditor {
  const editor = createEditor();
  editor.tf.select(caret([0, 0], 0));
  const dom = new Window();
  const hadNode = Object.hasOwn(globalThis, "Node");
  const hadParser = Object.hasOwn(globalThis, "DOMParser");
  const hadTransfer = Object.hasOwn(globalThis, "DataTransfer");
  const previousNode = hadNode ? Reflect.get(globalThis, "Node") : undefined;
  const previousParser = hadParser ? Reflect.get(globalThis, "DOMParser") : undefined;
  const previousTransfer = hadTransfer ? Reflect.get(globalThis, "DataTransfer") : undefined;

  Reflect.set(globalThis, "Node", dom.Node);
  Reflect.set(globalThis, "DOMParser", dom.DOMParser);
  Reflect.set(globalThis, "DataTransfer", dom.DataTransfer);

  try {
    const data = new DataTransfer();
    data.setData("text/html", html);
    editor.tf.insertData(data);
  } finally {
    restoreGlobal("Node", hadNode, previousNode);
    restoreGlobal("DOMParser", hadParser, previousParser);
    restoreGlobal("DataTransfer", hadTransfer, previousTransfer);
    dom.close();
  }

  return editor;
}

describe("dependent attribute rule", () => {
  test("a dependent attribute is unsatisfied without an allowed required attribute", () => {
    expect(unsatisfiedDependentAttrs("p", { indent: 1 })).toEqual(["indent"]);
    expect(unsatisfiedDependentAttrs("p", { indent: 1, listStyleType: "decimal" })).toEqual([]);
    expect(unsatisfiedDependentAttrs("p", { indent: 2, listStyleType: "disc" })).toEqual([]);
    expect(unsatisfiedDependentAttrs("p", { listStyleType: "disc" })).toEqual([]);
    expect(unsatisfiedDependentAttrs("p", { align: "center" })).toEqual([]);
    expect(unsatisfiedDependentAttrs("h1", { indent: 1, listStyleType: "disc" })).toEqual([]);
  });
});

describe("bulleted list allowlist", () => {
  test("indents 1 through 6 round-trip with disc and keep align", () => {
    for (const indent of LIST_INDENTS) {
      const content = [
        {
          type: "p",
          id: "block-a",
          indent,
          listStyleType: "disc",
          align: "center",
          children: [{ text: "Item" }],
        },
      ];
      const result = expectOk(parseEditorDocument(envelope(content)));

      expect(result.document.content).toBe(content);
      expect(field(result.document.content[0], "indent")).toBe(indent);
      expect(field(result.document.content[0], "listStyleType")).toBe("disc");
      expect(field(result.document.content[0], "align")).toBe("center");
    }
  });

  test.each([
    [7, "disc", "indent"],
    [1, "square", "listStyleType"],
  ] as const)("indent %s and listStyleType %s is unsupported", (indent, listStyleType, key) => {
    const content = [
      {
        type: "p",
        id: "block-a",
        indent,
        listStyleType,
        children: [{ text: "Item" }],
      },
    ];
    const raw = envelope(content);
    const result = expectUnsupported(parseEditorDocument(raw));

    expect(result.raw).toBe(raw);
    expect(result.issues.some((issue) => issue.message.includes(`unsupported ${key}`))).toBe(true);
  });

  test("indent without listStyleType is unsupported and the raw document is kept", () => {
    const content = [{ type: "p", id: "block-a", indent: 2, children: [{ text: "Item" }] }];
    const raw = envelope(content);
    const result = expectUnsupported(parseEditorDocument(raw));

    expect(result.raw).toBe(raw);
    expect(result.issues[0]?.message).toContain("unsupported indent without listStyleType");
  });

  test("a heading with listStyleType is unsupported", () => {
    const content = [
      {
        type: "h2",
        id: "block-a",
        listStyleType: "disc",
        indent: 1,
        children: [{ text: "Title" }],
      },
    ];
    const raw = envelope(content);
    const result = expectUnsupported(parseEditorDocument(raw));

    expect(result.raw).toBe(raw);
    expect(
      result.issues.some((issue) =>
        issue.message.includes('unsupported attribute "listStyleType"'),
      ),
    ).toBe(true);
  });
});

describe("toggle bulleted list", () => {
  test("toggling a paragraph keeps text, marks, id, align, and line height, then removes the list", () => {
    const editor = createEditor([
      {
        type: "p",
        id: "block-a",
        align: "center",
        lineHeight: 2,
        children: [{ text: "Hello", bold: true }],
      },
    ]);
    editor.tf.select(caret([0, 0], 2));
    const before = editor.history.undos.length;

    expect(runEditorCommand(editor, toggleBulletedList, undefined)).toBe(true);

    expect(getBlockType(editor)).toBe(BULLETED_LIST_TYPE);
    expect(field(editor.children[0], "listStyleType")).toBe("disc");
    expect(field(editor.children[0], "indent")).toBe(1);
    expect(field(editor.children[0], "align")).toBe("center");
    expect(field(editor.children[0], "lineHeight")).toBe(2);
    expect(blockIds(editor)).toEqual(["block-a"]);
    expect(texts(editor)).toEqual(["Hello"]);
    expect(editor.children[0]?.children[0]).toEqual({ text: "Hello", bold: true });
    expect(editor.history.undos.length - before).toBe(1);

    editor.tf.undo();

    expect(field(editor.children[0], "listStyleType")).toBeUndefined();
    expect(field(editor.children[0], "indent")).toBeUndefined();
    expect(field(editor.children[0], "align")).toBe("center");
    expect(field(editor.children[0], "lineHeight")).toBe(2);

    editor.tf.redo();

    expect(field(editor.children[0], "listStyleType")).toBe("disc");
    expect(field(editor.children[0], "indent")).toBe(1);

    expect(runEditorCommand(editor, toggleBulletedList, undefined)).toBe(true);

    expect(getBlockType(editor)).toBe("p");
    expect(field(editor.children[0], "listStyleType")).toBeUndefined();
    expect(field(editor.children[0], "indent")).toBeUndefined();
    expect("indent" in (editor.children[0] ?? {})).toBe(false);
    expect(field(editor.children[0], "align")).toBe("center");
    expect(field(editor.children[0], "lineHeight")).toBe(2);
    expect(blockIds(editor)).toEqual(["block-a"]);
    expect(editor.children[0]?.children[0]).toEqual({ text: "Hello", bold: true });
  });

  test("a nested bullet toggles back to a paragraph with no orphan indent", () => {
    const editor = createEditor([bullet("Nested", "block-a", 3)]);
    editor.tf.select(caret([0, 0], 1));

    runEditorCommand(editor, toggleBulletedList, undefined);

    expect(field(editor.children[0], "type")).toBe("p");
    expect(field(editor.children[0], "listStyleType")).toBeUndefined();
    expect(field(editor.children[0], "indent")).toBeUndefined();
    expect(blockIds(editor)).toEqual(["block-a"]);
    expect(texts(editor)).toEqual(["Nested"]);
  });

  test("a multi-block selection turns every paragraph into a bullet and back", () => {
    const editor = createEditor([
      { type: "p", id: "block-a", align: "right", children: [{ text: "One" }] },
      { type: "p", id: "block-b", children: [{ text: "Two" }] },
    ]);
    editor.tf.select({
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [1, 0], offset: 2 },
    });

    runEditorCommand(editor, toggleBulletedList, undefined);

    expect(field(editor.children[0], "listStyleType")).toBe("disc");
    expect(field(editor.children[1], "listStyleType")).toBe("disc");
    expect(field(editor.children[0], "indent")).toBe(1);
    expect(field(editor.children[1], "indent")).toBe(1);
    expect(field(editor.children[0], "align")).toBe("right");
    expect(getBlockType(editor)).toBe(BULLETED_LIST_TYPE);

    runEditorCommand(editor, toggleBulletedList, undefined);

    expect(field(editor.children[0], "listStyleType")).toBeUndefined();
    expect(field(editor.children[1], "listStyleType")).toBeUndefined();
    expect(field(editor.children[0], "indent")).toBeUndefined();
    expect(field(editor.children[1], "indent")).toBeUndefined();
    expect(getBlockType(editor)).toBe("p");
  });

  test("a heading in the selection keeps its type", () => {
    const editor = createEditor([
      { type: "h2", id: "block-a", children: [{ text: "Title" }] },
      { type: "p", id: "block-b", children: [{ text: "Body" }] },
    ]);
    editor.tf.select({
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [1, 0], offset: 2 },
    });

    runEditorCommand(editor, toggleBulletedList, undefined);

    expect(field(editor.children[0], "type")).toBe("h2");
    expect(field(editor.children[0], "listStyleType")).toBeUndefined();
    expect(field(editor.children[0], "indent")).toBeUndefined();
    expect(field(editor.children[1], "listStyleType")).toBe("disc");
    expect(field(editor.children[1], "indent")).toBe(1);
    expect(getBlockType(editor)).toBe("mixed");
  });

  test("a caret in a heading does not change it", () => {
    const editor = createEditor([{ type: "h1", id: "block-a", children: [{ text: "Title" }] }]);
    editor.tf.select(caret([0, 0], 1));
    const before = JSON.stringify(editor.children);

    runEditorCommand(editor, toggleBulletedList, undefined);

    expect(JSON.stringify(editor.children)).toBe(before);
    expect(getBlockType(editor)).toBe("h1");
  });

  test("read-only refuses the command", () => {
    const editor = createEditor([{ type: "p", id: "block-a", children: [{ text: "Hello" }] }]);
    editor.tf.select(caret([0, 0], 1));
    const undos = editor.history.undos.length;

    expect(runEditorCommand(editor, toggleBulletedList, undefined, { readOnly: true })).toBe(false);
    expect(field(editor.children[0], "listStyleType")).toBeUndefined();
    expect(editor.history.undos.length).toBe(undos);
  });

  test("getBlockType reports a bullet, a paragraph, and a mixed selection", () => {
    const editor = createEditor([
      bullet("One", "block-a", 1),
      { type: "p", id: "block-b", children: [{ text: "Two" }] },
    ]);

    editor.tf.select(caret([0, 0], 1));
    expect(getBlockType(editor)).toBe(BULLETED_LIST_TYPE);

    editor.tf.select(caret([1, 0], 1));
    expect(getBlockType(editor)).toBe("p");

    editor.tf.select({
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [1, 0], offset: 1 },
    });
    expect(getBlockType(editor)).toBe("mixed");
  });
});

describe("bulleted list shortcut", () => {
  test("Mod+Shift+8 does not share its keys with another editor shortcut", () => {
    const editor = createEditor();
    const id = "list.toggleBulleted";
    const keys = JSON.stringify(editor.meta.shortcuts[id]?.keys);
    const collisions = Object.entries(editor.meta.shortcuts).filter(([shortcutId, shortcut]) => {
      if (shortcutId === id || !isRecord(shortcut) || !("keys" in shortcut)) {
        return false;
      }

      return JSON.stringify(shortcut.keys) === keys;
    });

    expect(editor.meta.shortcuts[id]?.keys).toEqual([[Key.Mod, Key.Shift, "8"]]);
    expect(collisions).toEqual([]);
  });

  test("Mod+Shift+8 at a caret and on a range toggles bullets", () => {
    const editor = createEditor([
      { type: "p", id: "block-a", children: [{ text: "One" }] },
      { type: "p", id: "block-b", children: [{ text: "Two" }] },
    ]);
    editor.tf.select(caret([0, 0], 1));

    pressBulletedList(editor);

    expect(field(editor.children[0], "listStyleType")).toBe("disc");
    expect(field(editor.children[1], "listStyleType")).toBeUndefined();

    editor.tf.select({
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [1, 0], offset: 1 },
    });
    pressBulletedList(editor);

    expect(field(editor.children[0], "listStyleType")).toBe("disc");
    expect(field(editor.children[1], "listStyleType")).toBe("disc");
  });

  test("Mod+Shift+8 does nothing in a read-only editor", () => {
    const editor = createEditor([{ type: "p", id: "block-a", children: [{ text: "Hello" }] }]);
    editor.tf.select(caret([0, 0], 1));
    editor.dom.readOnly = true;
    const undos = editor.history.undos.length;

    pressBulletedList(editor);

    expect(field(editor.children[0], "listStyleType")).toBeUndefined();
    expect(editor.history.undos.length).toBe(undos);
  });
});

describe("bulleted list keyboard", () => {
  test("Tab and Shift+Tab move one level and keep relative nesting", () => {
    const editor = createEditor([bullet("A", "block-a", 1), bullet("B", "block-b", 2)]);
    editor.tf.select({
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [1, 0], offset: 1 },
    });

    expect(pressTab(editor)).toBe(true);
    expect(field(editor.children[0], "indent")).toBe(2);
    expect(field(editor.children[1], "indent")).toBe(3);
    expect(field(editor.children[0], "listStyleType")).toBe("disc");
    expect(field(editor.children[1], "listStyleType")).toBe("disc");

    expect(pressTab(editor, true)).toBe(true);
    expect(field(editor.children[0], "indent")).toBe(1);
    expect(field(editor.children[1], "indent")).toBe(2);
  });

  test("Tab at depth 6 is handled and does not change the item", () => {
    const editor = createEditor([bullet("Deep", "block-a", 6)]);
    editor.tf.select(caret([0, 0], 1));
    const before = JSON.stringify(editor.children);
    const undos = editor.history.undos.length;

    expect(pressTab(editor)).toBe(true);

    expect(JSON.stringify(editor.children)).toBe(before);
    expect(field(editor.children[0], "indent")).toBe(6);
    expect(editor.history.undos.length).toBe(undos);
  });

  test("Shift+Tab at depth 1 returns a paragraph and keeps its id", () => {
    const editor = createEditor([bullet("Item", "block-a", 1)]);
    editor.tf.select(caret([0, 0], 1));

    expect(pressTab(editor, true)).toBe(true);

    expect(field(editor.children[0], "type")).toBe("p");
    expect(field(editor.children[0], "listStyleType")).toBeUndefined();
    expect(field(editor.children[0], "indent")).toBeUndefined();
    expect(blockIds(editor)).toEqual(["block-a"]);
    expect(texts(editor)).toEqual(["Item"]);
  });

  test("Tab outside a list is not handled", () => {
    const editor = createEditor([{ type: "p", id: "block-a", children: [{ text: "Plain" }] }]);
    editor.tf.select(caret([0, 0], 1));
    const before = JSON.stringify(editor.children);

    expect(pressTab(editor)).toBe(false);

    expect(JSON.stringify(editor.children)).toBe(before);
    expect(field(editor.children[0], "indent")).toBeUndefined();
  });

  test("Enter at the end of an item adds a bullet at the same depth with a new id", () => {
    const editor = createEditor([bullet("Hello", "block-a", 2)]);
    editor.tf.select(caret([0, 0], 5));

    editor.tf.insertBreak();

    expect(texts(editor)).toEqual(["Hello", ""]);
    expect(blockIds(editor)[0]).toBe("block-a");
    expect(blockIds(editor)[1]).not.toBe("block-a");
    expect(field(editor.children[0], "indent")).toBe(2);
    expect(field(editor.children[1], "indent")).toBe(2);
    expect(field(editor.children[0], "listStyleType")).toBe("disc");
    expect(field(editor.children[1], "listStyleType")).toBe("disc");
  });

  test("Enter in the middle splits one bullet into two", () => {
    const editor = createEditor([bullet("Hello world", "block-a", 1)]);
    editor.tf.select(caret([0, 0], 5));

    editor.tf.insertBreak();

    expect(texts(editor)).toEqual(["Hello", " world"]);
    expect(field(editor.children[0], "listStyleType")).toBe("disc");
    expect(field(editor.children[1], "listStyleType")).toBe("disc");
    expect(field(editor.children[0], "indent")).toBe(1);
    expect(field(editor.children[1], "indent")).toBe(1);
    expect(blockIds(editor)[0]).toBe("block-a");
    expect(blockIds(editor)[1]).not.toBe("block-a");
  });

  test("Enter on an empty nested item outdents one level", () => {
    const editor = createEditor([bullet("", "block-a", 3)]);
    editor.tf.select(caret([0, 0], 0));

    editor.tf.insertBreak();

    expect(editor.children).toHaveLength(1);
    expect(blockIds(editor)).toEqual(["block-a"]);
    expect(field(editor.children[0], "listStyleType")).toBe("disc");
    expect(field(editor.children[0], "indent")).toBe(2);
  });

  test("Enter on an empty depth-1 item becomes a paragraph and keeps its id", () => {
    const editor = createEditor([bullet("", "block-a", 1)]);
    editor.tf.select(caret([0, 0], 0));

    editor.tf.insertBreak();

    expect(editor.children).toHaveLength(1);
    expect(blockIds(editor)).toEqual(["block-a"]);
    expect(field(editor.children[0], "type")).toBe("p");
    expect(field(editor.children[0], "listStyleType")).toBeUndefined();
    expect(field(editor.children[0], "indent")).toBeUndefined();
  });

  test("Enter at the start of a bullet inserts an empty bullet above and keeps the original id", () => {
    const editor = createEditor([
      {
        type: "p",
        id: "block-a",
        indent: 2,
        listStyleType: "disc",
        align: "right",
        lineHeight: 2,
        children: [{ text: "Hello", bold: true }],
      },
    ]);
    editor.tf.select(caret([0, 0], 0));

    editor.tf.insertBreak();

    expect(texts(editor)).toEqual(["", "Hello"]);
    expect(blockIds(editor)[1]).toBe("block-a");
    expect(blockIds(editor)[0]).not.toBe("block-a");
    expect(field(editor.children[0], "listStyleType")).toBe("disc");
    expect(field(editor.children[0], "indent")).toBe(2);
    expect(field(editor.children[0], "align")).toBeUndefined();
    expect(field(editor.children[1], "listStyleType")).toBe("disc");
    expect(field(editor.children[1], "indent")).toBe(2);
    expect(field(editor.children[1], "align")).toBe("right");
    expect(field(editor.children[1], "lineHeight")).toBe(2);
    expect(editor.children[1]?.children[0]).toEqual({ text: "Hello", bold: true });
  });

  test("Backspace at the start of an item turns it into a paragraph and keeps text and id", () => {
    const editor = createEditor([
      bullet("Above", "block-a", 1),
      {
        type: "p",
        id: "block-b",
        indent: 2,
        listStyleType: "disc",
        children: [{ text: "Keep", bold: true }],
      },
    ]);
    editor.tf.select(caret([1, 0], 0));

    editor.tf.deleteBackward();

    expect(texts(editor)).toEqual(["Above", "Keep"]);
    expect(blockIds(editor)).toEqual(["block-a", "block-b"]);
    expect(field(editor.children[1], "type")).toBe("p");
    expect(field(editor.children[1], "listStyleType")).toBeUndefined();
    expect(field(editor.children[1], "indent")).toBeUndefined();
    expect(editor.children[1]?.children[0]).toEqual({ text: "Keep", bold: true });
  });

  test("typing dash space does not start a bullet", () => {
    const editor = createEditor([{ type: "p", id: "block-a", children: [{ text: "" }] }]);
    editor.tf.select(caret([0, 0], 0));

    editor.tf.insertText("- ");

    expect(texts(editor)).toEqual(["- "]);
    expect(field(editor.children[0], "listStyleType")).toBeUndefined();
    expect(field(editor.children[0], "indent")).toBeUndefined();
  });

  test("list and indent plugins target paragraphs and cap indent at 6", () => {
    const editor = createEditor();

    expect(editor.getPlugin({ key: KEYS.list }).inject.targetPlugins).toEqual([KEYS.p]);
    expect(editor.getPlugin({ key: KEYS.indent }).inject.targetPlugins).toEqual([KEYS.p]);
    expect(editor.getPlugin({ key: KEYS.indent }).options.indentMax).toBe(
      Math.max(...LIST_INDENTS),
    );
  });
});

describe("bulleted list paste", () => {
  test("a nested ul becomes three disc items", () => {
    const editor = pasteHtml("<ul><li>a</li><li>b<ul><li>c</li></ul></li></ul>");

    expect(texts(editor)).toEqual(["a", "b", "c"]);
    expect(editor.children.map((node) => field(node, "listStyleType"))).toEqual([
      "disc",
      "disc",
      "disc",
    ]);
    expect(editor.children.map((node) => field(node, "indent"))).toEqual([1, 1, 2]);
  });

  test("an ol becomes decimal items", () => {
    const editor = pasteHtml("<ol><li>a</li><li>b</li></ol>");

    expect(texts(editor)).toEqual(["a", "b"]);
    expect(editor.children.every((node) => field(node, "type") === "p")).toBe(true);
    expect(editor.children.map((node) => field(node, "listStyleType"))).toEqual([
      "decimal",
      "decimal",
    ]);
    expect(editor.children.map((node) => field(node, "indent"))).toEqual([1, 1]);
    expect(field(editor.children[0], "listStart")).toBeUndefined();
    expect(field(editor.children[1], "listStart")).toBe(2);
  });

  test("an li that contains a paragraph stays one bullet", () => {
    const editor = pasteHtml("<ul><li><p>Hello <strong>there</strong></p></li></ul>");

    expect(texts(editor)).toEqual(["Hello there"]);
    expect(editor.children).toHaveLength(1);
    expect(field(editor.children[0], "listStyleType")).toBe("disc");
    expect(field(editor.children[0], "indent")).toBe(1);
    expect(editor.children[0]?.children[1]).toEqual({ text: "there", bold: true });
  });

  test("a Google Docs list keeps aria-level as indent", () => {
    const editor = pasteHtml(
      '<ul><li aria-level="1"><p>One</p></li><li aria-level="2"><p>Two</p></li></ul>',
    );

    expect(texts(editor)).toEqual(["One", "Two"]);
    expect(editor.children.map((node) => field(node, "listStyleType"))).toEqual(["disc", "disc"]);
    expect(editor.children.map((node) => field(node, "indent"))).toEqual([1, 2]);
  });

  test("an editor fragment keeps its bullets", () => {
    const editor = createEditor();
    editor.tf.select(caret([0, 0], 0));
    editor.tf.insertFragment([
      { type: "p", id: "keep-a", listStyleType: "disc", indent: 1, children: [{ text: "A" }] },
      {
        type: "p",
        id: "keep-b",
        listStyleType: "disc",
        indent: 2,
        align: "center",
        children: [{ text: "B" }],
      },
    ]);

    const items = editor.children.filter((node) => field(node, "listStyleType") === "disc");

    expect(items.map((node) => field(node, "indent"))).toEqual([1, 2]);
    expect(texts(editor).filter((line) => line === "A" || line === "B")).toEqual(["A", "B"]);
    expect(field(items[1], "align")).toBe("center");
  });

  test("plain text dashes stay text", () => {
    const dom = new Window();
    const hadWindow = Object.hasOwn(globalThis, "window");
    const hadDocument = Object.hasOwn(globalThis, "document");
    const hadTransfer = Object.hasOwn(globalThis, "DataTransfer");
    const previousWindow = hadWindow ? Reflect.get(globalThis, "window") : undefined;
    const previousDocument = hadDocument ? Reflect.get(globalThis, "document") : undefined;
    const previousTransfer = hadTransfer ? Reflect.get(globalThis, "DataTransfer") : undefined;

    Reflect.set(globalThis, "window", dom);
    Reflect.set(globalThis, "document", dom.document);
    Reflect.set(globalThis, "DataTransfer", dom.DataTransfer);

    try {
      const editor = createPlateEditor({
        plugins: createEditorPlugins(),
        value: [{ type: "p", id: "block-a", children: [{ text: "" }] }],
      });
      editor.tf.select(caret([0, 0], 0));
      const data = new DataTransfer();
      data.setData("text/plain", "- a\n- b");
      editor.tf.insertData(data);

      expect(JSON.stringify(editor.children)).not.toContain("listStyleType");
      expect(texts(editor)).toEqual(["- a", "- b"]);
    } finally {
      restoreGlobal("window", hadWindow, previousWindow);
      restoreGlobal("document", hadDocument, previousDocument);
      restoreGlobal("DataTransfer", hadTransfer, previousTransfer);
      dom.close();
    }
  });
});

function renderList(value: EditorValue): string {
  const editor = createPlateEditor({
    plugins: createEditorPlugins(),
    value,
  });

  return renderToStaticMarkup(
    <Plate editor={editor}>
      <PlateContent />
    </Plate>,
  );
}

function firstBlockOpenTag(html: string): string {
  const match = html.match(/<div[^>]*\bdata-slate-node="element"[^>]*>/);
  return match?.[0] ?? "";
}

describe("bulleted list rendering", () => {
  test("each bullet renders as its own list with a cycling marker", () => {
    const html = renderList([
      bullet("One", "a", 1),
      bullet("Two", "b", 2),
      bullet("Three", "c", 3),
      bullet("Four", "d", 4),
    ]);

    expect(html.match(/<ul/g)?.length).toBe(4);
    expect(html.match(/<li/g)?.length).toBe(4);
    expect(html).toContain("list-style-type:disc");
    expect(html).toContain("list-style-type:circle");
    expect(html).toContain("list-style-type:square");
    expect(html).toContain("pl-6");
    expect(html).toContain("pl-12");
    expect(html).toContain("pl-18");
    expect(html).toContain("pl-24");
    expect(html.match(/data-list-item="disc"/g)?.length).toBe(4);
    expect(html).not.toContain("mb-1");
    expect(listMarker("disc", 1)).toBe("disc");
    expect(listMarker("disc", 2)).toBe("circle");
    expect(listMarker("disc", 3)).toBe("square");
    expect(listMarker("disc", 4)).toBe("disc");
    expect(listMarker("disc", 6)).toBe("square");
  });

  test("a list item's markup does not depend on the next block", () => {
    const followedByParagraph = renderList([
      bullet("One", "a", 1),
      { type: "p", id: "plain", children: [{ text: "Plain" }] },
    ]);
    const followedByBullet = renderList([bullet("One", "a", 1), bullet("Two", "b", 2)]);

    expect(firstBlockOpenTag(followedByParagraph)).toBe(firstBlockOpenTag(followedByBullet));
    expect(firstBlockOpenTag(followedByParagraph)).toContain('data-list-item="disc"');
    expect(renderList([{ type: "p", id: "plain", children: [{ text: "Plain" }] }])).not.toContain(
      "data-list-item",
    );
  });
});
