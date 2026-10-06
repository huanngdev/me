import {
  BoldPlugin,
  CodePlugin,
  H1Plugin,
  ItalicPlugin,
  StrikethroughPlugin,
  SubscriptPlugin,
  SuperscriptPlugin,
  UnderlinePlugin,
} from "@platejs/basic-nodes/react";
import {
  FontBackgroundColorPlugin,
  FontColorPlugin,
  FontFamilyPlugin,
  FontSizePlugin,
  LineHeightPlugin,
  TextAlignPlugin,
} from "@platejs/basic-styles/react";
import {
  KEYS,
  NodeIdPlugin,
  createSlatePlugin,
  someHtmlElement,
  type AnyPluginConfig,
  type SlateEditor,
} from "platejs";
import { Key } from "platejs/react";

import {
  clearFormatting,
  formatBold,
  formatCode,
  formatItalic,
  formatStrikethrough,
  formatSubscript,
  formatSuperscript,
  formatUnderline,
  runEditorCommand,
  turnIntoHeading1,
  type EditorCommand,
} from "./editor-commands";
import { FONT_FAMILIES, isAllowedValue, isPaletteToken } from "./editor-document-schema";
import { PasteFallbackPlugin } from "./editor-paste";
import { HeadingElement } from "./heading-element";

type TextDecorationRule = {
  validNodeName?: string[];
  validStyle?: {
    textDecoration?: string[];
    textDecorationLine?: string[];
  };
};

type MarkPluginConfig = {
  shortcuts: {
    toggle: {
      keys?: string[][];
      handler: (context: { editor: SlateEditor }) => void;
    };
  };
  parsers?: {
    html: {
      deserializer: {
        rules: TextDecorationRule[];
        query: (context: { element: HTMLElement }) => boolean;
      };
    };
  };
  node?: {
    props: {
      className: string;
    };
  };
};

type MarkPluginOptions = {
  keys?: string[][];
  rules?: TextDecorationRule[];
  className?: string;
};

// The paragraph is text-base (16px). 0.9em would be 14.4px, under the body-text floor.
const codeLeafClassName =
  "border-border bg-muted text-foreground rounded-md border px-1.5 py-0.5 font-mono text-base";

const underlineDecorations = ["underline", "underline line-through", "line-through underline"];

const strikethroughDecorations = [
  "line-through",
  "underline line-through",
  "line-through underline",
];

// Plate matches each validStyle string exactly, and a rules array from configure replaces the old one.
const underlineRules: TextDecorationRule[] = [
  { validNodeName: ["U"] },
  { validStyle: { textDecoration: underlineDecorations } },
  { validStyle: { textDecorationLine: underlineDecorations } },
];

const strikethroughRules: TextDecorationRule[] = [
  { validNodeName: ["S", "DEL", "STRIKE"] },
  { validStyle: { textDecoration: strikethroughDecorations } },
  { validStyle: { textDecorationLine: strikethroughDecorations } },
];

function allowsTextDecoration(element: HTMLElement): boolean {
  return !someHtmlElement(
    element,
    (node) => node.style.textDecoration === "none" || node.style.textDecorationLine === "none",
  );
}

// Sets the mixed-selection shortcut and, when rules are given, the HTML deserializer.
// Both share one configure call, because a later configure replaces the first.
export function configureMarkPlugin<
  TPlugin extends { configure: (config: MarkPluginConfig) => TPlugin },
>(plugin: TPlugin, command: EditorCommand, options?: MarkPluginOptions): TPlugin {
  const config: MarkPluginConfig = {
    shortcuts: {
      toggle: {
        handler: ({ editor }) => {
          runEditorCommand(editor, command, undefined, {
            readOnly: editor.dom.readOnly,
          });
        },
      },
    },
  };

  if (options?.keys) {
    config.shortcuts.toggle.keys = options.keys;
  }

  if (options?.rules) {
    config.parsers = {
      html: {
        deserializer: {
          rules: options.rules,
          query: ({ element }) => allowsTextDecoration(element),
        },
      },
    };
  }

  if (options?.className) {
    config.node = { props: { className: options.className } };
  }

  return plugin.configure(config);
}

