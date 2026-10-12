import { describe, expect, test } from "bun:test";
import { KEYS, type SlateEditor, type TElement } from "platejs";

import { runEditorCommand } from "../lib/commands/editor-commands";
import type { EditorValue } from "../lib/document/editor-value";
import { FOOTNOTE_DEF_KEY, FOOTNOTE_REF_KEY } from "../lib/document/editor-document-schema";
import {
  footnoteDefinitionEntry,
  footnoteDefinitionNode,
  footnoteIndex,
  footnoteNumber,
  footnoteReferenceEntries,
  footnoteReferenceNode,
  insertFootnote,
  removeFootnote,
  selectFootnoteDefinition,
  selectFootnoteReference,
} from "../lib/features/editor-footnote";
import { readToggleOpenIds } from "../lib/plugins/editor-toggle";
import {
  applyBlockTurn,
  blockMenuDecisions,
  menuBlockView,
} from "../lib/features/editor-block-menu";
import { caret, createEditor, texts } from "./test-utils";
import { def, para, ref, text, toggle, defsOf, refsOf } from "./footnote-fixtures";

describe("insertFootnote", () => {
  test("a collapsed caret inserts a reference and a new definition at the end of the document", () => {
    const editor = createEditor([para("p", [text("abcd")])] as unknown as EditorValue);
    editor.tf.select(caret([0, 0], 2));

    expect(runEditorCommand(editor, insertFootnote, undefined)).toBe(true);

    const [reference] = refsOf(editor);
    expect(reference?.footnoteId).toEqual(expect.any(String));
    expect(texts(editor)).toEqual(["abcd", ""]);
    expect(
      editor.children[0]?.children.map((child) => ("type" in child ? child.type : "text")),
    ).toEqual(["text", FOOTNOTE_REF_KEY, "text"]);
    expect(defsOf(editor)).toHaveLength(1);
    expect(defsOf(editor)[0]?.footnoteId).toBe(reference?.footnoteId);
    expect(footnoteNumber(editor, String(reference?.footnoteId))).toBe(1);
  });

  test("an expanded selection keeps the text and puts the reference at the selection end", () => {
    const editor = createEditor([para("p", [text("abcd")])] as unknown as EditorValue);
    editor.tf.select({ anchor: { path: [0, 0], offset: 1 }, focus: { path: [0, 0], offset: 3 } });

    expect(runEditorCommand(editor, insertFootnote, undefined)).toBe(true);

    expect(texts(editor)[0]).toBe("abcd");
    const children = editor.children[0]?.children ?? [];
    expect(children.map((child) => ("text" in child ? child.text : child.type))).toEqual([
      "abc",
      FOOTNOTE_REF_KEY,
      "d",
    ]);
  });

  test("it is disabled inside a code line and reports nothing changed", () => {
    const editor = createEditor([
      {
        type: KEYS.codeBlock,
        id: "cb",
        children: [{ type: KEYS.codeLine, id: "cl", children: [text("code")] }],
      },
    ] as unknown as EditorValue);
    editor.tf.select(caret([0, 0, 0], 1));
    editor.tf.normalize({ force: true });
    const before = structuredClone(editor.children);

    expect(insertFootnote.isEnabled?.(editor)).toBe(false);
    expect(runEditorCommand(editor, insertFootnote, undefined)).toBe(false);
    expect(editor.children).toEqual(before);
  });

  test("it is disabled inside a definition", () => {
    const editor = createEditor([
      para("p", [text("a")]),
      def("d", "x", "inside"),
    ] as unknown as EditorValue);
    editor.tf.select(caret([1, 0], 2));

    expect(insertFootnote.isEnabled?.(editor)).toBe(false);
    expect(runEditorCommand(editor, insertFootnote, undefined)).toBe(false);
    expect(refsOf(editor)).toHaveLength(0);
  });

  test("the caret lands inside the new definition", () => {
    const editor = createEditor([para("p", [text("abc")])] as unknown as EditorValue);
    editor.tf.select(caret([0, 0], 1));
    runEditorCommand(editor, insertFootnote, undefined);

    expect(editor.api.block()?.[0]?.type).toBe(FOOTNOTE_DEF_KEY);
    expect(editor.selection?.anchor.path).toEqual([1, 0]);
  });

  test("with no trailing run of definitions, the new definition goes at the end", () => {
    const editor = createEditor([
      para("p", [text("abc")]),
      def("d-old", "old", "older"),
      para("tail", [text("tail")]),
    ] as unknown as EditorValue);
    editor.tf.select(caret([0, 0], 1));
    runEditorCommand(editor, insertFootnote, undefined);

    const last = editor.children[editor.children.length - 1] as TElement;
    expect(last.type).toBe(FOOTNOTE_DEF_KEY);
    expect(editor.children.map((node) => ("type" in node ? node.type : ""))).toEqual([
      KEYS.p,
      FOOTNOTE_DEF_KEY,
      KEYS.p,
      FOOTNOTE_DEF_KEY,
    ]);
  });

  // Definition order inside the trailing run, by footnote number.
  function definitionOrder(editor: SlateEditor): string[] {
    return defsOf(editor).map((node) => String(node.footnoteId));
  }

  test("a new first reference puts its definition before the existing ones", () => {
    const editor = createEditor([
      para("p0", [text("start")]),
      para("p1", [text("a "), ref("r-a", "a")]),
      para("p2", [text("b "), ref("r-b", "b")]),
      def("da", "a", "A"),
      def("db", "b", "B"),
    ] as unknown as EditorValue);
    editor.tf.select(caret([0, 0], 5));

    runEditorCommand(editor, insertFootnote, undefined);

    const created = String(refsOf(editor)[0]?.footnoteId);
    expect(footnoteNumber(editor, created)).toBe(1);
    expect(definitionOrder(editor)).toEqual([created, "a", "b"]);
  });

  test("a new reference between two existing ones puts its definition in the middle", () => {
    const editor = createEditor([
      para("p0", [text("a "), ref("r-a", "a")]),
      para("p1", [text("b "), ref("r-c", "c")]),
      def("da", "a", "A"),
      def("dc", "c", "C"),
    ] as unknown as EditorValue);
    editor.tf.select(caret([1, 0], 2));

    runEditorCommand(editor, insertFootnote, undefined);

    const created = String(refsOf(editor)[1]?.footnoteId);
    expect(footnoteNumber(editor, created)).toBe(2);
    expect(definitionOrder(editor)).toEqual(["a", created, "c"]);
  });

  test("an unreferenced definition stays after the new one", () => {
    const editor = createEditor([
      para("p0", [text("a "), ref("r-a", "a"), text(" end")]),
      def("da", "a", "A"),
      def("dorphan", "orphan", "lonely"),
    ] as unknown as EditorValue);
    editor.tf.select(caret([0, 2], 0));

    runEditorCommand(editor, insertFootnote, undefined);

    const created = String(refsOf(editor)[1]?.footnoteId);
    expect(footnoteNumber(editor, created)).toBe(2);
    expect(definitionOrder(editor)).toEqual(["a", created, "orphan"]);
  });

  test("one undo removes the reference and the definition and restores the selection", () => {
    const editor = createEditor([para("p", [text("abcd")])] as unknown as EditorValue);
    editor.tf.select(caret([0, 0], 2));
    editor.tf.normalize({ force: true });
    const before = structuredClone(editor.children);
    const selectionBefore = editor.selection;

    runEditorCommand(editor, insertFootnote, undefined);
    editor.tf.undo();

    expect(editor.children).toEqual(before);
    expect(editor.selection).toEqual(selectionBefore);
  });

  test("the command does nothing in read-only mode", () => {
    const editor = createEditor([para("p", [text("abcd")])] as unknown as EditorValue);
    editor.tf.select(caret([0, 0], 2));
    editor.tf.normalize({ force: true });
    const before = structuredClone(editor.children);

    expect(runEditorCommand(editor, insertFootnote, undefined, { readOnly: true })).toBe(false);
    editor.dom.readOnly = true;
    expect(insertFootnote.isEnabled?.(editor)).toBe(false);
    expect(runEditorCommand(editor, insertFootnote, undefined)).toBe(false);
    editor.dom.readOnly = false;
    expect(editor.children).toEqual(before);
  });
});

