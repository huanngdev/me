import { describe, expect, test } from "bun:test";
import { ElementApi, KEYS, type SlateEditor, type TElement } from "platejs";

import { runEditorCommand } from "../lib/commands/editor-commands";
import { createEditorDocument } from "../lib/document/editor-document";
import { parseEditorDocument } from "../lib/document/editor-document-validate";
import type { EditorValue } from "../lib/document/editor-value";
import {
  FIND_MATCH_MAX,
  FIND_QUERY_MAX,
  findMatches,
  normalizeFindQuery,
  type FindMatch,
} from "../lib/features/editor-find";
import { replaceAllFindMatches, replaceFindMatch } from "../lib/features/editor-find-replace";
import { readToggleOpenIds } from "../lib/plugins/editor-toggle";
import {
  closeFind,
  findActiveMatch,
  findNext,
  findPlugin,
  findPrevious,
  findState,
  openFind,
  revealFindMatch,
  setFindMatchCase,
  setFindQuery,
} from "../lib/plugins/editor-find";
import { caret, createEditor, expectOk } from "./test-utils";

function para(id: string, children: unknown[]): TElement {
  return { type: KEYS.p, id, children } as unknown as TElement;
}

function block(type: string, id: string, children: unknown[]): TElement {
  return { type, id, children } as unknown as TElement;
}

function link(id: string, children: unknown[]): TElement {
  return { type: KEYS.link, id, url: "https://example.com", children } as unknown as TElement;
}

function mention(id: string): unknown {
  return {
    type: KEYS.mention,
    id,
    entityType: "user",
    entityId: "u1",
    label: "Alex",
    children: [{ text: "" }],
  };
}

function dateNode(id: string): unknown {
  return { type: KEYS.date, id, date: "2026-10-12", children: [{ text: "" }] };
}

function editorWith(...blocks: unknown[]): SlateEditor {
  return createEditor(blocks as unknown as EditorValue);
}

function matchesOf(editor: SlateEditor, query: string, matchCase = false): FindMatch[] {
  return findMatches(editor, query, { matchCase }).matches;
}

function matchedText(editor: SlateEditor, match: FindMatch): string {
  return editor.api.string(match);
}

function points(editor: SlateEditor, query: string, matchCase = false): unknown[] {
  return matchesOf(editor, query, matchCase).map((match) => [
    match.anchor.path,
    match.anchor.offset,
    match.focus.path,
    match.focus.offset,
  ]);
}

function structure(editor: SlateEditor): string[] {
  const found: string[] = [];
  const visit = (node: unknown): void => {
    if (typeof node !== "object" || node === null) {
      return;
    }
    if ("type" in node && "id" in node) {
      found.push(`${String(node.type)}#${String(node.id)}`);
    }
    if ("children" in node && Array.isArray(node.children)) {
      node.children.forEach(visit);
    }
  };
  editor.children.forEach(visit);
  return found;
}

function snapshot(editor: SlateEditor): unknown {
  return JSON.parse(JSON.stringify(editor.children));
}

function validates(editor: SlateEditor): void {
  expectOk(
    parseEditorDocument(
      createEditorDocument("document", editor.children as unknown as EditorValue),
    ),
  );
}

describe("normalizeFindQuery", () => {
  test("NFC-normalizes the query", () => {
    expect(normalizeFindQuery("é")).toBe("é");
  });

  test("does not trim, so a query of spaces is valid", () => {
    expect(normalizeFindQuery("  ")).toBe("  ");
    expect(normalizeFindQuery(" a ")).toBe(" a ");
  });

  test("cuts to FIND_QUERY_MAX code units", () => {
    expect(normalizeFindQuery("a".repeat(250))).toBe("a".repeat(FIND_QUERY_MAX));
  });

  test("never leaves half of a surrogate pair at the cut", () => {
    expect(normalizeFindQuery(`${"a".repeat(199)}\u{1F44D}`)).toBe("a".repeat(199));
  });

  test("an empty query stays empty", () => {
    expect(normalizeFindQuery("")).toBe("");
  });
});

