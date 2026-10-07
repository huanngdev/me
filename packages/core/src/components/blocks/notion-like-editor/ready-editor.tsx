"use client";

import { EditorSaveStatus } from "./editor-save-status";
import { EditorSurface } from "./editor-surface";
import type { AutosaveStatus } from "./editor-autosave";
import type { AssetStore } from "./editor-assets";
import type { EditorValue } from "./editor-value";
import { useNotionLikeEditor } from "./use-notion-like-editor";

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
  assetStore?: AssetStore | null;
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
  assetStore = null,
}: ReadyEditorProps) {
  const { editor } = useNotionLikeEditor({ documentId, initialValue });

  return (
    <div className="mx-auto flex h-full min-h-full w-full max-w-[700px] min-w-0 flex-col">
      <div className="flex justify-end pt-4">
        <EditorSaveStatus status={status} message={message} onRetry={onRetry} />
      </div>
      <EditorSurface
        editor={editor}
        readOnly={readOnly}
        placeholder={placeholder}
        onValueChange={(value) => {
          onChange?.(value);
          onContentChange(value);
        }}
        assetStore={assetStore}
        className="text-foreground caret-foreground min-h-full w-full min-w-0 pt-3 pb-8 text-base leading-relaxed wrap-break-word outline-none sm:pb-12"
      />
    </div>
  );
}
