import type { SlateEditor, TRange } from "platejs";

export type EditorCommandGroup = "insert" | "turn-into" | "format" | "action";

export type EditorCommand<Payload = void> = {
  id: string;
  label: string;
  group: EditorCommandGroup;
  isEnabled?: (editor: SlateEditor) => boolean;
  getState?: (editor: SlateEditor) => "on" | "off" | "mixed";
  run: (editor: SlateEditor, payload: Payload) => void;
};

export type RunEditorCommandOptions = {
  selection?: TRange;
  readOnly?: boolean;
};

function hasHistory(editor: SlateEditor, stack: "undos" | "redos"): boolean {
  return editor.history[stack].length > 0;
}

export const HISTORY_COMMANDS: readonly EditorCommand[] = [
  {
    id: "history.undo",
    label: "Undo",
    group: "action",
    isEnabled: (editor) => hasHistory(editor, "undos"),
    run: (editor) => {
      editor.tf.undo();
    },
  },
  {
    id: "history.redo",
    label: "Redo",
    group: "action",
    isEnabled: (editor) => hasHistory(editor, "redos"),
    run: (editor) => {
      editor.tf.redo();
    },
  },
];

export function runEditorCommand<Payload>(
  editor: SlateEditor,
  command: EditorCommand<Payload>,
  payload: Payload,
  options?: RunEditorCommandOptions,
): boolean {
  if (options?.readOnly === true || command.isEnabled?.(editor) === false) {
    return false;
  }

  editor.tf.withNewBatch(() => {
    if (options?.selection) {
      editor.tf.select(options.selection);
    }

    command.run(editor, payload);
  });
  // The batch splits from earlier typing, then later keystrokes would merge
  // into it. Leave the split flag so the next saved operation starts its own entry.
  editor.tf.setSplittingOnce(true);

  return true;
}
