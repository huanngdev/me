import { ElementApi, KEYS, type SlateEditor } from "platejs";

import type { EditorCommand } from "../commands/editor-commands";
import { isPaletteToken, type PaletteToken } from "../document/editor-document-schema";
import {
  BLOCK_TONE_TYPES,
  TONE_ATTR,
  isRecord,
  storedTone,
  type BlockToneKind,
} from "./editor-block-tone-style";

export { BLOCK_TONE_TYPES } from "./editor-block-tone-style";
import { blockSelectionActive, blockSelectionIds } from "../plugins/editor-block-selection";

export type BlockTonePayload = {
  ids: readonly string[];
  kind: BlockToneKind;
  token: PaletteToken | null;
};

function idOf(node: unknown): string | undefined {
  return isRecord(node) && typeof node.id === "string" ? node.id : undefined;
}

export function isInsideTable(editor: SlateEditor, path: number[]): boolean {
  for (let depth = 1; depth < path.length; depth += 1) {
    const ancestor = editor.api.node(path.slice(0, depth))?.[0];
    if (ElementApi.isElement(ancestor) && ancestor.type === KEYS.table) {
      return true;
    }
  }

  return false;
}

export function blockToneAllowed(editor: SlateEditor, path: number[]): boolean {
  const node = editor.api.node(path)?.[0];
  return (
    ElementApi.isElement(node) &&
    BLOCK_TONE_TYPES.includes(node.type) &&
    !isInsideTable(editor, path)
  );
}

// Same reading as getBlockAttr: an invalid stored value counts as unset.
export function blockToneState(
  editor: SlateEditor,
  paths: number[][],
  kind: BlockToneKind,
): PaletteToken | null | "mixed" {
  let token: PaletteToken | null = null;
  let sawDefault = false;
  let sawBlock = false;

  for (const path of paths) {
    if (!blockToneAllowed(editor, path)) {
      continue;
    }

    sawBlock = true;
    const value = storedTone(editor.api.node(path)?.[0], kind);
    if (value === null) {
      sawDefault = true;
      continue;
    }

    if (token === null) {
      token = value;
      continue;
    }

    if (token !== value) {
      return "mixed";
    }
  }

  if (!sawBlock) {
    return null;
  }

  if (token !== null && sawDefault) {
    return "mixed";
  }

  return token;
}

// A block selection wins. Otherwise the highest allowed blocks under the text selection.
export function blockToneTargetIds(editor: SlateEditor): string[] {
  if (blockSelectionActive(editor)) {
    return [...blockSelectionIds(editor)];
  }

  if (!editor.selection) {
    return [];
  }

  const ids: string[] = [];
  for (const [node] of editor.api.nodes({
    at: editor.selection,
    mode: "highest",
    match: (candidate, candidatePath) =>
      ElementApi.isElement(candidate) && blockToneAllowed(editor, candidatePath),
  })) {
    const id = idOf(node);
    if (id !== undefined) {
      ids.push(id);
    }
  }

  return ids;
}

export const setBlockTone: EditorCommand<BlockTonePayload> = {
  id: "block.tone",
  label: "Color",
  group: "format",
  run: (editor, payload) => {
    if (payload.token !== null && !isPaletteToken(payload.token)) {
      return;
    }

    const wanted = new Set(payload.ids);
    const paths: number[][] = [];
    for (const [node, path] of editor.api.nodes({
      at: [],
      match: (candidate, candidatePath) => {
        const id = idOf(candidate);
        return id !== undefined && wanted.has(id) && blockToneAllowed(editor, candidatePath);
      },
    })) {
      if (ElementApi.isElement(node)) {
        paths.push([...path]);
      }
    }

    const { token } = payload;
    const attr = TONE_ATTR[payload.kind];
    editor.tf.withoutNormalizing(() => {
      for (const path of paths) {
        if (token === null) {
          editor.tf.unsetNodes(attr, { at: path });
        } else if (payload.kind === "text") {
          editor.tf.setNodes({ textTone: token }, { at: path });
        } else {
          editor.tf.setNodes({ backgroundTone: token }, { at: path });
        }
      }
    });
  },
};
