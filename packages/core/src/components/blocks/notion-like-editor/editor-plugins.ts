import {
  BoldPlugin,
  CodePlugin,
  ItalicPlugin,
  StrikethroughPlugin,
  SubscriptPlugin,
  SuperscriptPlugin,
  UnderlinePlugin,
} from "@platejs/basic-nodes/react";
import { FontBackgroundColorPlugin, FontColorPlugin } from "@platejs/basic-styles/react";
import {
  KEYS,
  NodeIdPlugin,
  someHtmlElement,
  type AnyPluginConfig,
  type SlateEditor,
} from "platejs";
import { Key } from "platejs/react";

import {
  formatBold,
  formatCode,
  formatItalic,
  formatStrikethrough,
  formatSubscript,
  formatSuperscript,
  formatUnderline,
  runEditorCommand,
  type EditorCommand,
} from "./editor-commands";
import { isPaletteToken } from "./editor-document-schema";
import { PasteFallbackPlugin } from "./editor-paste";

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

// The stored value is a palette token. transformProps writes the theme variable so the
// leaf never receives the token string as a CSS color.
function paletteNodeProps(
  nodeKey: string,
  cssProperty: "color" | "backgroundColor",
  variablePrefix: "--editor-text" | "--editor-bg",
) {
  return {
    nodeKey,
    transformProps: ({
      nodeValue,
      props,
    }: {
      nodeValue?: unknown;
      props: Record<string, unknown>;
    }) => {
      if (!isPaletteToken(nodeValue)) {
        return {};
      }

      return {
        ...props,
        style: { [cssProperty]: `var(${variablePrefix}-${nodeValue})` },
      };
    },
  };
}

const textColorPlugin = FontColorPlugin.configure({
  inject: { nodeProps: paletteNodeProps(KEYS.color, "color", "--editor-text") },
});

const highlightPlugin = FontBackgroundColorPlugin.configure({
  inject: {
    nodeProps: paletteNodeProps(KEYS.backgroundColor, "backgroundColor", "--editor-bg"),
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
    PasteFallbackPlugin,
  ];
}
