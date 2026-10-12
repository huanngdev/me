import { afterEach, describe, expect, test } from "bun:test";
import { KEYS, type SlateEditor, type TRange } from "platejs";
import { createPlateEditor } from "platejs/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { EditorSurface } from "../components/editor/editor-surface";
import type { EditorValue } from "../lib/document/editor-value";
import { findState } from "../lib/plugins/editor-find";
import { isFindOpenKey, isHighlightVisible, isMacPlatform } from "../lib/plugins/editor-find-ui";
import { createEditorPlugins } from "../lib/plugins/editor-plugins";
import { texts } from "./test-utils";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
Reflect.set(globalThis, "innerWidth", 1280);
Reflect.set(globalThis, "innerHeight", 800);
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
}

const MOD: KeyboardEventInit = isMacPlatform() ? { metaKey: true } : { ctrlKey: true };

function para(id: string, text: string): EditorValue[number] {
  return { type: KEYS.p, id, children: [{ text }] } as unknown as EditorValue[number];
}

function stubAnimationFrame(): () => void {
  const previousFrame = Reflect.get(globalThis, "requestAnimationFrame");
  const previousCancel = Reflect.get(globalThis, "cancelAnimationFrame");
  // Async, like a frame: the highlight is in the DOM when the callback runs.
  Reflect.set(globalThis, "requestAnimationFrame", (callback: FrameRequestCallback) => {
    setTimeout(() => callback(0), 0);
    return 1;
  });
  Reflect.set(globalThis, "cancelAnimationFrame", () => {});
  return () => {
    Reflect.set(globalThis, "requestAnimationFrame", previousFrame);
    Reflect.set(globalThis, "cancelAnimationFrame", previousCancel);
  };
}

type Mounted = {
  root: Root;
  before: Set<ChildNode>;
  restoreFrame: () => void;
};

const mounted: Mounted[] = [];

// Unmounts and removes one mount. Runs from cleanup() or, after a failed test, from afterEach.
async function teardown(entry: Mounted): Promise<void> {
  await act(async () => {
    entry.root.unmount();
  });
  for (const node of Array.from(document.body.childNodes)) {
    if (!entry.before.has(node)) {
      node.remove();
    }
  }
  entry.restoreFrame();
}

afterEach(async () => {
  for (const entry of mounted.splice(0)) {
    await teardown(entry);
  }
});

async function mount(value: EditorValue, readOnly = false) {
  const restoreFrame = stubAnimationFrame();
  const before = new Set(Array.from(document.body.childNodes));
  const host = document.createElement("div");
  document.body.appendChild(host);
  const editor = createPlateEditor({ plugins: createEditorPlugins(), value });
  const root = createRoot(host);
  const entry: Mounted = { root, before, restoreFrame };
  mounted.push(entry);
  await act(async () => {
    root.render(
      <EditorSurface editor={editor} readOnly={readOnly} placeholder="" className="editor" />,
    );
  });
  return {
    editor,
    host,
    rerender: async (next: boolean) => {
      await act(async () => {
        root.render(
          <EditorSurface editor={editor} readOnly={next} placeholder="" className="editor" />,
        );
      });
    },
    cleanup: async () => {
      const index = mounted.indexOf(entry);
      if (index >= 0) {
        mounted.splice(index, 1);
      }
      await teardown(entry);
    },
  };
}

function editableOf(): HTMLElement {
  const editable = document.querySelector("[data-slate-editor]");
  if (!(editable instanceof HTMLElement)) {
    throw new Error("Missing editable.");
  }
  return editable;
}

function bar(): HTMLElement | null {
  return document.querySelector("[data-find-bar]");
}

function findInput(): HTMLInputElement {
  const input = document.querySelector("[data-find-input]");
  if (!(input instanceof HTMLInputElement)) {
    throw new Error("Missing find input.");
  }
  return input;
}

function replaceInput(): HTMLInputElement {
  const input = document.querySelector("[data-find-replace-input]");
  if (!(input instanceof HTMLInputElement)) {
    throw new Error("Missing replace input.");
  }
  return input;
}

function countText(): string {
  return document.querySelector("[data-find-count]")?.textContent ?? "";
}

