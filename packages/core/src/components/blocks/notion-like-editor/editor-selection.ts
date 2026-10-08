import type { RangeRef, SlateEditor, TRange } from "platejs";

export function captureSelection(editor: SlateEditor): RangeRef | null {
  if (!editor.selection) {
    return null;
  }

  return editor.api.rangeRef(editor.selection);
}

export function releaseSelection(ref: RangeRef): TRange | null {
  return ref.unref();
}
