"use client";

import { cn } from "@/lib/utils";

import { EditorDocumentSkeleton } from "./editor-document-skeleton";
import { EditorRecoveryNotice } from "./editor-recovery-notice";
import type { EditorPersistenceAdapter } from "../../lib/document/editor-persistence";
import { DEFAULT_PLACEHOLDER } from "../../lib/features/editor-placeholder";
import { resolveEditorOptions } from "../../lib/features/editor-options";
import type { NotionLikeEditorBlockProps } from "../../notion-like-editor-block";
import { ReadyEditor } from "./ready-editor";
import { useEditorDocument } from "../../hooks/use-editor-document";

export function PersistedEditor({
  documentId,
  initialValue,
  onChange,
  readOnly = false,
  placeholder = DEFAULT_PLACEHOLDER,
  ariaLabel = "Rich text editor",
  className,
  adapter,
  linkPreview = null,
  mentionProvider = null,
  pageProvider = null,
  onOpenPage,
  fileUpload = null,
  options,
}: NotionLikeEditorBlockProps & { adapter: EditorPersistenceAdapter }) {
  const session = useEditorDocument({
    documentId,
    adapter,
    readOnly,
    initialValue,
    debounceMs: resolveEditorOptions(options).autosave.debounceMs,
  });

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
          ariaLabel={ariaLabel}
          onChange={onChange}
          onContentChange={session.onContentChange}
          linkPreview={linkPreview}
          mentionProvider={mentionProvider}
          pageProvider={pageProvider}
          onOpenPage={onOpenPage}
          fileUpload={fileUpload}
          options={options}
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
