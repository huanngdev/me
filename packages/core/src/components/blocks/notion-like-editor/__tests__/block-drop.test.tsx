import { describe, expect, test } from "bun:test";
import { ElementApi, KEYS, type Descendant, type SlateEditor, type TElement } from "platejs";
import { createPlateEditor } from "platejs/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { EditorSurface } from "../components/editor/editor-surface";
import { onColumnKeyDown } from "../lib/commands/editor-columns";
import { moveBlock, onBlockMoveKeyDown, runEditorCommand } from "../lib/commands/editor-commands";
import { createEditorDocument } from "../lib/document/editor-document";
import { parseEditorDocument } from "../lib/document/editor-document-validate";
import type { EditorValue } from "../lib/document/editor-value";
import {
  MOVE_ALREADY_FIRST,
  MOVE_ALREADY_LAST,
  blockDropDecision,
  blockMoveDirection,
  dragPastThreshold,
  listItemUnit,
  resolveDropIndicator,
  siblingMove,
  type DropBand,
} from "../lib/features/editor-block-drop";
import { SYNCED_REF_KEY } from "../lib/features/editor-synced-block";
import { createEditorPlugins } from "../lib/plugins/editor-plugins";
import { caret, createEditor, expectOk } from "./test-utils";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

function paragraph(
  id: string,
  text: string,
  attrs?: Record<string, string | number | boolean>,
): TElement {
  return { type: KEYS.p, id, ...attrs, children: [{ text }] };
}

function rich(id: string): TElement {
  return {
    type: KEYS.p,
    id,
    children: [
      { text: "Hello ", bold: true },
      { text: "there", italic: true },
    ],
  };
}

function item(id: string, text: string, indent = 1): TElement {
  return paragraph(id, text, { listStyleType: "disc", indent });
}

function toggle(id: string, label: string, body: TElement[] = []): TElement {
  return {
    type: KEYS.toggle,
    id,
    children: [paragraph(`${id}-label`, label), ...body],
  };
}

function quote(id: string, children: TElement[]): TElement {
  return { type: KEYS.blockquote, id, children };
}

function callout(id: string, children: TElement[]): TElement {
  return { type: KEYS.callout, id, icon: "info", variant: "info", children };
}

function column(id: string, width: string, children: TElement[]): TElement {
  return { type: KEYS.column, id, width, children };
}

function columns(id: string, cells: TElement[]): TElement {
  return { type: KEYS.columnGroup, id, children: cells };
}

function table(): TElement {
  return {
    type: KEYS.table,
    id: "table-1",
    children: [
      {
        type: KEYS.tr,
        id: "row-1",
        children: [{ type: KEYS.td, id: "cell-1", children: [paragraph("cell-p", "Cell")] }],
      },
    ],
  };
}

function code(): TElement {
  return {
    type: KEYS.codeBlock,
    id: "code-1",
    children: [{ type: KEYS.codeLine, id: "line-1", children: [{ text: "const a = 1" }] }],
  };
}

function synced(id: string, target: string): TElement {
  return { type: SYNCED_REF_KEY, id, targetBlockId: target, children: [{ text: "" }] };
}

function textOf(node: Descendant): string {
  if (ElementApi.isElement(node)) {
    return node.children.map((child) => textOf(child)).join("");
  }
  return "text" in node && typeof node.text === "string" ? node.text : "";
}

function topIds(editor: SlateEditor): string[] {
  return editor.children.flatMap((node) =>
    ElementApi.isElement(node) && typeof node.id === "string" ? [node.id] : [],
  );
}

function allIds(nodes: readonly Descendant[]): string[] {
  const ids: string[] = [];
  const visit = (node: Descendant): void => {
    if (!ElementApi.isElement(node)) {
      return;
    }
    if (typeof node.id === "string") {
      ids.push(node.id);
    }
    for (const child of node.children) {
      visit(child);
    }
  };
  for (const node of nodes) {
    visit(node);
  }
  return ids;
}

function saved(editor: SlateEditor): void {
  expectOk(parseEditorDocument(createEditorDocument("doc", editor.children as EditorValue)));
  const again = expectOk(
    parseEditorDocument(
      createEditorDocument("doc", JSON.parse(JSON.stringify(editor.children)) as EditorValue),
    ),
  );
  expect(JSON.stringify(again.document.content)).toBe(JSON.stringify(editor.children));
}

function texts(node: Descendant | undefined): string[] {
  if (!node || !ElementApi.isElement(node)) {
    return [];
  }
  return node.children.map((child) => textOf(child));
}

