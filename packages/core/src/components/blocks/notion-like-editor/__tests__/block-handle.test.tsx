import { describe, expect, test } from "bun:test";
import { ElementApi, KEYS, type SlateEditor, type TElement } from "platejs";
import { createPlateEditor } from "platejs/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { EditorSurface } from "../components/editor/editor-surface";
import { insertParagraphBelow, runEditorCommand } from "../lib/commands/editor-commands";
import type { EditorValue } from "../lib/document/editor-value";
import {
  BLOCK_HANDLE_GAP,
  BLOCK_HANDLE_HEIGHT,
  BLOCK_HANDLE_WIDTH,
  blockHandleGutterId,
  blockHandleTarget,
  chainAtPath,
  chainFromDom,
  handleCoversForeignBlock,
  initialHandleUi,
  isTypingKey,
  placeBlockHandle,
  reduceHandleUi,
  targetBlockAtPath,
  visibleHandleId,
  type HandleChainNode,
  type HandleUiState,
} from "../lib/features/editor-block-handle";
import { SYNCED_REF_KEY } from "../lib/features/editor-synced-block";
import { createEditorPlugins } from "../lib/plugins/editor-plugins";
import { caret, createEditor, paragraphValue } from "./test-utils";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

function chainNode(
  type: string,
  id: string,
  index: number,
  parentType: string | null,
): HandleChainNode {
  return { type, id, index, parentType };
}

function paragraph(id: string, text = "Text"): TElement {
  return { type: KEYS.p, id, children: [{ text }] };
}

function pathOf(editor: SlateEditor, id: string): number[] {
  for (const entry of editor.api.nodes({
    at: [],
    match: (node) => ElementApi.isElement(node) && node.id === id,
  })) {
    return entry[1];
  }
  throw new Error(`Missing ${id}`);
}

function isReactContainer(value: object): value is Parameters<typeof createRoot>[0] {
  return "nodeType" in value && value.nodeType === 1;
}