function button(label: string): HTMLButtonElement | null {
  const node = document.querySelector(`[aria-label="${label}"]`);
  return node instanceof HTMLButtonElement ? node : null;
}

function clickable(label: string): HTMLButtonElement {
  const node = button(label);
  if (node === null) {
    throw new Error(`Missing button ${label}.`);
  }
  return node;
}

function keydown(target: Element, init: KeyboardEventInit): boolean {
  return target.dispatchEvent(
    new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }),
  );
}

async function pressIn(target: Element, init: KeyboardEventInit): Promise<boolean> {
  let notCancelled = true;
  await act(async () => {
    notCancelled = keydown(target, init);
  });
  return notCancelled;
}

async function type(input: HTMLInputElement, value: string): Promise<void> {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function click(node: HTMLElement): Promise<void> {
  await act(async () => {
    node.click();
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
  });
}

async function select(editor: SlateEditor, range: TRange): Promise<void> {
  await act(async () => {
    editor.tf.select(range);
  });
}

describe("find key", () => {
  test("Mod+F opens on macOS with Cmd and elsewhere with Ctrl, with no Shift or Alt", () => {
    expect(
      isFindOpenKey(
        { key: "f", metaKey: true, ctrlKey: false, shiftKey: false, altKey: false },
        true,
      ),
    ).toBe(true);
    expect(
      isFindOpenKey(
        { key: "f", ctrlKey: true, metaKey: false, shiftKey: false, altKey: false },
        true,
      ),
    ).toBe(false);
    expect(
      isFindOpenKey(
        { key: "f", ctrlKey: true, metaKey: false, shiftKey: false, altKey: false },
        false,
      ),
    ).toBe(true);
    expect(
      isFindOpenKey(
        { key: "f", metaKey: true, ctrlKey: false, shiftKey: false, altKey: false },
        false,
      ),
    ).toBe(false);
    expect(
      isFindOpenKey(
        { key: "f", metaKey: true, ctrlKey: false, shiftKey: true, altKey: false },
        true,
      ),
    ).toBe(false);
    expect(
      isFindOpenKey(
        { key: "f", metaKey: true, ctrlKey: false, shiftKey: false, altKey: true },
        true,
      ),
    ).toBe(false);
    expect(
      isFindOpenKey(
        { key: "g", metaKey: true, ctrlKey: false, shiftKey: false, altKey: false },
        true,
      ),
    ).toBe(false);
  });
});

describe("opening the bar", () => {
  test("Mod+F in the editor opens the bar, focuses the find input and prevents the browser find", async () => {
    const view = await mount([para("p1", "alpha")] as EditorValue);
    const notCancelled = await pressIn(editableOf(), { key: "f", ...MOD });

    expect(notCancelled).toBe(false);
    expect(bar()).not.toBeNull();
    expect(document.activeElement).toBe(findInput());
    await view.cleanup();
  });

  test("a one-block selection prefills the query and a multi-block selection does not", async () => {
    const view = await mount([para("p1", "alpha beta gamma"), para("p2", "delta")] as EditorValue);
    await select(view.editor, {
      anchor: { path: [0, 0], offset: 6 },
      focus: { path: [0, 0], offset: 10 },
    });
    await pressIn(editableOf(), { key: "f", ...MOD });
    expect(findInput().value).toBe("beta");
    expect(findState(view.editor).query).toBe("beta");

    await act(async () => {
      keydown(findInput(), { key: "Escape" });
    });
    await view.cleanup();

    const multi = await mount([para("p1", "alpha beta"), para("p2", "delta")] as EditorValue);
    await select(multi.editor, {
      anchor: { path: [0, 0], offset: 1 },
      focus: { path: [1, 0], offset: 2 },
    });
    await pressIn(editableOf(), { key: "f", ...MOD });
    expect(findInput().value).toBe("");
    expect(findState(multi.editor).query).toBe("");
    await multi.cleanup();
  });

  test("a selection longer than 200 characters does not prefill", async () => {
    const long = "a".repeat(201);
    const view = await mount([para("p1", long)] as EditorValue);
    await select(view.editor, {
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [0, 0], offset: 201 },
    });
    await pressIn(editableOf(), { key: "f", ...MOD });
    expect(findInput().value).toBe("");
    await view.cleanup();
  });

  test("Mod+F while the focus is in the bar selects the find input text and is prevented", async () => {
    const view = await mount([para("p1", "alpha")] as EditorValue);
    await pressIn(editableOf(), { key: "f", ...MOD });
    await type(findInput(), "alpha");
    findInput().setSelectionRange(0, 0);

    const notCancelled = await pressIn(findInput(), { key: "f", ...MOD });

    expect(notCancelled).toBe(false);
    expect(findInput().selectionStart).toBe(0);
    expect(findInput().selectionEnd).toBe(5);
    await view.cleanup();
  });

  test("Ctrl+Shift+F and Mod+Alt+F do nothing", async () => {
    const view = await mount([para("p1", "alpha")] as EditorValue);
    const shifted = await pressIn(editableOf(), { key: "F", ctrlKey: true, shiftKey: true });
    const alted = await pressIn(editableOf(), { key: "f", ...MOD, altKey: true });

    expect(shifted).toBe(true);
    expect(alted).toBe(true);
    expect(bar()).toBeNull();
    await view.cleanup();
  });
});

