import { beforeAll, describe, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { KEYS, type SlateEditor, type TElement } from "platejs";
import { createPlateEditor, pipeHandler } from "platejs/react";

import { EditorSurface } from "../components/editor/editor-surface";
import { createEditorDocument } from "../lib/document/editor-document";
import { parseEditorDocument } from "../lib/document/editor-document-validate";
import type { EditorValue } from "../lib/document/editor-value";
import {
  loadEmojiEntries,
  readEmojiSession,
  resetEmojiDataForTests,
  searchEmoji,
} from "../lib/features/editor-emoji";
import { EMOJI_ENTRIES, type EmojiEntry } from "../lib/features/emoji-data";
import { createEditorPlugins } from "../lib/plugins/editor-plugins";
import {
  chooseEmojiSuggestion,
  EMOJI_HANDLER_PRIORITY,
  emojiMenuItems,
  emojiUiPlugin,
  onEmojiKeyDown,
} from "../lib/plugins/editor-emoji";
import { SLASH_HANDLER_PRIORITY, slashMenuOpen } from "../lib/plugins/editor-slash";
import { caret, createEditor, expectOk, plainText, textRange } from "./test-utils";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

if (!("ResizeObserver" in globalThis)) {
  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  globalThis.ResizeObserver = ResizeObserverStub;
}

beforeAll(async () => {
  await loadEmojiEntries();
});

function paragraph(text: string, id = "block-1"): TElement {
  return { type: KEYS.p, id, children: [{ text }] };
}

function emojiFor(name: string): string {
  const entry = EMOJI_ENTRIES.find((item) => item.name === name);
  if (entry === undefined) {
    throw new Error(`Missing emoji ${name}`);
  }
  return entry.emoji;
}

function typed(text: string, base = ""): SlateEditor {
  const editor = createEditor([paragraph(base)]);
  editor.tf.select(caret([0, 0], base.length));
  editor.tf.insertText(text);
  return editor;
}

function suggestions(editor: SlateEditor): string[] {
  return emojiMenuItems(editor).map((item) => item.name);
}

function key(
  name: string,
  extra?: { shiftKey?: boolean },
): { key: string; shiftKey?: boolean; preventDefault: () => void; defaultPrevented: boolean } {
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

function press(editor: SlateEditor, name: string, extra?: { shiftKey?: boolean }): boolean {
  const event = new KeyboardEvent("keydown", {
    key: name,
    shiftKey: extra?.shiftKey,
    bubbles: true,
    cancelable: true,
  });
  const handler = pipeHandler(editor, { handlerKey: "onKeyDown" });
  handler?.(event);
  return event.defaultPrevented;
}

function leafAt(editor: SlateEditor, text: string): Record<string, unknown> | undefined {
  for (const block of editor.children) {
    for (const child of block.children) {
      if ("text" in child && child.text === text) {
        return child as Record<string, unknown>;
      }
    }
  }
  return undefined;
}

describe("emoji data", () => {
  test("has 250 to 350 entries, one grapheme each, unique emoji and names", () => {
    expect(EMOJI_ENTRIES.length).toBeGreaterThanOrEqual(250);
    expect(EMOJI_ENTRIES.length).toBeLessThanOrEqual(350);
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    const emojis = new Set<string>();
    const names = new Set<string>();
    for (const entry of EMOJI_ENTRIES) {
      expect([...segmenter.segment(entry.emoji)].length).toBe(1);
      expect(emojis.has(entry.emoji)).toBe(false);
      expect(names.has(entry.name)).toBe(false);
      expect(entry.name).toMatch(/^[a-z0-9_]+$/);
      for (const keyword of entry.keywords) {
        expect(keyword).toBe(keyword.toLowerCase());
      }
      emojis.add(entry.emoji);
      names.add(entry.name);
    }
  });

  test("includes ZWJ sequences, a skin-tone base and a flag", () => {
    expect(EMOJI_ENTRIES.some((entry) => entry.emoji.includes("‍"))).toBe(true);
    expect(emojiFor("thumbsup")).toBe("👍");
    expect(emojiFor("us")).toBe("🇺🇸");
  });

  const fixture: EmojiEntry[] = [
    { emoji: "a", name: "smile", keywords: [] },
    { emoji: "b", name: "smiley", keywords: ["x"] },
    { emoji: "c", name: "big_smile", keywords: ["smile_face"] },
    { emoji: "d", name: "other", keywords: ["smile"] },
    { emoji: "e", name: "zsmile_x", keywords: [] },
  ];

  test("searchEmoji ranks exact name, name prefix, keyword prefix, then name substring", () => {
    expect(searchEmoji(fixture, "smile").map((item) => item.name)).toEqual([
      "smile",
      "smiley",
      "big_smile",
      "other",
      "zsmile_x",
    ]);
    expect(searchEmoji(fixture, "SMILE").map((item) => item.name)).toEqual([
      "smile",
      "smiley",
      "big_smile",
      "other",
      "zsmile_x",
    ]);
  });

  test("searchEmoji returns nothing for empty or one-character queries and honours the limit", () => {
    expect(searchEmoji(fixture, "")).toEqual([]);
    expect(searchEmoji(fixture, "s")).toEqual([]);
    expect(searchEmoji(fixture, "smile", 2).map((item) => item.name)).toEqual(["smile", "smiley"]);
    expect(searchEmoji(EMOJI_ENTRIES, "sm").length).toBeLessThanOrEqual(8);
  });
});

describe("emoji trigger", () => {
  test("opens at the block start and after whitespace", () => {
    const start = typed(":sm");
    expect(suggestions(start)).toContain("smile");
    expect(suggestions(start)).toEqual(searchEmoji(EMOJI_ENTRIES, "sm").map((item) => item.name));

    const spaced = typed(":sm", "and ");
    expect(suggestions(spaced)).toContain("smile");
  });

  test("one character, colon-only text, and the inner colon of a time or URL stay closed", () => {
    expect(suggestions(typed(":s"))).toEqual([]);
    expect(suggestions(typed("10:30"))).toEqual([]);
    expect(suggestions(typed("http://x"))).toEqual([]);
    expect(suggestions(typed(":sm", "a"))).toEqual([]);
  });

  test("code blocks, expanded selections, composition, and read-only close the menu", () => {
    const code = createEditor([
      {
        type: KEYS.codeBlock,
        id: "code",
        children: [{ type: KEYS.codeLine, id: "line", children: [{ text: "" }] }],
      },
    ]);
    code.tf.select(caret([0, 0, 0], 0));
    code.tf.insertText(":sm");
    expect(suggestions(code)).toEqual([]);

    const ranged = typed(":sm", "x");
    ranged.tf.select(textRange([0, 0], 0, 2));
    expect(suggestions(ranged)).toEqual([]);

    const composing = createEditor([paragraph("")]);
    composing.tf.select(caret([0, 0], 0));
    composing.composing = true;
    composing.tf.insertText(":sm");
    composing.composing = false;
    expect(suggestions(composing)).toEqual([]);

    const quiet = createEditor([paragraph("")]);
    quiet.tf.select(caret([0, 0], 0));
    quiet.tf.insertText(":sm");
    quiet.dom.readOnly = true;
    expect(suggestions(quiet)).toEqual([]);
  });

  test("a link's text still opens the menu", () => {
    const linked = createEditor([
      {
        type: KEYS.p,
        id: "p",
        children: [{ type: KEYS.link, url: "https://example.com", children: [{ text: "" }] }],
      },
    ] as EditorValue);
    linked.tf.select(caret([0, 0, 0], 0));
    linked.tf.insertText(":sm");
    expect(suggestions(linked)).toContain("smile");
  });
});

describe("emoji keys", () => {
  test("arrows move the active row, wrap, and keep the caret where it was", () => {
    const editor = typed(":sm");
    const before = editor.selection;
    expect(press(editor, "ArrowDown")).toBe(true);
    expect(editor.getOption(emojiUiPlugin, "activeIndex")).toBe(1);
    expect(editor.selection).toEqual(before);
    expect(press(editor, "ArrowUp")).toBe(true);
    expect(press(editor, "ArrowUp")).toBe(true);
    expect(editor.getOption(emojiUiPlugin, "activeIndex")).toBe(emojiMenuItems(editor).length - 1);
    expect(editor.selection).toEqual(before);
  });

  test("enter and tab replace the token with the active emoji", () => {
    const first = searchEmoji(EMOJI_ENTRIES, "sm")[0]?.emoji ?? "";

    const entered = typed(":sm");
    expect(press(entered, "Enter")).toBe(true);
    expect(plainText(entered)).toBe(first);

    const tabbed = typed(":sm");
    expect(press(tabbed, "Tab")).toBe(true);
    expect(plainText(tabbed)).toBe(first);
  });

  test("escape closes the menu, keeps the token, and typing one more letter reopens it", () => {
    const editor = typed(":sm");
    expect(press(editor, "Escape")).toBe(true);
    expect(suggestions(editor)).toEqual([]);
    expect(plainText(editor)).toBe(":sm");

    editor.tf.insertText("i");
    expect(plainText(editor)).toBe(":smi");
    expect(suggestions(editor)).toContain("smile");
  });

  test("with no results, enter inserts a paragraph and the emoji handler does not run", () => {
    const editor = typed(":zzzzzz");
    expect(onEmojiKeyDown(editor, key("Enter"))).toBe(false);
    expect(onEmojiKeyDown(editor, key("Tab"))).toBe(false);
    expect(onEmojiKeyDown(editor, key("ArrowDown"))).toBe(false);
    editor.tf.insertBreak();
    expect(editor.children).toHaveLength(2);
  });

  test("shift+enter is not an emoji choice", () => {
    const editor = typed(":sm");
    expect(onEmojiKeyDown(editor, key("Enter", { shiftKey: true }))).toBe(false);
    expect(plainText(editor)).toBe(":sm");
  });
});

describe("emoji choose", () => {
  test("keeps the text before and after and puts the caret right after the emoji", () => {
    const editor = createEditor([paragraph("see  now")]);
    editor.tf.select(caret([0, 0], 4));
    editor.tf.insertText(":sm");
    expect(press(editor, "Enter")).toBe(true);
    const emoji = searchEmoji(EMOJI_ENTRIES, "sm")[0]?.emoji ?? "";
    expect(plainText(editor)).toBe(`see ${emoji} now`);
    expect(editor.selection).toEqual(caret([0, 0], "see ".length + emoji.length));
  });

  test("the emoji keeps the bold mark of the token", () => {
    const editor = createEditor([
      { type: KEYS.p, id: "bold", children: [{ text: ":sm", bold: true }] },
    ] as EditorValue);
    editor.tf.select(caret([0, 0], 3));
    chooseEmojiSuggestion(editor, "😄");
    expect(leafAt(editor, "😄")?.bold).toBe(true);
  });

  test("one undo restores the typed token exactly", () => {
    const editor = typed(":sm");
    const emoji = searchEmoji(EMOJI_ENTRIES, "sm")[0]?.emoji ?? "";
    expect(press(editor, "Enter")).toBe(true);
    expect(plainText(editor)).toBe(emoji);
    editor.tf.undo();
    expect(plainText(editor)).toBe(":sm");
  });
});

describe("emoji closing colon", () => {
  test(":smile: converts to the exact emoji, and one undo restores the typed text", () => {
    const editor = createEditor([paragraph("")]);
    editor.tf.select(caret([0, 0], 0));
    editor.tf.insertText(":smile");
    editor.tf.insertText(":");
    expect(plainText(editor)).toBe(emojiFor("smile"));
    editor.tf.undo();
    expect(plainText(editor)).toBe(":smile:");
  });

  test("an unknown name, a name with a different case, and :+1: stay text", () => {
    for (const text of [":nope:", ":Smile:", ":+1:"]) {
      const editor = createEditor([paragraph("")]);
      editor.tf.select(caret([0, 0], 0));
      editor.tf.insertText(text);
      expect(plainText(editor)).toBe(text);
    }
  });
});

describe("emoji priority", () => {
  test("is registered above list, table and indent handlers and below the slash menu", () => {
    const editor = createEditor([paragraph("")]);
    expect(editor.getPlugin(emojiUiPlugin).priority).toBe(EMOJI_HANDLER_PRIORITY);
    expect(EMOJI_HANDLER_PRIORITY).toBeGreaterThan(0);
    expect(EMOJI_HANDLER_PRIORITY).toBeLessThan(SLASH_HANDLER_PRIORITY);
  });

  test("an open slash menu takes the keys and the emoji list stays empty", () => {
    const editor = createEditor([paragraph("")]);
    editor.tf.select(caret([0, 0], 0));
    editor.tf.insertText("/");
    editor.tf.insertText(" :sm");
    expect(slashMenuOpen(editor)).toBe(true);
    expect(emojiMenuItems(editor)).toEqual([]);
    press(editor, "Enter");
    expect(EMOJI_ENTRIES.some((entry) => plainText(editor).includes(entry.emoji))).toBe(false);
  });

  test("in a list item, tab with the emoji list open chooses the emoji and does not indent", () => {
    const editor = createEditor([
      { type: KEYS.p, id: "item", listStyleType: "disc", indent: 1, children: [{ text: "" }] },
    ] as EditorValue);
    editor.tf.select(caret([0, 0], 0));
    editor.tf.insertText(":sm");
    const emoji = searchEmoji(EMOJI_ENTRIES, "sm")[0]?.emoji ?? "";
    expect(press(editor, "Tab")).toBe(true);
    expect(plainText(editor)).toBe(emoji);
    expect(editor.children[0]?.indent).toBe(1);
  });

  test("with the emoji list closed, tab in a list item still indents", () => {
    const editor = createEditor([
      { type: KEYS.p, id: "item", listStyleType: "disc", indent: 1, children: [{ text: "plain" }] },
    ] as EditorValue);
    editor.tf.select(caret([0, 0], 0));
    expect(onEmojiKeyDown(editor, key("Tab"))).toBe(false);
    expect(editor.tf.tab({ reverse: false })).toBe(true);
    expect(editor.children[0]?.indent).toBe(2);
  });

  test("in a table cell with no emoji list open, enter and tab are not handled", () => {
    const editor = createEditor([
      {
        type: KEYS.table,
        id: "table",
        colSizes: [120, 120],
        children: [
          {
            type: KEYS.tr,
            children: [
              {
                type: KEYS.td,
                children: [{ type: KEYS.p, id: "cell", children: [{ text: "cell" }] }],
              },
              {
                type: KEYS.td,
                children: [{ type: KEYS.p, id: "other", children: [{ text: "x" }] }],
              },
            ],
          },
        ],
      },
    ] as EditorValue);
    editor.tf.select(caret([0, 0, 0, 0, 0], 0));
    expect(onEmojiKeyDown(editor, key("Enter"))).toBe(false);
    expect(onEmojiKeyDown(editor, key("Tab"))).toBe(false);
  });
});

describe("emoji mouse", () => {
  test("mousedown on a row keeps the editor focus and click chooses it", async () => {
    const editor = createPlateEditor({ plugins: createEditorPlugins(), value: [paragraph("")] });
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
      editor.tf.insertText(":smile");
    });
    const row = document.querySelector('[data-emoji-option="smile"]');
    expect(row).not.toBeNull();
    const down = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    row?.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    await act(async () => {
      row?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(plainText(editor)).toBe(emojiFor("smile"));
    await act(async () => {
      root?.unmount();
    });
    host.remove();
  });
});

describe("emoji unicode preservation", () => {
  const samples = ["👩‍💻", "👍🏽", "🇺🇸", "👨‍👩‍👧‍👦"];

  test("typed emoji, including ZWJ, skin tone and flag, stay byte for byte", () => {
    for (const sample of samples) {
      const editor = createEditor([paragraph("")]);
      editor.tf.select(caret([0, 0], 0));
      editor.tf.insertText(sample);
      expect(plainText(editor)).toBe(sample);
      expect(suggestions(editor)).toEqual([]);
    }
  });

  test("pasted emoji stay byte for byte", () => {
    const text = samples.join(" ");
    const editor = createEditor([paragraph("")]);
    editor.tf.select(caret([0, 0], 0));
    editor.tf.insertFragment([{ type: KEYS.p, children: [{ text }] }] as unknown as TElement[]);
    expect(plainText(editor)).toBe(text);
  });

  test("document validation keeps emoji byte for byte", () => {
    const text = samples.join(" ");
    const value = [paragraph(text)] as EditorValue;
    const parsed = expectOk(parseEditorDocument(createEditorDocument("doc", value)));
    expect(JSON.stringify(parsed)).toContain(text);
  });

  test("emoji before a token does not break the trigger", () => {
    const editor = typed(":sm", "👍🏽 ");
    expect(suggestions(editor)).toContain("smile");
    expect(readEmojiSession(editor)?.token).toBe("sm");
  });
});

async function mountSurface() {
  const editor = createPlateEditor({ plugins: createEditorPlugins(), value: [paragraph("")] });
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const surface = <EditorSurface editor={editor} readOnly={false} placeholder="" className="p-0" />;
  await act(async () => {
    root.render(surface);
  });
  return {
    editor,
    rerender: async () => {
      await act(async () => {
        root.render(surface);
      });
    },
    unmount: async () => {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    },
  };
}

function popoverOptions(): string[] {
  return [...document.querySelectorAll("[data-emoji-option]")].map(
    (row) => row.getAttribute("data-emoji-option") ?? "",
  );
}

describe("emoji popover follows the document", () => {
  test("four consecutive inserts and one flush show the list for the full token", async () => {
    const { editor, unmount } = await mountSurface();
    try {
      await act(async () => {
        editor.tf.select(caret([0, 0], 0));
        editor.tf.insertText(":");
        editor.tf.insertText("f");
        editor.tf.insertText("a");
        editor.tf.insertText("m");
      });
      const names = popoverOptions();
      expect(names[0]).toBe("family");
      expect(names.every((name) => name.includes("fam"))).toBe(true);
    } finally {
      await unmount();
    }
  });

  test("a render between keystrokes does not leave the list one keystroke behind", async () => {
    const { editor, unmount } = await mountSurface();
    try {
      await act(async () => {
        editor.tf.select(caret([0, 0], 0));
        editor.tf.insertText(":fa");
      });
      await act(async () => {
        editor.tf.insertText("m");
      });
      const names = popoverOptions();
      expect(names[0]).toBe("family");
      expect(names.every((name) => name.includes("fam"))).toBe(true);
    } finally {
      await unmount();
    }
  });

  test("a token with no results closes the popover, and enter then creates a paragraph", async () => {
    const { editor, unmount } = await mountSurface();
    try {
      await act(async () => {
        editor.tf.select(caret([0, 0], 0));
        editor.tf.insertText(":zzz");
      });
      expect(popoverOptions().length).toBeGreaterThan(0);
      await act(async () => {
        editor.tf.insertText("z");
      });
      expect(popoverOptions()).toEqual([]);
      expect(document.querySelector("[data-emoji-suggest]")).toBeNull();
      await act(async () => {
        editor.tf.insertText("z");
      });
      expect(onEmojiKeyDown(editor, key("Enter"))).toBe(false);
      await act(async () => {
        editor.tf.insertBreak();
      });
      expect(editor.children).toHaveLength(2);
    } finally {
      await unmount();
    }
  });

  test("escape stays closed across a re-render and reopens only when the token changes", async () => {
    const { editor, rerender, unmount } = await mountSurface();
    try {
      await act(async () => {
        editor.tf.select(caret([0, 0], 0));
        editor.tf.insertText(":sm");
      });
      expect(popoverOptions().length).toBeGreaterThan(0);
      await act(async () => {
        press(editor, "Escape");
      });
      expect(document.querySelector("[data-emoji-suggest]")).toBeNull();
      await rerender();
      expect(document.querySelector("[data-emoji-suggest]")).toBeNull();
      await act(async () => {
        editor.tf.insertText("i");
      });
      expect(popoverOptions().length).toBeGreaterThan(0);
    } finally {
      await unmount();
    }
  });

  test("a list that loads after the full token shows the list for the full token", async () => {
    resetEmojiDataForTests();
    const { editor, unmount } = await mountSurface();
    try {
      // A synchronous act does not drain the import promise, so the list is still unloaded here.
      act(() => {
        editor.tf.select(caret([0, 0], 0));
        editor.tf.insertText(":fam");
      });
      expect(popoverOptions()).toEqual([]);
      await act(async () => {
        await loadEmojiEntries();
      });
      const names = popoverOptions();
      expect(names[0]).toBe("family");
      expect(names.every((name) => name.includes("fam"))).toBe(true);
    } finally {
      await unmount();
    }
  });
});

describe("emoji undo selection", () => {
  test("after choose and undo the caret is collapsed at the token end, and closing still converts", () => {
    const editor = typed(":sm");
    expect(press(editor, "Enter")).toBe(true);
    editor.tf.undo();
    expect(plainText(editor)).toBe(":sm");
    expect(editor.selection).toEqual(caret([0, 0], 3));
    editor.tf.insertText("ile:");
    expect(plainText(editor)).toBe(emojiFor("smile"));
  });

  test("the closing-colon conversion undoes to the typed text with a collapsed caret", () => {
    const editor = createEditor([paragraph("")]);
    editor.tf.select(caret([0, 0], 0));
    editor.tf.insertText(":smile");
    editor.tf.insertText(":");
    expect(plainText(editor)).toBe(emojiFor("smile"));
    editor.tf.undo();
    expect(plainText(editor)).toBe(":smile:");
    expect(editor.selection).toEqual(caret([0, 0], 7));
  });
});
