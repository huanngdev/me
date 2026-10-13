import { useState } from "react";
import { usePluginOption } from "platejs/react";

import {
  DEFAULT_EDITOR_OPTIONS,
  editorOptionsKey,
  resolveEditorOptions,
  type EditorOptions,
  type ResolvedEditorOptions,
} from "../lib/features/editor-options";
import { editorConfigPlugin } from "../lib/plugins/editor-config";

// The editor's options, re-rendered when they change. Call it only inside a
// Plate tree. A component outside one reads editorOptions() instead.
export function useEditorOptions(): ResolvedEditorOptions {
  return usePluginOption(editorConfigPlugin, "resolved") ?? DEFAULT_EDITOR_OPTIONS;
}

// Resolves a host's options to one object per distinct value. A new object
// with the same values returns the object from the previous render, so an
// effect keyed on the result does not run again for an equal value.
export function useStableEditorOptions(options?: EditorOptions): ResolvedEditorOptions {
  const resolved = resolveEditorOptions(options);
  const key = editorOptionsKey(resolved);
  const [stable, setStable] = useState(resolved);
  if (editorOptionsKey(stable) !== key) {
    setStable(resolved);
  }
  return stable;
}
