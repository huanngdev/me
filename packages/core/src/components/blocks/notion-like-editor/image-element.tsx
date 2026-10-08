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
import { IMAGE_MAX_WIDTH, IMAGE_MIN_WIDTH, type ImageAlign } from "./editor-document-schema";
import {
  IMAGE_NOT_FOUND,
  IMAGE_UPLOAD_INTERRUPTED,
  assetIsAdapter,
  assetIsMissing,
  attachImageRuntime,
  beginImageUpload,
  cachedAssetUrl,
  clampImageWidth,
  imageResizeStep,
  imageRuntimePlugin,
  imageUploadState,
  refreshImageURL,
  removeImage,
  replaceImageFromFile,
  resolveAssetURL,
  retryImageUpload,
  setImageAlign,
  setImageAlt,
  setImageWidth,
} from "./editor-image";
import { hrElementClassName } from "./hr-element";
import {
  MEDIA_TOOLBAR_CLASS,
  MediaAlignMenu,
  MediaCaptionButton,
  MediaFileButton,
  MediaIconButton,
  MediaNotice,
  MediaResizeHandle,
  MediaSkeleton,
  mediaAlignAttr,
  mediaCaptionText,
  mediaFrameState,
  mediaPixelAttr,
  mediaRatio,
  mediaStringAttr,
  useMediaUpload,
  useResolvedMedia,
} from "./media-element-parts";

export function ImageRuntime({ store }: { store: AssetStore | null }) {
  const editor = useEditorRef();
  useEffect(() => attachImageRuntime(editor, store), [editor, store]);
  return null;
}