describe("block handle target", () => {
  test("a top-level paragraph is its own target", () => {
    const editor = createEditor([paragraph("top", "Hello")]);

    expect(targetBlockAtPath(editor, [0, 0])).toEqual({
      id: "top",
      type: KEYS.p,
      path: [0],
    });
  });

  test("a list item is the paragraph, including a nested indent", () => {
    const editor = createEditor([
      { ...paragraph("item", "One"), listStyleType: "disc", indent: 1 },
      { ...paragraph("nested", "Two"), listStyleType: "disc", indent: 2 },
    ]);

    expect(targetBlockAtPath(editor, pathOf(editor, "nested"))?.id).toBe("nested");
    expect(targetBlockAtPath(editor, pathOf(editor, "item"))?.id).toBe("item");
  });

  test("toggle summary targets the toggle and later children target themselves", () => {
    const editor = createEditor([
      {
        type: KEYS.toggle,
        id: "toggle",
        children: [paragraph("summary", "Summary"), paragraph("child", "Inside")],
      },
    ]);

    expect(targetBlockAtPath(editor, pathOf(editor, "summary"))?.id).toBe("toggle");
    expect(targetBlockAtPath(editor, pathOf(editor, "child"))?.id).toBe("child");
  });

  test("callout, quote, and column content target the inner block", () => {
    const editor = createEditor([
      {
        type: KEYS.callout,
        id: "callout",
        children: [paragraph("callout-row", "Note"), paragraph("callout-child", "More")],
      },
      {
        type: KEYS.blockquote,
        id: "quote",
        children: [paragraph("quote-child", "Quoted")],
      },
      {
        type: KEYS.columnGroup,
        id: "group",
        children: [
          {
            type: KEYS.column,
            id: "column",
            width: "50%",
            children: [paragraph("column-child", "Side")],
          },
        ],
      },
    ]);

    expect(targetBlockAtPath(editor, pathOf(editor, "callout-row"))?.id).toBe("callout");
    expect(targetBlockAtPath(editor, pathOf(editor, "callout-child"))?.id).toBe("callout-child");
    expect(
      blockHandleGutterId(chainAtPath(editor, pathOf(editor, "callout-child")), "callout-child"),
    ).toBe("callout");
    expect(blockHandleGutterId(chainAtPath(editor, pathOf(editor, "callout")), "callout")).toBe(
      "callout",
    );
    expect(targetBlockAtPath(editor, pathOf(editor, "callout"))?.id).toBe("callout");
    expect(targetBlockAtPath(editor, pathOf(editor, "quote-child"))?.id).toBe("quote-child");
    expect(targetBlockAtPath(editor, pathOf(editor, "quote"))?.id).toBe("quote");
    expect(targetBlockAtPath(editor, pathOf(editor, "column-child"))?.id).toBe("column-child");
    expect(targetBlockAtPath(editor, pathOf(editor, "column"))?.id).toBe("group");
  });

  test("a table cell targets the table and a code line targets the code block", () => {
    const editor = createEditor([
      {
        type: KEYS.table,
        id: "table",
        children: [
          {
            type: KEYS.tr,
            id: "row",
            children: [
              {
                type: KEYS.td,
                id: "cell",
                children: [paragraph("cell-text", "A")],
              },
            ],
          },
        ],
      },
      {
        type: KEYS.codeBlock,
        id: "code",
        children: [{ type: KEYS.codeLine, id: "line", children: [{ text: "const a = 1" }] }],
      },
    ]);

    expect(targetBlockAtPath(editor, pathOf(editor, "cell-text"))?.id).toBe("table");
    expect(targetBlockAtPath(editor, pathOf(editor, "cell"))?.id).toBe("table");
    expect(targetBlockAtPath(editor, pathOf(editor, "line"))?.id).toBe("code");
  });

  test("the innermost eligible block wins", () => {
    const callout = chainNode(KEYS.callout, "callout", 0, KEYS.column);
    const chain = [
      chainNode(KEYS.p, "paragraph", 1, KEYS.callout),
      callout,
      chainNode(KEYS.column, "column", 0, KEYS.columnGroup),
      chainNode(KEYS.columnGroup, "group", 0, null),
    ];

    expect(blockHandleTarget(chain)).toEqual({ id: "paragraph", type: KEYS.p });
    expect(blockHandleGutterId(chain, "paragraph")).toBe("callout");
    expect(blockHandleTarget([chainNode(KEYS.p, "row", 0, KEYS.callout), callout])).toEqual({
      id: "callout",
      type: KEYS.callout,
    });
  });

  test("a synced preview copy climbs to the synced block", () => {
    const editor = createEditor([
      paragraph("original", "Source"),
      {
        type: SYNCED_REF_KEY,
        id: "sync",
        targetBlockId: "original",
        children: [{ text: "" }],
      },
    ]);
    const host = document.createElement("div");
    host.setAttribute("data-block-id", "sync");
    const preview = document.createElement("div");
    preview.setAttribute("data-preview-path", "1000000");
    preview.setAttribute("data-block-id", "original");
    const copy = document.createElement("span");
    copy.textContent = "Source";
    preview.append(copy);
    host.append(preview);
    document.body.append(host);

    try {
      expect(blockHandleTarget(chainFromDom(editor, copy))?.id).toBe("sync");
    } finally {
      host.remove();
    }
  });
});