const boldPlugin = configureMarkPlugin(BoldPlugin, formatBold);
const italicPlugin = configureMarkPlugin(ItalicPlugin, formatItalic);
const underlinePlugin = configureMarkPlugin(UnderlinePlugin, formatUnderline, {
  rules: underlineRules,
});
const strikethroughPlugin = configureMarkPlugin(StrikethroughPlugin, formatStrikethrough, {
  keys: [[Key.Mod, Key.Shift, "x"]],
  rules: strikethroughRules,
});
const codePlugin = configureMarkPlugin(CodePlugin, formatCode, {
  keys: [[Key.Mod, "e"]],
  className: codeLeafClassName,
});
// SuperscriptPlugin ships no shortcut. "period" is KeyboardEvent.code Period, the Mod+. key.
const superscriptPlugin = configureMarkPlugin(SuperscriptPlugin, formatSuperscript, {
  keys: [[Key.Mod, "period"]],
});
// SubscriptPlugin ships no shortcut. "comma" is KeyboardEvent.code Comma, the Mod+, key.
const subscriptPlugin = configureMarkPlugin(SubscriptPlugin, formatSubscript, {
  keys: [[Key.Mod, "comma"]],
});

type TokenNodePropsOptions = {
  nodeValue?: unknown;
  props: Record<string, unknown>;
  text?: unknown;
};

// The stored value is a token. transformProps writes the theme variable so the
// leaf never receives the token string as a CSS value.
function tokenNodeProps(
  nodeKey: string,
  cssProperty: "color" | "backgroundColor" | "fontFamily",
  variablePrefix: "--editor-text" | "--editor-bg" | "--editor-font",
  isToken: (value: unknown) => boolean,
) {
  return {
    nodeKey,
    transformProps: ({ nodeValue, props }: TokenNodePropsOptions) => {
      if (!isToken(nodeValue)) {
        return {};
      }

      return {
        ...props,
        style: { [cssProperty]: `var(${variablePrefix}-${nodeValue})` },
      };
    },
  };
}

function isFontFamilyToken(value: unknown): boolean {
  return isAllowedValue(value, FONT_FAMILIES);
}

function hasCodeMark(text: unknown): boolean {
  return (
    typeof text === "object" &&
    text !== null &&
    KEYS.code in text &&
    Reflect.get(text, KEYS.code) === true
  );
}

function fontFamilyNodeProps() {
  const tokenProps = tokenNodeProps(
    KEYS.fontFamily,
    "fontFamily",
    "--editor-font",
    isFontFamilyToken,
  );

  return {
    nodeKey: tokenProps.nodeKey,
    transformProps: (options: TokenNodePropsOptions) => {
      // Inline style beats the code class, so a code leaf always gets the mono stack.
      if (isFontFamilyToken(options.nodeValue) && hasCodeMark(options.text)) {
        return {
          ...options.props,
          style: { fontFamily: "var(--editor-font-mono)" },
        };
      }

      return tokenProps.transformProps(options);
    },
  };
}

const textColorPlugin = FontColorPlugin.configure({
  inject: { nodeProps: tokenNodeProps(KEYS.color, "color", "--editor-text", isPaletteToken) },
});

// 1pt is 4/3 px. A length that is not an exact preset is left for the mark allowlist to drop.
const FONT_SIZE_LENGTH = /^(-?(?:\d+|\d*\.\d+))(px|pt)$/i;

function fontSizeFromCss(value: string): string {
  const match = FONT_SIZE_LENGTH.exec(value.trim());
  if (!match || match[2].toLowerCase() === "px") {
    return value.trim();
  }

  const px = (Number(match[1]) * 4) / 3;
  const whole = Math.round(px);
  if (Math.abs(px - whole) < 1e-6) {
    return `${whole}px`;
  }

  return `${px}px`;
}

// The stored value is already a CSS length, so Plate's default style injection renders it.
const fontSizePlugin = FontSizePlugin.configure({
  parsers: {
    html: {
      deserializer: {
        parse: ({ element, type }) => {
          const size = element.style.fontSize;
          if (!size) {
            return;
          }

          return { [type]: fontSizeFromCss(size) };
        },
      },
    },
  },
});

