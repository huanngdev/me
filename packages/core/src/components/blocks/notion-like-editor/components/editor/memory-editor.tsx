"use client";

import { cn } from "@/lib/utils";

import { EditorSurface } from "./editor-surface";
import { DEFAULT_PLACEHOLDER } from "../../lib/features/editor-placeholder";
import type { NotionLikeEditorBlockProps } from "../../notion-like-editor-block";
import { useNotionLikeEditor } from "../../hooks/use-notion-like-editor";

export function MemoryEditor({
  documentId,
  initialValue,
  onChange,
  readOnly = false,
  placeholder = DEFAULT_PLACEHOLDER,
  ariaLabel = "Rich text editor",
  className,
  linkPreview = null,
  mentionProvider = null,
  pageProvider = null,
  onOpenPage,
  fileUpload = null,
  options,
}: NotionLikeEditorBlockProps) {
  const { editor } = useNotionLikeEditor({ documentId, initialValue, options });

  return (
    <div className={cn("bg-background h-full min-h-full w-full min-w-0 px-4", className)}>
      <EditorSurface
        editor={editor}
        readOnly={readOnly}
        placeholder={placeholder}
        ariaLabel={ariaLabel}
        onValueChange={onChange}
        linkPreview={linkPreview}
        mentionProvider={mentionProvider}
        pageProvider={pageProvider}
        onOpenPage={onOpenPage}
        fileUpload={fileUpload}
        className="text-foreground caret-foreground mx-auto min-h-full w-full max-w-[var(--editor-max-width,700px)] py-8 text-base leading-relaxed wrap-break-word outline-none sm:py-12"
      />
    </div>
  );
}
