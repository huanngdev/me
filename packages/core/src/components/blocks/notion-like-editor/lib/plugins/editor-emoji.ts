import { createSlatePlugin, type SlateEditor } from "platejs";
import { toPlatePlugin } from "platejs/react";

import { runEditorCommand, type EditorCommand } from "../commands/editor-commands";
import {
  EMOJI_SUGGEST_LIMIT,
  loadEmojiEntries,
  loadedEmojiEntries,
  readClosingEmoji,
  readEmojiSession,
  searchEmoji,
  type EmojiReplacement,
} from "../features/editor-emoji";
import type { EmojiEntry } from "../features/emoji-data";
import { pointAtBlockOffset } from "../features/editor-slash";
import { slashMenuOpen } from "./editor-slash";

// Below the slash menu (2000), so an open slash menu handles its keys first.
// Above the list, table and indent handlers (0), so Tab chooses an emoji instead of indenting.
export const EMOJI_HANDLER_PRIORITY = 1000;

type EmojiOptions = {
  open: boolean;
  activeIndex: number;
  ready: boolean;
  // The token the menu is for. The popover subscribes to it, so every token change re-renders.
  query: string;
};

type EmojiKeyEvent = {
  key: string;
  shiftKey?: boolean;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  preventDefault: () => void;
};

function isEditorOnChange(value: unknown): value is (options?: { operation?: unknown }) => void {
  return typeof value === "function";
}

// Escape hides one token. The key is the block, the colon offset and the token, so editing the token reopens it.
const lastTokenKey = new WeakMap<SlateEditor, string>();
const dismissedToken = new WeakSet<SlateEditor>();
const requestedData = new WeakSet<SlateEditor>();

function emojiOptions(): EmojiOptions {
  return { open: false, activeIndex: 0, ready: false, query: "" };
}

export function emojiMenuOpen(editor: SlateEditor): boolean {
  return editor.getOption(emojiUiPlugin, "open") === true;
}

export function closeEmojiMenu(editor: SlateEditor): void {
  if (emojiMenuOpen(editor)) {
    editor.setOption(emojiUiPlugin, "open", false);
  }
  if (editor.getOption(emojiUiPlugin, "activeIndex") !== 0) {
    editor.setOption(emojiUiPlugin, "activeIndex", 0);
  }
}

function dismissEmojiMenu(editor: SlateEditor): void {
  dismissedToken.add(editor);
  closeEmojiMenu(editor);
}

function activeEmojiIndex(editor: SlateEditor, count: number): number {
  return Math.min(editor.getOption(emojiUiPlugin, "activeIndex"), count - 1);
}

// Rows are empty while the data loads, when the menu is closed, or when a slash menu is open.
export function emojiMenuItems(editor: SlateEditor): EmojiEntry[] {
  if (!emojiMenuOpen(editor) || slashMenuOpen(editor)) {
    return [];
  }
  const session = readEmojiSession(editor);
  const entries = loadedEmojiEntries();
  if (session === null || entries === null) {
    return [];
  }
  return searchEmoji(entries, session.token, EMOJI_SUGGEST_LIMIT);
}

export function moveEmojiHighlight(editor: SlateEditor, delta: number): void {
  const count = emojiMenuItems(editor).length;
  if (count === 0) {
    return;
  }
  const current = activeEmojiIndex(editor, count);
  editor.setOption(emojiUiPlugin, "activeIndex", (current + delta + count) % count);
}

function requestEmojiData(editor: SlateEditor): void {
  if (loadedEmojiEntries() !== null || requestedData.has(editor)) {
    return;
  }
  requestedData.add(editor);
  loadEmojiEntries()
    .then(() => {
      requestedData.delete(editor);
      // Changing an option re-renders the popover, which then reads the loaded data.
      editor.setOption(emojiUiPlugin, "ready", true);
      syncEmojiMenu(editor);
    })
    .catch(() => {
      requestedData.delete(editor);
    });
}

function setEmojiQuery(editor: SlateEditor, query: string): void {
  if (editor.getOption(emojiUiPlugin, "query") !== query) {
    editor.setOption(emojiUiPlugin, "query", query);
  }
}

export function syncEmojiMenu(editor: SlateEditor): void {
  const session = slashMenuOpen(editor) ? null : readEmojiSession(editor);
  setEmojiQuery(editor, session?.token ?? "");
  if (session === null) {
    lastTokenKey.delete(editor);
    dismissedToken.delete(editor);
    closeEmojiMenu(editor);
    return;
  }

  const key = `${session.blockId}:${session.colon}:${session.token}`;
  if (lastTokenKey.get(editor) !== key) {
    lastTokenKey.set(editor, key);
    dismissedToken.delete(editor);
    if (editor.getOption(emojiUiPlugin, "activeIndex") !== 0) {
      editor.setOption(emojiUiPlugin, "activeIndex", 0);
    }
  }

  if (dismissedToken.has(editor)) {
    closeEmojiMenu(editor);
    return;
  }
  if (!emojiMenuOpen(editor)) {
    editor.setOption(emojiUiPlugin, "open", true);
  }
  requestEmojiData(editor);
}

