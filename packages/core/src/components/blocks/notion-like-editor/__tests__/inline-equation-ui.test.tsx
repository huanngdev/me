import { describe, expect, test } from "bun:test";
import { ElementApi, KEYS, type SlateEditor, type TElement, type TRange } from "platejs";
import { createPlateEditor } from "platejs/react";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { EditorSurface } from "../components/editor/editor-surface";
import { runEditorCommand } from "../lib/commands/editor-commands";
import type { EditorValue } from "../lib/document/editor-value";
import { createEditorPlugins } from "../lib/plugins/editor-plugins";
import {
  inlineEquationEditingId,
  openInlineEquationEditor,
  toggleInlineEquation,
} from "../lib/plugins/editor-inline-equation-ui";
import { blockSelectionActive, setBlockSelection } from "../lib/plugins/editor-block-selection";
import { caret, createEditor, texts, textRange } from "./test-utils";

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

const TOO_LONG = "x".repeat(4001);

function para(id: string, children: unknown[]): EditorValue[number] {
  return { type: KEYS.p, id, children } as unknown as EditorValue[number];
}

function inline(id: string, texExpression: string): unknown {
  return { type: KEYS.inlineEquation, id, texExpression, children: [{ text: "" }] };
}

function equationNodes(editor: SlateEditor): TElement[] {
  const found: TElement[] = [];
  for (const [node] of editor.api.nodes({
    at: [],
    voids: true,
    match: (candidate) => ElementApi.isElement(candidate) && candidate.type === KEYS.inlineEquation,
  })) {
    if (ElementApi.isElement(node)) {
      found.push(node);
    }
  }
  return found;
}

function sourceOf(editor: SlateEditor): unknown {
  return equationNodes(editor)[0]?.texExpression;
}

// The shape of the first block: text as strings, equations as their source.
function shape(editor: SlateEditor): unknown[] {
  const block = editor.children[0];
  if (!block || !("children" in block)) {
    return [];
  }
  return block.children.map((child) => {
    if ("texExpression" in child && typeof child.texExpression === "string") {
      return { equation: child.texExpression };
    }
    return "text" in child ? child.text : child;
  });
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
      setTimeout(resolve, 20);
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
  return document.querySelector("[data-inline-equation-popover]");
}

function sourceInput(): HTMLInputElement | null {
  const node = document.querySelector(
    "[data-inline-equation-popover] [aria-label='Equation source']",
  );
  return node instanceof HTMLInputElement ? node : null;
}

function nodeElement(host: HTMLElement): HTMLElement | null {
  const node = host.querySelector("[data-inline-equation]");
  return node instanceof HTMLElement ? node : null;
}

function doneButton(): HTMLElement | null {
  const node = document.querySelector("[data-inline-equation-popover] [aria-label='Done']");
  return node instanceof HTMLElement ? node : null;
}

