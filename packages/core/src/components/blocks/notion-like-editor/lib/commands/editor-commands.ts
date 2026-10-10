import { setAlign, setLineHeight as setPlateLineHeight } from "@platejs/basic-styles";
import { unwrapCodeBlock } from "@platejs/code-block";
import { ListStyleType, toggleList } from "@platejs/list";
import {
  ElementApi,
  KEYS,
  NodeApi,
  PathApi,
  RangeApi,
  TextApi,
  nanoid,
  type SlateEditor,
  type TElement,
  type TRange,
  type TText,
} from "platejs";

import {
  applyBlockTurn,
  deleteBlockAt,
  duplicateBlockAt,
  type BlockMenuKind,
} from "../features/editor-block-menu";
import {
  blockMoveDirection,
  blockMoveTarget,
  captureEditorScroll,
  moveBlockAt,
  settleMovedBlock,
  siblingMove,
} from "../features/editor-block-drop";
import { openAncestorToggle } from "../plugins/editor-toggle";
import {
  CALLOUT_ICONS,
  CALLOUT_TONES,
  CLEARABLE_MARK_KEYS,
  FONT_FAMILIES,
  FONT_SIZES,
  HIGHLIGHT_TOKENS,
  LINE_HEIGHTS,
  LIST_NUMBER_RANGE,
  CODE_LANGS,
  TEXT_ALIGNS,
  TEXT_COLOR_TOKENS,
  allowedChildTypes,
  allowedElementAttrs,
  allowsFirstChild,
  isAllowedValue,
  isWithinAttrRange,
  reportedFirstChild,
  reportedFirstChildNames,
  reportsContainer,
  reportsParentFromFirstChild,
  type CodeLang,
  type FontFamily,
  type FontSize,
  type HighlightToken,
  type LineHeight,
  type ListStyle,
  type TextAlign,
  type TextColorToken,
} from "../document/editor-document-schema";

export type EditorCommandGroup = "insert" | "turn-into" | "format" | "action";

