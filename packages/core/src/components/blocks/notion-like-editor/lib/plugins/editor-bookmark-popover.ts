import {
  ElementApi,
  KEYS,
  NodeApi,
  PathApi,
  TextApi,
  createSlatePlugin,
  nanoid,
  type SlateEditor,
  type TElement,
} from "platejs";

import { blockPlacementRefusal } from "../features/editor-block-menu";
import {
  BOOKMARK_INVALID_URL,
  BOOKMARK_KEY,
  bookmarkElement,
  normalizeBookmarkUrl,
} from "../features/editor-bookmark-url";
import { blockTextOffset, findSlashBlock, pointAtBlockOffset } from "../features/editor-slash";

type BookmarkUrlOptions = {
  open: boolean;
  blockId: string;
  offset: number;
  error: string;
};

function bookmarkUrlOptions(): BookmarkUrlOptions {
  return { open: false, blockId: "", offset: 0, error: "" };
}

function isEditorOnChange(value: unknown): value is (options?: { operation?: unknown }) => void {
  return typeof value === "function";
}

export const bookmarkUrlPlugin = createSlatePlugin({
  key: "bookmarkUrl",
  options: bookmarkUrlOptions(),
}).overrideEditor(({ editor }) => {
  const { onChange } = editor;
  if (isEditorOnChange(onChange)) {
    editor.onChange = (options?: { operation?: unknown }) => {
      onChange(options);
      if (editor.dom.readOnly === true && editor.getOption(bookmarkUrlPlugin, "open") === true) {
        cancelBookmarkUrl(editor);
      }
    };
  }
  return { transforms: {} };
});

export function bookmarkUrlOpen(editor: SlateEditor): boolean {
  return editor.getOption(bookmarkUrlPlugin, "open") === true;
}

export function openBookmarkUrlPopover(editor: SlateEditor, blockId: string): void {
  const block = findSlashBlock(editor, blockId);
  const offset =
    block !== null && editor.selection !== null
      ? (blockTextOffset(editor, block[1], editor.selection.anchor) ?? 0)
      : 0;
  editor.setOption(bookmarkUrlPlugin, "open", true);
  editor.setOption(bookmarkUrlPlugin, "blockId", blockId);
  editor.setOption(bookmarkUrlPlugin, "offset", offset);
  editor.setOption(bookmarkUrlPlugin, "error", "");
}

export function bookmarkUrlAnchorPoint(
  editor: SlateEditor,
): { path: number[]; offset: number } | null {
  if (!bookmarkUrlOpen(editor)) {
    return null;
  }

  const block = findSlashBlock(editor, editor.getOption(bookmarkUrlPlugin, "blockId"));
  if (block === null) {
    return null;
  }

  return pointAtBlockOffset(editor, block[1], editor.getOption(bookmarkUrlPlugin, "offset"));
}

export function cancelBookmarkUrl(editor: SlateEditor): void {
  if (!bookmarkUrlOpen(editor)) {
    return;
  }

  const blockId = editor.getOption(bookmarkUrlPlugin, "blockId");
  const offset = editor.getOption(bookmarkUrlPlugin, "offset");
  clearBookmarkUrl(editor);
  restoreBookmarkCaret(editor, blockId, offset);
  editor.tf.focus();
}

export function submitBookmarkUrl(editor: SlateEditor, raw: string): boolean {
  if (!bookmarkUrlOpen(editor)) {
    return false;
  }

  if (editor.dom.readOnly === true) {
    cancelBookmarkUrl(editor);
    return false;
  }

  const blockId = editor.getOption(bookmarkUrlPlugin, "blockId");
  const block = findSlashBlock(editor, blockId);
  if (block === null) {
    clearBookmarkUrl(editor);
    editor.tf.focus();
    return false;
  }

  const url = normalizeBookmarkUrl(raw);
  if (url === undefined) {
    editor.setOption(bookmarkUrlPlugin, "error", BOOKMARK_INVALID_URL);
    return false;
  }

  const element = bookmarkElement({ url }, nanoid());
  if (!placeBlockBesideSlash(editor, blockId, element, BOOKMARK_KEY)) {
    cancelBookmarkUrl(editor);
    return false;
  }

  clearBookmarkUrl(editor);
  editor.tf.focus();
  return true;
}

// The one placement for blocks picked from a slash menu: beside the slash block, replacing it when
// it is an empty paragraph, in one undo entry. Refused where the block type is not allowed.
// `inCommand` is set when the caller already runs this inside one command, so the placement joins that
// command's undo entry. Otherwise the placement is its own entry, and the next edit starts another.
export function placeBlockBesideSlash(
  editor: SlateEditor,
  blockId: string,
  element: TElement,
  type: string,
  inCommand = false,
): boolean {
  const block = findSlashBlock(editor, blockId);
  if (block === null) {
    return false;
  }

  const [node, path] = block;
  if (!slashBlockPlaceable(editor, path, node, type)) {
    return false;
  }

  const at = PathApi.next([...path]);
  if (at === undefined) {
    return false;
  }

  const id = typeof node.id === "string" ? node.id : undefined;
  const replace = isEmptyParagraph(node);
  const place = (): void => {
    editor.tf.insertNodes(element, { at, select: true });
    if (!replace || id === undefined) {
      return;
    }

    const left = findSlashBlock(editor, id);
    if (left !== null && isEmptyParagraph(left[0])) {
      editor.tf.removeNodes({ at: left[1] });
    }
  };

  if (inCommand) {
    place();
    return true;
  }

  editor.tf.withNewBatch(place);
  editor.tf.setSplittingOnce(true);
  return true;
}

function clearBookmarkUrl(editor: SlateEditor): void {
  editor.setOption(bookmarkUrlPlugin, "open", false);
  editor.setOption(bookmarkUrlPlugin, "blockId", "");
  editor.setOption(bookmarkUrlPlugin, "offset", 0);
  editor.setOption(bookmarkUrlPlugin, "error", "");
}

function restoreBookmarkCaret(editor: SlateEditor, blockId: string, offset: number): void {
  const block = findSlashBlock(editor, blockId);
  if (block === null) {
    return;
  }

  const point = pointAtBlockOffset(editor, block[1], offset) ?? editor.api.end(block[1]);
  if (point !== undefined) {
    editor.tf.select(point);
  }
}

function slashBlockPlaceable(
  editor: SlateEditor,
  path: number[],
  node: TElement,
  type: string,
): boolean {
  const index = path[path.length - 1];
  if (index === undefined) {
    return false;
  }

  const parentPath = path.slice(0, -1);
  let parentType: string | null = null;
  if (parentPath.length > 0) {
    const parent = editor.api.node(parentPath);
    if (!parent || !ElementApi.isElement(parent[0]) || typeof parent[0].type !== "string") {
      return false;
    }
    parentType = parent[0].type;
  }

  const toIndex = isEmptyParagraph(node) ? index : index + 1;
  return blockPlacementRefusal(parentType, toIndex, type, false) === undefined;
}

function isEmptyParagraph(node: TElement): boolean {
  return (
    node.type === KEYS.p &&
    NodeApi.string(node) === "" &&
    node.children.every((child) => TextApi.isText(child))
  );
}
