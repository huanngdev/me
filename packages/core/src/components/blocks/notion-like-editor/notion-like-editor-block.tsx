"use client";

import type { LinkPreviewAdapter } from "./lib/features/editor-bookmark-url";
import type { MentionProvider } from "./lib/features/editor-mention-node";
import type { EditorPersistenceAdapter } from "./lib/document/editor-persistence";
import type { EditorValue } from "./lib/document/editor-value";
import { MemoryEditor } from "./components/editor/memory-editor";
import { PersistedEditor } from "./components/editor/persisted-editor";

export type NotionLikeEditorBlockProps = {
  documentId: string;
  initialValue?: EditorValue;
  onChange?: (value: EditorValue) => void;
  readOnly?: boolean;
  placeholder?: string;
  className?: string;
  adapter?: EditorPersistenceAdapter;
  linkPreview?: LinkPreviewAdapter | null;
  mentionProvider?: MentionProvider | null;
};

export function NotionLikeEditorBlock(props: NotionLikeEditorBlockProps) {
  if (props.adapter) {
    return <PersistedEditor key={props.documentId} {...props} adapter={props.adapter} />;
  }

  return <MemoryEditor {...props} />;
}