describe("removeFootnote", () => {
  test("removes every reference and the definition in one undo step", () => {
    const editor = createEditor([
      para("p1", [text("a "), ref("r1", "a")]),
      para("p2", [text("b "), ref("r2", "a"), text(" c")]),
      para("p3", [text("keep "), ref("r3", "b")]),
      def("d", "a", "gone"),
    ] as unknown as EditorValue);
    editor.tf.normalize({ force: true });
    const before = structuredClone(editor.children);

    expect(runEditorCommand(editor, removeFootnote, { footnoteId: "a" })).toBe(true);

    expect(refsOf(editor).map((node) => node.footnoteId)).toEqual(["b"]);
    expect(defsOf(editor)).toHaveLength(0);
    expect(texts(editor)).toEqual(["a ", "b  c", "keep "]);

    editor.tf.undo();
    expect(editor.children).toEqual(before);
  });
});

describe("selection helpers", () => {
  test("selectFootnoteDefinition puts the caret at the end of the definition", () => {
    const editor = createEditor([
      para("p", [text("a"), ref("r", "x")]),
      def("d", "x", "text"),
    ] as unknown as EditorValue);
    const historyBefore = editor.history.undos.length;

    expect(selectFootnoteDefinition(editor, "x")).toBe(true);

    expect(editor.selection?.anchor).toEqual({ path: [1, 0], offset: 4 });
    expect(editor.history.undos.length).toBe(historyBefore);
  });

  test("selectFootnoteReference puts the caret right after the first reference", () => {
    const editor = createEditor([
      para("p", [text("a"), ref("r", "x"), text("b")]),
      para("q", [ref("r2", "x")]),
    ] as unknown as EditorValue);

    expect(selectFootnoteReference(editor, "x")).toBe(true);

    expect(editor.selection?.anchor).toEqual({ path: [0, 2], offset: 0 });
  });

  test("the select helpers return false and change nothing when the target is missing", () => {
    const editor = createEditor([para("p", [text("abc")])] as unknown as EditorValue);
    editor.tf.select(caret([0, 0], 1));
    const selectionBefore = editor.selection;
    const historyBefore = editor.history.undos.length;

    expect(selectFootnoteDefinition(editor, "nope")).toBe(false);
    expect(selectFootnoteReference(editor, "nope")).toBe(false);

    expect(editor.selection).toEqual(selectionBefore);
    expect(editor.history.undos.length).toBe(historyBefore);
  });

  test("selecting a reference inside a collapsed toggle opens the toggle", async () => {
    const toggleValue = toggle("t-open", "label", [para("tp", [ref("r", "x")])]);
    const editor = createEditor([toggleValue, def("d", "x", "text")] as unknown as EditorValue);
    expect(readToggleOpenIds(editor).has("t-open")).toBe(false);

    expect(selectFootnoteReference(editor, "x")).toBe(true);
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(readToggleOpenIds(editor).has("t-open")).toBe(true);
  });

  test("the definition and reference entries are found by id", () => {
    const editor = createEditor([
      para("p1", [ref("r1", "x")]),
      para("p2", [ref("r2", "x")]),
      def("d", "x"),
    ] as unknown as EditorValue);

    expect(footnoteDefinitionEntry(editor, "x")?.[1]).toEqual([2]);
    expect(footnoteReferenceEntries(editor, "x").map((entry) => entry[1])).toEqual([
      [0, 0],
      [1, 0],
    ]);
    expect(footnoteDefinitionEntry(editor, "missing")).toBeUndefined();
  });
});

