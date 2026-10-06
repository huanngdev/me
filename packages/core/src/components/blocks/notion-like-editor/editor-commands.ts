import { KEYS, RangeApi, TextApi, type SlateEditor, type TRange, type TText } from "platejs";

import {
  HIGHLIGHT_TOKENS,
  TEXT_COLOR_TOKENS,
  isPaletteToken,
  type HighlightToken,
  type TextColorToken,
} from "./editor-document-schema";

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

export function createMarkCommand(options: {
  key: string;
  label: string;
  excludes?: readonly string[];
}): EditorCommand {
  const { key, label, excludes } = options;
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

      // Plate's toggleMark applies `remove` only while adding the mark.
      if (excludes !== undefined && excludes.length > 0) {
        editor.tf.withoutNormalizing(() => {
          editor.tf.removeMarks([...excludes]);
          editor.tf.addMark(key, true);
        });
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

export const formatUnderline: EditorCommand = createMarkCommand({
  key: KEYS.underline,
  label: "Underline",
});

export const formatStrikethrough: EditorCommand = createMarkCommand({
  key: KEYS.strikethrough,
  label: "Strikethrough",
});

export const formatCode: EditorCommand = createMarkCommand({
  key: KEYS.code,
  label: "Inline code",
});

export const formatSuperscript: EditorCommand = createMarkCommand({
  key: KEYS.sup,
  label: "Superscript",
  excludes: [KEYS.sub],
});

export const formatSubscript: EditorCommand = createMarkCommand({
  key: KEYS.sub,
  label: "Subscript",
  excludes: [KEYS.sup],
});

export type TextColorState = TextColorToken | null | "mixed";
export type HighlightState = HighlightToken | null | "mixed";

export function getValueMark<T extends string>(
  editor: SlateEditor,
  key: string,
  values: readonly T[],
): T | null | "mixed" {
  const selection = editor.selection;
  if (!selection) {
    return null;
  }

  if (RangeApi.isCollapsed(selection)) {
    const value = editor.api.marks()?.[key];
    return isPaletteToken(value, values) ? value : null;
  }

  let token: T | null = null;
  let sawPlain = false;

  for (const [node] of editor.api.nodes({
    at: selection,
    match: (candidate) => TextApi.isText(candidate),
  })) {
    if (!TextApi.isText(node) || node.text.length === 0) {
      continue;
    }

    const value = node[key];
    if (!isPaletteToken(value, values)) {
      sawPlain = true;
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

  if (token !== null && sawPlain) {
    return "mixed";
  }

  return token;
}

export function createValueMarkCommand<T extends string>(options: {
  key: string;
  label: string;
  id: string;
  values: readonly T[];
}): EditorCommand<T | null> {
  const { key, label, id, values } = options;

  return {
    id,
    label,
    group: "format",
    run: (editor, value) => {
      if (value === null) {
        editor.tf.removeMark(key);
        return;
      }

      if (!isPaletteToken(value, values)) {
        return;
      }

      editor.tf.addMark(key, value);
    },
  };
}

export function getTextColor(editor: SlateEditor): TextColorState {
  return getValueMark(editor, KEYS.color, TEXT_COLOR_TOKENS);
}

export const setTextColor: EditorCommand<TextColorToken | null> = createValueMarkCommand({
  key: KEYS.color,
  label: "Text color",
  id: "format.text-color",
  values: TEXT_COLOR_TOKENS,
});

export function getHighlight(editor: SlateEditor): HighlightState {
  return getValueMark(editor, KEYS.backgroundColor, HIGHLIGHT_TOKENS);
}

export const setHighlight: EditorCommand<HighlightToken | null> = createValueMarkCommand({
  key: KEYS.backgroundColor,
  label: "Highlight",
  id: "format.highlight",
  values: HIGHLIGHT_TOKENS,
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
