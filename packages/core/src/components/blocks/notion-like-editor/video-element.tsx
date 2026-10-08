import { useEffect, useRef, useState } from "react";
import { Caption, CaptionTextarea } from "@platejs/caption/react";
import { ImagePlus, Trash2 } from "lucide-react";
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
import { VIDEO_MAX_WIDTH, VIDEO_MIN_WIDTH } from "./editor-document-schema";
import { hrElementClassName } from "./hr-element";
import {
  MEDIA_TOOLBAR_CLASS,
  MediaAlignMenu,
  MediaCaptionButton,
  MediaFileButton,
  MediaIconButton,
  MediaNotice,
  MediaProgress,
  MediaResizeHandle,
  MediaSkeleton,
  mediaAlignAttr,
  mediaCaptionText,
  mediaFrameState,
  mediaPixelAttr,
  mediaRatio,
  mediaStringAttr,
  useIsolatedMediaPlayback,
  useLazyMediaPreload,
  useMediaUpload,
  useResolvedMedia,
} from "./media-element-parts";
import {
  VIDEO_CANT_PLAY,
  VIDEO_NOT_FOUND,
  VIDEO_UPLOAD_INTERRUPTED,
  attachVideoRuntime,
  beginVideoUpload,
  cachedVideoUrl,
  clampVideoWidth,
  holdVideoUpload,
  refreshVideoURL,
  removeVideo,
  removeVideoPoster,
  replaceVideoFromFile,
  resolveVideoURL,
  retryVideoUpload,
  setVideoAlign,
  setVideoPoster,
  setVideoWidth,
  videoAssetIsAdapter,
  videoAssetIsMissing,
  videoFileName,
  videoResizeStep,
  ensureVideoMedia,
  videoUploadRole,
  videoUploadState,
} from "./editor-video";

export function VideoRuntime({ store }: { store: AssetStore | null }) {
  const editor = useEditorRef();
  useEffect(() => attachVideoRuntime(editor, store), [editor, store]);
  return null;
}