describe("block handle visibility", () => {
  function show(state: HandleUiState, event: Parameters<typeof reduceHandleUi>[1]): string | null {
    return visibleHandleId(reduceHandleUi(state, event));
  }

  test("hover, caret, typing, pointer move, and read-only", () => {
    let state = initialHandleUi();

    state = reduceHandleUi(state, { type: "caret", id: "caret-block" });
    expect(visibleHandleId(state)).toBe("caret-block");

    state = reduceHandleUi(state, { type: "pointer-move", id: "hover-block", engagedId: null });
    expect(visibleHandleId(state)).toBe("hover-block");

    state = reduceHandleUi(state, { type: "typing", typing: true });
    expect(visibleHandleId(state)).toBeNull();

    state = reduceHandleUi(state, { type: "pointer-move", id: "hover-block", engagedId: null });
    expect(visibleHandleId(state)).toBe("hover-block");

    state = reduceHandleUi(state, { type: "read-only", value: true });
    expect(show(state, { type: "pointer-move", id: "hover-block", engagedId: null })).toBeNull();
  });

  test("the handle stays while its own control is engaged", () => {
    const state = reduceHandleUi(initialHandleUi(), {
      type: "pointer-move",
      id: "block",
      engagedId: "block",
    });

    const left = reduceHandleUi(state, { type: "pointer-move", id: null, engagedId: "block" });
    expect(visibleHandleId(left)).toBe("block");
  });

  test("a touch device renders nothing", () => {
    const state = reduceHandleUi(initialHandleUi(), { type: "hover-none", value: true });
    expect(show(state, { type: "pointer-move", id: "block", engagedId: null })).toBeNull();
  });

  test("typing keys are inserts and deletes, and arrows are not", () => {
    expect(isTypingKey({ key: "a", metaKey: false, ctrlKey: false, altKey: false })).toBe(true);
    expect(isTypingKey({ key: "Backspace", metaKey: false, ctrlKey: false, altKey: false })).toBe(
      true,
    );
    expect(isTypingKey({ key: "Enter", metaKey: false, ctrlKey: false, altKey: false })).toBe(true);
    expect(isTypingKey({ key: "ArrowDown", metaKey: false, ctrlKey: false, altKey: false })).toBe(
      false,
    );
    expect(isTypingKey({ key: "b", metaKey: true, ctrlKey: false, altKey: false })).toBe(false);
    expect(
      isTypingKey({
        key: "Process",
        metaKey: false,
        ctrlKey: false,
        altKey: false,
        isComposing: true,
      }),
    ).toBe(true);
  });
});

describe("block handle placement", () => {
  const handle = { width: BLOCK_HANDLE_WIDTH, height: BLOCK_HANDLE_HEIGHT };
  const viewport = { width: 1280, height: 800 };
  const line = { lineTop: 100, lineHeight: 24, blockLeft: 300 };

  test("centers on the first line and leaves a gap before the block", () => {
    const placed = placeBlockHandle(line, handle, viewport, null);

    expect(placed).toEqual({ top: 96, left: 300 - BLOCK_HANDLE_GAP - BLOCK_HANDLE_WIDTH });
    expect(placed && placed.top + handle.height / 2).toBe(line.lineTop + line.lineHeight / 2);
  });

  test("hides when the gutter does not fit or the line has left the frame", () => {
    expect(placeBlockHandle({ ...line, blockLeft: 16 }, handle, viewport, null)).toBeNull();
    expect(
      placeBlockHandle(line, handle, viewport, { top: 200, right: 1280, bottom: 800, left: 0 }),
    ).toBeNull();
    expect(
      placeBlockHandle(line, handle, viewport, { top: 0, right: 200, bottom: 800, left: 0 }),
    ).toBeNull();
  });

  test("placement writes no editor history", () => {
    const editor = createEditor(paragraphValue("Hello"));
    const before = JSON.stringify(editor.children);
    const undos = editor.history.undos.length;
    const selection = editor.selection;

    expect(placeBlockHandle(line, handle, viewport, null)).not.toBeNull();
    expect(handleCoversForeignBlock("other", ["block"])).toBe(true);
    expect(handleCoversForeignBlock("block", ["block", "parent"])).toBe(false);

    expect(editor.history.undos.length).toBe(undos);
    expect(JSON.stringify(editor.children)).toBe(before);
    expect(editor.selection).toEqual(selection);
  });
});

