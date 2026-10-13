import { createSlatePlugin, type SlateEditor } from "platejs";

import { runEditorCommand } from "../commands/editor-commands";
import type { PageEntity } from "../features/editor-page-link";
import { insertPageLink } from "../features/editor-page-link-command";
import { blockTextOffset, findSlashBlock, pointAtBlockOffset } from "../features/editor-slash";
import { pageLinkProvider } from "./editor-page-link";

type PageLinkPickerOptions = {
  open: boolean;
  blockId: string;
  offset: number;
};

function pageLinkPickerOptions(): PageLinkPickerOptions {
  return { open: false, blockId: "", offset: 0 };
}

function isEditorOnChange(value: unknown): value is (options?: { operation?: unknown }) => void {
  return typeof value === "function";
}

// The picker closes when its block goes away or the editor becomes read-only. Nothing is inserted then.
export const pageLinkPickerPlugin = createSlatePlugin({
  key: "pageLinkPicker",
  options: pageLinkPickerOptions(),
}).overrideEditor(({ editor }) => {
  const { onChange } = editor;
  if (isEditorOnChange(onChange)) {
    editor.onChange = (options?: { operation?: unknown }) => {
      onChange(options);
      if (!pageLinkPickerOpen(editor)) {
        return;
      }

      const blockId = editor.getOption(pageLinkPickerPlugin, "blockId");
      if (editor.dom.readOnly === true || findSlashBlock(editor, blockId) === null) {
        clearPageLinkPicker(editor);
      }
    };
  }
  return { transforms: {} };
});

export function pageLinkPickerOpen(editor: SlateEditor): boolean {
  return editor.getOption(pageLinkPickerPlugin, "open") === true;
}

// Opens where the slash menu was used. The offset is the caret, which sits where the "/" was.
export function openPageLinkPicker(editor: SlateEditor, blockId: string): void {
  if (editor.dom.readOnly === true || pageLinkProvider(editor) === null) {
    return;
  }

  const block = findSlashBlock(editor, blockId);
  const offset =
    block !== null && editor.selection !== null
      ? (blockTextOffset(editor, block[1], editor.selection.anchor) ?? 0)
      : 0;
  editor.setOption(pageLinkPickerPlugin, "open", true);
  editor.setOption(pageLinkPickerPlugin, "blockId", blockId);
  editor.setOption(pageLinkPickerPlugin, "offset", offset);
}

export function pageLinkPickerAnchorPoint(
  editor: SlateEditor,
): { path: number[]; offset: number } | null {
  if (!pageLinkPickerOpen(editor)) {
    return null;
  }

  const block = findSlashBlock(editor, editor.getOption(pageLinkPickerPlugin, "blockId"));
  if (block === null) {
    return null;
  }

  return pointAtBlockOffset(editor, block[1], editor.getOption(pageLinkPickerPlugin, "offset"));
}

export function cancelPageLinkPicker(editor: SlateEditor): void {
  if (!pageLinkPickerOpen(editor)) {
    return;
  }

  const blockId = editor.getOption(pageLinkPickerPlugin, "blockId");
  const offset = editor.getOption(pageLinkPickerPlugin, "offset");
  clearPageLinkPicker(editor);
  restoreCaret(editor, blockId, offset);
  editor.tf.focus();
}

// One undo entry for the insert. The query was removed earlier, in its own entry.
export function choosePageLink(editor: SlateEditor, page: PageEntity): boolean {
  if (!pageLinkPickerOpen(editor)) {
    return false;
  }

  const blockId = editor.getOption(pageLinkPickerPlugin, "blockId");
  const offset = editor.getOption(pageLinkPickerPlugin, "offset");
  clearPageLinkPicker(editor);
  if (findSlashBlock(editor, blockId) === null) {
    return false;
  }

  restoreCaret(editor, blockId, offset);
  const inserted = runEditorCommand(editor, insertPageLink, {
    pageId: page.pageId,
    title: page.title,
    kind: "link",
    beside: { blockId },
  });
  editor.tf.focus();
  return inserted;
}

export function clearPageLinkPicker(editor: SlateEditor): void {
  editor.setOption(pageLinkPickerPlugin, "open", false);
  editor.setOption(pageLinkPickerPlugin, "blockId", "");
  editor.setOption(pageLinkPickerPlugin, "offset", 0);
}

function restoreCaret(editor: SlateEditor, blockId: string, offset: number): void {
  const block = findSlashBlock(editor, blockId);
  if (block === null) {
    return;
  }

  const point = pointAtBlockOffset(editor, block[1], offset) ?? editor.api.end(block[1]);
  if (point !== undefined) {
    editor.tf.select(point);
  }
}
