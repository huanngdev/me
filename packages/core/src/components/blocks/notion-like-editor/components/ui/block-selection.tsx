"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useEditorReadOnly, useEditorRef, useEditorSelector, usePluginOption } from "platejs/react";

import { listItemUnit } from "../../lib/features/editor-block-drop";
import {
  applySelectionMarks,
  isSideMarginPoint,
  marqueeBlockIds,
  MARQUEE_THRESHOLD_PX,
} from "../../lib/features/editor-block-selection";
import {
  blockSelectionPlugin,
  clearBlockSelection,
  setBlockSelection,
} from "../../lib/plugins/editor-block-selection";
import { findBlockById } from "../../lib/features/editor-synced-block";

type Marquee = { left: number; top: number; width: number; height: number };

// Painted on the selected blocks themselves. A fixed overlay measured from
// getBoundingClientRect drifts inside a transformed preview frame.
const SELECTION_STYLE = [
  "[data-block-selection-count], [data-block-selection-count] * { caret-color: transparent; }",
  "[data-block-selection-count] *::selection { background: transparent; }",
  "[data-block-selected] {",
  "border-radius: 0.375rem;",
  "background-color: color-mix(in oklab, var(--primary) 10%, transparent);",
  "box-shadow: 0 0 0 3px color-mix(in oklab, var(--primary) 10%, transparent);",
  "}",
  "body[data-block-dragging] [data-block-selected] { background-color: transparent; box-shadow: none; }",
].join(" ");

const CONTROL =
  "[data-block-handle], [data-block-menu], [data-block-menu-portal], [data-block-add-menu], button, a, input, textarea, select, [role='menu']";

function unitIds(editor: ReturnType<typeof useEditorRef>, ids: readonly string[]): string[] {
  const selected = new Set(ids);
  const marked: string[] = [];
  let cursor = 0;
  while (cursor < editor.children.length) {
    const [start, end] = listItemUnit(editor.children, cursor);
    if (start !== cursor || end <= start) {
      cursor += 1;
      continue;
    }
    const head = editor.children[start];
    const headId = head && "id" in head && typeof head.id === "string" ? head.id : "";
    if (headId.length > 0 && selected.has(headId)) {
      for (let index = start; index < end; index += 1) {
        const node = editor.children[index];
        if (node && "id" in node && typeof node.id === "string") {
          marked.push(node.id);
        }
      }
    }
    cursor = end;
  }
  return marked.length > 0 ? marked : [...ids];
}

function editorElement(): HTMLElement | null {
  const found = document.querySelector("[data-slate-editor]");
  return found instanceof HTMLElement ? found : null;
}

function topLevelBoxes(
  editor: ReturnType<typeof useEditorRef>,
): { id: string; top: number; bottom: number }[] {
  const boxes: { id: string; top: number; bottom: number }[] = [];
  let cursor = 0;
  while (cursor < editor.children.length) {
    const [start, end] = listItemUnit(editor.children, cursor);
    if (start !== cursor || end <= start) {
      cursor += 1;
      continue;
    }
    const node = editor.children[start];
    if (!node || !("id" in node) || typeof node.id !== "string") {
      cursor = end;
      continue;
    }
    const entry = findBlockById(editor, node.id);
    const dom: unknown = entry ? editor.api.toDOMNode(entry[0]) : null;
    if (dom instanceof HTMLElement) {
      const rect = dom.getBoundingClientRect();
      let bottom = rect.bottom;
      for (let index = start + 1; index < end; index += 1) {
        const nested = editor.children[index];
        if (!nested || !("id" in nested) || typeof nested.id !== "string") {
          continue;
        }
        const nestedEntry = findBlockById(editor, nested.id);
        const nestedDom: unknown = nestedEntry ? editor.api.toDOMNode(nestedEntry[0]) : null;
        if (nestedDom instanceof HTMLElement) {
          bottom = Math.max(bottom, nestedDom.getBoundingClientRect().bottom);
        }
      }
      boxes.push({ id: node.id, top: rect.top, bottom });
    }
    cursor = end;
  }
  return boxes;
}

