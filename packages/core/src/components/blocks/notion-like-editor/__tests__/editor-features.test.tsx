import { describe, expect, test } from "bun:test";
import { KEYS, type SlateEditor, type TElement } from "platejs";
import { createPlateEditor } from "platejs/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { EditorSurface } from "../components/editor/editor-surface";
import { useNotionLikeEditor } from "../hooks/use-notion-like-editor";
import { demoMentionProvider } from "../demo/demo-mention";
import { demoPageProvider } from "../demo/demo-pages";
import { footnoteInsertAllowed } from "../lib/features/editor-footnote";
import { blockPickerAddItems, blockPickerTurnItems } from "../lib/features/editor-block-picker";
import { createTableNode } from "../lib/features/editor-table";
import { IMAGE_KEY } from "../lib/features/editor-image";
import { EMBED_KEY } from "../lib/features/editor-embed";
import { BOOKMARK_KEY } from "../lib/features/editor-bookmark-url";
import { PAGE_LINK_KEY } from "../lib/features/editor-page-link";
import { FOOTNOTE_DEF_KEY } from "../lib/document/editor-document-schema";
import {
  DEFAULT_EDITOR_FEATURES,
  EDITOR_FEATURES,
  editorFeaturesKey,
  resolveEditorFeatures,
  type EditorFeature,
  type EditorFeatures,
} from "../lib/features/editor-features";
import { editorConfigPlugin, editorFeatures } from "../lib/plugins/editor-config";
import { findPlugin } from "../lib/plugins/editor-find";
import { isMacPlatform, onFindKeyDown } from "../lib/plugins/editor-find-ui";
import { emojiMenuOpen } from "../lib/plugins/editor-emoji";
import { onInlineDateKeyDown } from "../lib/plugins/editor-inline-date-ui";
import { onInlineEquationKeyDown } from "../lib/plugins/editor-inline-equation-ui";
import { openMentionInput } from "../lib/plugins/editor-mention";
import { attachPageLinkHost } from "../lib/plugins/editor-page-link";
import { openPageLinkPicker, pageLinkPickerOpen } from "../lib/plugins/editor-page-link-picker";
import { attachMentionProvider } from "../lib/plugins/editor-mention";
import { slashMenuItems, slashMenuOpen } from "../lib/plugins/editor-slash";
import {
  preparePastedFragment,
  pasteRepairsOf,
  MEDIA_NOT_SUPPORTED,
} from "../lib/paste/editor-paste";
import { deserializeHtmlInDom, caret, createEditor } from "./test-utils";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

const BLOCK_ID = "block-1";

function paragraph(text: string, id = BLOCK_ID): TElement {
  return { type: KEYS.p, id, children: [{ text }] };
}

function withFeatures(editor: SlateEditor, features: EditorFeatures): SlateEditor {
  editor.setOption(editorConfigPlugin, "features", resolveEditorFeatures(features));
  return editor;
}

// A paragraph editor with the providers the mention and page-link gates need.
function providedEditor(features: EditorFeatures = {}, value = [paragraph("")]): SlateEditor {
  const editor = createEditor(value);
  attachMentionProvider(editor, demoMentionProvider);
  attachPageLinkHost(editor, { provider: demoPageProvider } as Parameters<
    typeof attachPageLinkHost
  >[1]);
  return withFeatures(editor, features);
}

function ids(items: readonly { id: string }[]): string[] {
  return items.map((item) => item.id);
}

function insertedTypes(editor: SlateEditor): string[] {
  return JSON.parse(JSON.stringify(editor.children)).flatMap(function walk(
    node: unknown,
  ): string[] {
    if (typeof node !== "object" || node === null) {
      return [];
    }
    const record = node as { type?: unknown; children?: unknown[] };
    const own = typeof record.type === "string" ? [record.type] : [];
    return [...own, ...(record.children ?? []).flatMap(walk)];
  });
}

// Every slash and picker id that one feature gates. Derived from the feature map in the model.
const ITEMS_BY_FEATURE: Partial<Record<EditorFeature, string[]>> = {
  media: ["image", "file", "video", "audio"],
  embeds: ["embed", "bookmark"],
  tables: ["table"],
  columns: ["columns"],
  code: ["code"],
  toc: ["toc"],
  equations: ["equation"],
  mentions: ["mention"],
  pageLinks: ["page-link"],
  footnotes: ["footnote"],
};

