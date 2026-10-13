import { createSlatePlugin, type SlateEditor } from "platejs";

import { DEFAULT_EDITOR_OPTIONS, type ResolvedEditorOptions } from "../features/editor-options";
import {
  DEFAULT_EDITOR_FEATURES,
  itemFeature,
  type EditorFeature,
  type ResolvedEditorFeatures,
} from "../features/editor-features";

// Carries the host's resolved options and features on the editor. It has no handlers and no
// transforms, so it changes nothing about how the editor edits.
export const editorConfigPlugin = createSlatePlugin({
  key: "editorConfig",
  options: { resolved: DEFAULT_EDITOR_OPTIONS, features: DEFAULT_EDITOR_FEATURES },
});

// The options of this editor. An editor without the config plugin (a static
// editor or a bare test editor) gets the defaults. This never throws.
export function editorOptions(editor: SlateEditor): ResolvedEditorOptions {
  return editor.getOption(editorConfigPlugin, "resolved") ?? DEFAULT_EDITOR_OPTIONS;
}

// The features of this editor. An editor without the config plugin gets the defaults.
export function editorFeatures(editor: SlateEditor): ResolvedEditorFeatures {
  return editor.getOption(editorConfigPlugin, "features") ?? DEFAULT_EDITOR_FEATURES;
}

export function featureEnabled(editor: SlateEditor, feature: EditorFeature): boolean {
  return editorFeatures(editor)[feature];
}

// An item that no feature gates is always enabled. Others follow their feature.
export function itemFeatureEnabled(editor: SlateEditor, itemId: string): boolean {
  const feature = itemFeature(itemId);
  return feature === undefined || featureEnabled(editor, feature);
}
