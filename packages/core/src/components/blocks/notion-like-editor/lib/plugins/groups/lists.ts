import { indent, setIndent } from "@platejs/indent";
import { IndentPlugin } from "@platejs/indent/react";
import { ListStyleType, ULIST_STYLE_TYPES } from "@platejs/list";
import { ListPlugin } from "@platejs/list/react";
import { KEYS, createSlatePlugin } from "platejs";
import { BlockList } from "../../../components/elements/block-list";
import { jumpFromCaretDefinition } from "../editor-footnote-ui";
import { EDITOR_SHORTCUTS } from "../../features/editor-shortcuts";
import {
  BLOCK_INDENT_TYPES,
  blockIndentOf,
  isListParagraph,
  listIndentInjects,
  listIndentOf,
} from "../../features/editor-block-indent-style";
import { outdentBlocks } from "../../features/editor-block-indent";
import {
  exitCodeBlock,
  runEditorCommand,
  toggleBulletedList,
  toggleNumberedList,
  toggleTodoChecked,
  toggleTodoList,
} from "../../commands/editor-commands";
import { LIST_NUMBER_RANGE, isWithinAttrRange } from "../../document/editor-document-schema";
import { selectionInCodeBlock } from "../../features/editor-code";

const LIST_INDENT_MAX = 6;

export const indentPlugin = IndentPlugin.configure({
  inject: {
    targetPlugins: [...BLOCK_INDENT_TYPES],
    nodeProps: {
      query: listIndentInjects,
    },
  },
  options: {
    indentMax: LIST_INDENT_MAX,
    offset: 0,
    unit: "px",
  },
});

function isUnorderedListStyle(style: string): boolean {
  return ULIST_STYLE_TYPES.some((item) => item === style);
}

function isKnownListStyle(style: string): boolean {
  return Object.values(ListStyleType).some((item) => item === style);
}

// Nested Google Docs items use lower-alpha or lower-roman. The stored value stays decimal.

function storedListStyle(style: string | undefined): "disc" | "decimal" | undefined {
  if (style === undefined || style.length === 0) {
    return undefined;
  }

  if (isUnorderedListStyle(style)) {
    return "disc";
  }

  if (isKnownListStyle(style)) {
    return "decimal";
  }

  return undefined;
}

// The table paste path deserializes HTML itself, so Plate's list transformData
// does not run. Mark each li the same way that transform does.

export function annotatePastedLists(body: HTMLElement): void {
  for (const element of Array.from(body.querySelectorAll("li"))) {
    let indent = 0;
    let parent = element.parentElement;
    while (parent && parent !== body) {
      if (parent.tagName === "UL" || parent.tagName === "OL") {
        indent += 1;
      }
      parent = parent.parentElement;
    }

    if (indent > 0 && element.dataset.indent === undefined) {
      element.dataset.indent = String(indent);
    }

    if (element.dataset.listStyleType === undefined) {
      const listParent = element.closest("ul, ol");
      if (listParent?.tagName === "UL") {
        element.dataset.listStyleType = "disc";
      } else if (listParent?.tagName === "OL") {
        element.dataset.listStyleType = "decimal";
      }
    }
  }
}

// Plate's LI transform marks a ul as disc and leaves <input type="checkbox"> in the item.
// The input has no text, and the HTML deserializer drops it, so this only reads.

export function pastedTodoChecked(element: HTMLElement): boolean | undefined {
  const input = element.querySelector('input[type="checkbox"]');
  if (input) {
    return input.hasAttribute("checked");
  }

  if (element.getAttribute("role") === "checkbox" || element.hasAttribute("aria-checked")) {
    return element.getAttribute("aria-checked") === "true";
  }

  return undefined;
}

// Plate's LI parser ignores ol start. The first item stores listRestart so normalizeListStart
// can derive listStart. start="1" is omitted; that is Plate's default.

function listRestartFromStart(element: HTMLElement): number | undefined {
  const list = element.closest("ol");
  if (list === null || list.querySelector("li") !== element) {
    return undefined;
  }

  const raw = list.getAttribute("start");
  if (raw === null) {
    return undefined;
  }

  const start = Number(raw);
  if (!isWithinAttrRange(start, LIST_NUMBER_RANGE) || start === LIST_NUMBER_RANGE.min) {
    return undefined;
  }

  return start;
}