// Every gated item across the editor's lists, for a document where all of them can show.
function allListedIds(editor: SlateEditor): Set<string> {
  const listed = new Set<string>();
  // The slash list is read with the caret in the empty paragraph.
  editor.tf.select(caret([0, 0], 0));
  editor.tf.insertText("/");
  for (const id of ids(slashMenuItems(editor))) {
    listed.add(id);
  }
  for (const id of ids(blockPickerAddItems(editor, [0]))) {
    listed.add(id);
  }
  for (const id of ids(blockPickerTurnItems(editor, [0]))) {
    listed.add(id);
  }
  return listed;
}

describe("resolveEditorFeatures", () => {
  test("the defaults turn every feature on", () => {
    expect(EDITOR_FEATURES).toHaveLength(16);
    expect(resolveEditorFeatures()).toEqual(DEFAULT_EDITOR_FEATURES);
    for (const feature of EDITOR_FEATURES) {
      expect(DEFAULT_EDITOR_FEATURES[feature]).toBe(true);
    }
  });

  test("only the boolean false turns a feature off", () => {
    const resolved = resolveEditorFeatures({
      media: false,
      emoji: 0,
      find: "no",
      toc: true,
    } as unknown as EditorFeatures);
    expect(resolved.media).toBe(false);
    expect(resolved.emoji).toBe(true);
    expect(resolved.find).toBe(true);
    expect(resolved.toc).toBe(true);
    expect(resolved.tables).toBe(true);
  });

  test("an unknown key is ignored", () => {
    const resolved = resolveEditorFeatures({ nope: false } as unknown as EditorFeatures);
    expect(resolved).toEqual(DEFAULT_EDITOR_FEATURES);
    expect(Object.keys(resolved)).toHaveLength(16);
  });

  test("a value that is not an object gives the defaults", () => {
    for (const value of [null, "features", 1, true]) {
      expect(resolveEditorFeatures(value as unknown as EditorFeatures)).toEqual(
        DEFAULT_EDITOR_FEATURES,
      );
    }
  });

  test("equal flags give the same key", () => {
    expect(editorFeaturesKey(resolveEditorFeatures({ media: false, find: true }))).toBe(
      editorFeaturesKey(resolveEditorFeatures({ find: true, media: false })),
    );
    expect(editorFeaturesKey(resolveEditorFeatures({ media: false }))).not.toBe(
      editorFeaturesKey(DEFAULT_EDITOR_FEATURES),
    );
  });
});

describe("features on the editor", () => {
  type Editor = ReturnType<typeof useNotionLikeEditor>["editor"];

  function Probe({ features, seen }: { features?: EditorFeatures; seen: Editor[] }) {
    const { editor } = useNotionLikeEditor({ documentId: "features-doc", features });
    seen.push(editor);
    return null;
  }

  test("an equal new object keeps the editor, and a changed value is read back", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const seen: Editor[] = [];
    try {
      await act(async () => {
        root.render(<Probe seen={seen} features={{ media: false }} />);
      });
      await act(async () => {
        root.render(<Probe seen={seen} features={{ media: false }} />);
      });
      const first = seen[0] as SlateEditor;
      expect(seen.every((editor) => editor === first)).toBe(true);
      expect(editorFeatures(first).media).toBe(false);

      await act(async () => {
        root.render(<Probe seen={seen} features={{ media: true }} />);
      });
      expect(seen.every((editor) => editor === first)).toBe(true);
      expect(editorFeatures(first).media).toBe(true);
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });
});

describe("the default lists", () => {
  test("with every feature on, the slash and picker ids are the ones listed here", () => {
    const editor = providedEditor();
    editor.tf.select(caret([0, 0], 0));
    editor.tf.insertText("/");
    expect(ids(slashMenuItems(editor))).toEqual([
      "paragraph",
      "h1",
      "h2",
      "h3",
      "bulleted",
      "numbered",
      "todo",
      "toggle",
      "toggle-h1",
      "toggle-h2",
      "toggle-h3",
      "quote",
      "callout",
      "code",
      "divider",
      "equation",
      "toc",
      "table",
      "columns",
      "bookmark",
      "page-link",
      "image",
      "file",
      "video",
      "audio",
      "embed",
      "mention",
      "link",
      "footnote",
    ]);
    expect(ids(blockPickerAddItems(editor, [0]))).toEqual([
      "paragraph",
      "h1",
      "h2",
      "h3",
      "bulleted",
      "numbered",
      "todo",
      "toggle",
      "toggle-h1",
      "toggle-h2",
      "toggle-h3",
      "quote",
      "callout",
      "code",
      "divider",
      "equation",
      "toc",
      "table",
      "columns",
    ]);
  });
});