function move(editor: SlateEditor, from: number[], to: number[]): boolean {
  return runEditorCommand(editor, moveBlock, { from, to });
}

function band(path: number[], top: number, height = 20, left = 40, width = 200): DropBand {
  return { path, top, height, left, width };
}

describe("list item unit", () => {
  const siblings = [item("a", "A", 1), item("a1", "A1", 2), item("a2", "A2", 2), item("b", "B", 1)];

  test("a list item carries the following deeper items", () => {
    expect(listItemUnit(siblings, 0)).toEqual([0, 3]);
    expect(listItemUnit(siblings, 1)).toEqual([1, 2]);
    expect(listItemUnit(siblings, 2)).toEqual([2, 3]);
    expect(listItemUnit(siblings, 3)).toEqual([3, 4]);
  });

  test("a missing indent counts as 1, and a heading is not a list item", () => {
    const loose = [
      paragraph("a", "A", { listStyleType: "disc" }),
      item("a1", "A1", 2),
      paragraph("h", "Head", { type: KEYS.h1 }),
    ];
    expect(listItemUnit(loose, 0)).toEqual([0, 2]);
    expect(listItemUnit([paragraph("h", "Head")], 0)).toEqual([0, 1]);
  });

  test("keyboard steps by ranges and stops at the parent edge", () => {
    expect(siblingMove(siblings, [0], "down")).toEqual({ ok: true, to: [4] });
    expect(siblingMove(siblings, [3], "up")).toEqual({ ok: true, to: [0] });
    expect(siblingMove(siblings, [2], "up")).toEqual({ ok: true, to: [1] });
    expect(siblingMove(siblings, [1], "up")).toEqual({ ok: true, to: [0] });
    expect(siblingMove(siblings, [0], "up")).toEqual({ ok: false, reason: MOVE_ALREADY_FIRST });
    expect(siblingMove(siblings, [3], "down")).toEqual({ ok: false, reason: MOVE_ALREADY_LAST });
  });
});