describe("count and navigation", () => {
  test("the count shows nothing, no results, n of m and n of 1000+", async () => {
    const view = await mount([para("p1", "alpha"), para("p2", "aaaa".repeat(1))] as EditorValue);
    await pressIn(editableOf(), { key: "f", ...MOD });
    expect(countText()).toBe("");

    await type(findInput(), "zzz");
    expect(countText()).toBe("No results");

    await type(findInput(), "alp");
    expect(countText()).toBe("1 of 1");
    await view.cleanup();

    const big = await mount([para("p1", "a".repeat(1001))] as EditorValue);
    await pressIn(editableOf(), { key: "f", ...MOD });
    await type(findInput(), "a");
    expect(countText()).toBe("1 of 1000+");
    await big.cleanup();
  });

  test("Enter, Shift+Enter and the arrow buttons move the active match and wrap", async () => {
    const view = await mount([para("p1", "a a a")] as EditorValue);
    await pressIn(editableOf(), { key: "f", ...MOD });
    await type(findInput(), "a");
    expect(countText()).toBe("1 of 3");

    await pressIn(findInput(), { key: "Enter" });
    expect(countText()).toBe("2 of 3");
    await pressIn(findInput(), { key: "Enter", shiftKey: true });
    expect(countText()).toBe("1 of 3");
    await pressIn(findInput(), { key: "Enter", shiftKey: true });
    expect(countText()).toBe("3 of 3");

    await click(clickable("Next match"));
    expect(countText()).toBe("1 of 3");
    await click(clickable("Previous match"));
    expect(countText()).toBe("3 of 3");
    expect(document.querySelectorAll("[data-find-active]")).toHaveLength(1);
    await view.cleanup();
  });

  test("navigation and replace-all are disabled with no matches", async () => {
    const view = await mount([para("p1", "alpha")] as EditorValue);
    await pressIn(editableOf(), { key: "f", ...MOD });
    await type(findInput(), "zzz");

    expect(clickable("Next match").disabled).toBe(true);
    expect(clickable("Previous match").disabled).toBe(true);
    await click(clickable("Toggle replace"));
    expect(clickable("Replace all").disabled).toBe(true);
    expect(clickable("Replace").disabled).toBe(true);
    await view.cleanup();
  });

  test("the match case toggle changes the pressed state and the count", async () => {
    const view = await mount([para("p1", "Foo foo")] as EditorValue);
    await pressIn(editableOf(), { key: "f", ...MOD });
    await type(findInput(), "foo");
    expect(countText()).toBe("1 of 2");

    await click(clickable("Match case"));
    expect(clickable("Match case").getAttribute("aria-pressed")).toBe("true");
    expect(countText()).toBe("1 of 1");
    await view.cleanup();
  });

  test("the replace toggle shows the replace row", async () => {
    const view = await mount([para("p1", "alpha")] as EditorValue);
    await pressIn(editableOf(), { key: "f", ...MOD });
    expect(document.querySelector("[data-find-replace-input]")).toBeNull();

    await click(clickable("Toggle replace"));
    expect(clickable("Toggle replace").getAttribute("aria-expanded")).toBe("true");
    expect(document.querySelector("[data-find-replace-input]")).not.toBeNull();
    await view.cleanup();
  });

  test("moving the active match scrolls it into view only when it is outside the viewport", async () => {
    const view = await mount([para("p1", "a a a")] as EditorValue);
    await pressIn(editableOf(), { key: "f", ...MOD });
    await type(findInput(), "a");

    const calls: { node: Element; options: unknown }[] = [];
    const originalScroll = Reflect.get(HTMLElement.prototype, "scrollIntoView");
    const originalRect = HTMLElement.prototype.getBoundingClientRect;
    let offscreen = false;
    Reflect.set(
      HTMLElement.prototype,
      "scrollIntoView",
      function (this: Element, options: unknown) {
        calls.push({ node: this, options });
      },
    );
    HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
      const top = offscreen && this.hasAttribute("data-find-active") ? 5000 : 300;
      return {
        top,
        bottom: top + 10,
        left: 0,
        right: 10,
        width: 10,
        height: 10,
        x: 0,
        y: top,
        toJSON: () => ({}),
      } as DOMRect;
    };
    try {
      await click(clickable("Next match"));
      expect(calls).toHaveLength(0);

      offscreen = true;
      await click(clickable("Next match"));
      expect(calls).toHaveLength(1);
      expect(calls[0]?.node.hasAttribute("data-find-active")).toBe(true);
      expect(calls[0]?.options).toEqual({ block: "center", inline: "nearest" });
    } finally {
      Reflect.set(HTMLElement.prototype, "scrollIntoView", originalScroll);
      HTMLElement.prototype.getBoundingClientRect = originalRect;
    }
    await view.cleanup();
  });
});

