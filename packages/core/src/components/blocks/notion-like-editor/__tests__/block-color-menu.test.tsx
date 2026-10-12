import { describe, expect, spyOn, test } from "bun:test";
import { ElementApi, type SlateEditor, type TElement } from "platejs";
import { createPlateEditor } from "platejs/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { EditorSurface } from "../components/editor/editor-surface";
import { DEMO_DOCUMENT_VALUE } from "../demo/demo-document";
import { createEditorDocument } from "../lib/document/editor-document";
import { PALETTE_TOKENS } from "../lib/document/editor-document-schema";
import { parseEditorDocument } from "../lib/document/editor-document-validate";
import type { EditorValue } from "../lib/document/editor-value";
import { blockSelectionIds, setBlockSelection } from "../lib/plugins/editor-block-selection";
import { createEditorPlugins } from "../lib/plugins/editor-plugins";
import { expectOk, field } from "./test-utils";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

type Mounted = {
  host: HTMLDivElement;
  editor: ReturnType<typeof createPlateEditor>;
  root: Root;
  restore: () => void;
};

function paragraph(id: string, text: string, extra: Record<string, unknown> = {}) {
  return { type: "p", id, ...extra, children: [{ text }] };
}

function heading(id: string, text: string) {
  return { type: "h2", id, children: [{ text }] };
}

function quote(id: string) {
  return {
    type: "blockquote",
    id,
    children: [{ type: "p", id: `${id}-p`, children: [{ text: "Quoted" }] }],
  };
}

function codeBlock(id: string) {
  return {
    type: "code_block",
    id,
    children: [{ type: "code_line", id: `${id}-line`, children: [{ text: "x = 1" }] }],
  };
}

function callout(id: string) {
  return {
    type: "callout",
    id,
    icon: "info",
    variant: "info",
    children: [paragraph(`${id}-p`, "Note")],
  };
}

function table(id: string) {
  return {
    type: "table",
    id,
    children: [
      {
        type: "tr",
        id: `${id}-row`,
        children: [
          {
            type: "td",
            id: `${id}-cell`,
            children: [paragraph(`${id}-cell-p`, "Cell")],
          },
        ],
      },
    ],
  };
}

// The block as stored, minus both tone attributes.
function withoutTones(node: unknown): unknown {
  const copy = structuredClone(node) as Record<string, unknown>;
  delete copy.textTone;
  delete copy.backgroundTone;
  return copy;
}

function nodeOf(editor: SlateEditor, id: string): TElement {
  const found = [
    ...editor.api.nodes({
      at: [],
      match: (node) => ElementApi.isElement(node) && node.id === id,
    }),
  ][0];
  if (!found || !ElementApi.isElement(found[0])) {
    throw new Error(`no block ${id}`);
  }
  return found[0];
}

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

