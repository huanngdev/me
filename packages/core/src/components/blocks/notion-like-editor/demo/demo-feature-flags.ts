import { EDITOR_FEATURES, type EditorFeatures } from "../lib/features/editor-features";

// The features that `?off=` turns off. The value is a comma-separated list of EditorFeature names.
// Names that are not features are ignored, and so are blanks around a name.
export function parseOffFeatures(search: string): EditorFeatures {
  const features: EditorFeatures = {};
  const value = new URLSearchParams(search).get("off");
  if (value === null) {
    return features;
  }

  for (const name of value.split(",")) {
    const feature = EDITOR_FEATURES.find((candidate) => candidate === name.trim());
    if (feature !== undefined) {
      features[feature] = false;
    }
  }
  return features;
}
