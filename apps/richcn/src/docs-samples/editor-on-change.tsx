"use client";

import { useState } from "react";

import {
  NotionLikeEditorBlock,
  type EditorValue,
} from "@repo/core/components/blocks/notion-like-editor/index";

const START_VALUE: EditorValue = [
  { type: "h1", children: [{ text: "Release notes" }] },
  { type: "p", children: [{ text: "Write the summary of this release here." }] },
];

export function NotesEditor() {
  const [value, setValue] = useState<EditorValue>(START_VALUE);

  return (
    <div className="space-y-2">
      <NotionLikeEditorBlock documentId="notes" initialValue={START_VALUE} onChange={setValue} />
      <p className="text-muted-foreground text-xs">{value.length} top-level blocks</p>
    </div>
  );
}
