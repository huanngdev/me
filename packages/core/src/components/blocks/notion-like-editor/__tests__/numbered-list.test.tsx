import { describe, expect, test } from "bun:test";
import { KEYS, type SlateEditor } from "platejs";
import { Key, Plate, PlateContent, createPlateEditor } from "platejs/react";
import { renderToStaticMarkup } from "react-dom/server";

import { listMarker } from "../components/elements/block-list";
import {
  NUMBERED_LIST_TYPE,
  getBlockType,
  runEditorCommand,
  setListRestart,
  toggleBulletedList,
  toggleNumberedList,
} from "../lib/commands/editor-commands";
import { parseEditorDocument } from "../lib/document/editor-document-validate";
import {
  LIST_INDENTS,
  LIST_NUMBER_RANGE,
  isAllowedElementAttrValue,
  isWithinAttrRange,
  unsatisfiedDependentAttrs,
} from "../lib/document/editor-document-schema";
import { createEditorPlugins } from "../lib/plugins/editor-plugins";
import { EditorSurface } from "../components/editor/editor-surface";
import type { EditorValue } from "../lib/document/editor-value";
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

function numbered(text: string, id: string, indent = 1): EditorValue[number] {
  return {
    type: "p",
    id,
    indent,
    listStyleType: "decimal",
    children: [{ text }],
  };
}

