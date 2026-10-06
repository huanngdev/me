import { RangeApi, TextApi, type SlateEditor, type TRange, type TText } from "platejs";

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

const BOLD_MARK = "bold";

function hasHistory(editor: SlateEditor, stack: "undos" | "redos"): boolean {
  return editor.history[stack].length > 0;
}

function textIsBold(node: TText): boolean {
  return node[BOLD_MARK] === true;
}

function boldState(editor: SlateEditor): "on" | "off" | "mixed" {
  const selection = editor.selection;
  if (!selection) {
    return "off";
  }

  if (RangeApi.isCollapsed(selection)) {
    const marks = editor.api.marks();
    return marks?.[BOLD_MARK] === true ? "on" : "off";
  }

  let sawBold = false;
  let sawPlain = false;
  for (const [node] of editor.api.nodes({
    at: selection,
    match: (candidate) => TextApi.isText(candidate),
  })) {
    if (!TextApi.isText(node)) {
      continue;
    }

    if (textIsBold(node)) {
      sawBold = true;
    } else {
      sawPlain = true;
    }
  }

  if (sawBold && sawPlain) {
    return "mixed";
  }

  return sawBold ? "on" : "off";
}

export const formatBold: EditorCommand = {
  id: "format.bold",
  label: "Bold",
  group: "format",
  getState: boldState,
  run: (editor) => {
    if (boldState(editor) === "on") {
      editor.tf.removeMark(BOLD_MARK);
      return;
    }

    editor.tf.addMark(BOLD_MARK, true);
  },
};

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
