import { useEffect, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { ExternalLink, RefreshCw, Trash2, Type } from "lucide-react";
import { ElementApi } from "platejs";
import { useEditorReadOnly, useEditorRef, useEditorSelector, usePluginOption } from "platejs/react";

import { Button } from "@/components/button";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/popover";

import { runEditorCommand } from "../../lib/commands/editor-commands";
import { convertBookmarkToText, removeBookmark } from "../../lib/features/editor-bookmark";
import {
  bookmarkToolbarBlockId,
  bookmarkToolbarOpen,
  bookmarkToolbarPlugin,
  bookmarkToolbarSelectionOn,
  closeBookmarkToolbar,
} from "../../lib/plugins/editor-bookmark-toolbar";
import { anchorContext, elementRect, virtualAnchor } from "./anchor-rect";
import { EditorIconButton, EditorTextButton, editorControlLabel } from "./block-toolbar";

// One row of actions, opened by a click on the card (or Enter on the selected
// void). It follows the inline link popover: anchored to the card, side bottom.
export function BookmarkToolbarPopover({
  id,
  url,
  showRefresh,
  onRefresh,
}: {
  id: string;
  url: string;
  showRefresh: boolean;
  onRefresh: () => void;
}) {
  "use no memo";

  const editor = useEditorRef();
  const readOnly = useEditorReadOnly();
  const open = usePluginOption(bookmarkToolbarPlugin, "open") === true;
  const blockId = usePluginOption(bookmarkToolbarPlugin, "blockId");
  const selection = useEditorSelector((current) => current.selection, []);
  const mine = open && blockId === id;
  const virtualRef = virtualAnchor(
    () => elementRect(bookmarkCardNode(editor, id)),
    () => anchorContext(bookmarkCardNode(editor, id)),
  );

  // Leaving the editor, moving the selection to another block, entering a block
  // selection, or removing the block all close the popover.
  useEffect(() => {
    if (!mine) {
      return;
    }

    if (readOnly || selection === null || !bookmarkToolbarSelectionOn(editor, id)) {
      closeBookmarkToolbar(editor);
    }
  }, [editor, id, mine, readOnly, selection]);

  useEffect(() => {
    if (!mine || readOnly) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      closeBookmarkToolbar(editor);
      editor.tf.focus();
    };
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target;
      if (target instanceof Element) {
        if (target.closest("[data-bookmark-toolbar-popover]") !== null) {
          return;
        }
        // A second click on the card keeps the popover open.
        if (target.closest("[data-bookmark-card]") !== null) {
          return;
        }
      }

      closeBookmarkToolbar(editor);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [editor, mine, readOnly]);

  // The block was removed while its popover was open.
  useEffect(
    () => () => {
      if (bookmarkToolbarBlockId(editor) === id && bookmarkToolbarOpen(editor)) {
        closeBookmarkToolbar(editor);
      }
    },
    [editor, id],
  );

  if (readOnly || !mine) {
    return null;
  }

  return (
    <Popover open>
      <PopoverAnchor virtualRef={virtualRef} />
      <PopoverContent
        data-bookmark-toolbar-popover=""
        aria-label="Bookmark actions"
        side="bottom"
        align="start"
        sideOffset={4}
        collisionPadding={8}
        hideWhenDetached
        className="w-auto gap-1 p-1 text-xs whitespace-nowrap"
        onOpenAutoFocus={(event) => {
          const target = event.currentTarget as HTMLElement | null;
          const first = target?.querySelector<HTMLElement>('button, a[href], [role="menuitem"]');
          if (first) {
            event.preventDefault();
            first.focus();
          }
        }}
        onMouseDown={(event) => {
          event.preventDefault();
        }}
        onKeyDown={(event) => {
          moveActionFocus(event);
        }}
      >
        <div className="flex flex-nowrap items-center gap-1">
          <Button asChild size="sm" variant="ghost">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              aria-label="Open"
              data-bookmark-action="open"
              onClick={() => {
                closeBookmarkToolbar(editor);
              }}
            >
              {editorControlLabel(<ExternalLink aria-hidden="true" />, "Open")}
            </a>
          </Button>
          {showRefresh ? (
            <EditorTextButton
              label="Refresh preview"
              icon={<RefreshCw aria-hidden="true" />}
              onClick={() => {
                onRefresh();
              }}
            />
          ) : null}
          <EditorTextButton
            label="Convert to text"
            icon={<Type aria-hidden="true" />}
            onClick={() => {
              closeBookmarkToolbar(editor);
              runEditorCommand(editor, convertBookmarkToText, id);
              editor.tf.focus();
            }}
          />
          <EditorIconButton
            variant="destructive"
            label="Delete"
            icon={<Trash2 aria-hidden="true" />}
            onClick={() => {
              closeBookmarkToolbar(editor);
              runEditorCommand(editor, removeBookmark, id);
              editor.tf.focus();
            }}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

function bookmarkCardNode(editor: ReturnType<typeof useEditorRef>, id: string): HTMLElement | null {
  const entry = editor.api.node({
    at: [],
    match: (node) => ElementApi.isElement(node) && node.id === id,
  });
  if (entry === undefined) {
    return null;
  }

  const dom: unknown = editor.api.toDOMNode(entry[0]);
  if (!(dom instanceof HTMLElement)) {
    return null;
  }

  return dom.querySelector("[data-bookmark-card]");
}

function moveActionFocus(event: ReactKeyboardEvent<HTMLDivElement>): void {
  if (
    event.key !== "ArrowDown" &&
    event.key !== "ArrowUp" &&
    event.key !== "ArrowRight" &&
    event.key !== "ArrowLeft" &&
    event.key !== "Home" &&
    event.key !== "End"
  ) {
    return;
  }

  const items = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>('button, a[href], [role="menuitem"]'),
  ).filter((item) => item.getAttribute("aria-disabled") !== "true");
  if (items.length === 0) {
    return;
  }

  const current = items.indexOf(document.activeElement as HTMLElement);
  let next = current;
  if (event.key === "Home") {
    next = 0;
  } else if (event.key === "End") {
    next = items.length - 1;
  } else if (event.key === "ArrowDown" || event.key === "ArrowRight") {
    next = current < 0 ? 0 : (current + 1) % items.length;
  } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
    next = current < 0 ? items.length - 1 : (current - 1 + items.length) % items.length;
  }

  event.preventDefault();
  items[next]?.focus();
}