function pressNumberedList(editor: SlateEditor): void {
  const shortcut = editor.meta.shortcuts["list.toggleNumbered"];
  if (!shortcut?.handler) {
    throw new Error("Missing numbered list shortcut.");
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

function pasteHtml(html: string): SlateEditor {
  const editor = createEditor();
  editor.tf.select(caret([0, 0], 0));
  const data = new DataTransfer();
  data.setData("text/html", html);
  editor.tf.insertData(data);
  return editor;
}

function renderList(value: EditorValue): string {
  const editor = createPlateEditor({
    plugins: createEditorPlugins(),
    value,
  });
  // Setting the initial value does not run list normalization. Plate writes listStart
  // when normalize runs, which an edit does and the initial value does not.
  editor.tf.normalize({ force: true });

  return renderToStaticMarkup(
    <Plate editor={editor}>
      <PlateContent />
    </Plate>,
  );
}

function renderedStarts(html: string): Array<number | undefined> {
  return (html.match(/<ol\b[^>]*>/g) ?? []).map((tag) => {
    const match = tag.match(/\bstart="(\d+)"/);
    return match?.[1] === undefined ? undefined : Number(match[1]);
  });
}

function renderedMarkers(html: string): string[] {
  return [...html.matchAll(/list-style-type:\s*([a-z-]+)/g)].map((match) => match[1] ?? "");
}

describe("integer attribute range", () => {
  test("the range accepts only integers inside the inclusive bounds", () => {
    expect(isWithinAttrRange(1, { min: 1, max: 9999 })).toBe(true);
    expect(isWithinAttrRange(9999, { min: 1, max: 9999 })).toBe(true);
    expect(isWithinAttrRange(0, LIST_NUMBER_RANGE)).toBe(false);
    expect(isWithinAttrRange(-1, LIST_NUMBER_RANGE)).toBe(false);
    expect(isWithinAttrRange(1.5, LIST_NUMBER_RANGE)).toBe(false);
    expect(isWithinAttrRange("3", LIST_NUMBER_RANGE)).toBe(false);
    expect(isWithinAttrRange(10000, LIST_NUMBER_RANGE)).toBe(false);
    expect(isAllowedElementAttrValue(KEYS.p, "listStart", 1)).toBe(true);
    expect(isAllowedElementAttrValue(KEYS.p, "listStart", 9999)).toBe(true);
    expect(isAllowedElementAttrValue(KEYS.p, "listStart", 0)).toBe(false);
  });
});

describe("numbered list allowlist", () => {
  test("decimal round-trips at every indent", () => {
    for (const indent of LIST_INDENTS) {
      const content = [
        {
          type: "p",
          id: "block-a",
          indent,
          listStyleType: "decimal",
          align: "center",
          children: [{ text: "Item" }],
        },
      ];
      const result = expectOk(parseEditorDocument(envelope(content)));

      expect(result.document.content).toBe(content);
      expect(field(result.document.content[0], "listStyleType")).toBe("decimal");
      expect(field(result.document.content[0], "indent")).toBe(indent);
    }
  });

  test("listStart 1 and 9999 round-trip", () => {
    for (const listStart of [1, 9999]) {
      const content = [
        {
          type: "p",
          id: "block-a",
          indent: 1,
          listStyleType: "decimal",
          listStart,
          children: [{ text: "Item" }],
        },
      ];
      const result = expectOk(parseEditorDocument(envelope(content)));

      expect(result.document.content).toBe(content);
      expect(field(result.document.content[0], "listStart")).toBe(listStart);
    }
  });

  test.each([
    [0, "0"],
    [-1, "-1"],
    [1.5, "1.5"],
    ["3", "3"],
    [10000, "10000"],
  ] as const)("listStart %s is unsupported and the raw document is kept", (listStart, label) => {
    const content = [
      {
        type: "p",
        id: "block-a",
        indent: 1,
        listStyleType: "decimal",
        listStart,
        children: [{ text: "Item" }],
      },
    ];
    const raw = envelope(content);
    const result = expectUnsupported(parseEditorDocument(raw));

    expect(result.raw).toBe(raw);
    expect(
      result.issues.some((issue) => issue.message.includes(`unsupported listStart "${label}"`)),
    ).toBe(true);
  });

  test("listStart without listStyleType is unsupported and the raw document is kept", () => {
    const content = [{ type: "p", id: "block-a", listStart: 2, children: [{ text: "Item" }] }];
    const raw = envelope(content);
    const result = expectUnsupported(parseEditorDocument(raw));

    expect(result.raw).toBe(raw);
    expect(result.issues[0]?.message).toContain("unsupported listStart without listStyleType");
  });

  test("a disc item carrying listStart is unsupported", () => {
    expect(unsatisfiedDependentAttrs("p", { listStyleType: "disc", listStart: 2 })).toEqual([
      "listStart",
    ]);

    const content = [
      {
        type: "p",
        id: "block-a",
        indent: 1,
        listStyleType: "disc",
        listStart: 2,
        children: [{ text: "Item" }],
      },
    ];
    const raw = envelope(content);
    const result = expectUnsupported(parseEditorDocument(raw));

    expect(result.raw).toBe(raw);
    expect(result.issues.some((issue) => issue.message.includes("unsupported listStart"))).toBe(
      true,
    );
    expect(result.issues.some((issue) => issue.message.includes("without listStyleType"))).toBe(
      false,
    );
  });

  test("normalize drops listRestart on a disc item and indent without a list", () => {
    const editor = createEditor([
      {
        type: "p",
        id: "bullet",
        indent: 1,
        listStyleType: "disc",
        children: [{ text: "Bullet" }],
      },
      { type: "p", id: "plain", children: [{ text: "Plain" }] },
    ]);

    editor.tf.withoutNormalizing(() => {
      editor.tf.setNodes({ listRestart: 3 }, { at: [0] });
      editor.tf.setNodes({ indent: 2 }, { at: [1] });
      // Slate normalizes when withoutNormalizing returns, so the illegal attrs only exist inside.
      expect(field(editor.children[0], "listRestart")).toBe(3);
      expect(field(editor.children[1], "indent")).toBe(2);
    });

    editor.tf.normalize({ force: true });

    expect(field(editor.children[0], "listRestart")).toBeUndefined();
    expect(field(editor.children[0], "listStyleType")).toBe("disc");
    expect(field(editor.children[1], "indent")).toBeUndefined();
  });
});

describe("toggle numbered list", () => {
  test("toggling a paragraph keeps text, marks, id, align, and line height, then removes numbering attrs", () => {
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

    expect(runEditorCommand(editor, toggleNumberedList, undefined)).toBe(true);

    expect(getBlockType(editor)).toBe(NUMBERED_LIST_TYPE);
    expect(field(editor.children[0], "listStyleType")).toBe("decimal");
    expect(field(editor.children[0], "indent")).toBe(1);
    expect(field(editor.children[0], "align")).toBe("center");
    expect(field(editor.children[0], "lineHeight")).toBe(2);
    expect(blockIds(editor)).toEqual(["block-a"]);
    expect(editor.children[0]?.children[0]).toEqual({ text: "Hello", bold: true });
    expect(editor.history.undos.length - before).toBe(1);

    editor.tf.undo();

    expect(field(editor.children[0], "listStyleType")).toBeUndefined();
    expect(field(editor.children[0], "indent")).toBeUndefined();

    editor.tf.redo();

    expect(field(editor.children[0], "listStyleType")).toBe("decimal");

    runEditorCommand(editor, toggleNumberedList, undefined);

    expect(field(editor.children[0], "listStyleType")).toBeUndefined();
    expect(field(editor.children[0], "indent")).toBeUndefined();
    expect(field(editor.children[0], "listStart")).toBeUndefined();
    expect(field(editor.children[0], "listRestart")).toBeUndefined();
    expect(field(editor.children[0], "listRestartPolite")).toBeUndefined();
    expect(field(editor.children[0], "align")).toBe("center");
    expect(field(editor.children[0], "lineHeight")).toBe(2);
  });

  test("switching bullet and numbered keeps indent, text, and id", () => {
    const editor = createEditor([
      {
        type: "p",
        id: "block-a",
        indent: 2,
        listStyleType: "disc",
        align: "right",
        lineHeight: 1.5,
        children: [{ text: "Item", italic: true }],
      },
    ]);
    editor.tf.select(caret([0, 0], 1));

    runEditorCommand(editor, toggleNumberedList, undefined);

    expect(field(editor.children[0], "listStyleType")).toBe("decimal");
    expect(field(editor.children[0], "indent")).toBe(2);
    expect(field(editor.children[0], "align")).toBe("right");
    expect(field(editor.children[0], "lineHeight")).toBe(1.5);
    expect(blockIds(editor)).toEqual(["block-a"]);
    expect(editor.children[0]?.children[0]).toEqual({ text: "Item", italic: true });

    runEditorCommand(editor, toggleBulletedList, undefined);

    expect(field(editor.children[0], "listStyleType")).toBe("disc");
    expect(field(editor.children[0], "indent")).toBe(2);
    expect(field(editor.children[0], "listStart")).toBeUndefined();
    expect(field(editor.children[0], "listRestart")).toBeUndefined();
  });

  test("a multi-block selection numbers every paragraph and skips a heading", () => {
    const editor = createEditor([
      { type: "p", id: "block-a", children: [{ text: "One" }] },
      { type: "h2", id: "block-b", children: [{ text: "Title" }] },
      { type: "p", id: "block-c", children: [{ text: "Two" }] },
    ]);
    editor.tf.select({
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [2, 0], offset: 2 },
    });

    runEditorCommand(editor, toggleNumberedList, undefined);

    expect(field(editor.children[0], "listStyleType")).toBe("decimal");
    expect(field(editor.children[1], "type")).toBe("h2");
    expect(field(editor.children[1], "listStyleType")).toBeUndefined();
    expect(field(editor.children[2], "listStyleType")).toBe("decimal");
    expect(getBlockType(editor)).toBe("mixed");
  });

  test("read-only refuses the command", () => {
    const editor = createEditor([{ type: "p", id: "block-a", children: [{ text: "Hello" }] }]);
    editor.tf.select(caret([0, 0], 1));
    const undos = editor.history.undos.length;

    expect(runEditorCommand(editor, toggleNumberedList, undefined, { readOnly: true })).toBe(false);
    expect(field(editor.children[0], "listStyleType")).toBeUndefined();
    expect(editor.history.undos.length).toBe(undos);
  });

  test("getBlockType reports a numbered list or mixed", () => {
    const editor = createEditor([
      numbered("One", "block-a"),
      { type: "p", id: "block-b", children: [{ text: "Two" }] },
    ]);

    editor.tf.select(caret([0, 0], 1));
    expect(getBlockType(editor)).toBe(NUMBERED_LIST_TYPE);

    editor.tf.select({
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [1, 0], offset: 1 },
    });
    expect(getBlockType(editor)).toBe("mixed");
  });
});

