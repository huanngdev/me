import { ElementApi, createSlatePlugin, type SlateEditor, type TElement } from "platejs";

import { BOOKMARK_KEY } from "../features/editor-bookmark-url";
import { blockSelectionActive } from "./editor-block-selection";

type BookmarkToolbarOptions = {
  open: boolean;
  blockId: string;
};

function bookmarkToolbarOptions(): BookmarkToolbarOptions {
  return { open: false, blockId: "" };
}

// A click on a bookmark card (or Enter on the selected void) opens one popover
// with the card actions. Nothing else about the card changes on hover.
export const bookmarkToolbarPlugin = createSlatePlugin({
  key: "bookmarkToolbar",
  options: bookmarkToolbarOptions(),
}).overrideEditor(({ editor }) => {
  const { onChange } = editor;
  if (isEditorOnChange(onChange)) {
    editor.onChange = (options?: { operation?: unknown }) => {
      onChange(options);
      if (editor.dom.readOnly === true && bookmarkToolbarOpen(editor)) {
        closeBookmarkToolbar(editor);
      }
    };
  }
  return { transforms: {} };
});

function isEditorOnChange(value: unknown): value is (options?: { operation?: unknown }) => void {
  return typeof value === "function";
}

export function bookmarkToolbarOpen(editor: SlateEditor): boolean {
  return editor.getOption(bookmarkToolbarPlugin, "open") === true;
}

export function bookmarkToolbarBlockId(editor: SlateEditor): string {
  return editor.getOption(bookmarkToolbarPlugin, "blockId");
}

export function openBookmarkToolbar(editor: SlateEditor, blockId: string): void {
  if (editor.dom.readOnly === true || blockId.length === 0) {
    return;
  }

  if (blockSelectionActive(editor)) {
    return;
  }

  editor.setOption(bookmarkToolbarPlugin, "blockId", blockId);
  editor.setOption(bookmarkToolbarPlugin, "open", true);
}

export function closeBookmarkToolbar(editor: SlateEditor): void {
  if (!bookmarkToolbarOpen(editor)) {
    return;
  }

  editor.setOption(bookmarkToolbarPlugin, "open", false);
  editor.setOption(bookmarkToolbarPlugin, "blockId", "");
}

export function selectedBookmarkEntry(editor: SlateEditor): [TElement, number[]] | undefined {
  const entry = editor.api.above({
    match: (node) => ElementApi.isElement(node) && node.type === editor.getType(BOOKMARK_KEY),
  });
  if (entry === undefined || !ElementApi.isElement(entry[0])) {
    return undefined;
  }

  return [entry[0], entry[1]];
}

export function bookmarkToolbarSelectionOn(editor: SlateEditor, blockId: string): boolean {
  if (blockId.length === 0) {
    return false;
  }

  return (
    editor.api.above({
      match: (node) => ElementApi.isElement(node) && node.id === blockId,
    }) !== undefined
  );
}

type BookmarkKeyEvent = {
  key: string;
  altKey?: boolean;
  shiftKey?: boolean;
  metaKey?: boolean;
  ctrlKey?: boolean;
  preventDefault: () => void;
};

// Enter on the selected bookmark opens the popover instead of inserting a break.
export function onBookmarkToolbarKeyDown(editor: SlateEditor, event: BookmarkKeyEvent): boolean {
  if (editor.dom.readOnly === true || event.key !== "Enter") {
    return false;
  }

  if (event.altKey || event.shiftKey || event.metaKey || event.ctrlKey) {
    return false;
  }

  if (bookmarkToolbarOpen(editor)) {
    return false;
  }

  const entry = selectedBookmarkEntry(editor);
  if (entry === undefined) {
    return false;
  }

  const id = typeof entry[0].id === "string" ? entry[0].id : "";
  if (id.length === 0) {
    return false;
  }

  event.preventDefault();
  openBookmarkToolbar(editor, id);
  return true;
}
