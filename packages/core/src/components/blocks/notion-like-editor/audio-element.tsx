import { useEffect, useRef, useState } from "react";
import { Caption, CaptionTextarea } from "@platejs/caption/react";
import { Trash2 } from "lucide-react";
import {
  PlateElement,
  useEditorRef,
  useElement,
  useFocused,
  useReadOnly,
  useSelected,
  type PlateElementProps,
} from "platejs/react";

import { cn } from "@/lib/utils";

import type { AssetStore } from "./editor-assets";
import { runEditorCommand } from "./editor-commands";
import { hrElementClassName } from "./hr-element";
import {
  MEDIA_TOOLBAR_CLASS,
  MediaAlignMenu,
  MediaCaptionButton,
  MediaFileButton,
  MediaIconButton,
  MediaNotice,
  MediaProgress,
  MediaSkeleton,
  mediaAlignAttr,
  mediaCaptionText,
  mediaFrameState,
  mediaPixelAttr,
  mediaStringAttr,
  useIsolatedMediaPlayback,
  useLazyMediaPreload,
  useMediaUpload,
  useResolvedMedia,
} from "./media-element-parts";
import {
  AUDIO_CANT_PLAY,
  AUDIO_NOT_FOUND,
  AUDIO_UPLOAD_INTERRUPTED,
  attachAudioRuntime,
  audioAssetIsAdapter,
  audioAssetIsMissing,
  audioDisplayName,
  audioFileName,
  audioUploadState,
  beginAudioUpload,
  cachedAudioUrl,
  ensureAudioMedia,
  formatAudioDuration,
  holdAudioUpload,
  refreshAudioURL,
  removeAudio,
  replaceAudioFromFile,
  resolveAudioURL,
  retryAudioUpload,
  setAudioAlign,
} from "./editor-audio";

export function AudioRuntime({ store }: { store: AssetStore | null }) {
  const editor = useEditorRef();
  useEffect(() => attachAudioRuntime(editor, store), [editor, store]);
  return null;
}

