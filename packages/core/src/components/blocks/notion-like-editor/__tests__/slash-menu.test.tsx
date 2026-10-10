import { describe, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { KEYS, type SlateEditor, type TElement } from "platejs";
import { createPlateEditor, pipeHandler } from "platejs/react";

import { DropdownMenu, DropdownMenuContent } from "@/components/dropdown-menu";

import { EditorSurface } from "../components/editor/editor-surface";
import { BlockPickerGroups } from "../components/ui/block-picker";
import { runEditorCommand } from "../lib/commands/editor-commands";
import { createEditorDocument } from "../lib/document/editor-document";
import { parseEditorDocument } from "../lib/document/editor-document-validate";
import type { EditorValue } from "../lib/document/editor-value";
import { blockPickerAddItems } from "../lib/features/editor-block-picker";
import {
  readSlashSession,
  slashMatchRank,
  SLASH_EMPTY_LABEL,
  SLASH_QUERY_LIMIT,
} from "../lib/features/editor-slash";
import { createTableNode } from "../lib/features/editor-table";
import { createEditorPlugins } from "../lib/plugins/editor-plugins";
import { attachMentionProvider } from "../lib/plugins/editor-mention";
import { linkUiPlugin } from "../lib/plugins/editor-link";
import {
  chooseSlashItem,
  closeSlashMenu,
  onSlashKeyDown,
  setSlashComposing,
  slashMenuItems,
  slashMenuOpen,
  slashUiPlugin,
  SLASH_HANDLER_PRIORITY,
} from "../lib/plugins/editor-slash";
import { caret, createEditor, expectOk, textRange } from "./test-utils";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

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

function key(
  name: string,
  extra?: { shiftKey?: boolean },
): { key: string; preventDefault: () => void; defaultPrevented: boolean; shiftKey?: boolean } {
  let prevented = false;
  return {
    key: name,
    shiftKey: extra?.shiftKey,
    preventDefault: () => {
      prevented = true;
    },
    get defaultPrevented() {
      return prevented;
    },
  };
}

async function flush(): Promise<void> {
  await Promise.resolve();
}

function press(editor: SlateEditor, name: string): boolean {
  const event = new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true });
  const handler = pipeHandler(editor, { handlerKey: "onKeyDown" });
  handler?.(event);
  return event.defaultPrevented;
}

function ids(editor: SlateEditor): string[] {
  return editor.children.flatMap((node) =>
    "id" in node && typeof node.id === "string" ? [node.id] : [],
  );
}

