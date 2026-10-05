"use client";

import type { EditorPersistenceAdapter } from "./editor-persistence";
import type { EditorValue } from "./editor-value";
import { MemoryEditor } from "./memory-editor";
import { PersistedEditor } from "./persisted-editor";

export type NotionLikeEditorBlockProps = {
  documentId: string;
  initialValue?: EditorValue;
  onChange?: (value: EditorValue) => void;
  readOnly?: boolean;
  placeholder?: string;
  className?: string;
  adapter?: EditorPersistenceAdapter;
};

export function NotionLikeEditorBlock(props: NotionLikeEditorBlockProps) {
  if (props.adapter) {
    return <PersistedEditor key={props.documentId} {...props} adapter={props.adapter} />;
  }

  return <MemoryEditor {...props} />;
}
