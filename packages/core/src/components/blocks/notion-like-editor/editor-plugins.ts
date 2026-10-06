import { BoldPlugin, ItalicPlugin } from "@platejs/basic-nodes/react";
import { NodeIdPlugin, type AnyPluginConfig, type SlateEditor } from "platejs";

import { formatBold, formatItalic, runEditorCommand, type EditorCommand } from "./editor-commands";
import { PasteFallbackPlugin } from "./editor-paste";

type MarkShortcutConfig = {
  shortcuts: {
    toggle: {
      handler: (context: { editor: SlateEditor }) => void;
    };
  };
};

// Plate's toggle follows the first text node and shares an undo step with nearby typing.
// This handler marks unless every selected text has the mark, in its own undo step.
export function configureMarkShortcut<
  TPlugin extends { configure: (config: MarkShortcutConfig) => TPlugin },
>(plugin: TPlugin, command: EditorCommand): TPlugin {
  return plugin.configure({
    shortcuts: {
      toggle: {
        handler: ({ editor }) => {
          runEditorCommand(editor, command, undefined, {
            readOnly: editor.dom.readOnly,
          });
        },
      },
    },
  });
}

const boldPlugin = configureMarkShortcut(BoldPlugin, formatBold);
const italicPlugin = configureMarkShortcut(ItalicPlugin, formatItalic);

// Core skips its node-id plugin when NODE_ENV is "test" and no nodeId option is set.
// Plate splices NodeIdPlugin out of the plugins array it receives.
export function createEditorPlugins(): AnyPluginConfig[] {
  return [NodeIdPlugin, boldPlugin, italicPlugin, PasteFallbackPlugin];
}
