import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ElementApi, type Descendant, type SlateEditor } from "platejs";
import { useEditorRef } from "platejs/react";

import { moveBlock, runEditorCommand } from "../../lib/commands/editor-commands";
import {
  blockDropDecision,
  captureEditorScroll,
  dragPastThreshold,
  listItemUnit,
  resolveDropIndicator,
  type DropBand,
  type DropIndicator,
} from "../../lib/features/editor-block-drop";
import { setBlockDragArmed, type BlockHandleHit } from "../../lib/features/editor-block-handle";
import { findBlockById } from "../../lib/features/editor-synced-block";
import { retainScroll } from "./block-toolbar";

const EDGE_PX = 48;
const SCROLL_STEP_PX = 14;
const SOURCE_DIM = "opacity-40";

type SavedSelection = SlateEditor["selection"];

type DragSession = {
  path: number[];
  id: string;
  x: number;
  y: number;
  pointerX: number;
  pointerY: number;
  dragging: boolean;
  selection: SavedSelection;
};

function cloneSelection(selection: SavedSelection): SavedSelection {
  if (!selection) {
    return null;
  }
  return {
    anchor: { path: [...selection.anchor.path], offset: selection.anchor.offset },
    focus: { path: [...selection.focus.path], offset: selection.focus.offset },
  };
}

function sameSelection(left: SavedSelection, right: SavedSelection): boolean {
  if (!left || !right) {
    return left === right;
  }
  return (
    left.anchor.offset === right.anchor.offset &&
    left.focus.offset === right.focus.offset &&
    left.anchor.path.join(".") === right.anchor.path.join(".") &&
    left.focus.path.join(".") === right.focus.path.join(".")
  );
}

function elementIdOf(node: Descendant | undefined): string {
  if (!node || !ElementApi.isElement(node)) {
    return "";
  }
  const id: unknown = Reflect.get(node, "id");
  return typeof id === "string" ? id : "";
}

function movingBlockIds(editor: SlateEditor, path: readonly number[]): string[] {
  const index = path[path.length - 1];
  if (index === undefined) {
    return [];
  }
  const parentPath = path.slice(0, -1);
  let siblings: readonly Descendant[] | null = null;
  if (parentPath.length === 0) {
    siblings = editor.children;
  } else {
    const entry = editor.api.node(parentPath);
    const node = entry?.[0];
    if (entry && ElementApi.isElement(node)) {
      siblings = node.children;
    }
  }
  if (!siblings) {
    return [];
  }
  const [start, end] = listItemUnit(siblings, index);
  const ids: string[] = [];
  for (let cursor = start; cursor < end; cursor += 1) {
    const id = elementIdOf(siblings[cursor]);
    if (id.length > 0) {
      ids.push(id);
    }
  }
  return ids;
}

function samePoint(
  selection: SavedSelection,
  point: { path: readonly number[]; offset: number },
): boolean {
  if (!selection) {
    return false;
  }
  const anchor = selection.anchor;
  const focus = selection.focus;
  if (anchor.offset !== point.offset || focus.offset !== point.offset) {
    return false;
  }
  if (anchor.path.length !== point.path.length || focus.path.length !== point.path.length) {
    return false;
  }
  for (let index = 0; index < point.path.length; index += 1) {
    if (anchor.path[index] !== point.path[index] || focus.path[index] !== point.path[index]) {
      return false;
    }
  }
  return true;
}

function placeMovedCaret(editor: SlateEditor, id: string): void {
  const landed = findBlockById(editor, id);
  if (!landed) {
    return;
  }
  const point = editor.api.start(landed[1]);
  if (!point) {
    return;
  }
  if (!samePoint(editor.selection, point)) {
    editor.tf.withoutSaving(() => {
      editor.tf.select(point);
    });
  }
  const dom: unknown = editor.api.toDOMNode(landed[0]);
  if (!(dom instanceof HTMLElement)) {
    return;
  }
  const range = editor.api.toDOMRange({ anchor: point, focus: point });
  if (!range) {
    return;
  }
  editor.tf.focus();
  if (!samePoint(editor.selection, point)) {
    editor.tf.withoutSaving(() => {
      editor.tf.select(point);
    });
  }
  const domSelection = window.getSelection();
  if (!domSelection) {
    return;
  }
  domSelection.removeAllRanges();
  domSelection.addRange(range);
}