describe("each feature hides its items from every list", () => {
  for (const [feature, itemIds] of Object.entries(ITEMS_BY_FEATURE)) {
    test(`${feature} off: none of its ids are listed`, () => {
      const editor = providedEditor({ [feature]: false });
      const listed = allListedIds(editor);
      for (const id of itemIds ?? []) {
        expect(listed.has(id)).toBe(false);
      }
    });

    test(`${feature} on: its ids are listed, so the test can fail`, () => {
      const editor = providedEditor({});
      const listed = allListedIds(editor);
      for (const id of itemIds ?? []) {
        expect(listed.has(id)).toBe(true);
      }
    });
  }

  test("a turn into a block of an off type is removed, but its current type stays checked", () => {
    const editor = providedEditor({ code: false }, [
      {
        type: KEYS.codeBlock,
        id: BLOCK_ID,
        children: [{ type: KEYS.codeLine, children: [{ text: "x" }] }],
      } as unknown as TElement,
    ]);
    const turns = blockPickerTurnItems(editor, [0]);
    expect(turns.some((item) => item.id === "code" && item.checked === true)).toBe(true);
    const other = providedEditor({ code: false });
    expect(blockPickerTurnItems(other, [0]).some((item) => item.id === "code")).toBe(false);
  });
});

describe("key and trigger gates", () => {
  test("equations off: Mod+Shift+E does nothing and is not prevented", () => {
    const editor = providedEditor({ equations: false }, [paragraph("abc")]);
    editor.tf.select(caret([0, 0], 3));
    const before = JSON.stringify(editor.children);
    let prevented = false;
    onInlineEquationKeyDown(editor, {
      key: "e",
      metaKey: true,
      ctrlKey: false,
      shiftKey: true,
      altKey: false,
      defaultPrevented: false,
      preventDefault: () => {
        prevented = true;
      },
    });
    expect(prevented).toBe(false);
    expect(JSON.stringify(editor.children)).toBe(before);
  });

  test("equations on: Mod+Shift+E inserts an inline equation", () => {
    const editor = providedEditor({}, [paragraph("abc")]);
    editor.tf.select(caret([0, 0], 3));
    onInlineEquationKeyDown(editor, {
      key: "e",
      metaKey: true,
      ctrlKey: false,
      shiftKey: true,
      altKey: false,
      defaultPrevented: false,
      preventDefault: () => {},
    });
    expect(insertedTypes(editor)).toContain(KEYS.inlineEquation);
  });

  test("dates off: Mod+; does nothing and is not prevented", () => {
    const editor = providedEditor({ dates: false }, [paragraph("abc")]);
    editor.tf.select(caret([0, 0], 3));
    const before = JSON.stringify(editor.children);
    let prevented = false;
    onInlineDateKeyDown(editor, {
      key: ";",
      metaKey: true,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      defaultPrevented: false,
      preventDefault: () => {
        prevented = true;
      },
    });
    expect(prevented).toBe(false);
    expect(JSON.stringify(editor.children)).toBe(before);
  });

  test("dates on: Mod+; inserts an inline date", () => {
    const editor = providedEditor({}, [paragraph("abc")]);
    editor.tf.select(caret([0, 0], 3));
    onInlineDateKeyDown(editor, {
      key: ";",
      metaKey: true,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      defaultPrevented: false,
      preventDefault: () => {},
    });
    expect(insertedTypes(editor)).toContain(KEYS.date);
  });

  test("find off: Mod+F is not prevented and the bar stays closed", () => {
    const editor = providedEditor({ find: false });
    const mac = isMacPlatform();
    let prevented = false;
    onFindKeyDown(editor, {
      key: "f",
      altKey: false,
      shiftKey: false,
      metaKey: mac,
      ctrlKey: !mac,
      defaultPrevented: false,
      preventDefault: () => {
        prevented = true;
      },
    });
    expect(prevented).toBe(false);
    expect(editor.getOption(findPlugin, "open")).toBeFalsy();
  });

  test("find on: Mod+F opens the bar", () => {
    const editor = providedEditor({});
    const mac = isMacPlatform();
    onFindKeyDown(editor, {
      key: "f",
      altKey: false,
      shiftKey: false,
      metaKey: mac,
      ctrlKey: !mac,
      defaultPrevented: false,
      preventDefault: () => {},
    });
    expect(editor.getOption(findPlugin, "open")).toBe(true);
  });

  test("slash menu off: typing / does not open the menu and the character stays", () => {
    const editor = providedEditor({ slashMenu: false });
    editor.tf.select(caret([0, 0], 0));
    editor.tf.insertText("/");
    expect(slashMenuOpen(editor)).toBe(false);
    expect(editor.api.string(editor.children[0] as TElement)).toBe("/");
  });

  test("mentions off: the mention trigger does nothing", () => {
    const editor = providedEditor({ mentions: false }, [paragraph("abc")]);
    editor.tf.select(caret([0, 0], 3));
    const before = JSON.stringify(editor.children);
    expect(openMentionInput(editor)).toBe(false);
    expect(JSON.stringify(editor.children)).toBe(before);
  });

  test("emoji off: a typed :token does not open the emoji menu", () => {
    const editor = providedEditor({ emoji: false });
    editor.tf.select(caret([0, 0], 0));
    editor.tf.insertText(":sm");
    expect(emojiMenuOpen(editor)).toBe(false);
  });

  test("page links off: the picker does not open", () => {
    const editor = providedEditor({ pageLinks: false });
    openPageLinkPicker(editor, BLOCK_ID);
    expect(pageLinkPickerOpen(editor)).toBe(false);
    const on = providedEditor({});
    openPageLinkPicker(on, BLOCK_ID);
    expect(pageLinkPickerOpen(on)).toBe(true);
  });

  test("footnotes off: no footnote can be inserted", () => {
    const off = providedEditor({ footnotes: false }, [paragraph("abc")]);
    off.tf.select(caret([0, 0], 3));
    expect(footnoteInsertAllowed(off)).toBe(false);
    const on = providedEditor({}, [paragraph("abc")]);
    on.tf.select(caret([0, 0], 3));
    expect(footnoteInsertAllowed(on)).toBe(true);
  });

  test("code off: a typed fence stays as text and makes no code block", () => {
    const editor = providedEditor({ code: false });
    editor.tf.select(caret([0, 0], 0));
    editor.tf.insertText("`");
    editor.tf.insertText("`");
    editor.tf.insertText("`");
    expect(editor.api.string(editor.children[0] as TElement)).toBe("```");
    expect(insertedTypes(editor)).not.toContain(KEYS.codeBlock);
  });
});

