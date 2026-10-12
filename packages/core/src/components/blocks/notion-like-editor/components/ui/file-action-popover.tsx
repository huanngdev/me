import { Download, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { useEditorRef, usePluginOption } from "platejs/react";

import { Button } from "@/components/button";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/popover";
import { Separator } from "@/components/separator";

import { runEditorCommand } from "../../lib/commands/editor-commands";
import { removeFile } from "../../lib/features/editor-file-commands";
import { isHttpFileUrl } from "../../lib/features/editor-file-url";
import { closeMediaActions, mediaUiPlugin } from "../../lib/plugins/editor-media-ui";
import { onPopoverHistoryKey } from "../../lib/plugins/editor-popover-history";
import { useMediaActionsLifecycle } from "../elements/media-card";
import { anchorContext, elementRect, virtualAnchor } from "./anchor-rect";
import {
  EditorIconButton,
  EditorTextButton,
  editorControlLabel,
  moveActionFocus,
} from "./block-toolbar";

// One row of file actions, opened by a click on the file row (or Enter on the selected file).
// Download, then Rename and Replace, then Delete, with separators between the sections.
export function FileActionPopover({
  id,
  name,
  href,
  readAnchor,
  onRename,
  onReplace,
}: {
  id: string;
  name: string;
  href: string | undefined; // the resolved url; undefined while it resolves or when unavailable
  readAnchor: () => HTMLElement | null;
  onRename: () => void;
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

  // A cross-origin file cannot be downloaded in place, so its link opens in a new tab.
  const external = href !== undefined && isHttpFileUrl(href);
  return (
    <Popover open>
      <PopoverAnchor virtualRef={anchor} />
      <PopoverContent
        data-file-actions=""
        aria-label="File actions"
        side="top"
        align="start"
        sideOffset={4}
        collisionPadding={8}
        hideWhenDetached
        className="w-auto gap-1 p-1 text-xs whitespace-nowrap"
        onOpenAutoFocus={(event) => {
          // The row takes focus, not a control, so no tooltip opens over the text above the file.
          event.preventDefault();
          const content = event.currentTarget as HTMLElement | null;
          content?.querySelector<HTMLElement>("[data-file-actions-row]")?.focus();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          // A second click on the file row keeps the popover open.
          const target = event.detail.originalEvent.target;
          if (target instanceof Element && target.closest("[data-file-card]") !== null) {
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
          data-file-actions-row=""
          tabIndex={-1}
          className="flex flex-nowrap items-center gap-1 focus:outline-none"
        >
          <Button
            asChild
            size="sm"
            variant="ghost"
            className="aria-disabled:pointer-events-none aria-disabled:opacity-50"
          >
            <a
              href={href}
              download={href === undefined ? undefined : name}
              target={external ? "_blank" : undefined}
              rel={external ? "noopener noreferrer nofollow" : undefined}
              aria-disabled={href === undefined ? true : undefined}
              data-file-action="download"
              onClick={() => {
                closeMediaActions(editor);
              }}
            >
              {editorControlLabel(<Download aria-hidden="true" />, "Download")}
            </a>
          </Button>
          <Separator orientation="vertical" className="h-5 data-vertical:self-center" />
          <EditorTextButton
            label="Rename"
            icon={<Pencil aria-hidden="true" />}
            data-file-action="rename"
            onClick={() => {
              closeMediaActions(editor);
              onRename();
            }}
          />
          <EditorTextButton
            label="Replace"
            icon={<RefreshCw aria-hidden="true" />}
            data-file-action="replace"
            onClick={() => {
              onReplace();
            }}
          />
          <Separator orientation="vertical" className="h-5 data-vertical:self-center" />
          <EditorIconButton
            variant="destructive"
            label="Delete"
            icon={<Trash2 aria-hidden="true" />}
            data-file-action="delete"
            onClick={() => {
              closeMediaActions(editor);
              runEditorCommand(editor, removeFile, { id });
              editor.tf.focus();
            }}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