describe("findMatches: text rules", () => {
  test("Vietnamese matches case-insensitively and stays diacritic-sensitive", () => {
    const editor = editorWith(para("p1", [{ text: "Tiếng Việt và tieng viet" }]));
    const found = matchesOf(editor, "tiếng việt");
    expect(found).toHaveLength(1);
    expect(matchedText(editor, found[0] as FindMatch)).toBe("Tiếng Việt");
  });

  test("a plain e does not match inside ế or ệ", () => {
    const editor = editorWith(para("p1", [{ text: "ế ệ" }]));
    expect(matchesOf(editor, "e")).toHaveLength(0);
    expect(matchesOf(editor, "ế")).toHaveLength(1);
  });

  test("matchCase true needs the exact case", () => {
    const editor = editorWith(para("p1", [{ text: "Tiếng Việt" }]));
    expect(matchesOf(editor, "tiếng", true)).toHaveLength(0);
    expect(matchesOf(editor, "Tiếng", true)).toHaveLength(1);
  });

  test("an NFD document is matched by an NFC query and the match covers both code units", () => {
    const editor = editorWith(para("p1", [{ text: "é x" }]));
    expect(points(editor, "é")).toEqual([[[0, 0], 0, [0, 0], 2]]);
    expect(matchesOf(editor, "e")).toHaveLength(0);
  });

  test("an NFD query is matched against an NFC document", () => {
    const editor = editorWith(para("p1", [{ text: "é x" }]));
    expect(matchesOf(editor, "é")).toHaveLength(1);
  });

  test("emoji sequences keep exact UTF-16 offsets", () => {
    const editor = editorWith(
      para("p1", [{ text: "\u{1F468}‍\u{1F469}‍\u{1F467} abc \u{1F44D}\u{1F3FD} abc" }]),
    );
    expect(points(editor, "abc")).toEqual([
      [[0, 0], 9, [0, 0], 12],
      [[0, 0], 18, [0, 0], 21],
    ]);
  });

  test("a query of one emoji does not match inside a modified emoji", () => {
    const editor = editorWith(para("p1", [{ text: "\u{1F44D}\u{1F3FD} x" }]));
    expect(matchesOf(editor, "\u{1F44D}")).toHaveLength(0);
    expect(matchesOf(editor, "\u{1F44D}\u{1F3FD}")).toHaveLength(1);
  });

  test("offsets stay right after a character whose lower-case form is longer", () => {
    const editor = editorWith(para("p1", [{ text: "İ x foo" }]));
    expect(points(editor, "foo")).toEqual([[[0, 0], 4, [0, 0], 7]]);
  });

  test("an upper-case query matches a text starting with İ, a plain lower-case query does not", () => {
    const editor = editorWith(para("p1", [{ text: "İstanbul" }]));
    expect(points(editor, "İSTANBUL")).toEqual([[[0, 0], 0, [0, 0], 8]]);
    expect(matchesOf(editor, "istanbul")).toHaveLength(0);
  });

  test("a match spans leaves with different marks", () => {
    const editor = editorWith(
      para("p1", [{ text: "foo" }, { text: "bar", bold: true }, { text: "baz" }]),
    );
    expect(points(editor, "obarb")).toEqual([[[0, 0], 2, [0, 2], 1]]);
  });

  test("a match that starts on a leaf boundary begins at offset 0 of the later leaf", () => {
    const editor = editorWith(
      para("p1", [{ text: "foo" }, { text: "bar", bold: true }, { text: "baz" }]),
    );
    expect(points(editor, "bar")).toEqual([[[0, 1], 0, [0, 1], 3]]);
  });

  test("a match that ends on a leaf boundary ends at the end of the earlier leaf", () => {
    const editor = editorWith(
      para("p1", [{ text: "foo" }, { text: "bar", bold: true }, { text: "baz" }]),
    );
    expect(points(editor, "foobar")).toEqual([[[0, 0], 0, [0, 1], 3]]);
  });

  test("a match crosses from plain text into a link", () => {
    const editor = editorWith(para("p1", [{ text: "see " }, link("l1", [{ text: "link" }])]));
    expect(points(editor, "e link")).toEqual([[[0, 0], 2, [0, 1, 0], 4]]);
  });

  test("a match inside a link is found across the link's own leaves", () => {
    const editor = editorWith(
      para("p1", [link("l1", [{ text: "lin" }, { text: "k", bold: true }])]),
    );
    expect(points(editor, "link")).toEqual([[[0, 0, 0], 0, [0, 0, 1], 1]]);
  });

  test("no match spans a mention, a date or an inline equation", () => {
    const editor = editorWith(para("p1", [{ text: "ab" }, mention("m1"), { text: "cd" }]));
    expect(matchesOf(editor, "abcd")).toHaveLength(0);
    expect(matchesOf(editor, "ab")).toHaveLength(1);
    expect(matchesOf(editor, "cd")).toHaveLength(1);

    const withDate = editorWith(para("p1", [{ text: "x" }, dateNode("d1"), { text: "y" }]));
    expect(matchesOf(withDate, "xy")).toHaveLength(0);
  });

  test("the content of an inline void is never searched", () => {
    const editor = editorWith(
      para("p1", [
        { text: "a" },
        { type: KEYS.inlineEquation, id: "e1", texExpression: "zz", children: [{ text: "zz" }] },
        { text: "b" },
      ]),
    );
    expect(matchesOf(editor, "zz")).toHaveLength(0);
    expect(matchesOf(editor, "ab")).toHaveLength(0);
  });

  test("a match never crosses two blocks", () => {
    const editor = editorWith(para("p1", [{ text: "foo" }]), para("p2", [{ text: "bar" }]));
    expect(matchesOf(editor, "oob")).toHaveLength(0);
    expect(points(editor, "bar")).toEqual([[[1, 0], 0, [1, 0], 3]]);
  });

  test("regex metacharacters are literal characters", () => {
    const editor = editorWith(para("p1", [{ text: "a.c abc" }]));
    expect(matchesOf(editor, ".")).toHaveLength(1);
    expect(matchesOf(editor, "a.c")).toHaveLength(1);
    expect(matchesOf(editor, "a.*")).toHaveLength(0);

    const brackets = editorWith(para("p1", [{ text: "f(x) [a]\\b" }]));
    expect(matchesOf(brackets, "(x)")).toHaveLength(1);
    expect(matchesOf(brackets, "[a]")).toHaveLength(1);
    expect(matchesOf(brackets, "\\b")).toHaveLength(1);
  });

  test("matches do not overlap", () => {
    const editor = editorWith(para("p1", [{ text: "aaa" }]));
    expect(points(editor, "aa")).toEqual([[[0, 0], 0, [0, 0], 2]]);
  });

  test("a query of spaces is valid", () => {
    const editor = editorWith(para("p1", [{ text: "a  b" }]));
    expect(matchesOf(editor, " ")).toHaveLength(2);
    expect(matchesOf(editor, "  ")).toHaveLength(1);
  });

  test("an empty query finds nothing", () => {
    const editor = editorWith(para("p1", [{ text: "foo" }]));
    expect(matchesOf(editor, "")).toHaveLength(0);
  });

  test("a query longer than FIND_QUERY_MAX is cut before matching", () => {
    const editor = editorWith(para("p1", [{ text: "a".repeat(250) }]));
    expect(points(editor, "a".repeat(250))).toEqual([[[0, 0], 0, [0, 0], FIND_QUERY_MAX]]);
  });

  test("stops at FIND_MATCH_MAX and reports truncated", () => {
    const more = editorWith(para("p1", [{ text: "a".repeat(FIND_MATCH_MAX + 1) }]));
    const result = findMatches(more, "a", { matchCase: false });
    expect(result.matches).toHaveLength(FIND_MATCH_MAX);
    expect(result.truncated).toBe(true);

    const exact = editorWith(para("p1", [{ text: "a".repeat(FIND_MATCH_MAX) }]));
    const exactResult = findMatches(exact, "a", { matchCase: false });
    expect(exactResult.matches).toHaveLength(FIND_MATCH_MAX);
    expect(exactResult.truncated).toBe(false);
  });

  test("table cell, list item, code line, toggle label, collapsed toggle content, callout and heading are all searched", () => {
    const editor = editorWith(
      block(KEYS.h2, "h1", [{ text: "needle h2" }]),
      {
        type: KEYS.p,
        id: "li1",
        indent: 1,
        listStyleType: "disc",
        children: [{ text: "needle item" }],
      },
      block("code_block", "cb1", [block("code_line", "cl1", [{ text: "needle code" }])]),
      block("toggle", "t1", [
        para("tl1", [{ text: "needle label" }]),
        para("tc1", [{ text: "needle hidden" }]),
      ]),
      block("callout", "c1", [para("cp1", [{ text: "needle callout" }])]),
      block("table", "tb1", [
        block("tr", "tr1", [block("td", "td1", [para("tdp1", [{ text: "needle cell" }])])]),
      ]),
    );
    const found = matchesOf(editor, "needle");
    const blockTexts = found.map((match) => {
      const entry = editor.api.block({ at: match.anchor });
      return entry === undefined ? undefined : editor.api.string(entry[1]);
    });
    expect(blockTexts).toEqual([
      "needle h2",
      "needle item",
      "needle code",
      "needle label",
      "needle hidden",
      "needle callout",
      "needle cell",
    ]);
  });
});

