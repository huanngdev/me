import { ElementApi, KEYS, PathApi, nanoid, type SlateEditor, type TElement } from "platejs";

import type { EditorCommand } from "../commands/editor-commands";
import { isStoredPageId, pageLinkNode, type PageLinkKind } from "./editor-page-link";

export type PageLinkInsert = {
  pageId: string;
  title: string;
  kind?: PageLinkKind;
};

// Mirrors insertBookmarkFromUrl and placeBookmark: an empty top-level paragraph is replaced,
// anything else gets the block below the current top-level block, and the block is selected.
export const insertPageLink: EditorCommand<PageLinkInsert> = {
  id: "block.page-link",
  label: "Page link",
  group: "insert",
  run: (editor, payload) => {
    if (!isStoredPageId(payload.pageId)) {
      return false;
    }

    return placePageLink(
      editor,
      pageLinkNode(payload.pageId, payload.title, payload.kind, nanoid()),
    );
  },
};

function placePageLink(editor: SlateEditor, element: TElement): boolean {
  const entry = editor.api.block({ highest: true });
  if (entry === undefined || !ElementApi.isElement(entry[0])) {
    return false;
  }

  const [node, path] = entry;
  const replaceEmpty =
    node.type === KEYS.p && editor.api.string(node).length === 0 && path.length === 1;
  if (replaceEmpty) {
    editor.tf.removeNodes({ at: path });
    editor.tf.insertNodes(element, { at: path, select: true });
    return true;
  }

  const at = PathApi.next(path);
  if (at === undefined) {
    return false;
  }

  editor.tf.insertNodes(element, { at, select: true });
  return true;
}
