import { ElementApi, KEYS, NodeApi, type SlateEditor } from "platejs";

import { editorIsComposing } from "../plugins/editor-mention";
import { selectionInCodeBlock } from "./editor-code";
import { blockTextOffset } from "./editor-slash";
import type { EmojiEntry } from "./emoji-data";
import { featureEnabled } from "../plugins/editor-config";

export const EMOJI_SUGGEST_LIMIT = 8;

// The colon must start the block or follow whitespace, so 10:30, http://x and a:sm never match.
const TRIGGER_PATTERN = /(^|\s):([a-z0-9_+-]{2,})$/i;
const CLOSING_PATTERN = /(^|\s):([a-z0-9_+-]{2,}):$/i;

export type EmojiSession = {
  blockId: string;
  blockPath: number[];
  // Block text offsets of the colon and of the caret. The token is the text between them, without the colon.
  colon: number;
  caret: number;
  token: string;
};

export type EmojiReplacement = {
  emoji: string;
  blockPath: number[];
  start: number;
  end: number;
};

let loadedEntries: readonly EmojiEntry[] | null = null;
let pendingLoad: Promise<readonly EmojiEntry[]> | null = null;

// The data is a dynamic import, so the editor's first-load chunk does not carry it.
export function loadedEmojiEntries(): readonly EmojiEntry[] | null {
  return loadedEntries;
}

// Test hook: forget the loaded data so a test can observe a late load.
export function resetEmojiDataForTests(): void {
  loadedEntries = null;
  pendingLoad = null;
}

export function loadEmojiEntries(): Promise<readonly EmojiEntry[]> {
  if (pendingLoad === null) {
    pendingLoad = import("./emoji-data").then(({ EMOJI_ENTRIES }) => {
      loadedEntries = EMOJI_ENTRIES;
      return EMOJI_ENTRIES;
    });
  }
  return pendingLoad;
}

function emojiMatchRank(entry: EmojiEntry, needle: string): number | null {
  if (entry.name === needle) {
    return 0;
  }
  if (entry.name.startsWith(needle)) {
    return 1;
  }
  if (entry.keywords.some((keyword) => keyword.startsWith(needle))) {
    return 2;
  }
  if (entry.name.includes(needle)) {
    return 3;
  }
  return null;
}

export function searchEmoji(
  entries: readonly EmojiEntry[],
  query: string,
  limit: number = EMOJI_SUGGEST_LIMIT,
): EmojiEntry[] {
  const needle = query.toLowerCase();
  if (needle.length < 2) {
    return [];
  }

  const ranked: { entry: EmojiEntry; rank: number; order: number }[] = [];
  entries.forEach((entry, order) => {
    const rank = emojiMatchRank(entry, needle);
    if (rank !== null) {
      ranked.push({ entry, rank, order });
    }
  });
  return ranked
    .sort((left, right) => left.rank - right.rank || left.order - right.order)
    .slice(0, limit)
    .map((item) => item.entry);
}

// Shared gate for the trigger and the closing colon. Read-only, composition, code blocks,
// mention input and void blocks never convert text. Links and code marks do not block.
function readEmojiBlock(
  editor: SlateEditor,
): { blockId: string; blockPath: number[]; caret: number; before: string } | null {
  if (
    editor.dom.readOnly === true ||
    editor.selection === null ||
    !editor.api.isCollapsed() ||
    editorIsComposing(editor)
  ) {
    return null;
  }
  if (
    selectionInCodeBlock(editor) ||
    editor.api.above({ match: { type: editor.getType(KEYS.mentionInput) } }) !== undefined
  ) {
    return null;
  }
  // The lowest block above the caret, read from its ancestors. `api.block()` would walk
  // the document from its root to the caret.
  const block = editor.api.above({ block: true });
  if (!block || !ElementApi.isElement(block[0]) || typeof block[0].id !== "string") {
    return null;
  }
  if (editor.api.isVoid(block[0])) {
    return null;
  }
  const caret = blockTextOffset(editor, block[1], editor.selection.anchor);
  if (caret === null) {
    return null;
  }
  return {
    blockId: block[0].id,
    blockPath: block[1],
    caret,
    before: NodeApi.string(block[0]).slice(0, caret),
  };
}

export function readEmojiSession(editor: SlateEditor): EmojiSession | null {
  if (!featureEnabled(editor, "emoji")) {
    return null;
  }
  const block = readEmojiBlock(editor);
  if (block === null) {
    return null;
  }
  const match = TRIGGER_PATTERN.exec(block.before);
  const token = match?.[2];
  if (token === undefined) {
    return null;
  }
  return {
    blockId: block.blockId,
    blockPath: block.blockPath,
    colon: block.caret - token.length - 1,
    caret: block.caret,
    token,
  };
}

// The closing colon converts only an exact entry name, so :+1: and :Smile: stay text.
export function readClosingEmoji(
  editor: SlateEditor,
  entries: readonly EmojiEntry[],
): EmojiReplacement | null {
  const block = readEmojiBlock(editor);
  if (block === null) {
    return null;
  }
  const name = CLOSING_PATTERN.exec(block.before)?.[2];
  if (name === undefined) {
    return null;
  }
  const entry = entries.find((item) => item.name === name);
  if (entry === undefined) {
    return null;
  }
  return {
    emoji: entry.emoji,
    blockPath: block.blockPath,
    start: block.caret - name.length - 2,
    end: block.caret,
  };
}
