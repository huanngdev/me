import {
  ElementApi,
  KEYS,
  PathApi,
  RangeApi,
  createSlatePlugin,
  nanoid,
  type Descendant,
  type SlateEditor,
  type TElement,
  type Point,
} from "platejs";

import type { EditorCommand } from "../commands/editor-commands";
import {
  elementAllowsMarks,
  FOOTNOTE_DEF_KEY,
  FOOTNOTE_REF_KEY,
} from "../document/editor-document-schema";
import { createFootnoteId, isFootnoteId } from "./editor-footnote-id";
import { plainText, type PlainTextHook } from "./editor-inline-date";
import { footnoteIndex, type FootnoteIndex } from "./editor-footnote-index";

export {
  footnoteIndex,
  footnoteIndexOf,
  footnoteReferenceOrdinal,
  type FootnoteIndex,
} from "./editor-footnote-index";

export function footnoteNumber(editor: SlateEditor, footnoteId: string): number | undefined {
  return footnoteIndex(editor).numbers.get(footnoteId);
}

function matchingEntries(
  editor: SlateEditor,
  type: string,
  footnoteId: string,
): [TElement, number[]][] {
  const entries: [TElement, number[]][] = [];
  for (const [node, path] of editor.api.nodes({
    at: [],
    voids: true,
    match: (candidate) =>
      ElementApi.isElement(candidate) &&
      candidate.type === type &&
      candidate.footnoteId === footnoteId,
  })) {
    if (ElementApi.isElement(node)) {
      entries.push([node, path]);
    }
  }

  return entries;
}

// The first definition in document order, or undefined when the id has none.
export function footnoteDefinitionEntry(
  editor: SlateEditor,
  footnoteId: string,
): [TElement, number[]] | undefined {
  return matchingEntries(editor, FOOTNOTE_DEF_KEY, footnoteId)[0];
}

export function footnoteReferenceEntries(
  editor: SlateEditor,
  footnoteId: string,
): [TElement, number[]][] {
  return matchingEntries(editor, FOOTNOTE_REF_KEY, footnoteId);
}

export function footnoteReferenceNode(footnoteId: string, id?: string): TElement {
  return {
    type: FOOTNOTE_REF_KEY,
    id: id ?? nanoid(10),
    footnoteId,
    children: [{ text: "" }],
  };
}

export function footnoteDefinitionNode(footnoteId: string, id?: string): TElement {
  return {
    type: FOOTNOTE_DEF_KEY,
    id: id ?? nanoid(10),
    footnoteId,
    children: [{ text: "" }],
  };
}

// A reference sits where an inline date sits: not in a link, a void, a code line, or a definition.
export function footnoteReferenceAllowedAt(editor: SlateEditor, point: Point): boolean {
  const block = editor.api.block({ at: point });
  if (!block || !ElementApi.isElement(block[0]) || !elementAllowsMarks(block[0].type)) {
    return false;
  }

  const blocked = editor.api.above({
    at: point,
    match: (node) =>
      ElementApi.isElement(node) && (node.type === KEYS.link || node.type === FOOTNOTE_DEF_KEY),
  });
  if (blocked !== undefined) {
    return false;
  }

  return editor.api.void({ at: point }) === undefined;
}

// Moves the caret to the end of the definition. False, and nothing changes, when the id has none.
export function selectFootnoteDefinition(editor: SlateEditor, footnoteId: string): boolean {
  const entry = footnoteDefinitionEntry(editor, footnoteId);
  if (entry === undefined) {
    return false;
  }

  const end = editor.api.end(entry[1]);
  if (end === undefined) {
    return false;
  }

  editor.tf.select(end);
  return true;
}

// Moves the caret right after the first reference. False, and nothing changes, when there is none.
export function selectFootnoteReference(editor: SlateEditor, footnoteId: string): boolean {
  const entry = footnoteReferenceEntries(editor, footnoteId)[0];
  if (entry === undefined) {
    return false;
  }

  // The point after the node. With no text after it, the caret stays on the node instead of
  // jumping into the next block, so a toggle that holds the reference still opens.
  const after = editor.api.after(entry[1]);
  const block = editor.api.block({ at: entry[1] });
  const inBlock =
    after !== undefined && block !== undefined && PathApi.isDescendant(after.path, block[1]);
  const target = inBlock ? after : editor.api.end(entry[1]);
  if (target === undefined) {
    return false;
  }

  editor.tf.select(target);
  return true;
}

