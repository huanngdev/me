import { describe, expect, test } from "bun:test";
import { ElementApi, KEYS, type Descendant, type SlateEditor, type TElement } from "platejs";

import { createEditorDocument } from "../lib/document/editor-document";
import { parseEditorDocument } from "../lib/document/editor-document-validate";
import type { EditorValue } from "../lib/document/editor-value";
import {
  adjacentBlockId,
  applySelectionMarks,
  blockRun,
  caretLanding,
  isSideMarginPoint,
  marqueeBlockIds,
  normalizeBlockIds,
  stripPreviewChrome,
} from "../lib/features/editor-block-selection";
import { blockDropDecision } from "../lib/features/editor-block-drop";
import {
  blockSelectionIds,
  clearBlockSelection,
  deleteSelectedBlocks,
  duplicateSelectedBlocks,
  moveSelectedBlocks,
  onBlockSelectionCopy,
  onBlockSelectionCut,
  onBlockSelectionEnterKeyDown,
  onBlockSelectionKeyDown,
  readLiveSelection,
  setBlockSelection,
  writeBlockFragment,
} from "../lib/plugins/editor-block-selection";
import { slashUiPlugin } from "../lib/plugins/editor-slash";
import { blockIds, caret, createEditor, expectOk } from "./test-utils";

function paragraph(id: string, text: string, attrs?: Record<string, string | number>): TElement {
  return { type: KEYS.p, id, ...attrs, children: [{ text }] };
}

function key(partial: Partial<KeyboardEvent> & { key: string }): KeyboardEvent {
  let prevented = false;
  const event = {
    key: partial.key,
    code: partial.code,
    metaKey: partial.metaKey ?? false,
    ctrlKey: partial.ctrlKey ?? false,
    altKey: partial.altKey ?? false,
    shiftKey: partial.shiftKey ?? false,
    get defaultPrevented() {
      return prevented;
    },
    preventDefault() {
      prevented = true;
    },
  };
  return event as KeyboardEvent;
}

function press(editor: SlateEditor, event: KeyboardEvent): boolean {
  return onBlockSelectionKeyDown(editor, event) || onBlockSelectionEnterKeyDown(editor, event);
}

function idsDeep(nodes: readonly Descendant[]): string[] {
  const found: string[] = [];
  const visit = (node: Descendant): void => {
    if (!ElementApi.isElement(node)) {
      return;
    }
    if (typeof node.id === "string") {
      found.push(node.id);
    }
    for (const child of node.children) {
      visit(child);
    }
  };
  for (const node of nodes) {
    visit(node);
  }
  return found;
}

function saved(editor: SlateEditor): void {
  expectOk(parseEditorDocument(createEditorDocument("doc", editor.children as EditorValue)));
}

describe("block selection normalization", () => {
  test("collapses mixed levels to one sibling run and prefers the ancestor", () => {
    const editor = createEditor([
      paragraph("a", "A"),
      {
        type: KEYS.blockquote,
        id: "quote",
        children: [paragraph("q1", "One"), paragraph("q2", "Two")],
      },
      paragraph("b", "B"),
    ] as EditorValue);
    expect(normalizeBlockIds(editor, ["q2", "b"])).toEqual(["quote", "b"]);
    expect(normalizeBlockIds(editor, ["quote", "q1"])).toEqual(["quote"]);
    expect(normalizeBlockIds(editor, ["a", "b"])).toEqual(["a", "quote", "b"]);
  });

  test("a list item unit includes its nested items once", () => {
    const editor = createEditor([
      paragraph("item", "Item", { listStyleType: "disc", indent: 1 }),
      paragraph("nested", "Nested", { listStyleType: "disc", indent: 2 }),
      paragraph("next", "Next", { listStyleType: "disc", indent: 1 }),
    ] as EditorValue);
    expect(normalizeBlockIds(editor, ["item", "nested"])).toEqual(["item"]);
    expect(normalizeBlockIds(editor, ["nested"])).toEqual(["nested"]);
    const run = blockRun(editor, ["item"]);
    expect(run?.start).toBe(0);
    expect(run?.end).toBe(2);
  });

  test("the first row of a quote, callout or toggle targets the container", () => {
    const editor = createEditor([
      {
        type: KEYS.callout,
        id: "callout",
        children: [paragraph("c1", "Call"), paragraph("c2", "Out")],
      },
      {
        type: KEYS.toggle,
        id: "toggle",
        children: [paragraph("label", "Label"), paragraph("body", "Body")],
      },
    ] as EditorValue);
    expect(normalizeBlockIds(editor, ["c1"])).toEqual(["callout"]);
    expect(normalizeBlockIds(editor, ["label"])).toEqual(["toggle"]);
    expect(normalizeBlockIds(editor, ["body"])).toEqual(["body"]);
  });

  test("marquee keeps blocks whose vertical extent intersects the rectangle", () => {
    expect(
      marqueeBlockIds(
        [
          { id: "a", top: 0, bottom: 20 },
          { id: "b", top: 40, bottom: 60 },
          { id: "c", top: 80, bottom: 100 },
        ],
        50,
        90,
      ),
    ).toEqual(["b", "c"]);
  });
});

