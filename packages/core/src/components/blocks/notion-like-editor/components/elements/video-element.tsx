import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { RefreshCw, Video as VideoIcon, VideoOff } from "lucide-react";
import type { VideoMimeType } from "@vidstack/react";
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
import { VideoPlayer } from "@/components/video-player/video-player";
import { cn } from "@/lib/utils";

import { runEditorCommand } from "../../lib/commands/editor-commands";
import { MEDIA_WIDTH_MAX } from "../../lib/features/editor-media-layout";
import { displayFileName } from "../../lib/features/editor-file";
import { cleanVideoFields } from "../../lib/features/editor-video";
import {
  removeVideo,
  setVideoCaption,
  setVideoSource,
  setVideoWidth,
} from "../../lib/features/editor-video-commands";
import { blockSelectionActive } from "../../lib/plugins/editor-block-selection";
import {
  openMediaActions,
  openMediaSource,
  selectMediaBlock,
} from "../../lib/plugins/editor-media-ui";
import { MediaUnavailableRow } from "../static/media-unavailable-row";
import { EditorTextButton } from "../ui/block-toolbar";
import { MediaSourcePopover, type MediaSourceConfig } from "../ui/media-source-popover";
import { VideoActionPopover } from "../ui/video-action-popover";
import {
  IMAGE_CAPTION_CLASS,
  IMAGE_SKELETON_CLASS,
  imageAlignClass,
  imageFigureClassName,
  imageFigureStyle,
  imageLoadingStyle,
  imageMediaClassName,
} from "./image-classes";
import { MEDIA_ICON_CLASS, mediaBlockClassName } from "./media-classes";
import {
  isControlTarget,
  onPlayerClick,
  onPlayerKeyDown,
  onPlayerKeyUp,
  useMediaActionsOpen,
  useMediaCardSelect,
  useMediaHover,
  useMediaElementEvent,
} from "./media-card";
import { MediaCaptionField } from "./media-caption";
import { MediaFailedRow, MediaPlaceholderRow, MediaUploadingRow } from "./media-rows";
import { MediaResizeHandles, useNaturalMediaPercent } from "./media-resize";
import { mediaResolveState, type MediaState } from "./media-state";
import { useResolvedFileUrl, useUploadController, useUploadState } from "./file-upload-scope";

// What the block shows. An upload state takes priority over the stored file's state.
type VideoPhase = MediaState | "uploading" | "failed";

const VIDEO_SOURCE_CONFIG: MediaSourceConfig = {
  label: "Add a video",
  accept: "video/*",
  uploadLabel: "Upload file",
  embedPlaceholder: "Paste the video link…",
  embedLabel: "Embed video",
  linkLabel: "Video link",
  invalidLinkMessage: "Enter a link that starts with http:// or https://",
};

