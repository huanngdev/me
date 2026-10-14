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
  type TRange,
} from "platejs";

import type { EditorCommand } from "../commands/editor-commands";
import { elementAllowsMarks } from "../document/editor-document-schema";
import { formatStoredDate, isStoredDate } from "./editor-date-value";

// Inline date: an inline void holding one stored calendar date. It is not in @platejs/date,
// so the plugin is defined here the same way as the inline equation.
export const inlineDatePlugin = createSlatePlugin({
  key: KEYS.date,
  node: { isElement: true, isInline: true, isVoid: true },
}).overrideEditor(({ editor, tf: { setFragmentData } }) => ({
  transforms: {
    setFragmentData(data, originEvent) {
      setFragmentData(data, originEvent);
      // The inline equation's override runs first (this plugin is registered after it), so a
      // fragment with both an equation and a date is written here in full.
      const fragment = editor.api.getFragment();
      if (!fragment.some((node) => containsInlineDate(node))) {
        return;
      }

      data.setData("text/plain", fragment.map((node) => plainText(node)).join("\n"));
    },
  },
}));

function containsInlineDate(node: Descendant): boolean {
  if (!ElementApi.isElement(node)) {
    return false;
  }

  return node.type === KEYS.date || node.children.some((child) => containsInlineDate(child));
}

// A hook returns a node's copied text, or undefined to keep the default. `body` is the node's children as text.
export type PlainTextHook = (node: TElement, body: () => string) => string | undefined;

// Matches the inline equation's plain text, so a mixed fragment keeps both.
export function plainText(node: Descendant, hook?: PlainTextHook): string {
  if (!ElementApi.isElement(node)) {
    return "text" in node ? node.text : "";
  }

  const body = (): string => node.children.map((child) => plainText(child, hook)).join("");
  const custom = hook?.(node, body);
  if (custom !== undefined) {
    return custom;
  }

  if (node.type === KEYS.date) {
    return formatStoredDate(node.date);
  }

  if (node.type === KEYS.inlineEquation) {
    const tex = typeof node.texExpression === "string" ? node.texExpression : "";
    return `$${tex}$`;
  }

  return body();
}

export function inlineDateNode(date: string, id?: string): TElement {
  return {
    type: KEYS.date,
    id: id ?? nanoid(),
    date,
    children: [{ text: "" }],
  };
}

// Same places as the inline equation: never inside a link, a void, or a block without marks (a code line).
function inlineDateAllowed(editor: SlateEditor, range: TRange): boolean {
  if (
    editor.api.some({
      at: range,
      match: (node) => ElementApi.isElement(node) && node.type === KEYS.link,
    })
  ) {
    return false;
  }

  if (editor.api.void({ at: range }) !== undefined) {
    return false;
  }

  for (const point of [RangeApi.start(range), RangeApi.end(range)]) {
    const block = editor.api.block({ at: point });
    if (!block || !ElementApi.isElement(block[0]) || !elementAllowsMarks(block[0].type)) {
      return false;
    }
  }

  return true;
}

// Returns the new node's id, or null when the selection is missing or cannot hold an inline date.
// A collapsed caret inserts at the caret; an expanded selection is replaced.
export function insertInlineDate(editor: SlateEditor, date: string): string | null {
  const selection = editor.selection;
  if (selection === null || !isStoredDate(date) || !inlineDateAllowed(editor, selection)) {
    return null;
  }

  const id = nanoid();
  editor.tf.withNewBatch(() => {
    if (!RangeApi.isCollapsed(selection)) {
      editor.tf.delete();
    }
    editor.tf.insertNodes(inlineDateNode(date, id));
    for (const [, path] of editor.api.nodes({
      at: [],
      voids: true,
      match: (node) => ElementApi.isElement(node) && node.id === id,
    })) {
      const after = editor.api.after(path);
      if (after !== undefined) {
        editor.tf.select(after);
      }
      break;
    }
  });
  return id;
}

type InlineDateRefusal = "span" | "unavailable";

// Why an inline date cannot be inserted over the current selection, or undefined when it can.
export function inlineDateRefusal(editor: SlateEditor): InlineDateRefusal | undefined {
  const selection = editor.selection;
  if (selection === null) {
    return "unavailable";
  }

  if (!RangeApi.isCollapsed(selection)) {
    const start = editor.api.block({ at: RangeApi.start(selection) });
    const end = editor.api.block({ at: RangeApi.end(selection) });
    if (!start || !end || !PathApi.equals(start[1], end[1])) {
      return "span";
    }

    if (
      editor.api.some({
        at: selection,
        voids: true,
        match: (node) => ElementApi.isElement(node) && editor.api.isVoid(node),
      })
    ) {
      return "unavailable";
    }
  }

  return inlineDateAllowed(editor, selection) ? undefined : "unavailable";
}

// The node and its path, or undefined when no inline date has this id.
export function inlineDateEntry(editor: SlateEditor, id: string): [TElement, number[]] | undefined {
  const entry = editor.api.node({
    at: [],
    voids: true,
    match: (node) => ElementApi.isElement(node) && node.type === KEYS.date && node.id === id,
  });
  if (entry === undefined || !ElementApi.isElement(entry[0])) {
    return undefined;
  }

  return [entry[0], entry[1]];
}

export const setInlineDate: EditorCommand<{ id: string; date: string }> = {
  id: "inline.date.set",
  label: "Set date",
  group: "action",
  run: (editor, { id, date }) => {
    const entry = inlineDateEntry(editor, id);
    if (entry !== undefined && isStoredDate(date)) {
      editor.tf.setNodes({ date }, { at: entry[1], voids: true });
    }
  },
};

export const removeInlineDate: EditorCommand<{ id: string }> = {
  id: "inline.date.remove",
  label: "Remove date",
  group: "action",
  run: (editor, { id }) => {
    const entry = inlineDateEntry(editor, id);
    if (entry !== undefined) {
      editor.tf.removeNodes({ at: entry[1], voids: true });
    }
  },
};
