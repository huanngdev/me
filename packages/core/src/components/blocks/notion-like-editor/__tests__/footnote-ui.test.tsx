import { describe, expect, test } from "bun:test";
import { KEYS, type SlateEditor } from "platejs";
import { createPlateEditor } from "platejs/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";

import { EditorSurface } from "../components/editor/editor-surface";
import { runEditorCommand } from "../lib/commands/editor-commands";
import { FOOTNOTE_DEF_KEY } from "../lib/document/editor-document-schema";
import type { EditorValue } from "../lib/document/editor-value";
import { blockHandleTarget } from "../lib/features/editor-block-handle";
import { handleBands } from "../hooks/use-block-handle";
import { footnoteInsertAllowed, footnoteMenuOffersTurn } from "../lib/features/editor-footnote";
import { chooseSlashItem, slashMenuItems } from "../lib/plugins/editor-slash";
import { createEditorPlugins } from "../lib/plugins/editor-plugins";
import { deleteBlock, duplicateBlock } from "../lib/commands/editor-commands";
import { NotionLikeEditorStatic } from "../notion-like-editor-static";
import { def, para, ref, text } from "./footnote-fixtures";
import { caret, createEditor, texts } from "./test-utils";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

// The slash menu uses cmdk, which needs ResizeObserver. jsdom has none, so a no-op stands in.
if (!("ResizeObserver" in globalThis)) {
  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  Reflect.set(globalThis, "ResizeObserver", ResizeObserverStub);
}
// The slash menu's floating position reads the viewport size, which jsdom leaves undefined.
if (!("innerWidth" in globalThis)) {
  Reflect.set(globalThis, "innerWidth", 1024);
  Reflect.set(globalThis, "innerHeight", 768);
}

const DEF_SEPARATOR = "before:border-t";

type Mounted = {
  editor: SlateEditor;
  host: HTMLElement;
  unmount: () => Promise<void>;
};

async function mount(value: EditorValue, readOnly = false): Promise<Mounted> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const editor = createPlateEditor({ plugins: createEditorPlugins(), value });
  let root: Root | undefined;
  await act(async () => {
    root = createRoot(host);
    root.render(
      <EditorSurface editor={editor} readOnly={readOnly} placeholder="" className="editor" />,
    );
  });
  return {
    editor,
    host,
    unmount: async () => {
      await act(async () => {
        root?.unmount();
      });
      host.remove();
    },
  };
}

function refNode(host: HTMLElement, id: string): HTMLElement | null {
  return host.querySelector<HTMLElement>(`sup[data-footnote-ref][data-footnote-id="${id}"]`);
}

function defNode(host: HTMLElement, id: string): HTMLElement | null {
  return host.querySelector<HTMLElement>(`[data-footnote-def][data-footnote-id="${id}"]`);
}

function labelNode(host: HTMLElement, id: string): HTMLElement | null {
  return defNode(host, id)?.querySelector<HTMLElement>("[data-footnote-number]") ?? null;
}

async function click(target: Element | null): Promise<void> {
  await act(async () => {
    target?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
  });
}

async function keyDown(target: EventTarget | null, init: KeyboardEventInit): Promise<void> {
  await act(async () => {
    target?.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }),
    );
  });
}

function editableOf(host: HTMLElement): HTMLElement {
  return host.querySelector<HTMLElement>("[data-slate-editor]") ?? host;
}

// Records every scrollIntoView call. Restored by the caller.
function spyScroll(): { calls: Element[]; restore: () => void } {
  const calls: Element[] = [];
  const original: unknown = Reflect.get(Element.prototype, "scrollIntoView");
  Reflect.set(Element.prototype, "scrollIntoView", function (this: Element) {
    calls.push(this);
  });
  return {
    calls,
    restore: () => {
      Reflect.set(Element.prototype, "scrollIntoView", original);
    },
  };
}

function snapshot(editor: SlateEditor): unknown {
  return structuredClone(editor.children);
}

function selectedPath(editor: SlateEditor): number[] | undefined {
  return editor.selection?.anchor.path;
}

// Two paragraphs, a referenced definition and an unreferenced one, and a missing reference.
function sample(): EditorValue {
  return [
    para("p1", [text("first "), ref("r1", "one"), text(" end")]),
    para("p2", [text("second "), ref("r2", "missing")]),
    def("d1", "one", "the note"),
    def("d2", "orphan", "lonely"),
  ] as unknown as EditorValue;
}