describe("drop targets", () => {
  test("reorders top-level siblings and ignores the current slot", () => {
    const roots = [paragraph("a", "A"), paragraph("b", "B"), paragraph("c", "C")];
    expect(blockDropDecision(roots, [0], [], 2).allowed).toBe(true);
    expect(blockDropDecision(roots, [0], [], 2).noop).toBe(false);
    expect(blockDropDecision(roots, [0], [], 0)).toMatchObject({ allowed: true, noop: true });
    expect(blockDropDecision(roots, [0], [], 1)).toMatchObject({ allowed: true, noop: true });
  });

  test("enters and leaves toggle, callout, quote, and column", () => {
    const roots = [
      paragraph("free", "Free"),
      toggle("tog", "Label", [paragraph("body", "Body")]),
      callout("call", [paragraph("note", "Note")]),
      quote("quo", [paragraph("line", "Line")]),
      columns("cols", [
        column("c1", "50%", [paragraph("left", "Left")]),
        column("c2", "50%", [paragraph("right", "Right")]),
      ]),
    ];
    expect(blockDropDecision(roots, [0], [1], 2)).toMatchObject({ allowed: true, noop: false });
    expect(blockDropDecision(roots, [1, 1], [], 0)).toMatchObject({ allowed: true, noop: false });
    expect(blockDropDecision(roots, [0], [2], 1)).toMatchObject({ allowed: true, noop: false });
    expect(blockDropDecision(roots, [2, 0], [], 4)).toMatchObject({ allowed: true, noop: false });
    expect(blockDropDecision(roots, [0], [3], 1)).toMatchObject({ allowed: true, noop: false });
    expect(blockDropDecision(roots, [3, 0], [], 1)).toMatchObject({ allowed: true, noop: false });
    expect(blockDropDecision(roots, [0], [4, 0], 1)).toMatchObject({ allowed: true, noop: false });
    expect(blockDropDecision(roots, [4, 0, 0], [], 0)).toMatchObject({
      allowed: true,
      noop: false,
    });
  });

  test("refuses self, descendants, table cells, code, synced previews, and the toggle label", () => {
    const roots = [
      toggle("outer", "Outer", [toggle("inner", "Inner", [paragraph("deep", "Deep")])]),
      table(),
      code(),
      synced("sync-1", "outer"),
      columns("cols", [column("c1", "50%", [paragraph("left", "Left")])]),
    ];
    expect(blockDropDecision(roots, [0], [0], 2).reason).toBe(
      "A block cannot be dropped into itself.",
    );
    expect(blockDropDecision(roots, [0], [0, 1], 1).reason).toBe(
      "A block cannot be dropped into itself.",
    );
    expect(blockDropDecision(roots, [0], [0], 1).reason).toBe(
      "A block cannot be dropped into itself.",
    );
    expect(blockDropDecision(roots, [0, 1, 1], [1, 0, 0], 1).reason).toBe(
      "A table cell cannot hold a dropped block.",
    );
    expect(blockDropDecision(roots, [0, 1, 1], [1, 0], 1).reason).toBe(
      "A table moves as one block.",
    );
    expect(blockDropDecision(roots, [0, 1, 1], [1], 1).reason).toBe("A table moves as one block.");
    expect(blockDropDecision(roots, [0], [2], 1).reason).toBe(
      "A code block cannot hold a dropped block.",
    );
    expect(blockDropDecision(roots, [0], [2, 0], 0).reason).toBe(
      "A code block cannot hold a dropped block.",
    );
    expect(blockDropDecision(roots, [0], [3], 0).reason).toBe(
      "A synced block cannot hold a dropped block.",
    );
    expect(blockDropDecision(roots, [1], [0], 0).reason).toBe(
      "A toggle's label cannot be a drop target.",
    );
    expect(blockDropDecision(roots, [0], [4], 1).reason).toBe("Drop inside a column.");
    expect(blockDropDecision(roots, [1, 0, 0, 0], [], 0).reason).toBe(
      "This block cannot be moved.",
    );
    expect(blockDropDecision(roots, [0, 0], [], 1).reason).toBe(
      "A toggle label stays with its toggle.",
    );
  });

  test("refuses a fourth toggle level and a block the parent cannot hold", () => {
    const deep = toggle("t1", "One", [
      toggle("t2", "Two", [toggle("t3", "Three", [paragraph("body", "Body")])]),
    ]);
    const roots = [deep, toggle("other", "Other", [paragraph("rest", "Rest")])];
    expect(blockDropDecision(roots, [1], [0, 1, 1], 2).reason).toBe(
      "Toggles can only nest three levels deep.",
    );
    expect(blockDropDecision(roots, [1], [0, 1], 2).allowed).toBe(true);
    expect(blockDropDecision(roots, [0], [1], 1).reason).toBe(
      "Toggles can only nest three levels deep.",
    );
    const quoted = [quote("q", [paragraph("line", "Line")]), table()];
    expect(blockDropDecision(quoted, [1], [0], 1).reason).toContain("quote");
  });

  test("a forbidden inner band walks out to the table, and a list interior uses the unit edge", () => {
    const roots = [table(), paragraph("after", "After")];
    const line = resolveDropIndicator(
      roots,
      [1],
      [band([0, 0, 0, 0], 40), band([0], 20, 80)],
      30,
      null,
    );
    expect(line).toMatchObject({ top: 19, left: 40, width: 200, to: [0], noop: false });
    const below = resolveDropIndicator(
      roots,
      [1],
      [band([0, 0, 0, 0], 40), band([0], 20, 80)],
      90,
      null,
    );
    expect(below).toMatchObject({ top: 99, to: [1] });

    const lists = [item("a", "A", 1), item("a1", "A1", 2), item("a2", "A2", 2)];
    const interior = resolveDropIndicator(lists, [0], [band([1], 40)], 50, {
      first: band([0], 10, 20, 10, 180),
      last: band([2], 60, 20, 28, 160),
    });
    expect(interior).toMatchObject({ noop: true, to: [3], top: 79, left: 28, width: 160 });
  });
});

