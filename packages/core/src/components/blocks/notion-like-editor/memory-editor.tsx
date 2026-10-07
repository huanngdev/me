"use client";

import { cn } from "@/lib/utils";

import { EditorSurface } from "./editor-surface";
import type { NotionLikeEditorBlockProps } from "./notion-like-editor-block";
import { useNotionLikeEditor } from "./use-notion-like-editor";

export function MemoryEditor({
  documentId,
  initialValue,
  onChange,
  readOnly = false,
  placeholder = "Type something…",
  className,
  assetStore = null,
}: NotionLikeEditorBlockProps) {
  const { editor } = useNotionLikeEditor({ documentId, initialValue });

  return (
    <div className={cn("bg-background h-full min-h-full w-full min-w-0 px-4", className)}>
      <EditorSurface
        editor={editor}
        readOnly={readOnly}
        placeholder={placeholder}
        onValueChange={onChange}
        assetStore={assetStore}
        className="text-foreground caret-foreground mx-auto min-h-full w-full max-w-[700px] py-8 text-base leading-relaxed wrap-break-word outline-none sm:py-12"
      />
    </div>
  );
}