describe("numbered list shortcut", () => {
  test("Mod+Shift+7 does not share its keys with another editor shortcut", () => {
    const editor = createEditor();
    const id = "list.toggleNumbered";
    const keys = JSON.stringify(editor.meta.shortcuts[id]?.keys);
    const collisions = Object.entries(editor.meta.shortcuts).filter(([shortcutId, shortcut]) => {
      if (shortcutId === id || !isRecord(shortcut) || !("keys" in shortcut)) {
        return false;
      }

      return JSON.stringify(shortcut.keys) === keys;
    });

    expect(editor.meta.shortcuts[id]?.keys).toEqual([[Key.Mod, Key.Shift, "7"]]);
    expect(collisions).toEqual([]);
  });

  test("Mod+Shift+7 at a caret and on a range toggles numbering", () => {
    const editor = createEditor([
      { type: "p", id: "block-a", children: [{ text: "One" }] },
      { type: "p", id: "block-b", children: [{ text: "Two" }] },
    ]);
    editor.tf.select(caret([0, 0], 1));

    pressNumberedList(editor);

    expect(field(editor.children[0], "listStyleType")).toBe("decimal");
    expect(field(editor.children[1], "listStyleType")).toBeUndefined();

    editor.tf.select({
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [1, 0], offset: 1 },
    });
    pressNumberedList(editor);

    expect(field(editor.children[0], "listStyleType")).toBe("decimal");
    expect(field(editor.children[1], "listStyleType")).toBe("decimal");
  });

  test("Mod+Shift+7 does nothing in a read-only editor", () => {
    const editor = createEditor([{ type: "p", id: "block-a", children: [{ text: "Hello" }] }]);
    editor.tf.select(caret([0, 0], 1));
    editor.dom.readOnly = true;
    const undos = editor.history.undos.length;

    pressNumberedList(editor);

    expect(field(editor.children[0], "listStyleType")).toBeUndefined();
    expect(editor.history.undos.length).toBe(undos);
  });
});