describe("block.move", () => {
  test("keeps ids, marks, and content, and undo plus redo round-trip", () => {
    const editor = createEditor([
      rich("a"),
      paragraph("b", "Second"),
      toggle("tog", "Label", [paragraph("body", "Inside")]),
    ]);
    const before = JSON.stringify(editor.children);
    const ids = allIds(editor.children);
    expect(move(editor, [2], [0])).toBe(true);
    expect(topIds(editor)).toEqual(["tog", "a", "b"]);
    expect(allIds(editor.children).toSorted()).toEqual(ids.toSorted());
    expect(new Set(allIds(editor.children)).size).toBe(ids.length);
    expect(textOf(editor.children[1]!).toString()).toContain("Hello");
    expect(JSON.stringify(editor.children[1])).toContain('"bold":true');
    saved(editor);
    expect(editor.selection?.anchor.offset).toBe(0);
    expect(editor.history.undos.length).toBe(1);
    editor.tf.undo();
    expect(JSON.stringify(editor.children)).toBe(before);
    editor.tf.redo();
    expect(topIds(editor)).toEqual(["tog", "a", "b"]);
    saved(editor);
  });

  test("a drop on the current slot writes no history", () => {
    const editor = createEditor([paragraph("a", "A"), paragraph("b", "B")]);
    const before = JSON.stringify(editor.children);
    expect(move(editor, [0], [0])).toBe(true);
    expect(move(editor, [0], [1])).toBe(true);
    expect(editor.history.undos.length).toBe(0);
    expect(JSON.stringify(editor.children)).toBe(before);
  });

  test("moves a list item with its nested children and leaves a shallower item behind", () => {
    const editor = createEditor([
      item("a", "A", 1),
      item("a1", "A1", 2),
      item("a2", "A2", 2),
      item("b", "B", 1),
    ]);
    const down = siblingMove(editor.children, [0], "down");
    expect(down.ok).toBe(true);
    if (!down.ok) {
      return;
    }
    move(editor, [0], down.to);
    expect(topIds(editor)).toEqual(["b", "a", "a1", "a2"]);
    expect(editor.children[2]).toMatchObject({ indent: 2 });
    editor.tf.undo();

    const a1 = siblingMove(editor.children, [1], "up");
    expect(a1.ok).toBe(true);
    if (!a1.ok) {
      return;
    }
    move(editor, [1], a1.to);
    expect(topIds(editor)).toEqual(["a1", "a", "a2", "b"]);
    expect(editor.children[0]).toMatchObject({ indent: 2 });
    saved(editor);
  });

  test("replaces the last child of a quote, callout, or column and leaves a toggle label", () => {
    const editor = createEditor([
      quote("q", [paragraph("line", "Line")]),
      callout("c", [paragraph("note", "Note")]),
      columns("cols", [
        column("c1", "50%", [paragraph("only", "Only")]),
        column("c2", "50%", [paragraph("stay", "Stay")]),
      ]),
      toggle("tog", "Label", [paragraph("body", "Body")]),
      paragraph("tail", "Tail"),
    ]);
    move(editor, [0, 0], [4]);
    expect(textOf(editor.children[0]!)).toBe("");
    expect(editor.children[0]?.children.length).toBe(1);
    move(editor, [1, 0], [5]);
    expect(textOf(editor.children[1]!)).toBe("");
    move(editor, [2, 0, 0], [6]);
    const emptied = editor.children[2]?.children[0];
    expect(ElementApi.isElement(emptied) ? textOf(emptied) : "").toBe("");
    move(editor, [3, 1], [7]);
    expect(editor.children[3]?.children.length).toBe(1);
    expect(textOf(editor.children[3]!)).toBe("Label");
    saved(editor);
    expect(editor.history.undos.length).toBe(4);
    editor.tf.undo();
    editor.tf.undo();
    editor.tf.undo();
    editor.tf.undo();
    expect(textOf(editor.children[0]!)).toBe("Line");
    expect(textOf(editor.children[1]!)).toBe("Note");
    const restoredColumn = editor.children[2];
    const only = ElementApi.isElement(restoredColumn) ? restoredColumn.children[0] : undefined;
    expect(ElementApi.isElement(only) ? textOf(only) : "").toBe("Only");
    expect(textOf(editor.children[3]!)).toBe("LabelBody");
    expect(editor.history.undos.length).toBe(0);
  });

  test("moves a table and a toggle with its children as one block", () => {
    const editor = createEditor([
      paragraph("intro", "Intro"),
      table(),
      toggle("tog", "Label", [paragraph("body", "Inside"), toggle("child", "Nested")]),
    ]);
    const ids = allIds(editor.children);
    move(editor, [1], [0]);
    move(editor, [2], [0]);
    expect(topIds(editor)).toEqual(["tog", "table-1", "intro"]);
    expect(allIds(editor.children).toSorted()).toEqual(ids.toSorted());
    expect(new Set(allIds(editor.children)).size).toBe(ids.length);
    saved(editor);
    editor.tf.undo();
    editor.tf.undo();
    expect(topIds(editor)).toEqual(["intro", "table-1", "tog"]);
  });

  test("read-only runs neither the command nor the shortcut", () => {
    const editor = createEditor([paragraph("a", "A"), paragraph("b", "B")]);
    editor.tf.select(caret([0, 0], 0));
    const before = JSON.stringify(editor.children);
    expect(runEditorCommand(editor, moveBlock, { from: [1], to: [0] }, { readOnly: true })).toBe(
      false,
    );
    editor.dom.readOnly = true;
    let prevented = false;
    expect(
      onBlockMoveKeyDown(editor, {
        key: "ArrowUp",
        metaKey: true,
        ctrlKey: false,
        altKey: true,
        shiftKey: true,
        preventDefault: () => {
          prevented = true;
        },
      }),
    ).toBe(false);
    expect(prevented).toBe(false);
    expect(JSON.stringify(editor.children)).toBe(before);
    expect(editor.history.undos.length).toBe(0);
  });
});