const highlightPlugin = FontBackgroundColorPlugin.configure({
  inject: {
    nodeProps: tokenNodeProps(
      KEYS.backgroundColor,
      "backgroundColor",
      "--editor-bg",
      isPaletteToken,
    ),
  },
  parsers: {
    html: {
      deserializer: {
        isLeaf: true,
        rules: [{ validStyle: { backgroundColor: "*" } }, { validNodeName: ["MARK"] }],
        parse: ({ element, type }) => {
          if (element.nodeName === "MARK") {
            return { [type]: "yellow" };
          }

          const background = element.style.backgroundColor;
          if (background) {
            return { [type]: background };
          }
        },
      },
    },
  },
});

const fontFamilyPlugin = FontFamilyPlugin.configure({
  inject: { nodeProps: fontFamilyNodeProps() },
});

// Unitless CSS becomes a number. px, %, and keywords stay strings for the allowlist to drop.
const UNITLESS_LINE_HEIGHT = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;

function lineHeightFromCss(value: string): number | string {
  const trimmed = value.trim();
  if (!UNITLESS_LINE_HEIGHT.test(trimmed)) {
    return trimmed;
  }

  return Number(trimmed);
}

// Plate's H1 rule resets on any Backspace at the block start, including a non-empty heading.
// "default" lets that Backspace merge. An empty heading still resets to a paragraph.
// H1Plugin ships no hotkey. "1" is KeyboardEvent.code Digit1, the Mod+Alt+1 key.
const heading1Plugin = H1Plugin.configure({
  render: { node: HeadingElement },
  rules: {
    delete: {
      empty: "reset",
      start: "default",
    },
  },
  shortcuts: {
    toggle: {
      keys: [[Key.Mod, Key.Alt, "1"]],
      handler: ({ editor }) => {
        runEditorCommand(editor, turnIntoHeading1, undefined, {
          readOnly: editor.dom.readOnly,
        });
      },
    },
  },
});

const textAlignPlugin = TextAlignPlugin.configure({
  inject: {
    targetPlugins: [KEYS.p, KEYS.h1],
  },
});

const lineHeightPlugin = LineHeightPlugin.configure({
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
const clearFormattingPlugin = createSlatePlugin({
  key: "clearFormatting",
  shortcuts: {
    clear: {
      keys: [[Key.Mod, "Backslash"]],
      handler: ({ editor }) => {
        runEditorCommand(editor, clearFormatting, undefined, {
          readOnly: editor.dom.readOnly,
        });
      },
    },
  },
});

// Plate's split at offset 0 leaves the original id on the empty first half and gives the block a new id.
// A non-empty block keeps its identity and an empty paragraph is inserted above; registered last so this runs before H1's splitReset.
const breakAbovePlugin = createSlatePlugin({
  key: "breakAbove",
}).overrideEditor(({ editor, tf: { insertBreak } }) => ({
  transforms: {
    insertBreak() {
      const selection = editor.selection;
      const block = selection ? editor.api.block() : undefined;
      if (
        block &&
        editor.api.isCollapsed() &&
        editor.api.isAt({ start: true }) &&
        !editor.api.isEmpty(selection, { block: true })
      ) {
        editor.tf.insertNodes(editor.api.create.block(), { at: block[1], select: false });
        return;
      }

      insertBreak();
    },
  },
}));

// Core skips its node-id plugin when NODE_ENV is "test" and no nodeId option is set.
// Plate splices NodeIdPlugin out of the plugins array it receives.
export function createEditorPlugins(): AnyPluginConfig[] {
  return [
    NodeIdPlugin,
    boldPlugin,
    italicPlugin,
    underlinePlugin,
    strikethroughPlugin,
    codePlugin,
    superscriptPlugin,
    subscriptPlugin,
    textColorPlugin,
    highlightPlugin,
    fontSizePlugin,
    fontFamilyPlugin,
    heading1Plugin,
    textAlignPlugin,
    lineHeightPlugin,
    clearFormattingPlugin,
    PasteFallbackPlugin,
    breakAbovePlugin,
  ];
}