describe("numbered list behavior", () => {
  test("consecutive items number 1, 2, 3", () => {
    const editor = createEditor([numbered("A", "a"), numbered("B", "b"), numbered("C", "c")]);
    editor.tf.normalize({ force: true });
    const html = renderList(editor.children);

    expect(editor.children.map((node) => field(node, "listStart"))).toEqual([undefined, 2, 3]);
    expect(renderedStarts(html)).toEqual([undefined, 2, 3]);
  });

  test("deleting the middle item renumbers to 1, 2", () => {
    const editor = createEditor([numbered("A", "a"), numbered("B", "b"), numbered("C", "c")]);

    editor.tf.removeNodes({ at: [1] });

    expect(texts(editor)).toEqual(["A", "C"]);
    expect(renderedStarts(renderList(editor.children))).toEqual([undefined, 2]);
  });

  test("moving an item renumbers", () => {
    const editor = createEditor([numbered("A", "a"), numbered("B", "b"), numbered("C", "c")]);

    editor.tf.moveNodes({ at: [2], to: [0] });

    expect(texts(editor)).toEqual(["C", "A", "B"]);
    expect(renderedStarts(renderList(editor.children))).toEqual([undefined, 2, 3]);
  });

  test("a paragraph between numbered runs restarts the second run at 1", () => {
    const editor = createEditor([
      numbered("A", "a"),
      numbered("B", "b"),
      { type: "p", id: "gap", children: [{ text: "Gap" }] },
      numbered("C", "c"),
    ]);

    expect(field(editor.children[3], "listStart")).toBeUndefined();
    expect(renderedStarts(renderList(editor.children))).toEqual([undefined, 2, undefined]);
  });

  test("nested numbers are independent and outdenting keeps block order", () => {
    const editor = createEditor([
      numbered("A", "a", 1),
      numbered("B", "b", 2),
      numbered("C", "c", 2),
      numbered("D", "d", 1),
    ]);
    const html = renderList(editor.children);

    expect(renderedStarts(html)).toEqual([undefined, undefined, 2, 2]);
    expect(renderedMarkers(html)).toEqual(["decimal", "lower-alpha", "lower-alpha", "decimal"]);

    editor.tf.select(caret([2, 0], 0));
    expect(pressTab(editor, true)).toBe(true);

    expect(blockIds(editor)).toEqual(["a", "b", "c", "d"]);
    expect(editor.children.map((node) => field(node, "indent"))).toEqual([1, 2, 1, 1]);
    expect(renderedStarts(renderList(editor.children))).toEqual([undefined, undefined, 2, 3]);
  });

  test("a bullet at the same depth breaks the numbered sequence", () => {
    const editor = createEditor([
      numbered("A", "a"),
      {
        type: "p",
        id: "bullet",
        indent: 1,
        listStyleType: "disc",
        children: [{ text: "Bullet" }],
      },
      numbered("C", "c"),
    ]);

    expect(field(editor.children[2], "listStart")).toBeUndefined();
    expect(renderedStarts(renderList(editor.children))).toEqual([undefined, undefined]);
  });

  test("Enter, Shift+Tab, and Backspace on a decimal item match bullets", () => {
    const entered = createEditor([numbered("Hello", "block-a", 2)]);
    entered.tf.select(caret([0, 0], 5));
    entered.tf.insertBreak();

    expect(texts(entered)).toEqual(["Hello", ""]);
    expect(field(entered.children[1], "listStyleType")).toBe("decimal");
    expect(field(entered.children[1], "indent")).toBe(2);
    expect(field(entered.children[1], "listStart")).toBe(2);

    const outdented = createEditor([numbered("Item", "block-a", 1)]);
    outdented.tf.select(caret([0, 0], 1));
    expect(pressTab(outdented, true)).toBe(true);
    expect(field(outdented.children[0], "listStyleType")).toBeUndefined();
    expect(field(outdented.children[0], "indent")).toBeUndefined();
    expect(field(outdented.children[0], "listStart")).toBeUndefined();

    const cleared = createEditor([
      numbered("Above", "block-a", 1),
      {
        type: "p",
        id: "block-b",
        indent: 1,
        listStyleType: "decimal",
        listRestart: 4,
        children: [{ text: "Keep", bold: true }],
      },
    ]);
    cleared.tf.select(caret([1, 0], 0));
    cleared.tf.deleteBackward();

    expect(field(cleared.children[1], "listStyleType")).toBeUndefined();
    expect(field(cleared.children[1], "indent")).toBeUndefined();
    expect(field(cleared.children[1], "listRestart")).toBeUndefined();
    expect(field(cleared.children[1], "listStart")).toBeUndefined();
    expect(blockIds(cleared)).toEqual(["block-a", "block-b"]);
  });

  test("Enter on an empty decimal item outdents, then exits", () => {
    const editor = createEditor([numbered("Item", "block-a", 2)]);
    editor.tf.select(caret([0, 0], 4));
    editor.tf.insertBreak();
    editor.tf.insertBreak();

    expect(field(editor.children[1], "indent")).toBe(1);
    expect(field(editor.children[1], "listStyleType")).toBe("decimal");

    editor.tf.insertBreak();

    expect(field(editor.children[1], "listStyleType")).toBeUndefined();
    expect(field(editor.children[1], "indent")).toBeUndefined();
    expect(field(editor.children[1], "listStart")).toBeUndefined();
    expect(field(editor.children[1], "listRestart")).toBeUndefined();
  });

  test("Tab nests a decimal item", () => {
    const editor = createEditor([numbered("Item", "block-a", 1)]);
    editor.tf.select(caret([0, 0], 1));

    expect(pressTab(editor)).toBe(true);
    expect(field(editor.children[0], "indent")).toBe(2);
    expect(field(editor.children[0], "listStyleType")).toBe("decimal");
  });

  test("break above a restarted item keeps the restart on the new first item", () => {
    const editor = createEditor([
      {
        type: "p",
        id: "block-a",
        indent: 1,
        listStyleType: "decimal",
        listRestart: 3,
        children: [{ text: "Keep" }],
      },
    ]);
    editor.tf.select(caret([0, 0], 0));

    editor.tf.insertBreak();

    expect(texts(editor)).toEqual(["", "Keep"]);
    expect(blockIds(editor)[1]).toBe("block-a");
    expect(field(editor.children[0], "listStyleType")).toBe("decimal");
    expect(field(editor.children[0], "listRestart")).toBe(3);
    expect(field(editor.children[0], "listStart")).toBe(3);
    expect(field(editor.children[1], "listRestart")).toBeUndefined();
    expect(field(editor.children[1], "listStart")).toBe(4);
    expect(renderedStarts(renderList(editor.children))).toEqual([3, 4]);
  });

  test("typing 1. space does not start a numbered list", () => {
    const editor = createEditor([{ type: "p", id: "block-a", children: [{ text: "" }] }]);
    editor.tf.select(caret([0, 0], 0));

    editor.tf.insertText("1. ");

    expect(texts(editor)).toEqual(["1. "]);
    expect(field(editor.children[0], "listStyleType")).toBeUndefined();
  });
});