describe("slash trigger", () => {
  test("opens at the block start and after whitespace only", () => {
    const start = createEditor([paragraph("")]);
    start.tf.select(caret([0, 0], 0));
    typeSlash(start);
    expect(slashMenuOpen(start)).toBe(true);

    const spaced = createEditor([paragraph("and ")]);
    spaced.tf.select(caret([0, 0], 4));
    typeSlash(spaced);
    expect(slashMenuOpen(spaced)).toBe(true);

    for (const text of ["and", "1", "http:", "a/"]) {
      const editor = createEditor([paragraph(text)]);
      editor.tf.select(caret([0, 0], text.length));
      typeSlash(editor);
      expect(slashMenuOpen(editor)).toBe(false);
      expect(editor.api.string(editor.children[0]!)).toBe(`${text}/`);
    }
  });

  test("does not open in code, a code mark, a link, read-only, a range, or composition", () => {
    const code = createEditor([
      {
        type: KEYS.codeBlock,
        id: "code",
        children: [{ type: KEYS.codeLine, id: "line", children: [{ text: "" }] }],
      },
    ]);
    code.tf.select(caret([0, 0, 0], 0));
    typeSlash(code);
    expect(slashMenuOpen(code)).toBe(false);

    const marked = createEditor([paragraph("")]);
    marked.tf.select(caret([0, 0], 0));
    marked.tf.addMark(KEYS.code, true);
    typeSlash(marked);
    expect(slashMenuOpen(marked)).toBe(false);

    const linked = createEditor([
      {
        type: KEYS.p,
        id: "p",
        children: [{ type: KEYS.link, url: "https://example.com", children: [{ text: "go" }] }],
      },
    ]);
    linked.tf.select(caret([0, 0, 0], 1));
    typeSlash(linked);
    expect(slashMenuOpen(linked)).toBe(false);

    const quiet = createEditor([paragraph("")]);
    quiet.dom.readOnly = true;
    quiet.tf.select(caret([0, 0], 0));
    typeSlash(quiet);
    expect(slashMenuOpen(quiet)).toBe(false);

    const range = createEditor([paragraph("hello")]);
    range.tf.select(textRange([0, 0], 0, 2));
    typeSlash(range);
    expect(slashMenuOpen(range)).toBe(false);

    const composing = createEditor([paragraph("")]);
    composing.tf.select(caret([0, 0], 0));
    composing.composing = true;
    typeSlash(composing);
    expect(slashMenuOpen(composing)).toBe(false);

    const committed = createEditor([paragraph("")]);
    committed.tf.select(caret([0, 0], 0));
    setSlashComposing(committed, true);
    setSlashComposing(committed, false);
    typeSlash(committed);
    expect(slashMenuOpen(committed)).toBe(false);
  });

  test("paste and undo or redo never open the menu", async () => {
    const pasted = createEditor([paragraph("")]);
    pasted.tf.select(caret([0, 0], 0));
    pasted.tf.insertFragment([{ type: KEYS.p, children: [{ text: "a/b" }] }]);
    expect(slashMenuOpen(pasted)).toBe(false);
    expect(JSON.stringify(pasted.children)).toContain("/");

    const typed = createEditor([paragraph("")]);
    typed.tf.select(caret([0, 0], 0));
    typeSlash(typed, "h");
    expect(slashMenuOpen(typed)).toBe(true);
    typed.tf.undo();
    await flush();
    expect(slashMenuOpen(typed)).toBe(false);
    typed.tf.redo();
    await flush();
    expect(slashMenuOpen(typed)).toBe(false);
    expect(typed.api.string(typed.children[0]!)).toContain("/");
  });
});

describe("slash query", () => {
  test("is the text after the slash, including spaces, and survives a split text node", () => {
    const editor = createEditor([paragraph(""), paragraph("next", "block-2")]);
    editor.tf.select(caret([0, 0], 0));
    typeSlash(editor, "heading 1");
    const session = readSlashSession(editor, {
      blockId: "block-1",
      offset: 0,
    });
    expect(session?.query).toBe("heading 1");
    expect(slashMenuOpen(editor)).toBe(true);

    editor.tf.select(textRange([0, 0], 2, 5));
    editor.tf.addMark(KEYS.bold, true);
    editor.tf.select(caret([0, 0], "/heading 1".length));
    const split = editor.children[0];
    expect(split?.children.length).toBeGreaterThan(1);
    expect(readSlashSession(editor, { blockId: "block-1", offset: 0 })?.query).toBe("heading 1");
  });
});