export const listPlugin = ListPlugin.configure({
  inject: {
    targetPlugins: [KEYS.p],
  },
  options: {
    // Plate's normalizer passes breakOnEqIndentNeqListStyleType: false, then spreads these
    // options, so a bullet at the same depth ends the numbered run.
    // normalizeListStart treats every non-bullet style, including "todo", as ordered and
    // would write listStart on the next to-do. A to-do is not a numbered run, so that search stops.
    getSiblingListOptions: {
      breakOnEqIndentNeqListStyleType: true,
      breakQuery: (_sibling, current) =>
        "listStyleType" in current && current.listStyleType === KEYS.listTodo,
    },
  },
  parsers: {
    html: {
      deserializer: {
        parse: ({ editor, element }) => {
          const dataIndent = element.dataset.indent;
          const ariaLevel = element.getAttribute("aria-level");
          const indent = dataIndent ? Number(dataIndent) : Number(ariaLevel);
          const checked = pastedTodoChecked(element);
          if (checked !== undefined) {
            return {
              checked,
              indent: indent || undefined,
              listStyleType: KEYS.listTodo,
              type: editor.getType(KEYS.p),
            };
          }

          const listStyleType = storedListStyle(element.dataset.listStyleType);
          const listRestart = listRestartFromStart(element);

          return {
            indent: indent || undefined,
            listStyleType,
            listRestart,
            type: editor.getType(KEYS.p),
          };
        },
      },
    },
  },
  render: {
    belowNodes: BlockList,
  },
  shortcuts: {
    toggleBulleted: {
      keys: [[...EDITOR_SHORTCUTS.bulleted]],
      handler: ({ editor }) => {
        runEditorCommand(editor, toggleBulletedList, undefined, {
          readOnly: editor.dom.readOnly,
        });
      },
    },
    toggleNumbered: {
      keys: [[...EDITOR_SHORTCUTS.numbered]],
      handler: ({ editor }) => {
        runEditorCommand(editor, toggleNumberedList, undefined, {
          readOnly: editor.dom.readOnly,
        });
      },
    },
    toggleTodo: {
      keys: [[...EDITOR_SHORTCUTS.todo]],
      handler: ({ editor }) => {
        runEditorCommand(editor, toggleTodoList, undefined, {
          readOnly: editor.dom.readOnly,
        });
      },
    },
    toggleChecked: {
      keys: [[...EDITOR_SHORTCUTS.todoCheck]],
      handler: ({ editor }) => {
        // Plate stops the event when a shortcut handler returns, so a definition is handled here:
        // Mod+Enter inside one jumps back to its first reference and never reaches the to-do.
        if (jumpFromCaretDefinition(editor)) {
          return;
        }
        // One shortcut. Inside a code block it exits. Everywhere else it checks a to-do.
        const command = selectionInCodeBlock(editor) ? exitCodeBlock : toggleTodoChecked;
        runEditorCommand(editor, command, undefined, {
          readOnly: editor.dom.readOnly,
        });
      },
    },
  },
});

// attrRequires is the only dependent-attr rule. Plate's normalizeListStart deletes
// listStart on a disc item and leaves listRestart. This pass removes every unsatisfied
// dependent, then returns so the next pass reads the updated node.

export const listKeyboardPlugin = createSlatePlugin({
  key: "listKeyboard",
}).overrideEditor(({ editor, tf: { deleteBackward } }) => ({
  transforms: {
    tab(options?: { reverse?: boolean }) {
      const items = [
        ...editor.api.nodes({
          block: true,
          match: (node) => isListParagraph(node),
        }),
      ];
      if (items.length === 0) {
        return false;
      }

      const match = (node: unknown) => isListParagraph(node);
      if (options?.reverse) {
        // Same unset as outdentList: indent 1 drops listStyleType and indent together.
        setIndent(editor, {
          offset: -1,
          unsetNodesProps: [KEYS.listType, KEYS.listChecked],
          getNodesOptions: { match },
        });
        return true;
      }

      if (!items.some(([node]) => listIndentOf(node) < LIST_INDENT_MAX)) {
        return true;
      }

      indent(editor, {
        getNodesOptions: {
          match: (node) => isListParagraph(node) && listIndentOf(node) < LIST_INDENT_MAX,
        },
      });
      return true;
    },
    deleteBackward(unit) {
      const selection = editor.selection;
      const block = selection ? editor.api.block() : undefined;
      if (
        block &&
        isListParagraph(block[0]) &&
        editor.api.isCollapsed() &&
        editor.api.isAt({ start: true }) &&
        !editor.api.isEmpty(selection, { block: true })
      ) {
        editor.tf.unsetNodes([KEYS.listType, KEYS.indent], { at: block[1] });
        return;
      }

      // A plain indented block steps out one level instead of merging with the block above.
      if (
        block &&
        !isListParagraph(block[0]) &&
        blockIndentOf(block[0]) > 0 &&
        editor.api.isCollapsed() &&
        editor.api.isAt({ start: true })
      ) {
        runEditorCommand(editor, outdentBlocks, undefined, { readOnly: editor.dom.readOnly });
        return;
      }

      deleteBackward(unit);
    },
  },
}));