export type EditorCommand<Payload = void> = {
  id: string;
  label: string;
  group: EditorCommandGroup;
  isEnabled?: (editor: SlateEditor) => boolean;
  /** Shown when the command cannot run. Absent means the control stays quiet. */
  disabledReason?: (editor: SlateEditor) => string | undefined;
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

export const BULLETED_LIST_TYPE = "bulleted-list";
export const NUMBERED_LIST_TYPE = "numbered-list";
export const TODO_LIST_TYPE = "todo-list";

const LIST_BLOCK_TYPE = {
  disc: BULLETED_LIST_TYPE,
  decimal: NUMBERED_LIST_TYPE,
  todo: TODO_LIST_TYPE,
} as const;

function isReportedListStyle(style: string): style is keyof typeof LIST_BLOCK_TYPE {
  return Object.hasOwn(LIST_BLOCK_TYPE, style);
}

function reportedBlockType(node: TElement): string {
  const style = node.listStyleType;
  if (node.type === KEYS.p && typeof style === "string" && isReportedListStyle(style)) {
    return LIST_BLOCK_TYPE[style];
  }

  return node.type;
}

// A plain paragraph whose parent lists that paragraph in childTypes reports the parent.
// A list item keeps its list type. Lowest blocks only, so the container is not visited too.
export function containerParentType(
  editor: SlateEditor,
  node: { type: string; listStyleType?: unknown },
  path: number[],
): string | undefined {
  if (node.type !== KEYS.p || typeof node.listStyleType === "string") {
    return undefined;
  }

  const parent = editor.api.parent(path);
  if (!parent || !ElementApi.isElement(parent[0]) || typeof parent[0].type !== "string") {
    return undefined;
  }

  const childTypes = allowedChildTypes(parent[0].type);
  if (childTypes === undefined || !childTypes.some((type) => type === node.type)) {
    return undefined;
  }

  return parent[0].type;
}

function reportedLabelBlockType(
  editor: SlateEditor,
  node: TElement,
  path: number[],
): string | undefined {
  if (path[path.length - 1] !== 0 || typeof node.type !== "string") {
    return undefined;
  }

  const parent = editor.api.parent(path);
  if (!parent || !ElementApi.isElement(parent[0]) || typeof parent[0].type !== "string") {
    return undefined;
  }

  return reportedFirstChild(parent[0].type, node.type);
}

function blockTypeOf(editor: SlateEditor, node: TElement, path: number[]): string {
  const labelReport = reportedLabelBlockType(editor, node, path);
  if (labelReport !== undefined) {
    return labelReport;
  }

  if (reportsContainer(node.type)) {
    const parent = editor.api.parent(path);
    if (parent && ElementApi.isElement(parent[0]) && typeof parent[0].type === "string") {
      const childTypes = allowedChildTypes(parent[0].type);
      if (childTypes !== undefined && childTypes.some((type) => type === node.type)) {
        return parent[0].type;
      }
    }
  }

  const reported = reportedBlockType(node);
  if (reported !== node.type || node.type !== KEYS.p) {
    return reported;
  }

  const parentType = containerParentType(editor, node, path);
  if (parentType === undefined) {
    return reported;
  }

  // Quote and callout report the container for every plain paragraph.
  // reportParent "first" reports it only for the label, so content keeps its own type.
  if (reportsParentFromFirstChild(parentType) && path[path.length - 1] !== 0) {
    return reported;
  }

  // A plain paragraph in a cell reports the table. A list item already returned its list type.
  if (parentType === KEYS.td || parentType === KEYS.th) {
    return KEYS.table;
  }

  return parentType;
}

export function getBlockType(editor: SlateEditor): string | "mixed" | null {
  const selection = editor.selection;
  if (!selection) {
    return null;
  }

  let type: string | undefined;
  for (const [node, path] of editor.api.nodes({
    at: selection,
    mode: "lowest",
    match: (candidate) => editor.api.isBlock(candidate),
  })) {
    if (!ElementApi.isElement(node) || typeof node.type !== "string") {
      continue;
    }

    const next = blockTypeOf(editor, node, path);
    if (type === undefined) {
      type = next;
      continue;
    }

    if (type !== next) {
      return "mixed";
    }
  }

  return type ?? null;
}

export const HEADING_TYPE = {
  1: KEYS.h1,
  2: KEYS.h2,
  3: KEYS.h3,
} as const;

export type HeadingLevel = keyof typeof HEADING_TYPE;

function lowestBlocks(editor: SlateEditor) {
  const selection = editor.selection;
  if (!selection) {
    return [];
  }

  return [
    ...editor.api.nodes({
      at: selection,
      mode: "lowest",
      match: (node) => editor.api.isBlock(node),
    }),
  ];
}

// A heading is not an allowed child of a quote. Lift it before toggleBlock, or the
// childTypes normalizer turns the new heading back into a paragraph.
function liftWhereChildTypeDisallowed(editor: SlateEditor, targetType: string): void {
  const blocks = lowestBlocks(editor);
  editor.tf.withoutNormalizing(() => {
    for (const [, blockPath] of blocks.reverse()) {
      const parent = editor.api.parent(blockPath);
      if (!parent || !ElementApi.isElement(parent[0]) || typeof parent[0].type !== "string") {
        continue;
      }

      const childIndex = blockPath[blockPath.length - 1];
      const childTypes = allowedChildTypes(parent[0].type);
      if (
        (childIndex === 0 && allowsFirstChild(parent[0].type, targetType)) ||
        childTypes === undefined ||
        childTypes.some((type) => type === targetType)
      ) {
        continue;
      }

      editor.tf.liftBlock({ at: blockPath, match: { type: parent[0].type } });
    }
  });
}

// toggleBlock writes only the type. It resets to a paragraph only when a selected
// block is already that type, so one heading becomes another in place. Becoming a heading unsets lineHeight.
export function createTurnIntoHeading(level: HeadingLevel): EditorCommand {
  const type = HEADING_TYPE[level];

  return {
    id: `block.turn-into.h${level}`,
    label: `Heading ${level}`,
    group: "turn-into",
    run: (editor) => {
      const becomesHeading = !editor.api.some({ match: { type } });
      if (becomesHeading) {
        liftWhereChildTypeDisallowed(editor, type);
      }
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
export const turnIntoHeading3 = createTurnIntoHeading(3);

// Outside, toggleBlock wraps the selection in one container and leaves its attrs unset.
// Inside a quote or callout, liftBlock unwraps the selected paragraphs and splits a partial selection.
// A toggle label is structural. Selecting it unwraps the whole toggle. Selecting content moves
// those blocks out after the toggle, so the following block does not become a new label.
function selectionIncludesContainerLabel(editor: SlateEditor, type: string): boolean {
  return lowestBlocks(editor).some(([, blockPath]) => {
    if (blockPath[blockPath.length - 1] !== 0) {
      return false;
    }

    const parent = editor.api.parent(blockPath);
    return parent !== undefined && ElementApi.isElement(parent[0]) && parent[0].type === type;
  });
}

function pathStartsWith(path: readonly number[], prefix: readonly number[]): boolean {
  return prefix.length <= path.length && prefix.every((step, index) => path[index] === step);
}

function liftSelectedContent(editor: SlateEditor, type: string): void {
  const above = editor.api.above({ match: { type } });
  if (!above) {
    return;
  }

  const containerPath = above[1];
  const destination = PathApi.next(containerPath);
  if (!destination) {
    return;
  }

  const seen = new Set<string>();
  const childPaths: number[][] = [];
  for (const [, blockPath] of lowestBlocks(editor)) {
    if (!pathStartsWith(blockPath, containerPath) || blockPath.length <= containerPath.length) {
      continue;
    }

    const index = blockPath[containerPath.length];
    if (index === undefined || index === 0) {
      continue;
    }

    const childPath = containerPath.concat(index);
    const key = childPath.join(".");
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    childPaths.push(childPath);
  }

  editor.tf.withoutNormalizing(() => {
    for (const childPath of childPaths.reverse()) {
      editor.tf.moveNodes({ at: childPath, to: destination });
    }
  });
}

export function createTurnIntoContainer(
  type: string,
  meta: { id: string; label: string },
  options?: {
    afterWrap?: (editor: SlateEditor) => void;
    unwrapFromFirstChild?: boolean;
    liftContentOut?: boolean;
  },
): EditorCommand {
  return {
    id: meta.id,
    label: meta.label,
    group: "turn-into",
    run: (editor) => {
      if (editor.api.above({ match: { type } })) {
        if (options?.unwrapFromFirstChild && selectionIncludesContainerLabel(editor, type)) {
          const above = editor.api.above({ match: { type } });
          if (!above) {
            return;
          }

          editor.tf.unwrapNodes({
            at: above[1],
            match: (_node, path) => PathApi.equals(path, above[1]),
          });
          return;
        }

        if (options?.liftContentOut) {
          liftSelectedContent(editor, type);
          return;
        }

        const blocks = lowestBlocks(editor);
        editor.tf.withoutNormalizing(() => {
          for (const [, blockPath] of blocks.reverse()) {
            editor.tf.liftBlock({ at: blockPath, match: { type } });
          }
        });
        return;
      }

      editor.tf.toggleBlock(type, { wrap: true });
      options?.afterWrap?.(editor);
    },
  };
}

export const turnIntoBlockquote = createTurnIntoContainer(KEYS.blockquote, {
  id: "block.turn-into.blockquote",
  label: "Quote",
});

export const turnIntoCallout = createTurnIntoContainer(KEYS.callout, {
  id: "block.turn-into.callout",
  label: "Callout",
});

function blockId(node: TElement): string | undefined {
  if (!("id" in node) || typeof node.id !== "string" || node.id.length === 0) {
    return undefined;
  }

  return node.id;
}

function codeLineFromBlock(node: TElement): TElement {
  const line: TElement = {
    type: KEYS.codeLine,
    children: [{ text: NodeApi.string(node) }],
  };
  const id = blockId(node);
  if (id !== undefined) {
    line.id = id;
  }

  return line;
}

// Selected paragraphs become one code block, one line each, marks dropped.
// The same command on a code block unwraps it back into paragraphs.
export const turnIntoCodeBlock: EditorCommand = {
  id: "block.turn-into.code-block",
  label: "Code",
  group: "turn-into",
  run: (editor) => {
    if (!editor.selection) {
      return;
    }

    if (editor.api.above({ match: { type: editor.getType(KEYS.codeBlock) } })) {
      unwrapCodeBlock(editor);
      return;
    }

    const blocks: { node: TElement; path: number[] }[] = [];
    for (const [node, path] of lowestBlocks(editor)) {
      if (ElementApi.isElement(node)) {
        blocks.push({ node, path });
      }
    }

    const first = blocks[0];
    if (first === undefined) {
      return;
    }

    const lines = blocks.map((block) => codeLineFromBlock(block.node));
    const codeBlock: TElement = {
      type: editor.getType(KEYS.codeBlock),
      id: nanoid(10),
      children: lines.length > 0 ? lines : [{ type: KEYS.codeLine, children: [{ text: "" }] }],
    };

    editor.tf.withoutNormalizing(() => {
      for (const block of blocks.reverse()) {
        editor.tf.removeNodes({ at: block.path });
      }

      editor.tf.insertNodes(codeBlock, { at: first.path, select: true });
    });
  },
};

export type CodeLanguagePayload = {
  lang: CodeLang | null;
  at?: number[];
};

function codeBlockPath(editor: SlateEditor, at: number[] | undefined): number[] | undefined {
  if (at !== undefined) {
    const entry = editor.api.node(at);
    if (!entry || !ElementApi.isElement(entry[0]) || entry[0].type !== KEYS.codeBlock) {
      return undefined;
    }

    return entry[1];
  }

  const above = editor.api.above({ match: { type: KEYS.codeBlock } });
  return above?.[1];
}

export const setCodeLanguage: EditorCommand<CodeLanguagePayload> = {
  id: "format.code-language",
  label: "Code language",
  group: "format",
  run: (editor, payload) => {
    const path = codeBlockPath(editor, payload.at);
    if (path === undefined) {
      return;
    }

    if (payload.lang === null) {
      editor.tf.unsetNodes("lang", { at: path });
      return;
    }

    if (!isAllowedValue(payload.lang, CODE_LANGS)) {
      return;
    }

    editor.tf.setNodes({ lang: payload.lang }, { at: path });
  },
};

// Mod+Enter inside a code block. The list shortcut picks this or the to-do check.
export const exitCodeBlock: EditorCommand = {
  id: "block.exit.code-block",
  label: "Exit code block",
  group: "action",
  run: (editor) => {
    const codeBlock = editor.api.above({ match: { type: editor.getType(KEYS.codeBlock) } });
    if (!codeBlock) {
      return;
    }

    const at = PathApi.next(codeBlock[1]);
    if (!at) {
      return;
    }

    editor.tf.insertNodes(editor.api.create.block(), { at, select: true });
  },
};

export const turnIntoToggle = createTurnIntoContainer(
  KEYS.toggle,
  {
    id: "block.turn-into.toggle",
    label: "Toggle list",
  },
  { afterWrap: openAncestorToggle, unwrapFromFirstChild: true, liftContentOut: true },
);

export type CalloutAttrPayload = {
  value: string | null;
  at?: number[];
};

function calloutPath(editor: SlateEditor, at: number[] | undefined): number[] | undefined {
  if (at !== undefined) {
    const entry = editor.api.node(at);
    if (!entry || !ElementApi.isElement(entry[0]) || entry[0].type !== KEYS.callout) {
      return undefined;
    }

    return entry[1];
  }

  const above = editor.api.above({ match: { type: KEYS.callout } });
  return above?.[1];
}

function setCalloutAttr(
  editor: SlateEditor,
  key: "icon" | "variant",
  allowed: readonly string[],
  payload: CalloutAttrPayload,
): void {
  const path = calloutPath(editor, payload.at);
  if (!path) {
    return;
  }

  if (payload.value === null) {
    editor.tf.unsetNodes(key, { at: path });
    return;
  }

  if (!isAllowedValue(payload.value, allowed)) {
    return;
  }

  editor.tf.setNodes({ [key]: payload.value }, { at: path });
}

export const setCalloutIcon: EditorCommand<CalloutAttrPayload> = {
  id: "format.callout-icon",
  label: "Callout icon",
  group: "format",
  run: (editor, payload) => {
    setCalloutAttr(editor, "icon", CALLOUT_ICONS, payload);
  },
};

export const setCalloutTone: EditorCommand<CalloutAttrPayload> = {
  id: "format.callout-tone",
  label: "Callout tone",
  group: "format",
  run: (editor, payload) => {
    setCalloutAttr(editor, "variant", CALLOUT_TONES, payload);
  },
};

// One history batch so Reset removes the icon and the tone together.
export function resetCallout(editor: SlateEditor, at?: number[]): void {
  editor.tf.withNewBatch(() => {
    setCalloutIcon.run(editor, { value: null, at });
    setCalloutTone.run(editor, { value: null, at });
  });
  editor.tf.setSplittingOnce(true);
}

export const TURN_INTO_HEADING = {
  1: turnIntoHeading1,
  2: turnIntoHeading2,
  3: turnIntoHeading3,
} as const satisfies Record<HeadingLevel, EditorCommand>;

function isToggleLabelReport(blockType: string): boolean {
  if (blockType === KEYS.toggle) {
    return true;
  }

  return reportedFirstChildNames(KEYS.toggle).some((name) => name === blockType);
}

// One undo: runEditorCommand batches this. A same-level heading label reverts to a
// paragraph before turnIntoToggle can unwrap the container.
export function createTurnIntoToggleHeading(level: HeadingLevel): EditorCommand {
  const heading = TURN_INTO_HEADING[level];
  const target = reportedFirstChild(KEYS.toggle, HEADING_TYPE[level]);

  return {
    id: `block.turn-into.toggle-h${level}`,
    label: `Toggle heading ${level}`,
    group: "turn-into",
    run: (editor) => {
      const current = getBlockType(editor);
      if (target !== undefined && current === target) {
        heading.run(editor);
        return;
      }

      if (current === null || !isToggleLabelReport(current)) {
        turnIntoToggle.run(editor);
      }

      if (target === undefined || getBlockType(editor) === target) {
        return;
      }

      heading.run(editor);
    },
  };
}

const TOGGLE_LIST_COMMAND = {
  disc: { id: "block.turn-into.bulleted-list", label: "Bulleted list" },
  decimal: { id: "block.turn-into.numbered-list", label: "Numbered list" },
  todo: { id: "block.turn-into.todo-list", label: "To-do list" },
} as const satisfies Record<ListStyle, { id: string; label: string }>;

function paragraphEntries(editor: SlateEditor) {
  const selection = editor.selection;
  if (!selection) {
    return [];
  }

  return [
    ...editor.api.nodes({
      at: selection,
      block: true,
      match: (node) => ElementApi.isElement(node) && node.type === KEYS.p,
    }),
  ];
}

// Orphan indent and numbering attrs are removed by dependentAttrsPlugin, not here.
export function createToggleList(style: ListStyle): EditorCommand {
  const command = TOGGLE_LIST_COMMAND[style];

  return {
    id: command.id,
    label: command.label,
    group: "turn-into",
    run: (editor) => {
      if (paragraphEntries(editor).length === 0) {
        return;
      }

      toggleList(editor, { listStyleType: style });
    },
  };
}

export const toggleBulletedList = createToggleList("disc");
export const toggleNumberedList = createToggleList("decimal");
export const toggleTodoList = createToggleList("todo");

function isTodoItem(node: TElement): boolean {
  return node.type === KEYS.p && node.listStyleType === KEYS.listTodo;
}

function todoEntries(editor: SlateEditor) {
  const selection = editor.selection;
  if (!selection) {
    return [];
  }

  return [
    ...editor.api.nodes({
      at: selection,
      block: true,
      match: (node) => ElementApi.isElement(node) && isTodoItem(node),
    }),
  ];
}

function isCheckedTodo(node: TElement): boolean {
  return "checked" in node && node.checked === true;
}

// Plate's setIndentTodoNode writes checked: false (src-D073vI9-.js). There is no
// toggle-checked transform; useTodoListElement sets { checked } on one path.
export function writeChecked(
  editor: SlateEditor,
  paths: readonly (readonly number[])[],
  checked: boolean,
): void {
  editor.tf.withoutNormalizing(() => {
    for (const path of paths) {
      editor.tf.setNodes({ [KEYS.listChecked]: checked }, { at: [...path] });
    }
  });
}

export const toggleTodoChecked: EditorCommand = {
  id: "format.todo-checked",
  label: "Check to-do",
  group: "format",
  isEnabled: (editor) => todoEntries(editor).length > 0,
  run: (editor) => {
    const entries = todoEntries(editor);
    if (entries.length === 0) {
      return;
    }

    const checkAll = entries.some(([node]) => ElementApi.isElement(node) && !isCheckedTodo(node));
    writeChecked(
      editor,
      entries.map((entry) => entry[1]),
      checkAll,
    );
  },
};

function decimalItemAtCaret(editor: SlateEditor): boolean {
  const block = editor.api.block()?.[0];
  return ElementApi.isElement(block) && block.listStyleType === ListStyleType.Decimal;
}

// Plate has no setListRestart transform. toggleList writes listRestart only while turning a
// block into a list (src-D073vI9-.js). On an item that is already decimal, listRestart is the
// property normalizeListStart reads to choose the number.
export const setListRestart: EditorCommand<number | null> = {
  id: "format.list-restart",
  label: "Restart numbering",
  group: "format",
  isEnabled: decimalItemAtCaret,
  run: (editor, value) => {
    const entry = editor.api.block();
    if (
      !entry ||
      !ElementApi.isElement(entry[0]) ||
      entry[0].listStyleType !== ListStyleType.Decimal
    ) {
      return;
    }

    if (value === null) {
      editor.tf.unsetNodes([KEYS.listRestart, KEYS.listRestartPolite], { at: entry[1] });
      return;
    }

    if (!isWithinAttrRange(value, LIST_NUMBER_RANGE)) {
      return;
    }

    editor.tf.unsetNodes(KEYS.listRestartPolite, { at: entry[1] });
    editor.tf.setNodes({ [KEYS.listRestart]: value }, { at: entry[1] });
  },
};

export function directText(node: TElement): string {
  let text = "";
  for (const child of node.children) {
    if (TextApi.isText(child)) {
      text += child.text;
    }
  }

  return text;
}

export function isPlainParagraph(node: TElement): boolean {
  return node.type === KEYS.p && node.listStyleType === undefined;
}

function selectPlainParagraph(editor: SlateEditor, path: number[]): void {
  const entry = editor.api.node(path);
  const node = entry?.[0];
  if (entry && entry[1].length === 1 && ElementApi.isElement(node) && isPlainParagraph(node)) {
    const start = editor.api.start(path);
    if (start) {
      editor.tf.select(start);
    }
    return;
  }

  editor.tf.insertNodes({ type: KEYS.p, children: [{ text: "" }] }, { at: path, select: true });
}

// No shortcut. Notion and Google Docs have none. The --- trigger is DEV-126.
export const insertDivider: EditorCommand = {
  id: "block.insert.divider",
  label: "Divider",
  group: "insert",
  run: (editor) => {
    const entry = editor.api.block({ highest: true });
    if (!entry || !ElementApi.isElement(entry[0]) || typeof entry[0].type !== "string") {
      return;
    }

    const [node, path] = entry;
    let hrPath = path;
    if (path.length === 1 && isPlainParagraph(node) && directText(node).length === 0) {
      const drop = Object.keys(node).filter(
        (key) => key !== "type" && key !== "children" && key !== "id",
      );
      if (drop.length > 0) {
        editor.tf.unsetNodes(drop, { at: path });
      }
      editor.tf.setNodes({ type: KEYS.hr }, { at: path });
    } else {
      const at = PathApi.next(path);
      if (!at) {
        return;
      }

      editor.tf.insertNodes({ type: KEYS.hr, children: [{ text: "" }] }, { at, select: false });
      hrPath = at;
    }

    const after = PathApi.next(hrPath);
    if (!after) {
      return;
    }

    selectPlainParagraph(editor, after);
  },
};

export const insertParagraphBelow: EditorCommand<{ path: number[] }> = {
  id: "block.insert.paragraph-below",
  label: "Add below",
  group: "insert",
  run: (editor, payload) => {
    const entry = editor.api.node(payload.path);
    if (!entry || !ElementApi.isElement(entry[0])) {
      return;
    }

    const at = PathApi.next(payload.path);
    if (!at) {
      return;
    }

    editor.tf.insertNodes({ type: KEYS.p, children: [{ text: "" }] }, { at, select: true });
    const start = editor.api.start(at);
    if (start) {
      editor.tf.select(start);
    }
  },
};

export type BlockMenuTurnPayload = {
  path: number[];
  kind: BlockMenuKind;
};

// Selection-scoped, same registry shape as the heading commands. The block menu
// uses turnBlockInto so the handle target changes and the caret does not.
export const turnIntoParagraph: EditorCommand = {
  id: "block.turn-into.paragraph",
  label: "Text",
  group: "turn-into",
  run: (editor) => {
    const entry = editor.api.block();
    if (!entry) {
      return;
    }

    applyBlockTurn(editor, entry[1], "paragraph");
  },
};

export const turnBlockInto: EditorCommand<BlockMenuTurnPayload> = {
  id: "block.menu.turn-into",
  label: "Turn into",
  group: "turn-into",
  run: (editor, payload) => {
    applyBlockTurn(editor, payload.path, payload.kind);
  },
};

export const duplicateBlock: EditorCommand<{ path: number[] }> = {
  id: "block.menu.duplicate",
  label: "Duplicate",
  group: "action",
  run: (editor, payload) => {
    duplicateBlockAt(editor, payload.path);
  },
};

export const deleteBlock: EditorCommand<{ path: number[] }> = {
  id: "block.menu.delete",
  label: "Delete",
  group: "action",
  run: (editor, payload) => {
    deleteBlockAt(editor, payload.path);
  },
};

export const moveBlock: EditorCommand<{ from: number[]; to: number[] }> = {
  id: "block.move",
  label: "Move block",
  group: "action",
  run: (editor, payload) => {
    moveBlockAt(editor, payload.from, payload.to);
  },
};

function mentionComboboxOpen(editor: SlateEditor): boolean {
  const type = editor.getType(KEYS.mentionInput);
  for (const [node] of editor.api.nodes({
    at: [],
    match: (candidate) => ElementApi.isElement(candidate) && candidate.type === type,
  })) {
    if (ElementApi.isElement(node)) {
      return true;
    }
  }
  return false;
}

export function onBlockMoveKeyDown(
  editor: SlateEditor,
  event: {
    key: string;
    metaKey: boolean;
    ctrlKey: boolean;
    altKey: boolean;
    shiftKey: boolean;
    preventDefault: () => void;
  },
): boolean {
  const direction = blockMoveDirection(event);
  if (direction === null || editor.dom.readOnly === true || mentionComboboxOpen(editor)) {
    return false;
  }
  const from = blockMoveTarget(editor);
  if (!from) {
    return false;
  }
  const step = siblingMove(editor.children, from, direction);
  event.preventDefault();
  if (!step.ok) {
    return true;
  }
  const scroll = captureEditorScroll();
  runEditorCommand(editor, moveBlock, { from: [...from], to: step.to });
  settleMovedBlock(editor, scroll);
  return true;
}

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