describe("entering and keys", () => {
  test("escape on a collapsed caret selects the block and a second escape restores it", () => {
    const editor = createEditor([paragraph("a", "Alpha"), paragraph("b", "Beta")] as EditorValue);
    editor.tf.select(caret([0, 0], 2));
    expect(press(editor, key({ key: "Escape" }))).toBe(true);
    expect(blockSelectionIds(editor)).toEqual(["a"]);
    expect(editor.selection).toBeNull();
    expect(press(editor, key({ key: "Escape" }))).toBe(true);
    expect(blockSelectionIds(editor)).toEqual([]);
    expect(editor.selection?.anchor).toEqual({ path: [0, 0], offset: 2 });
  });

  test("escape does not select a block while the slash menu would own it or the caret is a range", () => {
    const editor = createEditor([paragraph("a", "Alpha")] as EditorValue);
    editor.tf.select(caret([0, 0], 1));
    editor.setOption(slashUiPlugin, "open", true);
    expect(onBlockSelectionEnterKeyDown(editor, key({ key: "Escape" }))).toBe(false);
    expect(blockSelectionIds(editor)).toEqual([]);
    editor.setOption(slashUiPlugin, "open", false);
    const consumed = key({ key: "Escape" });
    consumed.preventDefault();
    expect(onBlockSelectionEnterKeyDown(editor, consumed)).toBe(false);
    clearBlockSelection(editor, false);
    editor.tf.select({ anchor: { path: [0, 0], offset: 0 }, focus: { path: [0, 0], offset: 2 } });
    expect(onBlockSelectionEnterKeyDown(editor, key({ key: "Escape" }))).toBe(false);
    expect(blockSelectionIds(editor)).toEqual([]);
  });

  test("shift extends and arrows collapse, including across a container boundary", () => {
    const editor = createEditor([
      paragraph("a", "A"),
      {
        type: KEYS.blockquote,
        id: "quote",
        children: [paragraph("q1", "One"), paragraph("q2", "Two")],
      },
      paragraph("b", "B"),
    ] as EditorValue);
    setBlockSelection(editor, ["q2"]);
    press(editor, key({ key: "ArrowDown", shiftKey: true }));
    expect([...blockSelectionIds(editor)]).toEqual(["quote", "b"]);
    press(editor, key({ key: "ArrowUp" }));
    expect([...blockSelectionIds(editor)]).toEqual(["a"]);
    expect(adjacentBlockId(editor, "q2", "down")).toBe("b");
  });

  test("mod+a selects the block text first and every top-level block second", () => {
    const editor = createEditor([
      paragraph("a", "Alpha"),
      {
        type: KEYS.blockquote,
        id: "quote",
        children: [paragraph("q1", ""), paragraph("q2", "Two")],
      },
    ] as EditorValue);
    editor.tf.select(caret([0, 0], 1));
    press(editor, key({ key: "a", metaKey: true }));
    expect(blockSelectionIds(editor)).toEqual([]);
    expect(editor.selection?.anchor.offset).toBe(0);
    expect(editor.selection?.focus.offset).toBe(5);
    press(editor, key({ key: "a", metaKey: true }));
    expect([...blockSelectionIds(editor)]).toEqual(["a", "quote"]);
    clearBlockSelection(editor, false);
    editor.tf.insertNodes(paragraph("empty", ""), { at: [2] });
    editor.tf.select(caret([2, 0], 0));
    press(editor, key({ key: "a", metaKey: true }));
    expect([...blockSelectionIds(editor)]).toEqual(["a", "quote", "empty"]);
  });

  test("printable keys do not change the document", () => {
    const editor = createEditor([paragraph("a", "Alpha")] as EditorValue);
    setBlockSelection(editor, ["a"]);
    press(editor, key({ key: "x" }));
    expect(editor.children[0]).toMatchObject({ children: [{ text: "Alpha" }] });
  });

  test("enter returns the caret to the end of the first selected block", () => {
    const editor = createEditor([paragraph("a", "Alpha"), paragraph("b", "Beta")] as EditorValue);
    setBlockSelection(editor, ["a", "b"]);
    press(editor, key({ key: "Enter" }));
    expect(blockSelectionIds(editor)).toEqual([]);
    expect(editor.selection?.anchor).toEqual({ path: [0, 0], offset: 5 });
  });
});