export function VideoElement(props: PlateElementProps) {
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
  const naturalWidth = mediaPixelAttr(element, "naturalWidth");
  const naturalHeight = mediaPixelAttr(element, "naturalHeight");
  const storedWidth = mediaPixelAttr(element, "width");
  const posterAssetId = mediaStringAttr(element, "posterAssetId");
  const posterUrl = mediaStringAttr(element, "posterUrl");
  const asset = useResolvedMedia(
    assetId,
    ensureVideoMedia().plugin,
    resolveVideoURL,
    cachedVideoUrl,
    videoAssetIsMissing,
    videoAssetIsAdapter,
  );
  const posterAsset = useResolvedMedia(
    posterAssetId,
    ensureVideoMedia().plugin,
    resolveVideoURL,
    cachedVideoUrl,
    videoAssetIsMissing,
    videoAssetIsAdapter,
  );
  const upload = useMediaUpload(id, ensureVideoMedia().plugin, videoUploadState);
  const role = id.length === 0 ? undefined : videoUploadRole(editor, id);
  const posterUpload = role === "poster";
  const [failedUrl, setFailedUrl] = useState(false);
  const [posterBroken, setPosterBroken] = useState(false);
  const [preload, setPreload] = useState<"none" | "metadata">("none");
  const frame = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const displayUrl = assetId !== undefined ? asset.url : url;
  const missing = assetId !== undefined && asset.missing;
  const resolving = assetId !== undefined && displayUrl === undefined && !missing;
  const sourcePending =
    !posterUpload &&
    (resolving ||
      (assetId === undefined &&
        url === undefined &&
        (upload?.status === "pending" ||
          upload?.status === "processing" ||
          upload?.status === "ready")));
  const sourceFailed = !posterUpload && upload?.status === "failed" ? upload.error : undefined;
  const posterFailedUpload = posterUpload && upload?.status === "failed" ? upload.error : undefined;
  const uploading =
    upload?.status === "pending" || upload?.status === "processing" ? upload : undefined;
  const showVideo =
    displayUrl !== undefined &&
    !missing &&
    !failedUrl &&
    sourceFailed === undefined &&
    !sourcePending;
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const width = dragWidth ?? storedWidth;
  const ratio = mediaRatio(naturalWidth, naturalHeight);
  const posterDisplay = posterAssetId !== undefined ? posterAsset.url : posterUrl;
  const fileName = assetId !== undefined ? videoFileName(editor, assetId) : undefined;

  useIsolatedMediaPlayback(videoRef, displayUrl, mimeType, setFailedUrl);
  useLazyMediaPreload(videoRef, displayUrl, showVideo, setPreload);

  return (
    <PlateElement
      {...props}
      className={cn("group relative py-2", hrElementClassName(selected, focused, readOnly))}
    >
      <figure
        ref={frame}
        contentEditable={false}
        data-video-state={mediaFrameState({
          pending: sourcePending,
          failed: sourceFailed,
          missing,
          failedUrl,
          showMedia: showVideo,
          loaded: showVideo,
        })}
        className={cn(
          "relative max-w-full",
          align === "left" && "mr-auto",
          align === "right" && "ml-auto",
          align === undefined && "mx-auto",
        )}
        style={{
          width: width === undefined ? "100%" : `${String(width)}px`,
          maxWidth: "100%",
          aspectRatio: ratio,
        }}
      >
        {showVideo && displayUrl !== undefined ? (
          <video
            ref={videoRef}
            src={displayUrl}
            controls
            playsInline
            preload={preload}
            poster={posterBroken || posterDisplay === undefined ? undefined : posterDisplay}
            style={{ aspectRatio: ratio, width: "100%", height: "auto" }}
            onError={() => {
              if (assetId !== undefined && refreshVideoURL(editor, assetId)) {
                setFailedUrl(false);
                return;
              }

              setFailedUrl(true);
            }}
          />
        ) : null}
        {posterDisplay !== undefined && !posterBroken ? (
          // The poster is probed on its own. A failed poster must not fire the video error path.
          // eslint-disable-next-line @next/next/no-img-element -- poster probe
          <img
            data-video-poster=""
            alt=""
            src={posterDisplay}
            className="hidden"
            onError={() => {
              setPosterBroken(true);
            }}
          />
        ) : null}
        {sourcePending ? <MediaSkeleton marker="video" ratio={ratio} /> : null}
        {uploading && !readOnly ? (
          <MediaProgress
            onCancel={(current) => {
              holdVideoUpload(current, id);
            }}
          />
        ) : null}
        {sourceFailed !== undefined ? (
          <MediaNotice
            message={sourceFailed}
            retry={sourceFailed !== "Choose the file again."}
            onRetry={(current) => {
              retryVideoUpload(current, id);
            }}
            onRemove={(current) => {
              runEditorCommand(current, removeVideo, id);
            }}
          />
        ) : null}
        {posterFailedUpload !== undefined && showVideo ? (
          <MediaNotice
            message={posterFailedUpload}
            retry={posterFailedUpload !== "Choose the file again."}
            onRetry={(current) => {
              retryVideoUpload(current, id);
            }}
          />
        ) : null}
        {missing ? (
          <MediaNotice
            message={VIDEO_NOT_FOUND}
            retry={false}
            onRemove={(current) => {
              runEditorCommand(current, removeVideo, id);
            }}
          />
        ) : null}
        {failedUrl &&
        showVideo === false &&
        sourceFailed === undefined &&
        !sourcePending &&
        !missing ? (
          <MediaNotice
            message={VIDEO_CANT_PLAY}
            retry={false}
            openUrl={url}
            download={
              assetId !== undefined && displayUrl !== undefined
                ? { href: displayUrl, name: fileName ?? "video" }
                : undefined
            }
            onRemove={
              readOnly
                ? undefined
                : (current) => {
                    runEditorCommand(current, removeVideo, id);
                  }
            }
          />
        ) : null}
        {!showVideo && !sourcePending && sourceFailed === undefined && !missing && !failedUrl ? (
          <MediaNotice
            message={VIDEO_UPLOAD_INTERRUPTED}
            retry={false}
            onRemove={(current) => {
              runEditorCommand(current, removeVideo, id);
            }}
          >
            {readOnly ? null : (
              <MediaFileButton
                label="Insert video"
                accept="video/*"
                onFile={(current, file) => {
                  beginVideoUpload(current, id, file, "source");
                }}
              />
            )}
          </MediaNotice>
        ) : null}
        {showVideo && !readOnly ? (
          <VideoToolbar
            id={id}
            align={align}
            hasPoster={posterAssetId !== undefined || posterUrl !== undefined}
            frame={frame}
            storedWidth={storedWidth}
            dragWidth={dragWidth}
            setDragWidth={setDragWidth}
          />
        ) : null}
        {showVideo || mediaCaptionText(element).length > 0 ? (
          <Caption>
            <CaptionTextarea placeholder="Write a caption…" />
          </Caption>
        ) : null}
      </figure>
      {props.children}
    </PlateElement>
  );
}

