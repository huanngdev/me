import { ElementApi, KEYS, type SlateEditor } from "platejs";

import { BOOKMARK_KEY } from "./editor-bookmark-url";
import { SYNCED_REF_KEY, findBlockById } from "./editor-synced-block";

export const BLOCK_HANDLE_GAP = 4;
export const BLOCK_HANDLE_PAD = 8;
export const BLOCK_HANDLE_WIDTH = 66;
export const BLOCK_HANDLE_HEIGHT = 32;

const ELIGIBLE = new Set<string>([
  KEYS.p,
  KEYS.h1,
  KEYS.h2,
  KEYS.h3,
  KEYS.blockquote,
  KEYS.callout,
  KEYS.toggle,
  KEYS.hr,
  BOOKMARK_KEY,
  KEYS.toc,
  KEYS.equation,
  SYNCED_REF_KEY,
  KEYS.codeBlock,
  KEYS.table,
  KEYS.columnGroup,
]);

export type HandleChainNode = {
  type: string;
  id: string;
  index: number;
  parentType: string | null;
};

export type BlockHandleTarget = {
  id: string;
  type: string;
};

export type BlockHandleHit = BlockHandleTarget & {
  path: number[];
};

export type BlockHandlePaint = {
  target: BlockHandleHit;
  top: number;
  left: number;
  width: number;
  height: number;
  blockLeft: number;
  blockTop: number;
  blockBottom: number;
};

const SUMMARY_ROW_PARENTS = new Set<string>([KEYS.toggle, KEYS.callout]);

function isSummaryRow(node: HandleChainNode): boolean {
  return node.index === 0 && node.parentType !== null && SUMMARY_ROW_PARENTS.has(node.parentType);
}

// Innermost eligible block under the pointer.
// Top-level blocks qualify. So do blocks inside containers: list items, toggle
// content, callout content, quote content, and column content.
// A toggle's first child is its summary row, so that row targets the toggle.
// A callout's first child shares the icon's line, so that row targets the callout.
// Later children target themselves. A later child inside a callout uses the
// callout's left edge for the gutter, so the handle stays outside the icon column.
// Hovering a container's own chrome (icon, chevron, padding, column gap) targets
// that block.
// The handle and its pointer bridge stay clear of document controls: the callout
// icon, the toggle chevron, a to-do checkbox, and block toolbars.
// A table cell or row targets the table. A code line targets the code block.
// A column is structural; hovering it targets the column group.
// The caller drops synced-block preview copies before building the chain.
export function blockHandleTarget(chain: readonly HandleChainNode[]): BlockHandleTarget | null {
  const table = chain.find((node) => node.type === KEYS.table);
  if (table) {
    return { id: table.id, type: table.type };
  }

  const code = chain.find((node) => node.type === KEYS.codeBlock);
  if (code) {
    return { id: code.id, type: code.type };
  }

  for (const node of chain) {
    if (isSummaryRow(node)) {
      continue;
    }
    if (!ELIGIBLE.has(node.type)) {
      continue;
    }
    return { id: node.id, type: node.type };
  }

  return null;
}

// Horizontal anchor for the gutter. The handle controls `targetId`; when that
// block sits inside a callout, the anchor is the callout so the buttons stay
// outside its box.
export function blockHandleGutterId(chain: readonly HandleChainNode[], targetId: string): string {
  const callout = chain.find((node) => node.type === KEYS.callout);
  if (callout && callout.id !== targetId) {
    return callout.id;
  }
  return targetId;
}

export function chainAtPath(editor: SlateEditor, path: number[]): HandleChainNode[] {
  const chain: HandleChainNode[] = [];
  let depth = path.length;
  const located = editor.api.node(path);
  if (!located || !ElementApi.isElement(located[0])) {
    depth -= 1;
  }

  for (; depth >= 1; depth -= 1) {
    const at = path.slice(0, depth);
    const entry = editor.api.node(at);
    if (!entry || !ElementApi.isElement(entry[0])) {
      continue;
    }

    const node = entry[0];
    if (typeof node.type !== "string" || typeof node.id !== "string" || node.id.length === 0) {
      continue;
    }

    const parentPath = at.slice(0, -1);
    let parentType: string | null = null;
    if (parentPath.length > 0) {
      const parent = editor.api.node(parentPath);
      if (parent && ElementApi.isElement(parent[0]) && typeof parent[0].type === "string") {
        parentType = parent[0].type;
      }
    }

    chain.push({
      type: node.type,
      id: node.id,
      index: at[at.length - 1] ?? 0,
      parentType,
    });
  }

  return chain;
}

export function targetBlockAtPath(editor: SlateEditor, path: number[]): BlockHandleHit | null {
  const target = blockHandleTarget(chainAtPath(editor, path));
  if (!target) {
    return null;
  }

  const entry = findBlockById(editor, target.id);
  if (!entry) {
    return null;
  }

  return { id: target.id, type: target.type, path: entry[1] };
}

function inPreview(element: Element): boolean {
  return element.closest("[data-preview-path]") !== null;
}

