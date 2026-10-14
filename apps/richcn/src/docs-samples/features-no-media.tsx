"use client";

import { NotionLikeEditorBlock } from "@repo/core/components/blocks/notion-like-editor/index";

export function TextOnlyEditor() {
  return <NotionLikeEditorBlock documentId="notes" features={{ media: false, embeds: false }} />;
}
