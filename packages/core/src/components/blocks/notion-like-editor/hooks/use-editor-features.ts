import { useState } from "react";
import { usePluginOption } from "platejs/react";

import {
  DEFAULT_EDITOR_FEATURES,
  editorFeaturesKey,
  resolveEditorFeatures,
  type EditorFeatures,
  type ResolvedEditorFeatures,
} from "../lib/features/editor-features";
import { editorConfigPlugin } from "../lib/plugins/editor-config";

// The editor's features, re-rendered when they change. Call it only inside a
// Plate tree. A component outside one reads editorFeatures() instead.
export function useEditorFeatures(): ResolvedEditorFeatures {
  return usePluginOption(editorConfigPlugin, "features") ?? DEFAULT_EDITOR_FEATURES;
}

// Resolves a host's features to one object per distinct value. A new object
// with the same values returns the object from the previous render, so an
// effect keyed on the result does not run again for an equal value.
export function useStableEditorFeatures(features?: EditorFeatures): ResolvedEditorFeatures {
  const resolved = resolveEditorFeatures(features);
  const key = editorFeaturesKey(resolved);
  const [stable, setStable] = useState(resolved);
  if (editorFeaturesKey(stable) !== key) {
    setStable(resolved);
  }
  return stable;
}