describe("plain deletion", () => {
  test("Backspace after a reference removes only the reference, and the definition stays", () => {
    const editor = createEditor([
      para("p", [text("a"), ref("r", "x"), text("b")]),
      def("d", "x", "kept"),
    ] as unknown as EditorValue);
    editor.tf.select(caret([0, 2], 0));
    editor.tf.normalize({ force: true });
    const before = structuredClone(editor.children);

    editor.tf.deleteBackward("character");

    expect(refsOf(editor)).toHaveLength(0);
    expect(defsOf(editor)).toHaveLength(1);
    expect(footnoteIndex(editor).definitions.has("x")).toBe(true);
    expect(footnoteNumber(editor, "x")).toBeUndefined();

    editor.tf.undo();
    expect(editor.children).toEqual(before);
  });

  test("Delete before a reference removes only the reference", () => {
    const editor = createEditor([
      para("p", [text("a"), ref("r", "x"), text("b")]),
      def("d", "x", "kept"),
    ] as unknown as EditorValue);
    editor.tf.select(caret([0, 0], 1));

    editor.tf.deleteForward("character");

    expect(refsOf(editor)).toHaveLength(0);
    expect(defsOf(editor)).toHaveLength(1);
  });

  test("removing a definition leaves its references, which are then missing", () => {
    const editor = createEditor([
      para("p", [text("a"), ref("r", "x")]),
      def("d", "x", "gone"),
    ] as unknown as EditorValue);
    editor.tf.normalize({ force: true });
    const before = structuredClone(editor.children);

    editor.tf.removeNodes({ at: [1] });

    expect(refsOf(editor)).toHaveLength(1);
    expect(footnoteIndex(editor).definitions.has("x")).toBe(false);
    expect(footnoteNumber(editor, "x")).toBe(1);

    editor.tf.undo();
    expect(editor.children).toEqual(before);
  });
});

