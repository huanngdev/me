import { ElementApi, type Descendant, type SlateEditor } from "platejs";

import { FOOTNOTE_DEF_KEY, FOOTNOTE_REF_KEY } from "../document/editor-document-schema";
import { isFootnoteId } from "./editor-footnote-id";

// Pure index helpers. The static renderer imports this file, so it must not import commands or plugins.
export type FootnoteIndex = {
  numbers: Map<string, number>; // footnoteId -> 1-based number
  refCounts: Map<string, number>; // footnoteId -> how many refs
  definitions: Set<string>; // footnoteIds that have a definition
};

// Numbers come from document order at read time. They are never stored on a node.
export function footnoteIndexOf(value: readonly Descendant[]): FootnoteIndex {
  const numbers = new Map<string, number>();
  const refCounts = new Map<string, number>();
  const definitions = new Set<string>();
  const visit = (node: Descendant): void => {
    if (!ElementApi.isElement(node)) {
      return;
    }

    if (node.type === FOOTNOTE_REF_KEY && isFootnoteId(node.footnoteId)) {
      const id = node.footnoteId;
      if (!numbers.has(id)) {
        numbers.set(id, numbers.size + 1);
      }
      refCounts.set(id, (refCounts.get(id) ?? 0) + 1);
    }

    if (node.type === FOOTNOTE_DEF_KEY && isFootnoteId(node.footnoteId)) {
      definitions.add(node.footnoteId);
    }

    node.children.forEach(visit);
  };
  value.forEach(visit);

  return { numbers, refCounts, definitions };
}

const indexCache = new WeakMap<object, FootnoteIndex>();

// Cached on the children array, which Slate replaces on every change.
export function footnoteIndex(editor: SlateEditor): FootnoteIndex {
  const cached = indexCache.get(editor.children);
  if (cached !== undefined) {
    return cached;
  }

  const index = footnoteIndexOf(editor.children);
  indexCache.set(editor.children, index);
  return index;
}

// Which reference of one footnote this node is, counted in document order from 1. Used by static HTML.
export function footnoteReferenceOrdinal(
  value: readonly Descendant[],
  footnoteId: string,
  refId: unknown,
): number {
  let ordinal = 0;
  let found = 0;
  const visit = (node: Descendant): void => {
    if (found > 0 || !ElementApi.isElement(node)) {
      return;
    }

    if (node.type === FOOTNOTE_REF_KEY && node.footnoteId === footnoteId) {
      ordinal += 1;
      if (node.id === refId) {
        found = ordinal;
      }
    }

    node.children.forEach(visit);
  };
  value.forEach(visit);

  return found > 0 ? found : 1;
}
