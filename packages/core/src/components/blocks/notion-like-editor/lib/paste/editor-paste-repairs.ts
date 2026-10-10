import type { SlateEditor } from "platejs";

type PasteRepair = {
  path: number[];
  message: string;
};

const EMPTY_PASTE_REPAIRS: readonly PasteRepair[] = [];

// Bookmarks, columns, links, mentions, and rejected files share this log.
const pasteRepairLog = new WeakMap<SlateEditor, readonly PasteRepair[]>();
const pasteRepairListeners = new WeakMap<SlateEditor, Set<() => void>>();

export function setPasteRepairs(editor: SlateEditor, repairs: readonly PasteRepair[]): void {
  pasteRepairLog.set(editor, repairs.length === 0 ? EMPTY_PASTE_REPAIRS : [...repairs]);
  const listeners = pasteRepairListeners.get(editor);
  if (listeners === undefined) {
    return;
  }

  for (const listener of listeners) {
    listener();
  }
}

export function pasteRepairsOf(editor: SlateEditor): readonly PasteRepair[] {
  return pasteRepairLog.get(editor) ?? EMPTY_PASTE_REPAIRS;
}

export function subscribePasteRepairs(editor: SlateEditor, listener: () => void): () => void {
  const existing = pasteRepairListeners.get(editor);
  const listeners = existing ?? new Set<() => void>();
  if (existing === undefined) {
    pasteRepairListeners.set(editor, listeners);
  }

  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