describe("existing content still renders in the full editor", () => {
  async function mount(value: TElement[], features: EditorFeatures) {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const { createEditorPlugins } = await import("../lib/plugins/editor-plugins");
    const real = createPlateEditor({ plugins: createEditorPlugins(), value });
    withFeatures(real, features);
    let root: Root | undefined;
    await act(async () => {
      root = createRoot(host);
      root.render(<EditorSurface editor={real} readOnly={false} placeholder="" className="p-0" />);
    });
    return {
      host,
      async cleanup() {
        await act(async () => {
          root?.unmount();
        });
        host.remove();
      },
    };
  }

  const blocks: { feature: EditorFeature; block: TElement }[] = [
    { feature: "tables", block: { ...createTableNode(1, 1), id: "tbl-1" } },
    {
      feature: "code",
      block: {
        type: KEYS.codeBlock,
        id: "code-1",
        children: [{ type: KEYS.codeLine, children: [{ text: "const x = 1" }] }],
      } as unknown as TElement,
    },
    {
      feature: "toc",
      block: { type: KEYS.toc, id: "toc-1", children: [{ text: "" }] } as unknown as TElement,
    },
    {
      feature: "equations",
      block: {
        type: KEYS.equation,
        id: "eq-1",
        texExpression: "x^2",
        children: [{ text: "" }],
      } as unknown as TElement,
    },
    {
      feature: "media",
      block: { type: IMAGE_KEY, id: "img-1", children: [{ text: "" }] } as unknown as TElement,
    },
    {
      feature: "embeds",
      block: { type: EMBED_KEY, id: "emb-1", children: [{ text: "" }] } as unknown as TElement,
    },
    {
      feature: "embeds",
      block: { type: BOOKMARK_KEY, id: "bm-1", children: [{ text: "" }] } as unknown as TElement,
    },
    {
      feature: "pageLinks",
      block: { type: PAGE_LINK_KEY, id: "pl-1", children: [{ text: "" }] } as unknown as TElement,
    },
  ];

  for (const { feature, block } of blocks) {
    test(`${feature} off: a document with ${block.type} still renders it`, async () => {
      const id = String(block.id);
      const mounted = await mount([block, paragraph("text", "p-after")], { [feature]: false });
      try {
        expect(mounted.host.querySelector(`[data-block-id='${id}']`)).not.toBeNull();
      } finally {
        await mounted.cleanup();
      }
    });
  }
});

