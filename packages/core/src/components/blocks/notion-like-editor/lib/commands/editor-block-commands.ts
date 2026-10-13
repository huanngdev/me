import { ElementApi, KEYS, PathApi, TextApi, type SlateEditor, type TElement } from "platejs";
import { deleteBlockAt, duplicateBlockAt } from "../features/editor-block-menu";
import {
  blockMoveDirection,
  blockMoveTarget,
  captureEditorScroll,
  moveBlockAt,
  settleMovedBlock,
  siblingMove,
} from "../features/editor-block-drop";
import { footnoteDefinitionIdAt, removeFootnote } from "../features/editor-footnote";
import { runEditorCommand } from "./editor-command-runner";
import type { EditorCommand } from "./editor-command-runner";

export function directText(node: TElement): string {
  let text = "";
  for (const child of node.children) {
    if (TextApi.isText(child)) {
      text += child.text;
    }
  }

  return text;
}
export function isPlainParagraph(node: TElement): boolean {
  return node.type === KEYS.p && node.listStyleType === undefined;
}
function selectPlainParagraph(editor: SlateEditor, path: number[]): void {
  const entry = editor.api.node(path);
  const node = entry?.[0];
  if (entry && entry[1].length === 1 && ElementApi.isElement(node) && isPlainParagraph(node)) {
    const start = editor.api.start(path);
    if (start) {
      editor.tf.select(start);
    }
    return;
  }

  editor.tf.insertNodes({ type: KEYS.p, children: [{ text: "" }] }, { at: path, select: true });
}
export const insertDivider: EditorCommand = {
  id: "block.insert.divider",
  label: "Divider",
  group: "insert",
  run: (editor) => {
    const entry = editor.api.block({ highest: true });
    if (!entry || !ElementApi.isElement(entry[0]) || typeof entry[0].type !== "string") {
      return;
    }

    const [node, path] = entry;
    let hrPath = path;
    if (path.length === 1 && isPlainParagraph(node) && directText(node).length === 0) {
      const drop = Object.keys(node).filter(
        (key) => key !== "type" && key !== "children" && key !== "id",
      );
      if (drop.length > 0) {
        editor.tf.unsetNodes(drop, { at: path });
      }
      editor.tf.setNodes({ type: KEYS.hr }, { at: path });
    } else {
      const at = PathApi.next(path);
      if (!at) {
        return;
      }

      editor.tf.insertNodes({ type: KEYS.hr, children: [{ text: "" }] }, { at, select: false });
      hrPath = at;
    }

    const after = PathApi.next(hrPath);
    if (!after) {
      return;
    }

    selectPlainParagraph(editor, after);
  },
};
export const insertParagraphBelow: EditorCommand<{ path: number[] }> = {
  id: "block.insert.paragraph-below",
  label: "Add below",
  group: "insert",
  run: (editor, payload) => {
    const entry = editor.api.node(payload.path);
    if (!entry || !ElementApi.isElement(entry[0])) {
      return;
    }

    const at = PathApi.next(payload.path);
    if (!at) {
      return;
    }

    editor.tf.insertNodes({ type: KEYS.p, children: [{ text: "" }] }, { at, select: true });
    const start = editor.api.start(at);
    if (start) {
      editor.tf.select(start);
    }
  },
};
export const duplicateBlock: EditorCommand<{ path: number[] }> = {
  id: "block.menu.duplicate",
  label: "Duplicate",
  group: "action",
  run: (editor, payload) => {
    duplicateBlockAt(editor, payload.path);
  },
};
// A definition goes with its references, in the same undo step. Other blocks delete as before.
export const deleteBlock: EditorCommand<{ path: number[] }> = {
  id: "block.menu.delete",
  label: "Delete",
  group: "action",
  run: (editor, payload) => {
    const footnoteId = footnoteDefinitionIdAt(editor, payload.path);
    if (footnoteId !== undefined) {
      removeFootnote.run(editor, { footnoteId });
      return;
    }
    deleteBlockAt(editor, payload.path);
  },
};
export const moveBlock: EditorCommand<{ from: number[]; to: number[] }> = {
  id: "block.move",
  label: "Move block",
  group: "action",
  run: (editor, payload) => {
    moveBlockAt(editor, payload.from, payload.to);
  },
};
function mentionComboboxOpen(editor: SlateEditor): boolean {
  const type = editor.getType(KEYS.mentionInput);
  for (const [node] of editor.api.nodes({
    at: [],
    match: (candidate) => ElementApi.isElement(candidate) && candidate.type === type,
  })) {
    if (ElementApi.isElement(node)) {
      return true;
    }
  }
  return false;
}
export function onBlockMoveKeyDown(
  editor: SlateEditor,
  event: {
    key: string;
    metaKey: boolean;
    ctrlKey: boolean;
    altKey: boolean;
    shiftKey: boolean;
    preventDefault: () => void;
  },
): boolean {
  const direction = blockMoveDirection(event);
  if (direction === null || editor.dom.readOnly === true || mentionComboboxOpen(editor)) {
    return false;
  }
  const from = blockMoveTarget(editor);
  if (!from) {
    return false;
  }
  const step = siblingMove(editor.children, from, direction);
  event.preventDefault();
  if (!step.ok) {
    return true;
  }
  const scroll = captureEditorScroll();
  runEditorCommand(editor, moveBlock, { from: [...from], to: step.to });
  settleMovedBlock(editor, scroll);
  return true;
}
