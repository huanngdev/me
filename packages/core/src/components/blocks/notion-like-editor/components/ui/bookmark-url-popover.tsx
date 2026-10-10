import { useEffect, useId, useRef, useState } from "react";
import { useEditorRef, usePluginOption, useReadOnly } from "platejs/react";

import { Bookmark } from "lucide-react";
import { Input } from "@/components/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/popover";

import { EditorTextButton, retainScroll } from "./block-toolbar";
import { anchorContext, rangeContextElement, rangeRect, virtualAnchor } from "./anchor-rect";
import {
  bookmarkUrlAnchorPoint,
  bookmarkUrlPlugin,
  cancelBookmarkUrl,
  submitBookmarkUrl,
} from "../../lib/plugins/editor-bookmark-popover";

export function BookmarkUrlPopover() {
  "use no memo";

  const editor = useEditorRef();
  const readOnly = useReadOnly();
  const open = usePluginOption(bookmarkUrlPlugin, "open");
  const error = usePluginOption(bookmarkUrlPlugin, "error");

  useEffect(() => {
    if (!open || !readOnly) {
      return;
    }
    retainScroll(() => {
      cancelBookmarkUrl(editor);
    });
  }, [editor, open, readOnly]);

  if (!open || readOnly) {
    return null;
  }

  return <BookmarkUrlForm editor={editor} error={error} />;
}

function bookmarkDomRange(editor: ReturnType<typeof useEditorRef>): Range | null {
  const point = bookmarkUrlAnchorPoint(editor);
  if (point === null) {
    return null;
  }

  try {
    return editor.api.toDOMRange({ anchor: point, focus: point }) ?? null;
  } catch {
    return null;
  }
}

function BookmarkUrlForm({
  editor,
  error,
}: {
  editor: ReturnType<typeof useEditorRef>;
  error: string;
}) {
  "use no memo";

  const [url, setUrl] = useState("");
  const fieldRef = useRef<HTMLInputElement>(null);
  const errorId = useId();
  const invalid = error.length > 0;
  const virtualRef = virtualAnchor(
    () => rangeRect(bookmarkDomRange(editor)),
    () => anchorContext(rangeContextElement(bookmarkDomRange(editor))),
  );

  useEffect(() => {
    const focusField = (): void => {
      fieldRef.current?.focus();
    };
    focusField();
    const frame = requestAnimationFrame(focusField);
    return () => {
      cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      retainScroll(() => {
        cancelBookmarkUrl(editor);
      });
    };
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target;
      if (target instanceof Element && target.closest("[data-bookmark-url-popover]") !== null) {
        return;
      }
      event.preventDefault();
      retainScroll(() => {
        cancelBookmarkUrl(editor);
      });
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [editor]);

  return (
    <Popover open>
      <PopoverAnchor virtualRef={virtualRef} />
      <PopoverContent
        data-bookmark-url-popover=""
        side="bottom"
        align="start"
        sideOffset={4}
        collisionPadding={8}
        hideWhenDetached
        onOpenAutoFocus={(event) => {
          event.preventDefault();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
        }}
        className="w-72 gap-2 p-2"
      >
        <form
          noValidate
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            retainScroll(() => {
              submitBookmarkUrl(editor, url);
            });
          }}
        >
          <Input
            ref={fieldRef}
            aria-label="Bookmark URL"
            aria-invalid={invalid}
            aria-describedby={invalid ? errorId : undefined}
            value={url}
            placeholder="Paste a link"
            type="text"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
            onChange={(event) => {
              setUrl(event.target.value);
              if (error.length > 0) {
                editor.setOption(bookmarkUrlPlugin, "error", "");
              }
            }}
          />
          {invalid ? (
            <p id={errorId} role="alert" className="text-destructive text-xs">
              {error}
            </p>
          ) : null}
          <EditorTextButton
            type="submit"
            variant="default"
            label="Add bookmark"
            icon={<Bookmark aria-hidden="true" />}
          />
        </form>
      </PopoverContent>
    </Popover>
  );
}
