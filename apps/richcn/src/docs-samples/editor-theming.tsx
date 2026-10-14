"use client";

import type { CSSProperties } from "react";

import { NotionLikeEditorBlock } from "@repo/core/components/blocks/notion-like-editor/index";

// Set the editor's own custom properties on an ancestor. They are inherited.
const THEME = {
  "--editor-max-width": "900px",
  "--editor-text-blue": "oklch(0.5 0.13 255)",
  "--editor-callout-info-bg": "oklch(0.96 0.03 255)",
} as CSSProperties;

export function WideEditor() {
  return (
    <div style={THEME}>
      <NotionLikeEditorBlock documentId="notes" />
    </div>
  );
}