describe("slash closing", () => {
  test("escape, deleting the slash, moving away, a range, a dead query, and length leave the text", async () => {
    const escaped = createEditor([paragraph("")]);
    escaped.tf.select(caret([0, 0], 0));
    typeSlash(escaped, "hea");
    const escape = key("Escape");
    expect(onSlashKeyDown(escaped, escape)).toBe(true);
    expect(escape.defaultPrevented).toBe(true);
    expect(slashMenuOpen(escaped)).toBe(false);
    expect(escaped.api.string(escaped.children[0]!)).toBe("/hea");
    escaped.tf.insertText("x");
    expect(slashMenuOpen(escaped)).toBe(false);
    expect(escaped.api.string(escaped.children[0]!)).toBe("/heax");

    const removed = createEditor([paragraph("")]);
    removed.tf.select(caret([0, 0], 0));
    typeSlash(removed);
    removed.tf.deleteBackward("character");
    await flush();
    expect(slashMenuOpen(removed)).toBe(false);
    expect(removed.api.string(removed.children[0]!)).toBe("");

    const moved = createEditor([paragraph(""), paragraph("next", "block-2")]);
    moved.tf.select(caret([0, 0], 0));
    typeSlash(moved, "h");
    moved.tf.select(caret([1, 0], 0));
    await flush();
    expect(slashMenuOpen(moved)).toBe(false);
    expect(moved.api.string(moved.children[0]!)).toBe("/h");

    const before = createEditor([paragraph("a")]);
    before.tf.select(caret([0, 0], 1));
    typeSlash(before);
    before.tf.select(caret([0, 0], 1));
    await flush();
    expect(slashMenuOpen(before)).toBe(false);
    expect(before.api.string(before.children[0]!)).toBe("a/");

    const ranged = createEditor([paragraph("")]);
    ranged.tf.select(caret([0, 0], 0));
    typeSlash(ranged, "h");
    ranged.tf.select(textRange([0, 0], 0, 2));
    await flush();
    expect(slashMenuOpen(ranged)).toBe(false);
    expect(ranged.api.string(ranged.children[0]!)).toBe("/h");

    const spaced = createEditor([paragraph("")]);
    spaced.tf.select(caret([0, 0], 0));
    typeSlash(spaced, "zzzz");
    expect(slashMenuItems(spaced)).toEqual([]);
    onSlashKeyDown(spaced, key(" "));
    spaced.tf.insertText(" ");
    expect(slashMenuOpen(spaced)).toBe(false);
    expect(spaced.api.string(spaced.children[0]!)).toBe("/zzzz ");
    spaced.tf.insertText("a");
    expect(slashMenuOpen(spaced)).toBe(false);

    const long = createEditor([paragraph("")]);
    long.tf.select(caret([0, 0], 0));
    typeSlash(long, "a".repeat(SLASH_QUERY_LIMIT));
    expect(slashMenuOpen(long)).toBe(true);
    long.tf.insertText("b");
    await flush();
    expect(slashMenuOpen(long)).toBe(false);
    expect(long.api.string(long.children[0]!).length).toBe(SLASH_QUERY_LIMIT + 2);
  });

  test("a pointer outside, blur, and read-only close without changing text", async () => {
    const editor = createPlateEditor({
      plugins: createEditorPlugins(),
      value: [paragraph("")],
    });
    const host = document.createElement("div");
    document.body.appendChild(host);
    let root: Root | undefined;
    await act(async () => {
      root = createRoot(host);
      root.render(
        <EditorSurface editor={editor} readOnly={false} placeholder="" className="p-0" />,
      );
    });
    await act(async () => {
      editor.tf.select(caret([0, 0], 0));
      typeSlash(editor, "hea");
      await Promise.resolve();
    });
    await act(async () => {
      document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    });
    expect(slashMenuOpen(editor)).toBe(false);
    expect(editor.api.string(editor.children[0]!)).toBe("/hea");

    typeSlash(editor, "");
    expect(slashMenuOpen(editor)).toBe(false);
    editor.tf.select(caret([0, 0], 0));
    editor.tf.insertText("/");
    expect(slashMenuOpen(editor)).toBe(true);
    editor.dom.readOnly = true;
    if (typeof editor.onChange === "function") {
      editor.onChange();
    }
    expect(slashMenuOpen(editor)).toBe(false);

    const blurred = createEditor([paragraph("")]);
    blurred.tf.select(caret([0, 0], 0));
    typeSlash(blurred, "hea");
    const blur = blurred.getPlugin(slashUiPlugin).handlers?.onBlur;
    blur?.({
      editor: blurred,
      event: { relatedTarget: document.body },
    } as never);
    await flush();
    expect(slashMenuOpen(blurred)).toBe(false);
    expect(blurred.api.string(blurred.children[0]!)).toBe("/hea");

    await act(async () => {
      root?.unmount();
    });
    host.remove();
  });
});

