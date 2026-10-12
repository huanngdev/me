import { setIndent } from "@platejs/indent";
import { ElementApi, KEYS, type SlateEditor } from "platejs";

import type { EditorCommand } from "../commands/editor-commands";
import { firstChildForbiddenAttrs } from "../document/editor-document-schema";
import { blockSelectionActive, blockSelectionIds } from "../plugins/editor-block-selection";
import {
  BLOCK_INDENT_MAX,
  BLOCK_INDENT_TYPES,
  blockIndentOf,
  isListParagraph,
  listIndentOf,
} from "./editor-block-indent-style";

export { BLOCK_INDENT_MAX, BLOCK_INDENT_TYPES } from "./editor-block-indent-style";

// A plain block type that can carry indent. A toggle's first child cannot.
export function blockIndentAllowed(editor: SlateEditor, path: number[]): boolean {
  const node = editor.api.node(path)?.[0];
  if (!ElementApi.isElement(node) || !BLOCK_INDENT_TYPES.includes(node.type)) {
    return false;
  }

  const index = path[path.length - 1];
  if (index !== 0 || path.length < 2) {
    return true;
  }

  const parent = editor.api.node(path.slice(0, -1))?.[0];
  return !(
    ElementApi.isElement(parent) && firstChildForbiddenAttrs(parent.type).includes("indent")
  );
}

// Rule: a block selection targets the selected blocks. A text selection targets the lowest
// blocks it touches, so a paragraph inside a quote, callout or cell moves itself. A quote
// moves only when it is block-selected. Code lines are blocks and are refused.
export function blockIndentTargets(editor: SlateEditor): number[][] {
  const paths: number[][] = [];
  if (blockSelectionActive(editor)) {
    const wanted = new Set(blockSelectionIds(editor));
    for (const [, path] of editor.api.nodes({
      at: [],
      match: (candidate) =>
        ElementApi.isElement(candidate) &&
        typeof candidate.id === "string" &&
        wanted.has(candidate.id),
    })) {
      if (blockIndentAllowed(editor, path)) {
        paths.push([...path]);
      }
    }
    return paths;
  }

  if (!editor.selection) {
    return paths;
  }

  for (const [, path] of editor.api.nodes({
    at: editor.selection,
    mode: "lowest",
    match: (candidate) => ElementApi.isElement(candidate) && editor.api.isBlock(candidate),
  })) {
    if (blockIndentAllowed(editor, path)) {
      paths.push([...path]);
    }
  }
  return paths;
}

function canMove(node: unknown, step: 1 | -1): boolean {
  if (isListParagraph(node)) {
    return step < 0 || listIndentOf(node) < BLOCK_INDENT_MAX;
  }

  return step > 0 ? blockIndentOf(node) < BLOCK_INDENT_MAX : blockIndentOf(node) > 0;
}

function movableTargets(editor: SlateEditor, step: 1 | -1): number[][] {
  return blockIndentTargets(editor).filter((path) => canMove(editor.api.node(path)?.[0], step));
}

function stepBlockIndent(editor: SlateEditor, step: 1 | -1): void {
  const targets = movableTargets(editor, step);
  editor.tf.withoutNormalizing(() => {
    for (const path of targets) {
      const node = editor.api.node(path)?.[0];
      if (isListParagraph(node)) {
        // The same list step as Tab and Shift+Tab. Outdent at depth 1 drops the list style.
        setIndent(editor, {
          offset: step,
          getNodesOptions: { at: path, match: (candidate) => isListParagraph(candidate) },
          unsetNodesProps: step < 0 ? [KEYS.listType, KEYS.listChecked] : [],
        });
        continue;
      }

      const next = blockIndentOf(node) + step;
      if (next <= 0) {
        editor.tf.unsetNodes("indent", { at: path });
      } else {
        editor.tf.setNodes({ indent: next }, { at: path });
      }
    }
  });
}

function disabledReasonFor(editor: SlateEditor, step: 1 | -1): string | undefined {
  if (blockIndentTargets(editor).length === 0) {
    return "Indent is not available here.";
  }

  return step > 0 ? "Already at the deepest level." : "Not indented.";
}

function blockIndentCommand(id: string, label: string, step: 1 | -1): EditorCommand {
  return {
    id,
    label,
    group: "format",
    isEnabled: (editor) => movableTargets(editor, step).length > 0,
    disabledReason: (editor) => disabledReasonFor(editor, step),
    run: (editor) => {
      stepBlockIndent(editor, step);
    },
  };
}

export const indentBlocks: EditorCommand = blockIndentCommand("block.indent", "Indent", 1);

export const outdentBlocks: EditorCommand = blockIndentCommand("block.outdent", "Outdent", -1);
