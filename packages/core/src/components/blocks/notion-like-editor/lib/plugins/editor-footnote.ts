import {
  ElementApi,
  KEYS,
  PathApi,
  createSlatePlugin,
  type SlateEditor,
  type TElement,
} from "platejs";

import { FOOTNOTE_DEF_KEY, FOOTNOTE_REF_KEY } from "../document/editor-document-schema";
import { createFootnoteId, isFootnoteId } from "../features/editor-footnote-id";

// The definition is a block with inline text. Its own rules are below, and it has no other keys.
export const footnoteDefPlugin = createSlatePlugin({
  key: FOOTNOTE_DEF_KEY,
  node: { isElement: true },
});

function footnoteDefinitionBlock(editor: SlateEditor): [TElement, number[]] | undefined {
  const block = editor.api.block();
  if (!block || !ElementApi.isElement(block[0]) || block[0].type !== FOOTNOTE_DEF_KEY) {
    return undefined;
  }

  return [block[0], block[1]];
}

// Enter splits the definition, and the block after the caret becomes a paragraph. The split is
// splitNodes, not insertBreak: at offset 0 Plate's break inserts an empty block above and would
// turn the definition itself into a paragraph. Both halves change in one batch, so normalize
// never sees two definitions with one id.
export function breakFootnoteDefinition(editor: SlateEditor): boolean {
  const entry = footnoteDefinitionBlock(editor);
  if (entry === undefined || !editor.api.isCollapsed()) {
    return false;
  }

  editor.tf.withNewBatch(() => {
    editor.tf.withoutNormalizing(() => {
      editor.tf.splitNodes({ always: true });
      const next = PathApi.next(entry[1]);
      if (next !== undefined) {
        editor.tf.unsetNodes(["footnoteId"], { at: next });
        editor.tf.setNodes({ type: KEYS.p }, { at: next });
      }
    });
  });
  return true;
}

// Backspace at the start keeps the text. The definition becomes a paragraph and nothing merges.
export function backspaceFootnoteDefinition(editor: SlateEditor): boolean {
  const entry = footnoteDefinitionBlock(editor);
  if (entry === undefined || !editor.api.isCollapsed() || !editor.api.isAt({ start: true })) {
    return false;
  }

  editor.tf.withNewBatch(() => {
    editor.tf.setNodes({ type: KEYS.p }, { at: entry[1] });
    editor.tf.unsetNodes(["footnoteId"], { at: entry[1] });
  });
  return true;
}

function footnoteReferencePaths(editor: SlateEditor, path: number[]): number[][] {
  const paths: number[][] = [];
  for (const [, refPath] of editor.api.nodes({
    at: path,
    voids: true,
    match: (candidate) => ElementApi.isElement(candidate) && candidate.type === FOOTNOTE_REF_KEY,
  })) {
    paths.push(refPath);
  }

  return paths;
}

// Live rules for a definition that the editor creates or moves. Each rule makes one change and
// returns true, so Slate normalizes again. Every path ends as a valid block, so the loop stops.
export function normalizeFootnoteDefinition(
  editor: SlateEditor,
  node: TElement,
  path: number[],
): boolean {
  if (node.type !== FOOTNOTE_DEF_KEY) {
    return false;
  }

  const references = footnoteReferencePaths(editor, path);
  if (references.length > 0) {
    editor.tf.withoutNormalizing(() => {
      for (const refPath of [...references].reverse()) {
        editor.tf.removeNodes({ at: refPath, voids: true });
      }
    });
    return true;
  }

  const index = path[0];
  if (path.length !== 1 || index === undefined || !isFootnoteId(node.footnoteId)) {
    editor.tf.withoutNormalizing(() => {
      editor.tf.unsetNodes(["footnoteId"], { at: path });
      editor.tf.setNodes({ type: KEYS.p }, { at: path });
    });
    return true;
  }

  const footnoteId = node.footnoteId;
  const earlier = editor.children.some(
    (child, position) =>
      position < index &&
      ElementApi.isElement(child) &&
      child.type === FOOTNOTE_DEF_KEY &&
      child.footnoteId === footnoteId,
  );
  if (earlier) {
    editor.tf.setNodes({ footnoteId: createFootnoteId() }, { at: path });
    return true;
  }

  return false;
}

// Runs before the column and child-type normalizers, so a definition moved out of a column
// becomes a paragraph in place, not a lifted definition. Enter and Backspace rules are here too.
export const footnoteNormalizePlugin = createSlatePlugin({
  key: "footnoteNormalize",
}).overrideEditor(
  ({ editor, tf: { normalizeNode, insertBreak, deleteBackward, deleteForward } }) => ({
    transforms: {
      normalizeNode(entry) {
        const [node, path] = entry;
        if (ElementApi.isElement(node) && normalizeFootnoteDefinition(editor, node, path)) {
          return;
        }

        normalizeNode(entry);
      },
      insertBreak() {
        if (breakFootnoteDefinition(editor)) {
          return;
        }

        insertBreak();
      },
      deleteBackward(unit) {
        if (backspaceFootnoteDefinition(editor) || backspaceBeforeReference(editor)) {
          return;
        }

        deleteBackward(unit);
      },
      deleteForward(unit) {
        if (deleteForwardIntoReference(editor)) {
          return;
        }

        deleteForward(unit);
      },
    },
  }),
);

function containsReference(editor: SlateEditor, path: number[]): boolean {
  return !editor.api
    .nodes({
      at: path,
      voids: true,
      match: (candidate) => ElementApi.isElement(candidate) && candidate.type === FOOTNOTE_REF_KEY,
    })
    .next().done;
}

// Merging a block that holds a reference into the block above drops the reference. Backspace
// at the start of such a block after a definition moves the caret to the definition's end.
function backspaceBeforeReference(editor: SlateEditor): boolean {
  const block = editor.api.block();
  if (block === undefined || !editor.api.isCollapsed() || !editor.api.isAt({ start: true })) {
    return false;
  }

  const [, path] = block;
  const index = path[0];
  if (path.length !== 1 || index === undefined || index === 0) {
    return false;
  }

  const above = editor.children[index - 1];
  if (!ElementApi.isElement(above) || above.type !== FOOTNOTE_DEF_KEY) {
    return false;
  }

  if (!containsReference(editor, path)) {
    return false;
  }

  const end = editor.api.end([index - 1]);
  if (end === undefined) {
    return false;
  }
  editor.tf.select(end);
  return true;
}

// Delete at the end of a definition would merge the next block in. A block with a reference
// stays where it is, so Delete does nothing.
function deleteForwardIntoReference(editor: SlateEditor): boolean {
  const block = editor.api.block();
  if (
    block === undefined ||
    !ElementApi.isElement(block[0]) ||
    block[0].type !== FOOTNOTE_DEF_KEY
  ) {
    return false;
  }
  if (!editor.api.isCollapsed() || !editor.api.isAt({ end: true })) {
    return false;
  }

  const [, path] = block;
  const index = path[0];
  if (path.length !== 1 || index === undefined) {
    return false;
  }

  const below = editor.children[index + 1];
  if (below === undefined || !ElementApi.isElement(below)) {
    return false;
  }

  return containsReference(editor, [index + 1]);
}
