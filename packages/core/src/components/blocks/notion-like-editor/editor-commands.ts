import { KEYS, RangeApi, TextApi, type SlateEditor, type TRange, type TText } from "platejs";

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

type MarkState = "on" | "off" | "mixed";

function hasHistory(editor: SlateEditor, stack: "undos" | "redos"): boolean {
  return editor.history[stack].length > 0;
}

function textHasMark(node: TText, key: string): boolean {
  return node[key] === true;
}

function markState(editor: SlateEditor, key: string): MarkState {
  const selection = editor.selection;
  if (!selection) {
    return "off";
  }

  if (RangeApi.isCollapsed(selection)) {
    const marks = editor.api.marks();
    return marks?.[key] === true ? "on" : "off";
  }

  let sawMarked = false;
  let sawPlain = false;
  for (const [node] of editor.api.nodes({
    at: selection,
    match: (candidate) => TextApi.isText(candidate),
  })) {
    if (!TextApi.isText(node)) {
      continue;
    }

    if (textHasMark(node, key)) {
      sawMarked = true;
    } else {
      sawPlain = true;
    }
  }

  if (sawMarked && sawPlain) {
    return "mixed";
  }

  return sawMarked ? "on" : "off";
}

export function createMarkCommand(options: { key: string; label: string }): EditorCommand {
  const { key, label } = options;
  const state = (editor: SlateEditor): MarkState => markState(editor, key);

  return {
    id: `format.${key}`,
    label,
    group: "format",
    getState: state,
    run: (editor) => {
      if (state(editor) === "on") {
        editor.tf.removeMark(key);
        return;
      }

      editor.tf.addMark(key, true);
    },
  };
}

export const formatBold: EditorCommand = createMarkCommand({
  key: KEYS.bold,
  label: "Bold",
});

export const formatItalic: EditorCommand = createMarkCommand({
  key: KEYS.italic,
  label: "Italic",
});

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
