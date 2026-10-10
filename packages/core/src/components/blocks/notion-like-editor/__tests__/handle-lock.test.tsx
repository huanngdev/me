import { describe, expect, test } from "bun:test";
import { KEYS, type TElement } from "platejs";
import { createPlateEditor } from "platejs/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { EditorSurface } from "../components/editor/editor-surface";
import type { EditorValue } from "../lib/document/editor-value";
import { createEditorPlugins } from "../lib/plugins/editor-plugins";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

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

function isReactContainer(value: object): value is Parameters<typeof createRoot>[0] {
  return "nodeType" in value && value.nodeType === 1;
}

type Mounted = {
  host: HTMLDivElement;
  editor: ReturnType<typeof createPlateEditor>;
  root: Root;
  cleanup: () => Promise<void>;
};

// Each top-level block gets its own vertical box, 40px apart, so the pointer's
// Y resolves to a distinct target row and a sweep crosses all of them.
function installRects(ids: readonly string[]): () => void {
  const previousWidth = window.innerWidth;
  const previousHeight = window.innerHeight;
  const original = HTMLElement.prototype.getBoundingClientRect;
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1280 });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
  HTMLElement.prototype.getBoundingClientRect = function () {
    if (
      this.hasAttribute("data-block-handle") ||
      this.hasAttribute("data-block-handle-add") ||
      this.hasAttribute("data-block-handle-grip")
    ) {
      return domRect(230, 96, 66, 32);
    }
    if (this.hasAttribute("data-block-id")) {
      const id = this.getAttribute("data-block-id") ?? "";
      const index = ids.indexOf(id);
      return domRect(300, 100 + Math.max(0, index) * 40, 400, 24);
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

async function mountBlocks(value: TElement[]): Promise<Mounted> {
  const ids = value.flatMap((node) => (typeof node.id === "string" ? [node.id] : []));
  const restore = installRects(ids);
  const host = document.createElement("div");
  host.setAttribute("data-block-viewport", "");
  document.body.appendChild(host);
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
    cleanup: async () => {
      await act(async () => {
        root.unmount();
      });
      host.remove();
      restore();
    },
  };
}

function threeBlocks(): TElement[] {
  return [
    { type: KEYS.p, id: "block-1", children: [{ text: "One" }] },
    { type: KEYS.p, id: "block-2", children: [{ text: "Two" }] },
    { type: KEYS.p, id: "block-3", children: [{ text: "Three" }] },
  ];
}

function pointerMove(clientY: number): PointerEvent {
  return new PointerEvent("pointermove", {
    bubbles: true,
    cancelable: true,
    clientX: 320,
    clientY,
    pointerType: "mouse",
    isPrimary: true,
  });
}

async function hover(host: HTMLElement, id: string): Promise<void> {
  const block = host.querySelector(`[data-block-id="${id}"]`);
  await act(async () => {
    block?.dispatchEvent(pointerMove((block?.getBoundingClientRect().top ?? 0) + 5));
  });
}

function handleFor(): string | null {
  return (
    document.querySelector("[data-block-handle]")?.getAttribute("data-block-handle-for") ?? null
  );
}

function handleTop(): string {
  return document.querySelector<HTMLElement>("[data-block-handle]")?.style.top ?? "";
}

async function openAddMenu(): Promise<HTMLElement> {
  const add = document.querySelector("[data-block-handle-add]");
  if (!(add instanceof HTMLElement)) {
    throw new Error("Missing add button.");
  }
  await act(async () => {
    add.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        button: 0,
        pointerType: "mouse",
        isPrimary: true,
      } as PointerEventInit),
    );
  });
  const menu = document.querySelector("[data-block-add-menu]");
  if (!(menu instanceof HTMLElement)) {
    throw new Error("Missing add menu.");
  }
  return menu;
}

