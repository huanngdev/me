import { describe, expect, test } from "bun:test";
import { KEYS, type SlateEditor, type TElement } from "platejs";
import { createPlateEditor } from "platejs/react";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { EditorSurface } from "../components/editor/editor-surface";
import { runEditorCommand } from "../lib/commands/editor-commands";
import type { EditorValue } from "../lib/document/editor-value";
import { todayStoredDate } from "../lib/features/editor-date-value";
import { blockSelectionActive, setBlockSelection } from "../lib/plugins/editor-block-selection";
import { inlineDateEditingId, insertTodayDate } from "../lib/plugins/editor-inline-date-ui";
import { createEditorPlugins } from "../lib/plugins/editor-plugins";
import { caret, textRange, texts } from "./test-utils";

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

function para(id: string, children: unknown[]): EditorValue[number] {
  return { type: KEYS.p, id, children } as unknown as EditorValue[number];
}

function date(id: string, value: string): unknown {
  return { type: KEYS.date, id, date: value, children: [{ text: "" }] };
}

function dateNodes(editor: SlateEditor): TElement[] {
  const found: TElement[] = [];
  for (const [node] of editor.api.nodes({
    at: [],
    voids: true,
    match: (candidate) => candidate.type === KEYS.date,
  })) {
    found.push(node as TElement);
  }
  return found;
}

function storedOf(editor: SlateEditor): unknown {
  return dateNodes(editor)[0]?.date;
}

