import { describe, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { KEYS, type SlateEditor, type TElement } from "platejs";
import { createPlateEditor } from "platejs/react";

import { DropdownMenu, DropdownMenuContent } from "@/components/dropdown-menu";

import { EditorSurface } from "../components/editor/editor-surface";
import { BlockPickerGroups } from "../components/ui/block-picker";
import { runEditorCommand } from "../lib/commands/editor-commands";
import { createEditorDocument } from "../lib/document/editor-document";
import { parseEditorDocument } from "../lib/document/editor-document-validate";
import type { EditorValue } from "../lib/document/editor-value";
import { blockPickerAddItems } from "../lib/features/editor-block-picker";
import { BOOKMARK_INVALID_URL, BOOKMARK_KEY } from "../lib/features/editor-bookmark-url";
import { createTableNode } from "../lib/features/editor-table";
import {
  bookmarkUrlOpen,
  bookmarkUrlPlugin,
  cancelBookmarkUrl,
  submitBookmarkUrl,
} from "../lib/plugins/editor-bookmark-popover";
import { createEditorPlugins } from "../lib/plugins/editor-plugins";
import { chooseSlashItem, slashMenuItems, slashMenuOpen } from "../lib/plugins/editor-slash";
import { pasteRepairsOf } from "../lib/paste/editor-paste";
import { caret, createEditor, expectOk, field } from "./test-utils";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

const URL = "https://example.com/docs";

if (!("ResizeObserver" in globalThis)) {
  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  globalThis.ResizeObserver = ResizeObserverStub;
}

function paragraph(text: string, id = "block-1"): TElement {
  return { type: KEYS.p, id, children: [{ text }] };
}

function typeSlash(editor: SlateEditor, query = ""): void {
  editor.tf.insertText("/");
  if (query.length > 0) {
    editor.tf.insertText(query);
  }
}

function ids(value: readonly unknown[]): string[] {
  return value.flatMap((node) =>
    typeof node === "object" && node !== null && "id" in node && typeof node.id === "string"
      ? [node.id]
      : [],
  );
}

function bookmarkItem(editor: SlateEditor) {
  return slashMenuItems(editor).find((item) => item.id === "bookmark");
}

function chooseBookmark(editor: SlateEditor): void {
  runEditorCommand(editor, chooseSlashItem, "bookmark");
}

function withViewport(run: () => Promise<void>): Promise<void> {
  const previousWidth = Reflect.get(globalThis, "innerWidth");
  const previousHeight = Reflect.get(globalThis, "innerHeight");
  Reflect.set(globalThis, "innerWidth", 1280);
  Reflect.set(globalThis, "innerHeight", 800);
  return run().finally(() => {
    if (previousWidth === undefined) {
      Reflect.deleteProperty(globalThis, "innerWidth");
    } else {
      Reflect.set(globalThis, "innerWidth", previousWidth);
    }
    if (previousHeight === undefined) {
      Reflect.deleteProperty(globalThis, "innerHeight");
    } else {
      Reflect.set(globalThis, "innerHeight", previousHeight);
    }
  });
}

async function mount(value: TElement[], readOnly = false) {
  const editor = createPlateEditor({
    plugins: createEditorPlugins(),
    value,
  });
  const host = document.createElement("div");
  document.body.appendChild(host);
  let root: Root | undefined;
  await act(async () => {
    root = createRoot(host);
    root.render(
      <EditorSurface editor={editor} readOnly={readOnly} placeholder="" className="p-0" />,
    );
  });
  return {
    editor,
    host,
    render(nextReadOnly: boolean) {
      return act(async () => {
        root?.render(
          <EditorSurface editor={editor} readOnly={nextReadOnly} placeholder="" className="p-0" />,
        );
      });
    },
    async cleanup() {
      await act(async () => {
        root?.unmount();
      });
      host.remove();
    },
  };
}

describe("slash bookmark item", () => {
  test("lists Bookmark in Advanced after Columns, and not in the add menu", () => {
    const empty = createEditor([paragraph(""), paragraph("next", "next")]);
    empty.tf.select(caret([0, 0], 0));
    typeSlash(empty);
    const listed = bookmarkItem(empty);
    expect(listed).toMatchObject({
      id: "bookmark",
      label: "Bookmark",
      description: "Save a link as a card",
      keywords: ["web", "url", "embed"],
      group: "Advanced",
    });
    const advanced = slashMenuItems(empty)
      .filter((item) => item.group === "Advanced")
      .map((item) => item.id);
    expect(advanced.indexOf("bookmark")).toBe(advanced.indexOf("columns") + 1);

    const text = createEditor([paragraph("Keep ")]);
    text.tf.select(caret([0, 0], 5));
    typeSlash(text, "book");
    expect(slashMenuItems(text)[0]?.id).toBe("bookmark");

    const column = createEditor([
      {
        type: KEYS.columnGroup,
        id: "group",
        children: [
          {
            type: KEYS.column,
            id: "column",
            width: "50%",
            children: [paragraph("", "inner")],
          },
          {
            type: KEYS.column,
            id: "column-2",
            width: "50%",
            children: [paragraph("", "other")],
          },
        ],
      },
    ]);
    column.tf.select(caret([0, 0, 0, 0], 0));
    typeSlash(column);
    expect(bookmarkItem(column)?.id).toBe("bookmark");

    const toggle = createEditor([
      {
        type: KEYS.toggle,
        id: "toggle",
        children: [paragraph("", "label"), paragraph("", "body")],
      },
    ]);
    toggle.tf.select(caret([0, 1, 0], 0));
    typeSlash(toggle);
    expect(bookmarkItem(toggle)?.id).toBe("bookmark");

    expect(blockPickerAddItems(empty, [0]).some((item) => item.label === "Bookmark")).toBe(false);
  });

  test("refuses a table cell, a quote, a callout, a toggle label, and read-only", () => {
    const table = createTableNode(1, 1);
    table.id = "table";
    const cellParagraph = ((table.children[0] as TElement).children[0] as TElement)
      .children[0] as TElement;
    cellParagraph.id = "cell";
    const cell = createEditor([table]);
    cell.tf.select(caret([0, 0, 0, 0, 0], 0));
    typeSlash(cell);
    expect(slashMenuOpen(cell)).toBe(true);
    expect(bookmarkItem(cell)).toBeUndefined();

    const quote = createEditor([
      { type: KEYS.blockquote, id: "quote", children: [paragraph("", "inner")] },
    ]);
    quote.tf.select(caret([0, 0, 0], 0));
    typeSlash(quote);
    expect(bookmarkItem(quote)).toBeUndefined();

    const callout = createEditor([
      { type: KEYS.callout, id: "callout", children: [paragraph("", "inner")] },
    ]);
    callout.tf.select(caret([0, 0, 0], 0));
    typeSlash(callout);
    expect(bookmarkItem(callout)).toBeUndefined();

    const label = createEditor([
      { type: KEYS.toggle, id: "toggle", children: [paragraph("", "label")] },
    ]);
    label.tf.select(caret([0, 0, 0], 0));
    typeSlash(label);
    expect(bookmarkItem(label)).toBeUndefined();

    const quiet = createEditor([paragraph("")]);
    quiet.dom.readOnly = true;
    quiet.tf.select(caret([0, 0], 0));
    typeSlash(quiet);
    expect(slashMenuItems(quiet).some((item) => item.id === "bookmark")).toBe(false);
  });

  test("/book, /web, and /embed find Bookmark, and /link keeps Link first", () => {
    for (const query of ["book", "web", "embed"]) {
      const editor = createEditor([paragraph("")]);
      editor.tf.select(caret([0, 0], 0));
      typeSlash(editor, query);
      expect(slashMenuItems(editor).some((item) => item.id === "bookmark")).toBe(true);
    }

    const url = createEditor([paragraph("")]);
    url.tf.select(caret([0, 0], 0));
    typeSlash(url, "url");
    const urlIds = slashMenuItems(url).map((item) => item.id);
    expect(urlIds).toContain("bookmark");
    expect(urlIds).toContain("link");

    const link = createEditor([paragraph("")]);
    link.tf.select(caret([0, 0], 0));
    typeSlash(link, "link");
    const listed = slashMenuItems(link);
    expect(listed[0]?.id).toBe("link");
    expect(listed.some((item) => item.id === "bookmark")).toBe(false);
  });
});

describe("slash bookmark insert", () => {
  test("choosing it deletes the query, closes the menu, and inserts nothing yet", () => {
    const editor = createEditor([
      paragraph("above", "above"),
      paragraph("", "target"),
      paragraph("below", "below"),
    ]);
    editor.tf.select(caret([1, 0], 0));
    typeSlash(editor, "book");
    const beforeChoose = editor.history.undos.length;
    chooseBookmark(editor);
    expect(slashMenuOpen(editor)).toBe(false);
    expect(bookmarkUrlOpen(editor)).toBe(true);
    expect(editor.api.string(editor.children[1]!)).toBe("");
    expect(editor.children.some((node) => node.type === BOOKMARK_KEY)).toBe(false);
    expect(editor.history.undos.length).toBe(beforeChoose + 1);
    expect(ids(editor.children)).toEqual(["above", "target", "below"]);
  });

  test("a valid url replaces an empty paragraph and lands below text, with divider selection", () => {
    const empty = createEditor([
      paragraph("above", "above"),
      paragraph("", "target"),
      paragraph("below", "below"),
    ]);
    empty.tf.select(caret([1, 0], 0));
    typeSlash(empty);
    chooseBookmark(empty);
    const afterDelete = JSON.parse(JSON.stringify(empty.children));
    expect(submitBookmarkUrl(empty, `  ${URL}  `)).toBe(true);
    expect(bookmarkUrlOpen(empty)).toBe(false);
    expect(empty.children.map((node) => node.type)).toEqual(["p", BOOKMARK_KEY, "p"]);
    expect(ids(empty.children)).toEqual(["above", expect.any(String), "below"]);
    expect(ids(empty.children)).not.toContain("target");
    expect(field(empty.children[1], "url")).toBe(URL);
    expectOk(parseEditorDocument(createEditorDocument("doc", empty.children as EditorValue)));

    const divider = createEditor([
      paragraph("above", "above"),
      paragraph("", "target"),
      paragraph("below", "below"),
    ]);
    divider.tf.select(caret([1, 0], 0));
    typeSlash(divider);
    runEditorCommand(divider, chooseSlashItem, "divider");
    expect(empty.selection).toEqual(divider.selection);

    const text = createEditor([paragraph("Keep ", "target"), paragraph("next", "next")]);
    text.tf.select(caret([0, 0], 5));
    typeSlash(text, "book");
    chooseBookmark(text);
    expect(submitBookmarkUrl(text, URL)).toBe(true);
    expect(text.api.string(text.children[0]!)).toBe("Keep ");
    expect(field(text.children[0], "id")).toBe("target");
    expect(text.children[1]?.type).toBe(BOOKMARK_KEY);
    expect(field(text.children[1], "url")).toBe(URL);
    expect(field(text.children[2], "id")).toBe("next");
    expectOk(parseEditorDocument(createEditorDocument("doc", text.children as EditorValue)));

    const belowDivider = createEditor([paragraph("Keep ", "target"), paragraph("next", "next")]);
    belowDivider.tf.select(caret([0, 0], 5));
    typeSlash(belowDivider, "div");
    runEditorCommand(belowDivider, chooseSlashItem, "divider");
    expect(text.selection).toEqual(belowDivider.selection);
    expect(afterDelete).toBeDefined();
  });

  test("an invalid url keeps the popover open and does not use the paste repair", () => {
    for (const raw of ["", "not a url", "javascript:alert(1)"]) {
      const editor = createEditor([paragraph("", "target")]);
      editor.tf.select(caret([0, 0], 0));
      typeSlash(editor, "book");
      chooseBookmark(editor);
      const afterDelete = JSON.parse(JSON.stringify(editor.children));
      const undos = editor.history.undos.length;
      expect(submitBookmarkUrl(editor, raw)).toBe(false);
      expect(bookmarkUrlOpen(editor)).toBe(true);
      expect(editor.getOption(bookmarkUrlPlugin, "error")).toBe(BOOKMARK_INVALID_URL);
      expect(editor.children).toEqual(afterDelete);
      expect(editor.children.some((node) => node.type === BOOKMARK_KEY)).toBe(false);
      expect(pasteRepairsOf(editor)).toEqual([]);
      expect(editor.history.undos.length).toBe(undos);
    }
  });

  test("escape and a missing block insert nothing", () => {
    const editor = createEditor([paragraph("", "target"), paragraph("stay", "stay")]);
    editor.tf.select(caret([0, 0], 0));
    typeSlash(editor, "book");
    chooseBookmark(editor);
    const afterDelete = JSON.parse(JSON.stringify(editor.children));
    cancelBookmarkUrl(editor);
    expect(bookmarkUrlOpen(editor)).toBe(false);
    expect(slashMenuOpen(editor)).toBe(false);
    expect(editor.children).toEqual(afterDelete);
    expect(editor.selection).toEqual(caret([0, 0], 0));

    const removed = createEditor([paragraph("above", "above"), paragraph("", "target")]);
    removed.tf.select(caret([1, 0], 0));
    typeSlash(removed, "book");
    chooseBookmark(removed);
    removed.tf.removeNodes({ at: [1] });
    expect(submitBookmarkUrl(removed, URL)).toBe(false);
    expect(bookmarkUrlOpen(removed)).toBe(false);
    expect(removed.children.some((node) => node.type === BOOKMARK_KEY)).toBe(false);
    expect(field(removed.children[0], "id")).toBe("above");
  });

  test("undo removes the bookmark, then restores the query, and neither menu reopens", () => {
    const editor = createEditor([paragraph("", "target")]);
    editor.tf.select(caret([0, 0], 0));
    typeSlash(editor, "book");
    chooseBookmark(editor);
    const afterDelete = JSON.parse(JSON.stringify(editor.children));
    expect(submitBookmarkUrl(editor, URL)).toBe(true);
    editor.tf.undo();
    expect(editor.children).toEqual(afterDelete);
    expect(editor.api.string(editor.children[0]!)).toBe("");
    expect(bookmarkUrlOpen(editor)).toBe(false);
    expect(slashMenuOpen(editor)).toBe(false);
    editor.tf.undo();
    expect(editor.api.string(editor.children[0]!)).toBe("/book");
    expect(bookmarkUrlOpen(editor)).toBe(false);
    expect(slashMenuOpen(editor)).toBe(false);
    editor.tf.redo();
    expect(editor.api.string(editor.children[0]!)).toBe("");
    expect(slashMenuOpen(editor)).toBe(false);
    expect(bookmarkUrlOpen(editor)).toBe(false);
    editor.tf.redo();
    expect(editor.children[0]?.type).toBe(BOOKMARK_KEY);
    expect(slashMenuOpen(editor)).toBe(false);
    expect(bookmarkUrlOpen(editor)).toBe(false);
  });
});

describe("slash bookmark popover", () => {
  test("shows the field, the error, and closes on escape, outside press, and read-only", async () => {
    await withViewport(async () => {
      const mounted = await mount([paragraph("", "target")]);
      await act(async () => {
        mounted.editor.tf.select(caret([0, 0], 0));
        typeSlash(mounted.editor, "book");
        chooseBookmark(mounted.editor);
      });
      const popover = document.querySelector("[data-bookmark-url-popover]");
      expect(popover).not.toBeNull();
      expect(document.querySelector("[data-slash-menu]")).toBeNull();
      const input = document.querySelector("[aria-label='Bookmark URL']");
      if (!(input instanceof HTMLInputElement)) {
        throw new Error("Missing bookmark URL field.");
      }
      expect(input.placeholder).toBe("Paste a link");
      expect(input.type).toBe("text");
      expect(input.inputMode).toBe("url");
      expect(document.activeElement).toBe(input);
      expect(mounted.editor.children.some((node) => node.type === BOOKMARK_KEY)).toBe(false);

      await act(async () => {
        submitBookmarkUrl(mounted.editor, "not a url");
      });
      expect(input.getAttribute("aria-invalid")).toBe("true");
      expect(input.getAttribute("aria-describedby")).toBe(
        document.querySelector("[role='alert']")?.id ?? null,
      );
      expect(document.querySelector("[role='alert']")?.textContent).toBe(BOOKMARK_INVALID_URL);
      expect(document.querySelector("[data-bookmark-url-popover]")).not.toBeNull();
      expect(pasteRepairsOf(mounted.editor)).toEqual([]);

      const afterDelete = JSON.parse(JSON.stringify(mounted.editor.children));
      await act(async () => {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      });
      expect(document.querySelector("[data-bookmark-url-popover]")).toBeNull();
      expect(mounted.editor.children).toEqual(afterDelete);
      expect(mounted.editor.selection).toEqual(caret([0, 0], 0));

      await act(async () => {
        typeSlash(mounted.editor, "book");
        chooseBookmark(mounted.editor);
      });
      const outside = JSON.parse(JSON.stringify(mounted.editor.children));
      await act(async () => {
        document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      });
      expect(document.querySelector("[data-bookmark-url-popover]")).toBeNull();
      expect(mounted.editor.children).toEqual(outside);

      await act(async () => {
        typeSlash(mounted.editor, "book");
        chooseBookmark(mounted.editor);
      });
      await act(async () => {
        mounted.editor.dom.readOnly = true;
        if (typeof mounted.editor.onChange === "function") {
          mounted.editor.onChange();
        }
      });
      expect(bookmarkUrlOpen(mounted.editor)).toBe(false);
      expect(mounted.editor.children.some((node) => node.type === BOOKMARK_KEY)).toBe(false);

      const addHost = document.createElement("div");
      document.body.appendChild(addHost);
      const addRoot = createRoot(addHost);
      await act(async () => {
        addRoot.render(
          <DropdownMenu open>
            <DropdownMenuContent>
              <BlockPickerGroups
                items={blockPickerAddItems(createEditor([paragraph("Hello")]), [0])}
                onChoose={() => undefined}
              />
            </DropdownMenuContent>
          </DropdownMenu>,
        );
      });
      expect(addHost.querySelector("[data-block-picker-item='bookmark']")).toBeNull();
      expect(addHost.textContent).not.toContain("Save a link as a card");
      await act(async () => {
        addRoot.unmount();
      });
      addHost.remove();
      await mounted.cleanup();
    });
  });
});