describe("set list restart", () => {
  test("restart at 1 mid-run, start at 3, and continue are one undo each", () => {
    const editor = createEditor([numbered("A", "a"), numbered("B", "b"), numbered("C", "c")]);
    editor.tf.select(caret([1, 0], 0));
    const before = editor.history.undos.length;

    expect(runEditorCommand(editor, setListRestart, 1)).toBe(true);

    expect(field(editor.children[1], "listRestart")).toBe(1);
    expect(field(editor.children[1], "listStart")).toBeUndefined();
    expect(field(editor.children[2], "listStart")).toBe(2);
    expect(renderedStarts(renderList(editor.children))).toEqual([undefined, undefined, 2]);
    expect(editor.history.undos.length - before).toBe(1);

    editor.tf.undo();
    expect(field(editor.children[1], "listRestart")).toBeUndefined();
    expect(field(editor.children[2], "listStart")).toBe(3);

    editor.tf.select(caret([0, 0], 0));
    runEditorCommand(editor, setListRestart, 3);

    expect(field(editor.children[0], "listRestart")).toBe(3);
    expect(field(editor.children[0], "listStart")).toBe(3);
    expect(field(editor.children[1], "listStart")).toBe(4);
    expect(renderedStarts(renderList(editor.children))).toEqual([3, 4, 5]);

    runEditorCommand(editor, setListRestart, null);

    expect(field(editor.children[0], "listRestart")).toBeUndefined();
    expect(field(editor.children[0], "listStart")).toBeUndefined();
    expect(field(editor.children[1], "listStart")).toBe(2);
  });

  test("a bullet refuses restart", () => {
    const editor = createEditor([
      {
        type: "p",
        id: "block-a",
        indent: 1,
        listStyleType: "disc",
        children: [{ text: "Bullet" }],
      },
    ]);
    editor.tf.select(caret([0, 0], 1));
    const undos = editor.history.undos.length;

    expect(setListRestart.isEnabled?.(editor)).toBe(false);
    expect(runEditorCommand(editor, setListRestart, 3)).toBe(false);
    expect(field(editor.children[0], "listRestart")).toBeUndefined();
    expect(field(editor.children[0], "listStyleType")).toBe("disc");
    expect(editor.history.undos.length).toBe(undos);
  });

  test("read-only refuses restart", () => {
    const editor = createEditor([numbered("A", "a")]);
    editor.tf.select(caret([0, 0], 0));

    expect(runEditorCommand(editor, setListRestart, 3, { readOnly: true })).toBe(false);
    expect(field(editor.children[0], "listRestart")).toBeUndefined();
  });
});