// The video block. Its body is one of: an upload row, the empty placeholder, a skeleton while the url
// resolves, the player, or the unavailable row. The player is a control, so its actions open on hover or
// from Enter on the selected block.
export function VideoElement(props: PlateElementProps) {
  const editor = useEditorRef();
  const element = useElement();
  const readOnly = useReadOnly();
  const selected = useSelected();
  const focused = useFocused();
  const { fields } = cleanVideoFields(element);
  const id = typeof element.id === "string" ? element.id : "";
  const controller = useUploadController();
  const upload = useUploadState(id);
  const resolved = useResolvedFileUrl(fields.url);
  const [failedUrl, setFailedUrl] = useState<string | undefined>(undefined);
  const [loadedUrl, setLoadedUrl] = useState<string | undefined>(undefined);
  const [ratio, setRatio] = useState<string | undefined>(undefined);
  const [captionOpen, setCaptionOpen] = useState(false);
  const [preview, setPreview] = useState<number | null>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const figureRef = useRef<HTMLElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<HTMLDivElement>(null);

  const src = resolved.status === "ready" ? resolved.url : undefined;
  const state = mediaResolveState(fields.url, resolved.status, src, failedUrl);
  const uploading = readOnly ? undefined : upload;
  const phase: VideoPhase = uploading?.status ?? state;
  const editable = !readOnly;
  const showReady = phase === "ready";
  // The player knows its size once its metadata has loaded. Until then the box takes the column.
  const loaded = src !== undefined && loadedUrl === src;
  const shownWidth = preview ?? fields.width;
  const boxWidth = loaded ? shownWidth : (shownWidth ?? 100);
  const readAnchor = (): HTMLElement | null => anchorRef.current;

  // The rendered width is measured once the player has its size, for a block with no stored width.
  const { natural } = useNaturalMediaPercent(
    anchorRef,
    figureRef,
    fields.width === undefined && loaded,
  );

  // The player takes its engine from this type. A blob url has no extension, so the type is what lets the
  // player take it, and video/mp4 is a type the player knows. The browser reads the file itself. The player
  // sends no CORS request.
  const playerSource = useMemo(
    () => (src === undefined ? undefined : { src, type: "video/mp4" as VideoMimeType }),
    [src],
  );
  const failLoad = useCallback(() => {
    setFailedUrl(src);
  }, [src]);
  useMediaElementEvent(playerRef, "error", showReady, failLoad);
  // The file's own shape, from its metadata, sets the player's ratio. Until then the player is 16:9.
  const markLoaded = useCallback(
    (event: Event) => {
      setLoadedUrl(src);
      const media = event.target;
      if (media instanceof Element && media.tagName === "VIDEO") {
        const { videoWidth, videoHeight } = media as HTMLVideoElement;
        if (videoWidth > 0 && videoHeight > 0) {
          setRatio(`${videoWidth}/${videoHeight}`);
        }
      }
    },
    [src],
  );
  useMediaElementEvent(playerRef, "loadedmetadata", showReady, markLoaded);

  // Mouse-down on the padding around the player selects the block. The player itself is a control.
  useMediaCardSelect(cardRef, id, editable && showReady);
  const { open: actionsOpen } = useMediaActionsOpen(id);
  useMediaHover(
    anchorRef,
    id,
    editable && (phase === "ready" || phase === "unavailable") && !captionOpen,
  );

  function openSource(): void {
    selectMediaBlock(editor, id);
    openMediaSource(editor, id);
  }

  function openActions(): void {
    selectMediaBlock(editor, id);
    openMediaActions(editor, id);
  }

  // A click on the block outside the player opens its actions, as a click on the image does.
  function onCardClick(event: ReactMouseEvent<HTMLDivElement>): void {
    if (isControlTarget(event.target) || blockSelectionActive(editor)) {
      return;
    }

    openActions();
  }

  function embedLink(url: string): boolean {
    return runEditorCommand(editor, setVideoSource, { id, file: { url } });
  }

  function writeWidth(width: number): void {
    runEditorCommand(editor, setVideoWidth, { id, width });
  }

  const videoIcon = <VideoIcon aria-hidden="true" className={MEDIA_ICON_CLASS} />;

  let body: ReactNode;
  if (uploading?.status === "uploading") {
    body = (
      <MediaUploadingRow
        name={uploading.name}
        size={uploading.size}
        progress={uploading.progress}
        icon={videoIcon}
        onCancel={() => {
          controller?.cancel(id);
        }}
      />
    );
  } else if (uploading?.status === "failed") {
    body = (
      <MediaFailedRow
        message={uploading.message}
        icon={videoIcon}
        onRetry={() => {
          controller?.retry(id);
        }}
        onRemove={() => {
          runEditorCommand(editor, removeVideo, { id });
        }}
      />
    );
  } else if (state === "empty") {
    body = (
      <MediaPlaceholderRow
        label="Add a video"
        icon={videoIcon}
        interactive={editable}
        onActivate={openSource}
      />
    );
  } else if (state === "loading") {
    body = (
      <div
        className={cn("flex flex-col", imageAlignClass(fields.align))}
        style={imageLoadingStyle(fields.width)}
      >
        <Skeleton className={IMAGE_SKELETON_CLASS} />
      </div>
    );
  } else if (state === "unavailable") {
    body = (
      <div className="relative flex flex-col gap-2">
        <MediaUnavailableRow
          icon={<VideoOff aria-hidden="true" className="size-4 shrink-0" />}
          label="Video unavailable"
          name={fields.name}
        />
        {editable ? (
          <div className="flex">
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
        label="Video caption"
        caption={fields.caption}
        autoFocus={captionOpen}
        onSettled={() => {
          setCaptionOpen(false);
        }}
        onCommit={(text) => {
          runEditorCommand(editor, setVideoCaption, { id, caption: text });
        }}
      />
    ) : null;

    const handles =
      editable && (selected || actionsOpen) && loaded ? (
        <MediaResizeHandles
          kind="video"
          label="Resize video"
          width={fields.width}
          align={fields.align}
          value={preview ?? fields.width ?? natural ?? MEDIA_WIDTH_MAX}
          anchorRef={anchorRef}
          figureRef={figureRef}
          onPreview={setPreview}
          onCommit={writeWidth}
        />
      ) : null;

    const figure = (
      <figure
        ref={figureRef}
        className={imageFigureClassName(boxWidth, fields.align)}
        style={imageFigureStyle(boxWidth)}
      >
        <div className="relative">
          {/* The player is a control: its clicks and keys stay in it, and a menu it opens is portalled from here. */}
          <div
            ref={playerRef}
            data-media-control=""
            onClick={onPlayerClick}
            onKeyDown={(event) => {
              onPlayerKeyDown(editor, event);
            }}
            onKeyUp={onPlayerKeyUp}
          >
            {/* The box is 16:9 until the metadata gives the file's own width and height. */}
            <VideoPlayer
              title={displayFileName(fields)}
              src={playerSource}
              crossOrigin={null}
              aspectRatio={ratio}
              className={imageMediaClassName(boxWidth)}
            />
          </div>
          {handles}
        </div>
        {captionNode}
      </figure>
    );
    body = editable ? (
      <div ref={cardRef} data-video-card="" onClick={onCardClick}>
        {figure}
      </div>
    ) : (
      figure
    );
  }

  return (
    <PlateElement {...props} className={mediaBlockClassName(selected, focused, readOnly)}>
      <div
        ref={anchorRef}
        contentEditable={false}
        data-block-handle-anchor=""
        data-media-anchor=""
        data-video-state={phase}
        className="relative"
      >
        {body}
        {editable ? (
          <>
            <VideoActionPopover
              id={id}
              align={fields.align}
              width={fields.width}
              name={displayFileName(fields)}
              href={src}
              readAnchor={readAnchor}
              onCaption={() => {
                setCaptionOpen(true);
              }}
              onReplace={openSource}
            />
            <MediaSourcePopover
              blockId={id}
              config={VIDEO_SOURCE_CONFIG}
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
