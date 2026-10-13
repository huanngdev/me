import { describe, expect, test } from "bun:test";
import { KEYS, type TElement } from "platejs";

import { createFootnoteId, isFootnoteId } from "../lib/features/editor-footnote-id";
import { BLOCK_INDENT_TYPES } from "../lib/features/editor-block-indent-style";
import { BLOCK_TONE_TYPES } from "../lib/features/editor-block-tone-style";
import { footnoteIndex, footnoteNumber } from "../lib/features/editor-footnote";
import { FOOTNOTE_DEF_KEY, FOOTNOTE_REF_KEY } from "../lib/document/editor-document-schema";
import type { EditorValue } from "../lib/document/editor-value";
import { serializeEditorDocument } from "../lib/document/editor-document";
import { parseEditorDocument } from "../lib/document/editor-document-validate";
import { createEditor, expectOk, expectUnsupported } from "./test-utils";
import {
  def,
  nodesOfType,
  para,
  parse,
  ref,
  repairMessages,
  table,
  text,
  toggle,
  allText,
} from "./footnote-fixtures";

describe("footnote schema", () => {
  test("a reference is accepted in every inline-capable parent", () => {
    const value = [
      para("p", [text("a "), ref("r1", "a"), text(" b")]),
      { type: KEYS.h1, id: "h", children: [ref("r2", "b")] },
      {
        type: KEYS.p,
        id: "li",
        listStyleType: "disc",
        indent: 1,
        children: [ref("r3", "c")],
      },
      { type: KEYS.blockquote, id: "q", children: [para("qp", [ref("r4", "d")])] },
      {
        type: KEYS.callout,
        id: "c",
        variant: "info",
        icon: "lightbulb",
        children: [para("cp", [ref("r5", "e")])],
      },
      toggle("t", "label", [para("tp", [ref("r6", "f")])]),
      {
        type: KEYS.columnGroup,
        id: "cg",
        children: [
          { type: KEYS.column, id: "c1", width: "50%", children: [para("c1p", [ref("r7", "g")])] },
          { type: KEYS.column, id: "c2", width: "50%", children: [para("c2p", [text("x")])] },
        ],
      },
      table("tb", [[para("cell", [ref("r8", "h")])]]),
    ] as unknown as EditorValue;
    expectOk(parse(value));
  });

  test("a reference inside a code line is unsupported", () => {
    const value = [
      {
        type: KEYS.codeBlock,
        id: "cb",
        children: [{ type: KEYS.codeLine, id: "cl", children: [text("x "), ref("r1", "a")] }],
      },
    ] as unknown as EditorValue;
    expectUnsupported(parse(value));
  });

  test("a reference inside a link is unsupported", () => {
    const value = [
      para("p", [
        {
          type: KEYS.link,
          id: "l",
          url: "https://example.com",
          children: [text("link "), ref("r1", "a")],
        },
      ]),
    ] as unknown as EditorValue;
    expectUnsupported(parse(value));
  });

  test("a reference with a missing or invalid footnoteId is unsupported", () => {
    for (const footnoteId of [undefined, "", "bad id!", "a".repeat(65), 7]) {
      const node = { type: FOOTNOTE_REF_KEY, id: "r", children: [{ text: "" }] } as Record<
        string,
        unknown
      >;
      if (footnoteId !== undefined) {
        node.footnoteId = footnoteId;
      }
      expectUnsupported(parse([para("p", [text("a"), node])] as unknown as EditorValue));
    }
  });

  test("a top-level definition is accepted and its id is a footnote id", () => {
    expectOk(parse([para("p", [text("a")]), def("d", "note-1", "text")] as unknown as EditorValue));
    expect(isFootnoteId("note-1")).toBe(true);
    expect(isFootnoteId("")).toBe(false);
    expect(isFootnoteId("a".repeat(65))).toBe(false);
    expect(isFootnoteId("has space")).toBe(false);
  });

  test("a definition with tone, indent or alignment is unsupported", () => {
    for (const attr of [
      { align: "center" },
      { textTone: "red" },
      { backgroundTone: "blue" },
      { indent: 2 },
    ]) {
      const node = { ...(def("d", "a", "x") as Record<string, unknown>), ...attr };
      expectUnsupported(parse([para("p", [text("a")]), node] as unknown as EditorValue));
    }
  });

  test("a definition inside a container becomes a paragraph and the repair is reported", () => {
    const containers: unknown[] = [
      { type: KEYS.blockquote, id: "q", children: [def("d", "a", "inside")] },
      {
        type: KEYS.callout,
        id: "c",
        variant: "info",
        icon: "lightbulb",
        children: [def("d", "a", "inside")],
      },
      toggle("t", "label", [def("d", "a", "inside")]),
      table("tb", [[def("d", "a", "inside")]]),
      {
        type: KEYS.columnGroup,
        id: "cg",
        children: [
          { type: KEYS.column, id: "c1", width: "50%", children: [def("d", "a", "inside")] },
          { type: KEYS.column, id: "c2", width: "50%", children: [para("p2", [text("x")])] },
        ],
      },
    ];
    for (const container of containers) {
      const result = expectOk(parse([container] as unknown as EditorValue));
      expect(nodesOfType(result.document.content, FOOTNOTE_DEF_KEY)).toHaveLength(0);
      expect(JSON.stringify(result.document.content)).toContain("inside");
      expect(
        result.repairs.some((repair) => repair.message.includes("was turned into a paragraph")),
      ).toBe(true);
    }
  });

  test("a definition with an invalid or missing footnoteId becomes a paragraph with its children", () => {
    for (const footnoteId of ["bad id!", undefined]) {
      const node = { type: FOOTNOTE_DEF_KEY, id: "d", children: [{ text: "keep me" }] } as Record<
        string,
        unknown
      >;
      if (footnoteId !== undefined) {
        node.footnoteId = footnoteId;
      }
      const result = expectOk(parse([node] as unknown as EditorValue));
      expect(result.document.content[0]).toEqual({
        type: KEYS.p,
        id: "d",
        children: [{ text: "keep me" }],
      });
      expect(result.repairs.some((repair) => repair.message.includes("invalid footnote id"))).toBe(
        true,
      );
    }
  });

  test("a reference inside a definition is removed and reported", () => {
    const result = expectOk(
      parse([
        {
          type: FOOTNOTE_DEF_KEY,
          id: "d",
          footnoteId: "a",
          children: [text("x "), ref("r", "b"), text(" y")],
        },
      ] as unknown as EditorValue),
    );
    expect(nodesOfType(result.document.content, FOOTNOTE_REF_KEY)).toHaveLength(0);
    expect(allText(result.document.content)).toBe("x  y");
    expect(result.repairs.some((repair) => repair.message.includes("was removed"))).toBe(true);
  });

  test("the first definition keeps an id, and a later duplicate gets a fresh one", () => {
    const result = expectOk(
      parse([
        def("d1", "same", "first"),
        para("p", [text("between")]),
        def("d2", "same", "second"),
      ] as unknown as EditorValue),
    );
    const [first, , second] = result.document.content as TElement[];
    expect(first?.footnoteId).toBe("same");
    expect(second?.type).toBe(FOOTNOTE_DEF_KEY);
    expect(second?.footnoteId).not.toBe("same");
    expect(isFootnoteId(second?.footnoteId)).toBe(true);
    expect(JSON.stringify(result.document.content)).toContain("second");
    expect(result.repairs.some((repair) => repair.message.includes("reused"))).toBe(true);
  });

  test("an orphan definition and a reference to a missing definition are both valid", () => {
    const result = expectOk(
      parse([
        def("d", "orphan", "nobody cites me"),
        para("p", [text("see "), ref("r", "missing")]),
      ] as unknown as EditorValue),
    );
    expect(result.repairs).toHaveLength(0);
  });

  test("valid documents with refs, defs, an orphan and a missing def round trip unchanged", () => {
    const value = [
      para("p", [text("one "), ref("r1", "a"), text(" two "), ref("r2", "b")]),
      def("d-a", "a", "alpha"),
      def("d-orphan", "orphan", "unused"),
    ] as unknown as EditorValue;
    const first = expectOk(parse(value));
    expect(first.repairs).toHaveLength(0);

    const again = expectOk(
      parseEditorDocument(JSON.parse(serializeEditorDocument(first.document))),
    );
    expect(again.repairs).toHaveLength(0);
    expect(again.document.content).toEqual(first.document.content);
    // The validator adds the empty leaf Slate needs after a trailing reference.
    expect(again.document.content).toEqual([
      { ...value[0], children: [...value[0].children, { text: "" }] },
      value[1],
      value[2],
    ]);
  });

  test("repairs are reported in the parse result, not silently applied", () => {
    const messages = repairMessages(
      parse([
        para("p", [text("a")]),
        {
          type: KEYS.blockquote,
          id: "q",
          children: [def("d", "a", "text")],
        },
      ] as unknown as EditorValue),
    );
    expect(messages.length).toBeGreaterThan(0);
  });
});

