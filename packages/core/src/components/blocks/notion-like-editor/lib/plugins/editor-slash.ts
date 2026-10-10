import { ElementApi, KEYS, NodeApi, TextApi, createSlatePlugin, type SlateEditor } from "platejs";
import { toPlatePlugin } from "platejs/react";

import { runEditorCommand, type EditorCommand } from "../commands/editor-commands";
import { applyBlockTurn } from "../features/editor-block-menu";
import { insertPickedBlock } from "../features/editor-block-picker";
import {
  blockTextOffset,
  pointAtBlockOffset,
  readSlashSession,
  slashAvailableItems,
  slashItemsForSession,
  slashQueryTooLong,
  slashTriggerAllowed,
  type SlashItem,
  type SlashSession,
} from "../features/editor-slash";
import { retainScroll } from "../../components/ui/block-toolbar";
import { openLinkPopover } from "./editor-link";
import { editorIsComposing, openMentionInput } from "./editor-mention";

export const SLASH_HANDLER_PRIORITY = 2000;

type SlashOptions = {
  open: boolean;
  blockId: string;
  offset: number;
  activeIndex: number;
  query: string;
};

type SlashKeyEvent = {
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

const compositionCommit = new WeakSet<SlateEditor>();
const seenQuery = new WeakMap<SlateEditor, string>();

function slashOptions(): SlashOptions {
  return { open: false, blockId: "", offset: 0, activeIndex: 0, query: "" };
}

function slashOpenSuppressed(editor: SlateEditor): boolean {
  return editorIsComposing(editor) || compositionCommit.has(editor);
}

export function setSlashComposing(editor: SlateEditor, composing: boolean): void {
  editor.composing = composing;
  if (composing) {
    return;
  }
  compositionCommit.add(editor);
  queueMicrotask(() => {
    compositionCommit.delete(editor);
  });
}

export function slashMenuOpen(editor: SlateEditor): boolean {
  return editor.getOption(slashUiPlugin, "open") === true;
}

export function closeSlashMenu(editor: SlateEditor): void {
  if (!slashMenuOpen(editor)) {
    return;
  }
  seenQuery.delete(editor);
  editor.setOption(slashUiPlugin, "open", false);
  editor.setOption(slashUiPlugin, "blockId", "");
  editor.setOption(slashUiPlugin, "offset", 0);
  editor.setOption(slashUiPlugin, "activeIndex", 0);
  editor.setOption(slashUiPlugin, "query", "");
}

export function slashSession(editor: SlateEditor): SlashSession | null {
  if (!slashMenuOpen(editor)) {
    return null;
  }
  return readSlashSession(editor, {
    blockId: editor.getOption(slashUiPlugin, "blockId"),
    offset: editor.getOption(slashUiPlugin, "offset"),
  });
}

export function slashMenuItems(editor: SlateEditor): SlashItem[] {
  const session = slashSession(editor);
  if (session === null) {
    return [];
  }
  return slashItemsForSession(editor, session);
}

export function moveSlashHighlight(editor: SlateEditor, delta: number): void {
  const items = slashMenuItems(editor);
  if (items.length === 0) {
    return;
  }
  const current = editor.getOption(slashUiPlugin, "activeIndex");
  const next = (current + delta + items.length) % items.length;
  editor.setOption(slashUiPlugin, "activeIndex", next);
}

export function syncSlashMenu(editor: SlateEditor): void {
  if (!slashMenuOpen(editor)) {
    return;
  }
  const session = slashSession(editor);
  if (session === null || slashQueryTooLong(session.query)) {
    closeSlashMenu(editor);
    return;
  }
  if (seenQuery.get(editor) === session.query) {
    return;
  }
  seenQuery.set(editor, session.query);
  editor.setOption(slashUiPlugin, "query", session.query);
  if (editor.getOption(slashUiPlugin, "activeIndex") !== 0) {
    editor.setOption(slashUiPlugin, "activeIndex", 0);
  }
}

function openSlashMenu(editor: SlateEditor): void {
  const selection = editor.selection;
  const block = selection === null ? undefined : editor.api.block();
  if (
    selection === null ||
    !block ||
    !ElementApi.isElement(block[0]) ||
    typeof block[0].id !== "string"
  ) {
    return;
  }
  const caret = blockTextOffset(editor, block[1], selection.anchor);
  if (caret === null || caret < 1) {
    return;
  }
  if (NodeApi.string(block[0])[caret - 1] !== "/") {
    return;
  }
  editor.setOption(slashUiPlugin, "open", true);
  editor.setOption(slashUiPlugin, "blockId", block[0].id);
  editor.setOption(slashUiPlugin, "offset", caret - 1);
  editor.setOption(slashUiPlugin, "activeIndex", 0);
  editor.setOption(slashUiPlugin, "query", "");
  seenQuery.set(editor, "");
}

function chooseSlash(editor: SlateEditor, id: string): void {
  const session = slashSession(editor);
  const item =
    session === null
      ? undefined
      : slashAvailableItems(editor, session).find((entry) => entry.id === id);
  closeSlashMenu(editor);
  if (session === null || item === undefined) {
    return;
  }
  const start = pointAtBlockOffset(editor, session.blockPath, session.anchor.offset);
  const end = pointAtBlockOffset(editor, session.blockPath, session.caretOffset);
  if (start === null || end === null) {
    return;
  }
  editor.tf.delete({ at: { anchor: start, focus: end } });
  if (item.inline === "mention") {
    openMentionInput(editor);
    return;
  }
  if (item.inline === "link") {
    openLinkPopover(editor);
    return;
  }
  const block = item.block;
  if (block === undefined) {
    return;
  }
  if (isEmptyParagraph(editor, session.blockPath)) {
    if (block.kind === "paragraph" || block.kind === undefined) {
      if (block.kind === undefined) {
        replaceEmptyParagraph(editor, session.blockPath, block);
      }
      return;
    }
    applyBlockTurn(editor, session.blockPath, block.kind);
    return;
  }
  insertPickedBlock(editor, session.blockPath, block, { batch: false });
}

function replaceEmptyParagraph(
  editor: SlateEditor,
  path: number[],
  item: NonNullable<SlashItem["block"]>,
): void {
  const node = editor.api.node(path)?.[0];
  const id =
    node && ElementApi.isElement(node) && typeof node.id === "string" ? node.id : undefined;
  insertPickedBlock(editor, path, item, { batch: false });
  if (id === undefined) {
    return;
  }
  const left = findParagraph(editor, id);
  if (left !== null && isEmptyParagraph(editor, left)) {
    editor.tf.removeNodes({ at: left });
  }
}

function findParagraph(editor: SlateEditor, id: string): number[] | null {
  for (const [node, path] of editor.api.nodes({
    at: [],
    match: (candidate) => ElementApi.isElement(candidate) && candidate.id === id,
  })) {
    if (ElementApi.isElement(node)) {
      return path;
    }
  }
  return null;
}

function isEmptyParagraph(editor: SlateEditor, path: number[]): boolean {
  const node = editor.api.node(path)?.[0];
  return (
    ElementApi.isElement(node) &&
    node.type === KEYS.p &&
    NodeApi.string(node) === "" &&
    node.children.every((child) => TextApi.isText(child))
  );
}

export const chooseSlashItem: EditorCommand<string> = {
  id: "insert.slash",
  label: "Insert",
  group: "insert",
  isEnabled: (editor) => slashMenuOpen(editor) && editor.dom.readOnly !== true,
  run: (editor, id) => {
    chooseSlash(editor, id);
  },
};

export function onSlashKeyDown(editor: SlateEditor, event: SlashKeyEvent): boolean {
  if (
    !slashMenuOpen(editor) ||
    event.metaKey === true ||
    event.ctrlKey === true ||
    event.altKey === true
  ) {
    return false;
  }
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    moveSlashHighlight(editor, event.key === "ArrowDown" ? 1 : -1);
    return true;
  }
  if ((event.key === "Enter" || event.key === "Tab") && event.shiftKey !== true) {
    event.preventDefault();
    const items = slashMenuItems(editor);
    const item = items[editor.getOption(slashUiPlugin, "activeIndex")];
    if (item === undefined) {
      closeSlashMenu(editor);
      return true;
    }
    retainScroll(() => {
      runEditorCommand(editor, chooseSlashItem, item.id);
      editor.tf.focus();
    });
    return true;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    closeSlashMenu(editor);
    return true;
  }
  if (event.key === " " && slashMenuItems(editor).length === 0) {
    closeSlashMenu(editor);
  }
  return false;
}