function stubAnimationFrame(): () => void {
  const previousFrame = Reflect.get(globalThis, "requestAnimationFrame");
  const previousCancel = Reflect.get(globalThis, "cancelAnimationFrame");
  Reflect.set(globalThis, "requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  Reflect.set(globalThis, "cancelAnimationFrame", () => {});
  return () => {
    Reflect.set(globalThis, "requestAnimationFrame", previousFrame);
    Reflect.set(globalThis, "cancelAnimationFrame", previousCancel);
  };
}

async function mount(value: EditorValue, readOnly = false, strict = false) {
  const restoreFrame = stubAnimationFrame();
  const before = new Set(Array.from(document.body.childNodes));
  const host = document.createElement("div");
  document.body.appendChild(host);
  const editor = createPlateEditor({ plugins: createEditorPlugins(), value });
  let root: Root | undefined;
  await act(async () => {
    root = createRoot(host);
    const surface = (
      <EditorSurface editor={editor} readOnly={readOnly} placeholder="" className="editor" />
    );
    // The dev server renders under StrictMode, which mounts, unmounts and mounts each element.
    root.render(strict ? <StrictMode>{surface}</StrictMode> : surface);
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

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await new Promise((resolve) => {
      setTimeout(resolve, 30);
    });
  });
}

function editableOf(host: HTMLElement): HTMLElement {
  const editable = host.querySelector("[data-slate-editor]");
  if (!(editable instanceof HTMLElement)) {
    throw new Error("Missing editable.");
  }
  return editable;
}

function popover(): Element | null {
  return document.querySelector("[data-inline-date-popover]");
}

function chipElement(host: HTMLElement): HTMLElement | null {
  const node = host.querySelector("[data-inline-date]");
  return node instanceof HTMLElement ? node : null;
}

// A day cell of the shown month. Outside days of the neighbouring months are not picked here.
function dayButton(day: number): HTMLButtonElement | undefined {
  const buttons = Array.from(popover()?.querySelectorAll("button") ?? []);
  return buttons.find(
    (button): button is HTMLButtonElement =>
      button instanceof HTMLButtonElement && button.textContent === String(day),
  );
}

// The selected state is on the grid cell that holds the day button.
function dayCell(day: number): Element | null | undefined {
  return dayButton(day)?.closest("[role='gridcell']");
}

function actionButton(label: string): HTMLButtonElement | null {
  const node = document.querySelector(`[data-inline-date-popover] [aria-label='${label}']`);
  return node instanceof HTMLButtonElement ? node : null;
}

async function clickChip(host: HTMLElement): Promise<void> {
  const node = chipElement(host);
  await act(async () => {
    node?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

async function clickButton(button: HTMLButtonElement | null | undefined): Promise<void> {
  await act(async () => {
    button?.click();
  });
}

async function keyDown(target: EventTarget | null, init: KeyboardEventInit): Promise<void> {
  await act(async () => {
    target?.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }),
    );
  });
}

// Keys are sent to the popover's own first control, as a user typing there would send them.
async function pressInPopover(init: KeyboardEventInit): Promise<void> {
  const target = document.activeElement ?? popover()?.querySelector("button") ?? null;
  await keyDown(target, init);
}

async function pressOutside(): Promise<void> {
  await act(async () => {
    document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
  });
}

// Mounts "a <date> b" and opens the popover by clicking the chip.
async function openedOnDate(stored = "2026-10-12", strict = false) {
  const mounted = await mount(
    [para("p", [{ text: "a " }, date("d1", stored), { text: " b" }])],
    false,
    strict,
  );
  await clickChip(mounted.host);
  await flush();
  return mounted;
}

function caretAfterChip(editor: SlateEditor): boolean {
  return (
    editor.selection !== null &&
    editor.selection.anchor.path[0] === 0 &&
    editor.selection.anchor.path[1] === 2 &&
    editor.selection.anchor.offset === 0
  );
}

describe("inline date popover", () => {
  test("a click opens the popover on the stored month with the day selected and focus in the calendar", async () => {
    const mounted = await openedOnDate();
    try {
      expect(popover()).not.toBeNull();
      expect(popover()?.textContent).toContain("October 2026");
      expect(dayCell(12)?.getAttribute("aria-selected")).toBe("true");
      expect(document.activeElement?.closest("[data-inline-date-popover]")).not.toBeNull();
      expect(actionButton("Today")).not.toBeNull();
      expect(actionButton("Remove date")).not.toBeNull();
    } finally {
      await mounted.cleanup();
    }
  });

  test("picking another day writes it as one undo step, closes, and leaves the caret after the chip", async () => {
    const mounted = await openedOnDate();
    try {
      const undos = mounted.editor.history.undos.length;
      await clickButton(dayButton(15));
      await flush();

      expect(storedOf(mounted.editor)).toBe("2026-10-15");
      expect(popover()).toBeNull();
      expect(inlineDateEditingId(mounted.editor)).toBe("");
      expect(mounted.editor.history.undos.length).toBe(undos + 1);
      expect(caretAfterChip(mounted.editor)).toBe(true);

      mounted.editor.tf.undo();
      expect(storedOf(mounted.editor)).toBe("2026-10-12");
    } finally {
      await mounted.cleanup();
    }
  });

  test("picking the day that is already stored only closes, with no history entry", async () => {
    const mounted = await openedOnDate();
    try {
      const undos = mounted.editor.history.undos.length;
      await clickButton(dayButton(12));
      await flush();

      expect(popover()).toBeNull();
      expect(storedOf(mounted.editor)).toBe("2026-10-12");
      expect(mounted.editor.history.undos.length).toBe(undos);
    } finally {
      await mounted.cleanup();
    }
  });

  test("Today writes the local today and closes", async () => {
    const mounted = await openedOnDate("2020-01-01");
    try {
      const undos = mounted.editor.history.undos.length;
      await clickButton(actionButton("Today"));
      await flush();

      expect(storedOf(mounted.editor)).toBe(todayStoredDate());
      expect(popover()).toBeNull();
      expect(mounted.editor.history.undos.length).toBe(undos + 1);
    } finally {
      await mounted.cleanup();
    }
  });

  test("Remove date removes the chip as one undo step and puts the caret before the old place", async () => {
    const mounted = await openedOnDate();
    try {
      const undos = mounted.editor.history.undos.length;
      await clickButton(actionButton("Remove date"));
      await flush();

      expect(dateNodes(mounted.editor)).toHaveLength(0);
      expect(texts(mounted.editor)).toEqual(["a  b"]);
      expect(popover()).toBeNull();
      expect(mounted.editor.history.undos.length).toBe(undos + 1);

      mounted.editor.tf.undo();
      expect(storedOf(mounted.editor)).toBe("2026-10-12");
    } finally {
      await mounted.cleanup();
    }
  });

  test("Escape closes without a change and leaves the caret after the chip", async () => {
    const mounted = await openedOnDate();
    try {
      const children = structuredClone(mounted.editor.children);
      const undos = mounted.editor.history.undos.length;
      await pressInPopover({ key: "Escape" });
      await flush();

      expect(popover()).toBeNull();
      expect(mounted.editor.children).toEqual(children);
      expect(mounted.editor.history.undos.length).toBe(undos);
      expect(caretAfterChip(mounted.editor)).toBe(true);
    } finally {
      await mounted.cleanup();
    }
  });

  test("a press outside closes without a change", async () => {
    const mounted = await openedOnDate();
    try {
      const children = structuredClone(mounted.editor.children);
      await pressOutside();
      await flush();

      expect(popover()).toBeNull();
      expect(mounted.editor.children).toEqual(children);
    } finally {
      await mounted.cleanup();
    }
  });

  test("a press on the chip keeps the popover open", async () => {
    const mounted = await openedOnDate();
    try {
      await clickChip(mounted.host);
      await flush();
      expect(popover()).not.toBeNull();
    } finally {
      await mounted.cleanup();
    }
  });

  test("Enter on the selected chip opens the popover and inserts no paragraph", async () => {
    const mounted = await mount([
      para("p", [{ text: "a " }, date("d1", "2026-10-12"), { text: " b" }]),
    ]);
    try {
      mounted.editor.tf.select(mounted.editor.api.start([0, 1]) ?? caret([0, 1], 0));
      await keyDown(editableOf(mounted.host), { key: "Enter" });
      await flush();

      expect(popover()).not.toBeNull();
      expect(dayCell(12)?.getAttribute("aria-selected")).toBe("true");
      expect(mounted.editor.children).toHaveLength(1);
    } finally {
      await mounted.cleanup();
    }
  });

  test("a read-only editor does nothing on click", async () => {
    const mounted = await mount(
      [para("p", [{ text: "a " }, date("d1", "2026-10-12"), { text: " b" }])],
      true,
    );
    try {
      await clickChip(mounted.host);
      await flush();
      expect(popover()).toBeNull();
    } finally {
      await mounted.cleanup();
    }
  });

  test("a click does nothing while a block selection is active", async () => {
    const mounted = await mount([
      para("p", [{ text: "a " }, date("d1", "2026-10-12"), { text: " b" }]),
      para("q", [{ text: "next" }]),
    ]);
    try {
      setBlockSelection(mounted.editor, ["q"]);
      expect(blockSelectionActive(mounted.editor)).toBe(true);
      await clickChip(mounted.host);
      await flush();
      expect(popover()).toBeNull();
    } finally {
      await mounted.cleanup();
    }
  });

  test("removing the node while open closes the popover without error", async () => {
    const mounted = await openedOnDate();
    try {
      await act(async () => {
        mounted.editor.tf.removeNodes({ at: [0, 1], voids: true });
      });
      await flush();
      expect(popover()).toBeNull();
      expect(inlineDateEditingId(mounted.editor)).toBe("");
    } finally {
      await mounted.cleanup();
    }
  });

  test("keys typed in the popover do not change the document", async () => {
    const mounted = await openedOnDate();
    try {
      const children = structuredClone(mounted.editor.children);
      await pressInPopover({ key: "a" });
      await pressInPopover({ key: "Backspace" });
      await pressInPopover({ key: "Delete" });
      await pressInPopover({ key: "ArrowRight" });
      await flush();

      expect(mounted.editor.children).toEqual(children);
      expect(popover()).not.toBeNull();
    } finally {
      await mounted.cleanup();
    }
  });
});

describe("inline date command and shortcut", () => {
  test("Mod+; inserts today's date, opens the popover, and Escape keeps the chip", async () => {
    const mounted = await mount([para("p", [{ text: "abcd" }])]);
    try {
      mounted.editor.tf.select(caret([0, 0], 2));
      await keyDown(editableOf(mounted.host), { key: ";", metaKey: true });
      await flush();

      expect(dateNodes(mounted.editor)).toHaveLength(1);
      expect(storedOf(mounted.editor)).toBe(todayStoredDate());
      expect(popover()).not.toBeNull();

      await pressInPopover({ key: "Escape" });
      await flush();
      expect(popover()).toBeNull();
      expect(dateNodes(mounted.editor)).toHaveLength(1);
    } finally {
      await mounted.cleanup();
    }
  });

  test("one undo removes an inserted date", async () => {
    const mounted = await mount([para("p", [{ text: "abcd" }])]);
    try {
      mounted.editor.tf.select(caret([0, 0], 2));
      await keyDown(editableOf(mounted.host), { key: ";", metaKey: true });
      await flush();
      await pressInPopover({ key: "Escape" });
      await flush();

      mounted.editor.tf.undo();
      expect(dateNodes(mounted.editor)).toHaveLength(0);
      expect(texts(mounted.editor)).toEqual(["abcd"]);
    } finally {
      await mounted.cleanup();
    }
  });

  test("the shortcut does nothing in read-only mode", async () => {
    const mounted = await mount([para("p", [{ text: "abcd" }])], true);
    try {
      mounted.editor.tf.select(caret([0, 0], 2));
      const before = structuredClone(mounted.editor.children);
      await keyDown(editableOf(mounted.host), { key: ";", metaKey: true });
      await flush();

      expect(mounted.editor.children).toEqual(before);
      expect(popover()).toBeNull();
    } finally {
      await mounted.cleanup();
    }
  });
});

describe("inline date creation under StrictMode", () => {
  test("a collapsed caret opens the popover with focus in the calendar and the state kept", async () => {
    const mounted = await mount([para("p", [{ text: "abcd" }])], false, true);
    try {
      mounted.editor.tf.select(caret([0, 0], 2));
      await act(async () => {
        runEditorCommand(mounted.editor, insertTodayDate, undefined);
      });
      await flush();

      expect(dateNodes(mounted.editor)).toHaveLength(1);
      expect(popover()).not.toBeNull();
      expect(inlineDateEditingId(mounted.editor)).not.toBe("");
      expect(document.activeElement?.closest("[data-inline-date-popover]")).not.toBeNull();
    } finally {
      await mounted.cleanup();
    }
  });

  test("an expanded selection is replaced and the popover stays open", async () => {
    const mounted = await mount([para("p", [{ text: "a x b" }])], false, true);
    try {
      mounted.editor.tf.select(textRange([0, 0], 2, 3));
      await act(async () => {
        runEditorCommand(mounted.editor, insertTodayDate, undefined);
      });
      await flush();

      expect(texts(mounted.editor)).toEqual(["a  b"]);
      expect(popover()).not.toBeNull();
      expect(document.activeElement?.closest("[data-inline-date-popover]")).not.toBeNull();
    } finally {
      await mounted.cleanup();
    }
  });
});