export function AudioElement(props: PlateElementProps) {
  "use no memo";
  // Asset URLs and upload progress live outside React. Memoizing the first read kept the skeleton up.

  const editor = useEditorRef();
  const element = useElement();
  const readOnly = useReadOnly();
  const selected = useSelected();
  const focused = useFocused();
  const id = typeof element.id === "string" ? element.id : "";
  const assetId = mediaStringAttr(element, "assetId");
  const url = mediaStringAttr(element, "url");
  const mimeType = mediaStringAttr(element, "mimeType");
  const align = mediaAlignAttr(element);
  const storedName = mediaStringAttr(element, "name");
  const durationMs = mediaPixelAttr(element, "durationMs");
  const asset = useResolvedMedia(
    assetId,
    ensureAudioMedia().plugin,
    resolveAudioURL,
    cachedAudioUrl,
    audioAssetIsMissing,
    audioAssetIsAdapter,
  );
  const upload = useMediaUpload(id, ensureAudioMedia().plugin, audioUploadState);
  const [failedUrl, setFailedUrl] = useState(false);
  const [preload, setPreload] = useState<"none" | "metadata">("none");
  const audioRef = useRef<HTMLAudioElement>(null);
  const displayUrl = assetId !== undefined ? asset.url : url;
  const missing = assetId !== undefined && asset.missing;
  const resolving = assetId !== undefined && displayUrl === undefined && !missing;
  const sourcePending =
    resolving ||
    (assetId === undefined &&
      url === undefined &&
      (upload?.status === "pending" ||
        upload?.status === "processing" ||
        upload?.status === "ready"));
  const sourceFailed = upload?.status === "failed" ? upload.error : undefined;
  const uploading =
    upload?.status === "pending" || upload?.status === "processing" ? upload : undefined;
  const showAudio =
    displayUrl !== undefined &&
    !missing &&
    !failedUrl &&
    sourceFailed === undefined &&
    !sourcePending;
  const cachedName = assetId !== undefined ? audioFileName(editor, assetId) : undefined;
  const label = audioDisplayName(storedName, url);
  const durationLabel = durationMs === undefined ? undefined : formatAudioDuration(durationMs);

  useIsolatedMediaPlayback(audioRef, displayUrl, mimeType, setFailedUrl);
  useLazyMediaPreload(audioRef, displayUrl, showAudio, setPreload);

  return (
    <PlateElement
      {...props}
      className={cn(
        "group relative max-w-full py-2",
        hrElementClassName(selected, focused, readOnly),
      )}
    >
      <figure
        contentEditable={false}
        data-audio-state={mediaFrameState({
          pending: sourcePending,
          failed: sourceFailed,
          missing,
          failedUrl,
          showMedia: showAudio,
          loaded: showAudio,
        })}
        className={cn(
          "relative max-w-full overflow-hidden",
          align === "left" && "mr-auto",
          align === "right" && "ml-auto",
        )}
      >
        {showAudio && displayUrl !== undefined ? (
          <div className="flex w-full min-w-0 flex-col gap-1">
            <div className="flex min-w-0 items-baseline gap-3">
              <p className="text-foreground min-w-0 truncate text-sm" title={label}>
                {label}
              </p>
              {durationLabel !== undefined ? (
                <p className="text-muted-foreground shrink-0 font-mono text-xs tabular-nums">
                  {durationLabel}
                </p>
              ) : null}
            </div>
            <div className="h-14 w-full overflow-hidden">
              <audio
                ref={audioRef}
                src={displayUrl}
                controls
                preload={preload}
                className="block h-14 w-full"
                onError={() => {
                  if (assetId !== undefined && refreshAudioURL(editor, assetId)) {
                    setFailedUrl(false);
                    return;
                  }

                  setFailedUrl(true);
                }}
              />
            </div>
          </div>
        ) : null}
        {sourcePending ? <MediaSkeleton marker="audio" ratio={undefined} /> : null}
        {uploading && !readOnly ? (
          <MediaProgress
            onCancel={(current) => {
              holdAudioUpload(current, id);
            }}
          />
        ) : null}
        {sourceFailed !== undefined ? (
          <MediaNotice
            message={sourceFailed}
            retry={sourceFailed !== "Choose the file again."}
            onRetry={(current) => {
              retryAudioUpload(current, id);
            }}
            onRemove={(current) => {
              runEditorCommand(current, removeAudio, id);
            }}
          />
        ) : null}
        {missing ? (
          <MediaNotice
            message={AUDIO_NOT_FOUND}
            retry={false}
            onRemove={(current) => {
              runEditorCommand(current, removeAudio, id);
            }}
          />
        ) : null}
        {failedUrl && !showAudio && sourceFailed === undefined && !sourcePending && !missing ? (
          <MediaNotice
            message={AUDIO_CANT_PLAY}
            retry={false}
            openUrl={url}
            download={
              assetId !== undefined && displayUrl !== undefined
                ? { href: displayUrl, name: storedName ?? cachedName ?? "audio" }
                : undefined
            }
            onRemove={
              readOnly
                ? undefined
                : (current) => {
                    runEditorCommand(current, removeAudio, id);
                  }
            }
          />
        ) : null}
        {!showAudio && !sourcePending && sourceFailed === undefined && !missing && !failedUrl ? (
          <MediaNotice
            message={AUDIO_UPLOAD_INTERRUPTED}
            retry={false}
            onRemove={(current) => {
              runEditorCommand(current, removeAudio, id);
            }}
          >
            {readOnly ? null : (
              <MediaFileButton
                label="Insert audio"
                accept="audio/*"
                onFile={(current, file) => {
                  beginAudioUpload(current, id, file, "source");
                }}
              />
            )}
          </MediaNotice>
        ) : null}
        {showAudio && !readOnly ? <AudioToolbar id={id} align={align} /> : null}
        {showAudio || mediaCaptionText(element).length > 0 ? (
          <Caption>
            <CaptionTextarea placeholder="Write a caption…" />
          </Caption>
        ) : null}
      </figure>
      {props.children}
    </PlateElement>
  );
}

function AudioToolbar({ id, align }: { id: string; align: "left" | "right" | undefined }) {
  const selected = useSelected();

  return (
    <div className={cn(MEDIA_TOOLBAR_CLASS, selected && "pointer-events-auto opacity-100")}>
      <MediaAlignMenu
        label="Align audio"
        align={align}
        onAlign={(editor, next) => {
          runEditorCommand(editor, setAudioAlign, { id, align: next });
        }}
      />
      <MediaCaptionButton />
      <MediaFileButton
        label="Replace audio"
        accept="audio/*"
        onFile={(editor, file) => {
          runEditorCommand(editor, replaceAudioFromFile, { id, file });
        }}
      />
      <MediaIconButton
        label="Remove"
        onClick={(editor) => {
          runEditorCommand(editor, removeAudio, id);
        }}
      >
        <Trash2 aria-hidden className="size-4" />
      </MediaIconButton>
    </div>
  );
}