describe("replace", () => {
  test("Replace replaces the active match and the next one becomes active", async () => {
    const view = await mount([para("p1", "foo foo foo")] as EditorValue);
    await pressIn(editableOf(), { key: "f", ...MOD });
    await type(findInput(), "foo");
    await click(clickable("Toggle replace"));
    await type(replaceInput(), "X");

    await click(clickable("Replace"));
    expect(texts(view.editor)).toEqual(["X foo foo"]);
    expect(countText()).toBe("1 of 2");

    await click(clickable("Replace"));
    expect(texts(view.editor)).toEqual(["X X foo"]);
    expect(countText()).toBe("1 of 1");
    await view.cleanup();
  });

  test("Enter in the replace input replaces the current match", async () => {
    const view = await mount([para("p1", "foo foo")] as EditorValue);
    await pressIn(editableOf(), { key: "f", ...MOD });
    await type(findInput(), "foo");
    await click(clickable("Toggle replace"));
    await type(replaceInput(), "Y");

    await pressIn(replaceInput(), { key: "Enter" });
    expect(texts(view.editor)).toEqual(["Y foo"]);
    await view.cleanup();
  });

  test("Replace all replaces everything in one undo step and undo restores the document", async () => {
    const view = await mount([para("p1", "foo bar foo")] as EditorValue);
    const before = JSON.parse(JSON.stringify(view.editor.children));
    await pressIn(editableOf(), { key: "f", ...MOD });
    await type(findInput(), "foo");
    await click(clickable("Toggle replace"));
    await type(replaceInput(), "baz");

    await click(clickable("Replace all"));
    expect(texts(view.editor)).toEqual(["baz bar baz"]);

    await act(async () => {
      view.editor.tf.undo();
    });
    expect(JSON.parse(JSON.stringify(view.editor.children))).toEqual(before);
    await view.cleanup();
  });

  test("Replace all is disabled when the result is truncated", async () => {
    const view = await mount([para("p1", "a".repeat(1001))] as EditorValue);
    await pressIn(editableOf(), { key: "f", ...MOD });
    await type(findInput(), "a");
    await click(clickable("Toggle replace"));

    expect(clickable("Replace all").disabled).toBe(true);
    await view.cleanup();
  });

  test("a read-only editor has no replace toggle and find still counts", async () => {
    const view = await mount([para("p1", "foo")] as EditorValue, true);
    await pressIn(editableOf(), { key: "f", ...MOD });
    await type(findInput(), "foo");

    expect(countText()).toBe("1 of 1");
    expect(button("Toggle replace")).toBeNull();
    expect(document.querySelector("[data-find-replace-input]")).toBeNull();
    await view.cleanup();
  });
});

