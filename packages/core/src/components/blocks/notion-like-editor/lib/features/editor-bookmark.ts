import { ElementApi, KEYS, PathApi, nanoid, type SlateEditor, type TElement } from "platejs";

import type { EditorCommand } from "../commands/editor-commands";
import {
  BOOKMARK_INVALID_URL,
  BOOKMARK_KEY,
  bookmarkElement,
  bookmarkPreviewFields,
  normalizeBookmarkUrl,
  type LinkPreview,
} from "./editor-bookmark-url";
import { setPasteRepairs } from "../paste/editor-paste-repairs";
import {
  pasteUrlActions,
  replacePastedUrlWith,
  replaceVoidWithParagraph,
} from "../paste/editor-paste-url";

const METADATA_KEYS = ["title", "description", "siteName", "imageUrl"] as const;

pasteUrlActions.unshift({
  id: "bookmark",
  label: "Bookmark",
  match: () => true,
  run: (editor, offer) => {
    const url = normalizeBookmarkUrl(offer.url);
    if (url === undefined) {
      setPasteRepairs(editor, [{ path: [], message: BOOKMARK_INVALID_URL }]);
      return;
    }

    replacePastedUrlWith(editor, offer, bookmarkElement({ url }, nanoid()));
  },
});

export const insertBookmarkFromUrl: EditorCommand<string> = {
  id: "block.insert.bookmark",
  label: "Bookmark",
  group: "insert",
  run: (editor, url) => {
    if (editor.dom.readOnly === true) {
      return;
    }

    const normalized = normalizeBookmarkUrl(url);
    if (normalized === undefined) {
      setPasteRepairs(editor, [{ path: [], message: BOOKMARK_INVALID_URL }]);
      return;
    }

    placeBookmark(editor, normalized);
  },
};

export const convertBookmarkToText: EditorCommand<string> = {
  id: "block.bookmark.to-text",
  label: "Convert to text",
  group: "action",
  run: (editor, id) => {
    const entry = writableBookmark(editor, id);
    if (entry === undefined || typeof entry[0].url !== "string") {
      return;
    }

    replaceVoidWithParagraph(editor, entry[1], entry[0].url);
  },
};

export const removeBookmark: EditorCommand<string> = {
  id: "block.bookmark.remove",
  label: "Delete",
  group: "action",
  run: (editor, id) => {
    const entry = writableBookmark(editor, id);
    if (entry === undefined) {
      return;
    }

    editor.tf.removeNodes({ at: entry[1] });
    if (editor.children.length === 0) {
      editor.tf.insertNodes(
        { type: KEYS.p, id: nanoid(), children: [{ text: "" }] },
        { at: [0], select: true },
      );
    }
  },
};

// Cached preview metadata is not a user edit. Undo still removes the insert that created the block.
export function applyBookmarkPreview(
  editor: SlateEditor,
  blockId: string,
  url: string,
  preview: LinkPreview,
): boolean {
  const entry = writableBookmark(editor, blockId);
  if (entry === undefined || entry[0].url !== url) {
    return false;
  }

  const fields = bookmarkPreviewFields(preview);
  const props: Record<string, string> = { fetchedAt: new Date().toISOString() };
  if (fields.title !== undefined) {
    props.title = fields.title;
  }
  if (fields.description !== undefined) {
    props.description = fields.description;
  }
  if (fields.siteName !== undefined) {
    props.siteName = fields.siteName;
  }
  if (fields.imageUrl !== undefined) {
    props.imageUrl = fields.imageUrl;
  }

  const [, path] = entry;
  const drop = METADATA_KEYS.filter((key) => !(key in props));
  editor.tf.withoutSaving(() => {
    editor.tf.setNodes(props, { at: path });
    if (drop.length > 0) {
      editor.tf.unsetNodes([...drop], { at: path });
    }
  });
  return true;
}

function placeBookmark(editor: SlateEditor, url: string): void {
  const entry = editor.api.block({ highest: true });
  if (entry === undefined || !ElementApi.isElement(entry[0])) {
    return;
  }

  const [node, path] = entry;
  const element = bookmarkElement({ url }, nanoid());
  const replaceEmpty =
    node.type === KEYS.p && editor.api.string(node).length === 0 && path.length === 1;
  if (replaceEmpty) {
    editor.tf.removeNodes({ at: path });
    editor.tf.insertNodes(element, { at: path, select: true });
    return;
  }

  const at = PathApi.next(path);
  if (at === undefined) {
    return;
  }

  editor.tf.insertNodes(element, { at, select: true });
}

function writableBookmark(editor: SlateEditor, id: string): [TElement, number[]] | undefined {
  if (editor.dom.readOnly === true) {
    return undefined;
  }

  for (const [node, path] of editor.api.nodes({
    at: [],
    match: (candidate) =>
      ElementApi.isElement(candidate) && candidate.type === BOOKMARK_KEY && candidate.id === id,
  })) {
    if (ElementApi.isElement(node)) {
      return [node, path];
    }
  }

  return undefined;
}
