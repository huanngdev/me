import {
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  useDraggable,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
  type DraggableAttributes,
} from "@dnd-kit/core";
import { ElementApi, type Descendant, type SlateEditor } from "platejs";
import { useEditorRef } from "platejs/react";

import { moveBlock, runEditorCommand } from "../../lib/commands/editor-commands";
import {
  captureEditorScroll,
  listItemUnit,
  resolveDropIndicator,
  type DropIndicator,
  type DropRect,
} from "../../lib/features/editor-block-drop";
import { setBlockDragArmed, type BlockHandleHit } from "../../lib/features/editor-block-handle";
import { findBlockById } from "../../lib/features/editor-synced-block";
import { retainScroll } from "./block-toolbar";

export const DRAG_ACTIVATION_DISTANCE_PX = 4;
export const DRAG_HORIZONTAL_BAND_PX = 200;

const HORIZONTAL_BAND_PX = DRAG_HORIZONTAL_BAND_PX;
const VERTICAL_BAND_PX = 32;
const SOURCE_DIM = "opacity-40";
const PREVIEW_OPACITY = 0.8;
const PREVIEW_MAX_VIEWPORT_RATIO = 0.6;
// A drop's caret is re-placed once, after dnd kit removed its selection-change
// listener (it clears any selection until ~50ms after the drag ends) and React
// committed the moved nodes.
const CARET_DELAY_MS = 80;

type SavedSelection = SlateEditor["selection"];

type DragSession = {
  path: number[];
  id: string;
  startX: number;
  startY: number;
  pointerX: number;
  pointerY: number;
  selection: SavedSelection;
};

type DragListeners = ReturnType<typeof useDraggable>["listeners"];

type DragBand = { left: number; right: number; top: number; bottom: number };