describe("footnote reference UI", () => {
  test("shows its number, or ? when the definition is missing, with a matching label", async () => {
    const mounted = await mount(sample());
    try {
      expect(refNode(mounted.host, "one")?.textContent).toBe("1");
      expect(refNode(mounted.host, "one")?.getAttribute("aria-label")).toBe("Footnote 1");
      expect(refNode(mounted.host, "missing")?.textContent).toBe("?");
      expect(refNode(mounted.host, "missing")?.getAttribute("aria-label")).toBe(
        "Footnote not found",
      );
    } finally {
      await mounted.unmount();
    }
  });

  test("a click moves the caret to the end of the definition", async () => {
    const mounted = await mount(sample());
    try {
      await click(refNode(mounted.host, "one"));
      expect(selectedPath(mounted.editor)).toEqual([2, 0]);
      expect(mounted.editor.selection?.anchor.offset).toBe("the note".length);
    } finally {
      await mounted.unmount();
    }
  });

  test("a click on a missing reference only selects it and changes nothing else", async () => {
    const mounted = await mount(sample());
    try {
      const before = snapshot(mounted.editor);
      await click(refNode(mounted.host, "missing"));
      expect(snapshot(mounted.editor)).toEqual(before);
      expect(selectedPath(mounted.editor)?.[0]).toBe(1);
    } finally {
      await mounted.unmount();
    }
  });

  test("Enter on the selected reference jumps to its definition", async () => {
    const mounted = await mount(sample());
    try {
      await act(async () => {
        mounted.editor.tf.select(mounted.editor.api.start([0, 1]) ?? caret([0, 0], 0).anchor);
      });
      await keyDown(editableOf(mounted.host), { key: "Enter" });
      expect(selectedPath(mounted.editor)).toEqual([2, 0]);
    } finally {
      await mounted.unmount();
    }
  });

  test("a read-only click scrolls the definition into view and changes nothing", async () => {
    const scroll = spyScroll();
    const mounted = await mount(sample(), true);
    try {
      const before = snapshot(mounted.editor);
      await click(refNode(mounted.host, "one"));
      expect(scroll.calls.includes(defNode(mounted.host, "one") as Element)).toBe(true);
      expect(snapshot(mounted.editor)).toEqual(before);
    } finally {
      scroll.restore();
      await mounted.unmount();
    }
  });
});

// The handle needs a band per rendered block. jsdom has no layout, so each block's rect is stubbed
// in document order, which is what the browser would report for a stacked list.
function stubBlockRects(host: HTMLElement): void {
  let top = 0;
  for (const node of host.querySelectorAll<HTMLElement>("[data-block-id]")) {
    const rect = {
      top,
      bottom: top + 30,
      left: 100,
      right: 500,
      width: 400,
      height: 30,
      x: 100,
      y: top,
    };
    Reflect.set(node, "getBoundingClientRect", () => ({ ...rect, toJSON: () => rect }));
    top += 40;
  }
}

describe("footnote handle band", () => {
  test("a footnote definition gets a handle band, so the handle can appear on it", async () => {
    const mounted = await mount(sample());
    try {
      stubBlockRects(mounted.host);
      const ids = handleBands(mounted.editor).map((band) => band.id);
      expect(ids).toContain("d1");
      expect(ids).toContain("d2");
    } finally {
      await mounted.unmount();
    }
  });
});

describe("footnote slash scroll", () => {
  test("after a slash insert the new definition is scrolled into view and holds the caret", async () => {
    const scroll = spyScroll();
    const mounted = await mount([para("p0", [text("abc ")])] as unknown as EditorValue);
    try {
      await act(async () => {
        mounted.editor.tf.select(caret([0, 0], 4));
        mounted.editor.tf.insertText("/");
      });
      await act(async () => {
        runEditorCommand(mounted.editor, chooseSlashItem, "footnote");
      });
      // Let the reveal's retries run after React has committed the new definition.
      await new Promise((resolve) => setTimeout(resolve, 50));

      const created = mounted.host.querySelector<HTMLElement>("[data-footnote-def]");
      expect(created).not.toBeNull();
      expect(scroll.calls.some((element) => element === created)).toBe(true);
      expect(selectedPath(mounted.editor)?.[0]).toBe(1);
    } finally {
      scroll.restore();
      await mounted.unmount();
    }
  });
});

