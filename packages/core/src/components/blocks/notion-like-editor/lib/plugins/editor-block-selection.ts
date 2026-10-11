import {
  ElementApi,
  PathApi,
  RangeApi,
  createSlatePlugin,
  type SlateEditor,
  type TElement,
} from "platejs";
import { toPlatePlugin } from "platejs/react";

import { runEditorCommand, type EditorCommand } from "../commands/editor-commands";
import { blockDropDecision, moveBlockAt } from "../features/editor-block-drop";
import { targetBlockAtPath } from "../features/editor-block-handle";
import { cloneWithFreshIds, collectIds, deleteBlockAt } from "../features/editor-block-menu";
import {
  adjacentBlockId,
  blockRun,
  caretLanding,
  normalizeBlockIds,
  runMoveTarget,
  selectionCoversBlock,
  topLevelBlockIds,
  type BlockRun,
} from "../features/editor-block-selection";
import { findBlockById } from "../features/editor-synced-block";
import { slashMenuOpen } from "./editor-slash";

export const BLOCK_SELECTION_PRIORITY = 3000;
export const BLOCK_SELECTION_ENTER_PRIORITY = 50;

type SelectionOptions = {
  ids: string[];
  anchorId: string;
  focusId: string;
  caretPath: number[] | null;
  caretOffset: number;
};

type KeyEvent = {
  key: string;
  code?: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  defaultPrevented?: boolean;
  preventDefault: () => void;
};

const EMPTY: SelectionOptions = {
  ids: [],
  anchorId: "",
  focusId: "",
  caretPath: null,
  caretOffset: 0,
};

function selectionOptions(): SelectionOptions {
  return { ...EMPTY, ids: [] };
}

function modKey(event: { metaKey: boolean; ctrlKey: boolean }): boolean {
  return event.metaKey !== event.ctrlKey;
}

function read(editor: SlateEditor): SelectionOptions {
  return {
    ids: [...editor.getOption(blockSelectionPlugin, "ids")],
    anchorId: editor.getOption(blockSelectionPlugin, "anchorId"),
    focusId: editor.getOption(blockSelectionPlugin, "focusId"),
    caretPath: editor.getOption(blockSelectionPlugin, "caretPath"),
    caretOffset: editor.getOption(blockSelectionPlugin, "caretOffset"),
  };
}

function write(editor: SlateEditor, next: SelectionOptions): void {
  editor.setOption(blockSelectionPlugin, "ids", [...next.ids]);
  editor.setOption(blockSelectionPlugin, "anchorId", next.anchorId);
  editor.setOption(blockSelectionPlugin, "focusId", next.focusId);
  editor.setOption(blockSelectionPlugin, "caretPath", next.caretPath);
  editor.setOption(blockSelectionPlugin, "caretOffset", next.caretOffset);
}

export function blockSelectionIds(editor: SlateEditor): readonly string[] {
  return editor.getOption(blockSelectionPlugin, "ids");
}

export function blockSelectionActive(editor: SlateEditor): boolean {
  return blockSelectionIds(editor).length > 0;
}

function rememberCaret(editor: SlateEditor, state: SelectionOptions): SelectionOptions {
  const selection = editor.selection;
  if (!selection || !RangeApi.isCollapsed(selection) || state.ids.length > 0) {
    return state;
  }
  return {
    ...state,
    caretPath: [...selection.anchor.path],
    caretOffset: selection.anchor.offset,
  };
}

function hideCaret(editor: SlateEditor): void {
  editor.tf.withoutSaving(() => {
    editor.tf.deselect();
  });
  const editable = editor.api.toDOMNode(editor.children[0] ?? { text: "" });
  const root = editable?.closest("[data-slate-editor]");
  if (root instanceof HTMLElement) {
    root.focus({ preventScroll: true });
  }
  window.getSelection()?.removeAllRanges();
}

function scrollBlockIntoView(editor: SlateEditor, id: string): void {
  const entry = findBlockById(editor, id);
  if (!entry) {
    return;
  }
  const dom: unknown = editor.api.toDOMNode(entry[0]);
  if (dom instanceof HTMLElement) {
    dom.scrollIntoView({ block: "nearest" });
  }
}