// One command for the popover choice and the closing colon, so one undo restores the typed text.
export const insertEmojiText: EditorCommand<EmojiReplacement> = {
  id: "insert.emoji",
  label: "Emoji",
  group: "insert",
  isEnabled: (editor) => editor.dom.readOnly !== true,
  run: (editor, replacement) => {
    const start = pointAtBlockOffset(editor, replacement.blockPath, replacement.start);
    const end = pointAtBlockOffset(editor, replacement.blockPath, replacement.end);
    if (start === null || end === null) {
      return;
    }
    // Insert by range so the token is never selected. The undo then restores a collapsed caret.
    editor.tf.insertText(replacement.emoji, { at: { anchor: start, focus: end } });
    const after = pointAtBlockOffset(
      editor,
      replacement.blockPath,
      replacement.start + replacement.emoji.length,
    );
    if (after !== null) {
      editor.tf.select(after);
    }
  },
};

export function chooseEmojiSuggestion(editor: SlateEditor, emoji: string): void {
  const session = readEmojiSession(editor);
  closeEmojiMenu(editor);
  if (session === null) {
    return;
  }
  runEditorCommand(editor, insertEmojiText, {
    emoji,
    blockPath: session.blockPath,
    start: session.colon,
    end: session.caret,
  });
}

function convertClosingEmoji(editor: SlateEditor): void {
  if (slashMenuOpen(editor)) {
    return;
  }
  const entries = loadedEmojiEntries();
  if (entries === null) {
    requestEmojiData(editor);
    return;
  }
  const replacement = readClosingEmoji(editor, entries);
  if (replacement === null) {
    return;
  }
  closeEmojiMenu(editor);
  runEditorCommand(editor, insertEmojiText, replacement);
}

export function onEmojiKeyDown(editor: SlateEditor, event: EmojiKeyEvent): boolean {
  if (event.metaKey === true || event.ctrlKey === true || event.altKey === true) {
    return false;
  }
  const items = emojiMenuItems(editor);
  if (items.length === 0) {
    return false;
  }
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    moveEmojiHighlight(editor, event.key === "ArrowDown" ? 1 : -1);
    return true;
  }
  if ((event.key === "Enter" || event.key === "Tab") && event.shiftKey !== true) {
    event.preventDefault();
    const item = items[activeEmojiIndex(editor, items.length)];
    if (item !== undefined) {
      chooseEmojiSuggestion(editor, item.emoji);
    }
    return true;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    dismissEmojiMenu(editor);
    return true;
  }
  return false;
}

const emojiBase = createSlatePlugin({
  key: "emojiUi",
  priority: EMOJI_HANDLER_PRIORITY,
  options: emojiOptions(),
}).overrideEditor(({ editor, tf: { insertText } }) => {
  return {
    transforms: {
      insertText(text, options) {
        insertText(text, options);
        // A multi-character insert ending in a colon counts too, so a paste of :name: converts.
        if (text.endsWith(":") && (options === undefined || options.at === undefined)) {
          convertClosingEmoji(editor);
        }
        // Slate's onChange runs later, so typing opens or closes the menu at once.
        syncEmojiMenu(editor);
      },
    },
  };
});

export const emojiWatchPlugin = createSlatePlugin({
  key: "emojiWatch",
  priority: -1,
}).overrideEditor(({ editor }) => {
  const { onChange } = editor;
  if (isEditorOnChange(onChange)) {
    editor.onChange = (options?: { operation?: unknown }) => {
      onChange(options);
      syncEmojiMenu(editor);
    };
  }
  return { transforms: {} };
});

export const emojiUiPlugin = toPlatePlugin(emojiBase, {
  handlers: {
    onKeyDown: ({ editor, event }) => onEmojiKeyDown(editor, event),
    onBlur: ({ editor, event }) => {
      const related = "relatedTarget" in event ? event.relatedTarget : null;
      if (related instanceof Element && related.closest("[data-emoji-suggest]") !== null) {
        return;
      }
      queueMicrotask(() => {
        const active = document.activeElement;
        if (active instanceof Element && active.closest("[data-slate-editor]") !== null) {
          return;
        }
        if (active instanceof Element && active.closest("[data-emoji-suggest]") !== null) {
          return;
        }
        closeEmojiMenu(editor);
      });
    },
  },
});