describe("footnote definition UI", () => {
  test("the label shows the number, or a dash that is not clickable when unreferenced", async () => {
    const mounted = await mount(sample());
    try {
      expect(labelNode(mounted.host, "one")?.textContent).toBe("1.");
      const orphan = labelNode(mounted.host, "orphan");
      expect(orphan?.textContent).toBe("–");
      expect(orphan?.getAttribute("title")).toBe("Not referenced");
      expect(orphan?.classList.contains("cursor-pointer")).toBe(false);
    } finally {
      await mounted.unmount();
    }
  });

  test("only the first definition of a run has the separator, and it follows block moves", async () => {
    const value = [
      para("p", [text("body")]),
      def("a", "a", "A"),
      def("b", "b", "B"),
      para("tail", [text("tail")]),
      def("c", "c", "C"),
    ] as unknown as EditorValue;
    const mounted = await mount(value);
    try {
      expect(defNode(mounted.host, "a")?.classList.contains(DEF_SEPARATOR)).toBe(true);
      expect(defNode(mounted.host, "b")?.classList.contains(DEF_SEPARATOR)).toBe(false);
      expect(defNode(mounted.host, "c")?.classList.contains(DEF_SEPARATOR)).toBe(true);

      await act(async () => {
        mounted.editor.tf.moveNodes({ at: [4], to: [1] });
      });

      expect(defNode(mounted.host, "c")?.classList.contains(DEF_SEPARATOR)).toBe(true);
      expect(defNode(mounted.host, "a")?.classList.contains(DEF_SEPARATOR)).toBe(false);
    } finally {
      await mounted.unmount();
    }
  });

  // The definition's box starts at its text line, so the handle, which reads the block box, sits on
  // the line. The separator is a pseudo-element outside that box.
  test("a definition box has no separator padding inside it", async () => {
    const mounted = await mount(sample());
    try {
      const classes = (defNode(mounted.host, "one")?.className ?? "").split(" ");
      expect(classes).not.toContain("border-t");
      expect(classes).not.toContain("pt-3");
      expect(defNode(mounted.host, "one")?.querySelector("[data-block-handle-anchor]")).toBeNull();
    } finally {
      await mounted.unmount();
    }
  });

  test("a click on the number jumps back to just after the first reference", async () => {
    const mounted = await mount(sample());
    try {
      await click(labelNode(mounted.host, "one"));
      expect(selectedPath(mounted.editor)).toEqual([0, 2]);
      expect(mounted.editor.selection?.anchor.offset).toBe(0);
    } finally {
      await mounted.unmount();
    }
  });

  test("a read-only click on the number scrolls the first reference into view", async () => {
    const scroll = spyScroll();
    const mounted = await mount(sample(), true);
    try {
      const before = snapshot(mounted.editor);
      await click(labelNode(mounted.host, "one"));
      const ref = refNode(mounted.host, "one");
      expect(scroll.calls.some((element) => element.contains(ref))).toBe(true);
      expect(snapshot(mounted.editor)).toEqual(before);
    } finally {
      scroll.restore();
      await mounted.unmount();
    }
  });

  // jsdom treats Mod as Ctrl, so a ctrlKey keydown reaches the registered Mod+Enter hotkey, the same
  // path a real Mod+Enter takes. The hotkey runs the to-do shortcut, which must not swallow it.
  test("Mod+Enter inside a definition jumps back to its first reference", async () => {
    const mounted = await mount(sample());
    try {
      await act(async () => {
        mounted.editor.tf.select(caret([2, 0], 2));
      });
      await keyDown(editableOf(mounted.host), { key: "Enter", code: "Enter", ctrlKey: true });
      expect(selectedPath(mounted.editor)).toEqual([0, 2]);
    } finally {
      await mounted.unmount();
    }
  });

  test("Meta+Enter inside a definition jumps back to its first reference", async () => {
    const mounted = await mount(sample());
    try {
      await act(async () => {
        mounted.editor.tf.select(caret([2, 0], 2));
      });
      await keyDown(editableOf(mounted.host), { key: "Enter", metaKey: true });
      expect(selectedPath(mounted.editor)).toEqual([0, 2]);
    } finally {
      await mounted.unmount();
    }
  });

  test("an empty definition shows the Footnote placeholder", async () => {
    const value = [para("p", [text("body")]), def("e", "empty", "")] as unknown as EditorValue;
    const mounted = await mount(value);
    try {
      expect(defNode(mounted.host, "empty")?.getAttribute("data-block-placeholder")).toBe(
        "Footnote",
      );
    } finally {
      await mounted.unmount();
    }
  });
});

