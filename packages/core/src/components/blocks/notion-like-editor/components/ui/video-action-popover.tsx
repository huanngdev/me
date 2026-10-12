import { AlignCenter, AlignLeft, AlignRight, Captions, RefreshCw, Trash2 } from "lucide-react";
import { useEditorRef, usePluginOption } from "platejs/react";

import { Popover, PopoverAnchor, PopoverContent } from "@/components/popover";
import { Separator } from "@/components/separator";

import { runEditorCommand } from "../../lib/commands/editor-commands";
import type { MediaAlign } from "../../lib/features/editor-media-layout";
import { removeVideo, setVideoAlign } from "../../lib/features/editor-video-commands";
import { closeMediaActions, mediaUiPlugin } from "../../lib/plugins/editor-media-ui";
import { onPopoverHistoryKey } from "../../lib/plugins/editor-popover-history";
import { useMediaActionsLifecycle } from "../elements/media-card";
import { anchorContext, elementRect, virtualAnchor } from "./anchor-rect";
import { EditorIconButton, EditorTextButton, moveActionFocus } from "./block-toolbar";
import { MediaDownloadButton } from "./media-download-button";

const ALIGN_BUTTONS: readonly { align: MediaAlign; label: string }[] = [
  { align: "left", label: "Align left" },
  { align: "center", label: "Align center" },
  { align: "right", label: "Align right" },
];

// One row of video actions, opened by the More button (or Enter on the selected video). Alignment,
// then caption and replace, then download and delete, with separators between the sections.
export function VideoActionPopover({
  id,
  align,
  name,
  href,
  readAnchor,
  onCaption,
  onReplace,
}: {
  id: string;
  align: MediaAlign | undefined;
  name: string | undefined;
  href: string | undefined; // the resolved url; undefined while it resolves
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
        data-video-actions=""
        aria-label="Video actions"
        side="top"
        align="center"
        sideOffset={4}
        collisionPadding={8}
        hideWhenDetached
        className="w-auto gap-1 p-1 text-xs whitespace-nowrap"
        onOpenAutoFocus={(event) => {
          // The row takes focus, not a control, so no tooltip opens over the video.
          event.preventDefault();
          const content = event.currentTarget as HTMLElement | null;
          content?.querySelector<HTMLElement>("[data-video-actions-row]")?.focus();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          // A second click on the More button keeps the popover open.
          const target = event.detail.originalEvent.target;
          if (target instanceof Element && target.closest("[data-video-card]") !== null) {
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
          data-video-actions-row=""
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
                data-video-align={item.align}
                icon={<Icon aria-hidden="true" />}
                onClick={() => {
                  runEditorCommand(editor, setVideoAlign, { id, align: item.align });
                }}
              />
            );
          })}
          <Separator orientation="vertical" className="h-5 data-vertical:self-center" />
          <EditorTextButton
            label="Caption"
            icon={<Captions aria-hidden="true" />}
            data-video-action="caption"
            onClick={() => {
              closeMediaActions(editor);
              onCaption();
            }}
          />
          <EditorTextButton
            label="Replace"
            icon={<RefreshCw aria-hidden="true" />}
            data-video-action="replace"
            onClick={() => {
              onReplace();
            }}
          />
          <Separator orientation="vertical" className="h-5 data-vertical:self-center" />
          <MediaDownloadButton
            kind="video"
            href={href}
            name={name}
            onDownload={() => {
              closeMediaActions(editor);
            }}
          />
          <Separator orientation="vertical" className="h-5 data-vertical:self-center" />
          <EditorIconButton
            variant="destructive"
            label="Delete"
            icon={<Trash2 aria-hidden="true" />}
            data-video-action="delete"
            onClick={() => {
              closeMediaActions(editor);
              runEditorCommand(editor, removeVideo, { id });
              editor.tf.focus();
            }}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
