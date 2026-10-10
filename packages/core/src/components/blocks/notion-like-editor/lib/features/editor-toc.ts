import { ElementApi, KEYS, NodeApi, PathApi, type SlateEditor, type TElement } from "platejs";

import type { EditorCommand } from "../commands/editor-commands";
import { headingAnchorId } from "../../components/elements/heading-element";
import { toggleOpen } from "../plugins/editor-toggle";

export const TOC_DEPTHS = [1, 2, 3] as const;
export type TocDepth = (typeof TOC_DEPTHS)[number];
export const TOC_DEFAULT_DEPTH: TocDepth = 3;
export const TOC_EMPTY_PLACEHOLDER = "Add headings to build a table of contents.";
export const TOC_UNTITLED = "Untitled";

export type TocEntry = {
  id: string;
  depth: TocDepth;
  title: string;
  path: number[];
};

// @platejs/toc 53.0.0 getHeadingList drops an empty title, keeps raw NodeApi.string,
// and lists h4–h6. onContentScroll uses behavior "instant" and does not move the
// caret or open a toggle. This outline is the document's h1–h3 blocks instead.
export function isTocDepth(value: unknown): value is TocDepth {
  return value === 1 || value === 2 || value === 3;
}

export function storedTocDepth(node: TElement): TocDepth {
  return isTocDepth(node.maxDepth) ? node.maxDepth : TOC_DEFAULT_DEPTH;
}

export function headingPlainText(node: TElement): string {
  return NodeApi.string(node).replace(/\s+/g, " ").trim();
}

function headingDepth(type: string): TocDepth | undefined {
  if (type === KEYS.h1) {
    return 1;
  }
  if (type === KEYS.h2) {
    return 2;
  }
  if (type === KEYS.h3) {
    return 3;
  }
  return undefined;
}

export function tocEntries(editor: SlateEditor, maxDepth: TocDepth): TocEntry[] {
  // A synced_ref is a void and is not a heading, so a reference does not list a heading twice.
  const entries: TocEntry[] = [];
  for (const [node, path] of editor.api.nodes({
    at: [],
    match: (candidate) => {
      if (!ElementApi.isElement(candidate) || typeof candidate.type !== "string") {
        return false;
      }
      const depth = headingDepth(candidate.type);
      return depth !== undefined && depth <= maxDepth;
    },
  })) {
    if (!ElementApi.isElement(node) || typeof node.id !== "string" || node.id.length === 0) {
      continue;
    }
    const depth = typeof node.type === "string" ? headingDepth(node.type) : undefined;
    if (depth === undefined) {
      continue;
    }
    entries.push({
      id: node.id,
      depth,
      title: headingPlainText(node),
      path: [...path],
    });
  }
  return entries;
}

export function shallowestDepth(entries: readonly TocEntry[]): TocDepth {
  let shallowest: TocDepth = TOC_DEFAULT_DEPTH;
  for (const entry of entries) {
    if (entry.depth < shallowest) {
      shallowest = entry.depth;
    }
  }
  return shallowest;
}

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function openClosedAncestors(editor: SlateEditor, path: readonly number[]): void {
  for (let length = 1; length < path.length; length += 1) {
    const parent = editor.api.node(path.slice(0, length));
    if (!parent || !ElementApi.isElement(parent[0]) || parent[0].type !== KEYS.toggle) {
      continue;
    }
    const id = parent[0].id;
    if (typeof id !== "string" || id.length === 0) {
      continue;
    }
    toggleOpen(editor, id, true);
  }
}

function scrollingParent(element: HTMLElement): HTMLElement | null {
  let parent = element.parentElement;
  while (parent) {
    const overflow = getComputedStyle(parent).overflowY;
    if (
      (overflow === "auto" || overflow === "scroll") &&
      parent.scrollHeight > parent.clientHeight + 1
    ) {
      return parent;
    }
    parent = parent.parentElement;
  }
  return null;
}

function placeCaret(editor: SlateEditor, entry: TocEntry, readOnly: boolean): void {
  const element = document.getElementById(headingAnchorId(entry.id));
  if (readOnly) {
    if (!element) {
      return;
    }
    element.tabIndex = -1;
    element.setAttribute("tabindex", "-1");
    element.focus({ preventScroll: true });
    return;
  }
  const start = editor.api.start(entry.path);
  if (!start) {
    return;
  }
  // Selecting without focus updates the model only. The visible caret needs the editor focused.
  editor.tf.withoutSaving(() => {
    editor.tf.select(start, { focus: true });
  });
}

