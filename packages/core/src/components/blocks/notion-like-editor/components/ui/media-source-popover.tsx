import { useId, useRef, useState } from "react";
import { usePluginOption, useEditorReadOnly, useEditorRef } from "platejs/react";

import { Button } from "@/components/button";
import { Input } from "@/components/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/tabs";

import { isHttpFileUrl, sanitizeStoredFileUrl } from "../../lib/features/editor-file-url";
import { closeMediaSource, mediaUiPlugin } from "../../lib/plugins/editor-media-ui";
import { onPopoverHistoryKey } from "../../lib/plugins/editor-popover-history";
import { useFileUploadAdapter, useUploadController } from "../elements/file-upload-scope";
import { anchorContext, elementRect, virtualAnchor } from "./anchor-rect";
import { useEditorFeatures } from "../../hooks/use-editor-features";

// The words and limits one media block shows in its source popover.
export type MediaSourceConfig = {
  label: string; // aria-label of the popover
  accept?: string; // the file input's accept list. Absent means any file.
  uploadLabel: string;
  embedPlaceholder: string;
  embedLabel: string;
  linkLabel: string; // accessible name of the link field
  invalidLinkMessage: string;
};

// A stored link must be http or https. The result is trimmed and checked the way the document checks it.
function embedLinkOf(raw: string): string | null {
  const clean = sanitizeStoredFileUrl(raw.trim());
  return clean !== null && isHttpFileUrl(clean) ? clean : null;
}

// The "choose a source" popover of one media block. It shows the upload tab when an adapter is set,
// and the embed link form always. It renders only while this block's source popover is open.
export function MediaSourcePopover({
  blockId,
  config,
  readAnchor,
  onEmbed,
}: {
  blockId: string;
  config: MediaSourceConfig;
  readAnchor: () => HTMLElement | null;
  onEmbed: (url: string) => boolean;
}) {
  "use no memo";

  const readOnly = useEditorReadOnly();
  const open = usePluginOption(mediaUiPlugin, "source") === blockId;
  if (!open || readOnly) {
    return null;
  }

  return (
    <MediaSourceForm blockId={blockId} config={config} readAnchor={readAnchor} onEmbed={onEmbed} />
  );
}

function MediaSourceForm({
  blockId,
  config,
  readAnchor,
  onEmbed,
}: {
  blockId: string;
  config: MediaSourceConfig;
  readAnchor: () => HTMLElement | null;
  onEmbed: (url: string) => boolean;
}) {
  "use no memo";

  const anchor = virtualAnchor(
    () => elementRect(readAnchor()),
    () => anchorContext(readAnchor()),
  );
  const editor = useEditorRef();
  const controller = useUploadController();
  const adapter = useFileUploadAdapter();
  const mediaOn = useEditorFeatures().media;
  const canUpload = mediaOn && adapter !== null && controller !== null;
  const fileRef = useRef<HTMLInputElement>(null);
  const errorId = useId();
  const [link, setLink] = useState("");
  const [invalid, setInvalid] = useState(false);

  function close(): void {
    closeMediaSource(editor);
    editor.tf.focus();
  }

  function chooseFile(file: File): void {
    if (controller === null) {
      return;
    }

    closeMediaSource(editor);
    editor.tf.focus();
    controller.start(blockId, file);
  }

  function submitLink(): void {
    const url = embedLinkOf(link);
    if (url === null || !onEmbed(url)) {
      setInvalid(true);
      return;
    }

    close();
  }

  const embedForm = (
    <form
      noValidate
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        submitLink();
      }}
    >
      <Input
        aria-label={config.linkLabel}
        aria-invalid={invalid}
        aria-describedby={invalid ? errorId : undefined}
        data-media-embed-input=""
        data-media-source-first={canUpload ? undefined : ""}
        value={link}
        placeholder={config.embedPlaceholder}
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
          {config.invalidLinkMessage}
        </p>
      ) : null}
      <Button type="submit" size="sm" className="w-full" data-media-embed-submit="">
        {config.embedLabel}
      </Button>
    </form>
  );

  return (
    <Popover open>
      <PopoverAnchor virtualRef={anchor} />
      <PopoverContent
        data-media-source-popover=""
        aria-label={config.label}
        side="bottom"
        align="start"
        sideOffset={4}
        collisionPadding={8}
        hideWhenDetached
        className="w-80 gap-2 p-2"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          const first = event.currentTarget as HTMLElement | null;
          first?.querySelector<HTMLElement>("[data-media-source-first]")?.focus();
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
        {canUpload ? (
          <Tabs defaultValue="upload" className="gap-2">
            <TabsList className="w-full">
              <TabsTrigger value="upload">Upload</TabsTrigger>
              <TabsTrigger value="embed">Embed link</TabsTrigger>
            </TabsList>
            <TabsContent value="upload" className="flex flex-col gap-2">
              <Button
                type="button"
                size="sm"
                className="w-full"
                data-media-source-first=""
                data-media-upload=""
                onClick={() => {
                  fileRef.current?.click();
                }}
              >
                {config.uploadLabel}
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept={config.accept}
                hidden
                data-media-file-input=""
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  event.currentTarget.value = "";
                  if (file !== undefined) {
                    chooseFile(file);
                  }
                }}
              />
            </TabsContent>
            <TabsContent value="embed">{embedForm}</TabsContent>
          </Tabs>
        ) : (
          embedForm
        )}
      </PopoverContent>
    </Popover>
  );
}