describe("numbered list paste", () => {
  test("a nested ol keeps decimal indents and numbers", () => {
    const editor = pasteHtml("<ol><li>a</li><li>b<ol><li>c</li></ol></li></ol>");

    expect(texts(editor)).toEqual(["a", "b", "c"]);
    expect(editor.children.map((node) => field(node, "listStyleType"))).toEqual([
      "decimal",
      "decimal",
      "decimal",
    ]);
    expect(editor.children.map((node) => field(node, "indent"))).toEqual([1, 1, 2]);
    expect(renderedStarts(renderList(editor.children))).toEqual([undefined, 2, undefined]);
  });

  test("ol start=3 stores listRestart and renders 3, 4", () => {
    const editor = pasteHtml('<ol start="3"><li>x</li><li>y</li></ol>');

    expect(texts(editor)).toEqual(["x", "y"]);
    expect(field(editor.children[0], "listStyleType")).toBe("decimal");
    expect(field(editor.children[0], "listRestart")).toBe(3);
    expect(field(editor.children[0], "listStart")).toBe(3);
    expect(field(editor.children[1], "listRestart")).toBeUndefined();
    expect(field(editor.children[1], "listStart")).toBe(4);
    expect(renderedStarts(renderList(editor.children))).toEqual([3, 4]);
  });

  test("a ul inside an ol keeps each style", () => {
    const editor = pasteHtml("<ol><li>a<ul><li>b</li></ul></li><li>c</li></ol>");

    expect(texts(editor)).toEqual(["a", "b", "c"]);
    expect(editor.children.map((node) => field(node, "listStyleType"))).toEqual([
      "decimal",
      "disc",
      "decimal",
    ]);
    expect(editor.children.map((node) => field(node, "indent"))).toEqual([1, 2, 1]);
  });

  test("Google Docs numbered HTML stores decimal and aria-level", () => {
    const editor = pasteHtml(
      '<b style="font-weight:normal" id="docs-internal-guid-abc"><ol style="margin-top:0;margin-bottom:0"><li dir="ltr" aria-level="1" style="list-style-type:decimal"><p role="presentation">One</p></li><li dir="ltr" aria-level="2" style="list-style-type:lower-alpha"><p role="presentation">Two</p></li></ol></b>',
    );

    expect(texts(editor)).toEqual(["One", "Two"]);
    expect(editor.children.map((node) => field(node, "listStyleType"))).toEqual([
      "decimal",
      "decimal",
    ]);
    expect(editor.children.map((node) => field(node, "indent"))).toEqual([1, 2]);
    expect(JSON.stringify(editor.children)).not.toContain("lower-alpha");
  });

  test("an editor fragment keeps numbering attrs", () => {
    const editor = createEditor();
    editor.tf.select(caret([0, 0], 0));
    editor.tf.insertFragment([
      {
        type: "p",
        id: "keep-a",
        listStyleType: "decimal",
        indent: 1,
        listRestart: 3,
        children: [{ text: "A" }],
      },
      {
        type: "p",
        id: "keep-b",
        listStyleType: "decimal",
        indent: 1,
        listStart: 4,
        children: [{ text: "B" }],
      },
    ]);

    const items = editor.children.filter((node) => field(node, "listStyleType") === "decimal");

    expect(texts(editor).filter((line) => line === "A" || line === "B")).toEqual(["A", "B"]);
    expect(field(items[0], "listRestart")).toBe(3);
    expect(field(items[0], "listStart")).toBe(3);
    expect(field(items[1], "listStart")).toBe(4);
  });
});