function revealTarget(editor: SlateEditor, entry: TocEntry, readOnly: boolean): void {
  const behavior = prefersReducedMotion() ? "auto" : "smooth";
  const element = document.getElementById(headingAnchorId(entry.id));
  const scroller = element && behavior === "smooth" ? scrollingParent(element) : null;
  if (element) {
    element.scrollIntoView({ behavior, block: "start" });
  }
  // Slate scrolls a new selection with scrollMode "if-needed". Doing that while a
  // smooth scroll is running pulls the heading to the middle of the pane. Wait
  // until the scroll finishes, when the heading is already in view.
  if (scroller) {
    let placed = false;
    const place = () => {
      if (placed) {
        return;
      }
      placed = true;
      placeCaret(editor, entry, readOnly);
    };
    let moved = false;
    const mark = () => {
      moved = true;
    };
    scroller.addEventListener("scroll", mark);
    scroller.addEventListener(
      "scrollend",
      () => {
        scroller.removeEventListener("scroll", mark);
        place();
      },
      { once: true },
    );
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!moved) {
          scroller.removeEventListener("scroll", mark);
          place();
        }
      });
    });
    return;
  }
  placeCaret(editor, entry, readOnly);
}

export function activateTocEntry(editor: SlateEditor, entry: TocEntry, readOnly: boolean): void {
  openClosedAncestors(editor, entry.path);
  const reveal = () => {
    revealTarget(editor, entry, readOnly);
  };
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(reveal);
    return;
  }
  reveal();
}

function tocNode(): TElement {
  return { type: KEYS.toc, children: [{ text: "" }] };
}

export function insertTocBlock(editor: SlateEditor): void {
  const current = editor.api.block({ highest: true });
  if (!current) {
    editor.tf.insertNodes(tocNode(), { at: [0], select: true });
    return;
  }
  const at = PathApi.next(current[1]);
  if (!at) {
    return;
  }
  editor.tf.insertNodes(tocNode(), { at, select: true });
}

// Insert a table of contents as the next sibling of `path`, inside its
// container. Used by the Add picker.
export function insertTocBelow(editor: SlateEditor, path: readonly number[]): void {
  const at = PathApi.next([...path]);
  if (!at) {
    return;
  }
  editor.tf.insertNodes(tocNode(), { at, select: true });
}

export function tocAbove(editor: SlateEditor): [TElement, number[]] | undefined {
  const entry = editor.api.above({
    match: (node) => ElementApi.isElement(node) && node.type === KEYS.toc,
    voids: true,
  });
  if (!entry || !ElementApi.isElement(entry[0])) {
    return undefined;
  }
  return [entry[0], entry[1]];
}

export function setTocDepth(editor: SlateEditor, path: number[], depth: TocDepth): void {
  const node = editor.api.node(path);
  if (!node || !ElementApi.isElement(node[0]) || node[0].type !== KEYS.toc) {
    return;
  }
  const current = isTocDepth(node[0].maxDepth) ? node[0].maxDepth : undefined;
  const stored = depth === TOC_DEFAULT_DEPTH ? undefined : depth;
  if (current === stored) {
    return;
  }
  if (stored === undefined) {
    editor.tf.unsetNodes("maxDepth", { at: path });
    return;
  }
  editor.tf.setNodes({ maxDepth: stored }, { at: path });
}

export function removeToc(editor: SlateEditor, path: number[]): void {
  editor.tf.removeNodes({ at: path, voids: true });
  if (editor.children.length === 0) {
    editor.tf.insertNodes({ type: KEYS.p, children: [{ text: "" }] }, { at: [0] });
  }
}

export const insertToc: EditorCommand = {
  id: "block.insert.toc",
  label: "Table of contents",
  group: "insert",
  run: (editor) => {
    insertTocBlock(editor);
  },
};

export const setTocDepthCommand: EditorCommand<TocDepth> = {
  id: "block.toc.set-depth",
  label: "Table of contents depth",
  group: "action",
  isEnabled: (editor) => tocAbove(editor) !== undefined,
  run: (editor, depth) => {
    const entry = tocAbove(editor);
    if (!entry) {
      return;
    }
    setTocDepth(editor, entry[1], depth);
  },
};

export const removeTocCommand: EditorCommand = {
  id: "block.toc.remove",
  label: "Delete",
  group: "action",
  isEnabled: (editor) => tocAbove(editor) !== undefined,
  run: (editor) => {
    const entry = tocAbove(editor);
    if (!entry) {
      return;
    }
    removeToc(editor, entry[1]);
  },
};
