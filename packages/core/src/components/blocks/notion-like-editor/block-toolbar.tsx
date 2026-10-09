import type { ReactNode } from "react";
import type { TElement } from "platejs";
import { useEditorRef } from "platejs/react";

export const MEDIA_TOOLBAR_CLASS =
  "absolute top-1 right-1 z-10 flex max-w-full flex-wrap gap-1 rounded-md border border-border bg-background p-1 opacity-0 pointer-events-none group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100";

export const mediaIconButtonClass =
  "text-foreground hover:bg-muted inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs";

type MediaEditor = ReturnType<typeof useEditorRef>;

export function keepMediaSelection(event: { preventDefault: () => void }): void {
  event.preventDefault();
}

export function MediaIconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: (editor: MediaEditor) => void;
  children: ReactNode;
}) {
  const editor = useEditorRef();
  return (
    <button
      type="button"
      aria-label={label}
      className={mediaIconButtonClass}
      onMouseDown={keepMediaSelection}
      onClick={() => {
        onClick(editor);
      }}
    >
      {children}
    </button>
  );
}

export function mediaStringAttr(element: TElement, key: string): string | undefined {
  const value: unknown = Reflect.get(element, key);
  return typeof value === "string" ? value : undefined;
}