describe("slash matching", () => {
  test("ranks label prefix, later words, keywords, substrings, then subsequences", () => {
    const editor = createEditor([paragraph("")]);
    editor.tf.select(caret([0, 0], 0));
    typeSlash(editor);
    const labels = (query: string) => {
      editor.tf.select(caret([0, 0], 1));
      editor.tf.delete({
        at: {
          anchor: { path: [0, 0], offset: 1 },
          focus: { path: [0, 0], offset: editor.api.string(editor.children[0]!).length },
        },
      });
      if (query.length > 0) {
        editor.tf.insertText(query);
      }
      return slashMenuItems(editor).map((item) => item.label);
    };

    const headings = labels("h");
    expect(headings[0]).toBe("Heading 1");
    expect(headings[1]).toBe("Heading 2");
    expect(headings[2]).toBe("Heading 3");
    expect(headings.indexOf("Heading 1")).toBeLessThan(headings.indexOf("Toggle heading 1"));

    expect(labels("head 2")[0]).toBe("Heading 2");
    expect(labels("heading 2")[0]).toBe("Heading 2");
    expect(labels("todo")).toContain("To-do list");
    expect(labels("task")).toContain("To-do list");
    expect(labels("checkbox")).toContain("To-do list");
    expect(labels("hr")).toContain("Divider");
    expect(labels("table").slice(0, 2)).toEqual(["Table", "Table of contents"]);
    expect(labels("toggle")[0]).toBe("Toggle");
    expect(labels("h2").slice(0, 2)).toEqual(["Heading 2", "Toggle heading 2"]);
    expect(labels("tab").slice(0, 2)).toEqual(["Table of contents", "Table"]);
    expect(labels("toc")[0]).toBe("Table of contents");
    expect(labels("tb")).toContain("Table");
    expect(slashMatchRank("Table", [], "tb")).toBe(5);
    expect(labels("zzzz")).toEqual([]);

    const tied = labels("list");
    const listOrder = ["Bulleted list", "Numbered list", "To-do list"];
    expect(tied.filter((label) => listOrder.includes(label))).toEqual(listOrder);
  });
});