const slashBase = createSlatePlugin({
  key: "slashUi",
  priority: SLASH_HANDLER_PRIORITY,
  options: slashOptions(),
}).overrideEditor(({ editor, tf: { insertText } }) => {
  return {
    transforms: {
      insertText(text, options) {
        const open =
          text === "/" &&
          (options === undefined || options.at === undefined) &&
          slashTriggerAllowed(editor, slashOpenSuppressed(editor));
        insertText(text, options);
        if (open) {
          openSlashMenu(editor);
        }
      },
    },
  };
});

export const slashWatchPlugin = createSlatePlugin({
  key: "slashWatch",
  priority: -1,
}).overrideEditor(({ editor }) => {
  const { onChange } = editor;
  if (isEditorOnChange(onChange)) {
    editor.onChange = (options?: { operation?: unknown }) => {
      onChange(options);
      syncSlashMenu(editor);
    };
  }
  return { transforms: {} };
});

export const slashUiPlugin = toPlatePlugin(slashBase, {
  handlers: {
    onKeyDown: ({ editor, event }) => onSlashKeyDown(editor, event),
    onCompositionStart: ({ editor }) => {
      setSlashComposing(editor, true);
    },
    onCompositionEnd: ({ editor }) => {
      setSlashComposing(editor, false);
    },
    onBlur: ({ editor, event }) => {
      const related = "relatedTarget" in event ? event.relatedTarget : null;
      if (related instanceof Element && related.closest("[data-slash-menu]") !== null) {
        return;
      }
      queueMicrotask(() => {
        const active = document.activeElement;
        if (active instanceof Element && active.closest("[data-slate-editor]") !== null) {
          return;
        }
        if (active instanceof Element && active.closest("[data-slash-menu]") !== null) {
          return;
        }
        closeSlashMenu(editor);
      });
    },
  },
});
