import { useId, useState } from "react";
import { useEditorReadOnly, useEditorRef, usePluginOption } from "platejs/react";

import { Button } from "@/components/button";
import { Input } from "@/components/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/popover";

import { runEditorCommand } from "../../lib/commands/editor-commands";
import { setEmbedSource } from "../../lib/features/editor-embed-commands";
import { closeMediaSource, mediaUiPlugin } from "../../lib/plugins/editor-media-ui";
import { onPopoverHistoryKey } from "../../lib/plugins/editor-popover-history";
import { anchorContext, elementRect, virtualAnchor } from "./anchor-rect";

// The link popover of one embed block. It takes only a YouTube or Vimeo link, so it has no upload tab.
// It renders while this block's source popover is open, and only in an editable editor.
export function EmbedLinkPopover({
  blockId,
  readAnchor,
}: {
  blockId: string;
  readAnchor: () => HTMLElement | null;
}) {
  "use no memo";

  const readOnly = useEditorReadOnly();
  const open = usePluginOption(mediaUiPlugin, "source") === blockId;
  if (!open || readOnly) {
    return null;
  }

  return <EmbedLinkForm blockId={blockId} readAnchor={readAnchor} />;
}

function EmbedLinkForm({
  blockId,
  readAnchor,
}: {
  blockId: string;
  readAnchor: () => HTMLElement | null;
}) {
  "use no memo";

  const anchor = virtualAnchor(
    () => elementRect(readAnchor()),
    () => anchorContext(readAnchor()),
  );
  const editor = useEditorRef();
  const errorId = useId();
  const [link, setLink] = useState("");
  const [invalid, setInvalid] = useState(false);

  function close(): void {
    closeMediaSource(editor);
    editor.tf.focus();
  }

  // The command reads the link. A link that is not YouTube or Vimeo changes nothing.
  function submitLink(): void {
    if (!runEditorCommand(editor, setEmbedSource, { id: blockId, file: { url: link.trim() } })) {
      setInvalid(true);
      return;
    }

    close();
  }

  return (
    <Popover open>
      <PopoverAnchor virtualRef={anchor} />
      <PopoverContent
        data-embed-link-popover=""
        aria-label="Embed link"
        side="bottom"
        align="start"
        sideOffset={4}
        collisionPadding={8}
        hideWhenDetached
        className="w-80 gap-2 p-2"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          const first = event.currentTarget as HTMLElement | null;
          first?.querySelector<HTMLElement>("[data-embed-link-first]")?.focus();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
        }}
        onPointerDownOutside={() => {
          closeMediaSource(editor);
        }}
        onKeyDown={(event) => {
          // Keys typed here never reach the editor. Escape closes the popover and returns to the editor.
          event.stopPropagation();
          if (onPopoverHistoryKey(editor, event)) {
            return;
          }
          if (event.key === "Escape") {
            event.preventDefault();
            close();
          }
        }}
      >
        <form
          noValidate
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            submitLink();
          }}
        >
          <Input
            aria-label="Video link"
            aria-invalid={invalid}
            aria-describedby={invalid ? errorId : undefined}
            data-embed-link-first=""
            data-embed-link-input=""
            value={link}
            placeholder="Paste a YouTube or Vimeo link…"
            type="text"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            onChange={(event) => {
              setLink(event.target.value);
              setInvalid(false);
            }}
          />
          {invalid ? (
            <p id={errorId} role="alert" className="text-destructive text-xs">
              Enter a YouTube or Vimeo link
            </p>
          ) : null}
          <Button type="submit" size="sm" className="w-full" data-embed-submit="">
            Embed video
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
