import {
  BlockquotePlugin,
  H1Plugin,
  H2Plugin,
  H3Plugin,
  HorizontalRulePlugin,
} from "@platejs/basic-nodes/react";
import { LineHeightPlugin, TextAlignPlugin } from "@platejs/basic-styles/react";
import { CalloutPlugin } from "@platejs/callout/react";
import { KEYS, PathApi, createSlatePlugin, type SlateEditor } from "platejs";
import type { JSX } from "react";
import { ParagraphPlugin, toPlatePlugin, type PlateElementProps } from "platejs/react";
import { ListParagraph } from "../../../components/elements/block-list";
import { BlockquoteElement } from "../../../components/elements/blockquote-element";
import { CalloutElement } from "../../../components/elements/callout-element";
import { HrElement } from "../../../components/elements/hr-element";
import { EDITOR_SHORTCUTS } from "../../features/editor-shortcuts";
import { BLOCK_TONE_TYPES, blockToneNodeProps } from "../../features/editor-block-tone-style";
import { BLOCK_INDENT_TYPES, blockIndentNodeProps } from "../../features/editor-block-indent-style";
import {
  blockIndentTargets,
  indentBlocks,
  outdentBlocks,
} from "../../features/editor-block-indent";
import { ToggleElement } from "../../../components/elements/toggle-element";
import {
  backspaceToggleLabel,
  breakToggleLabel,
  collectToggleIds,
  installToggleOnChange,
  openNewToggles,
  togglePlugin as toggleBasePlugin,
} from "../editor-toggle";
import {
  clearFormatting,
  containerParentType,
  onBlockMoveKeyDown,
  runEditorCommand,
  TURN_INTO_HEADING,
  type EditorCommand,
  type HeadingLevel,
} from "../../commands/editor-commands";
import { firstChildType } from "../../document/editor-document-schema";
import { HeadingElement } from "../../../components/elements/heading-element";
import { isElementRecord } from "./shared";

export const paragraphPlugin = ParagraphPlugin.configure({
  render: {
    node: ListParagraph,
  },
});

const UNITLESS_LINE_HEIGHT = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;

function lineHeightFromCss(value: string): number | string {
  const trimmed = value.trim();
  if (!UNITLESS_LINE_HEIGHT.test(trimmed)) {
    return trimmed;
  }

  return Number(trimmed);
}

type HeadingPluginConfig = {
  render: { node: typeof HeadingElement };
  rules: {
    delete: {
      empty: "reset";
      start: "default";
    };
  };
  shortcuts: {
    toggle: {
      keys: string[][];
      handler: (context: { editor: SlateEditor }) => void;
    };
  };
};

// Plate resets a heading on any Backspace at the block start. "default" lets a non-empty
// heading merge, and an empty heading still resets. Heading plugins ship no hotkey.

function configureHeadingPlugin<
  TPlugin extends { configure: (config: HeadingPluginConfig) => TPlugin },
>(plugin: TPlugin, level: HeadingLevel): TPlugin {
  const command = TURN_INTO_HEADING[level];

  return plugin.configure({
    render: { node: HeadingElement },
    rules: {
      delete: {
        empty: "reset",
        start: "default",
      },
    },
    shortcuts: {
      toggle: {
        keys: [[...EDITOR_SHORTCUTS[`h${level}` as const]]],
        handler: ({ editor }) => {
          runEditorCommand(editor, command, undefined, {
            readOnly: editor.dom.readOnly,
          });
        },
      },
    },
  });
}

export const heading1Plugin = configureHeadingPlugin(H1Plugin, 1);

export const heading2Plugin = configureHeadingPlugin(H2Plugin, 2);

export const heading3Plugin = configureHeadingPlugin(H3Plugin, 3);

function containerRules(type: string) {
  return {
    break: { empty: "lift" as const },
    delete: { start: "lift" as const },
    match: ({
      editor,
      node,
      path,
      rule,
    }: {
      editor: SlateEditor;
      node: unknown;
      path?: number[];
      rule: string;
    }) => {
      if ((rule !== "break.empty" && rule !== "delete.start") || !path || !isElementRecord(node)) {
        return false;
      }

      if (containerParentType(editor, node, path) !== type) {
        return false;
      }

      // The label's Backspace unwraps the whole container. delete.start would lift only the label.
      if (
        rule === "delete.start" &&
        path[path.length - 1] === 0 &&
        firstChildType(type) !== undefined
      ) {
        return false;
      }

      return rule === "break.empty" || !PathApi.hasPrevious(path);
    },
  };
}

function configureContainerPlugin<TNode extends (props: PlateElementProps) => JSX.Element, TResult>(
  plugin: {
    key: string;
    configure: (config: {
      render: { node: TNode };
      rules: ReturnType<typeof containerRules>;
    }) => TResult;
  },
  node: TNode,
): TResult {
  return plugin.configure({
    render: { node },
    rules: containerRules(plugin.key),
  });
}

