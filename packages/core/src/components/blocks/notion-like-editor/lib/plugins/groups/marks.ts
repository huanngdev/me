import {
  BoldPlugin,
  CodePlugin,
  ItalicPlugin,
  KbdPlugin,
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
} from "@platejs/basic-styles/react";
import { KEYS, someHtmlElement, type SlateEditor } from "platejs";
import { EDITOR_SHORTCUTS } from "../../features/editor-shortcuts";
import {
  formatBold,
  formatCode,
  formatItalic,
  formatKeyboard,
  formatStrikethrough,
  formatSubscript,
  formatSuperscript,
  formatUnderline,
  runEditorCommand,
  type EditorCommand,
} from "../../commands/editor-commands";
import {
  FONT_FAMILIES,
  isAllowedValue,
  isPaletteToken,
} from "../../document/editor-document-schema";
import { codeLeafClassName } from "../../static/mark-classes";
import { KBD_CLASS } from "../../../components/elements/kbd-classes";

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

export const boldPlugin = configureMarkPlugin(BoldPlugin, formatBold);

export const italicPlugin = configureMarkPlugin(ItalicPlugin, formatItalic);

export const underlinePlugin = configureMarkPlugin(UnderlinePlugin, formatUnderline, {
  rules: underlineRules,
});

export const strikethroughPlugin = configureMarkPlugin(StrikethroughPlugin, formatStrikethrough, {
  keys: [[...EDITOR_SHORTCUTS.strikethrough]],
  rules: strikethroughRules,
});

export const codePlugin = configureMarkPlugin(CodePlugin, formatCode, {
  keys: [[...EDITOR_SHORTCUTS.code]],
  className: codeLeafClassName,
});
// SuperscriptPlugin ships no shortcut. "period" is KeyboardEvent.code Period, the Mod+. key.

export const superscriptPlugin = configureMarkPlugin(SuperscriptPlugin, formatSuperscript, {
  keys: [[...EDITOR_SHORTCUTS.superscript]],
});
// SubscriptPlugin ships no shortcut. "comma" is KeyboardEvent.code Comma, the Mod+, key.

export const subscriptPlugin = configureMarkPlugin(SubscriptPlugin, formatSubscript, {
  keys: [[...EDITOR_SHORTCUTS.subscript]],
});
// KbdPlugin ships no shortcut. Toggled from the More menu only.

export const kbdPlugin = configureMarkPlugin(KbdPlugin, formatKeyboard, { className: KBD_CLASS });

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

export const textColorPlugin = FontColorPlugin.configure({
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

export const fontSizePlugin = FontSizePlugin.configure({
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

export const highlightPlugin = FontBackgroundColorPlugin.configure({
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

export const fontFamilyPlugin = FontFamilyPlugin.configure({
  inject: { nodeProps: fontFamilyNodeProps() },
});

// Unitless CSS becomes a number. px, %, and keywords stay strings for the allowlist to drop.
