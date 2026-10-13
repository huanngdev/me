import { useMemo, useRef, useState, type ReactNode } from "react";
import { Music, RefreshCw, VolumeX } from "lucide-react";
import {
  PlateElement,
  useEditorRef,
  useElement,
  useFocused,
  useReadOnly,
  useSelected,
  type PlateElementProps,
} from "platejs/react";

import { AudioPlayer } from "@/components/audio-player/audio-player";
import type { AudioMimeType } from "@vidstack/react";

import { Skeleton } from "@/components/skeleton";
import { cn } from "@/lib/utils";

import { runEditorCommand } from "../../lib/commands/editor-commands";
import { cleanAudioFields } from "../../lib/features/editor-audio";
import {
  removeAudio,
  setAudioCaption,
  setAudioSource,
} from "../../lib/features/editor-audio-commands";
import { displayFileName } from "../../lib/features/editor-file";
import { openMediaSource, selectMediaBlock } from "../../lib/plugins/editor-media-ui";
import { MediaUnavailableRow } from "../static/media-unavailable-row";
import { EditorTextButton } from "../ui/block-toolbar";
import { AudioActionPopover } from "../ui/audio-action-popover";
import { MediaSourcePopover, type MediaSourceConfig } from "../ui/media-source-popover";
import { hrElementClassName } from "./hr-element";
import { IMAGE_CAPTION_CLASS } from "./image-classes";
import { MEDIA_ICON_CLASS } from "./media-classes";
import {
  onPlayerClick,
  onPlayerKeyDown,
  onPlayerKeyUp,
  useMediaCardSelect,
  useMediaHover,
  useMediaElementEvent,
} from "./media-card";
import { MediaCaptionField } from "./media-caption";
import { MediaFailedRow, MediaPlaceholderRow, MediaUploadingRow } from "./media-rows";
import { mediaResolveState, type MediaState } from "./media-state";
import { useResolvedFileUrl, useUploadController, useUploadState } from "./file-upload-scope";

// What the block shows. An upload state takes priority over the stored file's state.
type AudioPhase = MediaState | "uploading" | "failed";

const AUDIO_SOURCE_CONFIG: MediaSourceConfig = {
  label: "Add an audio file",
  accept: "audio/*",
  uploadLabel: "Upload file",
  embedPlaceholder: "Paste the audio link…",
  embedLabel: "Embed audio",
  linkLabel: "Audio link",
  invalidLinkMessage: "Enter a link that starts with http:// or https://",
};

