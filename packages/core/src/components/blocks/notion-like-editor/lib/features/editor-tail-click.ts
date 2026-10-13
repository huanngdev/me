import type { MouseEvent } from "react";
import { ElementApi, KEYS, NodeApi, TextApi, type SlateEditor, type TNode } from "platejs";

import { focusEditorWithoutScroll, retainScroll } from "../../components/ui/block-toolbar";
import { insertParagraphBelow, runEditorCommand } from "../commands/editor-commands";
import { clearBlockSelection } from "../plugins/editor-block-selection";
import { editorOptions } from "../plugins/editor-config";

export type TailClickAction = "append" | "focus-last" | "none";

// An empty plain paragraph: no list marker and no text, so nothing to add to.
function isEmptyPlainParagraph(node: TNode): boolean {
  return (
    ElementApi.isElement(node) &&
    node.type === KEYS.p &&
    node.listStyleType === undefined &&
    node.children.every((child) => TextApi.isText(child)) &&
    NodeApi.string(node) === ""
  );
}

// What a click in the empty space below the document does. `last` is the
// document's last top-level node.
export function tailClickAction(last: TNode | undefined, readOnly: boolean): TailClickAction {
  if (readOnly || last === undefined || !ElementApi.isElement(last)) {
    return "none";
  }
  return isEmptyPlainParagraph(last) ? "focus-last" : "append";
}

// A primary click on the editable itself, below its last block, is the empty
// space under the document. Returns true when the click is handled, which stops
// Slate's own mousedown handling. With the appendOnTailClick option off, the
// browser handles every click.
export function handleTailMouseDown(
  editor: SlateEditor,
  event: MouseEvent<HTMLElement>,
  readOnly: boolean,
): true | undefined {
  if (!editorOptions(editor).appendOnTailClick) {
    return undefined;
  }
  if (event.button !== 0 || event.target !== event.currentTarget) {
    return undefined;
  }
  const lastIndex = editor.children.length - 1;
  const last = editor.children[lastIndex];
  const lastDom = last ? editor.api.toDOMNode(last) : undefined;
  if (
    !(lastDom instanceof HTMLElement) ||
    event.clientY <= lastDom.getBoundingClientRect().bottom
  ) {
    return undefined;
  }

  const action = tailClickAction(last, readOnly);
  if (action === "none") {
    return undefined;
  }

  event.preventDefault();
  clearBlockSelection(editor, false);
  const root = event.currentTarget;
  retainScroll(() => {
    if (action === "append") {
      runEditorCommand(editor, insertParagraphBelow, { path: [lastIndex] });
    } else {
      const start = editor.api.start([lastIndex]);
      if (start) {
        editor.tf.select(start);
      }
    }
    focusEditorWithoutScroll(root);
  });
  return true;
}
