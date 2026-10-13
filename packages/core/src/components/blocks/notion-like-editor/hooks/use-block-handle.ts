import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ElementApi, PathApi, type SlateEditor, type TElement } from "platejs";
import { useEditorReadOnly, useEditorRef, useEditorSelector } from "platejs/react";

import { focusEditorWithoutScroll, retainScroll } from "../components/ui/block-toolbar";
import { insertParagraphBelow, runEditorCommand } from "../lib/commands/editor-commands";
import {
  BLOCK_HANDLE_HEIGHT,
  BLOCK_HANDLE_WIDTH,
  blockHandleGutterId,
  blockHandleTarget,
  chainAtPath,
  handleCoversForeignBlock,
  initialHandleUi,
  isBlockDragArmed,
  isTypingKey,
  pickHandleBandAtY,
  blockHandleContentTop,
  placeBlockHandle,
  reduceHandleUi,
  sortHandleBands,
  visibleHandleId,
  type BlockHandleOptions,
  type BlockHandlePaint,
  type HandleBand,
  type HandleFrame,
  type HandleUiState,
} from "../lib/features/editor-block-handle";
import { isTextOnlyBatch } from "../lib/features/editor-operation-batch";
import { findBlockById } from "../lib/features/editor-synced-block";
import { useEditorFlushes } from "./use-editor-flushes";
import { useEditorOptions } from "./use-editor-options";

export type { BlockHandlePaint };

type HandleOptions = {
  onInsertedBelow?: (blockId: string) => void;
};

type BlockHandleController = {
  paint: BlockHandlePaint | null;
  shown: boolean;
  setMeasuredSize: (width: number, height: number) => void;
  addBelow: () => void;
  onHandleFocus: () => void;
  onHandleBlur: (related?: EventTarget | null) => void;
  suppressed: boolean;
  holdMenu: (id: string | null) => void;
  clearPointer: () => void;
  rehover: (x?: number, y?: number) => void;
};

const HANDLE_FADE_MS = 150;

