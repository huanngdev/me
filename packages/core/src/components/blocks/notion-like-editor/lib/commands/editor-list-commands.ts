import { ListStyleType, toggleList } from "@platejs/list";
import { ElementApi, KEYS, type SlateEditor, type TElement } from "platejs";
import { blockIndentOf } from "../features/editor-block-indent-style";
import {
  LIST_NUMBER_RANGE,
  isWithinAttrRange,
  type ListStyle,
} from "../document/editor-document-schema";
import type { EditorCommand } from "./editor-command-runner";
import { isPlainParagraph } from "./editor-block-commands";

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
// A list item that leaves its list drops its level with it. A plain paragraph keeps its own
// indent, so the unset is explicit here and not a normalizer. A plain indent that becomes a
// list keeps its level as depth, where Plate's toggle would add one.
export function createToggleList(style: ListStyle): EditorCommand {
  const command = TOGGLE_LIST_COMMAND[style];

  return {
    id: command.id,
    label: command.label,
    group: "turn-into",
    run: (editor) => {
      const entries = paragraphEntries(editor);
      if (entries.length === 0) {
        return;
      }

      const paths = entries.map(([, path]) => [...path]);
      const plainLevels = entries.map(([node]) =>
        ElementApi.isElement(node) && isPlainParagraph(node) ? blockIndentOf(node) : 0,
      );
      toggleList(editor, { listStyleType: style });
      paths.forEach((path, index) => {
        const node = editor.api.node(path)?.[0];
        if (!ElementApi.isElement(node)) {
          return;
        }
        if (isPlainParagraph(node)) {
          if ("indent" in node) {
            editor.tf.unsetNodes(KEYS.indent, { at: path });
          }
          return;
        }
        const level = plainLevels[index] ?? 0;
        if (level > 0 && node.indent !== level) {
          editor.tf.setNodes({ indent: level }, { at: path });
        }
      });
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