export function setBlockSelection(
  editor: SlateEditor,
  ids: readonly string[],
  edge?: { anchorId?: string; focusId?: string; scroll?: boolean },
): string[] {
  if (editor.dom.readOnly === true) {
    return [];
  }
  const normalized = normalizeBlockIds(editor, ids);
  const current = read(editor);
  const remembered = rememberCaret(editor, current);
  if (normalized.length === 0) {
    write(editor, { ...EMPTY, ids: [] });
    return [];
  }
  const anchorId =
    edge?.anchorId && normalized.includes(edge.anchorId) ? edge.anchorId : (normalized[0] ?? "");
  const focusId =
    edge?.focusId && normalized.includes(edge.focusId)
      ? edge.focusId
      : (normalized[normalized.length - 1] ?? anchorId);
  write(editor, { ...remembered, ids: normalized, anchorId, focusId });
  hideCaret(editor);
  const focus = normalized.includes(focusId) ? focusId : normalized[normalized.length - 1];
  if (edge?.scroll && focus) {
    scrollBlockIntoView(editor, focus);
  }
  return normalized;
}

// A click updates the DOM selection before Slate's onSelect copies it onto
// editor.selection. Read the DOM when the editor has no selection yet.
export function readLiveSelection(editor: SlateEditor): SlateEditor["selection"] {
  if (editor.selection) {
    return editor.selection;
  }
  if (typeof window === "undefined" || typeof window.getSelection !== "function") {
    return null;
  }
  const dom = window.getSelection();
  if (!dom || dom.rangeCount === 0 || !dom.anchorNode) {
    return null;
  }
  const anchor = dom.anchorNode instanceof Element ? dom.anchorNode : dom.anchorNode.parentElement;
  if (!anchor?.closest("[data-slate-editor]")) {
    return null;
  }
  const converter = Reflect.get(editor.api, "toSlateRange") as
    ((domRange: Range) => SlateEditor["selection"]) | undefined;
  if (typeof converter !== "function") {
    return null;
  }
  try {
    const range = converter(dom.getRangeAt(0));
    if (!range) {
      return null;
    }
    editor.tf.withoutSaving(() => {
      editor.tf.select(range);
    });
    return editor.selection ?? range;
  } catch {
    return null;
  }
}

export function clearBlockSelection(editor: SlateEditor, restoreCaret: boolean): void {
  const state = read(editor);
  write(editor, { ...EMPTY, ids: [] });
  if (!restoreCaret || state.ids.length === 0) {
    return;
  }
  const saved = state.caretPath;
  const savedNode = saved ? editor.api.node(saved) : undefined;
  if (saved && savedNode) {
    editor.tf.withoutSaving(() => {
      editor.tf.select({ path: [...saved], offset: state.caretOffset });
    });
    return;
  }
  const first = state.ids[0];
  const entry = first ? findBlockById(editor, first) : undefined;
  const start = entry ? editor.api.start(entry[1]) : undefined;
  if (start) {
    editor.tf.withoutSaving(() => {
      editor.tf.select(start);
    });
  }
}

function runOf(editor: SlateEditor): BlockRun | null {
  return blockRun(editor, blockSelectionIds(editor));
}

function placePoint(editor: SlateEditor, path: number[], edge: "start" | "end"): void {
  const point = edge === "end" ? editor.api.end(path) : editor.api.start(path);
  if (point) {
    editor.tf.select(point);
  }
}

export const deleteBlocks: EditorCommand<{ parent: number[]; start: number; end: number }> = {
  id: "block.selection.delete",
  label: "Delete blocks",
  group: "action",
  run: (editor, payload) => {
    const siblings =
      payload.parent.length === 0
        ? editor.children
        : (() => {
            const parent = editor.api.node(payload.parent);
            const node = parent?.[0];
            return parent && ElementApi.isElement(node) ? node.children : [];
          })();
    const landing = caretLanding(
      siblings.length,
      payload.start,
      payload.end,
      payload.parent.length === 0,
    );
    clearBlockSelection(editor, false);
    for (let index = payload.end - 1; index >= payload.start; index -= 1) {
      if (index === payload.start) {
        deleteBlockAt(editor, [...payload.parent, payload.start]);
      } else {
        editor.tf.removeNodes({ at: [...payload.parent, index] });
      }
    }
    if (landing === "previous-end") {
      placePoint(editor, [...payload.parent, payload.start - 1], "end");
    }
  },
};

export const duplicateBlocks: EditorCommand<{ parent: number[]; start: number; end: number }> = {
  id: "block.selection.duplicate",
  label: "Duplicate blocks",
  group: "action",
  run: (editor, payload) => {
    const seen = collectIds(editor);
    const copies: TElement[] = [];
    for (let index = payload.start; index < payload.end; index += 1) {
      const entry = editor.api.node([...payload.parent, index]);
      const node = entry?.[0];
      if (!entry || !ElementApi.isElement(node)) {
        return;
      }
      copies.push(cloneWithFreshIds(node, seen));
    }
    let at = [...payload.parent, payload.end];
    for (const copy of copies) {
      editor.tf.insertNodes(copy, { at, select: false });
      const next = PathApi.next(at);
      if (!next) {
        return;
      }
      at = next;
    }
    const ids = copies.map((node) => {
      const id: unknown = Reflect.get(node, "id");
      return typeof id === "string" ? id : "";
    });
    setBlockSelection(editor, ids);
  },
};

