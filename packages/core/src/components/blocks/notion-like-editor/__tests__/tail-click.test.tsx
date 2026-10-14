import { describe, expect, test } from "bun:test";
import { KEYS, type TElement } from "platejs";
import { createPlateEditor } from "platejs/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { EditorSurface } from "../components/editor/editor-surface";
import { insertParagraphBelow, runEditorCommand } from "../lib/commands/editor-commands";
import type { EditorValue } from "../lib/document/editor-value";
import { resolveEditorOptions } from "../lib/features/editor-options";
import { tailClickAction } from "../lib/features/editor-tail-click";
import { editorConfigPlugin } from "../lib/plugins/editor-config";
import { createEditorPlugins } from "../lib/plugins/editor-plugins";
import { caret, createEditor, paragraphValue } from "./test-utils";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

function paragraph(id: string, text: string): TElement {
  return { type: KEYS.p, id, children: [{ text }] };
}

describe("tail click action", () => {
  test("a non-empty last block gets a paragraph appended", () => {
    expect(tailClickAction(paragraph("a", "Hello"), false)).toBe("append");
    expect(tailClickAction({ type: KEYS.h1, id: "h", children: [{ text: "" }] }, false)).toBe(
      "append",
    );
    expect(
      tailClickAction({ ...paragraph("l", ""), listStyleType: "disc" } as TElement, false),
    ).toBe("append");
  });

  test("an empty plain paragraph last is focused instead", () => {
    expect(tailClickAction(paragraph("a", ""), false)).toBe("focus-last");
  });

  test("read-only and an empty document do nothing", () => {
    expect(tailClickAction(paragraph("a", "Hello"), true)).toBe("none");
    expect(tailClickAction(paragraph("a", ""), true)).toBe("none");
    expect(tailClickAction(undefined, false)).toBe("none");
  });
});

describe("tail click command", () => {
  test("the appended paragraph is last, holds the caret, and one undo restores the document", () => {
    const editor = createEditor([paragraph("top", "Hello")]);
    editor.tf.select(caret([0, 0], 5));
    const before = JSON.stringify(editor.children);
    const undos = editor.history.undos.length;

    expect(
      runEditorCommand(editor, insertParagraphBelow, { path: [editor.children.length - 1] }),
    ).toBe(true);

    expect(editor.children).toHaveLength(2);
    expect(editor.children[1]?.type).toBe(KEYS.p);
    expect(editor.api.string([1])).toBe("");
    expect(editor.selection).toEqual(caret([1, 0], 0));
    expect(editor.history.undos.length - undos).toBe(1);

    editor.tf.undo();
    expect(JSON.stringify(editor.children)).toBe(before);
    expect(editor.history.undos.length).toBe(undos);
  });
});

describe("tail click on the editable", () => {
  function domRect(top: number, height: number): DOMRect {
    return {
      x: 0,
      y: top,
      left: 0,
      top,
      right: 400,
      bottom: top + height,
      width: 400,
      height,
      toJSON() {
        return {};
      },
    } as DOMRect;
  }

  // The last block spans y 100 to 124, so the empty space below it starts at 124.
  function installLayout(): () => void {
    const original = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function () {
      if (this.hasAttribute("data-slate-node")) {
        return domRect(100, 24);
      }
      return domRect(0, 400);
    };
    return () => {
      HTMLElement.prototype.getBoundingClientRect = original;
    };
  }

  async function mount(
    value: EditorValue,
    readOnly = false,
  ): Promise<{ host: HTMLDivElement; editor: ReturnType<typeof createPlateEditor>; root: Root }> {
    const host = document.createElement("div");
    host.setAttribute("data-block-viewport", "");
    document.body.appendChild(host);
    const editor = createPlateEditor({
      plugins: createEditorPlugins(),
      value,
    });
    const root = createRoot(host);
    await act(async () => {
      root.render(
        <EditorSurface editor={editor} readOnly={readOnly} placeholder="" className="editor" />,
      );
    });
    return { host, editor, root };
  }

  function mouseDown(clientY: number): MouseEvent {
    return new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientY,
    });
  }

  async function unmount(mounted: { host: HTMLDivElement; root: Root }): Promise<void> {
    await act(async () => {
      mounted.root.unmount();
    });
    mounted.host.remove();
  }

  test("a click below the last block appends a paragraph and focuses it", async () => {
    const restore = installLayout();
    const mounted = await mount(paragraphValue("Hello") as EditorValue);
    try {
      const editable = mounted.host.querySelector("[data-slate-editor]");
      expect(editable).not.toBeNull();
      const event = mouseDown(200);
      await act(async () => {
        editable?.dispatchEvent(event);
      });

      expect(event.defaultPrevented).toBe(true);
      expect(mounted.editor.children).toHaveLength(2);
      expect(mounted.editor.api.string([1])).toBe("");
      expect(mounted.editor.selection).toEqual(caret([1, 0], 0));
    } finally {
      await unmount(mounted);
      restore();
    }
  });

  test("a click below an empty last paragraph only moves the caret", async () => {
    const restore = installLayout();
    const mounted = await mount(paragraphValue("") as EditorValue);
    try {
      const editable = mounted.host.querySelector("[data-slate-editor]");
      const event = mouseDown(200);
      await act(async () => {
        editable?.dispatchEvent(event);
      });

      expect(event.defaultPrevented).toBe(true);
      expect(mounted.editor.children).toHaveLength(1);
      expect(mounted.editor.selection).toEqual(caret([0, 0], 0));
    } finally {
      await unmount(mounted);
      restore();
    }
  });

  test("a click on the editable above the last block does nothing", async () => {
    const restore = installLayout();
    const mounted = await mount(paragraphValue("Hello") as EditorValue);
    try {
      const editable = mounted.host.querySelector("[data-slate-editor]");
      const event = mouseDown(110);
      await act(async () => {
        editable?.dispatchEvent(event);
      });

      expect(event.defaultPrevented).toBe(false);
      expect(mounted.editor.children).toHaveLength(1);
    } finally {
      await unmount(mounted);
      restore();
    }
  });

  test("with appendOnTailClick off, the browser handles a click below the last block", async () => {
    const restore = installLayout();
    const mounted = await mount(paragraphValue("Hello") as EditorValue);
    try {
      await act(async () => {
        mounted.editor.setOption(
          editorConfigPlugin,
          "resolved",
          resolveEditorOptions({ appendOnTailClick: false }),
        );
      });
      const editable = mounted.host.querySelector("[data-slate-editor]");
      const event = mouseDown(200);
      await act(async () => {
        editable?.dispatchEvent(event);
      });

      expect(event.defaultPrevented).toBe(false);
      expect(mounted.editor.children).toHaveLength(1);
      expect(mounted.editor.api.string([0])).toBe("Hello");
    } finally {
      await unmount(mounted);
      restore();
    }
  });

  test("read-only does nothing below the last block", async () => {
    const restore = installLayout();
    const mounted = await mount(paragraphValue("Hello") as EditorValue, true);
    try {
      const editable = mounted.host.querySelector("[data-slate-editor]");
      const event = mouseDown(200);
      await act(async () => {
        editable?.dispatchEvent(event);
      });

      expect(event.defaultPrevented).toBe(false);
      expect(mounted.editor.children).toHaveLength(1);
    } finally {
      await unmount(mounted);
      restore();
    }
  });
});
