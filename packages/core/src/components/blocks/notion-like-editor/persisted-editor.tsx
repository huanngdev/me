"use client";

import { cn } from "@/lib/utils";

import { EditorDocumentSkeleton } from "./editor-document-skeleton";
import { EditorRecoveryNotice } from "./editor-recovery-notice";
import type { EditorPersistenceAdapter } from "./editor-persistence";
import type { NotionLikeEditorBlockProps } from "./notion-like-editor-block";
import { ReadyEditor } from "./ready-editor";
import { useEditorDocument } from "./use-editor-document";

export function PersistedEditor({
  documentId,
  initialValue,
  onChange,
  readOnly = false,
  placeholder = "Type something…",
  className,
  adapter,
  linkPreview = null,
  mentionProvider = null,
}: NotionLikeEditorBlockProps & { adapter: EditorPersistenceAdapter }) {
  const session = useEditorDocument({ documentId, adapter, readOnly, initialValue });

  return (
    <div className={cn("bg-background h-full min-h-full w-full min-w-0 px-4", className)}>
      {session.phase === "loading" ? <EditorDocumentSkeleton /> : null}
      {session.phase === "recovery" ? (
        <EditorRecoveryNotice
          result={session.result}
          raw={session.raw}
          error={session.error}
          onStartOver={() => {
            void session.startOver();
          }}
        />
      ) : null}
      {session.phase === "ready" ? (
        <ReadyEditor
          documentId={documentId}
          initialValue={session.document.content}
          readOnly={readOnly}
          placeholder={placeholder}
          onChange={onChange}
          onContentChange={session.onContentChange}
          linkPreview={linkPreview}
          mentionProvider={mentionProvider}
          status={session.status}
          message={session.message}
          onRetry={() => {
            void session.retry();
          }}
        />
      ) : null}
    </div>
  );
}
