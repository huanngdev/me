import { PathApi, RangeApi, type SlateEditor } from "platejs";

import { FIND_QUERY_MAX } from "../features/editor-find";
import { blockSelectionActive } from "./editor-block-selection";
import { findPlugin, openFind, revealFindMatch, setFindQuery } from "./editor-find";

type FindKeyEvent = {
  key: string;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
};

export function isMacPlatform(): boolean {
  return typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform);
}

// Cmd+F on macOS, Ctrl+F elsewhere. Shift or Alt makes it another shortcut.
export function isFindOpenKey(event: FindKeyEvent, mac: boolean): boolean {
  if (event.key.toLowerCase() !== "f" || event.shiftKey || event.altKey) {
    return false;
  }

  return mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
}

// The selected text, when it sits inside one block and fits in a query.
export function selectionFindQuery(editor: SlateEditor): string | undefined {
  const selection = editor.selection;
  if (selection === null || RangeApi.isCollapsed(selection)) {
    return undefined;
  }

  const start = editor.api.block({ at: RangeApi.start(selection) });
  const end = editor.api.block({ at: RangeApi.end(selection) });
  if (start === undefined || end === undefined || !PathApi.equals(start[1], end[1])) {
    return undefined;
  }

  const text = editor.api.string(selection);
  return text.length > 0 && text.length <= FIND_QUERY_MAX ? text : undefined;
}

export type FindOpenEvent = FindKeyEvent & {
  defaultPrevented: boolean;
  preventDefault: () => void;
};

// Mod+F in the editor opens the bar with the selection as the query, and asks the bar for focus.
// The bar attaches it to the editable element, so it also works in a read-only editor.
export function onFindKeyDown(editor: SlateEditor, event: FindOpenEvent): void {
  if (event.defaultPrevented || !isFindOpenKey(event, isMacPlatform())) {
    return;
  }

  event.preventDefault();
  const query = blockSelectionActive(editor) ? undefined : selectionFindQuery(editor);
  if (query !== undefined) {
    setFindQuery(editor, query);
  }
  openFind(editor);
  revealFindMatch(editor);
  editor.setOption(findPlugin, "focusRequest", editor.getOption(findPlugin, "focusRequest") + 1);
}

type Box = { top: number; bottom: number; left: number; right: number };

// The find bar covers the top of the scroll area, so a match there is not counted as visible.
export const FIND_BAR_TOP_INSET = 96;

// Whether a match box is fully inside the scroll area, below the bar's band.
export function isHighlightVisible(rect: Box, container: Box): boolean {
  return (
    rect.top >= container.top + FIND_BAR_TOP_INSET &&
    rect.bottom <= container.bottom &&
    rect.left >= container.left &&
    rect.right <= container.right
  );
}