describe("keys inside a definition", () => {
  function editorWithDefinition(value: string, offset: number) {
    const editor = createEditor([
      para("p", [text("before")]),
      def("d", "x", value),
    ] as unknown as EditorValue);
    editor.tf.select(caret([1, 0], offset));
    return editor;
  }

  test("Enter at the end adds an empty paragraph after the definition", () => {
    const editor = editorWithDefinition("abc", 3);

    editor.tf.insertBreak();

    expect(editor.children[1]?.type).toBe(FOOTNOTE_DEF_KEY);
    expect(editor.children[2]?.type).toBe(KEYS.p);
    expect(texts(editor)).toEqual(["before", "abc", ""]);
    expect(editor.selection?.anchor.path).toEqual([2, 0]);
  });

  test("Enter in the middle moves the text after the caret into a new paragraph", () => {
    const editor = editorWithDefinition("abcd", 2);

    editor.tf.insertBreak();

    expect(editor.children[1]?.type).toBe(FOOTNOTE_DEF_KEY);
    expect(editor.children[2]?.type).toBe(KEYS.p);
    expect(texts(editor)).toEqual(["before", "ab", "cd"]);
    expect(defsOf(editor)).toHaveLength(1);
  });

  test("Enter at the start leaves an empty definition and moves all text into a paragraph", () => {
    const editor = editorWithDefinition("ab", 0);

    editor.tf.insertBreak();

    expect(texts(editor)).toEqual(["before", "", "ab"]);
    expect(editor.children[1]?.type).toBe(FOOTNOTE_DEF_KEY);
    expect(editor.children[2]?.type).toBe(KEYS.p);
  });

  test("Enter never creates a second definition with the same id", () => {
    const editor = editorWithDefinition("abcd", 2);
    editor.tf.insertBreak();
    editor.tf.insertBreak();

    expect(defsOf(editor).map((node) => node.footnoteId)).toEqual(["x"]);
  });

  test("Shift+Enter keeps a soft line break inside the definition", () => {
    const editor = editorWithDefinition("ab", 1);

    editor.tf.insertSoftBreak();

    expect(editor.children[1]?.type).toBe(FOOTNOTE_DEF_KEY);
    expect(texts(editor)[1]).toContain("\n");
  });

  test("Backspace at the start turns the definition into a paragraph and nothing merges", () => {
    const editor = editorWithDefinition("ab", 0);
    editor.tf.normalize({ force: true });
    const before = structuredClone(editor.children);

    editor.tf.deleteBackward("character");

    expect(editor.children).toHaveLength(2);
    expect(editor.children[0]?.type).toBe(KEYS.p);
    expect(editor.children[1]).toEqual(expect.objectContaining({ type: KEYS.p }));
    expect(texts(editor)).toEqual(["before", "ab"]);
    expect(editor.children[1] && "footnoteId" in editor.children[1]).toBe(false);

    editor.tf.undo();
    expect(editor.children).toEqual(before);
  });

  test("Backspace inside the text removes one character and keeps the definition", () => {
    const editor = editorWithDefinition("ab", 1);

    editor.tf.deleteBackward("character");

    expect(texts(editor)).toEqual(["before", "b"]);
    expect(editor.children[1]?.type).toBe(FOOTNOTE_DEF_KEY);
  });
});