describe("slash keys", () => {
  test("arrows wrap without moving the caret, and enter or tab choose or close", () => {
    const editor = createEditor([paragraph(""), paragraph("stay", "block-2")]);
    editor.tf.select(caret([0, 0], 0));
    typeSlash(editor);
    const before = editor.selection;
    const count = slashMenuItems(editor).length;
    press(editor, "ArrowDown");
    expect(editor.getOption(slashUiPlugin, "activeIndex")).toBe(1);
    expect(editor.selection).toEqual(before);
    for (let step = 0; step < count; step += 1) {
      press(editor, "ArrowDown");
    }
    expect(editor.getOption(slashUiPlugin, "activeIndex")).toBe(1);
    press(editor, "ArrowUp");
    expect(editor.getOption(slashUiPlugin, "activeIndex")).toBe(0);
    expect(editor.selection).toEqual(before);

    const empty = createEditor([paragraph("")]);
    empty.tf.select(caret([0, 0], 0));
    typeSlash(empty, "zzzz");
    expect(press(empty, "Enter")).toBe(true);
    expect(slashMenuOpen(empty)).toBe(false);
    expect(empty.children).toHaveLength(1);
    expect(empty.api.string(empty.children[0]!)).toBe("/zzzz");

    const tabbed = createEditor([paragraph("")]);
    tabbed.tf.select(caret([0, 0], 0));
    typeSlash(tabbed, "zzzz");
    expect(press(tabbed, "Tab")).toBe(true);
    expect(tabbed.children).toHaveLength(1);
    expect(tabbed.api.string(tabbed.children[0]!)).toBe("/zzzz");
  });

  test("enter on /table inserts a table, not a table of contents", () => {
    const editor = createEditor([paragraph("")]);
    editor.tf.select(caret([0, 0], 0));
    typeSlash(editor, "table");
    expect(slashMenuItems(editor)[0]?.id).toBe("table");
    expect(press(editor, "Enter")).toBe(true);
    expect(editor.children[0]?.type).toBe(KEYS.table);
    expect(editor.children.some((node) => node.type === KEYS.toc)).toBe(false);
  });

  test("list and table enter and tab do not run while the menu is open", () => {
    const list = createEditor([
      { type: KEYS.p, id: "item", listStyleType: "disc", indent: 1, children: [{ text: "" }] },
    ]);
    list.tf.select(caret([0, 0], 0));
    typeSlash(list, "zzzz");
    expect(press(list, "Enter")).toBe(true);
    expect(list.children).toHaveLength(1);
    expect(list.api.string(list.children[0]!)).toBe("/zzzz");

    const table = createTableNode(2, 2);
    table.id = "table";
    const row = table.children[0] as TElement | undefined;
    const first = row?.children[0] as TElement | undefined;
    const paragraphNode = first?.children[0] as TElement | undefined;
    if (!paragraphNode || paragraphNode.type !== KEYS.p) {
      throw new Error("Missing cell paragraph");
    }
    paragraphNode.id = "cell";
    const editor = createEditor([table, paragraph("after", "after")]);
    const cellPath = [0, 0, 0, 0, 0];
    editor.tf.select(caret(cellPath, 0));
    typeSlash(editor, "zzzz");
    const selection = editor.selection;
    expect(press(editor, "Tab")).toBe(true);
    expect(editor.selection).toEqual(selection);
    expect(editor.api.string(editor.api.node(cellPath.slice(0, -1))?.[0] ?? paragraphNode)).toBe(
      "/zzzz",
    );
  });
});

describe("slash choose", () => {
  test("every item replaces an empty paragraph and lands below other text, as one undo", () => {
    const probe = createEditor([paragraph("")]);
    probe.tf.select(caret([0, 0], 0));
    typeSlash(probe);
    const items = slashMenuItems(probe);
    expect(items.length).toBeGreaterThan(10);

    for (const source of ["/", "/que"] as const) {
      for (const item of items) {
        if (item.inline !== undefined) {
          continue;
        }
        const editor = createEditor([
          paragraph("above", "above"),
          paragraph(source === "/" ? "" : "", "target"),
          paragraph("below", "below"),
        ]);
        editor.tf.select(caret([1, 0], 0));
        typeSlash(editor, source.slice(1));
        expect(slashMenuOpen(editor)).toBe(true);
        const undos = editor.history.undos.length;
        runEditorCommand(editor, chooseSlashItem, item.id);
        expect(slashMenuOpen(editor)).toBe(false);
        expect(JSON.stringify(editor.children)).not.toContain(`"text":"${source}`);
        expect(ids(editor)).toContain("above");
        expect(ids(editor)).toContain("below");
        expect(editor.history.undos.length).toBe(undos + 1);
        const after = JSON.stringify(editor.children);
        editor.tf.undo();
        expect(slashMenuOpen(editor)).toBe(false);
        expect(editor.api.string(editor.children[1]!)).toBe(source);
        editor.tf.redo();
        expect(slashMenuOpen(editor)).toBe(false);
        expect(JSON.stringify(editor.children)).toBe(after);
        expectOk(parseEditorDocument(createEditorDocument("doc", editor.children as EditorValue)));
      }
    }

    const below = createEditor([paragraph("Keep ", "target"), paragraph("next", "next")]);
    below.tf.select(caret([0, 0], 5));
    typeSlash(below, "h2");
    runEditorCommand(below, chooseSlashItem, "h2");
    expect(below.api.string(below.children[0]!)).toBe("Keep ");
    expect(below.children[1]?.type).toBe(KEYS.h2);
    expect(ids(below)).toContain("next");
  });
});