export function chainFromDom(editor: SlateEditor, start: Element): HandleChainNode[] {
  const chain: HandleChainNode[] = [];
  let current: Element | null = start;
  while (current) {
    if (current.hasAttribute("data-block-id") && !inPreview(current)) {
      const id = current.getAttribute("data-block-id");
      const entry = id === null || id.length === 0 ? undefined : findBlockById(editor, id);
      if (entry && typeof entry[0].type === "string" && typeof entry[0].id === "string") {
        const path = entry[1];
        const parentPath = path.slice(0, -1);
        let parentType: string | null = null;
        if (parentPath.length > 0) {
          const parent = editor.api.node(parentPath);
          if (parent && ElementApi.isElement(parent[0]) && typeof parent[0].type === "string") {
            parentType = parent[0].type;
          }
        }
        chain.push({
          type: entry[0].type,
          id: entry[0].id,
          index: path[path.length - 1] ?? 0,
          parentType,
        });
      }
    }
    current = current.parentElement;
  }

  return chain;
}

const TEXT_EDIT_KEYS = new Set(["Backspace", "Delete", "Enter"]);

export function isTypingKey(event: {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  isComposing?: boolean;
}): boolean {
  if (event.isComposing === true) {
    return true;
  }
  if (event.metaKey || event.ctrlKey || event.altKey) {
    return false;
  }
  if (TEXT_EDIT_KEYS.has(event.key)) {
    return true;
  }
  return event.key.length === 1;
}

export type HandleLineBox = {
  lineTop: number;
  lineHeight: number;
  blockLeft: number;
};

export type HandleFrame = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type HandleViewport = {
  width: number;
  height: number;
};

export type HandleSize = {
  width: number;
  height: number;
};

export type PlacedHandle = {
  top: number;
  left: number;
};

export function placeBlockHandle(
  line: HandleLineBox,
  handle: HandleSize,
  viewport: HandleViewport,
  frame: HandleFrame | null,
): PlacedHandle | null {
  const top = line.lineTop + line.lineHeight / 2 - handle.height / 2;
  const left = line.blockLeft - BLOCK_HANDLE_GAP - handle.width;
  const right = left + handle.width;
  const bottom = top + handle.height;

  if (left < BLOCK_HANDLE_PAD || top < BLOCK_HANDLE_PAD) {
    return null;
  }
  if (right > viewport.width - BLOCK_HANDLE_PAD || bottom > viewport.height - BLOCK_HANDLE_PAD) {
    return null;
  }
  if (right > line.blockLeft - 1) {
    return null;
  }

  if (frame) {
    const lineBottom = line.lineTop + line.lineHeight;
    const lineVisible = lineBottom > frame.top && line.lineTop < frame.bottom;
    if (!lineVisible) {
      return null;
    }
    if (top < frame.top || bottom > frame.bottom || left < frame.left || right > frame.right) {
      return null;
    }
  }

  return { top, left };
}

export function handleCoversForeignBlock(
  hitId: string | null,
  chainIds: readonly string[],
): boolean {
  if (hitId === null || hitId.length === 0) {
    return false;
  }
  return !chainIds.includes(hitId);
}

export type HandleUiState = {
  typing: boolean;
  pointerId: string | null;
  caretId: string | null;
  engagedId: string | null;
  readOnly: boolean;
  hoverNone: boolean;
};

export type HandleUiEvent =
  | { type: "pointer-move"; id: string | null; engagedId: string | null }
  | { type: "caret"; id: string | null }
  | { type: "typing"; typing: boolean }
  | { type: "engage"; id: string | null }
  | { type: "read-only"; value: boolean }
  | { type: "hover-none"; value: boolean };

export function initialHandleUi(readOnly = false, hoverNone = false): HandleUiState {
  return {
    typing: false,
    pointerId: null,
    caretId: null,
    engagedId: null,
    readOnly,
    hoverNone,
  };
}

export function reduceHandleUi(state: HandleUiState, event: HandleUiEvent): HandleUiState {
  switch (event.type) {
    case "pointer-move":
      if (
        state.pointerId === event.id &&
        state.engagedId === event.engagedId &&
        state.typing === false
      ) {
        return state;
      }
      return { ...state, typing: false, pointerId: event.id, engagedId: event.engagedId };
    case "caret":
      if (state.caretId === event.id) {
        return state;
      }
      return { ...state, caretId: event.id };
    case "typing":
      if (state.typing === event.typing) {
        return state;
      }
      return { ...state, typing: event.typing };
    case "engage":
      if (state.engagedId === event.id) {
        return state;
      }
      return { ...state, engagedId: event.id };
    case "read-only":
      if (state.readOnly === event.value) {
        return state;
      }
      return { ...state, readOnly: event.value };
    case "hover-none":
      if (state.hoverNone === event.value) {
        return state;
      }
      return { ...state, hoverNone: event.value };
    default:
      return state;
  }
}

export function visibleHandleId(state: HandleUiState): string | null {
  if (state.readOnly || state.hoverNone) {
    return null;
  }
  if (state.engagedId) {
    return state.engagedId;
  }
  if (state.typing) {
    return null;
  }
  return state.pointerId ?? state.caretId;
}