describe("footnote numbering", () => {
  test("numbers follow the first reference of each id in document order", () => {
    const editor = createEditor([
      para("p1", [text("x "), ref("r1", "b")]),
      para("p2", [text("y "), ref("r2", "a")]),
      para("p3", [text("z "), ref("r3", "b")]),
    ] as unknown as EditorValue);

    expect(footnoteNumber(editor, "b")).toBe(1);
    expect(footnoteNumber(editor, "a")).toBe(2);
    expect(footnoteIndex(editor).refCounts.get("b")).toBe(2);
    expect(footnoteNumber(editor, "missing")).toBeUndefined();
  });

  test("moving a block with a reference above another swaps the numbers", () => {
    const editor = createEditor([
      para("p1", [text("first "), ref("r1", "a")]),
      para("p2", [text("second "), ref("r2", "b")]),
    ] as unknown as EditorValue);
    expect(footnoteNumber(editor, "a")).toBe(1);

    editor.tf.moveNodes({ at: [1], to: [0] });

    expect(footnoteNumber(editor, "b")).toBe(1);
    expect(footnoteNumber(editor, "a")).toBe(2);
  });

  test("deleting a reference shifts the later numbers down", () => {
    const editor = createEditor([
      para("p1", [text("first "), ref("r1", "a")]),
      para("p2", [text("second "), ref("r2", "b")]),
    ] as unknown as EditorValue);

    editor.tf.removeNodes({ at: [0, 1], voids: true });

    expect(footnoteNumber(editor, "a")).toBeUndefined();
    expect(footnoteNumber(editor, "b")).toBe(1);
  });

  test("duplicating a paragraph with a reference shares its number and counts two", () => {
    const editor = createEditor([
      para("p1", [text("x "), ref("r1", "a")]),
    ] as unknown as EditorValue);
    editor.tf.insertNodes(
      { type: KEYS.p, id: "copy", children: [text("x "), ref("r2", "a")] } as unknown as TElement,
      { at: [1] },
    );

    expect(footnoteNumber(editor, "a")).toBe(1);
    expect(footnoteIndex(editor).refCounts.get("a")).toBe(2);
  });

  test("references inside a table and a collapsed toggle count in document order", () => {
    const editor = createEditor([
      para("p", [text("a "), ref("r1", "one")]),
      table("tb", [[para("cell", [text("b "), ref("r2", "two")])]]),
      toggle("t", "label", [para("tp", [ref("r3", "three")])]),
    ] as unknown as EditorValue);

    expect(footnoteNumber(editor, "one")).toBe(1);
    expect(footnoteNumber(editor, "two")).toBe(2);
    expect(footnoteNumber(editor, "three")).toBe(3);
  });

  test("a definition with no reference has no number", () => {
    const editor = createEditor([
      def("d", "orphan", "text"),
      para("p", [text("see "), ref("r", "cited")]),
    ] as unknown as EditorValue);

    expect(footnoteNumber(editor, "orphan")).toBeUndefined();
    expect(footnoteNumber(editor, "cited")).toBe(1);
  });
});

describe("footnote allow lists", () => {
  test("a definition is not a tone or indent target", () => {
    expect(BLOCK_TONE_TYPES).not.toContain(FOOTNOTE_DEF_KEY);
    expect(BLOCK_INDENT_TYPES).not.toContain(FOOTNOTE_DEF_KEY);
    expect(BLOCK_TONE_TYPES).not.toContain(FOOTNOTE_REF_KEY);
  });

  test("generated footnote ids pass the id check and do not repeat", () => {
    const ids = new Set(Array.from({ length: 50 }, () => createFootnoteId()));
    expect(ids.size).toBe(50);
    for (const id of ids) {
      expect(isFootnoteId(id)).toBe(true);
    }
  });
});