export const moveBlocks: EditorCommand<{
  from: number[];
  to: number[];
  span: readonly [number, number];
}> = {
  id: "block.selection.move",
  label: "Move blocks",
  group: "action",
  run: (editor, payload) => {
    const ids = [...blockSelectionIds(editor)];
    moveBlockAt(editor, payload.from, payload.to, payload.span);
    if (ids.length > 0) {
      setBlockSelection(editor, ids);
    }
  },
};

export function moveSelectedBlocks(editor: SlateEditor, direction: "up" | "down"): boolean {
  const run = runOf(editor);
  if (!run) {
    return false;
  }
  const step = runMoveTarget(editor, run, direction);
  if (!step.ok) {
    return false;
  }
  return runEditorCommand(editor, moveBlocks, {
    from: [...run.parent, run.start],
    to: step.to,
    span: [run.start, run.end],
  });
}

export function deleteSelectedBlocks(editor: SlateEditor): boolean {
  const run = runOf(editor);
  if (!run) {
    return false;
  }
  return runEditorCommand(editor, deleteBlocks, {
    parent: [...run.parent],
    start: run.start,
    end: run.end,
  });
}

export function duplicateSelectedBlocks(editor: SlateEditor): boolean {
  const run = runOf(editor);
  if (!run) {
    return false;
  }
  return runEditorCommand(editor, duplicateBlocks, {
    parent: [...run.parent],
    start: run.start,
    end: run.end,
  });
}

function fragmentRange(editor: SlateEditor, run: BlockRun): void {
  const start = editor.api.start([...run.parent, run.start]);
  const end = editor.api.end([...run.parent, run.end - 1]);
  if (!start || !end) {
    return;
  }
  editor.tf.withoutSaving(() => {
    editor.tf.select({ anchor: start, focus: end });
  });
}

export function writeBlockFragment(editor: SlateEditor, data: DataTransfer): boolean {
  const run = runOf(editor);
  if (!run) {
    return false;
  }
  const previous = editor.selection;
  suspendPrune += 1;
  try {
    fragmentRange(editor, run);
    const fragment = editor.api.getFragment();
    const encoded = window.btoa(encodeURIComponent(JSON.stringify(fragment)));
    const rendered = editor.api.toDOMNode(editor.children[0] ?? { text: "" });
    const writer = Reflect.get(editor, "setFragmentData");
    if (rendered && typeof writer === "function") {
      try {
        writer.call(editor, data);
      } catch {
        data.setData("application/x-slate-fragment", encoded);
      }
    }
    if (data.getData("application/x-slate-fragment").length === 0) {
      data.setData("application/x-slate-fragment", encoded);
    }
    editor.tf.withoutSaving(() => {
      if (previous) {
        editor.tf.select(previous);
      } else {
        editor.tf.deselect();
      }
    });
  } finally {
    suspendPrune -= 1;
  }
  return true;
}

function cutSelectedBlocks(editor: SlateEditor, data: DataTransfer): boolean {
  if (!writeBlockFragment(editor, data)) {
    return false;
  }
  return deleteSelectedBlocks(editor);
}

function selectUnitText(editor: SlateEditor, path: number[]): void {
  const start = editor.api.start(path);
  const end = editor.api.end(path);
  if (start && end) {
    editor.tf.select({ anchor: start, focus: end });
  }
}

function pressedModA(editor: SlateEditor, event: KeyEvent): boolean {
  if (!modKey(event) || event.altKey || event.shiftKey || event.key.toLowerCase() !== "a") {
    return false;
  }
  if (blockSelectionActive(editor)) {
    event.preventDefault();
    setBlockSelection(editor, topLevelBlockIds(editor));
    return true;
  }
  const selection = readLiveSelection(editor);
  if (!selection) {
    return false;
  }
  const hit = targetBlockAtPath(editor, selection.anchor.path);
  if (!hit) {
    return false;
  }
  const focusHit = targetBlockAtPath(editor, selection.focus.path);
  if (!focusHit || focusHit.id !== hit.id) {
    return false;
  }
  const covered = selectionCoversBlock(editor, hit.path);
  event.preventDefault();
  if (covered === "covered" || covered === "empty") {
    setBlockSelection(editor, topLevelBlockIds(editor));
    return true;
  }
  selectUnitText(editor, hit.path);
  return true;
}

