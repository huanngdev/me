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

// Blocks whose first line of text lives inside a widget (KaTeX, table grid,
// code editor, columns, a preview) or that paint no editable text at all.
// Their handle anchors to the block's top edge instead of the block's middle,
// so a tall equation never gets the handle at its center or bottom.
export const HANDLE_TOP_ANCHOR_TYPES = new Set<string>([
  KEYS.equation,
  KEYS.hr,
  BOOKMARK_KEY,
  KEYS.table,
  KEYS.codeBlock,
  KEYS.toc,
  KEYS.columnGroup,
  SYNCED_REF_KEY,
  KEYS.callout,
  KEYS.toggle,
]);

// First-line height of body text. A widget-anchored block gets the handle's
// center one body line below its top edge, matching a normal paragraph.
export const BODY_LINE_HEIGHT_PX = 24;

export type HandleTextBox = { top: number; height: number } | null;

export type HandleAnchor = { lineTop: number; lineHeight: number };

// The vertical anchor for the handle. A plain text block centers on its first
// text line. A widget-anchored block (or one with no measured line) sits on its
// top edge with the handle center on the first body line.
export function handleAnchorLine(
  type: string,
  block: { top: number; bottom: number },
  textLine: HandleTextBox,
  bodyLineHeight = BODY_LINE_HEIGHT_PX,
): HandleAnchor {
  if (textLine && textLine.height > 0 && !HANDLE_TOP_ANCHOR_TYPES.has(type)) {
    return { lineTop: textLine.top, lineHeight: textLine.height };
  }
  const height =
    bodyLineHeight > 0 ? bodyLineHeight : Math.max(0, block.bottom - block.top) || bodyLineHeight;
  return { lineTop: block.top, lineHeight: height };
}

// One vertical band per rendered target block. The bands are how the handle
// keeps a target in the gaps between blocks, where no element is hit.
export type HandleBand = {
  id: string;
  path: number[];
  top: number;
  bottom: number;
};

// The target block for a pointer Y inside the editor: the nearest band by
// vertical distance, ties going to the block below. The current target is kept
// within `hysteresisPx` of its band so crossing the boundary does not flicker.
export function pickHandleBandAtY(
  bands: readonly HandleBand[],
  y: number,
  currentId: string | null,
  hysteresisPx = 6,
): HandleBand | null {
  if (bands.length === 0) {
    return null;
  }
  if (currentId !== null) {
    const held = bands.find((band) => band.id === currentId);
    if (held && y >= held.top - hysteresisPx && y <= held.bottom + hysteresisPx) {
      return held;
    }
  }
  let best: HandleBand | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const band of bands) {
    const distance = y < band.top ? band.top - y : y > band.bottom ? y - band.bottom : 0;
    if (
      distance < bestDistance ||
      (distance === bestDistance && best !== null && band.top > best.top)
    ) {
      best = band;
      bestDistance = distance;
    }
  }
  return best;
}

// Reorder the target list so the input order does not matter for the outcome.
export function sortHandleBands(bands: readonly HandleBand[]): HandleBand[] {
  return [...bands].sort((left, right) => left.top - right.top);
}

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

// Containers whose left border the handle must stay outside of. A block nested
// in one of these anchors to the container's left edge, so the buttons never sit
// on the container's border, background edge, icon, chevron or checkbox.
const GUTTER_CONTAINERS = new Set<string>([KEYS.blockquote, KEYS.callout, KEYS.toggle]);

// Horizontal anchor for the gutter. The handle controls `targetId`. A block
// nested in a quote, callout or toggle anchors to the left edge of its
// **outermost** such container, so a paragraph in a callout in a quote is also
// outside the quote. A column is the exception: a block in a column anchors to
// the column's left edge (the page gutter is not next to the right column), and
// that wins even when the column itself sits inside a quote/callout/toggle.
// The chain is innermost-first, so the last container seen is the outermost and
// the first column seen is the innermost column the target sits in.
export function blockHandleGutterId(chain: readonly HandleChainNode[], targetId: string): string {
  let anchorId = targetId;
  for (const node of chain) {
    if (node.type === KEYS.column) {
      return node.id;
    }
    if (GUTTER_CONTAINERS.has(node.type)) {
      anchorId = node.id;
    }
  }
  return anchorId;
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
  pointerOutside: boolean;
  caretId: string | null;
  engagedId: string | null;
  readOnly: boolean;
  hoverNone: boolean;
};

export type HandleUiEvent =
  | { type: "pointer-move"; id: string | null; engagedId: string | null; outside?: boolean }
  | { type: "caret"; id: string | null }
  | { type: "typing"; typing: boolean }
  | { type: "engage"; id: string | null }
  | { type: "read-only"; value: boolean }
  | { type: "hover-none"; value: boolean };

export function initialHandleUi(readOnly = false, hoverNone = false): HandleUiState {
  return {
    typing: false,
    pointerId: null,
    pointerOutside: false,
    caretId: null,
    engagedId: null,
    readOnly,
    hoverNone,
  };
}

export function reduceHandleUi(state: HandleUiState, event: HandleUiEvent): HandleUiState {
  switch (event.type) {
    case "pointer-move": {
      const outside = event.outside ?? false;
      if (
        state.pointerId === event.id &&
        state.engagedId === event.engagedId &&
        state.pointerOutside === outside &&
        state.typing === false
      ) {
        return state;
      }
      return {
        ...state,
        typing: false,
        pointerId: event.id,
        pointerOutside: outside,
        engagedId: event.engagedId,
      };
    }
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

// Set for the whole grip press, including the pixels before the drag threshold.
// Pointer moves in that window must not retarget the handle.
let blockDragArmed = false;

export function setBlockDragArmed(armed: boolean): void {
  blockDragArmed = armed;
}

export function isBlockDragArmed(): boolean {
  return blockDragArmed;
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
  // The pointer owns the target for as long as it is over the editor. Leaving
  // the editor hides the handle rather than falling back to the model caret.
  if (state.pointerOutside) {
    return null;
  }
  return state.pointerId ?? state.caretId;
}