export function BlockSelection() {
  const editor = useEditorRef();
  const readOnly = useEditorReadOnly();
  const ids = usePluginOption(blockSelectionPlugin, "ids");
  const revision = useEditorSelector((instance) => instance.operations.length, []);
  const [marquee, setMarquee] = useState<Marquee | null>(null);
  const [announce, setAnnounce] = useState("");
  const previousCount = useRef(0);
  const idsRef = useRef(ids);
  useEffect(() => {
    idsRef.current = ids;
  }, [ids]);

  useEffect(() => {
    const count = ids.length;
    if (count === previousCount.current) {
      return;
    }
    const previous = previousCount.current;
    previousCount.current = count;
    const frame = requestAnimationFrame(() => {
      if (count === 0) {
        if (previous > 0) {
          setAnnounce("Selection cleared");
        }
        return;
      }
      setAnnounce(count === 1 ? "1 block selected" : `${count} blocks selected`);
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [ids]);

  useEffect(() => {
    const editable = editorElement();
    if (!editable) {
      return;
    }
    if (readOnly || ids.length === 0) {
      if (readOnly && ids.length > 0) {
        clearBlockSelection(editor, false);
      }
      // Marks are only ever written with the count attribute, so without it there
      // is nothing to clear. A typing pass returns here without scanning the blocks.
      if (!readOnly && !editable.hasAttribute("data-block-selection-count")) {
        return;
      }
      editable.removeAttribute("data-block-selection-count");
      for (const node of editable.querySelectorAll("[data-block-selected]")) {
        node.removeAttribute("data-block-selected");
      }
      return;
    }
    applySelectionMarks(editable, unitIds(editor, ids));
  }, [editor, ids, readOnly, revision]);

  useEffect(() => {
    if (readOnly) {
      return;
    }

    const contentEdges = (
      editable: HTMLElement,
    ): {
      left: number;
      right: number;
      top: number;
      bottom: number;
    } | null => {
      let left = Number.POSITIVE_INFINITY;
      let right = Number.NEGATIVE_INFINITY;
      let top = Number.POSITIVE_INFINITY;
      let bottom = Number.NEGATIVE_INFINITY;
      for (const node of editable.querySelectorAll("[data-block-id]")) {
        if (!(node instanceof HTMLElement) || node.closest("[data-preview-path]")) {
          continue;
        }
        const rect = node.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) {
          continue;
        }
        left = Math.min(left, rect.left);
        right = Math.max(right, rect.right);
        top = Math.min(top, rect.top);
        bottom = Math.max(bottom, rect.bottom);
      }
      if (!Number.isFinite(left)) {
        return null;
      }
      return { left, right, top, bottom };
    };

    let startX = 0;
    let startY = 0;
    let active = false;
    let frameId = 0;
    let listening = false;

    const paint = (clientX: number, clientY: number): void => {
      const left = Math.min(startX, clientX);
      const top = Math.min(startY, clientY);
      const next = {
        left,
        top,
        width: Math.abs(clientX - startX),
        height: Math.abs(clientY - startY),
      };
      setMarquee(next);
      const hits = marqueeBlockIds(topLevelBoxes(editor), top, top + next.height);
      setBlockSelection(editor, hits);
      const editable = editorElement();
      const frameBox =
        editable?.closest("[data-block-viewport]") instanceof HTMLElement
          ? (editable.closest("[data-block-viewport]") as HTMLElement)
          : editable;
      if (!frameBox) {
        return;
      }
      const frameRect = frameBox.getBoundingClientRect();
      if (clientY < frameRect.top + 28) {
        frameBox.scrollTop -= 16;
      } else if (clientY > frameRect.bottom - 28) {
        frameBox.scrollTop += 16;
      }
    };

    const finish = (): void => {
      if (!listening) {
        return;
      }
      listening = false;
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", finish);
      document.removeEventListener("pointercancel", finish);
      if (frameId !== 0) {
        cancelAnimationFrame(frameId);
        frameId = 0;
      }
      active = false;
      setMarquee(null);
    };

    const onMove = (event: PointerEvent): void => {
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      if (!active) {
        if (dx * dx + dy * dy < MARQUEE_THRESHOLD_PX * MARQUEE_THRESHOLD_PX) {
          return;
        }
        active = true;
      }
      if (frameId !== 0) {
        cancelAnimationFrame(frameId);
      }
      frameId = requestAnimationFrame(() => {
        frameId = 0;
        paint(event.clientX, event.clientY);
      });
    };

    const onDown = (event: PointerEvent): void => {
      if (event.pointerType === "touch" || event.button !== 0 || listening) {
        return;
      }
      const editable = editorElement();
      const target = event.target;
      if (!editable || !(target instanceof Element)) {
        return;
      }
      const frame =
        editable.closest("[data-block-viewport]") ??
        editable.closest("[data-editor-scroll]") ??
        editable.parentElement ??
        editable;
      if (!frame.contains(target)) {
        return;
      }
      if (
        idsRef.current.length > 0 &&
        target.closest("[data-block-id]") &&
        !target.closest(CONTROL)
      ) {
        clearBlockSelection(editor, false);
        return;
      }
      const edges = contentEdges(editable);
      if (!edges) {
        return;
      }
      const onControl =
        target.closest(
          "[data-block-handle], [data-block-handle-gutter], button, a, input, textarea, select, [role='menu'], [data-block-menu]",
        ) !== null;
      if (
        !isSideMarginPoint({
          clientX: event.clientX,
          clientY: event.clientY,
          contentLeft: edges.left,
          contentRight: edges.right,
          contentTop: edges.top,
          contentBottom: edges.bottom,
          inFrame: true,
          onControl,
        })
      ) {
        return;
      }
      startX = event.clientX;
      startY = event.clientY;
      active = false;
      listening = true;
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", finish);
      document.addEventListener("pointercancel", finish);
    };

    const onFocusOut = (event: FocusEvent): void => {
      if (idsRef.current.length === 0) {
        return;
      }
      const next = event.relatedTarget;
      if (
        next instanceof Element &&
        next.closest(
          "[data-slate-editor], [data-block-handle], [data-block-menu], [data-block-menu-portal]",
        )
      ) {
        return;
      }
      clearBlockSelection(editor, false);
    };

    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("focusout", onFocusOut);
      finish();
    };
  }, [editor, readOnly]);

  if (readOnly) {
    return null;
  }

  return (
    <>
      <style>{SELECTION_STYLE}</style>
      <div className="sr-only" aria-live="polite">
        {announce}
      </div>
      {marquee
        ? createPortal(
            <div
              data-block-marquee=""
              aria-hidden="true"
              className="bg-primary/10 pointer-events-none fixed z-30 rounded-sm"
              style={{
                top: marquee.top,
                left: marquee.left,
                width: marquee.width,
                height: marquee.height,
              }}
            />,
            document.body,
          )
        : null}
    </>
  );
}
