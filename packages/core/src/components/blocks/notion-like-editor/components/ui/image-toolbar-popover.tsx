import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Captions,
  ExternalLink,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useEditorReadOnly, useEditorRef, usePluginOption } from "platejs/react";

import { Button } from "@/components/button";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/popover";
import { Separator } from "@/components/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/tooltip";

import { runEditorCommand } from "../../lib/commands/editor-commands";
import { removeImage, setImageAlign } from "../../lib/features/editor-image-commands";
import type { ImageAlign } from "../../lib/features/editor-image";
import { closeMediaActions, mediaUiPlugin } from "../../lib/plugins/editor-media-ui";
import { onPopoverHistoryKey } from "../../lib/plugins/editor-popover-history";
import { useMediaActionsLifecycle } from "../elements/media-card";
import { anchorContext, elementRect, virtualAnchor } from "./anchor-rect";
import { EditorIconButton, EditorTextButton, moveActionFocus } from "./block-toolbar";

const ALIGN_BUTTONS: readonly { align: ImageAlign; label: string }[] = [
  { align: "left", label: "Align left" },
  { align: "center", label: "Align center" },
  { align: "right", label: "Align right" },
];

// One row of image actions, opened by a click on the image (or Enter on the selected image).
// Alignment, caption and replace, then open-original and delete, with separators between them.
export function ImageToolbarPopover({
  id,
  align,
  openHref,
  readAnchor,
  onCaption,
  onReplace,
}: {
  id: string;
  align: ImageAlign | undefined;
  openHref: string | undefined;
  readAnchor: () => HTMLElement | null;
  onCaption: () => void;
  onReplace: () => void;
}) {
  "use no memo";

  const editor = useEditorRef();
  const readOnly = useEditorReadOnly();
  const open = usePluginOption(mediaUiPlugin, "actions") === id;
  const anchor = virtualAnchor(
    () => elementRect(readAnchor()),
    () => anchorContext(readAnchor()),
  );
  // Leaving the block, entering read-only mode, or removing the block closes the popover.
  useMediaActionsLifecycle(id, open);

  if (readOnly || !open) {
    return null;
  }

  const current = align ?? "center";
  return (
    <Popover open>
      <PopoverAnchor virtualRef={anchor} />
      <PopoverContent
        data-image-actions=""
        aria-label="Image actions"
        side="top"
        align="center"
        sideOffset={4}
        collisionPadding={8}
        hideWhenDetached
        className="w-auto gap-1 p-1 text-xs whitespace-nowrap"
        onOpenAutoFocus={(event) => {
          // The row takes focus, not a control, so no tooltip opens over the text above the image.
          event.preventDefault();
          const content = event.currentTarget as HTMLElement | null;
          content?.querySelector<HTMLElement>("[data-image-actions-row]")?.focus();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          // A second click on the image keeps the popover open.
          const target = event.detail.originalEvent.target;
          if (target instanceof Element && target.closest("[data-image-card]") !== null) {
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
          data-image-actions-row=""
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
                icon={<Icon aria-hidden="true" />}
                onClick={() => {
                  runEditorCommand(editor, setImageAlign, { id, align: item.align });
                }}
              />
            );
          })}
          <Separator orientation="vertical" className="h-5 data-vertical:self-center" />
          <EditorTextButton
            label="Caption"
            icon={<Captions aria-hidden="true" />}
            onClick={() => {
              closeMediaActions(editor);
              onCaption();
            }}
          />
          <EditorTextButton
            label="Replace"
            icon={<RefreshCw aria-hidden="true" />}
            onClick={() => {
              onReplace();
            }}
          />
          <Separator orientation="vertical" className="h-5 data-vertical:self-center" />
          {openHref === undefined ? null : (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button asChild size="icon" variant="ghost">
                    <a
                      href={openHref}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      aria-label="Open original"
                      data-image-action="open"
                      onClick={() => {
                        closeMediaActions(editor);
                      }}
                    >
                      <ExternalLink aria-hidden="true" />
                    </a>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Open original</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <EditorIconButton
            variant="destructive"
            label="Delete"
            icon={<Trash2 aria-hidden="true" />}
            onClick={() => {
              closeMediaActions(editor);
              runEditorCommand(editor, removeImage, { id });
              editor.tf.focus();
            }}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