async function openBlockMenu(): Promise<HTMLElement> {
  const grip = document.querySelector("[data-block-handle-grip]");
  if (!(grip instanceof HTMLElement)) {
    throw new Error("Missing grip.");
  }
  await act(async () => {
    grip.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  const menu = document.querySelector("[data-block-menu]");
  if (!(menu instanceof HTMLElement)) {
    throw new Error("Missing block menu.");
  }
  return menu;
}

async function sweep(target: EventTarget, from: number, to: number): Promise<void> {
  for (let y = from; y <= to; y += 4) {
    await act(async () => {
      target.dispatchEvent(pointerMove(y));
    });
  }
}

describe("handle lock — Add menu", () => {
  test("the handle target and position stay frozen while the pointer sweeps rows", async () => {
    const mounted = await mountBlocks(threeBlocks());
    try {
      await hover(mounted.host, "block-1");
      expect(handleFor()).toBe("block-1");
      const menu = await openAddMenu();
      const frozenTop = handleTop();

      const targets: Array<string | null> = [];
      const tops: string[] = [];
      for (let y = 105; y <= 175; y += 4) {
        await act(async () => {
          menu.dispatchEvent(pointerMove(y));
        });
        targets.push(handleFor());
        tops.push(handleTop());
      }

      expect(new Set(targets)).toEqual(new Set(["block-1"]));
      expect(new Set(tops)).toEqual(new Set([frozenTop]));
    } finally {
      await mounted.cleanup();
    }
  });

  test("choosing an item inserts below the block the menu was opened for", async () => {
    const mounted = await mountBlocks(threeBlocks());
    try {
      await hover(mounted.host, "block-1");
      const menu = await openAddMenu();
      // The pointer leaves the anchor row and sits over block-2's row.
      await act(async () => {
        menu.dispatchEvent(pointerMove(145));
      });
      const item = menu.querySelector("[data-block-picker-item='h1']");
      await act(async () => {
        item?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      });

      const ids = mounted.editor.children.map((node) => ("id" in node ? node.id : null));
      expect(ids[0]).toBe("block-1");
      expect(mounted.editor.children[1]?.type).toBe(KEYS.h1);
      expect(ids[2]).toBe("block-2");
      expect(ids[3]).toBe("block-3");
    } finally {
      await mounted.cleanup();
    }
  });

  test("closing releases the lock and the next pointer move retargets", async () => {
    const mounted = await mountBlocks(threeBlocks());
    try {
      await hover(mounted.host, "block-1");
      const menu = await openAddMenu();
      await act(async () => {
        menu.dispatchEvent(pointerMove(145));
      });
      await act(async () => {
        menu.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      });
      expect(document.querySelector("[data-block-add-menu]")).toBeNull();

      await act(async () => {
        window.dispatchEvent(pointerMove(185));
      });
      expect(handleFor()).toBe("block-3");
    } finally {
      await mounted.cleanup();
    }
  });

  test("keys inside the open menu do not hide the frozen handle", async () => {
    const mounted = await mountBlocks(threeBlocks());
    try {
      await hover(mounted.host, "block-1");
      const menu = await openAddMenu();
      await act(async () => {
        menu.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
      });
      const handle = document.querySelector("[data-block-handle]");
      expect(handle?.getAttribute("data-visible")).toBe("true");
      expect(handleFor()).toBe("block-1");
    } finally {
      await mounted.cleanup();
    }
  });
});

describe("handle lock — block menu and submenu", () => {
  test("the block menu keeps the handle target through a pointer sweep", async () => {
    const mounted = await mountBlocks(threeBlocks());
    try {
      await hover(mounted.host, "block-1");
      const menu = await openBlockMenu();
      const frozenTop = handleTop();
      await sweep(menu, 105, 175);
      expect(handleFor()).toBe("block-1");
      expect(handleTop()).toBe(frozenTop);
    } finally {
      await mounted.cleanup();
    }
  });

  test("the Turn into submenu keeps the handle target through a pointer sweep", async () => {
    const mounted = await mountBlocks(threeBlocks());
    try {
      await hover(mounted.host, "block-1");
      await openBlockMenu();
      const trigger = document.querySelector("[data-block-menu-turn-into]");
      await act(async () => {
        trigger?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      });
      const submenu = document.querySelector("[data-block-turn-into-menu]");
      expect(submenu).not.toBeNull();
      const frozenTop = handleTop();
      if (submenu instanceof HTMLElement) {
        await sweep(submenu, 105, 175);
      }
      expect(handleFor()).toBe("block-1");
      expect(handleTop()).toBe(frozenTop);
    } finally {
      await mounted.cleanup();
    }
  });
});