describe("closing", () => {
  test("Escape closes the bar, removes the highlights and selects the active match", async () => {
    const view = await mount([para("p1", "one two two")] as EditorValue);
    await pressIn(editableOf(), { key: "f", ...MOD });
    await type(findInput(), "two");
    await pressIn(findInput(), { key: "Enter" });

    await pressIn(findInput(), { key: "Escape" });

    expect(bar()).toBeNull();
    expect(document.querySelectorAll("[data-find-match]")).toHaveLength(0);
    expect(view.editor.selection).toEqual({
      anchor: { path: [0, 0], offset: 8 },
      focus: { path: [0, 0], offset: 11 },
    });
    await view.cleanup();
  });

  test("the Close button closes the bar and keeps the previous selection when nothing matches", async () => {
    const view = await mount([para("p1", "alpha")] as EditorValue);
    await select(view.editor, {
      anchor: { path: [0, 0], offset: 2 },
      focus: { path: [0, 0], offset: 2 },
    });
    await pressIn(editableOf(), { key: "f", ...MOD });
    await type(findInput(), "zzz");

    await click(clickable("Close"));

    expect(bar()).toBeNull();
    expect(view.editor.selection).toEqual({
      anchor: { path: [0, 0], offset: 2 },
      focus: { path: [0, 0], offset: 2 },
    });
    await view.cleanup();
  });
});

describe("live state and keys", () => {
  test("the count updates when the document changes while the bar is open", async () => {
    const view = await mount([para("p1", "a")] as EditorValue);
    await pressIn(editableOf(), { key: "f", ...MOD });
    await type(findInput(), "a");
    expect(countText()).toBe("1 of 1");

    await act(async () => {
      view.editor.tf.insertText("a", { at: { path: [0, 0], offset: 1 } });
    });
    expect(countText()).toBe("1 of 2");
    await view.cleanup();
  });

  test("Enter while an IME composition is running does nothing", async () => {
    const view = await mount([para("p1", "a a")] as EditorValue);
    await pressIn(editableOf(), { key: "f", ...MOD });
    await type(findInput(), "a");
    expect(countText()).toBe("1 of 2");

    const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    Object.defineProperty(event, "isComposing", { value: true });
    await act(async () => {
      findInput().dispatchEvent(event);
    });

    expect(countText()).toBe("1 of 2");
    await view.cleanup();
  });

  test("opening, typing, navigating and closing create no history entry", async () => {
    const view = await mount([para("p1", "a a a")] as EditorValue);
    const undos = view.editor.history.undos.length;

    await pressIn(editableOf(), { key: "f", ...MOD });
    await type(findInput(), "a");
    await pressIn(findInput(), { key: "Enter" });
    await click(clickable("Next match"));
    await pressIn(findInput(), { key: "Escape" });

    expect(view.editor.history.undos.length).toBe(undos);
    await view.cleanup();
  });
});

describe("visibility of the active match", () => {
  const scroller = { top: 154, bottom: 835, left: 0, right: 1000 };

  test("a match inside the scroller, below the top 96px, is visible", () => {
    expect(isHighlightVisible({ top: 300, bottom: 320, left: 10, right: 60 }, scroller)).toBe(true);
  });

  test("a match under the top 96px of the scroller is not visible", () => {
    expect(isHighlightVisible({ top: 200, bottom: 220, left: 10, right: 60 }, scroller)).toBe(
      false,
    );
    expect(isHighlightVisible({ top: 154, bottom: 170, left: 10, right: 60 }, scroller)).toBe(
      false,
    );
  });

  test("a match below the scroller's bottom edge is not visible, even inside the window", () => {
    expect(isHighlightVisible({ top: 840, bottom: 860, left: 10, right: 60 }, scroller)).toBe(
      false,
    );
  });

  test("a match outside the horizontal bounds is not visible", () => {
    expect(isHighlightVisible({ top: 300, bottom: 320, left: -5, right: 60 }, scroller)).toBe(
      false,
    );
    expect(isHighlightVisible({ top: 300, bottom: 320, left: 10, right: 1001 }, scroller)).toBe(
      false,
    );
  });
});

