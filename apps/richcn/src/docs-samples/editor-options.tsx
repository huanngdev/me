"use client";

import { NotionLikeEditorBlock } from "@repo/core/components/blocks/notion-like-editor/index";

export function TunedEditor() {
  return (
    <NotionLikeEditorBlock
      documentId="notes"
      options={{
        handle: { gap: 20, centerMax: 48, anchorCenterMax: 64 },
        autosave: { debounceMs: 1500 },
        shortcutHints: false,
        appendOnTailClick: false,
      }}
    />
  );
}