describe("insert paragraph below", () => {
  test("inserts one empty paragraph under a top-level block and one undo restores it", () => {
    const editor = createEditor([paragraph("top", "Hello")]);
    editor.tf.select(caret([0, 0], 5));
    const before = JSON.stringify(editor.children);
    const undos = editor.history.undos.length;

    expect(runEditorCommand(editor, insertParagraphBelow, { path: [0] })).toBe(true);

    expect(editor.children).toHaveLength(2);
    expect(editor.children[1]?.type).toBe(KEYS.p);
    expect(editor.api.string(editor.children[1] ? [1] : [0])).toBe("");
    expect(editor.selection).toEqual(caret([1, 0], 0));
    expect(editor.history.undos.length - undos).toBe(1);

    editor.tf.undo();
    expect(JSON.stringify(editor.children)).toBe(before);
    expect(editor.history.undos.length).toBe(undos);
  });

  test("inserts inside the same container when the target is a later child", () => {
    const editor = createEditor([
      {
        type: KEYS.callout,
        id: "callout",
        children: [paragraph("first", "Note"), paragraph("later", "More")],
      },
    ]);
    const later = targetBlockAtPath(editor, pathOf(editor, "later"));
    expect(later?.id).toBe("later");
    const before = JSON.stringify(editor.children);
    const undos = editor.history.undos.length;

    expect(runEditorCommand(editor, insertParagraphBelow, { path: later?.path ?? [] })).toBe(true);

    const callout = editor.children[0];
    expect(ElementApi.isElement(callout) && callout.children).toHaveLength(3);
    expect(editor.selection).toEqual(caret([0, 2, 0], 0));
    expect(editor.history.undos.length - undos).toBe(1);

    editor.tf.undo();
    expect(JSON.stringify(editor.children)).toBe(before);
    expect(editor.history.undos.length).toBe(undos);
  });

  test("the callout first row targets the callout and inserts below it", () => {
    const editor = createEditor([
      {
        type: KEYS.callout,
        id: "callout",
        children: [paragraph("first", "Note"), paragraph("later", "More")],
      },
    ]);
    const first = targetBlockAtPath(editor, pathOf(editor, "first"));
    expect(first).toEqual({ id: "callout", type: KEYS.callout, path: [0] });
    const before = JSON.stringify(editor.children);
    const undos = editor.history.undos.length;

    expect(runEditorCommand(editor, insertParagraphBelow, { path: first?.path ?? [] })).toBe(true);

    expect(editor.children).toHaveLength(2);
    expect(editor.children[1]?.type).toBe(KEYS.p);
    expect(editor.api.string([1])).toBe("");
    expect(editor.selection).toEqual(caret([1, 0], 0));
    const callout = editor.children[0];
    expect(ElementApi.isElement(callout) && callout.children).toHaveLength(2);
    expect(editor.history.undos.length - undos).toBe(1);

    editor.tf.undo();
    expect(JSON.stringify(editor.children)).toBe(before);
    expect(editor.history.undos.length).toBe(undos);
  });

  test("read-only refuses the insert", () => {
    const editor = createEditor([paragraph("top", "Hello")]);
    const before = JSON.stringify(editor.children);
    const undos = editor.history.undos.length;

    expect(runEditorCommand(editor, insertParagraphBelow, { path: [0] }, { readOnly: true })).toBe(
      false,
    );
    expect(JSON.stringify(editor.children)).toBe(before);
    expect(editor.history.undos.length).toBe(undos);
  });

  test("the command is an insert and does not register a shortcut", () => {
    const editor = createEditor();

    expect(insertParagraphBelow.id).toBe("block.insert.paragraph-below");
    expect(insertParagraphBelow.label).toBe("Add below");
    expect(insertParagraphBelow.group).toBe("insert");
    expect(editor.meta.shortcuts["block.insert.paragraph-below"]).toBeUndefined();
  });
});