describe("numbered list rendering", () => {
  test("each item is an ol with a cycling marker and a stable gutter", () => {
    const html = renderList([
      numbered("One", "a", 1),
      numbered("Two", "b", 2),
      numbered("Three", "c", 3),
      numbered("Four", "d", 4),
    ]);

    expect(html.match(/<ol/g)?.length).toBe(4);
    expect(html.match(/<li/g)?.length).toBe(4);
    expect(renderedMarkers(html)).toEqual(["decimal", "lower-alpha", "lower-roman", "decimal"]);
    expect(html).toContain("pl-10");
    expect(html).toContain("pl-16");
    expect(html).toContain("pl-22");
    expect(html).toContain("pl-28");
    expect(listMarker("decimal", 1)).toBe("decimal");
    expect(listMarker("decimal", 2)).toBe("lower-alpha");
    expect(listMarker("decimal", 3)).toBe("lower-roman");
    expect(listMarker("decimal", 4)).toBe("decimal");
    expect(listMarker("decimal", 6)).toBe("lower-roman");
  });

  test("the sibling gap rule matches a bullet and a numbered item", () => {
    const editor = createPlateEditor({
      plugins: createEditorPlugins(),
      value: [
        {
          type: "p",
          id: "bullet",
          indent: 1,
          listStyleType: "disc",
          children: [{ text: "Bullet" }],
        },
        numbered("Number", "number", 1),
      ],
    });
    const html = renderToStaticMarkup(
      <EditorSurface editor={editor} readOnly placeholder="" className="editor" />,
    );

    expect(html).toContain('data-list-item="disc"');
    expect(html).toContain('data-list-item="decimal"');
    expect(html).toContain("data-list-item]:has(+[data-list-item])]:mb-1");
  });
});
