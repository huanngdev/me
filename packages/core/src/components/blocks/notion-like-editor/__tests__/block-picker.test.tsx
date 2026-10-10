import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ElementApi, KEYS, type SlateEditor, type TElement } from "platejs";
import { createPlateEditor } from "platejs/react";
import { act } from "react";
import { createRoot } from "react-dom/client";

import { EditorSurface } from "../components/editor/editor-surface";
import { placeholderSpec } from "../components/editor/block-placeholders";
import { createEditorPlugins } from "../lib/plugins/editor-plugins";
import {
  blockPickerAddItems,
  blockPickerTurnItems,
  insertPickedBlock,
  type BlockPickerItem,
} from "../lib/features/editor-block-picker";
import { createEditor } from "./test-utils";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

function paragraph(id: string, text = ""): TElement {
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

function childIds(editor: SlateEditor, id: string): string[] {
  const node = editor.api.node(pathOf(editor, id))?.[0];
  if (!node || !ElementApi.isElement(node)) {
    return [];
  }
  return node.children.flatMap((child) =>
    ElementApi.isElement(child) && typeof child.id === "string" ? [child.id] : [],
  );
}

function topIds(editor: SlateEditor): string[] {
  return editor.children.flatMap((node) =>
    ElementApi.isElement(node) && typeof node.id === "string" ? [node.id] : [],
  );
}

function item(editor: SlateEditor, path: number[], id: string): BlockPickerItem {
  const found = blockPickerAddItems(editor, path).find((entry) => entry.id === id);
  if (!found) {
    throw new Error(`Missing picker item ${id}`);
  }
  return found;
}

describe("block picker items", () => {
  test("add mode groups every insert and marks disabled with a reason", () => {
    const editor = createEditor([
      { type: KEYS.blockquote, id: "quote", children: [paragraph("q")] },
    ]);
    const items = blockPickerAddItems(editor, pathOf(editor, "q"));
    const ids = items.map((entry) => entry.id);
    expect(ids).toContain("paragraph");
    expect(ids).toContain("bulleted");
    expect(ids).toContain("toggle");
    expect(ids).toContain("code");
    expect(ids).toContain("divider");
    expect(ids).toContain("equation");
    expect(ids).toContain("table");
    expect(ids).toContain("columns");
    expect(ids).toContain("toc");
    expect(new Set(items.map((entry) => entry.group))).toEqual(
      new Set(["Basic", "Lists", "Containers", "Advanced"]),
    );
    // A quote holds only paragraphs, so a heading is refused with a reason.
    const heading = items.find((entry) => entry.id === "h1");
    expect(heading?.disabled).toBe(true);
    expect(heading?.reason).toBeTruthy();
    const text = items.find((entry) => entry.id === "paragraph");
    expect(text?.disabled).toBe(false);
  });

  test("turn-into mode lists conversions only and marks the current kind", () => {
    const editor = createEditor([paragraph("p1", "Hi")]);
    const items = blockPickerTurnItems(editor, pathOf(editor, "p1"));
    const ids = items.map((entry) => entry.id);
    expect(ids).toContain("h1");
    expect(ids).toContain("bulleted");
    // Non-conversions are not listed.
    expect(ids).not.toContain("divider");
    expect(ids).not.toContain("table");
    expect(ids).not.toContain("equation");
    expect(items.find((entry) => entry.id === "paragraph")?.checked).toBe(true);
    expect(items.find((entry) => entry.id === "h1")?.checked).toBe(false);
  });
});

describe("insert picked block", () => {
  test("each add item inserts below the target as one undo", () => {
    const cases: Array<[string, string]> = [
      ["paragraph", KEYS.p],
      ["h1", KEYS.h1],
      ["bulleted", KEYS.p],
      ["todo", KEYS.p],
      ["toggle", KEYS.toggle],
      ["quote", KEYS.blockquote],
      ["callout", KEYS.callout],
      ["code", KEYS.codeBlock],
      ["divider", KEYS.hr],
      ["equation", KEYS.equation],
      ["toc", KEYS.toc],
      ["table", KEYS.table],
      ["columns", KEYS.columnGroup],
    ];
    for (const [pickId, type] of cases) {
      const live = createEditor([paragraph("a", "Hello"), paragraph("b", "World")]);
      const target = pathOf(live, "a");
      const undos = live.history.undos.length;
      const id = insertPickedBlock(live, target, item(live, target, pickId));
      expect(id).not.toBeNull();
      const inserted = live.children[1];
      expect(ElementApi.isElement(inserted) ? inserted.type : null).toBe(type);
      expect(live.history.undos.length).toBe(undos + 1);
      live.tf.undo();
      expect(topIds(live)).toEqual(["a", "b"]);
    }
  });

  test("a picked block inserts inside the same container when nested", () => {
    const editor = createEditor([
      {
        type: KEYS.toggle,
        id: "toggle",
        children: [paragraph("label", "Label"), paragraph("inside", "Text")],
      },
    ]);
    const target = pathOf(editor, "inside");
    const id = insertPickedBlock(editor, target, item(editor, target, "bulleted"));
    expect(id).not.toBeNull();
    expect(childIds(editor, "toggle")).toContain(String(id));
    expect(editor.children).toHaveLength(1);
    // The inserted list item sits after the target, inside the toggle.
    expect(childIds(editor, "toggle")[2]).toBe(String(id));
  });
});

describe("placeholder spec", () => {
  const top = { parentType: null, index: 0 };

  test("typed blocks show a placeholder whenever empty", () => {
    expect(
      placeholderSpec({ type: KEYS.h1, children: [{ text: "" }] }, top, "Type something…"),
    ).toEqual({ text: "Heading 1", always: true });
    expect(
      placeholderSpec(
        { type: KEYS.p, listStyleType: "disc", children: [{ text: "" }] },
        top,
        "Type something…",
      ),
    ).toEqual({ text: "List", always: true });
    expect(
      placeholderSpec(
        { type: KEYS.p, listStyleType: "todo", children: [{ text: "" }] },
        top,
        "Type something…",
      ),
    ).toEqual({ text: "To-do", always: true });
    expect(
      placeholderSpec({ type: KEYS.codeLine, children: [{ text: "" }] }, top, "Type something…"),
    ).toEqual({ text: "Code", always: true });
    expect(
      placeholderSpec(
        { type: KEYS.p, children: [{ text: "" }] },
        { parentType: KEYS.toggle, index: 0 },
        "Type something…",
      ),
    ).toEqual({ text: "Toggle", always: true });
    expect(
      placeholderSpec(
        { type: KEYS.p, children: [{ text: "" }] },
        { parentType: KEYS.blockquote, index: 0 },
        "Type something…",
      ),
    ).toEqual({ text: "Quote", always: true });
    expect(
      placeholderSpec(
        { type: KEYS.p, children: [{ text: "" }] },
        { parentType: KEYS.callout, index: 0 },
        "Type something…",
      ),
    ).toEqual({ text: "Type something…", always: true });
  });

  test("a plain paragraph shows only while it holds the caret, and non-empty is null", () => {
    expect(
      placeholderSpec({ type: KEYS.p, children: [{ text: "" }] }, top, "Type something…"),
    ).toEqual({ text: "Type something…", always: false });
    expect(
      placeholderSpec({ type: KEYS.p, children: [{ text: "hi" }] }, top, "Type something…"),
    ).toBeNull();
  });
});

describe("block placeholders in the DOM", () => {
  function isReactContainer(value: object): value is Parameters<typeof createRoot>[0] {
    return "nodeType" in value && value.nodeType === 1;
  }

  async function mount(value: TElement[], readOnly = false) {
    const host = document.createElement("div");
    host.setAttribute("data-block-viewport", "");
    document.body.appendChild(host);
    const editor = createPlateEditor({
      plugins: createEditorPlugins(),
      value: value as never,
    });
    if (!isReactContainer(host)) {
      throw new Error("Missing mount node.");
    }
    const root = createRoot(host);
    await act(async () => {
      root.render(
        <EditorSurface
          editor={editor}
          readOnly={readOnly}
          placeholder="Type something…"
          className="editor"
        />,
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
      },
    };
  }

  const placeholderOf = (host: HTMLElement, id: string): string | null =>
    host.querySelector(`[data-block-id="${id}"]`)?.getAttribute("data-block-placeholder") ?? null;

  test("empty typed blocks carry a placeholder, a plain paragraph only while it has the caret", async () => {
    const mounted = await mount([
      { type: KEYS.h1, id: "h", children: [{ text: "" }] },
      paragraph("spacer", ""),
    ]);
    try {
      await act(async () => {
        mounted.editor.tf.select({
          anchor: { path: [0, 0], offset: 0 },
          focus: { path: [0, 0], offset: 0 },
        });
      });
      expect(placeholderOf(mounted.host, "h")).toBe("Heading 1");
      // The caret is in the heading, so the empty paragraph shows none.
      expect(placeholderOf(mounted.host, "spacer")).toBeNull();
      await act(async () => {
        mounted.editor.tf.select({
          anchor: { path: [1, 0], offset: 0 },
          focus: { path: [1, 0], offset: 0 },
        });
      });
      expect(placeholderOf(mounted.host, "spacer")).toBe("Type something…");
    } finally {
      await mounted.cleanup();
    }
  });

  test("read-only shows no placeholders", async () => {
    const mounted = await mount([{ type: KEYS.h1, id: "h", children: [{ text: "" }] }], true);
    try {
      expect(mounted.host.querySelector("[data-block-placeholder]")).toBeNull();
    } finally {
      await mounted.cleanup();
    }
  });
});

describe("editor delete wording", () => {
  const editorRoot = join(import.meta.dir, "..");

  test("no user-visible Remove string remains for a delete action", () => {
    const files = [
      "lib/features/editor-equation.ts",
      "lib/features/editor-toc.ts",
      "lib/features/editor-bookmark.ts",
      "lib/features/editor-synced-block.ts",
      "lib/commands/editor-columns.ts",
      "components/elements/column-element.tsx",
      "components/elements/bookmark-element.tsx",
      "components/elements/toc-element.tsx",
      "components/elements/equation-element.tsx",
    ];
    for (const file of files) {
      const text = readFileSync(join(editorRoot, file), "utf8");
      expect(text).not.toMatch(/label[=:] ?"Remove"/);
      expect(text).not.toContain('"Remove column"');
      expect(text).not.toContain('"Remove columns');
    }
  });

  test("the remove-link exception is kept", () => {
    const link = readFileSync(join(editorRoot, "lib/plugins/editor-link.ts"), "utf8");
    expect(link).toContain('"Remove link"');
  });
});

describe("active menu item state", () => {
  const editorRoot = join(import.meta.dir, "..");

  test("every checked/radio menu applies the shared active class", () => {
    const files = [
      "components/ui/block-picker.tsx",
      "components/elements/callout-element.tsx",
      "components/elements/toc-element.tsx",
      "components/elements/column-element.tsx",
      "components/elements/code-block-element.tsx",
      "components/ui/table-controls.tsx",
    ];
    for (const file of files) {
      const text = readFileSync(join(editorRoot, file), "utf8");
      expect(text).toMatch(/MENU_ITEM_ACTIVE/);
    }
  });
});