type PreviewData = {
  nodes: HTMLElement[];
  width: number;
  cap: number;
  offsetX: number;
  offsetY: number;
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

function editorRoot(editor: SlateEditor): HTMLElement | null {
  const first = editor.children[0];
  if (!first || !ElementApi.isElement(first)) {
    return null;
  }
  const dom = editor.api.toDOMNode(first);
  const editable = dom?.closest("[data-slate-editor]");
  return editable instanceof HTMLElement ? editable : null;
}

// One cached box per rendered block. The slot comes from these boxes, so the
// drag reads layout once and then only does arithmetic as the pointer moves.
function buildDropRects(editor: SlateEditor): DropRect[] {
  const editable = editorRoot(editor);
  if (!editable) {
    return [];
  }
  const rects: DropRect[] = [];
  for (const node of editable.querySelectorAll("[data-block-id]")) {
    if (!(node instanceof HTMLElement) || node.closest("[data-preview-path]")) {
      continue;
    }
    const id = node.getAttribute("data-block-id");
    if (id === null || id.length === 0) {
      continue;
    }
    const entry = findBlockById(editor, id);
    if (!entry) {
      continue;
    }
    const rect = node.getBoundingClientRect();
    if (rect.height <= 0) {
      continue;
    }
    rects.push({
      path: [...entry[1]],
      top: rect.top,
      bottom: rect.bottom,
      left: rect.left,
      right: rect.right,
    });
  }
  return rects;
}

function buildBand(editor: SlateEditor, rects: readonly DropRect[]): DragBand | null {
  const editable = editorRoot(editor);
  if (!editable) {
    return null;
  }
  const viewport = editable.closest("[data-block-viewport]");
  const frame = (viewport instanceof HTMLElement ? viewport : editable).getBoundingClientRect();
  let left = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  for (const rect of rects) {
    left = Math.min(left, rect.left);
    right = Math.max(right, rect.right);
  }
  if (!Number.isFinite(left)) {
    left = frame.left;
    right = frame.right;
  }
  return {
    left: left - HORIZONTAL_BAND_PX,
    right: right + HORIZONTAL_BAND_PX,
    top: frame.top - VERTICAL_BAND_PX,
    bottom: frame.bottom + VERTICAL_BAND_PX,
  };
}

function escapeId(id: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(id);
  }
  return id.replace(/["\\]/g, "\\$&");
}

function sourceNodes(id: string): HTMLElement[] {
  const found: HTMLElement[] = [];
  for (const node of document.querySelectorAll(`[data-block-id="${escapeId(id)}"]`)) {
    if (node instanceof HTMLElement && !node.closest("[data-preview-path]")) {
      found.push(node);
    }
  }
  return found;
}

// The preview is a copy of the already-rendered DOM, so it carries the real
// typography and chrome (callout surface, table grid, code surface, list
// markers, a toggle with its children) with no second render. Every hook the
// editor queries on the document is stripped so the copy stays invisible to it.
function sanitizeClone(source: HTMLElement): HTMLElement {
  const clone = source.cloneNode(true) as HTMLElement;
  for (const node of [clone, ...clone.querySelectorAll("*")]) {
    if (!(node instanceof HTMLElement)) {
      continue;
    }
    // The source block is dimmed before the copy is taken; the copy must not
    // carry that dim class or the overlay's own opacity multiplies it.
    node.classList.remove(SOURCE_DIM);
    node.removeAttribute("data-block-id");
    node.removeAttribute("data-cell-selected");
    node.removeAttribute("id");
    node.removeAttribute("contenteditable");
    node.removeAttribute("tabindex");
    for (const name of node.getAttributeNames()) {
      if (name.startsWith("data-slate")) {
        node.removeAttribute(name);
      }
    }
  }
  return clone;
}

function buildPreview(
  editor: SlateEditor,
  ids: readonly string[],
  activeRect: { top: number; left: number } | null,
): PreviewData | null {
  const sources: HTMLElement[] = [];
  for (const id of ids) {
    const entry = findBlockById(editor, id);
    if (!entry) {
      continue;
    }
    const dom: unknown = editor.api.toDOMNode(entry[0]);
    if (dom instanceof HTMLElement) {
      sources.push(dom);
    }
  }
  const first = sources[0];
  if (!first) {
    return null;
  }
  let width = 0;
  for (const source of sources) {
    width = Math.max(width, source.getBoundingClientRect().width);
  }
  const rect = first.getBoundingClientRect();
  return {
    nodes: sources.map((source) => sanitizeClone(source)),
    width,
    cap: Math.max(120, Math.round(window.innerHeight * PREVIEW_MAX_VIEWPORT_RATIO)),
    offsetX: activeRect ? rect.left - activeRect.left : 0,
    offsetY: activeRect ? rect.top - activeRect.top : 0,
  };
}

export function BlockDropIndicator({ line }: { line: DropIndicator }) {
  return (
    <div
      data-block-drop-indicator=""
      data-drop-target={line.to.join(".")}
      data-drop-top={String(line.top)}
      aria-hidden="true"
      className="bg-muted-foreground/60 pointer-events-none fixed top-0 left-0 z-30 h-0.5 transition-transform duration-150 ease-out motion-reduce:transition-none"
      style={{ width: line.width, transform: `translate3d(${line.left}px, ${line.top}px, 0)` }}
    />
  );
}

function DragPreview({ preview }: { preview: PreviewData | null }) {
  const hostRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host || !preview) {
      return;
    }
    host.replaceChildren(...preview.nodes);
    return () => {
      host.replaceChildren();
    };
  }, [preview]);
  if (!preview) {
    return null;
  }
  return (
    <div
      data-block-drag-overlay=""
      ref={hostRef}
      aria-hidden="true"
      inert
      contentEditable={false}
      className="pointer-events-none space-y-4 select-none [&>[data-list-item]:has(+[data-list-item])]:mb-1"
      style={{
        width: preview.width,
        maxHeight: preview.cap,
        overflow: "hidden",
        opacity: PREVIEW_OPACITY,
        transform: `translate(${preview.offsetX}px, ${preview.offsetY}px)`,
      }}
    />
  );
}

export type BlockDragHandlers = {
  onDragStart: (event: DragStartEvent) => void;
  onDragMove: (event: DragMoveEvent) => void;
  onDragEnd: (event: DragEndEvent) => void;
  onDragCancel: () => void;
};

export type BlockDragApi = BlockDragHandlers & {
  attributes: DraggableAttributes;
  listeners: DragListeners;
  setNodeRef: (node: HTMLElement | null) => void;
  indicator: DropIndicator | null;
  dragging: boolean;
  overlay: ReactNode;
  consumeClick: () => boolean;
};

type Options = {
  target: BlockHandleHit | null;
  closeMenu: () => void;
  clearPointer: () => void;
  rehover: (x?: number, y?: number) => void;
  apiRef: RefObject<BlockDragHandlers | null>;
};