describe("block handle overlay", () => {
  function domRect(x: number, y: number, width: number, height: number): DOMRect {
    const rect = {
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
    };
    return rect as DOMRect;
  }

  function installLayout(): () => void {
    const previousWidth = window.innerWidth;
    const previousHeight = window.innerHeight;
    const original = HTMLElement.prototype.getBoundingClientRect;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1280 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
    HTMLElement.prototype.getBoundingClientRect = function () {
      if (this.hasAttribute("data-block-handle")) {
        return domRect(230, 96, BLOCK_HANDLE_WIDTH, BLOCK_HANDLE_HEIGHT);
      }
      if (this.hasAttribute("data-slate-node")) {
        return domRect(300, 100, 400, 24);
      }
      return domRect(0, 0, 1280, 800);
    };
    return () => {
      HTMLElement.prototype.getBoundingClientRect = original;
      Object.defineProperty(window, "innerWidth", { configurable: true, value: previousWidth });
      Object.defineProperty(window, "innerHeight", { configurable: true, value: previousHeight });
    };
  }

  async function mount(readOnly: boolean): Promise<{
    host: HTMLDivElement;
    editor: ReturnType<typeof createPlateEditor>;
    root: Root;
  }> {
    const host = document.createElement("div");
    host.setAttribute("data-block-viewport", "");
    document.body.appendChild(host);
    const editor = createPlateEditor({
      plugins: createEditorPlugins(),
      value: paragraphValue("Hello", "block-1") as EditorValue,
    });
    if (!isReactContainer(host)) {
      throw new Error("Missing mount node.");
    }
    const root = createRoot(host);
    await act(async () => {
      root.render(
        <EditorSurface editor={editor} readOnly={readOnly} placeholder="" className="editor" />,
      );
    });
    return { host, editor, root };
  }

  test("read-only renders nothing", async () => {
    const restore = installLayout();
    const mounted = await mount(true);
    try {
      expect(mounted.host.querySelector("[data-block-handle]")).toBeNull();
      expect(document.querySelector("[data-block-handle]")).toBeNull();
    } finally {
      await act(async () => {
        mounted.root.unmount();
      });
      mounted.host.remove();
      restore();
    }
  });

  test("hover shows the handle, typing hides it, and a pointer move shows it again", async () => {
    const restore = installLayout();
    const mounted = await mount(false);
    try {
      const block = mounted.host.querySelector("[data-block-id='block-1']");
      expect(block).not.toBeNull();
      await act(async () => {
        block?.dispatchEvent(
          new PointerEvent("pointermove", { bubbles: true, pointerType: "mouse" }),
        );
      });
      const handle = document.querySelector("[data-block-handle]");
      expect(handle?.getAttribute("data-visible")).toBe("true");
      expect(handle?.getAttribute("data-block-handle-for")).toBe("block-1");
      expect(document.querySelector("[data-block-handle-add]")?.getAttribute("aria-label")).toBe(
        "Click to add below",
      );
      expect(document.querySelector("[data-block-handle-grip]")?.getAttribute("aria-label")).toBe(
        "Drag to move",
      );

      const editable = mounted.host.querySelector("[data-slate-editor]");
      await act(async () => {
        editable?.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
      });
      expect(document.querySelector("[data-block-handle]")?.getAttribute("data-visible")).toBe(
        "false",
      );

      await act(async () => {
        block?.dispatchEvent(
          new PointerEvent("pointermove", { bubbles: true, pointerType: "mouse" }),
        );
      });
      expect(document.querySelector("[data-block-handle]")?.getAttribute("data-visible")).toBe(
        "true",
      );
    } finally {
      await act(async () => {
        mounted.root.unmount();
      });
      mounted.host.remove();
      restore();
    }
  });

  test("scrolling and hovering write no history and do not move the selection", async () => {
    const restore = installLayout();
    const mounted = await mount(false);
    try {
      const before = JSON.stringify(mounted.editor.children);
      const undos = mounted.editor.history.undos.length;
      const selection = mounted.editor.selection;
      const block = mounted.host.querySelector("[data-block-id='block-1']");
      await act(async () => {
        block?.dispatchEvent(
          new PointerEvent("pointermove", { bubbles: true, pointerType: "mouse" }),
        );
        mounted.host.dispatchEvent(new Event("scroll", { bubbles: true }));
        window.dispatchEvent(new Event("resize"));
      });

      expect(mounted.editor.history.undos.length).toBe(undos);
      expect(JSON.stringify(mounted.editor.children)).toBe(before);
      expect(mounted.editor.selection).toEqual(selection);
    } finally {
      await act(async () => {
        mounted.root.unmount();
      });
      mounted.host.remove();
      restore();
    }
  });
});