function VideoToolbar({
  id,
  align,
  hasPoster,
  frame,
  storedWidth,
  dragWidth,
  setDragWidth,
}: {
  id: string;
  align: "left" | "right" | undefined;
  hasPoster: boolean;
  frame: { current: HTMLElement | null };
  storedWidth: number | undefined;
  dragWidth: number | null;
  setDragWidth: (width: number | null) => void;
}) {
  const selected = useSelected();

  return (
    <>
      <div className={cn(MEDIA_TOOLBAR_CLASS, selected && "pointer-events-auto opacity-100")}>
        <MediaAlignMenu
          label="Align video"
          align={align}
          onAlign={(editor, next) => {
            runEditorCommand(editor, setVideoAlign, { id, align: next });
          }}
        />
        <MediaCaptionButton />
        <MediaFileButton
          label="Set poster…"
          accept="image/*"
          icon={<ImagePlus aria-hidden className="size-4" />}
          onFile={(editor, file) => {
            runEditorCommand(editor, setVideoPoster, { id, file });
          }}
        />
        {hasPoster ? (
          <MediaIconButton
            label="Remove poster"
            onClick={(editor) => {
              runEditorCommand(editor, removeVideoPoster, id);
            }}
          >
            <span>Remove poster</span>
          </MediaIconButton>
        ) : null}
        <MediaFileButton
          label="Replace video"
          accept="video/*"
          onFile={(editor, file) => {
            runEditorCommand(editor, replaceVideoFromFile, { id, file });
          }}
        />
        <MediaIconButton
          label="Remove"
          onClick={(editor) => {
            runEditorCommand(editor, removeVideo, id);
          }}
        >
          <Trash2 aria-hidden className="size-4" />
        </MediaIconButton>
      </div>
      <MediaResizeHandle
        side="left"
        frame={frame}
        storedWidth={storedWidth}
        previewWidth={dragWidth}
        setPreviewWidth={setDragWidth}
        minWidth={VIDEO_MIN_WIDTH}
        maxWidth={VIDEO_MAX_WIDTH}
        label="Resize video from the left"
        step={videoResizeStep()}
        clamp={clampVideoWidth}
        commit={(editor, next) => {
          runEditorCommand(editor, setVideoWidth, { id, width: next });
        }}
      />
      <MediaResizeHandle
        side="right"
        frame={frame}
        storedWidth={storedWidth}
        previewWidth={dragWidth}
        setPreviewWidth={setDragWidth}
        minWidth={VIDEO_MIN_WIDTH}
        maxWidth={VIDEO_MAX_WIDTH}
        label="Resize video from the right"
        step={videoResizeStep()}
        clamp={clampVideoWidth}
        commit={(editor, next) => {
          runEditorCommand(editor, setVideoWidth, { id, width: next });
        }}
      />
    </>
  );
}
