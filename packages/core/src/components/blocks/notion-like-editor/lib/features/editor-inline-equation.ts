import {
  ElementApi,
  KEYS,
  RangeApi,
  createSlatePlugin,
  nanoid,
  type Descendant,
  type SlateEditor,
  type TElement,
  type TRange,
} from "platejs";

import { elementAllowsMarks, isStoredEquationExpression } from "../document/editor-document-schema";

// Inline equation: an inline void with one stored expression. It is not a
// block equation, so the native @platejs/math plugins stay unregistered.
export const inlineEquationPlugin = createSlatePlugin({
  key: KEYS.inlineEquation,
  node: { isElement: true, isInline: true, isVoid: true },
}).overrideEditor(({ editor, tf: { setFragmentData } }) => ({
  transforms: {
    setFragmentData(data, originEvent) {
      setFragmentData(data, originEvent);
      // The DOM text of a void is the KaTeX output, so a copied equation would
      // be written as rendered math. Only a fragment with an equation is rewritten.
      const fragment = editor.api.getFragment();
      if (!fragment.some((node) => containsInlineEquation(node))) {
        return;
      }

      data.setData("text/plain", fragment.map((node) => plainText(node)).join("\n"));
    },
  },
}));

function containsInlineEquation(node: Descendant): boolean {
  if (!ElementApi.isElement(node)) {
    return false;
  }

  return (
    node.type === KEYS.inlineEquation ||
    node.children.some((child) => containsInlineEquation(child))
  );
}

function plainText(node: Descendant): string {
  if (!ElementApi.isElement(node)) {
    return "text" in node ? node.text : "";
  }

  if (node.type === KEYS.inlineEquation) {
    const tex = typeof node.texExpression === "string" ? node.texExpression : "";
    return `$${tex}$`;
  }

  return node.children.map((child) => plainText(child)).join("");
}

export function inlineEquationNode(expression: string, id?: string): TElement {
  return {
    type: KEYS.inlineEquation,
    id: id ?? nanoid(),
    texExpression: expression,
    children: [{ text: "" }],
  };
}

// Same places as the mention: never inside a link, a void, or a block without marks (a code line).
function inlineEquationAllowed(editor: SlateEditor, range: TRange): boolean {
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

// Returns the new node's id, or null when the selection is missing or cannot hold an inline equation.
export function insertInlineEquation(editor: SlateEditor, expression: string): string | null {
  const selection = editor.selection;
  if (
    selection === null ||
    !isStoredEquationExpression(expression) ||
    !inlineEquationAllowed(editor, selection)
  ) {
    return null;
  }

  const id = nanoid();
  editor.tf.withNewBatch(() => {
    if (!RangeApi.isCollapsed(selection)) {
      editor.tf.delete();
    }
    editor.tf.insertNodes(inlineEquationNode(expression, id));
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
