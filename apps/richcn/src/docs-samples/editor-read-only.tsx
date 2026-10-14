"use client";

import { NotionLikeEditorBlock } from "@repo/core/components/blocks/notion-like-editor/index";

export function NotesViewer() {
  return <NotionLikeEditorBlock documentId="notes" readOnly />;
}
