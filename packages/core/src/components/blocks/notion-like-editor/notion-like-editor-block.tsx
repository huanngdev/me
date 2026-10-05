"use client";

import { Plate, PlateContent } from "platejs/react";

import { cn } from "@/lib/utils";

import type { EditorValue } from "./editor-value";
import { useNotionLikeEditor } from "./use-notion-like-editor";

export type NotionLikeEditorBlockProps = {
  documentId: string;
  initialValue?: EditorValue;
  onChange?: (value: EditorValue) => void;
  readOnly?: boolean;
  placeholder?: string;
  className?: string;
};

export function NotionLikeEditorBlock({
  documentId,
  initialValue,
  onChange,
  readOnly = false,
  placeholder = "Type something…",
  className,
}: NotionLikeEditorBlockProps) {
  const { editor } = useNotionLikeEditor({ documentId, initialValue });

  return (
    <div className={cn("bg-background h-full min-h-full w-full min-w-0 px-4", className)}>
      <Plate editor={editor} readOnly={readOnly} onValueChange={({ value }) => onChange?.(value)}>
        <PlateContent
          placeholder={placeholder}
          className="text-foreground caret-foreground mx-auto min-h-full w-full max-w-[700px] py-8 text-base leading-relaxed wrap-break-word outline-none sm:py-12"
          renderPlaceholder={(placeholderProps) => (
            <span
              {...placeholderProps.attributes}
              className="text-muted-foreground pointer-events-none absolute top-0 block w-full select-none"
              style={{ ...placeholderProps.attributes.style, opacity: 1 }}
            >
              {placeholderProps.children}
            </span>
          )}
        />
      </Plate>
    </div>
  );
}
