import {
  ElementApi,
  createSlatePlugin,
  type Descendant,
  type SlateEditor,
  type TElement,
} from "platejs";

import { plainText, type PlainTextHook } from "../features/editor-inline-date";
import {
  PAGE_LINK_KEY,
  isStoredPageId,
  pageLinkDisplayTitle,
  storedPageLinkKind,
  type PageLinkHost,
  type PageLinkStatus,
  type PageOpenRequest,
} from "../features/editor-page-link";
import { blockSelectionActive } from "./editor-block-selection";

const hosts = new WeakMap<SlateEditor, PageLinkHost>();
const statuses = new WeakMap<SlateEditor, Map<string, PageLinkStatus>>();

const pageLinkText: PlainTextHook = (node) => {
  if (node.type !== PAGE_LINK_KEY) {
    return undefined;
  }

  return pageLinkDisplayTitle(typeof node.title === "string" ? node.title : "");
};

export const pageLinkPlugin = createSlatePlugin({
  key: PAGE_LINK_KEY,
  node: { isElement: true, isVoid: true },
}).overrideEditor(({ editor, tf: { setFragmentData } }) => ({
  transforms: {
    setFragmentData(data, originEvent) {
      setFragmentData(data, originEvent);
      // The page link is written last, so a fragment with a date or equation keeps their text too.
      const fragment = editor.api.getFragment();
      if (!fragment.some((node) => containsPageLink(node))) {
        return;
      }

      data.setData("text/plain", fragment.map((node) => plainText(node, pageLinkText)).join("\n"));
    },
  },
}));

function containsPageLink(node: Descendant): boolean {
  if (!ElementApi.isElement(node)) {
    return false;
  }

  return node.type === PAGE_LINK_KEY || node.children.some((child) => containsPageLink(child));
}

// The scope sets the host during render, so a row that resolves in the same commit sees it.
export function attachPageLinkHost(editor: SlateEditor, host: PageLinkHost): void {
  hosts.set(editor, host);
}

// The row reports its status so a missing or denied page cannot be opened from the keyboard.
export function setPageLinkStatus(
  editor: SlateEditor,
  blockId: string,
  status: PageLinkStatus | undefined,
): void {
  if (blockId.length === 0) {
    return;
  }

  let map = statuses.get(editor);
  if (map === undefined) {
    map = new Map<string, PageLinkStatus>();
    statuses.set(editor, map);
  }

  if (status === undefined) {
    map.delete(blockId);
    return;
  }

  map.set(blockId, status);
}

export function openPageLink(
  editor: SlateEditor,
  request: PageOpenRequest,
  blockId: string,
): boolean {
  if (!isStoredPageId(request.pageId) || blockSelectionActive(editor)) {
    return false;
  }

  const onOpenPage = hosts.get(editor)?.onOpenPage;
  if (!onOpenPage) {
    return false;
  }

  const status = statuses.get(editor)?.get(blockId);
  if (status === "missing" || status === "denied") {
    return false;
  }

  onOpenPage(request);
  return true;
}

type PageLinkKeyEvent = {
  key: string;
  altKey?: boolean;
  shiftKey?: boolean;
  metaKey?: boolean;
  ctrlKey?: boolean;
  preventDefault: () => void;
};

// Enter on the selected page link opens it. It never inserts a break, even when the page cannot open.
export function onPageLinkKeyDown(editor: SlateEditor, event: PageLinkKeyEvent): boolean {
  if (editor.dom.readOnly === true || event.key !== "Enter") {
    return false;
  }

  if (event.altKey || event.shiftKey || event.metaKey || event.ctrlKey) {
    return false;
  }

  const entry = editor.api.above({
    match: (node) => ElementApi.isElement(node) && node.type === PAGE_LINK_KEY,
  });
  if (entry === undefined || !ElementApi.isElement(entry[0])) {
    return false;
  }

  const node: TElement = entry[0];
  const id = typeof node.id === "string" ? node.id : "";
  event.preventDefault();
  openPageLink(
    editor,
    {
      pageId: typeof node.pageId === "string" ? node.pageId : "",
      kind: storedPageLinkKind(node.kind),
    },
    id,
  );
  return true;
}
