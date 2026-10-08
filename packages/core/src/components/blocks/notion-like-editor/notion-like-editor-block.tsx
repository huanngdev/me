"use client";

import type { AssetStore } from "./editor-assets";
import type { LinkPreviewAdapter } from "./editor-bookmark-url";
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
  assetStore?: AssetStore | null;
  linkPreview?: LinkPreviewAdapter | null;
};

export function NotionLikeEditorBlock(props: NotionLikeEditorBlockProps) {
  if (props.adapter) {
    return <PersistedEditor key={props.documentId} {...props} adapter={props.adapter} />;
  }

  return <MemoryEditor {...props} />;
}