function frames(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

function swatch(kind: "text" | "background", token: string): HTMLElement {
  const found = document.querySelector<HTMLElement>(
    `[data-color-kind='${kind}'][data-color-token='${token}']`,
  );
  if (!found) {
    throw new Error(`no ${kind} swatch ${token}`);
  }
  return found;
}

function colorTrigger(): HTMLElement {
  const found = document.querySelector<HTMLElement>("[data-block-menu-color]");
  if (!found) {
    throw new Error("no Color trigger");
  }
  return found;
}

async function mount(value: EditorValue, readOnly = false): Promise<Mounted> {
  const original = HTMLElement.prototype.getBoundingClientRect;
  HTMLElement.prototype.getBoundingClientRect = function () {
    if (this.hasAttribute("data-slate-node")) {
      return domRect(300, 100, 400, 24);
    }
    return domRect(0, 0, 1280, 800);
  };
  const host = document.createElement("div");
  document.body.appendChild(host);
  const editor = createPlateEditor({ plugins: createEditorPlugins(), value });
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <EditorSurface editor={editor} readOnly={readOnly} placeholder="" className="editor" />,
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

async function unmount(mounted: Mounted): Promise<void> {
  await act(async () => {
    mounted.root.unmount();
  });
  mounted.host.remove();
  mounted.restore();
}

// Opens the block menu the way the keyboard does: Mod+/ on the selected block(s).
async function openMenu(mounted: Mounted, ids: string[]): Promise<void> {
  await act(async () => {
    setBlockSelection(mounted.editor, ids);
  });
  const editable = mounted.host.querySelector("[data-slate-editor]");
  await act(async () => {
    editable?.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "/",
        code: "Slash",
        metaKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  // The menu opens a couple of frames later. Each act flushes the state it caused.
  for (
    let attempt = 0;
    attempt < 10 && !document.querySelector("[data-block-menu]");
    attempt += 1
  ) {
    await act(async () => {
      await frames();
    });
  }
  if (!document.querySelector("[data-block-menu]")) {
    throw new Error("the block menu did not open");
  }
}

async function openColorSubmenu(): Promise<void> {
  await act(async () => {
    colorTrigger().dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }),
    );
  });
  if (!document.querySelector("[data-block-color-menu]")) {
    throw new Error("the Color submenu did not open");
  }
}

// A click closes the menu, and the editor restores focus a frame or two later. Let that finish
// before the next open. Each act flushes the state it caused.
async function click(element: HTMLElement): Promise<void> {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
  for (let frame = 0; frame < 3; frame += 1) {
    await act(async () => {
      await frames();
    });
  }
}

async function withEditor(
  value: EditorValue,
  body: (mounted: Mounted) => Promise<void>,
  readOnly = false,
): Promise<void> {
  const mounted = await mount(value, readOnly);
  try {
    await body(mounted);
  } finally {
    await unmount(mounted);
  }
}

describe("block color menu", () => {
  test("a paragraph takes a background in one undo and nothing else changes", async () => {
    const value = [
      paragraph("p1", "Plain "),
      { type: "p", id: "p2", children: [{ text: "Red", color: "red" }] },
    ] as EditorValue;
    await withEditor(value, async (mounted) => {
      const { editor } = mounted;
      const before = structuredClone(nodeOf(editor, "p1"));
      const undos = editor.history.undos.length;

      await openMenu(mounted, ["p1"]);
      await openColorSubmenu();
      await click(swatch("background", "blue"));

      const after = nodeOf(editor, "p1");
      expect(field(after, "backgroundTone")).toBe("blue");
      expect(withoutTones(after)).toEqual(withoutTones(before));
      expect(document.querySelector("[data-block-menu]")).toBeNull();
      expect(editor.history.undos.length).toBe(undos + 1);

      await act(async () => {
        editor.tf.undo();
      });
      expect(nodeOf(editor, "p1")).toEqual(before);
    });
  });

  test("the swatches show the stored tone, and Default background removes it", async () => {
    const value = [paragraph("p1", "Plain", { backgroundTone: "blue" })] as EditorValue;
    await withEditor(value, async (mounted) => {
      const { editor } = mounted;
      await openMenu(mounted, ["p1"]);
      await openColorSubmenu();

      expect(swatch("background", "blue").getAttribute("aria-pressed")).toBe("true");
      expect(swatch("background", "blue").getAttribute("aria-label")).toBe("Blue background");
      expect(swatch("text", "default").getAttribute("aria-pressed")).toBe("true");
      expect(swatch("text", "default").getAttribute("aria-label")).toBe("Default text");
      expect(swatch("background", "default").getAttribute("aria-pressed")).toBe("false");

      await click(swatch("background", "default"));
      expect(field(nodeOf(editor, "p1"), "backgroundTone")).toBeUndefined();

      await act(async () => {
        editor.tf.undo();
      });
      expect(field(nodeOf(editor, "p1"), "backgroundTone")).toBe("blue");
    });
  });

  test("text and background are stored independently on one block", async () => {
    const value = [paragraph("p1", "Plain", { backgroundTone: "blue" })] as EditorValue;
    await withEditor(value, async (mounted) => {
      const { editor } = mounted;
      await openMenu(mounted, ["p1"]);
      await openColorSubmenu();
      await click(swatch("text", "red"));

      const node = nodeOf(editor, "p1");
      expect(field(node, "textTone")).toBe("red");
      expect(field(node, "backgroundTone")).toBe("blue");
    });
  });

  test("a heading takes a tone on the heading element", async () => {
    await withEditor([heading("h", "Title")] as EditorValue, async (mounted) => {
      await openMenu(mounted, ["h"]);
      await openColorSubmenu();
      await click(swatch("background", "yellow"));
      expect(field(nodeOf(mounted.editor, "h"), "backgroundTone")).toBe("yellow");
    });
  });

  test("a quote takes a tone on the quote, not on the paragraph inside it", async () => {
    await withEditor([quote("q")] as EditorValue, async (mounted) => {
      await openMenu(mounted, ["q"]);
      await openColorSubmenu();
      await click(swatch("text", "green"));
      expect(field(nodeOf(mounted.editor, "q"), "textTone")).toBe("green");
      expect(field(nodeOf(mounted.editor, "q-p"), "textTone")).toBeUndefined();
    });
  });

  test.each([
    ["a callout", [callout("c")], "c"],
    ["a code block", [codeBlock("code")], "code"],
    ["a paragraph in a table cell", [table("t")], "t-cell-p"],
  ])("Color is disabled for %s and opens nothing", async (_label, blocks, id) => {
    await withEditor(blocks as EditorValue, async (mounted) => {
      await openMenu(mounted, [id]);
      const trigger = colorTrigger();
      expect(trigger.hasAttribute("data-disabled")).toBe(true);
      expect(trigger.textContent).toContain("Color is not available for this block.");

      await act(async () => {
        trigger.dispatchEvent(
          new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }),
        );
      });
      expect(document.querySelector("[data-block-color-menu]")).toBeNull();
    });
  });

  test("a multi selection colours the allowed blocks in one undo and keeps the selection", async () => {
    const value = [paragraph("p1", "One"), heading("h", "Two"), codeBlock("code")] as EditorValue;
    await withEditor(value, async (mounted) => {
      const { editor } = mounted;
      const code = structuredClone(nodeOf(editor, "code"));
      const undos = editor.history.undos.length;

      await openMenu(mounted, ["p1", "h", "code"]);
      expect(document.querySelector("[data-block-menu-count]")?.textContent).toBe("3 blocks");
      await openColorSubmenu();
      await click(swatch("background", "yellow"));

      expect(field(nodeOf(editor, "p1"), "backgroundTone")).toBe("yellow");
      expect(field(nodeOf(editor, "h"), "backgroundTone")).toBe("yellow");
      expect(nodeOf(editor, "code")).toEqual(code);
      expect(editor.history.undos.length).toBe(undos + 1);
      expect([...blockSelectionIds(editor)]).toEqual(["p1", "h", "code"]);

      await act(async () => {
        editor.tf.undo();
      });
      expect(field(nodeOf(editor, "p1"), "backgroundTone")).toBeUndefined();
      expect(field(nodeOf(editor, "h"), "backgroundTone")).toBeUndefined();
    });
  });

  test("a mixed selection says Mixed and presses no background swatch", async () => {
    const value = [
      paragraph("p1", "One", { backgroundTone: "yellow" }),
      paragraph("p2", "Two"),
    ] as EditorValue;
    await withEditor(value, async (mounted) => {
      await openMenu(mounted, ["p1", "p2"]);
      await openColorSubmenu();

      const background = document.querySelector("[role='group'][aria-label='Background · Mixed']");
      expect(background).not.toBeNull();
      expect(
        document.querySelector("[data-color-kind='background'][aria-pressed='true']"),
      ).toBeNull();
      expect(document.querySelector("[role='group'][aria-label='Text']")).not.toBeNull();
      expect(swatch("text", "default").getAttribute("aria-pressed")).toBe("true");
    });
  });

  test("a selection with no allowed block disables Color with the plural reason", async () => {
    const value = [codeBlock("code"), callout("c")] as EditorValue;
    await withEditor(value, async (mounted) => {
      await openMenu(mounted, ["code", "c"]);
      const trigger = colorTrigger();
      expect(trigger.hasAttribute("data-disabled")).toBe(true);
      expect(trigger.textContent).toContain("Color is not available for these blocks.");
    });
  });

  test("choosing the current value closes the menu and adds no history entry", async () => {
    const value = [paragraph("p1", "Plain", { backgroundTone: "blue" })] as EditorValue;
    await withEditor(value, async (mounted) => {
      const { editor } = mounted;
      const undos = editor.history.undos.length;
      await openMenu(mounted, ["p1"]);
      await openColorSubmenu();
      await click(swatch("background", "blue"));

      expect(document.querySelector("[data-block-menu]")).toBeNull();
      expect(editor.history.undos.length).toBe(undos);
      expect(field(nodeOf(editor, "p1"), "backgroundTone")).toBe("blue");
    });
  });

  test("Color sits after Turn into and before Duplicate for one block", async () => {
    await withEditor([paragraph("p1", "Plain")] as EditorValue, async (mounted) => {
      await openMenu(mounted, ["p1"]);
      const turn = document.querySelector("[data-block-menu-turn-into]");
      const color = colorTrigger();
      const duplicate = findItem("Duplicate");
      expect(turn).not.toBeNull();
      expect(duplicate).not.toBeNull();
      expect(isBefore(turn, color)).toBe(true);
      expect(isBefore(color, duplicate)).toBe(true);
    });
  });

  test("Color sits before Duplicate for a multi selection", async () => {
    await withEditor(
      [paragraph("p1", "One"), paragraph("p2", "Two")] as EditorValue,
      async (mounted) => {
        await openMenu(mounted, ["p1", "p2"]);
        const count = document.querySelector("[data-block-menu-count]");
        const color = colorTrigger();
        const duplicate = findItem("Duplicate");
        expect(isBefore(count, color)).toBe(true);
        expect(isBefore(color, duplicate)).toBe(true);
      },
    );
  });

  test("the keyboard alone chooses a swatch", async () => {
    await withEditor([paragraph("p1", "Plain")] as EditorValue, async (mounted) => {
      const { editor } = mounted;
      await openMenu(mounted, ["p1"]);
      await act(async () => {
        colorTrigger().focus();
      });
      await openColorSubmenu();

      const press = async (key: string): Promise<void> => {
        await act(async () => {
          document.activeElement?.dispatchEvent(
            new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
          );
        });
      };
      const focusedToken = (): string | null | undefined =>
        document.activeElement?.getAttribute("data-color-token");

      // Walk the text grid to Red text: one step per swatch after Default.
      await press("ArrowDown");
      expect(focusedToken()).toBe(PALETTE_TOKENS[4] ?? null);
      await press("ArrowUp");
      expect(focusedToken()).toBe("default");
      for (let step = 0; step <= PALETTE_TOKENS.indexOf("red"); step += 1) {
        await press("ArrowRight");
      }
      expect(focusedToken()).toBe("red");
      await press("Enter");

      expect(document.querySelector("[data-block-menu]")).toBeNull();
      expect(field(nodeOf(editor, "p1"), "textTone")).toBe("red");
    });
  });

  test("Escape closes the Color submenu and keeps the block menu open", async () => {
    await withEditor([paragraph("p1", "Plain")] as EditorValue, async (mounted) => {
      await openMenu(mounted, ["p1"]);
      await act(async () => {
        colorTrigger().focus();
      });
      await openColorSubmenu();
      await act(async () => {
        document.activeElement?.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
        );
      });

      expect(document.querySelector("[data-block-color-menu]")).toBeNull();
      expect(document.querySelector("[data-block-menu]")).not.toBeNull();
      expect(document.activeElement).toBe(colorTrigger());
    });
  });

  test("a read-only editor opens no block menu and no Color submenu", async () => {
    await withEditor(
      [paragraph("p1", "Plain")] as EditorValue,
      async (mounted) => {
        const block = mounted.host.querySelector("[data-block-id='p1']");
        await act(async () => {
          block?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
        });
        expect(document.querySelector("[data-block-menu]")).toBeNull();
        expect(document.querySelector("[data-block-color-menu]")).toBeNull();
      },
      true,
    );
  });

  test("the demo paragraph has a blue background and the demo document validates", () => {
    const block = DEMO_DOCUMENT_VALUE.find((item) => item.id === "demo-block-color");
    expect(block?.type).toBe("p");
    expect(field(block, "backgroundTone")).toBe("blue");

    const parsed = expectOk(parseEditorDocument(createEditorDocument("demo", DEMO_DOCUMENT_VALUE)));
    expect(parsed.repairs).toEqual([]);
  });
});

