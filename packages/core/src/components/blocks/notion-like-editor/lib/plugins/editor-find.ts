import { createElement, type ReactNode } from "react";
import {
  ElementApi,
  KEYS,
  PointApi,
  RangeApi,
  TextApi,
  createSlatePlugin,
  type Point,
  type SlateEditor,
} from "platejs";

import {
  findMatches,
  normalizeFindQuery,
  type FindMatch,
  type FindResult,
} from "../features/editor-find";
import { toggleOpen } from "./editor-toggle";

export type FindState = {
  open: boolean;
  query: string;
  matchCase: boolean;
  count: number;
  activeIndex: number;
  truncated: boolean;
};

type FindGroup = { index: number; match: FindMatch };

type FindCache = {
  children: SlateEditor["children"];
  query: string;
  matchCase: boolean;
  result: FindResult;
  // Matches keyed by the path of the text block that holds them.
  groups: Map<string, FindGroup[]>;
  // The resolved active index. Reads use this, never the plugin option, so reads write nothing.
  index: number;
};

type FindLeafProps = {
  attributes?: { className?: string };
  children?: ReactNode;
  leaf?: { findActive?: unknown };
};

// The decorated leaf carries findActive, set by decorate. Plate picks this renderer by the plugin key.
function FindHighlight({ attributes, children, leaf }: FindLeafProps) {
  const slateClass = typeof attributes?.className === "string" ? attributes.className : "";
  const active = leaf?.findActive === true;
  return createElement(
    "span",
    {
      ...attributes,
      "data-find-match": "",
      "data-find-active": active ? "" : undefined,
      className: `${slateClass} rounded-sm ${active ? "bg-primary/40" : "bg-primary/15"}`.trim(),
    },
    children,
  );
}

export const findPlugin = createSlatePlugin({
  key: "find",
  node: {
    isLeaf: true,
    isDecoration: true,
  },
  render: {
    node: FindHighlight,
  },
  options: {
    open: false,
    query: "",
    matchCase: false,
    activeIndex: 0,
    // Bumped by a Mod+F press so the bar moves focus to its input again.
    focusRequest: 0,
  },
  decorate: ({ editor, entry }) => {
    if (!editor.getOption(findPlugin, "open")) {
      return undefined;
    }

    const [node, path] = entry;
    if (!TextApi.isText(node)) {
      return undefined;
    }

    const cache = currentFind(editor);
    if (cache.result.matches.length === 0) {
      return undefined;
    }

    const block = editor.api.block({ at: path });
    if (block === undefined) {
      return undefined;
    }

    const groups = cache.groups.get(blockKey(block[1])) ?? [];
    const activeIndex = cache.index;
    const leafStart: Point = { path, offset: 0 };
    const leafEnd: Point = { path, offset: node.text.length };
    const ranges: { anchor: Point; focus: Point; find: true; findActive: boolean }[] = [];
    for (const { index, match } of groups) {
      const anchor = PointApi.compare(match.anchor, leafStart) < 0 ? leafStart : match.anchor;
      const focus = PointApi.compare(match.focus, leafEnd) > 0 ? leafEnd : match.focus;
      if (PointApi.compare(anchor, focus) < 0) {
        ranges.push({ anchor, focus, find: true, findActive: index === activeIndex });
      }
    }

    return ranges.length === 0 ? undefined : ranges;
  },
});

// The last computed result per editor. Recomputed when editor.children, the query or matchCase changes.
const caches = new WeakMap<SlateEditor, FindCache>();
// The start of the active match. It is the anchor to find the next active match after a document change.
const rememberedStarts = new WeakMap<SlateEditor, Point>();

function blockKey(path: readonly number[]): string {
  return path.join(",");
}

function clampIndex(value: number, result: FindResult): number {
  const count = result.matches.length;
  if (count === 0) {
    return 0;
  }
  return Math.min(Math.max(value, 0), count - 1);
}

// The first match whose anchor is at or after the point. Without a point, or none after it, 0.
function indexAtOrAfter(result: FindResult, point: Point | undefined): number {
  if (point === undefined) {
    return 0;
  }

  const index = result.matches.findIndex((match) => PointApi.compare(match.anchor, point) >= 0);
  return index < 0 ? 0 : index;
}

function rememberActive(editor: SlateEditor, cache: FindCache): void {
  const match = cache.result.matches[cache.index];
  if (match === undefined) {
    rememberedStarts.delete(editor);
  } else {
    rememberedStarts.set(editor, match.anchor);
  }
}

// Stores a result in the cache only. It writes no plugin option, so it is safe during render.
function cacheFind(editor: SlateEditor, result: FindResult, index: number): FindCache {
  const groups = new Map<string, FindGroup[]>();
  result.matches.forEach((match, matchIndex) => {
    const block = editor.api.block({ at: match.anchor.path });
    if (block === undefined) {
      return;
    }

    const key = blockKey(block[1]);
    const list = groups.get(key) ?? [];
    list.push({ index: matchIndex, match });
    groups.set(key, list);
  });

  const cache: FindCache = {
    children: editor.children,
    query: editor.getOption(findPlugin, "query"),
    matchCase: editor.getOption(findPlugin, "matchCase"),
    result,
    groups,
    index: clampIndex(index, result),
  };
  caches.set(editor, cache);
  rememberActive(editor, cache);
  return cache;
}