describe("slash containers and inline", () => {
  test("listed block items match the add menu, and a choice stays valid", () => {
    const cases: { name: string; value: EditorValue; path: number[] }[] = [
      {
        name: "quote",
        value: [{ type: KEYS.blockquote, id: "quote", children: [paragraph("", "inner")] }],
        path: [0, 0, 0],
      },
      {
        name: "callout",
        value: [{ type: KEYS.callout, id: "callout", children: [paragraph("", "inner")] }],
        path: [0, 0, 0],
      },
      {
        name: "toggle",
        value: [
          {
            type: KEYS.toggle,
            id: "toggle",
            children: [paragraph("Label", "label"), paragraph("", "inner")],
          },
        ],
        path: [0, 1, 0],
      },
      {
        name: "list",
        value: [
          {
            type: KEYS.p,
            id: "inner",
            listStyleType: "disc",
            indent: 1,
            children: [{ text: "Item " }],
          },
        ],
        path: [0, 0],
      },
      {
        name: "table",
        value: [
          {
            ...createTableNode(1, 2),
            id: "table",
            children: [
              {
                type: KEYS.tr,
                children: [
                  {
                    type: KEYS.td,
                    children: [paragraph("Cell ", "inner")],
                  },
                  {
                    type: KEYS.td,
                    children: [paragraph("Other", "other")],
                  },
                ],
              },
            ],
          },
        ],
        path: [0, 0, 0, 0, 0],
      },
      {
        name: "column",
        value: [
          {
            type: KEYS.columnGroup,
            id: "group",
            children: [
              {
                type: KEYS.column,
                id: "column",
                width: "50%",
                children: [paragraph("Col ", "inner")],
              },
              {
                type: KEYS.column,
                id: "column-2",
                width: "50%",
                children: [paragraph("", "other")],
              },
            ],
          },
        ],
        path: [0, 0, 0, 0],
      },
    ];
    for (const entry of cases) {
      const editor = createEditor(entry.value);
      editor.tf.select(
        caret(
          entry.path,
          editor.api.string(editor.api.node(entry.path.slice(0, -1))?.[0] ?? paragraph("")) ===
            "Item "
            ? 5
            : 0,
        ),
      );
      const blockPath = entry.path.slice(0, -1);
      const text = editor.api.string(editor.api.node(blockPath)?.[0] ?? paragraph(""));
      editor.tf.select(caret(entry.path, text.length));
      typeSlash(editor);
      const allowed = blockPickerAddItems(editor, blockPath)
        .filter((item) => !item.disabled)
        .map((item) => item.id);
      const listed = slashMenuItems(editor)
        .filter((item) => item.block !== undefined)
        .map((item) => item.id);
      expect(listed).toEqual(allowed);
      const choice = listed[0];
      if (choice === undefined) {
        throw new Error(`No item in ${entry.name}`);
      }
      runEditorCommand(editor, chooseSlashItem, choice);
      expectOk(parseEditorDocument(createEditorDocument("doc", editor.children as EditorValue)));
    }
  });

  test("mention opens the input and link opens the popover", () => {
    const mention = createEditor([paragraph("")]);
    attachMentionProvider(mention, {
      search: () => Promise.resolve([]),
    });
    mention.tf.select(caret([0, 0], 0));
    typeSlash(mention, "men");
    expect(slashMenuItems(mention).some((item) => item.id === "mention")).toBe(true);
    runEditorCommand(mention, chooseSlashItem, "mention");
    expect(slashMenuOpen(mention)).toBe(false);
    expect(JSON.stringify(mention.children)).toContain(KEYS.mentionInput);
    expect(JSON.stringify(mention.children)).not.toContain('"/men"');

    const link = createEditor([paragraph("")]);
    link.tf.select(caret([0, 0], 0));
    typeSlash(link);
    expect(slashMenuItems(link).some((item) => item.id === "link")).toBe(true);
    runEditorCommand(link, chooseSlashItem, "link");
    expect(link.getOption(linkUiPlugin, "mode")).not.toBe("closed");
  });
});