function historyKey(event: KeyEvent): boolean {
  if (!modKey(event) || event.altKey) {
    return false;
  }
  const key = event.key.toLowerCase();
  return key === "z" || key === "y";
}

function dragInProgress(): boolean {
  return typeof document !== "undefined" && document.body.hasAttribute("data-block-dragging");
}

function escapeConsumedByUi(): boolean {
  if (typeof document === "undefined") {
    return false;
  }
  return (
    document.querySelector(
      "[data-block-menu], [data-block-add-menu], [data-slash-menu], [data-link-popover], [data-bookmark-url-popover]",
    ) !== null
  );
}

function moveCaretToEndOfFirst(editor: SlateEditor): void {
  const run = runOf(editor);
  const first = run ? editor.api.node([...run.parent, run.start]) : undefined;
  const node = first?.[0];
  clearBlockSelection(editor, false);
  if (!first || !ElementApi.isElement(node)) {
    return;
  }
  if (editor.api.isVoid(node)) {
    editor.tf.select(first[1]);
    return;
  }
  placePoint(editor, [...first[1]], "end");
}

export function onBlockSelectionKeyDown(editor: SlateEditor, event: KeyEvent): boolean {
  if (editor.dom.readOnly === true) {
    return false;
  }
  if (pressedModA(editor, event)) {
    return true;
  }
  if (!blockSelectionActive(editor)) {
    return false;
  }
  if (historyKey(event)) {
    return false;
  }
  if (dragInProgress() && event.key === "Escape") {
    event.preventDefault();
    return true;
  }
  const key = event.key;
  const mod = modKey(event);
  if (key === "ArrowUp" || key === "ArrowDown") {
    if (mod && event.altKey && event.shiftKey) {
      event.preventDefault();
      moveSelectedBlocks(editor, key === "ArrowUp" ? "up" : "down");
      return true;
    }
    if (mod || event.altKey) {
      event.preventDefault();
      return true;
    }
    const state = read(editor);
    const direction = key === "ArrowUp" ? "up" : "down";
    if (event.shiftKey) {
      const from = state.focusId || state.ids[state.ids.length - 1] || state.ids[0];
      const next = from ? (adjacentBlockId(editor, from, direction) ?? from) : from;
      if (from && next) {
        event.preventDefault();
        setBlockSelection(editor, [state.anchorId || from, next], {
          anchorId: state.anchorId || from,
          focusId: next,
          scroll: true,
        });
      }
      return true;
    }
    const edge = direction === "up" ? state.ids[0] : state.ids[state.ids.length - 1];
    const next = edge ? (adjacentBlockId(editor, edge, direction) ?? edge) : edge;
    if (next) {
      event.preventDefault();
      setBlockSelection(editor, [next], { scroll: true });
    }
    return true;
  }
  if (key === "Enter" && !mod && !event.shiftKey && !event.altKey) {
    event.preventDefault();
    moveCaretToEndOfFirst(editor);
    return true;
  }
  if (key === "Escape") {
    event.preventDefault();
    clearBlockSelection(editor, true);
    return true;
  }
  if (key === "Backspace" || key === "Delete") {
    event.preventDefault();
    deleteSelectedBlocks(editor);
    return true;
  }
  if (mod && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "d") {
    event.preventDefault();
    duplicateSelectedBlocks(editor);
    return true;
  }
  if (mod && event.shiftKey && event.altKey && (key === "ArrowUp" || key === "ArrowDown")) {
    event.preventDefault();
    moveSelectedBlocks(editor, key === "ArrowUp" ? "up" : "down");
    return true;
  }
  if (mod && !event.altKey && !event.shiftKey && (event.key === "/" || event.code === "Slash")) {
    event.preventDefault();
    return true;
  }
  if (
    mod &&
    !event.altKey &&
    !event.shiftKey &&
    (event.key.toLowerCase() === "c" || event.key.toLowerCase() === "x")
  ) {
    return true;
  }
  if (key === "Tab") {
    event.preventDefault();
    return true;
  }
  if (key.length === 1 && !mod) {
    event.preventDefault();
    return true;
  }
  event.preventDefault();
  return true;
}

