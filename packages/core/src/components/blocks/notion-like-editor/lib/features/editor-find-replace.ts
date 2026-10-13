import { PathApi, TextApi, type Point, type PointRef, type SlateEditor, type TText } from "platejs";

import type { EditorCommand } from "../commands/editor-commands";
import { currentFindResult, findActiveMatch, settleFind } from "../plugins/editor-find";
import { truncateUnits, type FindMatch } from "./editor-find";

export const FIND_REPLACEMENT_MAX = 1000;

type FindReplacePayload = { replacement: string };

// Plain text on one line. Each line break becomes one space.
function normalizeFindReplacement(raw: string): string {
  return truncateUnits(raw.replace(/\r\n|\r|\n/g, " "), FIND_REPLACEMENT_MAX);
}

type Leaf = { node: TText; path: number[] };

function leavesOf(editor: SlateEditor, match: FindMatch): Leaf[] {
  const leaves: Leaf[] = [];
  for (const [node, path] of editor.api.nodes({ at: match, match: TextApi.isText })) {
    if (TextApi.isText(node)) {
      leaves.push({ node, path });
    }
  }
  return leaves;
}

// The new text takes the marks of the leaf that held the match's first character.
function insertReplacement(
  editor: SlateEditor,
  node: TText,
  path: number[],
  offset: number,
  text: string,
): Point {
  if (text.length === 0) {
    return { path, offset };
  }

  const next = PathApi.next(path);
  editor.tf.insertNodes({ ...node, text }, { at: next });
  return { path: next, offset: text.length };
}

// Removes the match text and puts the replacement right after its first leaf. Only text leaves change.
// Must run inside withoutNormalizing. Returns the point after the new text.
function replaceInMatch(editor: SlateEditor, match: FindMatch, text: string): Point | undefined {
  const leaves = leavesOf(editor, match);
  const first = leaves[0];
  const last = leaves[leaves.length - 1];
  if (first === undefined || last === undefined) {
    return undefined;
  }

  const from = match.anchor.offset;
  const to = match.focus.offset;
  if (PathApi.equals(first.path, last.path)) {
    const { node, path } = first;
    const tail = node.text.slice(to);
    if (tail.length > 0) {
      editor.tf.insertNodes({ ...node, text: tail }, { at: PathApi.next(path) });
    }
    editor.tf.delete({
      at: { anchor: { path, offset: from }, focus: { path, offset: node.text.length } },
    });
    return insertReplacement(editor, node, path, from, text);
  }

  // Later leaves first, so the paths of the earlier ones stay valid.
  editor.tf.delete({
    at: { anchor: { path: last.path, offset: 0 }, focus: { path: last.path, offset: to } },
  });
  for (const leaf of leaves.slice(1, -1).reverse()) {
    editor.tf.removeNodes({ at: leaf.path });
  }
  editor.tf.delete({
    at: {
      anchor: { path: first.path, offset: from },
      focus: { path: first.path, offset: first.node.text.length },
    },
  });
  return insertReplacement(editor, first.node, first.path, from, text);
}

export const replaceFindMatch: EditorCommand<FindReplacePayload> = {
  id: "find.replace",
  label: "Replace",
  group: "action",
  isEnabled: (editor) => findActiveMatch(editor) !== undefined,
  run: (editor, { replacement }) => {
    const match = findActiveMatch(editor);
    if (match === undefined) {
      return;
    }

    const text = normalizeFindReplacement(replacement);
    const holder: { ref?: PointRef } = {};
    editor.tf.withoutNormalizing(() => {
      const point = replaceInMatch(editor, match, text);
      if (point !== undefined) {
        holder.ref = editor.api.pointRef(point);
      }
    });
    settleFind(editor, holder.ref?.unref() ?? undefined);
  },
};

export const replaceAllFindMatches: EditorCommand<FindReplacePayload> = {
  id: "find.replaceAll",
  label: "Replace all",
  group: "action",
  isEnabled: (editor) => {
    const result = currentFindResult(editor);
    return result.matches.length > 0 && !result.truncated;
  },
  run: (editor, { replacement }) => {
    const { matches } = currentFindResult(editor);
    const text = normalizeFindReplacement(replacement);
    editor.tf.withoutNormalizing(() => {
      for (const match of [...matches].reverse()) {
        replaceInMatch(editor, match, text);
      }
    });
    settleFind(editor, undefined);
  },
};
