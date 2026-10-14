import {
  ElementApi,
  KEYS,
  PathApi,
  RangeApi,
  TextApi,
  type SlateEditor,
  type TRange,
} from "platejs";

import {
  clearFormatting,
  formatBold,
  formatCode,
  formatItalic,
  formatKeyboard,
  formatStrikethrough,
  formatSubscript,
  formatSuperscript,
  formatUnderline,
  getFontFamily,
  getFontSize,
  getHighlight,
  getLineHeight,
  getTextAlign,
  getTextColor,
  setTextAlign,
  runEditorCommand,
  turnBlockInto,
  type EditorCommand,
  type FontFamilyState,
  type FontSizeState,
  type HighlightState,
  type LineHeightState,
  type TextAlignState,
  type TextColorState,
} from "../commands/editor-commands";
import { blockMenuDecisions, menuBlockView } from "./editor-block-menu";
import { indentBlocks, outdentBlocks } from "./editor-block-indent";
import { blockPickerTurnItems } from "./editor-block-picker";
import { bookmarkUrlOpen } from "../plugins/editor-bookmark-popover";
import { editInlineLink, insertInlineLink, linkUiPlugin } from "../plugins/editor-link";
import { toggleInlineEquation } from "../plugins/editor-inline-equation-ui";
import { slashMenuOpen } from "../plugins/editor-slash";
import type { EditorShortcutId } from "./editor-shortcuts";

export const SELECTION_TOOLBAR_MEDIA = "(hover: none), (pointer: coarse)";

const MARKS = [
  { id: "bold", label: "Bold", command: formatBold, shortcut: "bold" },
  { id: "italic", label: "Italic", command: formatItalic, shortcut: "italic" },
  { id: "underline", label: "Underline", command: formatUnderline, shortcut: "underline" },
  {
    id: "strikethrough",
    label: "Strikethrough",
    command: formatStrikethrough,
    shortcut: "strikethrough",
  },
  { id: "code", label: "Code", command: formatCode, shortcut: "code" },
] as const;

export type SelectionToolbarMarkId = (typeof MARKS)[number]["id"];

export type SelectionToolbarSnapshot = {
  readOnly: boolean;
  composing: boolean;
  pointerHeld: boolean;
  keyboardSelecting: boolean;
  dismissed: boolean;
  editorFocused: boolean;
  toolbarFocused: boolean;
  linkPopoverOpen: boolean;
  slashOpen: boolean;
  bookmarkOpen: boolean;
  mentionOpen: boolean;
  blockMenuOpen: boolean;
  addMenuOpen: boolean;
  dragging: boolean;
};

export type SelectionToolbarMarkState = {
  id: string;
  label: string;
  shortcut?: EditorShortcutId;
  pressed: boolean;
  mixed: boolean;
  disabled: boolean;
  reason?: string;
};

type SelectionToolbarTurnInto = {
  path: number[];
  label: string;
  currentId: string;
};

type SelectionToolbarModel = {
  turnInto: SelectionToolbarTurnInto | null;
  marks: SelectionToolbarMarkState[];
  link: {
    label: string;
    shortcut?: EditorShortcutId;
    pressed: boolean;
    editing: boolean;
    disabled: boolean;
    reason?: string;
  };
  equation: {
    label: string;
    shortcut?: EditorShortcutId;
    disabled: boolean;
    reason?: string;
  };
  textColor: TextColorState;
  highlight: HighlightState;
  colorDisabled: boolean;
  superscript: SelectionToolbarMarkState;
  subscript: SelectionToolbarMarkState;
  keyboard: SelectionToolbarMarkState;
  align: TextAlignState;
  alignDisabled: boolean;
  alignReason?: string;
  fontSize: FontSizeState;
  fontFamily: FontFamilyState;
  lineHeight: LineHeightState;
  indent: { disabled: boolean; reason?: string; shortcut?: EditorShortcutId };
  outdent: { disabled: boolean; reason?: string; shortcut?: EditorShortcutId };
  clear: { disabled: boolean; reason?: string; shortcut?: EditorShortcutId };
};

export function showingToolbarSnapshot(
  overrides: Partial<SelectionToolbarSnapshot> = {},
): SelectionToolbarSnapshot {
  return {
    readOnly: false,
    composing: false,
    pointerHeld: false,
    keyboardSelecting: false,
    dismissed: false,
    editorFocused: true,
    toolbarFocused: false,
    linkPopoverOpen: false,
    slashOpen: false,
    bookmarkOpen: false,
    mentionOpen: false,
    blockMenuOpen: false,
    addMenuOpen: false,
    dragging: false,
    ...overrides,
  };
}

// Touch shows the toolbar below the selection, under the OS copy and paste callout.
export function selectionToolbarSide(matchesCoarse: boolean): "top" | "bottom" {
  return matchesCoarse ? "bottom" : "top";
}

