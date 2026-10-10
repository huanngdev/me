import { describe, expect, test } from "bun:test";
import {
  BaseColumnPlugin,
  insertColumnGroup,
  setColumns,
  toggleColumnGroup,
} from "@platejs/layout";
import { createSlateEditor, KEYS, type SlateEditor, type TElement } from "platejs";
import { createPlateEditor } from "platejs/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import {
  COLUMN_GROUP_LAYOUT_CLASS,
  COLUMN_REMOVE_CONFIRM,
} from "../components/elements/column-element";
import {
  COLUMN_CHILD_LIFTED,
  COLUMN_LIFT_CALLOUT,
  COLUMN_LIFT_QUOTE,
  COLUMN_LIFT_TABLE,
  COLUMN_LIFT_TOGGLE,
  COLUMN_NESTED,
  COLUMN_UNWRAPPED,
  COLUMN_WIDTH_EQUAL,
  insertColumns2,
  insertColumns3,
  onColumnKeyDown,
  removeColumnCommand,
  setColumnCountCommand,
  setColumnWidthsCommand,
  unwrapColumnsCommand,
} from "../lib/commands/editor-columns";
import { runEditorCommand } from "../lib/commands/editor-commands";
import { createEditorDocument, serializeEditorDocument } from "../lib/document/editor-document";
import { allowedChildTypes } from "../lib/document/editor-document-schema";
import { parseEditorDocument, type ParseResult } from "../lib/document/editor-document-validate";
import { EditorSurface } from "../components/editor/editor-surface";
import { createEditorPlugins } from "../lib/plugins/editor-plugins";
import { pasteRepairsOf } from "../lib/paste/editor-paste";
import type { EditorValue } from "../lib/document/editor-value";
import { caret, createEditor, expectOk, field, isRecord } from "./test-utils";

function paragraph(text: string, id = "p"): TElement {
  return { type: "p", id, children: [{ text }] };
}

function column(id: string, width: string | undefined, children: TElement[]): TElement {
  const node: TElement = { type: "column", id, children };
  if (width !== undefined) {
    node.width = width;
  }
  return node;
}

function group(id: string, columns: TElement[], extra: Record<string, unknown> = {}): TElement {
  const node: TElement = { type: "column_group", id, children: columns };
  for (const [key, value] of Object.entries(extra)) {
    node[key] = value;
  }
  return node;
}

function documentOf(content: TElement[]): ParseResult {
  return parseEditorDocument(createEditorDocument("doc-columns", content));
}

function messages(result: ParseResult): string[] {
  if (result.status === "ok") {
    return result.repairs.map((repair) => repair.message);
  }
  if (result.status === "unsupported" || result.status === "invalid") {
    return result.issues.map((issue) => issue.message);
  }
  return [];
}

function paragraphs(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((child) => paragraphs(child));
  }

  if (!isRecord(value)) {
    return [];
  }

  if (
    value.type === "p" ||
    value.type === "h1" ||
    value.type === "h2" ||
    value.type === "h3" ||
    value.type === "code_line"
  ) {
    const text = Array.isArray(value.children)
      ? value.children
          .map((child) => (isRecord(child) && typeof child.text === "string" ? child.text : ""))
          .join("")
      : "";
    return [text];
  }

  if (!Array.isArray(value.children)) {
    return [];
  }

  return value.children.flatMap((child) => paragraphs(child));
}

function widthsOf(node: unknown): string[] {
  if (!isRecord(node) || !Array.isArray(node.children)) {
    return [];
  }

  return node.children.map((child) => {
    const width = field(child, "width");
    return typeof width === "string" ? width : "";
  });
}

function keyEvent(
  key: "ArrowLeft" | "ArrowRight",
  outside = false,
): {
  event: {
    key: string;
    metaKey: boolean;
    ctrlKey: boolean;
    altKey: boolean;
    shiftKey: boolean;
    preventDefault: () => void;
  };
  prevented: () => boolean;
} {
  let prevented = false;
  return {
    event: {
      key,
      metaKey: !outside,
      ctrlKey: false,
      altKey: true,
      shiftKey: false,
      preventDefault: () => {
        prevented = true;
      },
    },
    prevented: () => prevented,
  };
}