describe("live normalization", () => {
  test("a reference inserted into a definition is removed", () => {
    const editor = createEditor([
      para("p", [text("a")]),
      def("d", "x", "text"),
    ] as unknown as EditorValue);

    editor.tf.insertNodes(footnoteReferenceNode("y", "r-new"), { at: [1, 1] });

    expect(refsOf(editor)).toHaveLength(0);
    expect(defsOf(editor)).toHaveLength(1);
  });

  test("a definition moved into a column becomes a paragraph that keeps its text", () => {
    const editor = createEditor([
      {
        type: KEYS.columnGroup,
        id: "cg",
        children: [
          { type: KEYS.column, id: "c1", width: "50%", children: [para("c1p", [text("left")])] },
          { type: KEYS.column, id: "c2", width: "50%", children: [para("c2p", [text("right")])] },
        ],
      },
      def("d", "x", "moved"),
    ] as unknown as EditorValue);

    editor.tf.moveNodes({ at: [1], to: [0, 0, 1] });

    expect(defsOf(editor)).toHaveLength(0);
    expect(JSON.stringify(editor.children)).toContain("moved");
    expect(editor.children).toHaveLength(1);
  });

  test("a definition moved into a toggle body becomes a paragraph", () => {
    const editor = createEditor([
      toggle("t", "label", [para("tp", [text("body")])]),
      def("d", "x", "moved"),
    ] as unknown as EditorValue);

    editor.tf.moveNodes({ at: [1], to: [0, 2] });

    expect(defsOf(editor)).toHaveLength(0);
    expect(JSON.stringify(editor.children)).toContain("moved");
  });

  test("inserting the same definition three times gives three definitions with three ids", () => {
    const editor = createEditor([para("p", [text("start")])] as unknown as EditorValue);
    const node = footnoteDefinitionNode("same", "d-copy");

    for (let index = 0; index < 3; index += 1) {
      editor.tf.insertNodes(
        { ...node, id: `d-copy-${index}`, children: [{ text: "copied" }] } as TElement,
        { at: [editor.children.length] },
      );
    }

    const defs = defsOf(editor);
    expect(defs).toHaveLength(3);
    expect(new Set(defs.map((item) => item.id)).size).toBe(3);
    expect(new Set(defs.map((item) => item.footnoteId)).size).toBe(3);
    expect(texts(editor).filter((line) => line === "copied")).toHaveLength(3);
  });
});

describe("block menu allow lists", () => {
  test("a definition is neither a turn-into source nor a target", () => {
    const editor = createEditor([
      para("p", [text("a")]),
      def("d", "x", "text"),
    ] as unknown as EditorValue);
    const view = menuBlockView(editor, [1]);

    expect(view).not.toBeNull();
    expect(view && blockMenuDecisions(view)).toBeNull();
    expect(applyBlockTurn(editor, [1], "h1")).toBe(false);
    expect(defsOf(editor)).toHaveLength(1);
  });

  test("a paragraph with a reference cannot turn into code", () => {
    const editor = createEditor([
      para("p", [text("a "), ref("r", "x")]),
      def("d", "x", "t"),
    ] as unknown as EditorValue);
    const view = menuBlockView(editor, [0]);

    const decision = view && blockMenuDecisions(view)?.find((item) => item.kind === "code");
    expect(decision?.allowed).toBe(false);
  });
});
