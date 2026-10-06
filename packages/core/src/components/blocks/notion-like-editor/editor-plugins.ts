import { BoldPlugin } from "@platejs/basic-nodes/react";
import { NodeIdPlugin, type AnyPluginConfig } from "platejs";

import { formatBold, runEditorCommand } from "./editor-commands";
import { PasteFallbackPlugin } from "./editor-paste";

// Plate's toggle follows the first text node and shares an undo step with nearby typing.
// This handler bolds unless every selected text is bold, in its own undo step.
const boldPlugin = BoldPlugin.configure({
  shortcuts: {
    toggle: {
      handler: ({ editor }) => {
        runEditorCommand(editor, formatBold, undefined, {
          readOnly: editor.dom.readOnly,
        });
      },
    },
  },
});

// Core skips its node-id plugin when NODE_ENV is "test" and no nodeId option is set.
// Plate splices NodeIdPlugin out of the plugins array it receives.
export function createEditorPlugins(): AnyPluginConfig[] {
  return [NodeIdPlugin, boldPlugin, PasteFallbackPlugin];
}
