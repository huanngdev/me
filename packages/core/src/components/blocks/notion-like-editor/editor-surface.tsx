"use client";

import type { ComponentProps } from "react";
import { Plate, PlateContent } from "platejs/react";

import { cn } from "@/lib/utils";

import type { EditorValue } from "./editor-value";

type EditorSurfaceProps = {
  editor: ComponentProps<typeof Plate>["editor"];
  readOnly: boolean;
  placeholder: string;
  onValueChange?: (value: EditorValue) => void;
  className: string;
};

export function EditorSurface({
  editor,
  readOnly,
  placeholder,
  onValueChange,
  className,
}: EditorSurfaceProps) {
  return (
    <Plate
      editor={editor}
      readOnly={readOnly}
      onValueChange={({ value }) => {
        onValueChange?.(value);
      }}
    >
      <PlateContent
        placeholder={readOnly ? undefined : placeholder}
        // Margin is between blocks. The first block's top stays put, so the empty-document placeholder stays aligned.
        className={cn(className, "space-y-4")}
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
  );
}
