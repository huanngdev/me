import type { SlateEditor } from "platejs";

type HistoryKeyEvent = {
  key: string;
  altKey?: boolean;
  shiftKey?: boolean;
  metaKey?: boolean;
  ctrlKey?: boolean;
  target?: EventTarget | null;
  preventDefault: () => void;
};

// Mod+Z undoes, and Mod+Shift+Z or Mod+Y redoes. A popover or handle is outside the editable, where Slate
// reads these keys, so its keys go to the document history here. A text field keeps its own undo.
export function onPopoverHistoryKey(editor: SlateEditor, event: HistoryKeyEvent): boolean {
  if (!(event.metaKey || event.ctrlKey) || event.altKey) {
    return false;
  }

  const target = event.target;
  if (target instanceof Element && target.closest("input, textarea") !== null) {
    return false;
  }

  const key = event.key.toLowerCase();
  let action: "undo" | "redo" | null = null;
  if (key === "z") {
    action = event.shiftKey ? "redo" : "undo";
  } else if (key === "y" && event.shiftKey !== true) {
    action = "redo";
  }
  if (action === null) {
    return false;
  }

  event.preventDefault();
  if (action === "undo") {
    editor.tf.undo();
  } else {
    editor.tf.redo();
  }
  return true;
}