describe("find state and purity", () => {
  test("findMatches leaves the children reference, the selection and the history unchanged", () => {
    const editor = editorWith(para("p1", [{ text: "foo bar foo" }]));
    editor.tf.select(caret([0, 0], 1));
    const children = editor.children;
    const selection = editor.selection;
    const undos = editor.history.undos.length;

    matchesOf(editor, "foo");

    expect(editor.children).toBe(children);
    expect(editor.selection).toEqual(selection);
    expect(editor.history.undos.length).toBe(undos);
  });

  test("every find state function leaves the document, selection and history unchanged", () => {
    const editor = editorWith(para("p1", [{ text: "foo" }]), para("p2", [{ text: "x foo" }]));
    editor.tf.select(caret([1, 0], 1));
    const children = editor.children;
    const selection = editor.selection;
    const undos = editor.history.undos.length;

    openFind(editor);
    setFindQuery(editor, "foo");
    findNext(editor);
    findPrevious(editor);
    setFindMatchCase(editor, true);
    setFindMatchCase(editor, false);
    findState(editor);
    findActiveMatch(editor);
    revealFindMatch(editor);
    closeFind(editor);

    expect(editor.children).toBe(children);
    expect(editor.selection).toEqual(selection);
    expect(editor.history.undos.length).toBe(undos);
  });

  test("findState starts closed, empty and with no active match", () => {
    const editor = editorWith(para("p1", [{ text: "foo" }]));
    expect(findState(editor)).toEqual({
      open: false,
      query: "",
      matchCase: false,
      count: 0,
      activeIndex: -1,
      truncated: false,
    });
  });

  test("setFindQuery stores the normalized query, and closing keeps it", () => {
    const editor = editorWith(para("p1", [{ text: "café" }]));
    setFindQuery(editor, "café");
    openFind(editor);
    expect(findState(editor).query).toBe("café");
    expect(findState(editor).count).toBe(1);
    closeFind(editor);
    expect(findState(editor)).toMatchObject({ open: false, query: "café", count: 1 });
  });

  test("setFindQuery starts on the first match at or after the selection start", () => {
    const editor = editorWith(
      para("p1", [{ text: "foo one" }]),
      para("p2", [{ text: "foo two" }]),
      para("p3", [{ text: "foo three" }]),
    );

    editor.tf.select(caret([1, 0], 0));
    setFindQuery(editor, "foo");
    expect(findState(editor).activeIndex).toBe(1);

    editor.tf.select(caret([1, 0], 1));
    setFindQuery(editor, "foo");
    expect(findState(editor).activeIndex).toBe(2);

    editor.tf.select(caret([2, 0], 7));
    setFindQuery(editor, "foo");
    expect(findState(editor).activeIndex).toBe(0);

    editor.tf.deselect();
    setFindQuery(editor, "foo");
    expect(findState(editor).activeIndex).toBe(0);
  });

  test("findNext and findPrevious wrap around", () => {
    const editor = editorWith(para("p1", [{ text: "a a a" }]));
    setFindQuery(editor, "a");
    expect(findState(editor).activeIndex).toBe(0);
    findNext(editor);
    expect(findState(editor).activeIndex).toBe(1);
    findNext(editor);
    expect(findState(editor).activeIndex).toBe(2);
    findNext(editor);
    expect(findState(editor).activeIndex).toBe(0);
    findPrevious(editor);
    expect(findState(editor).activeIndex).toBe(2);
  });

  test("findNext and findPrevious do nothing with no matches", () => {
    const editor = editorWith(para("p1", [{ text: "foo" }]));
    setFindQuery(editor, "zzz");
    findNext(editor);
    findPrevious(editor);
    expect(findState(editor)).toMatchObject({ count: 0, activeIndex: -1 });
    expect(findActiveMatch(editor)).toBeUndefined();
  });

  test("findState reads the engine's own index, so a raw option write does not move the active match", () => {
    const editor = editorWith(para("p1", [{ text: "a a a" }]));
    setFindQuery(editor, "a");
    editor.setOption(findPlugin, "activeIndex", 99);
    expect(findState(editor).activeIndex).toBe(0);
  });

  test("reading the find state after an edit writes no plugin option", () => {
    const editor = editorWith(para("p1", [{ text: "a a a" }]));
    setFindQuery(editor, "a");
    findNext(editor);
    editor.tf.insertText("b", { at: { path: [0, 0], offset: 0 } });

    expect(findState(editor)).toMatchObject({ count: 3, activeIndex: 1 });
    expect(editor.getOption(findPlugin, "activeIndex")).toBe(1);
    editor.setOption(findPlugin, "activeIndex", 0);
    expect(findState(editor).activeIndex).toBe(1);
    expect(editor.getOption(findPlugin, "activeIndex")).toBe(0);
  });

  test("findActiveMatch returns the match at the active index", () => {
    const editor = editorWith(para("p1", [{ text: "a a a" }]));
    setFindQuery(editor, "a");
    findNext(editor);
    expect(findActiveMatch(editor)).toEqual(matchesOf(editor, "a")[1]);
  });

  test("the active match stays in place when text is typed before it", () => {
    const editor = editorWith(
      para("p1", [{ text: "foo" }]),
      para("p2", [{ text: "foo" }]),
      para("p3", [{ text: "foo" }]),
    );
    setFindQuery(editor, "foo");
    findNext(editor);
    expect(findState(editor).activeIndex).toBe(1);

    editor.tf.insertText("xx", { at: { path: [0, 0], offset: 0 } });

    expect(findState(editor)).toMatchObject({ count: 3, activeIndex: 1 });
    expect(findActiveMatch(editor)?.anchor).toEqual({ path: [1, 0], offset: 0 });
  });

  test("deleting the active text makes the next match active", () => {
    const editor = editorWith(
      para("p1", [{ text: "foo" }]),
      para("p2", [{ text: "foo" }]),
      para("p3", [{ text: "foo" }]),
    );
    setFindQuery(editor, "foo");
    findNext(editor);

    editor.tf.delete({
      at: { anchor: { path: [1, 0], offset: 0 }, focus: { path: [1, 0], offset: 3 } },
    });

    expect(findState(editor)).toMatchObject({ count: 2, activeIndex: 1 });
    expect(findActiveMatch(editor)?.anchor).toEqual({ path: [2, 0], offset: 0 });
  });

  test("revealFindMatch opens a collapsed toggle and a nested one without a history entry", () => {
    const editor = editorWith(
      block("toggle", "t1", [
        para("t1l", [{ text: "outer" }]),
        block("toggle", "t2", [
          para("t2l", [{ text: "inner" }]),
          para("t2c", [{ text: "needle" }]),
        ]),
      ]),
    );
    setFindQuery(editor, "needle");
    const children = editor.children;
    const selection = editor.selection;
    const undos = editor.history.undos.length;

    revealFindMatch(editor);

    expect([...readToggleOpenIds(editor)].sort()).toEqual(["t1", "t2"]);
    expect(editor.history.undos.length).toBe(undos);
    expect(editor.children).toBe(children);
    expect(editor.selection).toEqual(selection);
  });
});

