import { useRef, useState, type ReactNode } from "react";
import { Ellipsis, Music, RefreshCw, VolumeX } from "lucide-react";
import {
  PlateElement,
  useEditorRef,
  useElement,
  useFocused,
  useReadOnly,
  useSelected,
  type PlateElementProps,
} from "platejs/react";

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
import { formatFileSize } from "../../lib/features/editor-file-url";
import {
  openMediaActions,
  openMediaSource,
  selectMediaBlock,
} from "../../lib/plugins/editor-media-ui";
import { MediaUnavailableRow } from "../static/media-unavailable-row";
import { FileRowText } from "../static/file-row";
import { EditorIconButton, EditorTextButton } from "../ui/block-toolbar";
import { AudioActionPopover } from "../ui/audio-action-popover";
import { MediaSourcePopover, type MediaSourceConfig } from "../ui/media-source-popover";
import { hrElementClassName } from "./hr-element";
import { IMAGE_CAPTION_CLASS } from "./image-classes";
import { MEDIA_CARD_CLASS, MEDIA_ICON_CLASS } from "./media-classes";
import { onPlayerClick, onPlayerKeyDown, onPlayerKeyUp, useMediaCardSelect } from "./media-card";
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
// resolves, the player card, or the unavailable row. The player takes its own clicks and keys, so its
// actions open from the More button on the card.
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
  const sizeDetail = fields.size === undefined ? undefined : formatFileSize(fields.size);
  const readAnchor = (): HTMLElement | null => anchorRef.current;

  // Mouse-down on the card selects the block. The player and the More button are controls.
  useMediaCardSelect(cardRef, id, editable && showReady);

  function openSource(): void {
    selectMediaBlock(editor, id);
    openMediaSource(editor, id);
  }

  function openActions(): void {
    selectMediaBlock(editor, id);
    openMediaActions(editor, id);
  }

  function embedLink(url: string): boolean {
    return runEditorCommand(editor, setAudioSource, { id, file: { url } });
  }

  const audioIcon = <Music aria-hidden="true" className={MEDIA_ICON_CLASS} />;
  const moreButton = editable ? (
    <EditorIconButton
      variant="ghost"
      label="Audio actions"
      icon={<Ellipsis aria-hidden="true" />}
      data-audio-more=""
      onClick={openActions}
    />
  ) : null;

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
            <div className="ml-auto">{moreButton}</div>
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
        <div ref={cardRef} data-audio-card="" className={MEDIA_CARD_CLASS}>
          <div className="flex items-center gap-3">
            {audioIcon}
            <FileRowText name={name} detail={sizeDetail} />
            {moreButton}
          </div>
          <audio
            src={src}
            controls
            preload="metadata"
            data-audio-player=""
            className="w-full"
            onError={() => {
              setFailedUrl(src);
            }}
            onKeyDown={(event) => {
              onPlayerKeyDown(editor, event);
            }}
            onKeyUp={onPlayerKeyUp}
            onClick={onPlayerClick}
          />
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