function hoverNoneNow(): boolean {
  if (typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(hover: none)").matches;
}

function reducedMotion(): boolean {
  if (typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function editableOf(editor: SlateEditor): HTMLElement | null {
  const first = editor.children[0];
  if (!first || !ElementApi.isElement(first)) {
    return null;
  }
  const dom = editor.api.toDOMNode(first);
  const editable = dom?.closest("[data-slate-editor]");
  return editable instanceof HTMLElement ? editable : null;
}

// One band per rendered target, in document order. Gaps between blocks have no
// hit element, so the handle resolves a target from these bands instead.
export function handleBands(editor: SlateEditor): HandleBand[] {
  const editable = editableOf(editor);
  if (!editable) {
    return [];
  }
  // One walk of the document maps each block id to its path. The first match in
  // document order wins, as findBlockById does.
  const paths = new Map<string, number[]>();
  for (const entry of editor.api.nodes({
    at: [],
    match: (node) => ElementApi.isElement(node) && typeof node.id === "string",
    voids: true,
  })) {
    const node = entry[0];
    if (ElementApi.isElement(node) && typeof node.id === "string" && !paths.has(node.id)) {
      paths.set(node.id, entry[1]);
    }
  }
  const byId = new Map<string, HandleBand>();
  for (const node of editable.querySelectorAll("[data-block-id]")) {
    if (!(node instanceof HTMLElement) || node.closest("[data-preview-path]")) {
      continue;
    }
    const id = node.getAttribute("data-block-id");
    if (id === null || id.length === 0) {
      continue;
    }
    const path = paths.get(id);
    if (!path) {
      continue;
    }
    const target = blockHandleTarget(chainAtPath(editor, path));
    if (!target) {
      continue;
    }
    const rect = node.getBoundingClientRect();
    if (rect.height <= 0) {
      continue;
    }
    // A container's target is its first row: an element that maps to an
    // ancestor (a summary/first row) has a smaller box than the container
    // itself, so the smaller box wins. A later row keeps its own box. This
    // makes the container's top padding resolve to the container and its lower
    // padding resolve to the last row.
    const existing = byId.get(target.id);
    if (existing && existing.bottom - existing.top <= rect.height) {
      continue;
    }
    byId.set(target.id, {
      id: target.id,
      path,
      top: rect.top,
      bottom: rect.bottom,
      depth: path.length,
    });
  }
  return sortHandleBands([...byId.values()]);
}

type CachedBands = { bands: HandleBand[]; stale: boolean };

// The bands are rebuilt only when a reader needs them and the cache is stale.
// Operations, scroll and resize mark the cache stale; nothing else rebuilds it.
function currentBands(editor: SlateEditor, cache: { current: CachedBands }): HandleBand[] {
  if (cache.current.stale) {
    cache.current = { bands: handleBands(editor), stale: false };
  }
  return cache.current.bands;
}

// The target is a function of the pointer's Y alone: the innermost band
// containing Y. A container's padding, border and the gutter to its left then
// resolve to the same row as the text at that Y, so the handle cannot flicker
// between a quote and its child. The bands are read through `currentBands`.
function pointerBlockId(
  bands: readonly HandleBand[],
  y: number,
  currentId: string | null,
): string | null {
  return pickHandleBandAtY(bands, y, currentId)?.id ?? null;
}

// The handle buttons/menu/tooltip keep the current target while engaged. The
// gutter strip does not count: a vertical move along it must retarget by Y.
function isControlLayer(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest(
      "[data-block-handle-add], [data-block-handle-grip], [data-block-handle-tooltip], [data-block-menu], [data-block-menu-portal]",
    ) !== null
  );
}

// The editor's vertical extent: the scroll viewport when there is one, else the
// editable itself. The gutter and the gaps between blocks both sit inside it.
function insideEditorArea(editor: SlateEditor, _x: number, y: number): boolean {
  const editable = editableOf(editor);
  if (!editable) {
    return false;
  }
  const viewport = editable.closest("[data-block-viewport]");
  const frame = (viewport instanceof HTMLElement ? viewport : editable).getBoundingClientRect();
  return y >= frame.top && y <= frame.bottom;
}

function frameOf(element: HTMLElement): HandleFrame | null {
  const viewport = element.closest("[data-block-viewport]");
  if (!(viewport instanceof HTMLElement)) {
    return null;
  }
  const rect = viewport.getBoundingClientRect();
  return { top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left };
}

function foreignHit(x: number, y: number, chainIds: readonly string[]): boolean {
  if (typeof document.elementFromPoint !== "function") {
    return false;
  }
  const hit = document.elementFromPoint(x, y);
  if (!(hit instanceof Element)) {
    return false;
  }
  if (
    hit.closest(
      "[data-block-handle], [data-block-handle-tooltip], [data-block-menu], [data-block-menu-portal]",
    )
  ) {
    return false;
  }
  const block = hit.closest("[data-block-id]");
  if (!(block instanceof Element) || block.closest("[data-preview-path]")) {
    return false;
  }
  return handleCoversForeignBlock(block.getAttribute("data-block-id"), chainIds);
}

function isHandleLayer(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest(
      "[data-block-handle], [data-block-handle-tooltip], [data-block-menu], [data-block-menu-portal]",
    ) !== null
  );
}

// The block at the path the handle last painted, if it still has this id. A block
// that has not moved is then found without walking the document.
function blockAtHint(
  editor: SlateEditor,
  hint: number[] | null,
  id: string,
): [TElement, number[]] | undefined {
  if (!hint) {
    return undefined;
  }
  const entry = editor.api.node(hint);
  if (!entry || !ElementApi.isElement(entry[0]) || entry[0].id !== id) {
    return undefined;
  }
  return [entry[0], entry[1]];
}

function measurePaint(
  editor: SlateEditor,
  id: string,
  size: { width: number; height: number },
  handleOptions: BlockHandleOptions,
  hint: number[] | null,
): BlockHandlePaint | null {
  const entry = blockAtHint(editor, hint, id) ?? findBlockById(editor, id);
  if (!entry || typeof entry[0].type !== "string") {
    return null;
  }
  const dom = editor.api.toDOMNode(entry[0]);
  if (!(dom instanceof HTMLElement)) {
    return null;
  }
  const box = dom.getBoundingClientRect();
  if (box.height <= 0 || box.width <= 0) {
    return null;
  }
  const chain = chainAtPath(editor, entry[1]);
  const gutterId = blockHandleGutterId(chain, id);
  let gutterLeft = box.left;
  if (gutterId !== id) {
    const anchor = findBlockById(editor, gutterId);
    const anchorDom = anchor ? editor.api.toDOMNode(anchor[0]) : null;
    if (anchorDom instanceof HTMLElement) {
      const anchorBox = anchorDom.getBoundingClientRect();
      if (anchorBox.width > 0) {
        gutterLeft = anchorBox.left;
      }
    }
  }
  const placed = placeBlockHandle(
    {
      blockTop: blockHandleContentTop(dom, size.height, handleOptions),
      blockBottom: box.bottom,
      blockLeft: gutterLeft,
    },
    size,
    { width: window.innerWidth, height: window.innerHeight },
    frameOf(dom),
    handleOptions,
  );
  if (!placed) {
    return null;
  }
  const chainIds = chain.map((node) => node.id);
  if (foreignHit(placed.left + size.width / 2, placed.top + size.height / 2, chainIds)) {
    return null;
  }
  return {
    target: { id, type: entry[0].type, path: entry[1] },
    top: placed.top,
    left: placed.left,
    width: size.width,
    height: size.height,
    blockLeft: box.left,
    blockTop: box.top,
    blockBottom: box.bottom,
  };
}

function samePaint(current: BlockHandlePaint | null, next: BlockHandlePaint | null): boolean {
  if (current === next) {
    return true;
  }
  if (!current || !next) {
    return false;
  }
  return (
    current.target.id === next.target.id &&
    current.target.path.join(".") === next.target.path.join(".") &&
    current.top === next.top &&
    current.left === next.left &&
    current.width === next.width &&
    current.height === next.height &&
    current.blockLeft === next.blockLeft &&
    current.blockTop === next.blockTop &&
    current.blockBottom === next.blockBottom
  );
}

export function useBlockHandle({ onInsertedBelow }: HandleOptions = {}): BlockHandleController {
  const editor = useEditorRef();
  // BlockHandle sits beside PlateContent, outside Slate's Editable, so the
  // slate-react read-only context is always false here. The plate store is the one Plate sets.
  const readOnly = useEditorReadOnly();
  const flushes = useEditorFlushes();
  const { version, take } = flushes;
  // The target id is read from the caret path's ancestors, so no document walk
  // (findBlockById) runs on every selection change.
  const caretId = useEditorSelector((instance) => {
    const selection = instance.selection;
    if (!selection) {
      return null;
    }
    return blockHandleTarget(chainAtPath(instance, selection.anchor.path))?.id ?? null;
  }, []);
  const [hoverNone, setHoverNone] = useState(hoverNoneNow);
  const [ui, setUi] = useState<HandleUiState>(() => initialHandleUi());
  const [size, setSize] = useState({ width: BLOCK_HANDLE_WIDTH, height: BLOCK_HANDLE_HEIGHT });
  const [paint, setPaint] = useState<BlockHandlePaint | null>(null);
  const [shown, setShown] = useState(false);
  const pathRef = useRef<number[] | null>(null);
  const shownRef = useRef(false);
  const hideTimer = useRef(0);
  const menuLockRef = useRef<string | null>(null);
  const pointerRef = useRef<{ x: number; y: number; present: boolean } | null>(null);
  const visibleIdRef = useRef<string | null>(null);
  const bandsRef = useRef<CachedBands>({ bands: [], stale: true });
  const visibleId = visibleHandleId({ ...ui, caretId, readOnly, hoverNone });
  const handleOptions = useEditorOptions().handle;
  useEffect(() => {
    visibleIdRef.current = visibleId;
  }, [visibleId]);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      return;
    }
    const query = window.matchMedia("(hover: none)");
    const onChange = (): void => {
      setHoverNone(query.matches);
    };
    if (typeof query.addEventListener !== "function") {
      return;
    }
    query.addEventListener("change", onChange);
    return () => {
      query.removeEventListener("change", onChange);
    };
  }, []);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent): void => {
      if (event.pointerType === "touch" || isBlockDragArmed()) {
        return;
      }
      // Keep the last pointer position even while a menu owns the handle, so
      // that closing the menu can re-resolve from where the pointer is now.
      pointerRef.current = { x: event.clientX, y: event.clientY, present: true };
      // The open menu keeps its target. A pointer move must not retarget or dismiss it.
      if (menuLockRef.current) {
        return;
      }
      // The target is a function of the pointer's Y: the row at that Y. This
      // makes the text, the container's padding/border and the gutter strip to
      // the left all agree, so the handle cannot flicker between a container
      // and its child. Only the handle's own controls keep the current target.
      const inside = insideEditorArea(editor, event.clientX, event.clientY);
      const known = inside
        ? pointerBlockId(currentBands(editor, bandsRef), event.clientY, visibleIdRef.current)
        : null;
      const control = isControlLayer(event.target);
      setUi((state) =>
        reduceHandleUi(state, {
          type: "pointer-move",
          id: known ?? (control ? state.pointerId : null),
          engagedId: control ? (known ?? state.pointerId ?? state.engagedId ?? caretId) : null,
          outside: !inside,
        }),
      );
    };

    const onKeyDown = (event: KeyboardEvent): void => {
      if (menuLockRef.current || isHandleLayer(event.target)) {
        return;
      }
      setUi((state) =>
        reduceHandleUi(state, { type: "typing", typing: isTypingKey(event) || event.isComposing }),
      );
    };
    const onComposition = (): void => {
      setUi((state) => reduceHandleUi(state, { type: "typing", typing: true }));
    };

    window.addEventListener("pointermove", onPointerMove);
    const editable = editableOf(editor);
    editable?.addEventListener("keydown", onKeyDown, true);
    editable?.addEventListener("compositionstart", onComposition, true);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      editable?.removeEventListener("keydown", onKeyDown, true);
      editable?.removeEventListener("compositionstart", onComposition, true);
    };
  }, [caretId, editor]);

  // Re-resolves the target from the last pointer position. The bands are read
  // through `currentBands`, so this rebuilds them only when they are stale.
  const refreshPointerTarget = useCallback(
    (x?: number, y?: number): void => {
      if (x !== undefined && y !== undefined) {
        pointerRef.current = { x, y, present: true };
      }
      const pointer = pointerRef.current;
      if (!pointer?.present || isBlockDragArmed() || menuLockRef.current) {
        return;
      }
      const inside = insideEditorArea(editor, pointer.x, pointer.y);
      const known = inside
        ? pointerBlockId(currentBands(editor, bandsRef), pointer.y, visibleIdRef.current)
        : null;
      setUi((state) =>
        reduceHandleUi(state, {
          type: "pointer-move",
          id: known,
          engagedId: state.engagedId,
          outside: !inside,
        }),
      );
    },
    [editor],
  );

  // Every flush marks the bands stale. A structural batch also re-resolves the
  // target now, because a block may have appeared under the pointer. A text-only
  // batch (typing, caret moves) leaves the target to the next pointer move.
  useLayoutEffect(() => {
    const operations = take();
    bandsRef.current.stale = true;
    if (!isTextOnlyBatch(operations)) {
      refreshPointerTarget();
    }
  }, [refreshPointerTarget, take, version]);

  useLayoutEffect(() => {
    let frame = 0;
    const publish = (next: BlockHandlePaint | null): void => {
      if (next) {
        window.clearTimeout(hideTimer.current);
        hideTimer.current = 0;
        pathRef.current = next.target.path;
        if (!shownRef.current) {
          shownRef.current = true;
          setShown(true);
        }
        setPaint((current) => (samePaint(current, next) ? current : next));
        return;
      }
      if (!shownRef.current) {
        return;
      }
      shownRef.current = false;
      setShown(false);
      hideTimer.current = window.setTimeout(
        () => {
          hideTimer.current = 0;
          pathRef.current = null;
          setPaint(null);
        },
        reducedMotion() ? 0 : HANDLE_FADE_MS,
      );
    };
    // Paints only the visible target. While the handle is hidden (typing, no
    // target), this neither reads the DOM nor walks the document.
    const measure = (): void => {
      const next =
        visibleId === null || readOnly || hoverNone
          ? null
          : measurePaint(editor, visibleId, size, handleOptions, pathRef.current);
      publish(next);
    };
    measure();
    const editable = editableOf(editor);
    const viewport = editable?.closest("[data-block-viewport]");
    // Scroll can move the block under a still pointer. Re-resolve the target from
    // the last pointer position instead of a stale id.
    const onScroll = (): void => {
      bandsRef.current.stale = true;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        refreshPointerTarget();
        measure();
      });
    };
    // The editable's own size changes when an edit adds or removes a line. The
    // bands go stale and the paint is measured; the pointer target waits for the
    // next move, so a typed line never rebuilds the bands.
    const onLayoutChange = (): void => {
      bandsRef.current.stale = true;
      measure();
    };
    viewport?.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    const Observer = window.ResizeObserver;
    const observer = typeof Observer === "function" ? new Observer(onLayoutChange) : null;
    if (editable) {
      observer?.observe(editable);
    }
    if (viewport instanceof HTMLElement) {
      observer?.observe(viewport);
    }
    return () => {
      cancelAnimationFrame(frame);
      viewport?.removeEventListener("scroll", onScroll);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
      observer?.disconnect();
    };
  }, [editor, handleOptions, hoverNone, readOnly, refreshPointerTarget, size, version, visibleId]);

  useEffect(() => {
    return () => {
      window.clearTimeout(hideTimer.current);
    };
  }, []);

  const setMeasuredSize = useCallback((width: number, height: number) => {
    if (width <= 0 || height <= 0) {
      return;
    }
    setSize((current) =>
      current.width === width && current.height === height ? current : { width, height },
    );
  }, []);

  const addBelow = useCallback(() => {
    const path = pathRef.current;
    if (!path || readOnly) {
      return;
    }
    const ran = runEditorCommand(editor, insertParagraphBelow, { path }, { readOnly });
    if (!ran) {
      return;
    }
    const at = PathApi.next(path);
    const inserted = at === undefined ? undefined : editor.api.node(at)?.[0];
    if (inserted && ElementApi.isElement(inserted) && typeof inserted.id === "string") {
      onInsertedBelow?.(inserted.id);
    }
    retainScroll(() => {
      focusEditorWithoutScroll(editableOf(editor));
    });
  }, [editor, onInsertedBelow, readOnly]);

  const onHandleFocus = useCallback(() => {
    setUi((state) =>
      reduceHandleUi(state, {
        type: "engage",
        id: state.pointerId ?? state.engagedId ?? caretId,
      }),
    );
  }, [caretId]);

  const onHandleBlur = useCallback((related?: EventTarget | null) => {
    if (menuLockRef.current || isHandleLayer(related ?? null)) {
      return;
    }
    setUi((state) => reduceHandleUi(state, { type: "engage", id: null }));
  }, []);

  const holdMenu = useCallback((id: string | null) => {
    menuLockRef.current = id;
    setUi((state) => reduceHandleUi(state, { type: "engage", id }));
  }, []);

  // Hide the handle's current target at once. A drop uses this so the handle is
  // never painted at the slot the block came from.
  const clearPointer = useCallback(() => {
    setUi((state) =>
      reduceHandleUi(state, { type: "pointer-move", id: null, engagedId: null, outside: true }),
    );
  }, []);

  const rehover = useCallback(
    (x?: number, y?: number) => {
      refreshPointerTarget(x, y);
    },
    [refreshPointerTarget],
  );

  return {
    paint,
    shown,
    setMeasuredSize,
    addBelow,
    onHandleFocus,
    onHandleBlur,
    holdMenu,
    clearPointer,
    rehover,
    suppressed: readOnly || hoverNone,
  };
}
