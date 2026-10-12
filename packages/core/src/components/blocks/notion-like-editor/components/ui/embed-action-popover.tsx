import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Captions,
  ExternalLink,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useEditorRef, usePluginOption } from "platejs/react";

import { Button } from "@/components/button";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/popover";
import { Separator } from "@/components/separator";

import { runEditorCommand } from "../../lib/commands/editor-commands";
import type { MediaAlign } from "../../lib/features/editor-media-layout";
import { removeEmbed, setEmbedAlign } from "../../lib/features/editor-embed-commands";
import { closeMediaActions, mediaUiPlugin } from "../../lib/plugins/editor-media-ui";
import { onPopoverHistoryKey } from "../../lib/plugins/editor-popover-history";
import { useMediaActionsLifecycle } from "../elements/media-card";
import { anchorContext, elementRect, virtualAnchor } from "./anchor-rect";
import { EditorIconButton, EditorTextButton, moveActionFocus } from "./block-toolbar";
import { ALIGN_BUTTONS } from "./video-action-popover";

// The actions of one embed, opened by its More button (or Enter on the selected embed). The same row as
// a video, without Download, plus Open original when the block stores its link.
export function EmbedActionPopover({
  id,
  align,
  href,
  readAnchor,
  onCaption,
  onReplace,
}: {
  id: string;
  align: MediaAlign | undefined;
  href: string | undefined; // the stored link; undefined when the block has none
  readAnchor: () => HTMLElement | null;
  onCaption: () => void;
  onReplace: () => void;
}) {
  "use no memo";

  const editor = useEditorRef();
  const open = usePluginOption(mediaUiPlugin, "actions") === id;
  const anchor = virtualAnchor(
    () => elementRect(readAnchor()),
    () => anchorContext(readAnchor()),
  );
  // Leaving the block, entering read-only mode, or removing the block closes the popover.
  useMediaActionsLifecycle(id, open);

  if (!open) {
    return null;
  }

  const current = align ?? "center";
  return (
    <Popover open>
      <PopoverAnchor virtualRef={anchor} />
      <PopoverContent
        data-embed-actions=""
        aria-label="Embed actions"
        side="top"
        align="center"
        sideOffset={4}
        collisionPadding={8}
        hideWhenDetached
        className="w-auto gap-1 p-1 text-xs whitespace-nowrap"
        onOpenAutoFocus={(event) => {
          // The row takes focus, not a control, so no tooltip opens over the embed.
          event.preventDefault();
          const content = event.currentTarget as HTMLElement | null;
          content?.querySelector<HTMLElement>("[data-embed-actions-row]")?.focus();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          // A second click on the More button keeps the popover open.
          const target = event.detail.originalEvent.target;
          if (target instanceof Element && target.closest("[data-embed-card]") !== null) {
            event.preventDefault();
            return;
          }

          closeMediaActions(editor);
        }}
        onKeyDown={(event) => {
          // Keys typed here never reach the editor. Escape closes the popover and returns to the editor.
          event.stopPropagation();
          if (onPopoverHistoryKey(editor, event)) {
            return;
          }
          if (event.key === "Escape") {
            event.preventDefault();
            closeMediaActions(editor);
            editor.tf.focus();
            return;
          }
          moveActionFocus(event);
        }}
      >
        <div
          data-embed-actions-row=""
          tabIndex={-1}
          className="flex flex-nowrap items-center gap-1 focus:outline-none"
        >
          {ALIGN_BUTTONS.map((item) => {
            const Icon =
              item.align === "left"
                ? AlignLeft
                : item.align === "center"
                  ? AlignCenter
                  : AlignRight;
            return (
              <EditorIconButton
                key={item.align}
                label={item.label}
                aria-pressed={current === item.align}
                data-embed-align={item.align}
                icon={<Icon aria-hidden="true" />}
                onClick={() => {
                  runEditorCommand(editor, setEmbedAlign, { id, align: item.align });
                }}
              />
            );
          })}
          <Separator orientation="vertical" className="h-5 data-vertical:self-center" />
          <EditorTextButton
            label="Caption"
            icon={<Captions aria-hidden="true" />}
            data-embed-action="caption"
            onClick={() => {
              closeMediaActions(editor);
              onCaption();
            }}
          />
          <EditorTextButton
            label="Replace"
            icon={<RefreshCw aria-hidden="true" />}
            data-embed-action="replace"
            onClick={() => {
              onReplace();
            }}
          />
          {href === undefined ? null : (
            <>
              <Separator orientation="vertical" className="h-5 data-vertical:self-center" />
              <Button asChild size="sm" variant="ghost">
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  data-embed-action="open"
                  onClick={() => {
                    closeMediaActions(editor);
                  }}
                >
                  <ExternalLink aria-hidden="true" />
                  Open original
                </a>
              </Button>
            </>
          )}
          <Separator orientation="vertical" className="h-5 data-vertical:self-center" />
          <EditorIconButton
            variant="destructive"
            label="Delete"
            icon={<Trash2 aria-hidden="true" />}
            data-embed-action="delete"
            onClick={() => {
              closeMediaActions(editor);
              runEditorCommand(editor, removeEmbed, { id });
              editor.tf.focus();
            }}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
