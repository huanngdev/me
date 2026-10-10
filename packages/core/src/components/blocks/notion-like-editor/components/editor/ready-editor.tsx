"use client";

import { EditorSaveStatus } from "./editor-save-status";
import { EditorSurface } from "./editor-surface";
import type { AutosaveStatus } from "../../lib/document/editor-autosave";
import type { LinkPreviewAdapter } from "../../lib/features/editor-bookmark-url";
import type { MentionProvider } from "../../lib/features/editor-mention-node";
import type { EditorValue } from "../../lib/document/editor-value";
import { useNotionLikeEditor } from "../../hooks/use-notion-like-editor";

type ReadyEditorProps = {
  documentId: string;
  initialValue: EditorValue;
  readOnly: boolean;
  placeholder: string;
  onChange?: (value: EditorValue) => void;
  onContentChange: (value: EditorValue) => void;
  status: AutosaveStatus;
  message?: string;
  onRetry: () => void;
  linkPreview?: LinkPreviewAdapter | null;
  mentionProvider?: MentionProvider | null;
};

export function ReadyEditor({
  documentId,
  initialValue,
  readOnly,
  placeholder,
  onChange,
  onContentChange,
  status,
  message,
  onRetry,
  linkPreview = null,
  mentionProvider = null,
}: ReadyEditorProps) {
  const { editor } = useNotionLikeEditor({ documentId, initialValue });
  // The healthy states render nothing, so the row takes no space. Only the
  // failure notice appears, and it is the only thing above the editor.
  const showNotice = status === "error" || status === "conflict";

  return (
    <div className="mx-auto flex h-full min-h-full w-full max-w-[700px] min-w-0 flex-col">
      {showNotice ? (
        <div className="flex justify-end pt-4">
          <EditorSaveStatus status={status} message={message} onRetry={onRetry} />
        </div>
      ) : null}
      <EditorSurface
        editor={editor}
        readOnly={readOnly}
        placeholder={placeholder}
        onValueChange={(value) => {
          onChange?.(value);
          onContentChange(value);
        }}
        linkPreview={linkPreview}
        mentionProvider={mentionProvider}
        className="text-foreground caret-foreground min-h-full w-full min-w-0 py-8 text-base leading-relaxed wrap-break-word outline-none sm:py-12"
      />
    </div>
  );
}