export const blockquotePlugin = configureContainerPlugin(BlockquotePlugin, BlockquoteElement);

export const calloutPlugin = configureContainerPlugin(CalloutPlugin, CalloutElement);

export const togglePlugin = configureContainerPlugin(
  toggleBasePlugin,
  ToggleElement,
).overrideEditor(({ editor, tf: { insertBreak, deleteBackward, insertFragment } }) => {
  installToggleOnChange(editor);

  return {
    transforms: {
      insertBreak() {
        if (breakToggleLabel(editor, insertBreak)) {
          return;
        }

        insertBreak();
      },
      deleteBackward(unit) {
        if (backspaceToggleLabel(editor)) {
          return;
        }

        deleteBackward(unit);
      },
      insertFragment(fragment, options) {
        const before = collectToggleIds(editor);
        insertFragment(fragment, options);
        openNewToggles(editor, before);
      },
    },
  };
});

// Plate's normalizeBlockquoteChildren wraps inline children in paragraphs and leaves
// block children unchanged, including a nested quote or a heading. This pass is the
// outer normalizer: it rewrites a child whose type is outside childTypes, then Plate
// only sees paragraphs or wraps leftover inlines. A disallowed void is lifted out so
// it is not retyped into an empty paragraph.

export const textAlignPlugin = TextAlignPlugin.configure({
  inject: {
    targetPlugins: [KEYS.p, KEYS.h1, KEYS.h2, KEYS.h3],
  },
});

// Block tones are injected by the block itself, so the leaf token helpers do not apply.

export const blockTonePlugin = createSlatePlugin({
  key: "blockTone",
  inject: {
    isElement: true,
    targetPlugins: [...BLOCK_TONE_TYPES],
    nodeProps: blockToneNodeProps(),
  },
});

// Plain blocks get their margin from the injector. Cmd+] and Cmd+[ are browser history keys
// on some platforms. A block at its limit still takes the key, so the browser never sees it.

function runBlockIndentShortcut(editor: SlateEditor, command: EditorCommand): boolean {
  if (editor.dom.readOnly) {
    return false;
  }

  if (runEditorCommand(editor, command, undefined, { readOnly: false })) {
    return true;
  }

  return blockIndentTargets(editor).length > 0;
}

export const blockIndentPlugin = createSlatePlugin({
  key: "blockIndent",
  inject: {
    isElement: true,
    targetPlugins: [...BLOCK_INDENT_TYPES],
    nodeProps: blockIndentNodeProps(),
  },
  shortcuts: {
    indent: {
      keys: [[...EDITOR_SHORTCUTS.indent]],
      handler: ({ editor }) => runBlockIndentShortcut(editor, indentBlocks),
    },
  },
});

export const blockOutdentPlugin = createSlatePlugin({
  key: "blockOutdent",
  shortcuts: {
    outdent: {
      keys: [[...EDITOR_SHORTCUTS.outdent]],
      handler: ({ editor }) => runBlockIndentShortcut(editor, outdentBlocks),
    },
  },
});

export const lineHeightPlugin = LineHeightPlugin.configure({
  inject: {
    // 0 is not a preset. Plate unsets the attribute when setLineHeight receives it,
    // and the injector skips only that sentinel, so 1.5 still renders.
    // Headings are not targets. Their leading stays on the heading component.
    nodeProps: {
      nodeKey: "lineHeight",
      defaultNodeValue: 0,
    },
    targetPlugins: [KEYS.p],
    targetPluginToInject: ({ editor }) => ({
      parsers: {
        html: {
          deserializer: {
            parse: ({ element }) => {
              const raw = element.style.lineHeight;
              if (!raw) {
                return;
              }

              return { [editor.getType(KEYS.lineHeight)]: lineHeightFromCss(raw) };
            },
          },
        },
      },
    }),
  },
});

// "Backslash" is KeyboardEvent.code Backslash, the Mod+\ key. Plate has no clear-formatting plugin.

export const clearFormattingPlugin = createSlatePlugin({
  key: "clearFormatting",
  shortcuts: {
    clear: {
      keys: [[...EDITOR_SHORTCUTS.clearFormatting]],
      handler: ({ editor }) => {
        runEditorCommand(editor, clearFormatting, undefined, {
          readOnly: editor.dom.readOnly,
        });
      },
    },
  },
});

// The empty block above becomes the first item, so a restart moves with it.

export const horizontalRulePlugin = HorizontalRulePlugin.configure({
  render: { node: HrElement },
});

export const blockMovePlugin = toPlatePlugin(createSlatePlugin({ key: "blockMove" }), {
  handlers: {
    onKeyDown: ({ editor, event }) => onBlockMoveKeyDown(editor, event),
  },
});

export const toggleRevealPlugin = createSlatePlugin({
  key: "toggleReveal",
  priority: 0,
}).overrideEditor(({ editor }) => {
  installToggleOnChange(editor);
  return { transforms: {} };
});