export function selectionToolbarFrame(
  root: ParentNode | null | undefined,
): HTMLElement | undefined {
  const node = root?.querySelector("[data-block-viewport]");
  return node instanceof HTMLElement ? node : undefined;
}

export function editorSurfaceFlags(editor: SlateEditor): {
  linkPopoverOpen: boolean;
  slashOpen: boolean;
  bookmarkOpen: boolean;
  mentionOpen: boolean;
} {
  return {
    linkPopoverOpen: editor.getOption(linkUiPlugin, "mode") !== "closed",
    slashOpen: slashMenuOpen(editor),
    bookmarkOpen: bookmarkUrlOpen(editor),
    mentionOpen: editor.api.some({
      match: (node) =>
        ElementApi.isElement(node) && node.type === editor.getType(KEYS.mentionInput),
    }),
  };
}

export function selectionToolbarVisible(
  editor: SlateEditor,
  snapshot: SelectionToolbarSnapshot,
): boolean {
  if (snapshot.readOnly || editor.dom.readOnly === true) {
    return false;
  }
  if (
    snapshot.composing ||
    snapshot.pointerHeld ||
    snapshot.keyboardSelecting ||
    snapshot.dismissed
  ) {
    return false;
  }
  if (
    snapshot.linkPopoverOpen ||
    snapshot.slashOpen ||
    snapshot.bookmarkOpen ||
    snapshot.mentionOpen ||
    snapshot.blockMenuOpen ||
    snapshot.addMenuOpen ||
    snapshot.dragging
  ) {
    return false;
  }
  if (!snapshot.editorFocused && !snapshot.toolbarFocused) {
    return false;
  }
  if (!selectionHasText(editor) || selectionInsideCodeBlock(editor)) {
    return false;
  }

  return true;
}

export function selectionToolbarModel(editor: SlateEditor): SelectionToolbarModel {
  const linkEditing = selectionInOneLink(editor);
  const linkCommand = linkEditing ? editInlineLink : insertInlineLink;
  const linkFlags = commandFlags(editor, linkCommand);
  const equationFlags = commandFlags(editor, toggleInlineEquation);

  return {
    turnInto: selectionTurnTarget(editor),
    marks: MARKS.map((mark) => markState(editor, mark.id, mark.label, mark.command, mark.shortcut)),
    link: {
      label: "Link",
      shortcut: "link",
      pressed: linkEditing,
      editing: linkEditing,
      disabled: linkFlags.disabled,
      reason: linkFlags.reason,
    },
    equation: {
      label: "Equation",
      shortcut: "inlineEquation",
      disabled: equationFlags.disabled,
      reason: equationFlags.reason,
    },
    textColor: getTextColor(editor),
    highlight: getHighlight(editor),
    colorDisabled: false,
    superscript: markState(editor, "superscript", "Superscript", formatSuperscript, "superscript"),
    subscript: markState(editor, "subscript", "Subscript", formatSubscript, "subscript"),
    keyboard: markState(editor, "keyboard", "Keyboard", formatKeyboard),
    align: getTextAlign(editor),
    alignDisabled: commandFlags(editor, setTextAlign).disabled,
    alignReason: commandFlags(editor, setTextAlign).reason,
    fontSize: getFontSize(editor),
    fontFamily: getFontFamily(editor),
    lineHeight: getLineHeight(editor),
    indent: {
      ...commandFlags(editor, indentBlocks),
      shortcut: "indent",
    },
    outdent: {
      ...commandFlags(editor, outdentBlocks),
      shortcut: "outdent",
    },
    clear: {
      ...commandFlags(editor, clearFormatting),
      shortcut: "clearFormatting",
    },
  };
}

function selectionTurnTarget(editor: SlateEditor): SelectionToolbarTurnInto | null {
  const selection = editor.selection;
  if (!selection) {
    return null;
  }

  const blocks = [
    ...editor.api.nodes({
      at: selection,
      mode: "lowest",
      match: (node) => editor.api.isBlock(node),
    }),
  ];
  const only = blocks.length === 1 ? blocks[0] : undefined;
  if (!only || !ElementApi.isElement(only[0])) {
    return null;
  }

  const path = only[1];
  const view = menuBlockView(editor, path);
  if (!view || blockMenuDecisions(view) === null) {
    return null;
  }

  const items = blockPickerTurnItems(editor, path);
  const current = items.find((item) => item.checked);
  return {
    path: [...path],
    label: current?.label ?? "Turn into",
    currentId: current?.id ?? "",
  };
}

export function applyToolbarCommand<Payload>(
  editor: SlateEditor,
  command: EditorCommand<Payload>,
  payload: Payload,
  range: TRange,
): boolean {
  const saved = cloneRange(range);
  const text = editor.api.string(saved);
  const ok = runEditorCommand(editor, command, payload, { selection: saved });
  restoreSelectedText(editor, saved, text);
  return ok;
}