export function onBlockSelectionEnterKeyDown(editor: SlateEditor, event: KeyEvent): boolean {
  if (event.key !== "Escape" || event.defaultPrevented || editor.dom.readOnly === true) {
    return false;
  }
  if (blockSelectionActive(editor) || slashMenuOpen(editor) || escapeConsumedByUi()) {
    return false;
  }
  const selection = readLiveSelection(editor);
  if (!selection || !RangeApi.isCollapsed(selection)) {
    return false;
  }
  const hit = targetBlockAtPath(editor, selection.anchor.path);
  if (!hit) {
    return false;
  }
  event.preventDefault();
  setBlockSelection(editor, [hit.id]);
  return true;
}

export function onBlockSelectionCopy(
  editor: SlateEditor,
  event: { preventDefault: () => void; clipboardData: DataTransfer | null },
): boolean {
  if (!blockSelectionActive(editor) || !event.clipboardData) {
    return false;
  }
  event.preventDefault();
  return writeBlockFragment(editor, event.clipboardData);
}

export function onBlockSelectionCut(
  editor: SlateEditor,
  event: { preventDefault: () => void; clipboardData: DataTransfer | null },
): boolean {
  if (!blockSelectionActive(editor) || !event.clipboardData) {
    return false;
  }
  event.preventDefault();
  return cutSelectedBlocks(editor, event.clipboardData);
}

let suspendPrune = 0;

function prune(editor: SlateEditor): void {
  if (suspendPrune > 0) {
    return;
  }
  const ids = blockSelectionIds(editor);
  if (ids.length === 0) {
    return;
  }
  const selection = editor.selection;
  if (selection && !RangeApi.isCollapsed(selection)) {
    clearBlockSelection(editor, false);
    return;
  }
  const next = normalizeBlockIds(editor, ids);
  if (next.length === 0) {
    write(editor, { ...EMPTY, ids: [] });
    return;
  }
  if (next.join("\n") !== ids.join("\n")) {
    const state = read(editor);
    write(editor, {
      ...state,
      ids: next,
      anchorId: next.includes(state.anchorId) ? state.anchorId : (next[0] ?? ""),
      focusId: next.includes(state.focusId) ? state.focusId : (next[next.length - 1] ?? ""),
    });
  }
}

const selectionBase = createSlatePlugin({
  key: "blockSelection",
  priority: BLOCK_SELECTION_PRIORITY,
  options: selectionOptions(),
});

export const blockSelectionWatchPlugin = createSlatePlugin({
  key: "blockSelectionWatch",
  priority: 0,
}).overrideEditor(({ editor }) => {
  const apply = editor.apply as (operation: { type: string }) => void;
  editor.apply = (operation: { type: string }) => {
    apply(operation);
    if (
      operation.type === "remove_node" ||
      operation.type === "insert_node" ||
      operation.type === "move_node" ||
      operation.type === "set_selection"
    ) {
      prune(editor);
    }
  };
  return { transforms: {} };
});

export const blockSelectionPlugin = toPlatePlugin(selectionBase, {
  handlers: {
    onKeyDown: ({ editor, event }) => onBlockSelectionKeyDown(editor, event),
    onCopy: ({ editor, event }) => onBlockSelectionCopy(editor, event),
    onCut: ({ editor, event }) => onBlockSelectionCut(editor, event),
    onBeforeInput: ({ editor, event }) => {
      if (!blockSelectionActive(editor)) {
        return false;
      }
      event.preventDefault();
      return true;
    },
  },
});

export const blockSelectionEnterPlugin = toPlatePlugin(
  createSlatePlugin({
    key: "blockSelectionEnter",
    priority: BLOCK_SELECTION_ENTER_PRIORITY,
  }),
  {
    handlers: {
      onKeyDown: ({ editor, event }) => onBlockSelectionEnterKeyDown(editor, event),
    },
  },
);

export function selectedRunDrop(
  editor: SlateEditor,
  path: readonly number[],
): { from: number[]; span?: readonly [number, number] } {
  const run = runOf(editor);
  const index = path[path.length - 1] ?? 0;
  if (
    !run ||
    index < run.start ||
    index >= run.end ||
    path.slice(0, -1).join(".") !== run.parent.join(".")
  ) {
    return { from: [...path] };
  }
  return { from: [...run.parent, run.start], span: [run.start, run.end] };
}

export function runDropAllowed(
  editor: SlateEditor,
  from: readonly number[],
  span: readonly [number, number] | undefined,
  to: readonly number[],
): boolean {
  const toIndex = to[to.length - 1];
  if (toIndex === undefined) {
    return false;
  }
  const decision = blockDropDecision(editor.children, from, to.slice(0, -1), toIndex, span);
  return decision.allowed && !decision.noop;
}