describe("footnote slash item", () => {
  test("Footnote is listed in the Inline group right after Link", () => {
    const editor = createEditor([para("p", [text("abc ")])] as unknown as EditorValue);
    editor.tf.select(caret([0, 0], 4));
    editor.tf.insertText("/");

    const items = slashMenuItems(editor);
    const footnote = items.find((item) => item.id === "footnote");
    expect(footnote?.label).toBe("Footnote");
    expect(footnote?.group).toBe("Inline");
    const link = items.findIndex((item) => item.id === "link");
    expect(items.findIndex((item) => item.id === "footnote")).toBe(link + 1);
  });

  test("Footnote is not offered in a code line", () => {
    const editor = createEditor([
      {
        type: KEYS.codeBlock,
        id: "cb",
        children: [{ type: KEYS.codeLine, id: "cl", children: [text("code")] }],
      },
    ] as unknown as EditorValue);
    editor.tf.select(caret([0, 0, 0], 4));
    editor.tf.insertText("/");

    expect(footnoteInsertAllowed(editor)).toBe(false);
    expect(slashMenuItems(editor).map((item) => item.id)).not.toContain("footnote");
  });

  test("Footnote is not offered inside a definition", () => {
    const editor = createEditor([
      para("p", [text("a")]),
      def("d", "x", "note"),
    ] as unknown as EditorValue);
    editor.tf.select(caret([1, 0], 4));
    editor.tf.insertText("/");

    expect(footnoteInsertAllowed(editor)).toBe(false);
    expect(slashMenuItems(editor).map((item) => item.id)).not.toContain("footnote");
  });

  test("choosing Footnote inserts a reference and a definition and removes the query", () => {
    const editor = createEditor([para("p", [text("abc ")])] as unknown as EditorValue);
    editor.tf.select(caret([0, 0], 4));
    editor.tf.insertText("/");

    expect(runEditorCommand(editor, chooseSlashItem, "footnote")).toBe(true);

    expect(texts(editor)[0]).toBe("abc ");
    const last = editor.children[editor.children.length - 1];
    expect(last && "type" in last ? last.type : undefined).toBe(FOOTNOTE_DEF_KEY);
    expect(editor.selection?.anchor.path[0]).toBe(editor.children.length - 1);
  });

  test("one undo after choosing Footnote removes both nodes and keeps the typed slash", () => {
    const editor = createEditor([para("p", [text("abc ")])] as unknown as EditorValue);
    editor.tf.select(caret([0, 0], 4));
    editor.tf.insertText("/");
    const before = snapshot(editor);

    runEditorCommand(editor, chooseSlashItem, "footnote");
    editor.tf.undo();

    expect(snapshot(editor)).toEqual(before);
  });
});

describe("footnote block menu", () => {
  test("Delete on a definition removes its references in one undo", () => {
    const editor = createEditor([
      para("p", [text("a "), ref("r", "x"), text(" b")]),
      def("d", "x", "note"),
      para("tail", [text("tail")]),
    ] as unknown as EditorValue);
    const before = snapshot(editor);

    expect(runEditorCommand(editor, deleteBlock, { path: [1] })).toBe(true);

    expect(JSON.stringify(editor.children)).not.toContain(FOOTNOTE_DEF_KEY);
    expect(JSON.stringify(editor.children)).not.toContain("footnote_ref");
    editor.tf.undo();
    expect(snapshot(editor)).toEqual(before);
  });

  test("Duplicate gives the copy its own footnote id", () => {
    const editor = createEditor([
      para("p", [text("a "), ref("r", "x")]),
      def("d", "x", "note"),
    ] as unknown as EditorValue);

    expect(runEditorCommand(editor, duplicateBlock, { path: [1] })).toBe(true);

    const ids = editor.children.flatMap((node) =>
      "footnoteId" in node && typeof node.footnoteId === "string" ? [node.footnoteId] : [],
    );
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });

  test("a definition is not offered Turn into or Color", () => {
    expect(footnoteMenuOffersTurn(FOOTNOTE_DEF_KEY)).toBe(false);
    expect(footnoteMenuOffersTurn(KEYS.p)).toBe(true);
  });
});

