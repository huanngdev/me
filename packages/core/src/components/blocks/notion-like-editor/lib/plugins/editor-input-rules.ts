import {
  ElementApi,
  KEYS,
  NodeApi,
  TextApi,
  createSlatePlugin,
  type SlateEditor,
  type TElement,
  type TRange,
} from "platejs";

import {
  formatBold,
  formatCode,
  formatItalic,
  formatStrikethrough,
  insertDivider,
  setListRestart,
  writeChecked,
} from "../commands/editor-commands";
import {
  applyBlockTurn,
  blockMenuDecisions,
  blockPlacementRefusal,
  menuBlockView,
  type BlockMenuKind,
} from "../features/editor-block-menu";
import {
  matchBlockInputTrigger,
  matchInlineInputTrigger,
  type InlineInputMark,
} from "../features/editor-input-rules";

const justConverted = new WeakSet<SlateEditor>();
const compositionPending = new WeakSet<SlateEditor>();
const pasteDepth = new WeakMap<SlateEditor, number>();
const applying = new WeakSet<SlateEditor>();

const MARK_COMMAND = {
  bold: formatBold,
  italic: formatItalic,
  strikethrough: formatStrikethrough,
  code: formatCode,
} as const satisfies Record<InlineInputMark, { run: (editor: SlateEditor) => void; key?: string }>;

const MARK_KEY: Record<InlineInputMark, string> = {
  bold: KEYS.bold,
  italic: KEYS.italic,
  strikethrough: KEYS.strikethrough,
  code: KEYS.code,
};

function isPasting(editor: SlateEditor): boolean {
  return (pasteDepth.get(editor) ?? 0) > 0;
}

function runAsPaste(editor: SlateEditor, apply: () => void): void {
  pasteDepth.set(editor, (pasteDepth.get(editor) ?? 0) + 1);
  try {
    apply();
  } finally {
    const next = (pasteDepth.get(editor) ?? 1) - 1;
    if (next <= 0) {
      pasteDepth.delete(editor);
    } else {
      pasteDepth.set(editor, next);
    }
  }
}

type TextPoint = { path: number[]; offset: number };

function walkText(
  editor: SlateEditor,
  node: TElement | { text: string },
  path: number[],
  start: number,
  end: number,
  state: { offset: number; anchor?: TextPoint; focus?: TextPoint; dirty: boolean },
): void {
  if (state.dirty) {
    return;
  }

  if (TextApi.isText(node)) {
    const next = state.offset + node.text.length;
    if (start < next && end > state.offset && node[KEYS.code] === true) {
      state.dirty = true;
      return;
    }

    if (state.anchor === undefined && start >= state.offset && start <= next) {
      state.anchor = { path: [...path], offset: start - state.offset };
    }

    if (state.focus === undefined && end >= state.offset && end <= next) {
      state.focus = { path: [...path], offset: end - state.offset };
    }

    state.offset = next;
    return;
  }

  if (!ElementApi.isElement(node)) {
    return;
  }

  if (editor.api.isInline(node)) {
    const length = NodeApi.string(node).length;
    if (start < state.offset + length && end > state.offset) {
      state.dirty = true;
      return;
    }

    state.offset += length;
    return;
  }

  node.children.forEach((child, index) => {
    walkText(editor, child as TElement, path.concat(index), start, end, state);
  });
}

function rangeForOffsets(
  editor: SlateEditor,
  blockPath: number[],
  start: number,
  end: number,
): TRange | "dirty" | null {
  const entry = editor.api.node(blockPath);
  const node = entry?.[0];
  if (!entry || !ElementApi.isElement(node)) {
    return null;
  }

  const state: { offset: number; anchor?: TextPoint; focus?: TextPoint; dirty: boolean } = {
    offset: 0,
    dirty: false,
  };
  walkText(editor, node, [...blockPath], start, end, state);
  if (state.dirty) {
    return "dirty";
  }

  if (state.anchor === undefined || state.focus === undefined) {
    return null;
  }

  return { anchor: state.anchor, focus: state.focus };
}

function textBeforeCaret(editor: SlateEditor, blockPath: number[]): string | null {
  const selection = editor.selection;
  const start = editor.api.start(blockPath);
  if (!selection || !start) {
    return null;
  }

  return editor.api.string({ anchor: start, focus: selection.anchor });
}

function charAfterInBlock(editor: SlateEditor, blockPath: number[]): string | undefined {
  const selection = editor.selection;
  if (!selection) {
    return undefined;
  }

  const after = editor.api.after(selection, { distance: 1, unit: "character" });
  if (!after || after.path.length < blockPath.length) {
    return undefined;
  }

  if (!blockPath.every((value, index) => after.path[index] === value)) {
    return undefined;
  }

  const text = editor.api.string({ anchor: selection.anchor, focus: after });
  return text.length > 0 ? text : undefined;
}

function paragraphAllowsTrigger(editor: SlateEditor): number[] | null {
  const block = editor.api.block();
  if (!block || !ElementApi.isElement(block[0])) {
    return null;
  }

  if (editor.api.above({ match: { type: editor.getType(KEYS.codeBlock) } }) !== undefined) {
    return null;
  }

  const view = menuBlockView(editor, block[1]);
  if (
    !view ||
    view.type !== KEYS.p ||
    view.listStyleType !== undefined ||
    view.parentType === KEYS.th
  ) {
    return null;
  }

  return block[1];
}

