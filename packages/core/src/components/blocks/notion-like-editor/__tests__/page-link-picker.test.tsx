import { describe, expect, test } from "bun:test";
import { ElementApi, KEYS, type SlateEditor, type TElement } from "platejs";
import { createPlateEditor } from "platejs/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { EditorSurface } from "../components/editor/editor-surface";
import { runEditorCommand } from "../lib/commands/editor-commands";
import type { EditorValue } from "../lib/document/editor-value";
import {
  PAGE_LINK_KEY,
  type PageEntity,
  type PageProvider,
} from "../lib/features/editor-page-link";
import { attachPageLinkHost } from "../lib/plugins/editor-page-link";
import { choosePageLink, pageLinkPickerOpen } from "../lib/plugins/editor-page-link-picker";
import { createEditorPlugins } from "../lib/plugins/editor-plugins";
import { chooseSlashItem, slashMenuItems, slashMenuOpen } from "../lib/plugins/editor-slash";
import { demoPageProvider } from "../demo/demo-pages";
import { caret, createEditor, field, isRecord, texts } from "./test-utils";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

if (!("ResizeObserver" in globalThis)) {
  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  globalThis.ResizeObserver = ResizeObserverStub;
}

const PAGES: PageEntity[] = [
  { pageId: "page-roadmap", title: "Roadmap", icon: "🗺️" },
  { pageId: "page-notes", title: "Meeting notes", icon: "📝" },
  { pageId: "page-release", title: "Release checklist", icon: "✅" },
];

function paragraph(text: string, id = "block-1"): TElement {
  return { type: KEYS.p, id, children: [{ text }] };
}

function typeSlash(editor: SlateEditor, query = ""): void {
  editor.tf.insertText("/");
  if (query.length > 0) {
    editor.tf.insertText(query);
  }
}

function slashIds(editor: SlateEditor): string[] {
  return slashMenuItems(editor).map((item) => item.id);
}

function filterPages(pages: readonly PageEntity[], query: string): PageEntity[] {
  const needle = query.trim().toLowerCase();
  return pages.filter((page) => page.title.toLowerCase().includes(needle));
}

function providerOf(
  search: (query: string, signal: AbortSignal) => Promise<unknown>,
): PageProvider {
  return {
    search: search as PageProvider["search"],
    resolve: () => Promise.resolve({ status: "missing" }),
  };
}

function staticProvider(pages: readonly PageEntity[]): PageProvider {
  return providerOf((query) => Promise.resolve(filterPages(pages, query)));
}

function withViewport(run: () => Promise<void>): Promise<void> {
  const previousWidth = Reflect.get(globalThis, "innerWidth");
  const previousHeight = Reflect.get(globalThis, "innerHeight");
  Reflect.set(globalThis, "innerWidth", 1280);
  Reflect.set(globalThis, "innerHeight", 800);
  return run().finally(() => {
    Reflect.set(globalThis, "innerWidth", previousWidth);
    Reflect.set(globalThis, "innerHeight", previousHeight);
  });
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
  });
}

async function wait(ms: number): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  });
}

type Mounted = {
  editor: SlateEditor;
  render: (readOnly: boolean) => Promise<void>;
  cleanup: () => Promise<void>;
};

async function mount(
  value: EditorValue,
  provider: PageProvider | null,
  readOnly = false,
): Promise<Mounted> {
  const editor = createPlateEditor({ plugins: createEditorPlugins(), value });
  const host = document.createElement("div");
  document.body.appendChild(host);
  let root: Root | undefined;
  await act(async () => {
    root = createRoot(host);
    root.render(
      <EditorSurface
        editor={editor}
        readOnly={readOnly}
        placeholder=""
        className="p-0"
        pageProvider={provider}
      />,
    );
  });
  return {
    editor,
    render: async (nextReadOnly) => {
      await act(async () => {
        root?.render(
          <EditorSurface
            editor={editor}
            readOnly={nextReadOnly}
            placeholder=""
            className="p-0"
            pageProvider={provider}
          />,
        );
      });
    },
    cleanup: async () => {
      await act(async () => {
        root?.unmount();
      });
      host.remove();
    },
  };
}

// Opens the picker the way a user does: type "/", then choose Page link.
async function openPicker(editor: SlateEditor): Promise<void> {
  await act(async () => {
    editor.tf.select(caret([0, 0], editor.api.string([0]).length));
    typeSlash(editor);
  });
  await act(async () => {
    runEditorCommand(editor, chooseSlashItem, "page-link");
  });
  await flush();
}

function picker(): HTMLElement | null {
  return document.querySelector<HTMLElement>("[data-page-link-picker]");
}

