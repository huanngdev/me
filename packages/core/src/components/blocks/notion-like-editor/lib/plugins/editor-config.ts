import { createSlatePlugin, type SlateEditor } from "platejs";

import { DEFAULT_EDITOR_OPTIONS, type ResolvedEditorOptions } from "../features/editor-options";

// Carries the host's resolved options on the editor. It has no handlers and no
// transforms, so it changes nothing about how the editor edits.
export const editorConfigPlugin = createSlatePlugin({
  key: "editorConfig",
  options: { resolved: DEFAULT_EDITOR_OPTIONS },
});

// The options of this editor. An editor without the config plugin (a static
// editor or a bare test editor) gets the defaults. This never throws.
export function editorOptions(editor: SlateEditor): ResolvedEditorOptions {
  return editor.getOption(editorConfigPlugin, "resolved") ?? DEFAULT_EDITOR_OPTIONS;
}