describe("footnote handle", () => {
  test("the hover handle targets a definition like a paragraph", () => {
    expect(
      blockHandleTarget([{ type: FOOTNOTE_DEF_KEY, id: "d", index: 1, parentType: null }]),
    ).toEqual({ id: "d", type: FOOTNOTE_DEF_KEY });
  });
});

describe("merge rule at a definition", () => {
  function pair(): EditorValue {
    return [
      def("d", "x", "text"),
      para("p", [text("a "), ref("r", "y"), text(" b")]),
    ] as unknown as EditorValue;
  }

  test("Backspace before a block with a reference moves the caret to the definition end", () => {
    const editor = createEditor(pair());
    editor.tf.select(caret([1, 0], 0));
    const refsBefore = JSON.stringify(editor.children).split("footnote_ref").length;

    editor.tf.deleteBackward("character");

    expect(editor.children).toHaveLength(2);
    expect(editor.selection?.anchor).toEqual({ path: [0, 0], offset: 4 });
    expect(JSON.stringify(editor.children).split("footnote_ref").length).toBe(refsBefore);
  });

  test("Backspace before a block without a reference merges as usual", () => {
    const editor = createEditor([
      def("d", "x", "text"),
      para("p", [text("plain")]),
    ] as unknown as EditorValue);
    editor.tf.select(caret([1, 0], 0));

    editor.tf.deleteBackward("character");

    expect(editor.children).toHaveLength(1);
    expect(texts(editor)).toEqual(["textplain"]);
  });

  test("Delete at the end of a definition does nothing when the next block has a reference", () => {
    const editor = createEditor(pair());
    editor.tf.select(caret([0, 0], 4));
    const before = snapshot(editor);

    editor.tf.deleteForward("character");

    expect(snapshot(editor)).toEqual(before);
  });

  test("Delete at the end of a definition merges a block without references", () => {
    const editor = createEditor([
      def("d", "x", "text"),
      para("p", [text("plain")]),
    ] as unknown as EditorValue);
    editor.tf.select(caret([0, 0], 4));

    editor.tf.deleteForward("character");

    expect(editor.children).toHaveLength(1);
    expect(texts(editor)).toEqual(["textplain"]);
  });
});

describe("footnote static UI", () => {
  test("the static reference and definition carry the shared classes and the separator rule", () => {
    const value = [
      para("p", [text("a "), ref("r", "one")]),
      def("a", "one", "first"),
      def("b", "orphan", "lonely"),
    ] as unknown as EditorValue;
    const host = document.createElement("div");
    host.innerHTML = renderToStaticMarkup(<NotionLikeEditorStatic value={value} />);

    const sup = host.querySelector<HTMLElement>("sup[data-footnote-ref]");
    expect(sup?.className.split(" ").length).toBeGreaterThan(1);
    const label = host.querySelector<HTMLElement>(
      '[data-footnote-def][data-footnote-id="one"] [data-footnote-number]',
    );
    expect(label?.textContent).toBe("1.");
    expect(
      host
        .querySelector('[data-footnote-def][data-footnote-id="one"]')
        ?.classList.contains(DEF_SEPARATOR),
    ).toBe(true);
    expect(
      host
        .querySelector('[data-footnote-def][data-footnote-id="orphan"]')
        ?.classList.contains(DEF_SEPARATOR),
    ).toBe(false);
    expect(
      host.querySelector('[data-footnote-def][data-footnote-id="one"]')?.getAttribute("id"),
    ).toBe("fn-one");
  });

  test("the editor and the static renderer share the reference classes", async () => {
    const value = sample();
    const mounted = await mount(value, true);
    const staticHost = document.createElement("div");
    staticHost.innerHTML = renderToStaticMarkup(<NotionLikeEditorStatic value={value} />);
    try {
      expect(staticHost.querySelector("sup[data-footnote-ref]")?.getAttribute("class")).toBe(
        refNode(mounted.host, "one")?.getAttribute("class") ?? null,
      );
    } finally {
      await mounted.unmount();
    }
  });
});