function input(): HTMLInputElement {
  const field = document.querySelector<HTMLInputElement>("[role='combobox']");
  if (!field) {
    throw new Error("Missing search input.");
  }
  return field;
}

function options(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>("[role='option']"));
}

function optionTitles(): string[] {
  return options().map((option) => option.textContent ?? "");
}

function activeIndex(): number {
  return options().findIndex((option) => option.getAttribute("aria-selected") === "true");
}

function status(): string {
  return document.querySelector("[data-page-link-status]")?.textContent ?? "";
}

async function type(value: string): Promise<void> {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input(), value);
    input().dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function press(key: string, init: KeyboardEventInit = {}): Promise<void> {
  await act(async () => {
    input().dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, ...init }));
  });
}

async function clickOption(index: number): Promise<void> {
  await act(async () => {
    options()[index]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function pageLinks(editor: SlateEditor): TElement[] {
  return editor.children.filter((block): block is TElement => block.type === PAGE_LINK_KEY);
}

// Page links at any depth, so a link inside a toggle or column is found too.
function nestedPageLinks(editor: SlateEditor): TElement[] {
  return Array.from(
    editor.api.nodes({
      at: [],
      match: (node) => ElementApi.isElement(node) && node.type === PAGE_LINK_KEY,
    }),
  ).map(([node]) => node as TElement);
}

// Like openPicker, but for a slash block at any path and with a text offset.
async function openPickerAt(editor: SlateEditor, path: number[], offset: number): Promise<void> {
  await act(async () => {
    editor.tf.select(caret(path, offset));
    typeSlash(editor);
  });
  await act(async () => {
    runEditorCommand(editor, chooseSlashItem, "page-link");
  });
  await flush();
}

function childTypesOf(node: unknown): string[] {
  if (!isRecord(node) || !Array.isArray(node.children)) {
    return [];
  }
  return node.children.map((child) =>
    isRecord(child) && typeof child.type === "string" ? child.type : "",
  );
}

describe("slash Page link item", () => {
  test("is listed after Bookmark only when a page provider is attached", () => {
    const editor = createEditor([paragraph("")]);
    editor.tf.select(caret([0, 0], 0));
    typeSlash(editor);
    expect(slashIds(editor)).not.toContain("page-link");

    attachPageLinkHost(editor, { provider: staticProvider(PAGES), onOpenPage: null });
    const ids = slashIds(editor);
    expect(ids.indexOf("page-link")).toBe(ids.indexOf("bookmark") + 1);
    expect(slashMenuItems(editor).find((item) => item.id === "page-link")).toMatchObject({
      label: "Page link",
      description: "Link to a page",
      keywords: ["page", "subpage", "doc"],
      group: "Advanced",
    });

    const query = createEditor([paragraph("")]);
    attachPageLinkHost(query, { provider: staticProvider(PAGES), onOpenPage: null });
    query.tf.select(caret([0, 0], 0));
    typeSlash(query, "subpage");
    expect(slashIds(query)).toContain("page-link");
  });

  test("is refused wherever Bookmark is refused", () => {
    const table = createEditor([
      {
        type: KEYS.table,
        id: "table",
        children: [
          {
            type: KEYS.tr,
            id: "row",
            children: [
              {
                type: KEYS.td,
                id: "cell",
                children: [paragraph("", "cell-p")],
              },
            ],
          },
        ],
      },
    ]);
    attachPageLinkHost(table, { provider: staticProvider(PAGES), onOpenPage: null });
    table.tf.select(caret([0, 0, 0, 0, 0], 0));
    typeSlash(table);
    expect(slashMenuOpen(table)).toBe(true);
    expect(slashIds(table)).not.toContain("page-link");
  });

  test("choosing it removes the query and opens the picker, with no insert", () => {
    const editor = createEditor([paragraph("Hi ", "p")]);
    attachPageLinkHost(editor, { provider: staticProvider(PAGES), onOpenPage: null });
    editor.tf.select(caret([0, 0], 3));
    typeSlash(editor);

    runEditorCommand(editor, chooseSlashItem, "page-link");

    expect(texts(editor)).toEqual(["Hi "]);
    expect(pageLinkPickerOpen(editor)).toBe(true);
    expect(pageLinks(editor)).toEqual([]);
  });
});

describe("page link picker", () => {
  test("lists every page for an empty query, with the icon or a fallback", async () => {
    await withViewport(async () => {
      const mounted = await mount([paragraph("", "p")], staticProvider(PAGES));
      await openPicker(mounted.editor);
      expect(picker()).not.toBeNull();
      expect(input().getAttribute("aria-label")).toBe("Search pages");
      expect(input().getAttribute("placeholder")).toBe("Search pages");
      expect(input().getAttribute("role")).toBe("combobox");
      expect(optionTitles()).toEqual(["🗺️Roadmap", "📝Meeting notes", "✅Release checklist"]);
      expect(activeIndex()).toBe(0);
      await mounted.cleanup();
    });
  });

  test("typing filters the results and an earlier search is aborted and its late result ignored", async () => {
    await withViewport(async () => {
      const signals: AbortSignal[] = [];
      const resolvers: Array<(pages: PageEntity[]) => void> = [];
      const provider = providerOf((_query, signal) => {
        signals.push(signal);
        return new Promise<PageEntity[]>((resolve) => {
          resolvers.push(resolve);
        });
      });
      const mounted = await mount([paragraph("", "p")], provider);
      await openPicker(mounted.editor);
      await type("n");
      expect(signals[0]?.aborted).toBe(true);

      await act(async () => {
        resolvers[1]?.([PAGES[1] as PageEntity]);
      });
      expect(optionTitles()).toEqual(["📝Meeting notes"]);

      await act(async () => {
        resolvers[0]?.(PAGES);
      });
      expect(optionTitles()).toEqual(["📝Meeting notes"]);
      await mounted.cleanup();
    });
  });

  test("shows at most eight results and drops entries with an invalid page id", async () => {
    await withViewport(async () => {
      const many: PageEntity[] = Array.from({ length: 12 }, (_value, index) => ({
        pageId: `page-${index}`,
        title: `Page ${index}`,
      }));
      const mounted = await mount([paragraph("", "p")], staticProvider(many));
      await openPicker(mounted.editor);
      expect(options()).toHaveLength(8);
      await mounted.cleanup();

      const messy = [
        { pageId: "", title: "No id" },
        { pageId: "x".repeat(129), title: "Too long id" },
        { pageId: "ok-1", title: "Bad\u0007 Title" },
      ] as unknown as PageEntity[];
      const cleaned = await mount([paragraph("", "p")], staticProvider(messy));
      await openPicker(cleaned.editor);
      expect(optionTitles()).toEqual(["Bad Title"]);
      await cleaned.cleanup();
    });
  });

  test("Searching is shown only when the results are still pending after 200 ms", async () => {
    await withViewport(async () => {
      const mounted = await mount(
        [paragraph("", "p")],
        providerOf(() => new Promise<PageEntity[]>(() => {})),
      );
      await openPicker(mounted.editor);
      expect(status()).toBe("");
      await wait(260);
      expect(status()).toBe("Searching…");
      await mounted.cleanup();
    });
  });

  test("an empty result says No pages found", async () => {
    await withViewport(async () => {
      const mounted = await mount([paragraph("", "p")], staticProvider([]));
      await openPicker(mounted.editor);
      expect(options()).toHaveLength(0);
      expect(status()).toBe("No pages found");
      await mounted.cleanup();
    });
  });

  test("a rejected search says Could not load pages, and typing retries", async () => {
    await withViewport(async () => {
      const provider = providerOf((query) =>
        query.length === 0 ? Promise.reject(new Error("offline")) : Promise.resolve([PAGES[0]]),
      );
      const mounted = await mount([paragraph("", "p")], provider);
      await openPicker(mounted.editor);
      expect(status()).toBe("Could not load pages");
      expect(input().disabled).toBe(false);

      await type("r");
      expect(status()).toBe("");
      expect(optionTitles()).toEqual(["🗺️Roadmap"]);
      await mounted.cleanup();
    });
  });

  test("ArrowUp wraps to the last row and ArrowDown wraps back, and Enter inserts the active page", async () => {
    await withViewport(async () => {
      const mounted = await mount([paragraph("", "p")], staticProvider(PAGES));
      await openPicker(mounted.editor);

      await press("ArrowUp");
      expect(activeIndex()).toBe(2);
      await press("ArrowDown");
      expect(activeIndex()).toBe(0);
      await press("ArrowDown");
      expect(activeIndex()).toBe(1);

      await press("ArrowDown");
      await press("Enter");
      expect(picker()).toBeNull();
      expect(pageLinks(mounted.editor)).toHaveLength(1);
      expect(field(pageLinks(mounted.editor)[0], "pageId")).toBe("page-release");
      expect(field(pageLinks(mounted.editor)[0], "title")).toBe("Release checklist");
      expect(field(pageLinks(mounted.editor)[0], "kind")).toBe("link");
      await mounted.cleanup();
    });
  });

  test("Enter with no rows does nothing and keeps the picker open", async () => {
    await withViewport(async () => {
      const mounted = await mount([paragraph("", "p")], staticProvider([]));
      await openPicker(mounted.editor);
      await press("Enter");
      expect(picker()).not.toBeNull();
      expect(pageLinks(mounted.editor)).toEqual([]);
      await mounted.cleanup();
    });
  });

  test("Enter during an IME composition is ignored", async () => {
    await withViewport(async () => {
      const mounted = await mount([paragraph("", "p")], staticProvider(PAGES));
      await openPicker(mounted.editor);
      const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true });
      Object.defineProperty(event, "isComposing", { value: true });
      await act(async () => {
        input().dispatchEvent(event);
      });
      expect(picker()).not.toBeNull();
      expect(pageLinks(mounted.editor)).toEqual([]);
      await mounted.cleanup();
    });
  });

  test("a click inserts the clicked page", async () => {
    await withViewport(async () => {
      const mounted = await mount([paragraph("", "p")], staticProvider(PAGES));
      await openPicker(mounted.editor);
      await clickOption(1);
      expect(picker()).toBeNull();
      expect(field(pageLinks(mounted.editor)[0], "pageId")).toBe("page-notes");
      await mounted.cleanup();
    });
  });

  test("two pages with the same title insert their own page ids", async () => {
    await withViewport(async () => {
      const duplicates: PageEntity[] = [
        { pageId: "page-notes", title: "Meeting notes" },
        { pageId: "page-notes-2", title: "Meeting notes" },
      ];
      const mounted = await mount([paragraph("", "p")], staticProvider(duplicates));
      await openPicker(mounted.editor);
      expect(optionTitles()).toEqual(["Meeting notes", "Meeting notes"]);
      await clickOption(1);
      expect(field(pageLinks(mounted.editor)[0], "pageId")).toBe("page-notes-2");
      await mounted.cleanup();
    });
  });

  test("one undo removes the inserted block", async () => {
    await withViewport(async () => {
      const mounted = await mount([paragraph("", "p")], staticProvider(PAGES));
      await openPicker(mounted.editor);
      await clickOption(0);
      expect(pageLinks(mounted.editor)).toHaveLength(1);
      mounted.editor.tf.undo();
      expect(pageLinks(mounted.editor)).toEqual([]);
      await mounted.cleanup();
    });
  });

  test("Escape closes without inserting and puts the caret back where the slash was", async () => {
    await withViewport(async () => {
      const mounted = await mount([paragraph("Hi ", "p")], staticProvider(PAGES));
      await act(async () => {
        mounted.editor.tf.select(caret([0, 0], 3));
        typeSlash(mounted.editor);
      });
      await act(async () => {
        runEditorCommand(mounted.editor, chooseSlashItem, "page-link");
      });
      await flush();
      await press("Escape");
      expect(picker()).toBeNull();
      expect(pageLinks(mounted.editor)).toEqual([]);
      expect(mounted.editor.selection?.anchor.offset).toBe(3);
      await mounted.cleanup();
    });
  });

  test("a press outside closes without inserting", async () => {
    await withViewport(async () => {
      const mounted = await mount([paragraph("", "p")], staticProvider(PAGES));
      await openPicker(mounted.editor);
      await act(async () => {
        document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      });
      expect(picker()).toBeNull();
      expect(pageLinks(mounted.editor)).toEqual([]);
      await mounted.cleanup();
    });
  });

  test("turning the editor read-only closes the picker without inserting", async () => {
    await withViewport(async () => {
      const mounted = await mount([paragraph("", "p")], staticProvider(PAGES));
      await openPicker(mounted.editor);
      await mounted.render(true);
      await flush();
      expect(picker()).toBeNull();
      expect(pageLinkPickerOpen(mounted.editor)).toBe(false);
      expect(pageLinks(mounted.editor)).toEqual([]);
      await mounted.cleanup();
    });
  });

  test("removing the anchor block closes the picker without inserting", async () => {
    await withViewport(async () => {
      const mounted = await mount([paragraph("", "p")], staticProvider(PAGES));
      await openPicker(mounted.editor);
      await act(async () => {
        mounted.editor.tf.removeNodes({ at: [0] });
      });
      await flush();
      expect(pageLinkPickerOpen(mounted.editor)).toBe(false);
      expect(picker()).toBeNull();
      await mounted.cleanup();
    });
  });

  test("choosePageLink refuses with no picker open", () => {
    const editor = createEditor([paragraph("", "p")]);
    attachPageLinkHost(editor, { provider: staticProvider(PAGES), onOpenPage: null });
    expect(choosePageLink(editor, PAGES[0] as PageEntity)).toBe(false);
    expect(pageLinks(editor)).toEqual([]);
  });
});

describe("page picker placement inside containers", () => {
  test("a toggle's empty body paragraph is replaced by the link, and one undo restores it", async () => {
    await withViewport(async () => {
      const mounted = await mount(
        [
          {
            type: KEYS.toggle,
            id: "toggle",
            children: [paragraph("Head", "head"), paragraph("", "body")],
          },
        ],
        staticProvider(PAGES),
      );
      await openPickerAt(mounted.editor, [0, 1, 0], 0);
      await clickOption(0);

      const toggle = mounted.editor.children[0];
      expect(childTypesOf(toggle)).toEqual(["p", PAGE_LINK_KEY]);
      expect(field(toggle?.children[1], "pageId")).toBe("page-roadmap");
      expect(pageLinks(mounted.editor)).toEqual([]);
      expect(nestedPageLinks(mounted.editor)).toHaveLength(1);

      mounted.editor.tf.undo();
      expect(childTypesOf(mounted.editor.children[0])).toEqual(["p", "p"]);
      expect(nestedPageLinks(mounted.editor)).toEqual([]);
      await mounted.cleanup();
    });
  });

  test("a toggle's non-empty body keeps its text and the link goes below it", async () => {
    await withViewport(async () => {
      const mounted = await mount(
        [
          {
            type: KEYS.toggle,
            id: "toggle",
            children: [paragraph("Head", "head"), paragraph("Body ", "body")],
          },
        ],
        staticProvider(PAGES),
      );
      await openPickerAt(mounted.editor, [0, 1, 0], 5);
      await clickOption(1);

      const toggle = mounted.editor.children[0];
      expect(childTypesOf(toggle)).toEqual(["p", "p", PAGE_LINK_KEY]);
      expect(mounted.editor.api.string([0, 1])).toBe("Body ");
      expect(field(toggle?.children[2], "pageId")).toBe("page-notes");
      await mounted.cleanup();
    });
  });

  test("a column's empty paragraph is replaced inside that column only, and one undo restores it", async () => {
    await withViewport(async () => {
      const mounted = await mount(
        [
          {
            type: KEYS.columnGroup,
            id: "group",
            children: [
              {
                type: KEYS.column,
                id: "column-1",
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
        ],
        staticProvider(PAGES),
      );
      await openPickerAt(mounted.editor, [0, 0, 0, 0], 0);
      await clickOption(2);

      const group = mounted.editor.children[0];
      const columns = isRecord(group) && Array.isArray(group.children) ? group.children : [];
      expect(childTypesOf(columns[0])).toEqual([PAGE_LINK_KEY]);
      expect(childTypesOf(columns[1])).toEqual(["p"]);
      const firstColumn = columns[0];
      const firstLink =
        isRecord(firstColumn) && Array.isArray(firstColumn.children)
          ? firstColumn.children[0]
          : undefined;
      expect(field(firstLink, "pageId")).toBe("page-release");
      expect(pageLinks(mounted.editor)).toEqual([]);

      mounted.editor.tf.undo();
      const restored = mounted.editor.children[0];
      const restoredColumns =
        isRecord(restored) && Array.isArray(restored.children) ? restored.children : [];
      expect(childTypesOf(restoredColumns[0])).toEqual(["p"]);
      expect(nestedPageLinks(mounted.editor)).toEqual([]);
      await mounted.cleanup();
    });
  });
});

describe("demo page provider", () => {
  test("search is a case-insensitive title match, an empty query returns all, and aborts reject", async () => {
    const all = await demoPageProvider.search("", new AbortController().signal);
    expect(all.map((page) => page.pageId)).toEqual([
      "page-roadmap",
      "page-notes",
      "page-release",
      "page-design",
      "page-notes-2",
    ]);

    const notes = await demoPageProvider.search("NOTES", new AbortController().signal);
    expect(notes.map((page) => page.pageId)).toEqual(["page-notes", "page-notes-2"]);

    const controller = new AbortController();
    controller.abort();
    await expect(demoPageProvider.search("", controller.signal)).rejects.toThrow();
  });

  test("resolve returns ok for listed pages, denied for the private page, and missing otherwise", async () => {
    const signal = new AbortController().signal;
    expect(await demoPageProvider.resolve("page-roadmap", signal)).toEqual({
      status: "ok",
      page: { pageId: "page-roadmap", title: "Roadmap", icon: "🗺️" },
    });
    expect(await demoPageProvider.resolve("page-private", signal)).toEqual({ status: "denied" });
    expect(await demoPageProvider.resolve("page-archived", signal)).toEqual({ status: "missing" });
  });
});
