"use client";

import { NotionLikeEditorBlock } from "@repo/core/components/blocks/notion-like-editor/index";

export function CommentEditor() {
  return (
    <NotionLikeEditorBlock
      documentId="comment-42"
      features={{
        media: false,
        embeds: false,
        tables: false,
        columns: false,
        code: false,
        equations: false,
        mentions: false,
        pageLinks: false,
        footnotes: false,
        dates: false,
        emoji: false,
        toc: false,
      }}
    />
  );
}
