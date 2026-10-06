import { setAlign, setLineHeight as setPlateLineHeight } from "@platejs/basic-styles";
import {
  ElementApi,
  KEYS,
  RangeApi,
  TextApi,
  type SlateEditor,
  type TRange,
  type TText,
} from "platejs";

import {
  CLEARABLE_MARK_KEYS,
  FONT_FAMILIES,
  FONT_SIZES,
  HIGHLIGHT_TOKENS,
  LINE_HEIGHTS,
  TEXT_ALIGNS,
  TEXT_COLOR_TOKENS,
  allowedElementAttrs,
  isAllowedValue,
  type FontFamily,
  type FontSize,
  type HighlightToken,
  type LineHeight,
  type TextAlign,
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
    return isAllowedValue(value, values) ? value : null;
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
    if (!isAllowedValue(value, values)) {
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

      if (!isAllowedValue(value, values)) {
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

export type FontSizeState = FontSize | null | "mixed";

export function getFontSize(editor: SlateEditor): FontSizeState {
  return getValueMark(editor, KEYS.fontSize, FONT_SIZES);
}

export const setFontSize: EditorCommand<FontSize | null> = createValueMarkCommand({
  key: KEYS.fontSize,
  label: "Font size",
  id: "format.font-size",
  values: FONT_SIZES,
});

export type FontFamilyState = FontFamily | null | "mixed";

export function getFontFamily(editor: SlateEditor): FontFamilyState {
  return getValueMark(editor, KEYS.fontFamily, FONT_FAMILIES);
}

export const setFontFamily: EditorCommand<FontFamily | null> = createValueMarkCommand({
  key: KEYS.fontFamily,
  label: "Font family",
  id: "format.font-family",
  values: FONT_FAMILIES,
});

export type TextAlignState = TextAlign | null | "mixed";
export type LineHeightState = LineHeight | null | "mixed";

// setAlign unsets `align` when the value matches Plate's defaultNodeValue.
const PLATE_DEFAULT_ALIGN = "start";
// Plate ships defaultNodeValue 1.5, which is one of the presets. 0 is outside
// that list, so setLineHeight(editor, 0) removes the attribute and 1.5 is stored.
const PLATE_DEFAULT_LINE_HEIGHT = 0;

function isSupportedBlock(
  node: unknown,
  key: string,
): node is { type: string; children: unknown[] } & Record<string, unknown> {
  return (
    typeof node === "object" &&
    node !== null &&
    "type" in node &&
    typeof node.type === "string" &&
    allowedElementAttrs(node.type)?.has(key) === true &&
    "children" in node &&
    Array.isArray(node.children)
  );
}

export function getBlockAttr<T extends string | number>(
  editor: SlateEditor,
  key: string,
  values: readonly T[],
): T | null | "mixed" {
  const selection = editor.selection;
  if (!selection) {
    return null;
  }

  let token: T | null = null;
  let sawDefault = false;
  let sawBlock = false;

  for (const [node] of editor.api.nodes({
    at: selection,
    match: (candidate) => isSupportedBlock(candidate, key),
  })) {
    if (!isSupportedBlock(node, key)) {
      continue;
    }

    sawBlock = true;
    const value = isAllowedValue(node[key], values) ? node[key] : null;
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

export function createBlockAttrCommand<T extends string | number>(options: {
  key: string;
  label: string;
  id: string;
  values: readonly T[];
  apply: (editor: SlateEditor, value: T | null) => void;
}): EditorCommand<T | null> {
  const { label, id, values, apply } = options;

  return {
    id,
    label,
    group: "format",
    run: (editor, value) => {
      if (value === null) {
        apply(editor, null);
        return;
      }

      if (!isAllowedValue(value, values)) {
        return;
      }

      apply(editor, value);
    },
  };
}

export function getTextAlign(editor: SlateEditor): TextAlignState {
  return getBlockAttr(editor, "align", TEXT_ALIGNS);
}

export const setTextAlign: EditorCommand<TextAlign | null> = createBlockAttrCommand({
  key: "align",
  label: "Text align",
  id: "format.align",
  values: TEXT_ALIGNS,
  apply: (editor, value) => {
    setAlign(editor, value === null ? PLATE_DEFAULT_ALIGN : value);
  },
});

export function getLineHeight(editor: SlateEditor): LineHeightState {
  return getBlockAttr(editor, "lineHeight", LINE_HEIGHTS);
}

export const setLineHeight: EditorCommand<LineHeight | null> = createBlockAttrCommand({
  key: "lineHeight",
  label: "Line height",
  id: "format.line-height",
  values: LINE_HEIGHTS,
  apply: (editor, value) => {
    setPlateLineHeight(editor, value === null ? PLATE_DEFAULT_LINE_HEIGHT : value);
  },
});

function isSetMark(value: unknown): boolean {
  return value !== undefined && value !== null && value !== false && value !== "";
}

function hasClearableMark(marks: object): boolean {
  return CLEARABLE_MARK_KEYS.some((key) => key in marks && isSetMark(Reflect.get(marks, key)));
}

// An expanded selection's marks() result is only the first leaf.
function selectionHasClearableMark(editor: SlateEditor): boolean {
  const selection = editor.selection;
  if (!selection) {
    return false;
  }

  if (RangeApi.isCollapsed(selection)) {
    const marks = editor.api.marks();
    return marks !== null && hasClearableMark(marks);
  }

  for (const [node] of editor.api.nodes({
    at: selection,
    match: (candidate) => TextApi.isText(candidate),
  })) {
    if (TextApi.isText(node) && hasClearableMark(node)) {
      return true;
    }
  }

  return false;
}

export function getBlockType(editor: SlateEditor): string | "mixed" | null {
  const selection = editor.selection;
  if (!selection) {
    return null;
  }

  let type: string | undefined;
  for (const [node] of editor.api.nodes({
    at: selection,
    match: (candidate) => editor.api.isBlock(candidate),
  })) {
    if (!ElementApi.isElement(node) || typeof node.type !== "string") {
      continue;
    }

    if (type === undefined) {
      type = node.type;
      continue;
    }

    if (type !== node.type) {
      return "mixed";
    }
  }

  return type ?? null;
}

const HEADING_TYPE = {
  1: KEYS.h1,
  2: KEYS.h2,
} as const;

type HeadingLevel = keyof typeof HEADING_TYPE;

// toggleBlock writes only the type. It resets to a paragraph only when a selected
// block is already that type, so an h1 becomes an h2 in place. Becoming a heading unsets lineHeight.
export function createTurnIntoHeading(level: HeadingLevel): EditorCommand {
  const type = HEADING_TYPE[level];

  return {
    id: `block.turn-into.h${level}`,
    label: `Heading ${level}`,
    group: "turn-into",
    run: (editor) => {
      const becomesHeading = !editor.api.some({ match: { type } });
      editor.tf.toggleBlock(type);
      if (!becomesHeading || !editor.selection) {
        return;
      }

      editor.tf.unsetNodes(KEYS.lineHeight, {
        at: editor.selection,
        match: (node) => ElementApi.isElement(node) && node.type === type,
      });
    },
  };
}

export const turnIntoHeading1 = createTurnIntoHeading(1);
export const turnIntoHeading2 = createTurnIntoHeading(2);

export const clearFormatting: EditorCommand = {
  id: "format.clear",
  label: "Clear formatting",
  group: "format",
  isEnabled: selectionHasClearableMark,
  run: (editor) => {
    editor.tf.removeMarks([...CLEARABLE_MARK_KEYS]);
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