describe("keyboard move", () => {
  function press(
    editor: SlateEditor,
    key: string,
    modifiers: { alt?: boolean; shift?: boolean; meta?: boolean } = {},
  ): boolean {
    let prevented = false;
    const handled = onBlockMoveKeyDown(editor, {
      key,
      metaKey: modifiers.meta !== false,
      ctrlKey: false,
      altKey: modifiers.alt !== false,
      shiftKey: modifiers.shift !== false,
      preventDefault: () => {
        prevented = true;
      },
    });
    expect(prevented).toBe(handled);
    return handled;
  }

  test("moves the caret block among its siblings and stops at the edge", () => {
    const editor = createEditor([
      paragraph("a", "A"),
      paragraph("b", "B"),
      toggle("tog", "Label", [paragraph("one", "One"), paragraph("two", "Two")]),
    ]);
    editor.tf.select(caret([1, 0], 0));
    expect(press(editor, "ArrowUp")).toBe(true);
    expect(topIds(editor)).toEqual(["b", "a", "tog"]);
    expect(editor.selection?.anchor.path[0]).toBe(0);
    expect(press(editor, "ArrowUp")).toBe(true);
    expect(editor.history.undos.length).toBe(1);
    expect(topIds(editor)).toEqual(["b", "a", "tog"]);

    editor.tf.select(caret([2, 1, 0], 0));
    expect(press(editor, "ArrowDown")).toBe(true);
    expect(
      editor.children[2]?.children.map((node) => (ElementApi.isElement(node) ? node.id : "")),
    ).toEqual(["tog-label", "two", "one"]);
    expect(press(editor, "ArrowDown")).toBe(true);
    expect(editor.history.undos.length).toBe(2);
    editor.tf.select(caret([2, 1, 0], 0));
    expect(press(editor, "ArrowUp")).toBe(true);
    expect(editor.history.undos.length).toBe(2);
    saved(editor);
  });

  test("keeps the column shortcut and does not cross a column edge", () => {
    const value = [
      columns("cols", [
        column("c1", "50%", [paragraph("a", "A"), paragraph("b", "B")]),
        column("c2", "50%", [paragraph("c", "C")]),
      ]),
    ];
    const across = createEditor(value);
    across.tf.select(caret([0, 0, 0, 0], 0));
    let prevented = false;
    onColumnKeyDown(across, {
      key: "ArrowRight",
      metaKey: true,
      ctrlKey: false,
      altKey: true,
      shiftKey: false,
      preventDefault: () => {
        prevented = true;
      },
    });
    expect(prevented).toBe(true);
    const acrossGroup = across.children[0];
    const acrossRight = ElementApi.isElement(acrossGroup) ? acrossGroup.children[1] : undefined;
    expect(texts(acrossRight)).toEqual(["A", "C"]);

    const shifted = createEditor(value);
    shifted.tf.select(caret([0, 0, 0, 0], 0));
    prevented = false;
    onColumnKeyDown(shifted, {
      key: "ArrowRight",
      metaKey: true,
      ctrlKey: false,
      altKey: true,
      shiftKey: true,
      preventDefault: () => {
        prevented = true;
      },
    });
    expect(prevented).toBe(false);
    expect(press(shifted, "ArrowDown")).toBe(true);
    const shiftedGroup = shifted.children[0];
    const shiftedLeft = ElementApi.isElement(shiftedGroup) ? shiftedGroup.children[0] : undefined;
    const shiftedRight = ElementApi.isElement(shiftedGroup) ? shiftedGroup.children[1] : undefined;
    expect(texts(shiftedLeft)).toEqual(["B", "A"]);
    expect(texts(shiftedRight)).toEqual(["C"]);
    expect(press(shifted, "ArrowDown")).toBe(true);
    expect(shifted.history.undos.length).toBe(1);
  });

  test("the chord is Mod+Alt+Shift+Arrow and yields while a mention combobox is open", () => {
    expect(
      blockMoveDirection({
        key: "ArrowUp",
        metaKey: true,
        ctrlKey: false,
        altKey: true,
        shiftKey: true,
      }),
    ).toBe("up");
    expect(
      blockMoveDirection({
        key: "ArrowDown",
        metaKey: false,
        ctrlKey: true,
        altKey: true,
        shiftKey: true,
      }),
    ).toBe("down");
    expect(
      blockMoveDirection({
        key: "ArrowUp",
        metaKey: true,
        ctrlKey: false,
        altKey: true,
        shiftKey: false,
      }),
    ).toBeNull();
    expect(
      blockMoveDirection({
        key: "ArrowLeft",
        metaKey: true,
        ctrlKey: false,
        altKey: true,
        shiftKey: true,
      }),
    ).toBeNull();
    expect(dragPastThreshold(3, 0)).toBe(false);
    expect(dragPastThreshold(4, 1)).toBe(true);

    const editor = createEditor([
      paragraph("a", "A"),
      {
        type: KEYS.p,
        id: "b",
        children: [{ type: KEYS.mentionInput, children: [{ text: "ada" }] }],
      },
    ]);
    editor.tf.select(caret([1, 0, 0], 1));
    expect(press(editor, "ArrowUp")).toBe(false);
    expect(topIds(editor)).toEqual(["a", "b"]);
    expect(editor.history.undos.length).toBe(0);
  });
});