export function useBlockDrag({
  target,
  closeMenu,
  clearPointer,
  rehover,
  apiRef,
}: Options): BlockDragApi {
  const editor = useEditorRef();
  const editorRef = useRef(editor);
  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: "notion-block-grip",
    disabled: target === null,
    data: target ? { path: [...target.path], id: target.id } : undefined,
  });

  const [indicator, setIndicator] = useState<DropIndicator | null>(null);
  const [overlay, setOverlay] = useState<ReactNode>(null);
  const sessionRef = useRef<DragSession | null>(null);
  const rectsRef = useRef<DropRect[]>([]);
  const bandRef = useRef<DragBand | null>(null);
  const indicatorRef = useRef<DropIndicator | null>(null);
  const closeRef = useRef(closeMenu);
  const clearPointerRef = useRef(clearPointer);
  const rehoverRef = useRef(rehover);
  const dimmedRef = useRef<HTMLElement[]>([]);
  const cursorRef = useRef("");
  const userSelectRef = useRef("");
  const suppressClickRef = useRef(false);
  const caretTimerRef = useRef(0);

  useEffect(() => {
    closeRef.current = closeMenu;
    clearPointerRef.current = clearPointer;
    rehoverRef.current = rehover;
  }, [closeMenu, clearPointer, rehover]);

  const undim = useCallback(() => {
    for (const node of dimmedRef.current) {
      node.classList.remove(SOURCE_DIM);
    }
    dimmedRef.current = [];
  }, []);

  const clearCaretTimer = useCallback(() => {
    if (caretTimerRef.current !== 0) {
      window.clearTimeout(caretTimerRef.current);
      caretTimerRef.current = 0;
    }
  }, []);

  const setLine = useCallback((next: DropIndicator | null) => {
    indicatorRef.current = next;
    setIndicator((current) => (sameIndicator(current, next) ? current : next));
  }, []);

  const inBand = useCallback((x: number, y: number): boolean => {
    const band = bandRef.current;
    if (!band) {
      return false;
    }
    return x >= band.left && x <= band.right && y >= band.top && y <= band.bottom;
  }, []);

  const updateIndicator = useCallback(() => {
    const session = sessionRef.current;
    const live = editorRef.current;
    if (!session) {
      return;
    }
    if (!inBand(session.pointerX, session.pointerY)) {
      document.documentElement.style.cursor = "grabbing";
      setLine(null);
      return;
    }
    const line = resolveDropIndicator(
      live.children,
      session.path,
      rectsRef.current,
      session.pointerY,
    );
    document.documentElement.style.cursor = line ? "grabbing" : "not-allowed";
    setLine(line);
  }, [inBand, setLine]);

  const refreshRects = useCallback(() => {
    const live = editorRef.current;
    rectsRef.current = buildDropRects(live);
    bandRef.current = buildBand(live, rectsRef.current);
    updateIndicator();
  }, [updateIndicator]);

  const stop = useCallback(
    (restoreSelection: boolean) => {
      const session = sessionRef.current;
      sessionRef.current = null;
      undim();
      document.documentElement.style.cursor = cursorRef.current;
      document.body.style.userSelect = userSelectRef.current;
      document.body.removeAttribute("data-block-dragging");
      setBlockDragArmed(false);
      setLine(null);
      setOverlay(null);
      window.removeEventListener("scroll", refreshRects, true);
      window.removeEventListener("resize", refreshRects);
      if (!restoreSelection || !session) {
        return;
      }
      const live = editorRef.current;
      if (sameSelection(live.selection, session.selection)) {
        return;
      }
      const saved = session.selection;
      live.tf.withoutSaving(() => {
        if (saved) {
          live.tf.select(saved);
        } else {
          live.tf.deselect();
        }
      });
    },
    [refreshRects, setLine, undim],
  );

  const finish = useCallback(() => {
    const session = sessionRef.current;
    const line = indicatorRef.current;
    const dropping = line !== null && !line.noop;
    stop(!dropping);
    clearCaretTimer();
    if (!dropping || !session || !line) {
      return;
    }
    // Drop the handle's current target before the move so it is never painted
    // at the slot the block came from; re-resolve under the pointer once the
    // moved nodes have rendered.
    clearPointerRef.current();
    const live = editorRef.current;
    const movedId = session.id;
    const snap = captureEditorScroll();
    retainScroll(() => {
      runEditorCommand(live, moveBlock, { from: [...session.path], to: line.to });
    });
    requestAnimationFrame(() => {
      restoreEditorScroll(snap);
      rehoverRef.current(session.pointerX, session.pointerY);
      clearCaretTimer();
      caretTimerRef.current = window.setTimeout(() => {
        caretTimerRef.current = 0;
        placeMovedCaret(editorRef.current, movedId);
      }, CARET_DELAY_MS);
    });
  }, [clearCaretTimer, stop]);

  const onDragStart = useCallback(
    (event: DragStartEvent) => {
      const data = event.active.data.current as { path?: number[]; id?: string } | undefined;
      if (!data?.path || typeof data.id !== "string") {
        return;
      }
      const activator = event.activatorEvent as PointerEvent | undefined;
      const startX = activator?.clientX ?? 0;
      const startY = activator?.clientY ?? 0;
      closeRef.current();
      clearCaretTimer();
      suppressClickRef.current = true;
      setBlockDragArmed(true);
      const live = editorRef.current;
      sessionRef.current = {
        path: [...data.path],
        id: data.id,
        startX,
        startY,
        pointerX: startX,
        pointerY: startY,
        selection: cloneSelection(live.selection),
      };
      cursorRef.current = document.documentElement.style.cursor;
      userSelectRef.current = document.body.style.userSelect;
      document.body.style.userSelect = "none";
      document.body.setAttribute("data-block-dragging", "");
      document.documentElement.style.cursor = "grabbing";
      const ids = movingBlockIds(live, data.path);
      for (const id of ids) {
        for (const node of sourceNodes(id)) {
          node.classList.add(SOURCE_DIM);
          dimmedRef.current.push(node);
        }
      }
      // dnd kit positions the DragOverlay at the draggable node's rect (the
      // grip), which may not be measured yet at activation. Read the live grip
      // rect instead so the copy is offset from the grip to the unit exactly.
      const gripDom = document.querySelector("[data-block-handle-grip]");
      const gripRect = gripDom instanceof HTMLElement ? gripDom.getBoundingClientRect() : null;
      setOverlay(
        <DragPreview
          preview={buildPreview(
            live,
            ids,
            gripRect ? { top: gripRect.top, left: gripRect.left } : null,
          )}
        />,
      );
      rectsRef.current = buildDropRects(live);
      bandRef.current = buildBand(live, rectsRef.current);
      window.addEventListener("scroll", refreshRects, true);
      window.addEventListener("resize", refreshRects);
      updateIndicator();
    },
    [clearCaretTimer, refreshRects, updateIndicator],
  );

  const onDragMove = useCallback(
    (event: DragMoveEvent) => {
      const session = sessionRef.current;
      if (!session) {
        return;
      }
      session.pointerX = session.startX + event.delta.x;
      session.pointerY = session.startY + event.delta.y;
      updateIndicator();
    },
    [updateIndicator],
  );

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      const session = sessionRef.current;
      if (session) {
        session.pointerX = session.startX + event.delta.x;
        session.pointerY = session.startY + event.delta.y;
        updateIndicator();
      }
      finish();
    },
    [finish, updateIndicator],
  );

  const onDragCancel = useCallback(() => {
    suppressClickRef.current = true;
    stop(true);
  }, [stop]);

  useEffect(() => {
    apiRef.current = { onDragStart, onDragMove, onDragEnd, onDragCancel };
    return () => {
      apiRef.current = null;
    };
  }, [apiRef, onDragStart, onDragMove, onDragEnd, onDragCancel]);

  useEffect(() => {
    return () => {
      stop(false);
      clearCaretTimer();
    };
  }, [stop, clearCaretTimer]);

  const consumeClick = useCallback(() => {
    if (!suppressClickRef.current) {
      return false;
    }
    suppressClickRef.current = false;
    return true;
  }, []);

  return {
    attributes,
    listeners,
    setNodeRef,
    indicator,
    dragging: isDragging,
    overlay,
    onDragStart,
    onDragMove,
    onDragEnd,
    onDragCancel,
    consumeClick,
  };
}

function sameIndicator(current: DropIndicator | null, next: DropIndicator | null): boolean {
  if (current === next) {
    return true;
  }
  if (!current || !next) {
    return false;
  }
  return (
    current.top === next.top &&
    current.left === next.left &&
    current.width === next.width &&
    current.noop === next.noop &&
    current.to.length === next.to.length &&
    current.to.every((value, index) => value === next.to[index])
  );
}
