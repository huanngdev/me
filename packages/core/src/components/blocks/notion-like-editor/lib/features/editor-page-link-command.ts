import { ElementApi, KEYS, PathApi, nanoid, type SlateEditor, type TElement } from "platejs";

import type { EditorCommand } from "../commands/editor-commands";
import { PAGE_LINK_KEY, isStoredPageId, pageLinkNode, type PageLinkKind } from "./editor-page-link";
import { placeBlockBesideSlash } from "../plugins/editor-bookmark-popover";

type PageLinkInsert = {
  pageId: string;
  title: string;
  kind?: PageLinkKind;
  // A slash block id. The link goes where a bookmark picked from that block would go.
  beside?: { blockId: string };
};

// Without a target this mirrors insertBookmarkFromUrl and placeBookmark: an empty top-level
// paragraph is replaced, anything else gets the block below the current top-level block, and the
// block is selected. With a target it uses the bookmark's slash placement (placeBlockBesideSlash).
export const insertPageLink: EditorCommand<PageLinkInsert> = {
  id: "block.page-link",
  label: "Page link",
  group: "insert",
  run: (editor, payload) => {
    if (!isStoredPageId(payload.pageId)) {
      return false;
    }

    const element = pageLinkNode(payload.pageId, payload.title, payload.kind, nanoid());
    if (payload.beside !== undefined) {
      return placeBlockBesideSlash(editor, payload.beside.blockId, element, PAGE_LINK_KEY);
    }

    return placePageLink(editor, element);
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
