import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Captions,
  RefreshCw,
  MoveHorizontal,
  Trash2,
} from "lucide-react";
import { useEditorRef } from "platejs/react";

import { Popover, PopoverAnchor, PopoverContent } from "@/components/popover";
import { Separator } from "@/components/separator";

import { runEditorCommand } from "../../lib/commands/editor-commands";
import type { MediaAlign } from "../../lib/features/editor-media-layout";
import {
  removeVideo,
  setVideoAlign,
  setVideoWidth,
} from "../../lib/features/editor-video-commands";
import { closeMediaActions } from "../../lib/plugins/editor-media-ui";
import { onPopoverHistoryKey } from "../../lib/plugins/editor-popover-history";
import {
  mediaActionsHoverProps,
  useMediaActionsLifecycle,
  useMediaActionsOpen,
} from "../elements/media-card";
import { anchorContext, elementRect, virtualAnchor } from "./anchor-rect";
import {
  EditorIconButton,
  EditorTextButton,
  TOOLBAR_PRESSED_CLASS,
  moveActionFocus,
} from "./block-toolbar";
import { MediaDownloadButton } from "./media-download-button";

export const ALIGN_BUTTONS: readonly { align: MediaAlign; label: string }[] = [
  { align: "left", label: "Align left" },
  { align: "center", label: "Align center" },
  { align: "right", label: "Align right" },
];

// One row of video actions, opened by hovering the video, by a click on the block, or by Enter on the
// selected video. Alignment and fit to width, then caption and replace, then download and delete, with
// separators between the sections.
export function VideoActionPopover({
  id,
  align,
  width,
  name,
  href,
  readAnchor,
  onCaption,
  onReplace,
}: {
  id: string;
  align: MediaAlign | undefined;
  width: number | undefined;
  name: string | undefined;
  href: string | undefined; // the resolved url; undefined while it resolves
  readAnchor: () => HTMLElement | null;
  onCaption: () => void;
  onReplace: () => void;
}) {
  "use no memo";

  const editor = useEditorRef();
  const { open, explicit } = useMediaActionsOpen(id);
  const anchor = virtualAnchor(
    () => elementRect(readAnchor()),
    () => anchorContext(readAnchor()),
  );
  // Leaving the block, entering read-only mode, or removing the block closes the popover.
  useMediaActionsLifecycle(id, explicit);

  if (!open) {
    return null;
  }

  const current = align ?? "center";
  return (
    <Popover open key={explicit ? "actions" : "hover"}>
      <PopoverAnchor virtualRef={anchor} />
      <PopoverContent
        data-video-actions=""
        data-media-actions=""
        aria-label="Video actions"
        side="top"
        align="center"
        sideOffset={4}
        collisionPadding={8}
        hideWhenDetached
        className="w-auto gap-1 p-1 text-xs whitespace-nowrap"
        {...mediaActionsHoverProps(editor)}
        onOpenAutoFocus={(event) => {
          // The row takes focus, not a control, so no tooltip opens over the video.
          // A hover toolbar takes no focus at all.
          event.preventDefault();
          if (!explicit) {
            return;
          }
          const content = event.currentTarget as HTMLElement | null;
          content?.querySelector<HTMLElement>("[data-video-actions-row]")?.focus();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          // A second click on the video keeps the popover open.
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
                className={TOOLBAR_PRESSED_CLASS}
                data-video-align={item.align}
                icon={<Icon aria-hidden="true" />}
                onClick={() => {
                  runEditorCommand(editor, setVideoAlign, { id, align: item.align });
                }}
              />
            );
          })}
          <EditorIconButton
            label="Fit to width"
            aria-pressed={width === 100}
            className={TOOLBAR_PRESSED_CLASS}
            icon={<MoveHorizontal aria-hidden="true" />}
            onClick={() => {
              runEditorCommand(editor, setVideoWidth, { id, width: 100 });
            }}
          />
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
