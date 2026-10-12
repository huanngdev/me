import { useEffect } from "react";
import { useEditorReadOnly, useEditorRef, usePluginOption } from "platejs/react";

import { Popover, PopoverAnchor, PopoverContent } from "@/components/popover";
import { cn } from "@/lib/utils";

import { readEmojiSession } from "../../lib/features/editor-emoji";
import { pointAtBlockOffset } from "../../lib/features/editor-slash";
import {
  chooseEmojiSuggestion,
  closeEmojiMenu,
  emojiMenuItems,
  emojiUiPlugin,
} from "../../lib/plugins/editor-emoji";
import { anchorContext, rangeContextElement, rangeRect, virtualAnchor } from "./anchor-rect";

export function EmojiSuggest() {
  const editor = useEditorRef();
  const readOnly = useEditorReadOnly();
  const open = usePluginOption(emojiUiPlugin, "open");
  const activeIndex = usePluginOption(emojiUiPlugin, "activeIndex");
  // Re-renders on every token change and when the emoji data finishes loading.
  // Rows are still read from the document at render time, never stored.
  usePluginOption(emojiUiPlugin, "query");
  usePluginOption(emojiUiPlugin, "ready");
  const items = open ? emojiMenuItems(editor) : [];
  const active = items.length === 0 ? -1 : Math.min(activeIndex, items.length - 1);
  const virtualRef = virtualAnchor(
    () => rangeRect(colonRange(editor)),
    () => anchorContext(rangeContextElement(colonRange(editor))),
  );

  useEffect(() => {
    if (!open || !readOnly) {
      return;
    }
    closeEmojiMenu(editor);
  }, [editor, open, readOnly]);

  if (!open || items.length === 0) {
    return null;
  }

  return (
    <Popover open modal={false}>
      <PopoverAnchor virtualRef={virtualRef} />
      <PopoverContent
        data-emoji-suggest=""
        side="bottom"
        align="start"
        sideOffset={4}
        collisionPadding={8}
        hideWhenDetached
        className="w-auto min-w-44 gap-0 p-1"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
        }}
        onMouseDown={(event) => {
          event.preventDefault();
        }}
      >
        <div role="listbox" aria-label="Emoji suggestions" className="flex flex-col">
          {items.map((item, index) => (
            <div
              key={item.name}
              role="option"
              aria-selected={index === active}
              data-emoji-option={item.name}
              className={cn(
                "flex cursor-default items-center gap-2 rounded-sm px-2 py-1 text-sm",
                index === active && "bg-accent text-accent-foreground",
              )}
              onMouseDown={(event) => {
                event.preventDefault();
              }}
              onMouseEnter={() => {
                editor.setOption(emojiUiPlugin, "activeIndex", index);
              }}
              onClick={() => {
                chooseEmojiSuggestion(editor, item.emoji);
              }}
            >
              <span aria-hidden="true">{item.emoji}</span>
              <span className="text-muted-foreground font-mono text-xs">:{item.name}:</span>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// The anchor is the colon, so the popover sits under the trigger like the slash menu.
function colonRange(editor: ReturnType<typeof useEditorRef>): Range | null {
  const session = readEmojiSession(editor);
  if (session === null) {
    return null;
  }
  const start = pointAtBlockOffset(editor, session.blockPath, session.colon);
  const end = pointAtBlockOffset(editor, session.blockPath, session.colon + 1);
  if (start === null || end === null) {
    return null;
  }
  try {
    return editor.api.toDOMRange({ anchor: start, focus: end }) ?? null;
  } catch {
    return null;
  }
}
