import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ElementApi, PathApi, type SlateEditor } from "platejs";
import { useEditorReadOnly, useEditorRef, useEditorSelector } from "platejs/react";

import { focusEditorWithoutScroll, retainScroll } from "../components/ui/block-toolbar";
import { insertParagraphBelow, runEditorCommand } from "../lib/commands/editor-commands";
import {
  BLOCK_HANDLE_HEIGHT,
  BLOCK_HANDLE_WIDTH,
  blockHandleGutterId,
  blockHandleTarget,
  chainAtPath,
  chainFromDom,
  handleCoversForeignBlock,
  initialHandleUi,
  isBlockDragArmed,
  isTypingKey,
  placeBlockHandle,
  reduceHandleUi,
  targetBlockAtPath,
  visibleHandleId,
  type BlockHandlePaint,
  type HandleFrame,
  type HandleUiState,
} from "../lib/features/editor-block-handle";
import { findBlockById } from "../lib/features/editor-synced-block";

export type { BlockHandlePaint };

type HandleOptions = {
  onInsertedBelow?: (blockId: string) => void;
};

type LineMeasure = {
  lineTop: number;
  lineHeight: number;
  blockLeft: number;
  blockTop: number;
  blockBottom: number;
};

export type BlockHandleController = {
  paint: BlockHandlePaint | null;
  shown: boolean;
  setMeasuredSize: (width: number, height: number) => void;
  addBelow: () => void;
  onHandleFocus: () => void;
  onHandleBlur: (related?: EventTarget | null) => void;
  suppressed: boolean;
  holdMenu: (id: string | null) => void;
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

function textValue(node: Node): string {
  return node.nodeType === Node.TEXT_NODE ? (node.nodeValue ?? "") : "";
}

function textWithContent(node: Element): Node | null {
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  let current = walker.nextNode();
  while (current) {
    if (textValue(current).trim().length > 0) {
      return current;
    }
    current = walker.nextNode();
  }
  return null;
}

function firstLineText(element: HTMLElement): Node | null {
  const strings = element.querySelectorAll("[data-slate-string='true']");
  for (const stringNode of strings) {
    if (!(stringNode instanceof HTMLElement) || stringNode.closest("[data-preview-path]")) {
      continue;
    }
    const text = textWithContent(stringNode);
    if (text) {
      return text;
    }
  }

  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let current = walker.nextNode();
  while (current) {
    if (textValue(current).trim().length > 0) {
      const parent = current.parentElement;
      if (!parent?.closest("button, [data-slot='button'], [role='button']")) {
        return current;
      }
    }
    current = walker.nextNode();
  }
  return null;
}

function firstLineBox(element: HTMLElement): LineMeasure | null {
  const block = element.getBoundingClientRect();
  const text = firstLineText(element);
  const value = text ? textValue(text) : "";
  if (text && value.length > 0) {
    try {
      const range = document.createRange();
      range.setStart(text, 0);
      range.setEnd(text, 1);
      const rect = range.getClientRects()[0];
      if (rect && rect.height > 0) {
        return {
          lineTop: rect.top,
          lineHeight: rect.height,
          blockLeft: block.left,
          blockTop: block.top,
          blockBottom: block.bottom,
        };
      }
    } catch {
      // An unmeasured range falls through to the element box.
    }
  }

  if (block.height <= 0 || block.width <= 0) {
    return null;
  }

  return {
    lineTop: block.top,
    lineHeight: block.height,
    blockLeft: block.left,
    blockTop: block.top,
    blockBottom: block.bottom,
  };
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
  if (hit.closest("[data-block-handle], [data-block-handle-tooltip], [data-block-menu]")) {
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
    target.closest("[data-block-handle], [data-block-handle-tooltip], [data-block-menu]") !== null
  );
}

function measurePaint(
  editor: SlateEditor,
  id: string,
  size: { width: number; height: number },
): BlockHandlePaint | null {
  const entry = findBlockById(editor, id);
  if (!entry || typeof entry[0].type !== "string") {
    return null;
  }
  const dom = editor.api.toDOMNode(entry[0]);
  if (!(dom instanceof HTMLElement)) {
    return null;
  }
  const line = firstLineBox(dom);
  if (!line) {
    return null;
  }
  const chain = chainAtPath(editor, entry[1]);
  const gutterId = blockHandleGutterId(chain, id);
  let gutterLeft = line.blockLeft;
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
    { lineTop: line.lineTop, lineHeight: line.lineHeight, blockLeft: gutterLeft },
    size,
    { width: window.innerWidth, height: window.innerHeight },
    frameOf(dom),
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
    blockLeft: line.blockLeft,
    blockTop: line.blockTop,
    blockBottom: line.blockBottom,
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
  const opCount = useEditorSelector((instance) => instance.operations.length, []);
  const caretId = useEditorSelector((instance) => {
    const selection = instance.selection;
    if (!selection) {
      return null;
    }
    return targetBlockAtPath(instance, selection.anchor.path)?.id ?? null;
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
  const visibleId = visibleHandleId({ ...ui, caretId, readOnly, hoverNone });

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
      // The open menu keeps its target. A pointer move must not retarget or dismiss it.
      if (menuLockRef.current) {
        return;
      }
      if (isHandleLayer(event.target)) {
        setUi((state) => {
          const held = state.pointerId ?? state.engagedId ?? caretId;
          return reduceHandleUi(state, {
            type: "pointer-move",
            id: state.pointerId ?? held,
            engagedId: held,
          });
        });
        return;
      }
      const element =
        event.target instanceof Element
          ? event.target
          : event.target instanceof Node
            ? event.target.parentElement
            : null;
      const picked = element ? blockHandleTarget(chainFromDom(editor, element)) : null;
      const known = picked && findBlockById(editor, picked.id) ? picked.id : null;
      setUi((state) => reduceHandleUi(state, { type: "pointer-move", id: known, engagedId: null }));
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
    const measure = (): void => {
      const next =
        visibleId === null || readOnly || hoverNone ? null : measurePaint(editor, visibleId, size);
      publish(next);
    };
    measure();
    const editable = editableOf(editor);
    const viewport = editable?.closest("[data-block-viewport]");
    const onScroll = (): void => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    viewport?.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    const Observer = window.ResizeObserver;
    const observer = typeof Observer === "function" ? new Observer(onScroll) : null;
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
  }, [editor, hoverNone, opCount, readOnly, size, visibleId]);

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

  return {
    paint,
    shown,
    setMeasuredSize,
    addBelow,
    onHandleFocus,
    onHandleBlur,
    holdMenu,
    suppressed: readOnly || hoverNone,
  };
}