describe("the bar as a popover", () => {
  test("the bar is portalled to the body with the search attributes", async () => {
    const view = await mount([para("p1", "alpha")] as EditorValue);
    await pressIn(editableOf(), { key: "f", ...MOD });

    const node = bar();
    expect(node).not.toBeNull();
    expect(document.body.contains(node)).toBe(true);
    expect(view.host.contains(node)).toBe(false);
    expect(node?.getAttribute("role")).toBe("search");
    expect(node?.getAttribute("aria-label")).toBe("Find in document");
    expect(node?.contains(findInput())).toBe(true);
    await view.cleanup();
  });

  test("clicking a bar button keeps focus in the find input", async () => {
    const view = await mount([para("p1", "a a a")] as EditorValue);
    await pressIn(editableOf(), { key: "f", ...MOD });
    await type(findInput(), "a");
    findInput().focus();

    const notCancelled = await mouseDownOn(clickable("Next match"));

    expect(notCancelled).toBe(false);
    expect(document.activeElement).toBe(findInput());
    await view.cleanup();
  });

  test("a mousedown on the find input is not prevented, so the caret can be placed", async () => {
    const view = await mount([para("p1", "a a a")] as EditorValue);
    await pressIn(editableOf(), { key: "f", ...MOD });

    expect(await mouseDownOn(findInput())).toBe(true);
    await view.cleanup();
  });

  test("a mousedown on a disabled button keeps focus in the find input", async () => {
    const view = await mount([para("p1", "alpha")] as EditorValue);
    await pressIn(editableOf(), { key: "f", ...MOD });
    await type(findInput(), "zzz");
    findInput().focus();

    await mouseDownOn(clickable("Next match"));

    expect(document.activeElement).toBe(findInput());
    await view.cleanup();
  });

  test("Escape in the bar still closes it after a button click", async () => {
    const view = await mount([para("p1", "a a a")] as EditorValue);
    await pressIn(editableOf(), { key: "f", ...MOD });
    await type(findInput(), "a");
    findInput().focus();
    await mouseDownOn(clickable("Next match"));
    await click(clickable("Next match"));

    await pressIn(findInput(), { key: "Escape" });

    expect(bar()).toBeNull();
    await view.cleanup();
  });

  test("a pointer down outside the bar does not close it", async () => {
    const view = await mount([para("p1", "alpha")] as EditorValue);
    await pressIn(editableOf(), { key: "f", ...MOD });

    await act(async () => {
      document.body.dispatchEvent(new Event("pointerdown", { bubbles: true, cancelable: true }));
      document.body.dispatchEvent(new Event("mousedown", { bubbles: true, cancelable: true }));
    });

    expect(bar()).not.toBeNull();
    await view.cleanup();
  });

  test("the Close button selects the active match in the editor", async () => {
    const view = await mount([para("p1", "one two two")] as EditorValue);
    await pressIn(editableOf(), { key: "f", ...MOD });
    await type(findInput(), "two");
    await click(clickable("Next match"));

    await click(clickable("Close"));

    expect(bar()).toBeNull();
    expect(view.editor.selection).toEqual({
      anchor: { path: [0, 0], offset: 8 },
      focus: { path: [0, 0], offset: 11 },
    });
    await view.cleanup();
  });

  test("the replace row disappears when the editor becomes read-only while the bar is open", async () => {
    const view = await mount([para("p1", "foo")] as EditorValue);
    await pressIn(editableOf(), { key: "f", ...MOD });
    await type(findInput(), "foo");
    await click(clickable("Toggle replace"));
    expect(document.querySelector("[data-find-replace-input]")).not.toBeNull();

    await view.rerender(true);

    expect(bar()).not.toBeNull();
    expect(document.querySelector("[data-find-replace-input]")).toBeNull();
    expect(button("Toggle replace")).toBeNull();
    await view.cleanup();
  });
});

async function mouseDownOn(node: HTMLElement): Promise<boolean> {
  let notCancelled = true;
  await act(async () => {
    notCancelled = node.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
    );
  });
  return notCancelled;
}