export function applyTurnInto(
  editor: SlateEditor,
  path: number[],
  kind: NonNullable<ReturnType<typeof blockPickerTurnItems>[number]["kind"]>,
  range: TRange,
): boolean {
  const saved = cloneRange(range);
  const text = editor.api.string(saved);
  const start = editor.api.start(path);
  const lead = start ? editor.api.string({ anchor: start, focus: earlierPoint(saved) }).length : 0;
  const ok = runEditorCommand(editor, turnBlockInto, { path: [...path], kind });
  editor.tf.withoutSaving(() => {
    selectByLead(editor, path, lead, text.length);
  });
  return ok;
}

export function markCommand(
  id: SelectionToolbarMarkId | "superscript" | "subscript" | "keyboard",
): EditorCommand {
  if (id === "superscript") {
    return formatSuperscript;
  }
  if (id === "keyboard") {
    return formatKeyboard;
  }
  if (id === "subscript") {
    return formatSubscript;
  }

  const mark = MARKS.find((item) => item.id === id);
  return mark?.command ?? formatBold;
}

function markState(
  editor: SlateEditor,
  id: string,
  label: string,
  command: EditorCommand,
  shortcut?: EditorShortcutId,
): SelectionToolbarMarkState {
  const state = command.getState?.(editor) ?? "off";
  const flags = commandFlags(editor, command);
  return {
    id,
    label,
    shortcut,
    pressed: state === "on",
    mixed: state === "mixed",
    disabled: flags.disabled,
    reason: flags.reason,
  };
}

function commandFlags<Payload>(
  editor: SlateEditor,
  command: EditorCommand<Payload>,
): { disabled: boolean; reason?: string } {
  const disabled = command.isEnabled?.(editor) === false;
  const reason = disabled ? command.disabledReason?.(editor) : undefined;
  return { disabled, reason };
}

function selectionHasText(editor: SlateEditor): boolean {
  const selection = editor.selection;
  if (!selection || RangeApi.isCollapsed(selection)) {
    return false;
  }

  for (const [node, path] of editor.api.nodes({
    at: selection,
    match: (candidate) => TextApi.isText(candidate),
  })) {
    if (!TextApi.isText(node) || node.text.length === 0) {
      continue;
    }

    const voidParent = editor.api.above({
      at: path,
      match: (candidate) => ElementApi.isElement(candidate) && editor.api.isVoid(candidate),
    });
    if (voidParent) {
      continue;
    }

    return true;
  }

  return false;
}

function selectionInsideCodeBlock(editor: SlateEditor): boolean {
  const selection = editor.selection;
  if (!selection) {
    return false;
  }

  const match = (node: unknown): boolean =>
    ElementApi.isElement(node) && node.type === editor.getType(KEYS.codeBlock);
  const anchor = editor.api.above({ at: selection.anchor, match });
  const focus = editor.api.above({ at: selection.focus, match });
  if (!anchor || !focus) {
    return false;
  }

  return PathApi.equals(anchor[1], focus[1]);
}

function selectionInOneLink(editor: SlateEditor): boolean {
  const selection = editor.selection;
  if (!selection) {
    return false;
  }

  const match = (node: unknown): boolean =>
    ElementApi.isElement(node) && node.type === editor.getType(KEYS.link);
  const anchor = editor.api.above({ at: selection.anchor, match });
  const focus = editor.api.above({ at: selection.focus, match });
  if (!anchor || !focus) {
    return false;
  }

  return PathApi.equals(anchor[1], focus[1]);
}

function restoreSelectedText(editor: SlateEditor, range: TRange, text: string): void {
  const current = editor.selection;
  if (current && editor.api.string(current) === text && text.length > 0) {
    return;
  }

  const block = editor.api.above({
    at: earlierPoint(range),
    match: (node) => editor.api.isBlock(node),
  });
  if (!block) {
    editor.tf.withoutSaving(() => {
      editor.tf.select(range);
    });
    return;
  }

  const start = editor.api.start(block[1]);
  const lead = start ? editor.api.string({ anchor: start, focus: earlierPoint(range) }).length : 0;
  editor.tf.withoutSaving(() => {
    selectByLead(editor, block[1], lead, text.length);
  });
}

function selectByLead(editor: SlateEditor, path: number[], lead: number, length: number): void {
  const start = editor.api.start(path);
  if (!start) {
    return;
  }

  const anchor =
    lead === 0 ? start : editor.api.after(start, { distance: lead, unit: "character" });
  const focus =
    length === 0 ? anchor : editor.api.after(start, { distance: lead + length, unit: "character" });
  if (!anchor || !focus) {
    return;
  }

  editor.tf.select({ anchor, focus });
}

function earlierPoint(range: TRange): TRange["anchor"] {
  return RangeApi.isBackward(range) ? range.focus : range.anchor;
}

function cloneRange(range: TRange): TRange {
  return {
    anchor: { path: [...range.anchor.path], offset: range.anchor.offset },
    focus: { path: [...range.focus.path], offset: range.focus.offset },
  };
}