describe("block selection mutations", () => {
  test("delete places the caret and undoes in one step", () => {
    const editor = createEditor([
      paragraph("a", "A"),
      paragraph("b", "B"),
      paragraph("c", "C"),
      paragraph("d", "D"),
    ] as EditorValue);
    setBlockSelection(editor, ["b", "c"]);
    expect(caretLanding(4, 1, 3, true)).toBe("previous-end");
    deleteSelectedBlocks(editor);
    expect(blockIds(editor)).toEqual(["a", "d"]);
    expect(editor.selection?.anchor).toEqual({ path: [0, 0], offset: 1 });
    editor.tf.undo();
    expect(blockIds(editor)).toEqual(["a", "b", "c", "d"]);
    editor.tf.redo();
    expect(blockIds(editor)).toEqual(["a", "d"]);

    const atStart = createEditor([paragraph("a", "A"), paragraph("b", "B")] as EditorValue);
    setBlockSelection(atStart, ["a"]);
    deleteSelectedBlocks(atStart);
    expect(blockIds(atStart)).toEqual(["b"]);
    expect(atStart.selection?.anchor).toEqual({ path: [0, 0], offset: 0 });

    const whole = createEditor([paragraph("a", "A"), paragraph("b", "B")] as EditorValue);
    setBlockSelection(whole, ["a", "b"]);
    deleteSelectedBlocks(whole);
    expect(blockIds(whole)).not.toEqual(["a", "b"]);
    expect(whole.children).toHaveLength(1);
    saved(whole);
  });

  test("duplicate gives fresh ids at every level and copies a collapsed toggle once", () => {
    const editor = createEditor([
      {
        type: KEYS.toggle,
        id: "toggle",
        children: [paragraph("label", "Label"), paragraph("hidden", "Hidden")],
      },
      paragraph("after", "After"),
    ] as EditorValue);
    setBlockSelection(editor, ["toggle"]);
    const before = idsDeep(editor.children);
    duplicateSelectedBlocks(editor);
    const after = idsDeep(editor.children);
    expect(after.filter((id) => before.includes(id)).sort()).toEqual(before.sort());
    expect(new Set(after).size).toBe(after.length);
    expect(editor.children).toHaveLength(3);
    const copy = editor.children[1];
    expect(copy).toMatchObject({ type: KEYS.toggle });
    if (!ElementApi.isElement(copy)) {
      throw new Error("missing copy");
    }
    expect(copy.children).toHaveLength(2);
    expect([...blockSelectionIds(editor)]).not.toContain("toggle");
    saved(editor);
  });

  test("duplicate keeps a list item with its nested items", () => {
    const editor = createEditor([
      paragraph("item", "Item", { listStyleType: "disc", indent: 1 }),
      paragraph("nested", "Nested", { listStyleType: "disc", indent: 2 }),
      paragraph("tail", "Tail"),
    ] as EditorValue);
    setBlockSelection(editor, ["item"]);
    duplicateSelectedBlocks(editor);
    expect(editor.children).toHaveLength(5);
    expect(blockIds(editor)[2]).not.toBe("item");
    expect(blockIds(editor)[3]).not.toBe("nested");
  });

  test("move stays inside the parent and stops at the edge", () => {
    const editor = createEditor([
      {
        type: KEYS.blockquote,
        id: "quote",
        children: [paragraph("q1", "One"), paragraph("q2", "Two"), paragraph("q3", "Three")],
      },
    ] as EditorValue);
    setBlockSelection(editor, ["q2", "q3"]);
    expect(moveSelectedBlocks(editor, "up")).toBe(true);
    const quote = editor.children[0];
    if (!ElementApi.isElement(quote)) {
      throw new Error("missing quote");
    }
    expect(quote.children.map((node) => (ElementApi.isElement(node) ? node.id : ""))).toEqual([
      "q2",
      "q3",
      "q1",
    ]);
    expect(moveSelectedBlocks(editor, "up")).toBe(false);
    editor.tf.undo();
    if (!ElementApi.isElement(editor.children[0])) {
      throw new Error("missing quote");
    }
    expect(
      editor.children[0].children.map((node) => (ElementApi.isElement(node) ? node.id : "")),
    ).toEqual(["q1", "q2", "q3"]);
  });

  test("copy writes the same fragment as a text selection and cut is one undo", () => {
    const editor = createEditor([
      paragraph("a", "Alpha"),
      paragraph("b", "Beta"),
      paragraph("c", "See"),
    ] as EditorValue);
    editor.tf.select({
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [1, 0], offset: 4 },
    });
    const textSelected = JSON.stringify(editor.api.getFragment());
    editor.tf.select(caret([0, 0], 0));
    setBlockSelection(editor, ["a", "b"]);
    const data = new DataTransfer();
    expect(writeBlockFragment(editor, data)).toBe(true);
    const copied = decodeURIComponent(window.atob(data.getData("application/x-slate-fragment")));
    expect(copied).toBe(textSelected);
    const cutData = new DataTransfer();
    expect(onBlockSelectionCut(editor, { clipboardData: cutData, preventDefault() {} })).toBe(true);
    expect(blockIds(editor)).toEqual(["c"]);
    editor.tf.undo();
    expect(blockIds(editor)).toEqual(["a", "b", "c"]);
    editor.tf.select(caret([2, 0], 3));
    clearBlockSelection(editor, false);
    const beforePaste = new Set(idsDeep(editor.children));
    editor.tf.insertData(cutData);
    const added = idsDeep(editor.children).filter((id) => !beforePaste.has(id));
    expect(added.length).toBeGreaterThan(0);
    expect(JSON.stringify(editor.children)).toContain("Alpha");
    expect(JSON.stringify(editor.children)).toContain("Beta");
    saved(editor);
    void onBlockSelectionCopy;
  });

  test("a removed block is pruned from the selection", () => {
    const editor = createEditor([paragraph("a", "A"), paragraph("b", "B")] as EditorValue);
    setBlockSelection(editor, ["a", "b"]);
    editor.tf.removeNodes({ at: [1] });
    expect([...blockSelectionIds(editor)]).toEqual(["a"]);
    editor.tf.undo();
    expect([...blockSelectionIds(editor)]).toEqual(["a"]);
    setBlockSelection(editor, ["b"]);
    editor.tf.removeNodes({ at: [1] });
    expect(blockSelectionIds(editor)).toEqual([]);
  });

  test("the saved value has no selection data", () => {
    const editor = createEditor([paragraph("a", "Alpha")] as EditorValue);
    setBlockSelection(editor, ["a"]);
    const content = editor.children as EditorValue;
    expect(JSON.stringify(content)).not.toContain("blockSelection");
    saved(editor);
  });

  test("the side margin is outside the content column and inside the frame", () => {
    const column = {
      contentLeft: 289.6,
      contentRight: 989.6,
      contentTop: 140,
      contentBottom: 900,
      inFrame: true,
      onControl: false,
    };
    expect(isSideMarginPoint({ ...column, clientX: 170, clientY: 250 })).toBe(true);
    expect(isSideMarginPoint({ ...column, clientX: 1030, clientY: 250 })).toBe(true);
    expect(isSideMarginPoint({ ...column, clientX: 400, clientY: 250 })).toBe(false);
    expect(isSideMarginPoint({ ...column, clientX: 170, clientY: 250, onControl: true })).toBe(
      false,
    );
  });

  test("escape reads the DOM selection when slate has not stored the click yet", () => {
    const editor = createEditor([paragraph("a", "Alpha"), paragraph("b", "Beta")] as EditorValue);
    editor.tf.deselect();
    Reflect.set(editor.api, "toSlateRange", () => caret([1, 0], 1));
    const host = document.createElement("div");
    host.setAttribute("data-slate-editor", "");
    host.textContent = "Beta";
    document.body.appendChild(host);
    const text = host.firstChild;
    if (!text) {
      throw new Error("missing text");
    }
    const range = document.createRange();
    range.setStart(text, 0);
    range.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    expect(readLiveSelection(editor)?.anchor.path).toEqual([1, 0]);
    expect(press(editor, key({ key: "Escape" }))).toBe(true);
    expect([...blockSelectionIds(editor)]).toEqual(["b"]);
    host.remove();
    selection?.removeAllRanges();
  });

  test("selecting blocks does not scroll unless the caller asks", () => {
    const editor = createEditor([paragraph("a", "Alpha"), paragraph("b", "Beta")] as EditorValue);
    const scrolled: string[] = [];
    const node = document.createElement("div");
    node.scrollIntoView = () => {
      scrolled.push("scroll");
    };
    const original = editor.api.toDOMNode;
    editor.api.toDOMNode = () => node;
    setBlockSelection(editor, ["a", "b"]);
    expect(scrolled).toEqual([]);
    setBlockSelection(editor, ["b"], { scroll: true });
    expect(scrolled).toEqual(["scroll"]);
    editor.api.toDOMNode = original;
  });

  test("markers follow the same ids onto newly rendered blocks", () => {
    const root = document.createElement("div");
    root.setAttribute("data-slate-editor", "");
    root.innerHTML = `<div data-block-id="a"></div><div data-block-id="b"></div>`;
    applySelectionMarks(root, ["a", "b"]);
    expect(root.querySelectorAll("[data-block-selected]").length).toBe(2);
    root.innerHTML = `<div data-block-id="b"></div><div data-block-id="a"></div>`;
    expect(root.querySelector("[data-block-selected]")).toBeNull();
    applySelectionMarks(root, ["a", "b"]);
    expect(root.querySelectorAll("[data-block-selected]").length).toBe(2);
    expect(root.getAttribute("data-block-selection-count")).toBe("2");
  });

  test("a drag preview drops selection tint nodes", () => {
    const block = document.createElement("div");
    block.setAttribute("data-block-id", "a");
    block.setAttribute("data-block-selected", "");
    const tint = document.createElement("div");
    tint.setAttribute("data-block-selection-tint", "");
    tint.style.position = "fixed";
    tint.style.width = "700px";
    block.append(document.createTextNode("Alpha"), tint);
    const copy = block.cloneNode(true) as HTMLElement;
    stripPreviewChrome(copy);
    expect(copy.querySelector("[data-block-selection-tint]")).toBeNull();
    expect(copy.textContent).toBe("Alpha");
  });

  test("a run cannot be dropped inside itself", () => {
    const editor = createEditor([
      paragraph("a", "A"),
      paragraph("b", "B"),
      paragraph("c", "C"),
    ] as EditorValue);
    const refused = blockDropDecision(editor.children, [0], [], 1, [0, 2]);
    expect(refused.allowed).toBe(false);
    const allowed = blockDropDecision(editor.children, [0], [], 3, [0, 2]);
    expect(allowed.allowed).toBe(true);
  });
});