export function ImageElement(props: PlateElementProps) {
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
  const alt = mediaStringAttr(element, "alt") ?? "";
  const align = mediaAlignAttr(element);
  const naturalWidth = mediaPixelAttr(element, "naturalWidth");
  const naturalHeight = mediaPixelAttr(element, "naturalHeight");
  const storedWidth = mediaPixelAttr(element, "width");
  const asset = useResolvedMedia(
    assetId,
    imageRuntimePlugin,
    resolveAssetURL,
    cachedAssetUrl,
    assetIsMissing,
    assetIsAdapter,
  );
  const upload = useMediaUpload(id, imageRuntimePlugin, imageUploadState);
  const [failedUrl, setFailedUrl] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const frame = useRef<HTMLElement>(null);
  const displayUrl = assetId !== undefined ? asset.url : url;
  const missing = assetId !== undefined && asset.missing;
  const resolving = assetId !== undefined && displayUrl === undefined && !missing;
  const pending =
    resolving ||
    (assetId === undefined &&
      url === undefined &&
      (upload?.status === "pending" ||
        upload?.status === "processing" ||
        // Ready is recorded before the asset id is written onto the node.
        upload?.status === "ready"));
  const failed = upload?.status === "failed" ? upload.error : undefined;
  const showImage = displayUrl !== undefined && !missing && !failedUrl && failed === undefined;
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const width = dragWidth ?? storedWidth;
  const ratio = mediaRatio(naturalWidth, naturalHeight);
  const adapterFallback = failedUrl && url === undefined && asset.adapter;

  return (
    <PlateElement
      {...props}
      className={cn("group relative py-2", hrElementClassName(selected, focused, readOnly))}
    >
      <figure
        ref={frame}
        contentEditable={false}
        data-image-state={mediaFrameState({
          pending,
          failed,
          missing,
          failedUrl,
          showMedia: showImage,
          loaded,
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
        {showImage && displayUrl !== undefined ? (
          // Object URLs and remote sources are not next/image candidates.
          // eslint-disable-next-line @next/next/no-img-element -- resolved asset or remote image
          <img
            src={displayUrl}
            alt={alt}
            loading="lazy"
            decoding="async"
            width={naturalWidth}
            height={naturalHeight}
            draggable={false}
            className={cn("block h-auto max-w-full", loaded ? "opacity-100" : "opacity-0")}
            onLoad={() => {
              setLoaded(true);
            }}
            onError={() => {
              if (assetId !== undefined && refreshImageURL(editor, assetId)) {
                setFailedUrl(false);
                setLoaded(false);
                return;
              }

              setFailedUrl(true);
            }}
          />
        ) : null}
        {showImage && !loaded ? <MediaSkeleton marker="image" ratio={ratio} /> : null}
        {pending ? <MediaSkeleton marker="image" ratio={ratio} /> : null}
        {failed !== undefined ? (
          <ImageNotice
            id={id}
            message={failed}
            retry={failed !== "Choose the file again."}
            insert={false}
          />
        ) : null}
        {missing ? (
          <ImageNotice id={id} message={IMAGE_NOT_FOUND} retry={false} insert={false} />
        ) : null}
        {failedUrl && url !== undefined ? (
          <ImageNotice id={id} message={url} retry={false} insert={false} openUrl={url} />
        ) : null}
        {adapterFallback && displayUrl !== undefined ? (
          <ImageNotice
            id={id}
            message={displayUrl}
            retry={false}
            insert={false}
            openUrl={displayUrl}
          />
        ) : null}
        {!showImage && !pending && failed === undefined && !missing && !failedUrl ? (
          <ImageNotice
            id={id}
            message={IMAGE_UPLOAD_INTERRUPTED}
            retry={false}
            insert={!readOnly}
          />
        ) : null}
        {showImage && !readOnly ? (
          <ImageToolbar
            id={id}
            alt={alt}
            align={align}
            frame={frame}
            storedWidth={storedWidth}
            dragWidth={dragWidth}
            setDragWidth={setDragWidth}
          />
        ) : null}
        {showImage || mediaCaptionText(element).length > 0 ? (
          <Caption>
            <CaptionTextarea placeholder="Write a caption…" />
          </Caption>
        ) : null}
      </figure>
      {props.children}
    </PlateElement>
  );
}

function ImageToolbar({
  id,
  alt,
  align,
  frame,
  storedWidth,
  dragWidth,
  setDragWidth,
}: {
  id: string;
  alt: string;
  align: ImageAlign | undefined;
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
          label="Align image"
          align={align}
          onAlign={(editor, next) => {
            runEditorCommand(editor, setImageAlign, { id, align: next });
          }}
        />
        <AltTextControl id={id} alt={alt} />
        <MediaCaptionButton />
        <MediaFileButton
          label="Replace"
          accept="image/*"
          onFile={(editor, file) => {
            runEditorCommand(editor, replaceImageFromFile, { id, file });
          }}
        />
        <MediaIconButton
          label="Remove"
          onClick={(editor) => runEditorCommand(editor, removeImage, id)}
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
        minWidth={IMAGE_MIN_WIDTH}
        maxWidth={IMAGE_MAX_WIDTH}
        label="Resize image from the left"
        step={imageResizeStep()}
        clamp={clampImageWidth}
        commit={(editor, width) => {
          runEditorCommand(editor, setImageWidth, { id, width });
        }}
      />
      <MediaResizeHandle
        side="right"
        frame={frame}
        storedWidth={storedWidth}
        previewWidth={dragWidth}
        setPreviewWidth={setDragWidth}
        minWidth={IMAGE_MIN_WIDTH}
        maxWidth={IMAGE_MAX_WIDTH}
        label="Resize image from the right"
        step={imageResizeStep()}
        clamp={clampImageWidth}
        commit={(editor, width) => {
          runEditorCommand(editor, setImageWidth, { id, width });
        }}
      />
    </>
  );
}

function AltTextControl({ id, alt }: { id: string; alt: string }) {
  const editor = useEditorRef();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(alt);
  if (!open) {
    return (
      <button
        type="button"
        className="text-foreground hover:bg-muted inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs"
        onMouseDown={(event) => {
          event.preventDefault();
        }}
        onClick={() => {
          setDraft(alt);
          setOpen(true);
        }}
      >
        Alt text…
      </button>
    );
  }

  return (
    <form
      className="flex items-center gap-1"
      onSubmit={(event) => {
        event.preventDefault();
        runEditorCommand(editor, setImageAlt, { id, alt: draft });
        setOpen(false);
      }}
    >
      <input
        aria-label="Alt text"
        value={draft}
        maxLength={1000}
        className="border-border bg-background text-foreground w-40 rounded-md border px-2 py-1 text-sm"
        onChange={(event) => {
          setDraft(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            setOpen(false);
          }
        }}
      />
    </form>
  );
}

function ImageNotice({
  id,
  message,
  retry,
  insert,
  openUrl,
}: {
  id: string;
  message: string;
  retry: boolean;
  insert: boolean;
  openUrl?: string;
}) {
  return (
    <MediaNotice
      message={message}
      retry={retry}
      openUrl={openUrl}
      onRetry={(editor) => {
        retryImageUpload(editor, id);
      }}
      onRemove={(editor) => {
        runEditorCommand(editor, removeImage, id);
      }}
    >
      {insert ? (
        <MediaFileButton
          label="Insert image"
          accept="image/*"
          icon={<ImagePlus aria-hidden className="size-4" />}
          onFile={(editor, file) => {
            beginImageUpload(editor, id, file);
          }}
        />
      ) : null}
    </MediaNotice>
  );
}
