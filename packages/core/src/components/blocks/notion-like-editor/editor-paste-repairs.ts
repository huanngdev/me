import type { SlateEditor } from "platejs";

type PasteRepair = {
  path: number[];
  message: string;
};

// editor-media records skipped files, and editor-paste imports every media kind.
// The log lives here so that cycle does not read MEDIA_FILE_SKIPPED before it exists.
const pasteRepairLog = new WeakMap<SlateEditor, PasteRepair[]>();

export function setPasteRepairs(editor: SlateEditor, repairs: readonly PasteRepair[]): void {
  pasteRepairLog.set(editor, [...repairs]);
}

export function pasteRepairsOf(editor: SlateEditor): readonly PasteRepair[] {
  return pasteRepairLog.get(editor) ?? [];
}