describe("paste gates", () => {
  test("tables off: a pasted HTML table does not create a table node", () => {
    const html = "<table><tr><td>alpha</td><td>beta</td></tr></table>";
    const off = providedEditor({ tables: false });
    const offValue = preparePastedFragment(off, deserializeHtmlInDom(off, html));
    expect(JSON.stringify(offValue)).not.toContain(`"type":"${KEYS.table}"`);
    expect(JSON.stringify(offValue)).toContain("alpha");

    const on = providedEditor({});
    const onValue = preparePastedFragment(on, deserializeHtmlInDom(on, html));
    expect(JSON.stringify(onValue)).toContain(`"type":"${KEYS.table}"`);
  });

  test("code off: pasted pre code does not create a code block", () => {
    const html = "<pre><code>const x = 1</code></pre>";
    const off = providedEditor({ code: false });
    const offValue = preparePastedFragment(off, deserializeHtmlInDom(off, html));
    expect(JSON.stringify(offValue)).not.toContain(`"type":"${KEYS.codeBlock}"`);
    expect(JSON.stringify(offValue)).toContain("const x = 1");

    const on = providedEditor({});
    const onValue = preparePastedFragment(on, deserializeHtmlInDom(on, html));
    expect(JSON.stringify(onValue)).toContain(`"type":"${KEYS.codeBlock}"`);
  });

  test("media off: a pasted file is rejected the same way as with no upload adapter", () => {
    const data = new DataTransfer();
    const file = { name: "shot.png", type: "image/png", size: 8 };
    const listed: { length: number; 0: typeof file } = { length: 1, 0: file };
    Object.defineProperty(data, "files", {
      configurable: true,
      enumerable: true,
      get: () => listed,
    });
    data.setData("text/plain", "");

    const noAdapter = providedEditor({});
    noAdapter.tf.insertData(data);
    const off = providedEditor({ media: false });
    off.tf.insertData(data);

    for (const editor of [noAdapter, off]) {
      expect(pasteRepairsOf(editor).map((repair) => repair.message)).toContain(MEDIA_NOT_SUPPORTED);
      expect(insertedTypes(editor)).not.toContain(IMAGE_KEY);
    }
  });
});

describe("UI layers", () => {
  async function mountSurface(features: EditorFeatures) {
    const { createEditorPlugins } = await import("../lib/plugins/editor-plugins");
    const editor = createPlateEditor({ plugins: createEditorPlugins(), value: [paragraph("")] });
    withFeatures(editor, features);
    const host = document.createElement("div");
    document.body.appendChild(host);
    let root: Root | undefined;
    await act(async () => {
      root = createRoot(host);
      root.render(
        <EditorSurface editor={editor} readOnly={false} placeholder="" className="p-0" />,
      );
    });
    return {
      editor,
      host,
      async cleanup() {
        await act(async () => {
          root?.unmount();
        });
        host.remove();
      },
    };
  }

  test("slash menu off: [data-slash-menu] never renders after typing /", async () => {
    const mounted = await mountSurface({ slashMenu: false });
    try {
      await act(async () => {
        mounted.editor.tf.select(caret([0, 0], 0));
        mounted.editor.tf.insertText("/");
      });
      expect(document.querySelector("[data-slash-menu]")).toBeNull();
    } finally {
      await mounted.cleanup();
    }
  });

  test("selection toolbar off: [data-selection-toolbar] never renders", async () => {
    const mounted = await mountSurface({ selectionToolbar: false });
    try {
      await act(async () => {
        mounted.editor.tf.select(caret([0, 0], 0));
        mounted.editor.tf.insertText("abcd");
        mounted.editor.tf.select({
          anchor: { path: [0, 0], offset: 0 },
          focus: { path: [0, 0], offset: 4 },
        });
      });
      expect(document.querySelector("[data-selection-toolbar]")).toBeNull();
    } finally {
      await mounted.cleanup();
    }
  });

  test("block handle off: [data-block-handle] never renders", async () => {
    const mounted = await mountSurface({ blockHandle: false });
    try {
      await act(async () => {
        mounted.editor.tf.select(caret([0, 0], 0));
      });
      expect(mounted.host.querySelector("[data-block-handle]")).toBeNull();
      expect(document.querySelector("[data-block-handle]")).toBeNull();
    } finally {
      await mounted.cleanup();
    }
  });
});