describe("slash menu ui", () => {
  test("markers, empty row, and add menu rows stay free of descriptions", async () => {
    const editor = createPlateEditor({
      plugins: createEditorPlugins(),
      value: [paragraph("")],
    });
    const host = document.createElement("div");
    document.body.appendChild(host);
    let root: Root | undefined;
    await act(async () => {
      root = createRoot(host);
      root.render(
        <EditorSurface editor={editor} readOnly={false} placeholder="" className="p-0" />,
      );
    });
    await act(async () => {
      editor.tf.select(caret([0, 0], 0));
      typeSlash(editor);
    });
    const menu = document.querySelector("[data-slash-menu]");
    expect(menu).not.toBeNull();
    expect(
      menu?.getAttribute("role") === "dialog" || menu?.getAttribute("data-slash-menu") === "",
    ).toBe(true);
    expect(document.querySelector("[data-slash-item='h1']")).not.toBeNull();
    expect(
      document.querySelector("[data-slash-menu] [role='listbox']")?.getAttribute("aria-label"),
    ).toBe("Insert block");

    await act(async () => {
      editor.tf.insertText("zzzz");
    });
    expect(document.querySelector("[data-slash-empty]")?.textContent).toBe(SLASH_EMPTY_LABEL);

    const saved: EditorValue[] = [];
    await act(async () => {
      root?.render(
        <EditorSurface
          editor={editor}
          readOnly={false}
          placeholder=""
          className="p-0"
          onValueChange={(value) => {
            saved.push(value);
          }}
        />,
      );
    });
    await act(async () => {
      editor.tf.insertText("q");
    });
    expect(JSON.stringify(saved.at(-1))).toContain("/zzzzq");
    expect(JSON.stringify(saved.at(-1))).not.toContain("slash");
    expectOk(parseEditorDocument(createEditorDocument("doc", saved.at(-1) ?? [])));

    closeSlashMenu(editor);
    const addHost = document.createElement("div");
    document.body.appendChild(addHost);
    const addEditor = createEditor([paragraph("Hello")]);
    const addRoot = createRoot(addHost);
    await act(async () => {
      addRoot.render(
        <DropdownMenu open>
          <DropdownMenuContent>
            <BlockPickerGroups
              items={blockPickerAddItems(addEditor, [0])}
              onChoose={() => undefined}
            />
          </DropdownMenuContent>
        </DropdownMenu>,
      );
    });
    const addText = document.body.textContent ?? "";
    expect(addText).toContain("Heading 1");
    expect(addText).not.toContain("Big section heading");
    expect(addText).not.toContain("Plain text");
    expect(addText).not.toContain("Track tasks with a to-do list");

    await act(async () => {
      root?.unmount();
      addRoot.unmount();
    });
    host.remove();
    addHost.remove();
  });

  test("the slash key handler is registered before the other editor handlers", () => {
    const editor = createEditor([paragraph("")]);
    const handlers = editor.meta.pluginList
      .filter((plugin) => plugin.handlers?.onKeyDown)
      .map((plugin) => plugin.key);
    const slash = handlers.indexOf(slashUiPlugin.key);
    expect(editor.getPlugin(slashUiPlugin).priority).toBe(SLASH_HANDLER_PRIORITY);
    expect(slash).toBeGreaterThanOrEqual(0);
    for (const key of ["slateExtension", "blockMove", "mention", "table"]) {
      if (handlers.includes(key)) {
        expect(slash).toBeLessThan(handlers.indexOf(key));
      }
    }
  });
});