function applyBlockTrigger(editor: SlateEditor): boolean {
  const selection = editor.selection;
  const path = paragraphAllowsTrigger(editor);
  if (!selection || !path || !editor.api.isCollapsed()) {
    return false;
  }

  const before = textBeforeCaret(editor, path);
  if (before === null) {
    return false;
  }

  const trigger = matchBlockInputTrigger(before);
  if (trigger === null) {
    return false;
  }

  if (rangeForOffsets(editor, path, 0, before.length) === "dirty") {
    return false;
  }

  const view = menuBlockView(editor, path);
  if (!view) {
    return false;
  }

  const start = editor.api.start(path);
  if (!start) {
    return false;
  }

  if (trigger.kind === "divider") {
    if (path.length !== 1) {
      return false;
    }

    if (blockPlacementRefusal(view.parentType, view.index, KEYS.hr, false) !== undefined) {
      return false;
    }

    editor.tf.withNewBatch(() => {
      editor.tf.delete({ at: { anchor: start, focus: selection.anchor } });
      insertDivider.run(editor);
    });
    editor.tf.setSplittingOnce(true);
    return true;
  }

  const kind: BlockMenuKind = trigger.kind;
  const decision = blockMenuDecisions(view)?.find((item) => item.kind === kind);
  if (decision === undefined || !decision.allowed || decision.effect === "same") {
    return false;
  }

  editor.tf.withNewBatch(() => {
    const focus = editor.selection?.anchor ?? selection.anchor;
    editor.tf.delete({ at: { anchor: start, focus } });
    applyBlockTurn(editor, path, kind);
    if (kind === "numbered" && trigger.restart !== undefined) {
      setListRestart.run(editor, trigger.restart);
    }

    if (kind === "todo" && trigger.checked === true) {
      writeChecked(editor, [path], true);
    }
  });
  editor.tf.setSplittingOnce(true);
  return true;
}

function applyInlineTrigger(editor: SlateEditor): boolean {
  const selection = editor.selection;
  const path = paragraphAllowsTrigger(editor);
  if (!selection || !path || !editor.api.isCollapsed() || insideLink(editor)) {
    return false;
  }

  const before = textBeforeCaret(editor, path);
  if (before === null) {
    return false;
  }

  const match = matchInlineInputTrigger(before, charAfterInBlock(editor, path));
  if (match === null) {
    return false;
  }

  const open = rangeForOffsets(editor, path, match.openStart, match.openEnd);
  const close = rangeForOffsets(editor, path, match.closeStart, match.closeEnd);
  const inner = rangeForOffsets(editor, path, match.openEnd, match.closeStart);
  if (
    open === "dirty" ||
    close === "dirty" ||
    inner === "dirty" ||
    open === null ||
    close === null ||
    inner === null
  ) {
    return false;
  }

  const command = MARK_COMMAND[match.mark];
  const key = MARK_KEY[match.mark];
  editor.tf.withNewBatch(() => {
    editor.tf.delete({ at: close });
    editor.tf.delete({ at: open });
    const nextInner = rangeForOffsets(
      editor,
      path,
      match.openStart,
      match.openStart + (match.closeStart - match.openEnd),
    );
    if (nextInner === null || nextInner === "dirty") {
      return;
    }

    editor.tf.select(nextInner);
    command.run(editor);
    editor.tf.collapse({ edge: "end" });
    editor.tf.removeMark(key);
  });
  editor.tf.setSplittingOnce(true);
  return true;
}

function insideLink(editor: SlateEditor): boolean {
  return editor.api.above({ match: { type: editor.getType(KEYS.link) } }) !== undefined;
}

function applyTypedTrigger(editor: SlateEditor): boolean {
  if (applying.has(editor)) {
    return false;
  }

  applying.add(editor);
  try {
    return applyBlockTrigger(editor) || applyInlineTrigger(editor);
  } finally {
    applying.delete(editor);
  }
}

function isComposing(editor: SlateEditor, options: unknown): boolean {
  const composingOption =
    typeof options === "object" &&
    options !== null &&
    "composing" in options &&
    options.composing === true;
  if (composingOption || editor.composing === true) {
    return true;
  }

  const dom: unknown = editor.dom;
  return typeof dom === "object" && dom !== null && "composing" in dom && dom.composing === true;
}

export const editorInputRulesPlugin = createSlatePlugin({
  key: "editorInputRules",
}).overrideEditor(
  ({ editor, tf: { deleteBackward, insertData, insertFragment, insertText, redo, undo } }) => ({
    transforms: {
      insertData(data) {
        justConverted.delete(editor);
        runAsPaste(editor, () => {
          insertData(data);
        });
      },
      insertFragment(fragment, options) {
        justConverted.delete(editor);
        runAsPaste(editor, () => {
          insertFragment(fragment, options);
        });
      },
      insertText(text, options) {
        const composing = isComposing(editor, options);
        const commit = !composing && compositionPending.has(editor);
        if (composing) {
          compositionPending.add(editor);
        } else if (commit) {
          compositionPending.delete(editor);
        }

        const expanded = editor.selection !== null && !editor.api.isCollapsed();
        insertText(text, options);
        if (composing || commit || expanded || isPasting(editor) || applying.has(editor)) {
          if (!applying.has(editor)) {
            justConverted.delete(editor);
          }
          return;
        }

        if (applyTypedTrigger(editor)) {
          justConverted.add(editor);
          return;
        }

        justConverted.delete(editor);
      },
      deleteBackward(unit) {
        if (justConverted.has(editor)) {
          justConverted.delete(editor);
          editor.tf.undo();
          return;
        }

        deleteBackward(unit);
      },
      undo() {
        justConverted.delete(editor);
        undo();
      },
      redo() {
        justConverted.delete(editor);
        redo();
      },
    },
  }),
);