describe("find and replace commands", () => {
  test("replacing the current match with plain text keeps the marks of the rest", () => {
    const editor = editorWith(para("p1", [{ text: "foo bar foo" }]));
    setFindQuery(editor, "foo");
    expect(runEditorCommand(editor, replaceFindMatch, { replacement: "X" })).toBe(true);

    expect(editor.children).toEqual([para("p1", [{ text: "X bar foo" }])]);
    expect(findState(editor)).toMatchObject({ count: 1, activeIndex: 0 });
  });

  test("a match that starts in bold takes the replacement into bold", () => {
    const editor = editorWith(
      para("p1", [{ text: "a " }, { text: "foo", bold: true }, { text: " z" }]),
    );
    setFindQuery(editor, "foo");
    runEditorCommand(editor, replaceFindMatch, { replacement: "X" });

    expect(editor.children).toEqual([
      para("p1", [{ text: "a " }, { text: "X", bold: true }, { text: " z" }]),
    ]);
  });

  test("a match that starts before bold and ends in it puts the replacement before the bold text", () => {
    const editor = editorWith(
      para("p1", [{ text: "ab" }, { text: "cd", bold: true }, { text: "ef" }]),
    );
    setFindQuery(editor, "bcd");
    runEditorCommand(editor, replaceFindMatch, { replacement: "X" });

    // The bold leaf is gone and the two unmarked neighbours merge.
    expect(editor.children).toEqual([para("p1", [{ text: "aXef" }])]);
  });

  test("a match that starts in a link keeps the replacement inside the link", () => {
    const editor = editorWith(
      para("p1", [{ text: "see " }, link("l1", [{ text: "link text" }]), { text: " end" }]),
    );
    setFindQuery(editor, "link");
    runEditorCommand(editor, replaceFindMatch, { replacement: "X" });

    expect(editor.children).toEqual([
      para("p1", [{ text: "see " }, link("l1", [{ text: "X text" }]), { text: " end" }]),
    ]);
  });

  test("a match that ends in a link puts the replacement before the link and keeps the rest linked", () => {
    const editor = editorWith(para("p1", [{ text: "abc " }, link("l1", [{ text: "xyz" }])]));
    setFindQuery(editor, "c xy");
    runEditorCommand(editor, replaceFindMatch, { replacement: "Q" });

    // Slate keeps an empty text node after an inline element that ends a block.
    expect(editor.children).toEqual([
      para("p1", [{ text: "abQ" }, link("l1", [{ text: "z" }]), { text: "" }]),
    ]);
  });

  test("a match that starts in a link and ends after it keeps the replacement in the link", () => {
    const editor = editorWith(para("p1", [link("l1", [{ text: "ab cd" }]), { text: " ef" }]));
    setFindQuery(editor, "cd e");
    runEditorCommand(editor, replaceFindMatch, { replacement: "Q" });

    expect(editor.children).toEqual([
      para("p1", [{ text: "" }, link("l1", [{ text: "ab Q" }]), { text: "f" }]),
    ]);
  });

  test("the active match after a replace is the next one after the replaced text, wrapping at the end", () => {
    const editor = editorWith(para("p1", [{ text: "foo foo foo" }]));
    setFindQuery(editor, "foo");
    findNext(editor);

    runEditorCommand(editor, replaceFindMatch, { replacement: "X" });
    expect(editor.children).toEqual([para("p1", [{ text: "foo X foo" }])]);
    expect(findState(editor)).toMatchObject({ count: 2, activeIndex: 1 });

    runEditorCommand(editor, replaceFindMatch, { replacement: "X" });
    expect(editor.children).toEqual([para("p1", [{ text: "foo X X" }])]);
    expect(findState(editor)).toMatchObject({ count: 1, activeIndex: 0 });
  });

  test("one undo restores the document exactly after a single replace", () => {
    const editor = editorWith(
      para("p1", [{ text: "ab" }, { text: "cd", bold: true }, { text: "ef" }]),
    );
    const before = snapshot(editor);
    setFindQuery(editor, "bcd");
    runEditorCommand(editor, replaceFindMatch, { replacement: "X" });

    editor.tf.undo();

    expect(snapshot(editor)).toEqual(before);
  });

  test("a replace keeps the selection where it was and does not select the replaced text", () => {
    const editor = editorWith(para("p1", [{ text: "foo bar foo" }]));
    setFindQuery(editor, "foo");
    findNext(editor);
    editor.tf.select(caret([0, 0], 1));

    runEditorCommand(editor, replaceFindMatch, { replacement: "X" });

    expect(editor.children).toEqual([para("p1", [{ text: "foo bar X" }])]);
    expect(editor.selection).toEqual(caret([0, 0], 1));
  });

  test("no active match means the replace does nothing", () => {
    const editor = editorWith(para("p1", [{ text: "foo" }]));
    setFindQuery(editor, "zzz");
    const children = editor.children;

    expect(runEditorCommand(editor, replaceFindMatch, { replacement: "X" })).toBe(false);
    expect(editor.children).toBe(children);
  });

  test("replace all across three block types, including a table cell, is one undo step", () => {
    const editor = editorWith(
      para("p1", [{ text: "foo one" }]),
      block(KEYS.h2, "h2", [{ text: "two foo" }]),
      block("table", "tb", [
        block("tr", "tr", [block("td", "td", [para("tdp", [{ text: "foo three" }])])]),
      ]),
      para("tail", [{ text: "end" }]),
    );
    const before = snapshot(editor);
    const shape = structure(editor);
    setFindQuery(editor, "foo");

    expect(runEditorCommand(editor, replaceAllFindMatches, { replacement: "bar" })).toBe(true);

    const after = [
      para("p1", [{ text: "bar one" }]),
      block(KEYS.h2, "h2", [{ text: "two bar" }]),
      block("table", "tb", [
        block("tr", "tr", [block("td", "td", [para("tdp", [{ text: "bar three" }])])]),
      ]),
      para("tail", [{ text: "end" }]),
    ];
    expect(editor.children).toEqual(after as unknown as typeof editor.children);
    expect(structure(editor)).toEqual(shape);
    validates(editor);

    const replaced = snapshot(editor);
    editor.tf.undo();
    expect(snapshot(editor)).toEqual(before);
    editor.tf.redo();
    expect(snapshot(editor)).toEqual(replaced);
  });

  test("replace all replaces each original match once even when the replacement contains the query", () => {
    const editor = editorWith(para("p1", [{ text: "a a a" }]));
    setFindQuery(editor, "a");

    runEditorCommand(editor, replaceAllFindMatches, { replacement: "aa" });

    expect(editor.children).toEqual([para("p1", [{ text: "aa aa aa" }])]);
  });

  test("replace all turns newlines into one space each", () => {
    const editor = editorWith(para("p1", [{ text: "foo bar" }]));
    setFindQuery(editor, "bar");

    runEditorCommand(editor, replaceAllFindMatches, { replacement: "x\r\ny\nz\rw" });

    expect(editor.children).toEqual([para("p1", [{ text: "foo x y z w" }])]);
  });

  test("an empty replacement deletes every match", () => {
    const editor = editorWith(para("p1", [{ text: "foo bar foo" }]));
    setFindQuery(editor, "foo");

    runEditorCommand(editor, replaceAllFindMatches, { replacement: "" });

    expect(editor.children).toEqual([para("p1", [{ text: " bar " }])]);
  });

  test("a replacement is cut to 1000 code units", () => {
    const editor = editorWith(para("p1", [{ text: "a" }]));
    setFindQuery(editor, "a");

    runEditorCommand(editor, replaceAllFindMatches, { replacement: "b".repeat(1500) });

    expect(editor.children).toEqual([para("p1", [{ text: "b".repeat(1000) }])]);
  });

  test("replace all removes a match that spans a link and leaves no empty link behind", () => {
    const editor = editorWith(
      para("p1", [{ text: "x " }, link("l1", [{ text: "abc" }]), { text: " y" }]),
    );
    setFindQuery(editor, "abc");

    runEditorCommand(editor, replaceAllFindMatches, { replacement: "" });

    const linkTexts = Array.from(
      editor.api.nodes({
        at: [],
        match: (node) => ElementApi.isElement(node) && node.type === KEYS.link,
      }),
    ).map(([, path]) => editor.api.string(path));
    expect(linkTexts.every((text) => text.length > 0)).toBe(true);
    validates(editor);
  });

  test("replace all does nothing when the find list is truncated", () => {
    const editor = editorWith(para("p1", [{ text: "a".repeat(FIND_MATCH_MAX + 1) }]));
    setFindQuery(editor, "a");
    const children = editor.children;

    expect(runEditorCommand(editor, replaceAllFindMatches, { replacement: "b" })).toBe(false);
    expect(editor.children).toBe(children);
    expect(findState(editor).truncated).toBe(true);
  });

  test("the replace commands change nothing in a read-only editor, and find still works", () => {
    const editor = editorWith(para("p1", [{ text: "foo" }]));
    editor.dom.readOnly = true;
    setFindQuery(editor, "foo");
    const children = editor.children;

    expect(matchesOf(editor, "foo")).toHaveLength(1);
    expect(runEditorCommand(editor, replaceFindMatch, { replacement: "X" })).toBe(false);
    expect(runEditorCommand(editor, replaceAllFindMatches, { replacement: "X" })).toBe(false);
    expect(editor.children).toBe(children);
    expect(findState(editor)).toMatchObject({ count: 1, activeIndex: 0 });
  });
});