describe("grip click and drag", () => {
  function isReactContainer(value: object): value is Parameters<typeof createRoot>[0] {
    return "nodeType" in value && value.nodeType === 1;
  }

  function domRect(x: number, y: number, width: number, height: number): DOMRect {
    return {
      x,
      y,
      left: x,
      top: y,
      right: x + width,
      bottom: y + height,
      width,
      height,
      toJSON() {
        return {};
      },
    } as DOMRect;
  }

  async function mount(): Promise<{
    host: HTMLDivElement;
    editor: ReturnType<typeof createPlateEditor>;
    root: Root;
    restore: () => void;
  }> {
    const original = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function () {
      if (this.hasAttribute("data-block-handle")) {
        return domRect(230, 96, 66, 32);
      }
      if (this.hasAttribute("data-slate-node")) {
        return domRect(300, 100, 400, 24);
      }
      return domRect(0, 0, 1280, 800);
    };
    const host = document.createElement("div");
    host.setAttribute("data-block-viewport", "");
    document.body.appendChild(host);
    const editor = createPlateEditor({
      plugins: createEditorPlugins(),
      value: [paragraph("block-1", "Hello"), paragraph("block-2", "There")] as EditorValue,
    });
    if (!isReactContainer(host)) {
      throw new Error("Missing mount node.");
    }
    const root = createRoot(host);
    await act(async () => {
      root.render(
        <EditorSurface editor={editor} readOnly={false} placeholder="" className="editor" />,
      );
    });
    return {
      host,
      editor,
      root,
      restore: () => {
        HTMLElement.prototype.getBoundingClientRect = original;
      },
    };
  }

  async function hover(host: HTMLElement): Promise<HTMLElement> {
    const block = host.querySelector("[data-block-id='block-1']");
    await act(async () => {
      block?.dispatchEvent(
        new PointerEvent("pointermove", { bubbles: true, pointerType: "mouse" }),
      );
    });
    const grip = document.querySelector("[data-block-handle-grip]");
    if (!(grip instanceof HTMLElement)) {
      throw new Error("Missing grip.");
    }
    return grip;
  }

  test("a press without movement opens the menu and a drag does not", async () => {
    const mounted = await mount();
    try {
      const grip = await hover(mounted.host);
      const undos = mounted.editor.history.undos.length;
      await act(async () => {
        grip.dispatchEvent(
          new PointerEvent("pointerdown", {
            bubbles: true,
            cancelable: true,
            clientX: 10,
            clientY: 10,
            button: 0,
            pointerType: "mouse",
          }),
        );
        window.dispatchEvent(
          new PointerEvent("pointerup", {
            bubbles: true,
            clientX: 10,
            clientY: 10,
            button: 0,
            pointerType: "mouse",
          }),
        );
        grip.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      expect(document.querySelector("[data-block-menu]")).not.toBeNull();
      expect(document.querySelector("[data-block-menu]")?.textContent).toContain("Move up");
      expect(document.querySelector("[data-block-menu-move='down']")).not.toBeNull();
      expect(mounted.editor.history.undos.length).toBe(undos);

      await act(async () => {
        document
          .querySelector("[data-block-menu]")
          ?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      });
      const hadResizeObserver = "ResizeObserver" in globalThis;
      const previousResizeObserver = globalThis.ResizeObserver;
      class ResizeObserverStub {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      }
      globalThis.ResizeObserver = ResizeObserverStub;
      try {
        await act(async () => {
          grip.dispatchEvent(
            new PointerEvent("pointermove", {
              bubbles: true,
              pointerType: "mouse",
              clientX: 12,
              clientY: 12,
            }),
          );
          await new Promise((resolve) => {
            setTimeout(resolve, 20);
          });
        });
      } finally {
        if (hadResizeObserver) {
          globalThis.ResizeObserver = previousResizeObserver;
        } else {
          Reflect.deleteProperty(globalThis, "ResizeObserver");
        }
      }
      expect(document.querySelector("[data-block-handle-tooltip]")?.textContent).toContain(
        "Drag to move",
      );
      const held = mounted.editor.selection;

      await act(async () => {
        grip.dispatchEvent(
          new PointerEvent("pointerdown", {
            bubbles: true,
            cancelable: true,
            clientX: 10,
            clientY: 10,
            button: 0,
            pointerType: "mouse",
          }),
        );
        window.dispatchEvent(
          new PointerEvent("pointermove", {
            bubbles: true,
            cancelable: true,
            clientX: 24,
            clientY: 10,
            button: 0,
            pointerType: "mouse",
          }),
        );
      });
      expect(document.body.getAttribute("data-block-dragging")).toBe("");
      expect(document.querySelector("[data-block-menu]")).toBeNull();
      expect(document.querySelector("[data-block-handle]")).toBeNull();
      expect(document.querySelector("[data-block-handle-tooltip]")).toBeNull();
      const other = mounted.host.querySelector("[data-block-id='block-2']");
      await act(async () => {
        other?.dispatchEvent(
          new PointerEvent("pointermove", { bubbles: true, pointerType: "mouse" }),
        );
      });
      expect(document.querySelector("[data-block-handle]")).toBeNull();
      await act(async () => {
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      });
      expect(document.body.hasAttribute("data-block-dragging")).toBe(false);
      expect(
        document.querySelector("[data-block-handle-for]")?.getAttribute("data-block-handle-for"),
      ).toBe("block-1");
      expect(document.querySelector("[data-block-handle-tooltip]")).toBeNull();
      expect(mounted.editor.history.undos.length).toBe(undos);
      expect(mounted.editor.selection).toEqual(held);
      await act(async () => {
        grip.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      expect(document.querySelector("[data-block-menu]")).toBeNull();
    } finally {
      await act(async () => {
        mounted.root.unmount();
      });
      mounted.host.remove();
      mounted.restore();
    }
  });

  async function mountBlocks(
    value: TElement[],
    overId: string,
  ): Promise<{
    host: HTMLDivElement;
    editor: ReturnType<typeof createPlateEditor>;
    root: Root;
    restore: () => void;
  }> {
    const originalRect = HTMLElement.prototype.getBoundingClientRect;
    const hadFromPoint = typeof document.elementsFromPoint === "function";
    const originalFromPoint = hadFromPoint ? document.elementsFromPoint.bind(document) : null;
    HTMLElement.prototype.getBoundingClientRect = function () {
      if (this.hasAttribute("data-block-handle")) {
        return domRect(230, 96, 66, 32);
      }
      if (this.hasAttribute("data-slate-node")) {
        return domRect(300, 100, 400, 24);
      }
      return domRect(0, 0, 1280, 800);
    };
    const host = document.createElement("div");
    host.setAttribute("data-block-viewport", "");
    document.body.appendChild(host);
    document.elementsFromPoint = () => {
      const target = host.querySelector(`[data-block-id="${overId}"]`);
      return target instanceof Element ? [target] : [];
    };
    const editor = createPlateEditor({
      plugins: createEditorPlugins(),
      value: value as EditorValue,
    });
    if (!isReactContainer(host)) {
      throw new Error("Missing mount node.");
    }
    const root = createRoot(host);
    await act(async () => {
      root.render(
        <EditorSurface editor={editor} readOnly={false} placeholder="" className="editor" />,
      );
    });
    return {
      host,
      editor,
      root,
      restore: () => {
        HTMLElement.prototype.getBoundingClientRect = originalRect;
        if (originalFromPoint) {
          document.elementsFromPoint = originalFromPoint;
        } else {
          Reflect.deleteProperty(document, "elementsFromPoint");
        }
      },
    };
  }

  async function hoverId(host: HTMLElement, id: string): Promise<HTMLElement> {
    const block = host.querySelector(`[data-block-id="${id}"]`);
    await act(async () => {
      block?.dispatchEvent(
        new PointerEvent("pointermove", { bubbles: true, pointerType: "mouse" }),
      );
    });
    const grip = document.querySelector("[data-block-handle-grip]");
    if (!(grip instanceof HTMLElement)) {
      throw new Error("Missing grip.");
    }
    return grip;
  }

  function pointer(type: string, x: number, y: number): PointerEvent {
    return new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      button: 0,
      pointerType: "mouse",
    });
  }

  async function pull(grip: HTMLElement): Promise<void> {
    await act(async () => {
      grip.dispatchEvent(pointer("pointerdown", 10, 10));
      window.dispatchEvent(pointer("pointermove", 10, 140));
    });
  }

  async function release(): Promise<void> {
    await act(async () => {
      window.dispatchEvent(pointer("pointerup", 10, 140));
    });
    await act(async () => {
      await new Promise((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => resolve(undefined));
        });
      });
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
    });
  }

  function hasDim(host: HTMLElement, id: string): boolean {
    const node = host.querySelector(`[data-block-id="${id}"]`);
    return node instanceof HTMLElement && node.classList.contains("opacity-40");
  }

  function domCaret(): { id: string | null; offset: number | null; collapsed: boolean } {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return { id: null, offset: null, collapsed: false };
    }
    const node = selection.anchorNode;
    const element = node instanceof Element ? node : (node?.parentElement ?? null);
    const block = element?.closest("[data-block-id]") ?? null;
    return {
      id: block instanceof HTMLElement ? block.getAttribute("data-block-id") : null,
      offset: selection.anchorOffset,
      collapsed: selection.isCollapsed,
    };
  }

  function expectCaret(editor: SlateEditor, id: string): void {
    const index = topIds(editor).indexOf(id);
    expect(index).toBeGreaterThanOrEqual(0);
    const point = editor.api.start([index, 0]);
    if (!point) {
      throw new Error("Missing caret point.");
    }
    expect(editor.selection).toEqual({ anchor: point, focus: point });
    expect(domCaret()).toEqual({ id, offset: 0, collapsed: true });
  }

  test("a drop leaves the caret at the start of the moved block", async () => {
    const mounted = await mountBlocks(
      [paragraph("a", "Alpha"), paragraph("b", "Beta"), paragraph("c", "Gamma")],
      "c",
    );
    let scrollTop = 36;
    Object.defineProperty(mounted.host, "scrollTop", {
      configurable: true,
      get: () => scrollTop,
      set: (value: number) => {
        scrollTop = value;
      },
    });
    try {
      await act(async () => {
        mounted.editor.tf.select(caret([0, 0], 0));
      });
      const grip = await hoverId(mounted.host, "b");
      await pull(grip);
      expect(hasDim(mounted.host, "b")).toBe(true);
      expect(hasDim(mounted.host, "a")).toBe(false);
      expect(hasDim(mounted.host, "c")).toBe(false);
      const before = scrollTop;
      await release();
      expect(topIds(mounted.editor)).toEqual(["a", "c", "b"]);
      expectCaret(mounted.editor, "b");
      expect(scrollTop).toBe(before);
      expect(hasDim(mounted.host, "b")).toBe(false);
    } finally {
      await act(async () => {
        mounted.root.unmount();
      });
      mounted.host.remove();
      mounted.restore();
    }
  });

  test("a list-unit drag dims every block and drops the caret on the parent", async () => {
    const mounted = await mountBlocks(
      [
        item("a", "Alpha", 1),
        item("a1", "Nested", 2),
        item("a2", "Deeper", 3),
        item("b", "Beta", 1),
      ],
      "b",
    );
    try {
      await act(async () => {
        mounted.editor.tf.select(caret([3, 0], 0));
      });
      const grip = await hoverId(mounted.host, "a");
      await pull(grip);
      expect(hasDim(mounted.host, "a")).toBe(true);
      expect(hasDim(mounted.host, "a1")).toBe(true);
      expect(hasDim(mounted.host, "a2")).toBe(true);
      expect(hasDim(mounted.host, "b")).toBe(false);
      await act(async () => {
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      });
      expect(hasDim(mounted.host, "a")).toBe(false);
      expect(hasDim(mounted.host, "a1")).toBe(false);
      expect(hasDim(mounted.host, "a2")).toBe(false);
      expect(topIds(mounted.editor)).toEqual(["a", "a1", "a2", "b"]);

      const again = await hoverId(mounted.host, "a");
      await pull(again);
      expect(hasDim(mounted.host, "a1")).toBe(true);
      await release();
      expect(topIds(mounted.editor)).toEqual(["b", "a", "a1", "a2"]);
      expectCaret(mounted.editor, "a");
      expect(hasDim(mounted.host, "a")).toBe(false);
      expect(hasDim(mounted.host, "a1")).toBe(false);
      expect(hasDim(mounted.host, "a2")).toBe(false);
    } finally {
      await act(async () => {
        mounted.root.unmount();
      });
      mounted.host.remove();
      mounted.restore();
    }
  });
});