function findItem(text: string): Element | undefined {
  return Array.from(document.querySelectorAll("[data-block-menu] [role='menuitem']")).find(
    (item) => item.textContent === text,
  );
}

function isBefore(first: Element | null | undefined, second: Element | null | undefined): boolean {
  if (!first || !second) {
    return false;
  }
  return (first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
}

// A real mouse press: the same event sequence a browser sends, bubbling from the element.
// Chrome fires focusout with a null relatedTarget from a focused element that is removed, while
// the element is still attached. Happy-dom does not, so the removal is simulated here.
function simulateRemovalFocusout(): () => void {
  const original = Node.prototype.removeChild;
  const spy = spyOn(Node.prototype, "removeChild").mockImplementation(function <T extends Node>(
    this: Node,
    child: T,
  ): T {
    const active = document.activeElement;
    if (active instanceof HTMLElement && child instanceof Element && child.contains(active)) {
      active.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: null }));
    }
    original.call(this, child);
    // removeChild returns the child it was given.
    return child;
  });
  return () => {
    spy.mockRestore();
  };
}

async function pointerPress(element: HTMLElement): Promise<void> {
  const init = { bubbles: true, cancelable: true, button: 0, clientX: 10, clientY: 10 };
  const restore = simulateRemovalFocusout();
  await act(async () => {
    element.dispatchEvent(
      new PointerEvent("pointerdown", { ...init, pointerType: "mouse", isPrimary: true }),
    );
    element.dispatchEvent(new MouseEvent("mousedown", init));
    // The browser focuses the pressed menu item as the mousedown default action.
    element.focus();
    element.dispatchEvent(
      new PointerEvent("pointerup", { ...init, pointerType: "mouse", isPrimary: true }),
    );
    element.dispatchEvent(new MouseEvent("mouseup", init));
    element.dispatchEvent(new MouseEvent("click", init));
  });
  restore();
  for (let frame = 0; frame < 3; frame += 1) {
    await act(async () => {
      await frames();
    });
  }
}

function markedBlocks(): number {
  return document.querySelectorAll("[data-block-selected]").length;
}

describe("block color menu selection after a mouse choice", () => {
  test("a multi-block mouse choice keeps the selection the way Duplicate does", async () => {
    const value = [
      paragraph("p1", "One"),
      heading("h", "Two"),
      paragraph("p2", "Three"),
    ] as EditorValue;
    await withEditor(value, async (mounted) => {
      const { editor } = mounted;
      const ids = ["p1", "h", "p2"];
      await openMenu(mounted, ids);
      await openColorSubmenu();
      await pointerPress(swatch("background", "green"));

      expect(field(nodeOf(editor, "p1"), "backgroundTone")).toBe("green");
      expect([...blockSelectionIds(editor)]).toEqual(ids);
      expect(markedBlocks()).toBe(ids.length);
    });
  });
});