async function clickNode(host: HTMLElement): Promise<void> {
  const node = nodeElement(host);
  await act(async () => {
    node?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

// React reads the value from the native setter, so the input event must follow it.
async function typeDraft(input: HTMLInputElement | null, text: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  await act(async () => {
    setter?.call(input, text);
    input?.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function keyDown(target: EventTarget | null, init: KeyboardEventInit): Promise<void> {
  await act(async () => {
    target?.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }),
    );
  });
}

async function pressInInput(key: string): Promise<void> {
  await keyDown(sourceInput(), { key });
}

async function pressOutside(): Promise<void> {
  await act(async () => {
    document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
  });
}

// Mounts a paragraph "a <x^2> b" and opens its popover by clicking the equation.
async function openedOnEquation(text = "x^2") {
  const mounted = await mount([para("p", [{ text: "a " }, inline("e1", text), { text: " b" }])]);
  await clickNode(mounted.host);
  return mounted;
}

describe("inline equation popover", () => {
  test("a click opens the popover with the stored source, and typing previews without writing", async () => {
    const mounted = await openedOnEquation();
    try {
      expect(popover()).not.toBeNull();
      expect(sourceInput()?.value).toBe("x^2");
      const snapshot = structuredClone(mounted.editor.children);
      const undos = mounted.editor.history.undos.length;

      await typeDraft(sourceInput(), "\\frac{");
      await flush();

      expect(sourceInput()?.value).toBe("\\frac{");
      expect(
        nodeElement(mounted.host)?.querySelector("[data-inline-equation-error]")?.textContent,
      ).toBe("\\frac{");
      expect(mounted.editor.children).toEqual(snapshot);
      expect(mounted.editor.history.undos.length).toBe(undos);
      expect(sourceOf(mounted.editor)).toBe("x^2");
    } finally {
      await mounted.cleanup();
    }
  });

  test("Enter commits the draft, and one undo restores the old source", async () => {
    const mounted = await openedOnEquation();
    try {
      const undos = mounted.editor.history.undos.length;
      await typeDraft(sourceInput(), "y^2");
      await pressInInput("Enter");

      expect(sourceOf(mounted.editor)).toBe("y^2");
      expect(popover()).toBeNull();
      expect(mounted.editor.history.undos.length).toBe(undos + 1);

      mounted.editor.tf.undo();
      expect(sourceOf(mounted.editor)).toBe("x^2");
    } finally {
      await mounted.cleanup();
    }
  });

  test("Done commits the same way", async () => {
    const mounted = await openedOnEquation();
    try {
      await typeDraft(sourceInput(), "z");
      await act(async () => {
        doneButton()?.click();
      });

      expect(sourceOf(mounted.editor)).toBe("z");
      expect(popover()).toBeNull();
    } finally {
      await mounted.cleanup();
    }
  });

  test("a press outside commits, and a press on the same node keeps the popover open", async () => {
    const mounted = await openedOnEquation();
    try {
      await typeDraft(sourceInput(), "w");
      await clickNode(mounted.host);
      expect(popover()).not.toBeNull();
      expect(sourceOf(mounted.editor)).toBe("x^2");

      await pressOutside();
      expect(popover()).toBeNull();
      expect(sourceOf(mounted.editor)).toBe("w");
    } finally {
      await mounted.cleanup();
    }
  });

  test("Escape cancels: the document and the history are unchanged", async () => {
    const mounted = await openedOnEquation();
    try {
      const snapshot = structuredClone(mounted.editor.children);
      const undos = mounted.editor.history.undos.length;
      await typeDraft(sourceInput(), "changed");
      await pressInInput("Escape");

      expect(popover()).toBeNull();
      expect(mounted.editor.children).toEqual(snapshot);
      expect(mounted.editor.history.undos.length).toBe(undos);
      expect(inlineEquationEditingId(mounted.editor)).toBe("");
    } finally {
      await mounted.cleanup();
    }
  });

  test("an empty draft with Enter removes the node, and one undo restores it", async () => {
    const mounted = await openedOnEquation();
    try {
      await typeDraft(sourceInput(), "   ");
      await pressInInput("Enter");

      expect(equationNodes(mounted.editor)).toHaveLength(0);
      expect(texts(mounted.editor)).toEqual(["a  b"]);

      mounted.editor.tf.undo();
      expect(equationNodes(mounted.editor)).toHaveLength(1);
      expect(sourceOf(mounted.editor)).toBe("x^2");
    } finally {
      await mounted.cleanup();
    }
  });

  test("a 4001-character draft is not written, the message shows, and the popover stays open", async () => {
    const mounted = await openedOnEquation();
    try {
      await typeDraft(sourceInput(), TOO_LONG);
      await pressInInput("Enter");

      expect(sourceOf(mounted.editor)).toBe("x^2");
      expect(popover()).not.toBeNull();
      expect(document.querySelector("[data-inline-equation-popover]")?.textContent).toContain(
        "Up to 4,000 characters.",
      );
    } finally {
      await mounted.cleanup();
    }
  });

  test("broken TeX is saved and the node shows the error state", async () => {
    const mounted = await openedOnEquation();
    try {
      await typeDraft(sourceInput(), "\\frac{");
      await pressInInput("Enter");
      await flush();

      expect(sourceOf(mounted.editor)).toBe("\\frac{");
      expect(
        nodeElement(mounted.host)?.querySelector("[data-inline-equation-error]"),
      ).not.toBeNull();
    } finally {
      await mounted.cleanup();
    }
  });

  test("keys typed in the input do not change the document", async () => {
    const mounted = await openedOnEquation();
    try {
      const snapshot = structuredClone(mounted.editor.children);
      const undos = mounted.editor.history.undos.length;
      for (const key of ["Backspace", "Delete", "a", "ArrowLeft", "Tab"]) {
        await pressInInput(key);
      }
      await keyDown(sourceInput(), { key: "b", metaKey: true });

      expect(mounted.editor.children).toEqual(snapshot);
      expect(mounted.editor.history.undos.length).toBe(undos);
      expect(popover()).not.toBeNull();
    } finally {
      await mounted.cleanup();
    }
  });

  test("a click does nothing in read-only mode", async () => {
    const mounted = await mount(
      [para("p", [{ text: "a " }, inline("e1", "x^2"), { text: " b" }])],
      true,
    );
    try {
      await clickNode(mounted.host);
      expect(popover()).toBeNull();
      expect(inlineEquationEditingId(mounted.editor)).toBe("");
    } finally {
      await mounted.cleanup();
    }
  });

  test("a click does nothing while a block selection is active", async () => {
    const mounted = await mount([
      para("p", [{ text: "a " }, inline("e1", "x^2"), { text: " b" }]),
      para("q", [{ text: "next" }]),
    ]);
    try {
      setBlockSelection(mounted.editor, ["q"]);
      expect(blockSelectionActive(mounted.editor)).toBe(true);
      await clickNode(mounted.host);
      expect(popover()).toBeNull();
    } finally {
      await mounted.cleanup();
    }
  });

  test("Enter on the selected equation opens the popover and inserts no paragraph", async () => {
    const mounted = await mount([para("p", [{ text: "a " }, inline("e1", "x^2"), { text: " b" }])]);
    try {
      mounted.editor.tf.select(mounted.editor.api.start([0, 1]) ?? caret([0, 1], 0));
      await keyDown(editableOf(mounted.host), { key: "Enter" });

      expect(popover()).not.toBeNull();
      expect(sourceInput()?.value).toBe("x^2");
      expect(mounted.editor.children).toHaveLength(1);
    } finally {
      await mounted.cleanup();
    }
  });
});

describe("inline equation command", () => {
  test("an expanded selection becomes the source, and Escape keeps it", async () => {
    const mounted = await mount([para("p", [{ text: "a x^2 b" }])]);
    try {
      mounted.editor.tf.select(textRange([0, 0], 2, 5));
      await act(async () => {
        expect(runEditorCommand(mounted.editor, toggleInlineEquation, undefined)).toBe(true);
      });

      expect(shape(mounted.editor)).toEqual(["a ", { equation: "x^2" }, " b"]);
      expect(popover()).not.toBeNull();
      expect(sourceInput()?.value).toBe("x^2");
      await pressInInput("Escape");
      expect(shape(mounted.editor)).toEqual(["a ", { equation: "x^2" }, " b"]);
      expect(popover()).toBeNull();
    } finally {
      await mounted.cleanup();
    }
  });

  test("a collapsed caret inserts an empty equation, and Escape removes it", async () => {
    const mounted = await mount([para("p", [{ text: "abcd" }])]);
    try {
      mounted.editor.tf.select(caret([0, 0], 2));
      await act(async () => {
        runEditorCommand(mounted.editor, toggleInlineEquation, undefined);
      });
      expect(popover()).not.toBeNull();
      expect(sourceInput()?.value).toBe("");

      await pressInInput("Escape");
      expect(popover()).toBeNull();
      expect(texts(mounted.editor)).toEqual(["abcd"]);
      expect(equationNodes(mounted.editor)).toHaveLength(0);
    } finally {
      await mounted.cleanup();
    }
  });

  test("typing y and Enter leaves an equation, and undoing everything restores the text", async () => {
    const mounted = await mount([para("p", [{ text: "abcd" }])]);
    try {
      mounted.editor.tf.select(caret([0, 0], 2));
      await act(async () => {
        runEditorCommand(mounted.editor, toggleInlineEquation, undefined);
      });
      await typeDraft(sourceInput(), "y");
      await pressInInput("Enter");

      expect(shape(mounted.editor)).toEqual(["ab", { equation: "y" }, "cd"]);
      while (mounted.editor.history.undos.length > 0) {
        mounted.editor.tf.undo();
      }
      expect(texts(mounted.editor)).toEqual(["abcd"]);
    } finally {
      await mounted.cleanup();
    }
  });

  test("across two blocks, inside a link, and in a code block it does nothing", () => {
    const cases: Array<{ value: EditorValue; range: TRange; reason: string }> = [
      {
        value: [para("p1", [{ text: "one" }]), para("p2", [{ text: "two" }])],
        range: {
          anchor: { path: [0, 0], offset: 1 },
          focus: { path: [1, 0], offset: 2 },
        },
        reason: "Equations cannot span blocks.",
      },
      {
        value: [
          para("p", [
            { text: "go " },
            { type: KEYS.link, id: "l", url: "https://example.com", children: [{ text: "link" }] },
          ]),
        ] as unknown as EditorValue,
        range: caret([0, 1, 0], 2),
        reason: "Equations are not available here.",
      },
      {
        value: [
          {
            type: "code_block",
            id: "cb",
            children: [{ type: "code_line", id: "cl", children: [{ text: "code" }] }],
          },
        ] as unknown as EditorValue,
        range: caret([0, 0, 0], 2),
        reason: "Equations are not available here.",
      },
    ];

    for (const item of cases) {
      const editor = createEditor(item.value);
      editor.tf.select(item.range);
      const before = structuredClone(editor.children);
      expect(runEditorCommand(editor, toggleInlineEquation, undefined)).toBe(false);
      expect(editor.children).toEqual(before);
      expect(toggleInlineEquation.disabledReason?.(editor)).toBe(item.reason);
    }
  });

  test("the shortcut Mod+Shift+E wraps the selection", async () => {
    const mounted = await mount([para("p", [{ text: "a x^2 b" }])]);
    try {
      mounted.editor.tf.select(textRange([0, 0], 2, 5));
      await keyDown(editableOf(mounted.host), { key: "e", metaKey: true, shiftKey: true });

      expect(shape(mounted.editor)).toEqual(["a ", { equation: "x^2" }, " b"]);
      expect(popover()).not.toBeNull();
    } finally {
      await mounted.cleanup();
    }
  });

  test("the command and shortcut do nothing in read-only mode", async () => {
    const mounted = await mount([para("p", [{ text: "a x^2 b" }])], true);
    try {
      mounted.editor.tf.select(textRange([0, 0], 2, 5));
      const before = structuredClone(mounted.editor.children);
      await act(async () => {
        expect(runEditorCommand(mounted.editor, toggleInlineEquation, undefined)).toBe(false);
      });
      await keyDown(editableOf(mounted.host), { key: "e", metaKey: true, shiftKey: true });

      expect(mounted.editor.children).toEqual(before);
      expect(popover()).toBeNull();
    } finally {
      await mounted.cleanup();
    }
  });

  test("openInlineEquationEditor refuses an id that is not an inline equation", () => {
    const editor = createEditor([para("p", [{ text: "plain" }])]);
    openInlineEquationEditor(editor, "missing");
    expect(inlineEquationEditingId(editor)).toBe("");
  });
});

describe("inline equation toolbar", () => {
  async function showToolbar(value: EditorValue, range: TRange) {
    const mounted = await mount(value);
    mounted.editor.tf.select(range);
    await act(async () => {
      editableOf(mounted.host).focus();
    });
    return mounted;
  }

  function equationControl(): HTMLButtonElement | null {
    const node = document.querySelector(
      "[data-selection-toolbar] [data-toolbar-control='equation']",
    );
    return node instanceof HTMLButtonElement ? node : null;
  }

  test("the Equation button sits after Link and runs the command", async () => {
    const mounted = await showToolbar(
      [para("p", [{ text: "Hello world" }])],
      textRange([0, 0], 0, 5),
    );
    try {
      const controls = Array.from(
        document.querySelectorAll("[data-selection-toolbar] [data-toolbar-control]"),
      ).map((node) => node.getAttribute("data-toolbar-control"));
      expect(controls.indexOf("equation")).toBe(controls.indexOf("link") + 1);
      expect(equationControl()?.getAttribute("aria-label")).toBe("Equation");

      await act(async () => {
        equationControl()?.click();
      });
      // Slate keeps an empty text leaf before an inline void at the start of a block.
      expect(shape(mounted.editor)).toEqual(["", { equation: "Hello" }, " world"]);
      expect(popover()).not.toBeNull();
    } finally {
      await mounted.cleanup();
    }
  });

  test("across two blocks the Equation button is disabled", async () => {
    const mounted = await showToolbar(
      [para("p1", [{ text: "one" }]), para("p2", [{ text: "two" }])],
      {
        anchor: { path: [0, 0], offset: 1 },
        focus: { path: [1, 0], offset: 2 },
      },
    );
    try {
      expect(equationControl()?.disabled).toBe(true);
      expect(toggleInlineEquation.disabledReason?.(mounted.editor)).toBe(
        "Equations cannot span blocks.",
      );
    } finally {
      await mounted.cleanup();
    }
  });
});

describe("inline equation keyboard around the atom", () => {
  function atom(): EditorValue {
    return [para("p", [{ text: "a " }, inline("e1", "x"), { text: " b" }])];
  }

  test("Backspace after the node removes it in one step", () => {
    const editor = createEditor(atom());
    editor.tf.select(caret([0, 2], 0));
    editor.tf.deleteBackward("character");

    expect(equationNodes(editor)).toHaveLength(0);
    expect(texts(editor)).toEqual(["a  b"]);
  });

  test("Delete before the node removes it", () => {
    const editor = createEditor(atom());
    editor.tf.select(caret([0, 0], 2));
    editor.tf.deleteForward("character");

    expect(equationNodes(editor)).toHaveLength(0);
    expect(texts(editor)).toEqual(["a  b"]);
  });

  test("ArrowLeft and ArrowRight cross the node within two presses", () => {
    const editor = createEditor(atom());
    editor.tf.select(caret([0, 2], 0));
    for (let press = 0; press < 2; press += 1) {
      editor.tf.move({ unit: "offset", reverse: true });
    }
    expect(editor.selection?.anchor.path).toEqual([0, 0]);

    editor.tf.select(caret([0, 0], 2));
    for (let press = 0; press < 2; press += 1) {
      editor.tf.move({ unit: "offset", reverse: false });
    }
    expect(editor.selection?.anchor.path[0]).toBe(0);
    expect(editor.selection?.anchor.path[1]).toBe(2);
  });
});

describe("inline equation creation under StrictMode", () => {
  test("an expanded selection opens the popover with the input focused", async () => {
    const mounted = await mount([para("p", [{ text: "a x^2 b" }])], false, true);
    try {
      mounted.editor.tf.select(textRange([0, 0], 2, 5));
      await act(async () => {
        runEditorCommand(mounted.editor, toggleInlineEquation, undefined);
      });
      await flush();
      expect(popover()).not.toBeNull();
      expect(document.activeElement).toBe(sourceInput());
    } finally {
      await mounted.cleanup();
    }
  });

  test("a collapsed caret opens the popover with the input focused", async () => {
    const mounted = await mount([para("p", [{ text: "abcd" }])], false, true);
    try {
      mounted.editor.tf.select(caret([0, 0], 2));
      await act(async () => {
        runEditorCommand(mounted.editor, toggleInlineEquation, undefined);
      });
      await flush();
      expect(popover()).not.toBeNull();
      expect(document.activeElement).toBe(sourceInput());
    } finally {
      await mounted.cleanup();
    }
  });
});

describe("inline equation removed while open", () => {
  test("removing the node closes the popover without error", async () => {
    const mounted = await openedOnEquation();
    try {
      await act(async () => {
        mounted.editor.tf.removeNodes({ at: [0, 1], voids: true });
      });
      await flush();
      expect(popover()).toBeNull();
      expect(inlineEquationEditingId(mounted.editor)).toBe("");
    } finally {
      await mounted.cleanup();
    }
  });
});

describe("inline equation undo after creation", () => {
  test("a collapsed caret, then Escape, leaves the document, history depth and selection as before", async () => {
    const mounted = await mount([para("p", [{ text: "abcd" }])]);
    try {
      const selection = caret([0, 0], 2);
      mounted.editor.tf.select(selection);
      const children = structuredClone(mounted.editor.children);
      const undos = mounted.editor.history.undos.length;
      const redos = mounted.editor.history.redos.length;
      await act(async () => {
        runEditorCommand(mounted.editor, toggleInlineEquation, undefined);
      });
      await pressInInput("Escape");

      expect(mounted.editor.children).toEqual(children);
      expect(mounted.editor.history.undos.length).toBe(undos);
      expect(mounted.editor.history.redos.length).toBe(redos);
      expect(mounted.editor.selection).toEqual(selection);
    } finally {
      await mounted.cleanup();
    }
  });

  test("a collapsed caret, then Enter with an empty draft, leaves the same trace", async () => {
    const mounted = await mount([para("p", [{ text: "abcd" }])]);
    try {
      const selection = caret([0, 0], 2);
      mounted.editor.tf.select(selection);
      const children = structuredClone(mounted.editor.children);
      const undos = mounted.editor.history.undos.length;
      const redos = mounted.editor.history.redos.length;
      await act(async () => {
        runEditorCommand(mounted.editor, toggleInlineEquation, undefined);
      });
      await pressInInput("Enter");

      expect(mounted.editor.children).toEqual(children);
      expect(mounted.editor.history.undos.length).toBe(undos);
      expect(mounted.editor.history.redos.length).toBe(redos);
      expect(mounted.editor.selection).toEqual(selection);
    } finally {
      await mounted.cleanup();
    }
  });

  test("a collapsed caret, then typing y and Enter: one undo keeps the empty node, two restore the text", async () => {
    const mounted = await mount([para("p", [{ text: "abcd" }])]);
    try {
      mounted.editor.tf.select(caret([0, 0], 2));
      await act(async () => {
        runEditorCommand(mounted.editor, toggleInlineEquation, undefined);
      });
      await typeDraft(sourceInput(), "y");
      await pressInInput("Enter");
      expect(shape(mounted.editor)).toEqual(["ab", { equation: "y" }, "cd"]);

      // The insertion and the source write are two entries, so one undo reverts only the write.
      mounted.editor.tf.undo();
      expect(shape(mounted.editor)).toEqual(["ab", { equation: "" }, "cd"]);
      mounted.editor.tf.undo();
      expect(texts(mounted.editor)).toEqual(["abcd"]);
    } finally {
      await mounted.cleanup();
    }
  });
});