// The readable text of pasted nodes, one string per top-level node.
function textOf(node: unknown): string {
  if (typeof node !== "object" || node === null) {
    return "";
  }
  const record = node as { text?: unknown; children?: unknown[] };
  if (typeof record.text === "string") {
    return record.text;
  }
  return (record.children ?? []).map(textOf).join("");
}

describe("paste fallbacks keep the user's data when a feature is off", () => {
  const url = "https://example.com/docs";

  test("a pasted bookmark or embed becomes a paragraph of its URL", () => {
    const editor = providedEditor({ embeds: false });
    const value = preparePastedFragment(editor, [
      { type: BOOKMARK_KEY, id: "bm-1", url, children: [{ text: "" }] },
      {
        type: EMBED_KEY,
        id: "emb-1",
        url: "https://www.youtube.com/watch?v=abc",
        children: [{ text: "" }],
      },
    ]);
    expect(value.map(textOf)).toEqual([url, "https://www.youtube.com/watch?v=abc"]);
    expect(insertedTypes({ children: value } as unknown as SlateEditor)).not.toContain(
      BOOKMARK_KEY,
    );
  });

  test("a pasted block equation keeps its TeX source as a paragraph", () => {
    const editor = providedEditor({ equations: false });
    const value = preparePastedFragment(editor, [
      { type: KEYS.equation, id: "eq-1", texExpression: "x^2", children: [{ text: "" }] },
    ]);
    expect(value.map(textOf)).toEqual(["x^2"]);
    expect(insertedTypes({ children: value } as unknown as SlateEditor)).not.toContain(
      KEYS.equation,
    );
  });

  test("a pasted inline equation keeps its TeX source in place", () => {
    const editor = providedEditor({ equations: false });
    const value = preparePastedFragment(editor, [
      {
        type: KEYS.p,
        id: "p-1",
        children: [
          { text: "a " },
          { type: KEYS.inlineEquation, texExpression: "y", children: [{ text: "" }] },
          { text: " b" },
        ],
      },
    ]);
    expect(value.map(textOf)).toEqual(["a y b"]);
  });

  test("a toc, a page link or a footnote with no readable text is dropped", () => {
    const editor = providedEditor({ toc: false, pageLinks: false, footnotes: false });
    const value = preparePastedFragment(editor, [
      { type: KEYS.toc, id: "toc-1", children: [{ text: "" }] },
      { type: PAGE_LINK_KEY, id: "pl-1", title: "", children: [{ text: "" }] },
      {
        type: FOOTNOTE_DEF_KEY,
        id: "fd-1",
        footnoteId: "fn-1",
        children: [{ type: KEYS.p, id: "fdp-1", children: [{ text: "" }] }],
      },
    ]);
    expect(value).toEqual([]);
  });

  test("a page link with a title keeps the title, and dropping everything inserts nothing", () => {
    const editor = providedEditor({ pageLinks: false });
    const kept = preparePastedFragment(editor, [
      { type: PAGE_LINK_KEY, id: "pl-1", title: "Roadmap", children: [{ text: "" }] },
    ]);
    expect(kept.map(textOf)).toEqual(["Roadmap"]);

    const before = JSON.stringify(editor.children);
    const dropped = preparePastedFragment(providedEditor({ toc: false }), [
      { type: KEYS.toc, id: "toc-1", children: [{ text: "" }] },
    ]);
    editor.tf.insertFragment(dropped);
    expect(JSON.stringify(editor.children)).toBe(before);
  });

  test("with every feature on, the same fragments give the same nodes as they did before", () => {
    const fragment = [
      { type: BOOKMARK_KEY, id: "bm-1", url, children: [{ text: "" }] },
      { type: KEYS.equation, id: "eq-1", texExpression: "x^2", children: [{ text: "" }] },
      { type: KEYS.toc, id: "toc-1", children: [{ text: "" }] },
      { type: PAGE_LINK_KEY, id: "pl-1", title: "Roadmap", children: [{ text: "" }] },
    ];
    // Ids that the paste creates are fresh each time, so they are replaced before the comparison.
    const normalized = JSON.stringify(preparePastedFragment(providedEditor({}), fragment)).replace(
      /"id":"[^"]*"/g,
      '"id":"*"',
    );
    expect(normalized).toBe(
      '[{"type":"bookmark","url":"https://example.com/docs","children":[{"text":""}],"id":"*"},{"type":"equation","children":[{"text":""}],"id":"*","texExpression":"x^2"},{"type":"toc","children":[{"text":""}],"id":"*"}]',
    );
  });
});