function footnotePlainText(
  index: FootnoteIndex,
  node: TElement,
  body: () => string,
): string | undefined {
  if (node.type === FOOTNOTE_REF_KEY) {
    const number = isFootnoteId(node.footnoteId) ? index.numbers.get(node.footnoteId) : undefined;
    return `[${number ?? "?"}]`;
  }

  if (node.type === FOOTNOTE_DEF_KEY) {
    const number = isFootnoteId(node.footnoteId) ? index.numbers.get(node.footnoteId) : undefined;
    const text = body();
    return number === undefined ? text : `${number}. ${text}`;
  }

  return undefined;
}

function containsFootnote(node: Descendant): boolean {
  if (!ElementApi.isElement(node)) {
    return false;
  }

  return (
    node.type === FOOTNOTE_REF_KEY ||
    node.type === FOOTNOTE_DEF_KEY ||
    node.children.some((child) => containsFootnote(child))
  );
}

// Plain-text copy of a reference is [n], and of a definition is n. text. Registered after the
// inline date, so a fragment with both a footnote and a date is written here in full.
export const footnoteRefPlugin = createSlatePlugin({
  key: FOOTNOTE_REF_KEY,
  node: { isElement: true, isInline: true, isVoid: true },
}).overrideEditor(({ editor, tf: { setFragmentData } }) => ({
  transforms: {
    setFragmentData(data, originEvent) {
      setFragmentData(data, originEvent);
      const fragment = editor.api.getFragment();
      if (!fragment.some((node) => containsFootnote(node))) {
        return;
      }

      const index = footnoteIndex(editor);
      const hook: PlainTextHook = (node, body) => footnotePlainText(index, node, body);
      data.setData("text/plain", fragment.map((node) => plainText(node, hook)).join("\n"));
    },
  },
}));

export function footnoteInsertAllowed(editor: SlateEditor): boolean {
  const selection = editor.selection;
  return selection !== null && footnoteReferenceAllowedAt(editor, RangeApi.end(selection));
}

// A reference at the selection end, and a new empty definition at the end of the document.
// The caret lands in the new definition. One undo removes both.
export const insertFootnote: EditorCommand = {
  id: "inline.footnote",
  label: "Footnote",
  group: "insert",
  isEnabled: (editor) => editor.dom.readOnly !== true && footnoteInsertAllowed(editor),
  run: (editor) => {
    const selection = editor.selection;
    if (selection === null) {
      return;
    }

    const footnoteId = createFootnoteId();
    editor.tf.select(RangeApi.end(selection));
    editor.tf.insertNodes(footnoteReferenceNode(footnoteId));

    const at = [editor.children.length];
    editor.tf.insertNodes(footnoteDefinitionNode(footnoteId), { at, select: false });
    const start = editor.api.start(at);
    if (start !== undefined) {
      editor.tf.select(start);
    }
  },
};

// Every reference and every definition with this id goes in one undo step. Refs go first.
export const removeFootnote: EditorCommand<{ footnoteId: string }> = {
  id: "inline.footnote.remove",
  label: "Remove footnote",
  group: "action",
  run: (editor, { footnoteId }) => {
    for (;;) {
      const refs = footnoteReferenceEntries(editor, footnoteId);
      const last = refs[refs.length - 1];
      if (last === undefined) {
        break;
      }

      editor.tf.removeNodes({ at: last[1], voids: true });
    }

    for (;;) {
      const defs = matchingEntries(editor, FOOTNOTE_DEF_KEY, footnoteId);
      const last = defs[defs.length - 1];
      if (last === undefined) {
        break;
      }

      editor.tf.removeNodes({ at: last[1], voids: true });
    }
  },
};