function nativeEditor(value: TElement[]): SlateEditor {
  return createSlateEditor({ plugins: [BaseColumnPlugin], value });
}

function isReactContainer(value: object): value is Parameters<typeof createRoot>[0] {
  return "nodeType" in value && value.nodeType === 1;
}

function stubAnimationFrame(): () => void {
  const previousFrame = Reflect.get(globalThis, "requestAnimationFrame");
  const previousCancel = Reflect.get(globalThis, "cancelAnimationFrame");
  const previousWidth = Reflect.get(globalThis, "innerWidth");
  const previousHeight = Reflect.get(globalThis, "innerHeight");
  Reflect.set(globalThis, "requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  Reflect.set(globalThis, "cancelAnimationFrame", () => {});
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
  Reflect.set(globalThis, "innerWidth", 1280);
  Reflect.set(globalThis, "innerHeight", 800);
  return () => {
    Reflect.set(globalThis, "requestAnimationFrame", previousFrame);
    Reflect.set(globalThis, "cancelAnimationFrame", previousCancel);
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT");
    if (previousWidth === undefined) {
      Reflect.deleteProperty(globalThis, "innerWidth");
    } else {
      Reflect.set(globalThis, "innerWidth", previousWidth);
    }
    if (previousHeight === undefined) {
      Reflect.deleteProperty(globalThis, "innerHeight");
    } else {
      Reflect.set(globalThis, "innerHeight", previousHeight);
    }
  };
}

async function mountColumns(value: EditorValue, readOnly = false) {
  const restoreFrame = stubAnimationFrame();
  const before = new Set(Array.from(document.body.childNodes));
  const host = document.createElement("div");
  document.body.appendChild(host);
  const editor = createPlateEditor({ plugins: createEditorPlugins(), value });
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
    editor,
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

describe("native @platejs/layout column plugin", () => {
  test("insertColumnGroup stores percent strings and leaves the current block", () => {
    const two = nativeEditor([paragraph("Stay")]);
    insertColumnGroup(two, { columns: 2, at: [1], select: true });

    expect(two.children[0]?.type).toBe("p");
    expect(paragraphs(two.children[0])).toEqual(["Stay"]);
    expect(two.children[1]?.type).toBe(KEYS.columnGroup);
    expect(widthsOf(two.children[1])).toEqual(["50%", "50%"]);
    expect(two.selection?.anchor.path).toEqual([1, 0, 0, 0]);

    const three = nativeEditor([paragraph("Stay")]);
    insertColumnGroup(three, { columns: 3, at: [1], select: true });
    expect(widthsOf(three.children[1])).toEqual([
      "33.333333333333336%",
      "33.333333333333336%",
      "33.333333333333336%",
    ]);
  });

  test("the native normalizer adjusts every width when the sum is not 100", () => {
    const missing = nativeEditor([
      group("g", [
        column("a", undefined, [paragraph("A")]),
        column("b", undefined, [paragraph("B")]),
      ]),
    ]);
    missing.tf.normalize({ force: true });
    expect(widthsOf(missing.children[0])).toEqual(["50%", "50%"]);

    const odd = nativeEditor([
      group("g", [column("a", "40%", [paragraph("A")]), column("b", "40%", [paragraph("B")])]),
    ]);
    odd.tf.normalize({ force: true });
    expect(widthsOf(odd.children[0])).toEqual(["50%", "50%"]);
  });

  test("one column unwraps, an empty column is removed, and an empty paragraph stays", () => {
    const one = nativeEditor([group("g", [column("a", "100%", [paragraph("Only")])])]);
    one.tf.normalize({ force: true });
    expect(one.children.map((block) => block.type)).toEqual(["p"]);
    expect(paragraphs(one.children[0])).toEqual(["Only"]);

    const emptied = nativeEditor([
      group("g", [column("a", "50%", [paragraph("A")]), column("b", "50%", [])]),
    ]);
    emptied.tf.normalize({ force: true });
    expect(paragraphs(emptied)).toEqual(["A"]);

    const kept = nativeEditor([
      group("g", [column("a", "50%", [paragraph("")]), column("b", "50%", [paragraph("B")])]),
    ]);
    kept.tf.normalize({ force: true });
    expect(kept.children[0]?.type).toBe(KEYS.columnGroup);
    expect(kept.children[0]?.children).toHaveLength(2);
  });

  test("setColumns keeps the removed column's text and toggleColumnGroup moves the block", () => {
    const editor = nativeEditor([
      group("g", [
        column("a", "33%", [paragraph("A")]),
        column("b", "33%", [paragraph("B")]),
        column("c", "34%", [paragraph("C")]),
      ]),
    ]);
    setColumns(editor, { at: [0], columns: 2 });
    expect(paragraphs(editor.children[0])).toEqual(["A", "B", "C"]);
    expect(widthsOf(editor.children[0])).toEqual(["50%", "50%"]);

    const toggled = nativeEditor([paragraph("Stay")]);
    toggled.tf.select(caret([0, 0], 0));
    toggleColumnGroup(toggled, { columns: 2 });
    expect(toggled.children[0]?.type).toBe(KEYS.columnGroup);
    expect(paragraphs(toggled.children[0])).toEqual(["Stay", ""]);
  });
});

describe("column schema", () => {
  test("two and three columns round-trip with a list, a bookmark, and a table", () => {
    const bookmark: TElement = {
      type: "bookmark",
      id: "mark",
      url: "https://platejs.org/docs",
      children: [{ text: "" }],
    };
    const table: TElement = {
      type: "table",
      id: "table-1",
      children: [
        {
          type: "tr",
          id: "row-1",
          children: [
            {
              type: "td",
              id: "cell-1",
              children: [paragraph("Cell", "cell-p")],
            },
          ],
        },
      ],
    };
    const two = [
      group("g2", [
        column("c1", "50%", [
          paragraph("Item", "item"),
          { ...paragraph("Nested", "nested"), listStyleType: "disc", indent: 1 },
        ]),
        column("c2", "50%", [bookmark, table]),
      ]),
    ];
    const parsed = expectOk(documentOf(two));
    expect(parsed.repairs).toEqual([]);
    expect(parsed.document.content).toEqual(two);
    const again = expectOk(
      parseEditorDocument(JSON.parse(serializeEditorDocument(parsed.document))),
    );
    expect(again.repairs).toEqual([]);
    expect(again.document.content).toEqual(two);

    const three = [
      group("g3", [
        column("a", "33.33%", [paragraph("A", "pa")]),
        column("b", "33.33%", [paragraph("B", "pb")]),
        column("c", "33.34%", [paragraph("C", "pc")]),
      ]),
    ];
    const wide = expectOk(documentOf(three));
    expect(wide.repairs).toEqual([]);
    expect(wide.document.content).toEqual(three);
  });

  test("invalid, missing, negative, and too-small widths become an equal split", () => {
    const cases = [
      group("missing", [
        column("a", undefined, [paragraph("A")]),
        column("b", undefined, [paragraph("B")]),
      ]),
      group("nan", [column("a", "nope", [paragraph("A")]), column("b", "50%", [paragraph("B")])]),
      group("negative", [
        column("a", "-10%", [paragraph("A")]),
        column("b", "110%", [paragraph("B")]),
      ]),
      group("small", [column("a", "10%", [paragraph("A")]), column("b", "90%", [paragraph("B")])]),
    ];

    for (const content of cases) {
      const parsed = expectOk(documentOf([content]));
      expect(messages(parsed)).toContain(COLUMN_WIDTH_EQUAL);
      expect(widthsOf(parsed.document.content[0])).toEqual(["50%", "50%"]);
      expect(paragraphs(parsed.document.content[0])).toEqual(["A", "B"]);
    }
  });

  test("a one-column group unwraps, a nested group lifts, and a disallowed child lifts", () => {
    const unwrapped = expectOk(
      documentOf([group("g", [column("a", "100%", [paragraph("Only", "only")])])]),
    );
    expect(messages(unwrapped)).toContain(COLUMN_UNWRAPPED);
    expect(unwrapped.document.content).toEqual([paragraph("Only", "only")]);

    const nested = expectOk(
      documentOf([
        group("outer", [
          column("a", "50%", [
            paragraph("A", "a"),
            group("inner", [
              column("i1", "50%", [paragraph("In", "in")]),
              column("i2", "50%", [paragraph("Side", "side")]),
            ]),
          ]),
          column("b", "50%", [paragraph("B", "b")]),
        ]),
      ]),
    );
    expect(messages(nested)).toContain(COLUMN_NESTED);
    expect(nested.document.content.map((block) => block.type)).toEqual([
      "column_group",
      "column_group",
    ]);
    expect(paragraphs(nested.document.content)).toEqual(["A", "B", "In", "Side"]);

    const line: TElement = {
      type: "code_line",
      id: "line-1",
      children: [{ text: "code" }],
    };
    const lifted = expectOk(
      documentOf([
        group("g", [
          column("a", "50%", [paragraph("A", "a"), line]),
          column("b", "50%", [paragraph("B", "b")]),
        ]),
      ]),
    );
    expect(messages(lifted)).toContain(COLUMN_CHILD_LIFTED);
    expect(lifted.document.content.map((block) => block.type)).toEqual([
      "column_group",
      "code_line",
    ]);
    expect(paragraphs(lifted.document.content)).toEqual(["A", "B", "code"]);
  });

  test("an unknown attribute keeps the raw document", () => {
    const raw = createEditorDocument("doc-columns", [
      group("g", [column("a", "50%", [paragraph("A")]), column("b", "50%", [paragraph("B")])], {
        gap: 8,
      }),
    ]);
    const parsed = parseEditorDocument(raw);
    expect(parsed.status).toBe("unsupported");
    if (parsed.status === "unsupported") {
      expect(JSON.stringify(parsed.raw)).toContain('"gap":8');
    }
  });

  test("columns stay out of toggle, quote, callout, and table child lists", () => {
    expect(allowedChildTypes("toggle")).not.toContain(KEYS.columnGroup);
    expect(allowedChildTypes("blockquote")).toEqual([KEYS.p]);
    expect(allowedChildTypes("callout")).toEqual([KEYS.p]);
    expect(allowedChildTypes("td")).toEqual([KEYS.p]);
    expect(allowedChildTypes("th")).toEqual([KEYS.p]);
    expect(allowedChildTypes(KEYS.column)).not.toContain(KEYS.columnGroup);
  });
});

describe("column commands", () => {
  function sample(): SlateEditor {
    return createEditor([
      paragraph("Stay", "stay"),
      group("g", [
        column("a", "50%", [paragraph("A", "pa")]),
        column("b", "50%", [paragraph("B", "pb")]),
      ]),
    ]);
  }

  test("insert 2 and insert 3 land after the current block without moving it", () => {
    const editor = createEditor([paragraph("Stay", "stay")]);
    editor.tf.select(caret([0, 0], 1));
    const undos = editor.history.undos.length;
    expect(runEditorCommand(editor, insertColumns2, undefined)).toBe(true);

    expect(editor.children.map((block) => block.type)).toEqual(["p", "column_group"]);
    expect(paragraphs(editor.children[0])).toEqual(["Stay"]);
    expect(widthsOf(editor.children[1])).toEqual(["50%", "50%"]);
    expect(editor.selection?.anchor.path[0]).toBe(1);
    expect(editor.selection?.anchor.path[1]).toBe(0);
    expect(editor.history.undos.length).toBe(undos + 1);
    editor.tf.undo();
    expect(editor.children.map((block) => block.type)).toEqual(["p"]);
    expect(paragraphs(editor)).toEqual(["Stay"]);

    const three = createEditor([paragraph("Stay", "stay")]);
    three.tf.select(caret([0, 0], 0));
    expect(runEditorCommand(three, insertColumns3, undefined)).toBe(true);
    expect(widthsOf(three.children[1])).toEqual(["33.33%", "33.33%", "33.34%"]);
    expect(paragraphs(three.children[0])).toEqual(["Stay"]);
  });

  test("2 to 3 to 2 to 1 keeps every paragraph in order", () => {
    const editor = sample();
    editor.tf.select(caret([1, 0, 0, 0], 0));
    const undos = editor.history.undos.length;

    expect(runEditorCommand(editor, setColumnCountCommand, 3)).toBe(true);
    expect(widthsOf(editor.children[1])).toEqual(["33.33%", "33.33%", "33.34%"]);
    expect(paragraphs(editor)).toEqual(["Stay", "A", "B", ""]);
    expect(editor.history.undos.length).toBe(undos + 1);

    expect(runEditorCommand(editor, setColumnCountCommand, 2)).toBe(true);
    expect(paragraphs(editor)).toEqual(["Stay", "A", "B", ""]);
    expect(editor.children[1]?.children).toHaveLength(2);

    expect(runEditorCommand(editor, removeColumnCommand, 1)).toBe(true);
    expect(editor.children.map((block) => block.type)).toEqual(["p", "p", "p", "p"]);
    expect(paragraphs(editor)).toEqual(["Stay", "A", "B", ""]);
    editor.tf.undo();
    expect(editor.children[1]?.type).toBe("column_group");
    expect(paragraphs(editor)).toEqual(["Stay", "A", "B", ""]);
  });

  test("remove-column moves children to the neighbour and unwrap keeps reading order", () => {
    const editor = createEditor([
      group("g", [
        column("a", "33.33%", [paragraph("A", "pa")]),
        column("b", "33.33%", [paragraph("B", "pb")]),
        column("c", "33.34%", [paragraph("C", "pc")]),
      ]),
    ]);
    editor.tf.select(caret([0, 1, 0, 0], 0));
    const undos = editor.history.undos.length;
    expect(runEditorCommand(editor, removeColumnCommand, 0)).toBe(true);
    expect(paragraphs(editor.children[0])).toEqual(["A", "B", "C"]);
    expect(editor.children[0]?.children).toHaveLength(2);
    expect(editor.history.undos.length).toBe(undos + 1);
    editor.tf.undo();
    expect(paragraphs(editor.children[0])).toEqual(["A", "B", "C"]);

    editor.tf.select(caret([0, 0, 0, 0], 0));
    expect(runEditorCommand(editor, unwrapColumnsCommand, undefined)).toBe(true);
    expect(editor.children.map((block) => block.type)).toEqual(["p", "p", "p"]);
    expect(paragraphs(editor)).toEqual(["A", "B", "C"]);
  });

  test("set-widths clamps at 20% and a same-value write is a no-op", () => {
    const editor = sample();
    editor.tf.select(caret([1, 0, 0, 0], 0));
    const undos = editor.history.undos.length;
    expect(runEditorCommand(editor, setColumnWidthsCommand, [10, 90])).toBe(true);
    expect(widthsOf(editor.children[1])).toEqual(["20%", "80%"]);
    expect(editor.history.undos.length).toBe(undos + 1);
    editor.tf.undo();
    expect(widthsOf(editor.children[1])).toEqual(["50%", "50%"]);

    editor.tf.select(caret([1, 0, 0, 0], 0));
    const again = editor.history.undos.length;
    expect(runEditorCommand(editor, setColumnWidthsCommand, [50, 50])).toBe(true);
    expect(editor.history.undos.length).toBe(again);
  });

  test("Mod+Alt+Arrow moves a block across columns and out at both edges", () => {
    const editor = createEditor([
      paragraph("Before", "before"),
      group("g", [
        column("a", "50%", [paragraph("Left", "left")]),
        column("b", "50%", [paragraph("Right", "right")]),
      ]),
      paragraph("After", "after"),
    ]);
    editor.tf.select(caret([1, 0, 0, 0], 0));
    const forward = keyEvent("ArrowRight");
    const undos = editor.history.undos.length;
    onColumnKeyDown(editor, forward.event);
    expect(forward.prevented()).toBe(true);
    expect(paragraphs(editor.children[1])).toEqual(["", "Left", "Right"]);
    expect(editor.history.undos.length).toBe(undos + 1);

    const back = keyEvent("ArrowLeft");
    onColumnKeyDown(editor, back.event);
    expect(back.prevented()).toBe(true);
    expect(paragraphs(editor.children[1])).toEqual(["Left", "Right"]);

    editor.tf.select(caret([1, 0, 0, 0], 0));
    const outLeft = keyEvent("ArrowLeft");
    onColumnKeyDown(editor, outLeft.event);
    expect(paragraphs(editor)).toEqual(["Before", "Left", "", "Right", "After"]);

    const rightEdge = createEditor([
      group("g", [
        column("a", "50%", [paragraph("Left", "left")]),
        column("b", "50%", [paragraph("Right", "right")]),
      ]),
    ]);
    rightEdge.tf.select(caret([0, 1, 0, 0], 0));
    onColumnKeyDown(rightEdge, keyEvent("ArrowRight").event);
    expect(rightEdge.children.map((block) => block.type)).toEqual(["column_group", "p"]);
    expect(paragraphs(rightEdge)).toEqual(["Left", "", "Right"]);
  });

  test("outside a column the arrow keys do not run and do not collide", () => {
    const editor = createEditor([paragraph("Stay", "stay")]);
    editor.tf.select(caret([0, 0], 0));
    const undos = editor.history.undos.length;
    const pressed = keyEvent("ArrowRight");
    onColumnKeyDown(editor, pressed.event);
    expect(pressed.prevented()).toBe(false);
    expect(paragraphs(editor)).toEqual(["Stay"]);
    expect(editor.history.undos.length).toBe(undos);

    const shortcuts = Object.entries(editor.meta.shortcuts);
    const collisions = shortcuts.filter(([, shortcut]) => {
      if (!isRecord(shortcut) || !Array.isArray(shortcut.keys)) {
        return false;
      }
      return JSON.stringify(shortcut.keys).includes("Arrow");
    });
    expect(collisions).toEqual([]);
  });

  test("column commands are a no-op in a read-only editor", () => {
    const editor = sample();
    editor.tf.select(caret([1, 0, 0, 0], 0));
    const undos = editor.history.undos.length;
    expect(runEditorCommand(editor, insertColumns2, undefined, { readOnly: true })).toBe(false);
    expect(runEditorCommand(editor, insertColumns3, undefined, { readOnly: true })).toBe(false);
    expect(runEditorCommand(editor, setColumnCountCommand, 3, { readOnly: true })).toBe(false);
    expect(runEditorCommand(editor, removeColumnCommand, 0, { readOnly: true })).toBe(false);
    expect(runEditorCommand(editor, unwrapColumnsCommand, undefined, { readOnly: true })).toBe(
      false,
    );
    expect(runEditorCommand(editor, setColumnWidthsCommand, [20, 80], { readOnly: true })).toBe(
      false,
    );
    expect(paragraphs(editor)).toEqual(["Stay", "A", "B"]);
    expect(editor.history.undos.length).toBe(undos);
  });
});

describe("column containers and keys", () => {
  test("a column group inside a toggle, quote, callout, or table cell lifts out", () => {
    const inner = group("g", [
      column("a", "50%", [paragraph("A", "a")]),
      column("b", "50%", [paragraph("B", "b")]),
    ]);
    const toggle = expectOk(
      documentOf([
        { type: "toggle", id: "toggle-1", children: [paragraph("Label", "label"), inner] },
      ]),
    );
    expect(messages(toggle)).toContain(COLUMN_LIFT_TOGGLE);
    expect(toggle.document.content.map((block) => block.type)).toEqual(["toggle", "column_group"]);

    const quote = expectOk(
      documentOf([
        { type: "blockquote", id: "quote-1", children: [paragraph("Said", "said"), inner] },
      ]),
    );
    expect(messages(quote)).toContain(COLUMN_LIFT_QUOTE);
    expect(quote.document.content.map((block) => block.type)).toEqual([
      "blockquote",
      "column_group",
    ]);

    const callout = expectOk(
      documentOf([
        {
          type: "callout",
          id: "callout-1",
          icon: "info",
          variant: "info",
          children: [paragraph("Note", "note"), inner],
        },
      ]),
    );
    expect(messages(callout)).toContain(COLUMN_LIFT_CALLOUT);
    expect(callout.document.content.map((block) => block.type)).toEqual([
      "callout",
      "column_group",
    ]);

    const table = expectOk(
      documentOf([
        {
          type: "table",
          id: "table-1",
          children: [
            {
              type: "tr",
              id: "row-1",
              children: [
                {
                  type: "td",
                  id: "cell-1",
                  children: [paragraph("Cell", "cell"), inner],
                },
              ],
            },
          ],
        },
      ]),
    );
    expect(messages(table)).toContain(COLUMN_LIFT_TABLE);
    expect(table.document.content.map((block) => block.type)).toEqual(["table", "column_group"]);
    expect(paragraphs(table.document.content)).toEqual(["Cell", "A", "B"]);

    const editor = createEditor([
      { type: "toggle", id: "toggle-1", children: [paragraph("Label", "label"), inner] },
    ]);
    editor.tf.normalize({ force: true });
    expect(editor.children.map((block) => block.type)).toEqual(["toggle", "column_group"]);
    expect(pasteRepairsOf(editor).map((repair) => repair.message)).toContain(COLUMN_LIFT_TOGGLE);
  });

  test("enter splits inside a column and backspace does not merge columns", () => {
    const editor = createEditor([
      group("g", [
        column("a", "50%", [paragraph("Left", "left"), paragraph("Next", "next")]),
        column("b", "50%", [paragraph("Right", "right")]),
      ]),
    ]);
    editor.tf.select(caret([0, 0, 0, 0], 4));
    editor.tf.insertBreak();
    expect(paragraphs(editor.children[0])).toEqual(["Left", "", "Next", "Right"]);
    expect(editor.children[0]?.children).toHaveLength(2);

    editor.tf.select(caret([0, 0, 2, 0], 0));
    editor.tf.deleteBackward();
    expect(paragraphs(editor.children[0])).toEqual(["Left", "Next", "Right"]);

    const boundary = createEditor([
      group("g", [
        column("a", "50%", [paragraph("", "empty")]),
        column("b", "50%", [paragraph("Right", "right")]),
      ]),
    ]);
    boundary.tf.select(caret([0, 0, 0, 0], 0));
    boundary.tf.deleteBackward();
    expect(boundary.children.map((block) => block.type)).toEqual(["column_group"]);
    expect(paragraphs(boundary)).toEqual(["", "Right"]);

    const listed = createEditor([
      group("g", [
        column("a", "50%", [{ ...paragraph("Item", "item"), listStyleType: "disc", indent: 1 }]),
        column("b", "50%", [paragraph("Right", "right")]),
      ]),
    ]);
    listed.tf.select(caret([0, 0, 0, 0], 0));
    expect(listed.tf.tab({ reverse: false })).toBe(true);
    const groupNode = listed.children[0];
    const columnNode =
      isRecord(groupNode) && Array.isArray(groupNode.children) ? groupNode.children[0] : undefined;
    const item =
      isRecord(columnNode) && Array.isArray(columnNode.children)
        ? columnNode.children[0]
        : undefined;
    expect(field(item, "indent")).toBe(2);
  });
});

describe("column rendering", () => {
  test("the group stacks with grid-cols-1 and read-only hides the handles", async () => {
    const value: EditorValue = [
      group("g", [
        column("a", "50%", [paragraph("Left", "left")]),
        column("b", "50%", [paragraph("Right", "right")]),
      ]),
    ];
    const mounted = await mountColumns(value);
    const layout = mounted.host.querySelector("[data-column-layout]");
    expect(layout?.className).toContain("grid-cols-1");
    expect(COLUMN_GROUP_LAYOUT_CLASS).toContain("grid-cols-1");
    expect(mounted.host.querySelectorAll("[data-column-resize]")).toHaveLength(1);
    expect(mounted.host.querySelector("[data-column-toolbar]")).toBeTruthy();
    await mounted.cleanup();

    const readOnly = await mountColumns(value, true);
    expect(readOnly.host.querySelector("[data-column-layout]")?.className).toContain("grid-cols-1");
    expect(readOnly.host.querySelectorAll("[data-column-resize]")).toHaveLength(0);
    expect(readOnly.host.querySelector("[data-column-toolbar]")).toBeNull();
    await readOnly.cleanup();
  });

  test("a drag is one undo and the keyboard resize stops at 20%", async () => {
    const mounted = await mountColumns([
      group("g", [
        column("a", "50%", [paragraph("Left", "left")]),
        column("b", "50%", [paragraph("Right", "right")]),
      ]),
    ]);
    const handle = mounted.host.querySelector("[data-column-resize]");
    const layout = mounted.host.querySelector("[data-column-layout]");
    if (!(handle instanceof HTMLElement) || !(layout instanceof HTMLElement)) {
      throw new Error("Missing column resize handle.");
    }

    layout.getBoundingClientRect = () =>
      ({
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 200,
        bottom: 40,
        width: 200,
        height: 40,
        toJSON() {
          return {};
        },
      }) as DOMRect;

    const undos = mounted.editor.history.undos.length;
    await act(async () => {
      handle.dispatchEvent(
        new PointerEvent("pointerdown", { button: 0, clientX: 0, bubbles: true }),
      );
      handle.dispatchEvent(new PointerEvent("pointermove", { clientX: 20, bubbles: true }));
    });
    expect(widthsOf(mounted.editor.children[0])).toEqual(["50%", "50%"]);
    expect(layout.getAttribute("style")).toContain("60fr");

    await act(async () => {
      handle.dispatchEvent(new PointerEvent("pointerup", { clientX: 20, bubbles: true }));
    });
    expect(widthsOf(mounted.editor.children[0])).toEqual(["60%", "40%"]);
    expect(mounted.editor.history.undos.length).toBe(undos + 1);
    await act(async () => {
      mounted.editor.tf.undo();
    });
    expect(widthsOf(mounted.editor.children[0])).toEqual(["50%", "50%"]);

    handle.focus();
    await act(async () => {
      handle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    });
    expect(widthsOf(mounted.editor.children[0])).toEqual(["45%", "55%"]);
    for (let step = 0; step < 8; step += 1) {
      await act(async () => {
        handle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
      });
    }
    expect(widthsOf(mounted.editor.children[0])).toEqual(["20%", "80%"]);
    await mounted.cleanup();
  });

  test("removing the group asks for a second click and then deletes its content", async () => {
    const mounted = await mountColumns([
      paragraph("Stay", "stay"),
      group("g", [
        column("a", "50%", [paragraph("Gone", "gone")]),
        column("b", "50%", [paragraph("Too", "too")]),
      ]),
    ]);
    const remove = mounted.host.querySelector("[aria-label='Delete']");
    if (!(remove instanceof HTMLButtonElement)) {
      throw new Error("Missing remove button.");
    }

    await act(async () => {
      remove.click();
    });
    expect(mounted.host.textContent).toContain(COLUMN_REMOVE_CONFIRM);
    expect(paragraphs(mounted.editor)).toEqual(["Stay", "Gone", "Too"]);

    const confirm = mounted.host.querySelector(`[aria-label='${COLUMN_REMOVE_CONFIRM}']`);
    if (!(confirm instanceof HTMLButtonElement)) {
      throw new Error("Missing confirm button.");
    }
    await act(async () => {
      confirm.click();
    });
    expect(paragraphs(mounted.editor)).toEqual(["Stay"]);
    await act(async () => {
      mounted.editor.tf.undo();
    });
    expect(paragraphs(mounted.editor)).toContain("Gone");
    await mounted.cleanup();
  });

  test("the columns menu checks the current count and changes it in one undo", async () => {
    const mounted = await mountColumns([
      group("g", [
        column("a", "50%", [paragraph("Left", "left")]),
        column("b", "50%", [paragraph("Right", "right")]),
      ]),
    ]);
    try {
      const trigger = mounted.host.querySelector("[aria-label='Columns']");
      if (!(trigger instanceof HTMLElement)) {
        throw new Error("Missing the columns menu.");
      }
      const view = trigger.ownerDocument.defaultView;
      if (!view) {
        throw new Error("Missing window.");
      }
      await act(async () => {
        trigger.dispatchEvent(
          new view.PointerEvent("pointerdown", { bubbles: true, cancelable: true, button: 0 }),
        );
      });
      const checked = document.querySelector("[role='menuitemradio'][aria-checked='true']");
      const three = [...document.querySelectorAll("[role='menuitemradio']")].find((item) =>
        item.textContent?.includes("3 columns"),
      );
      expect(checked?.textContent).toContain("2 columns");
      expect(three instanceof HTMLElement).toBe(true);
      if (!(three instanceof HTMLElement)) {
        return;
      }
      const undos = mounted.editor.history.undos.length;
      await act(async () => {
        three.dispatchEvent(new view.MouseEvent("click", { bubbles: true, cancelable: true }));
      });
      expect(mounted.editor.children[0]?.children).toHaveLength(3);
      expect(mounted.editor.history.undos.length).toBe(undos + 1);
      await act(async () => {
        mounted.editor.tf.undo();
      });
      expect(mounted.editor.children[0]?.children).toHaveLength(2);
    } finally {
      await mounted.cleanup();
    }
  });
});