// The audio block. Its body is one of: an upload row, the empty placeholder, a skeleton while the url
// resolves, the player, or the unavailable row. The player is a control: its clicks and keys belong to
// it, so its actions open on hover or from Enter on the selected block.
export function AudioElement(props: PlateElementProps) {
  const editor = useEditorRef();
  const element = useElement();
  const readOnly = useReadOnly();
  const selected = useSelected();
  const focused = useFocused();
  const { fields } = cleanAudioFields(element);
  const id = typeof element.id === "string" ? element.id : "";
  const controller = useUploadController();
  const upload = useUploadState(id);
  const resolved = useResolvedFileUrl(fields.url);
  const [failedUrl, setFailedUrl] = useState<string | undefined>(undefined);
  const [captionOpen, setCaptionOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const src = resolved.status === "ready" ? resolved.url : undefined;
  const state = mediaResolveState(fields.url, resolved.status, src, failedUrl);
  const uploading = readOnly ? undefined : upload;
  const phase: AudioPhase = uploading?.status ?? state;
  const editable = !readOnly;
  const showReady = phase === "ready";
  const name = displayFileName(fields);
  const readAnchor = (): HTMLElement | null => anchorRef.current;

  // The player picks its engine from the type it is given, and only the audio types it knows and the browser
  // can play count. A blob url has no extension, and a stored type such as audio/wav is not one of them, so
  // every source takes audio/mpeg. The browser reads the file itself, so the file still plays. The player
  // sends no CORS request, so a link on another site plays without CORS headers.
  const playerSource = useMemo(
    () => (src === undefined ? undefined : { src, type: "audio/mpeg" as AudioMimeType }),
    [src],
  );

  // Mouse-down on the player selects the block. The player is a control.
  useMediaCardSelect(cardRef, id, editable && showReady);
  useMediaElementEvent(cardRef, "error", showReady, () => {
    setFailedUrl(src);
  });
  useMediaHover(
    anchorRef,
    id,
    editable && (phase === "ready" || phase === "unavailable") && !captionOpen,
  );

  function openSource(): void {
    selectMediaBlock(editor, id);
    openMediaSource(editor, id);
  }

  function embedLink(url: string): boolean {
    return runEditorCommand(editor, setAudioSource, { id, file: { url } });
  }

  const audioIcon = <Music aria-hidden="true" className={MEDIA_ICON_CLASS} />;

  let body: ReactNode;
  if (uploading?.status === "uploading") {
    body = (
      <MediaUploadingRow
        name={uploading.name}
        size={uploading.size}
        progress={uploading.progress}
        icon={audioIcon}
        onCancel={() => {
          controller?.cancel(id);
        }}
      />
    );
  } else if (uploading?.status === "failed") {
    body = (
      <MediaFailedRow
        message={uploading.message}
        icon={audioIcon}
        onRetry={() => {
          controller?.retry(id);
        }}
        onRemove={() => {
          runEditorCommand(editor, removeAudio, { id });
        }}
      />
    );
  } else if (state === "empty") {
    body = (
      <MediaPlaceholderRow
        label="Add an audio file"
        icon={audioIcon}
        interactive={editable}
        onActivate={openSource}
      />
    );
  } else if (state === "loading") {
    body = <Skeleton className="h-12 w-full rounded-md" />;
  } else if (state === "unavailable") {
    body = (
      <div className="flex flex-col gap-2">
        <MediaUnavailableRow
          icon={<VolumeX aria-hidden="true" className="size-4 shrink-0" />}
          label="Audio unavailable"
          name={fields.name}
        />
        {editable ? (
          <div className="flex items-center gap-1">
            <EditorTextButton
              label="Replace"
              icon={<RefreshCw aria-hidden="true" />}
              onClick={openSource}
            />
          </div>
        ) : null}
      </div>
    );
  } else {
    const captionNode = readOnly ? (
      fields.caption === undefined ? null : (
        <figcaption className={IMAGE_CAPTION_CLASS}>{fields.caption}</figcaption>
      )
    ) : fields.caption !== undefined || captionOpen ? (
      <MediaCaptionField
        key={fields.caption ?? ""}
        id={id}
        label="Audio caption"
        caption={fields.caption}
        autoFocus={captionOpen}
        onSettled={() => {
          setCaptionOpen(false);
        }}
        onCommit={(text) => {
          runEditorCommand(editor, setAudioCaption, { id, caption: text });
        }}
      />
    ) : null;

    body = (
      <figure className="flex w-full flex-col">
        <div ref={cardRef} data-audio-card="" className="w-full">
          <div
            data-media-control=""
            onClick={onPlayerClick}
            onKeyDown={(event) => {
              onPlayerKeyDown(editor, event);
            }}
            onKeyUp={onPlayerKeyUp}
          >
            <AudioPlayer title={name} src={playerSource} crossOrigin={null} />
          </div>
        </div>
        {captionNode}
      </figure>
    );
  }

  return (
    <PlateElement
      {...props}
      className={cn("relative py-1", hrElementClassName(selected, focused, readOnly))}
    >
      <div
        ref={anchorRef}
        contentEditable={false}
        data-block-handle-anchor=""
        data-media-anchor=""
        data-audio-state={phase}
        className="relative"
      >
        {body}
        {editable ? (
          <>
            <AudioActionPopover
              id={id}
              name={name}
              href={src}
              readAnchor={readAnchor}
              onCaption={() => {
                setCaptionOpen(true);
              }}
              onReplace={openSource}
            />
            <MediaSourcePopover
              blockId={id}
              config={AUDIO_SOURCE_CONFIG}
              readAnchor={readAnchor}
              onEmbed={embedLink}
            />
          </>
        ) : null}
      </div>
      {props.children}
    </PlateElement>
  );
}