// Returns the cache for the current document. A new document keeps the active match at its place.
function currentFind(editor: SlateEditor): FindCache {
  const query = editor.getOption(findPlugin, "query");
  const matchCase = editor.getOption(findPlugin, "matchCase");
  const cached = caches.get(editor);
  if (
    cached !== undefined &&
    cached.children === editor.children &&
    cached.query === query &&
    cached.matchCase === matchCase
  ) {
    return cached;
  }

  const result = findMatches(editor, query, { matchCase });
  const sameQuery =
    cached !== undefined && cached.query === query && cached.matchCase === matchCase;
  const index = sameQuery ? indexAtOrAfter(result, rememberedStarts.get(editor)) : 0;
  return cacheFind(editor, result, index);
}

// Explicit moves only (navigation, query and match case changes). Writes the activeIndex option.
function setActiveIndex(editor: SlateEditor, index: number): void {
  const cache = currentFind(editor);
  cache.index = clampIndex(index, cache.result);
  rememberActive(editor, cache);
  editor.setOption(findPlugin, "activeIndex", cache.index);
}

// The matches of the current document, for the replace commands.
export function currentFindResult(editor: SlateEditor): FindResult {
  return currentFind(editor).result;
}

// Sets the active match to the first one at or after the point, after a replace.
export function settleFind(editor: SlateEditor, point: Point | undefined): void {
  const result = findMatches(editor, editor.getOption(findPlugin, "query"), {
    matchCase: editor.getOption(findPlugin, "matchCase"),
  });
  const cache = cacheFind(editor, result, indexAtOrAfter(result, point));
  editor.setOption(findPlugin, "activeIndex", cache.index);
  editor.api.redecorate();
}

export function openFind(editor: SlateEditor): void {
  editor.setOption(findPlugin, "open", true);
  editor.api.redecorate();
}

export function closeFind(editor: SlateEditor): void {
  editor.setOption(findPlugin, "open", false);
  editor.api.redecorate();
}

// The active match goes to the first match at or after the selection start.
function resetActiveToSelection(editor: SlateEditor): void {
  const cache = currentFind(editor);
  const start = editor.selection === null ? undefined : RangeApi.start(editor.selection);
  setActiveIndex(editor, indexAtOrAfter(cache.result, start));
  editor.api.redecorate();
}

export function setFindQuery(editor: SlateEditor, raw: string): void {
  editor.setOption(findPlugin, "query", normalizeFindQuery(raw));
  resetActiveToSelection(editor);
}

export function setFindMatchCase(editor: SlateEditor, value: boolean): void {
  editor.setOption(findPlugin, "matchCase", value);
  resetActiveToSelection(editor);
}

function moveActive(editor: SlateEditor, step: number): void {
  const cache = currentFind(editor);
  const count = cache.result.matches.length;
  if (count === 0) {
    return;
  }

  setActiveIndex(editor, (cache.index + step + count) % count);
  editor.api.redecorate();
}

export function findNext(editor: SlateEditor): void {
  moveActive(editor, 1);
}

export function findPrevious(editor: SlateEditor): void {
  moveActive(editor, -1);
}

export function findState(editor: SlateEditor): FindState {
  const cache = currentFind(editor);
  const count = cache.result.matches.length;
  return {
    open: editor.getOption(findPlugin, "open"),
    query: editor.getOption(findPlugin, "query"),
    matchCase: editor.getOption(findPlugin, "matchCase"),
    count,
    activeIndex: count === 0 ? -1 : cache.index,
    truncated: cache.result.truncated,
  };
}

export function findActiveMatch(editor: SlateEditor): FindMatch | undefined {
  const cache = currentFind(editor);
  if (cache.result.matches.length === 0) {
    return undefined;
  }

  return cache.result.matches[cache.index];
}

// Opens each collapsed toggle that hides the active match. Selection and history are untouched.
export function revealFindMatch(editor: SlateEditor): void {
  const match = findActiveMatch(editor);
  if (match === undefined) {
    return;
  }

  const path = match.anchor.path;
  for (let depth = 1; depth < path.length; depth += 1) {
    const childIndex = path[depth];
    const ancestor = editor.api.node(path.slice(0, depth));
    if (
      childIndex === undefined ||
      childIndex === 0 ||
      ancestor === undefined ||
      !ElementApi.isElement(ancestor[0]) ||
      ancestor[0].type !== KEYS.toggle
    ) {
      continue;
    }

    const id = ancestor[0].id;
    if (typeof id === "string" && id.length > 0) {
      toggleOpen(editor, id, true);
    }
  }
}