function restoreEditorScroll(snap: ReturnType<typeof captureEditorScroll>): void {
  if (snap.viewport) {
    snap.viewport.scrollTop = snap.top;
    snap.viewport.scrollLeft = snap.left;
  }
  window.scrollTo(snap.windowX, snap.windowY);
}

function escapeId(id: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(id);
  }
  return id.replace(/["\\]/g, "\\$&");
}

function editorViewport(editor: SlateEditor): HTMLElement | null {
  const first = editor.children[0];
  if (!first || !ElementApi.isElement(first)) {
    return null;
  }
  const dom = editor.api.toDOMNode(first);
  const viewport = dom?.closest("[data-block-viewport]");
  return viewport instanceof HTMLElement ? viewport : null;
}

function listIndentInset(dom: HTMLElement): number {
  for (const child of dom.children) {
    if (!(child instanceof HTMLElement)) {
      continue;
    }
    if (child.tagName !== "UL" && child.tagName !== "OL") {
      continue;
    }
    const padding = Number.parseFloat(getComputedStyle(child).paddingLeft);
    return Number.isFinite(padding) ? padding : 0;
  }
  return 0;
}

function contentBox(dom: HTMLElement): {
  top: number;
  height: number;
  left: number;
  width: number;
} {
  const rect = dom.getBoundingClientRect();
  const style = getComputedStyle(dom);
  const padLeft = (Number.parseFloat(style.paddingLeft) || 0) + listIndentInset(dom);
  const padRight = Number.parseFloat(style.paddingRight) || 0;
  return {
    top: rect.top,
    height: rect.height,
    left: rect.left + padLeft,
    width: Math.max(0, rect.width - padLeft - padRight),
  };
}

function bandFor(editor: SlateEditor, path: number[]): DropBand | null {
  const entry = editor.api.node(path);
  if (!entry || !ElementApi.isElement(entry[0])) {
    return null;
  }
  const dom: unknown = editor.api.toDOMNode(entry[0]);
  if (!(dom instanceof HTMLElement) || dom.closest("[data-preview-path]")) {
    return null;
  }
  const rect = contentBox(dom);
  return {
    path: [...path],
    top: rect.top,
    height: rect.height,
    left: rect.left,
    width: rect.width,
  };
}

function unitBox(editor: SlateEditor, from: number[]): { first: DropBand; last: DropBand } | null {
  const parent = from.slice(0, -1);
  const index = from[from.length - 1] ?? 0;
  const decision = blockDropDecision(editor.children, from, parent, index);
  const [start, end] = decision.unit;
  if (end <= start) {
    return null;
  }
  const first = bandFor(editor, [...parent, start]);
  const last = bandFor(editor, [...parent, end - 1]);
  if (!first || !last) {
    return null;
  }
  return { first, last };
}

function bandsUnderPointer(editor: SlateEditor, x: number, y: number): DropBand[] {
  if (typeof document.elementsFromPoint !== "function") {
    return [];
  }
  const bands: DropBand[] = [];
  const seen = new Set<string>();
  for (const element of document.elementsFromPoint(x, y)) {
    if (element.closest("[data-block-handle], [data-block-menu], [data-block-drop-indicator]")) {
      continue;
    }
    const block = element.closest("[data-block-id]");
    if (!(block instanceof HTMLElement) || block.closest("[data-preview-path]")) {
      continue;
    }
    const id = block.getAttribute("data-block-id");
    if (id === null || id.length === 0 || seen.has(id)) {
      continue;
    }
    seen.add(id);
    const entry = findBlockById(editor, id);
    if (!entry) {
      continue;
    }
    const rect = contentBox(block);
    bands.push({
      path: [...entry[1]],
      top: rect.top,
      height: rect.height,
      left: rect.left,
      width: rect.width,
    });
  }
  return bands;
}

function scrollAtEdge(viewport: HTMLElement | null, clientY: number): boolean {
  let scrolled = false;
  if (viewport) {
    const rect = viewport.getBoundingClientRect();
    if (clientY >= rect.top && clientY < rect.top + EDGE_PX) {
      const next = Math.max(0, viewport.scrollTop - SCROLL_STEP_PX);
      if (next !== viewport.scrollTop) {
        viewport.scrollTop = next;
        scrolled = true;
      }
    } else if (clientY <= rect.bottom && clientY > rect.bottom - EDGE_PX) {
      const max = viewport.scrollHeight - viewport.clientHeight;
      const next = Math.min(max, viewport.scrollTop + SCROLL_STEP_PX);
      if (next !== viewport.scrollTop) {
        viewport.scrollTop = next;
        scrolled = true;
      }
    }
  }
  if (clientY < EDGE_PX) {
    const before = window.scrollY;
    window.scrollBy(0, -SCROLL_STEP_PX);
    scrolled = scrolled || window.scrollY !== before;
  } else if (clientY > window.innerHeight - EDGE_PX) {
    const before = window.scrollY;
    window.scrollBy(0, SCROLL_STEP_PX);
    scrolled = scrolled || window.scrollY !== before;
  }
  return scrolled;
}

export function BlockDropIndicator({ line }: { line: DropIndicator }) {
  return (
    <div
      data-block-drop-indicator=""
      aria-hidden="true"
      className="bg-primary pointer-events-none fixed z-30 h-0.5 motion-reduce:transition-none"
      style={{ top: line.top, left: line.left, width: line.width }}
    />
  );
}

type DragListeners = {
  move: (event: PointerEvent) => void;
  up: () => void;
  cancel: () => void;
  key: (event: KeyboardEvent) => void;
  blur: () => void;
  select: (event: Event) => void;
};

export function useBlockDrag(closeMenu: () => void): {
  indicator: DropIndicator | null;
  dragging: boolean;
  onGripPointerDown: (event: ReactPointerEvent<HTMLButtonElement>, target: BlockHandleHit) => void;
  consumeGripClick: () => boolean;
} {
  const editor = useEditorRef();
  const [indicator, setIndicator] = useState<DropIndicator | null>(null);
  const [dragging, setDragging] = useState(false);
  const session = useRef<DragSession | null>(null);
  const indicatorRef = useRef<DropIndicator | null>(null);
  const suppressClick = useRef(false);
  const swallowClick = useRef(false);
  const closeRef = useRef(closeMenu);
  const frame = useRef(0);
  const dimmed = useRef<HTMLElement[]>([]);
  const cursor = useRef("");
  const userSelect = useRef("");
  const listeners = useRef<DragListeners | null>(null);
  const editorRef = useRef(editor);
  const stopRef = useRef<(restoreSelection: boolean) => void>(() => undefined);

  useEffect(() => {
    closeRef.current = closeMenu;
    editorRef.current = editor;
  }, [closeMenu, editor]);

  useEffect(() => {
    const onClick = (event: MouseEvent): void => {
      if (!swallowClick.current) {
        return;
      }
      swallowClick.current = false;
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("click", onClick, true);
      stopRef.current(false);
    };
  }, []);

  function setLine(next: DropIndicator | null): void {
    indicatorRef.current = next;
    setIndicator(next);
  }

  function dimSource(id: string): void {
    const nodes = document.querySelectorAll(`[data-block-id="${escapeId(id)}"]`);
    for (const node of nodes) {
      if (!(node instanceof HTMLElement) || node.closest("[data-preview-path]")) {
        continue;
      }
      node.classList.add(SOURCE_DIM);
      dimmed.current.push(node);
    }
  }

  function undim(): void {
    for (const node of dimmed.current) {
      node.classList.remove(SOURCE_DIM);
    }
    dimmed.current = [];
  }

  function unlisten(): void {
    const current = listeners.current;
    if (!current) {
      return;
    }
    listeners.current = null;
    window.removeEventListener("pointermove", current.move);
    window.removeEventListener("pointerup", current.up);
    window.removeEventListener("pointercancel", current.cancel);
    window.removeEventListener("keydown", current.key);
    window.removeEventListener("blur", current.blur);
    document.removeEventListener("selectstart", current.select);
  }

  function stop(restoreSelection: boolean): void {
    const current = session.current;
    session.current = null;
    cancelAnimationFrame(frame.current);
    unlisten();
    undim();
    document.documentElement.style.cursor = cursor.current;
    document.body.style.userSelect = userSelect.current;
    document.body.removeAttribute("data-block-dragging");
    setBlockDragArmed(false);
    setDragging(false);
    setLine(null);
    if (!restoreSelection || !current) {
      return;
    }
    const live = editorRef.current;
    if (sameSelection(live.selection, current.selection)) {
      return;
    }
    const saved = current.selection;
    live.tf.withoutSaving(() => {
      if (saved) {
        live.tf.select(saved);
      } else {
        live.tf.deselect();
      }
    });
  }

  useEffect(() => {
    stopRef.current = stop;
  });

  function updateIndicator(): void {
    const current = session.current;
    const live = editorRef.current;
    if (!current?.dragging) {
      return;
    }
    const bands = bandsUnderPointer(live, current.pointerX, current.pointerY);
    const line = resolveDropIndicator(
      live.children,
      current.path,
      bands,
      current.pointerY,
      unitBox(live, current.path),
    );
    document.documentElement.style.cursor = line ? "grabbing" : "not-allowed";
    setLine(line);
  }

  function tick(): void {
    const current = session.current;
    if (!current?.dragging) {
      return;
    }
    if (scrollAtEdge(editorViewport(editorRef.current), current.pointerY)) {
      updateIndicator();
    }
    frame.current = requestAnimationFrame(tick);
  }

  function begin(current: DragSession): void {
    current.dragging = true;
    suppressClick.current = true;
    swallowClick.current = true;
    closeRef.current();
    cursor.current = document.documentElement.style.cursor;
    userSelect.current = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    document.body.setAttribute("data-block-dragging", "");
    setDragging(true);
    for (const id of movingBlockIds(editorRef.current, current.path)) {
      dimSource(id);
    }
    const select = listeners.current?.select;
    if (select) {
      document.addEventListener("selectstart", select);
    }
    updateIndicator();
    frame.current = requestAnimationFrame(tick);
  }

  function finish(drop: boolean): void {
    const current = session.current;
    const line = indicatorRef.current;
    const dragging = current?.dragging === true;
    stop(dragging && !drop);
    if (!drop || !dragging || !current || !line || line.noop) {
      return;
    }
    const live = editorRef.current;
    const movedId = current.id;
    const snap = captureEditorScroll();
    retainScroll(() => {
      runEditorCommand(live, moveBlock, { from: [...current.path], to: line.to });
    });
    // The grip blurs the editor, so Slate never copies the model caret into the
    // DOM, and focusing the editor parks that caret at the top of the document.
    // The moved nodes are clones, so the DOM range exists only after React commits.
    const apply = (): void => {
      placeMovedCaret(editorRef.current, movedId);
      restoreEditorScroll(snap);
    };
    queueMicrotask(apply);
    requestAnimationFrame(() => {
      apply();
      requestAnimationFrame(() => {
        apply();
        setTimeout(apply, 0);
      });
    });
  }

  function onGripPointerDown(
    event: ReactPointerEvent<HTMLButtonElement>,
    target: BlockHandleHit,
  ): void {
    if (event.button !== 0 || event.pointerType === "touch" || editor.dom.readOnly === true) {
      return;
    }
    stop(false);
    setBlockDragArmed(true);
    suppressClick.current = false;
    session.current = {
      path: [...target.path],
      id: target.id,
      x: event.clientX,
      y: event.clientY,
      pointerX: event.clientX,
      pointerY: event.clientY,
      dragging: false,
      selection: cloneSelection(editor.selection),
    };
    const move = (pointer: PointerEvent): void => {
      const current = session.current;
      if (!current || pointer.pointerType === "touch") {
        return;
      }
      current.pointerX = pointer.clientX;
      current.pointerY = pointer.clientY;
      if (!current.dragging) {
        if (!dragPastThreshold(pointer.clientX - current.x, pointer.clientY - current.y)) {
          return;
        }
        begin(current);
        return;
      }
      pointer.preventDefault();
      updateIndicator();
    };
    const cancel = (): void => {
      if (session.current?.dragging) {
        suppressClick.current = true;
      }
      stop(true);
    };
    const attached: DragListeners = {
      move,
      up: () => {
        finish(true);
      },
      cancel,
      key: (keyEvent) => {
        if (keyEvent.key !== "Escape") {
          return;
        }
        keyEvent.preventDefault();
        cancel();
      },
      blur: cancel,
      select: (selectEvent) => {
        selectEvent.preventDefault();
      },
    };
    listeners.current = attached;
    window.addEventListener("pointermove", attached.move);
    window.addEventListener("pointerup", attached.up);
    window.addEventListener("pointercancel", attached.cancel);
    window.addEventListener("keydown", attached.key);
    window.addEventListener("blur", attached.blur);
  }

  function consumeGripClick(): boolean {
    if (!suppressClick.current) {
      return false;
    }
    suppressClick.current = false;
    return true;
  }

  return { indicator, dragging, onGripPointerDown, consumeGripClick };
}
