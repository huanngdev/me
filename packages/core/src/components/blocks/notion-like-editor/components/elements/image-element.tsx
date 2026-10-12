import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { Image as ImageIcon, RefreshCw } from "lucide-react";
import type { SlateEditor } from "platejs";
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
import {
  IMAGE_CAPTION_MAX,
  IMAGE_WIDTH_MAX,
  IMAGE_WIDTH_MIN,
  cleanImageFields,
  dragImageWidth,
  keyImageWidth,
  naturalImagePercent,
  type ImageAlign,
  type ImageFields,
} from "../../lib/features/editor-image";
import {
  removeImage,
  setImageCaption,
  setImageSource,
  setImageWidth,
} from "../../lib/features/editor-image-commands";
import {
  cleanFileText,
  isHttpFileUrl,
  isRootRelativeFileUrl,
} from "../../lib/features/editor-file-url";
import { findBlockById } from "../../lib/features/editor-synced-block";
import { blockSelectionActive } from "../../lib/plugins/editor-block-selection";
import { isControlTarget, useMediaCardSelect } from "./media-card";
import { MediaTextInput } from "./media-text-input";
import {
  openMediaActions,
  openMediaSource,
  selectMediaBlock,
} from "../../lib/plugins/editor-media-ui";
import { onPopoverHistoryKey } from "../../lib/plugins/editor-popover-history";
import {
  IMAGE_CAPTION_CLASS,
  IMAGE_SKELETON_CLASS,
  imageAlignClass,
  imageFigureClassName,
  imageFigureStyle,
  imageLoadingStyle,
  imageMediaClassName,
} from "./image-classes";
import { ImageUnavailableRow } from "../static/image-unavailable-row";
import { EditorTextButton, mediaStringAttr } from "../ui/block-toolbar";
import { ImageToolbarPopover } from "../ui/image-toolbar-popover";
import { MediaSourcePopover, type MediaSourceConfig } from "../ui/media-source-popover";
import { hrElementClassName } from "./hr-element";
import { MEDIA_ICON_CLASS } from "./media-classes";
import { MediaFailedRow, MediaPlaceholderRow, MediaUploadingRow } from "./media-rows";
import {
  useResolvedFileUrl,
  useUploadController,
  useUploadState,
  type ResolvedFileUrl,
} from "./file-upload-scope";

export type ImageState = "empty" | "loading" | "ready" | "unavailable";

// What the block shows. An upload state takes priority over the stored file's state.
type ImagePhase = ImageState | "uploading" | "failed";

const IMAGE_SOURCE_CONFIG: MediaSourceConfig = {
  label: "Add an image",
  accept: "image/*",
  uploadLabel: "Upload file",
  embedPlaceholder: "Paste the image link…",
  embedLabel: "Embed image",
  linkLabel: "Image link",
  invalidLinkMessage: "Enter a link that starts with http:// or https://",
};

// `src` is the loadable url once resolved. `failedUrl` is the url whose load failed.
function imageState(
  url: string | undefined,
  status: ResolvedFileUrl["status"],
  src: string | undefined,
  failedUrl: string | undefined,
): ImageState {
  if (url === undefined) {
    return "empty";
  }
  if (status === "unavailable") {
    return "unavailable";
  }
  if (src === undefined) {
    return "loading";
  }
  return src === failedUrl ? "unavailable" : "ready";
}

function storedCaption(editor: SlateEditor, id: string): string | undefined {
  const entry = findBlockById(editor, id);
  return entry === undefined ? undefined : mediaStringAttr(entry[0], "caption");
}

// The rendered width as a percent of the column, read now from the DOM.
function measuredPercent(
  anchor: HTMLElement | null,
  figure: HTMLElement | null,
): number | undefined {
  return naturalImagePercent(
    figure?.getBoundingClientRect().width ?? 0,
    anchor?.getBoundingClientRect().width ?? 0,
  );
}

type DragState = {
  side: "left" | "right";
  pointerId: number;
  target: HTMLElement;
  startX: number;
  columnPx: number;
  start: number;
  stored: number | undefined;
  moved: boolean;
  align: ImageAlign | undefined;
  latest: number;
  detach: () => void;
};

// The image block. Its body is one of: an upload row, the empty placeholder, a skeleton while the
// url resolves, the image, or the unavailable row.
export function ImageElement(props: PlateElementProps) {
  const editor = useEditorRef();
  const element = useElement();
  const readOnly = useReadOnly();
  const selected = useSelected();
  const focused = useFocused();
  const { fields } = cleanImageFields(element);
  const id = typeof element.id === "string" ? element.id : "";
  const controller = useUploadController();
  const upload = useUploadState(id);
  const resolved = useResolvedFileUrl(fields.url);
  const [failedUrl, setFailedUrl] = useState<string | undefined>(undefined);
  const [captionOpen, setCaptionOpen] = useState(false);
  const [preview, setPreview] = useState<number | null>(null);
  // The rendered width as a percent of the column. It is only for display; a drag or key press reads
  // the DOM again when it starts.
  const [natural, setNatural] = useState<number | undefined>(undefined);
  const anchorRef = useRef<HTMLDivElement>(null);
  const figureRef = useRef<HTMLElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);

  const src = resolved.status === "ready" ? resolved.url : undefined;
  const state = imageState(fields.url, resolved.status, src, failedUrl);
  const uploading = readOnly ? undefined : upload;
  const phase: ImagePhase = uploading?.status ?? state;
  const editable = !readOnly;
  const showReady = phase === "ready";

  const shownWidth = preview ?? fields.width;
  const openHref =
    src !== undefined && (isHttpFileUrl(src) || isRootRelativeFileUrl(src)) ? src : undefined;
  const readAnchor = (): HTMLElement | null => anchorRef.current;

  // The display value for a block with no width. It is measured after layout, when the image has loaded,
  // and again when the column resizes.
  useLayoutEffect(() => {
    if (fields.width !== undefined || !showReady) {
      return;
    }

    const measured = measuredPercent(anchorRef.current, figureRef.current);
    if (measured !== undefined) {
      setNatural(measured);
    }
  }, [fields.width, showReady]);

  useEffect(() => {
    const node = anchorRef.current;
    if (
      fields.width !== undefined ||
      !showReady ||
      node === null ||
      typeof ResizeObserver === "undefined"
    ) {
      return;
    }

    const observer = new ResizeObserver(() => {
      const measured = measuredPercent(node, figureRef.current);
      if (measured !== undefined) {
        setNatural(measured);
      }
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, [fields.width, showReady]);

  // Mouse-down selects the block, as a bookmark card does.
  useMediaCardSelect(cardRef, id, !readOnly && showReady);

  function openSource(): void {
    selectMediaBlock(editor, id);
    openMediaSource(editor, id);
  }

  function openActions(): void {
    selectMediaBlock(editor, id);
    openMediaActions(editor, id);
  }

  function embedLink(url: string): boolean {
    return runEditorCommand(editor, setImageSource, { id, file: { url } });
  }

  function writeWidth(width: number): void {
    runEditorCommand(editor, setImageWidth, { id, width });
  }

  function onCardClick(event: ReactMouseEvent<HTMLDivElement>): void {
    if (isControlTarget(event.target)) {
      return;
    }

    if ((event.metaKey || event.ctrlKey) && src !== undefined && isHttpFileUrl(src)) {
      event.preventDefault();
      window.open(src, "_blank", "noopener,noreferrer");
      return;
    }

    if (blockSelectionActive(editor)) {
      return;
    }

    openActions();
  }

  // A drag writes nothing until the pointer is up. Escape cancels it. Pointer up writes the last
  // preview when it differs from the stored width. No stored width counts as different.
  function endDrag(commit: boolean): void {
    const drag = dragRef.current;
    if (drag === null) {
      return;
    }

    dragRef.current = null;
    drag.detach();
    if (drag.target.hasPointerCapture(drag.pointerId)) {
      drag.target.releasePointerCapture(drag.pointerId);
    }
    setPreview(null);
    if (commit && drag.moved && drag.latest !== drag.stored) {
      writeWidth(drag.latest);
    }
  }

  function startDrag(side: "left" | "right", event: ReactPointerEvent<HTMLDivElement>): void {
    const columnPx = anchorRef.current?.getBoundingClientRect().width ?? 0;
    const start = fields.width ?? measuredPercent(anchorRef.current, figureRef.current);
    if (event.button !== 0 || dragRef.current !== null || !(columnPx > 0) || start === undefined) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const onKey = (keyEvent: KeyboardEvent): void => {
      if (keyEvent.key === "Escape") {
        keyEvent.preventDefault();
        endDrag(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    dragRef.current = {
      side,
      pointerId: event.pointerId,
      target: event.currentTarget,
      startX: event.clientX,
      columnPx,
      start,
      stored: fields.width,
      moved: false,
      align: fields.align,
      latest: start,
      detach: () => {
        window.removeEventListener("keydown", onKey, true);
      },
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: ReactPointerEvent<HTMLDivElement>): void {
    const drag = dragRef.current;
    if (drag === null || drag.pointerId !== event.pointerId) {
      return;
    }

    drag.latest = dragImageWidth({
      start: drag.start,
      deltaPx: event.clientX - drag.startX,
      columnPx: drag.columnPx,
      handle: drag.side,
      align: drag.align,
    });
    drag.moved = true;
    setPreview(drag.latest);
  }

  // A key starts from the stored width, or from the rendered width read now.
  function onHandleKey(event: ReactKeyboardEvent<HTMLDivElement>): void {
    if (onPopoverHistoryKey(editor, event)) {
      event.stopPropagation();
      return;
    }

    const base = fields.width ?? measuredPercent(anchorRef.current, figureRef.current);
    const next = base === undefined ? null : keyImageWidth(base, event.key, event.shiftKey);
    if (next === null || base === undefined) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    if (next !== base) {
      writeWidth(next);
    }
  }

  function renderHandle(side: "left" | "right") {
    return (
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize image"
        aria-valuenow={preview ?? fields.width ?? natural ?? IMAGE_WIDTH_MAX}
        aria-valuemin={IMAGE_WIDTH_MIN}
        aria-valuemax={IMAGE_WIDTH_MAX}
        tabIndex={0}
        data-image-resize={side}
        className={cn(
          "focus-visible:ring-ring/50 absolute top-1/2 h-12 w-1.5 -translate-y-1/2 cursor-col-resize touch-none rounded-full bg-black/40 focus-visible:ring-[3px] focus-visible:outline-none",
          side === "left" ? "left-2" : "right-2",
        )}
        onPointerDown={(event) => {
          startDrag(side, event);
        }}
        onPointerMove={moveDrag}
        onPointerUp={(event) => {
          if (dragRef.current?.pointerId === event.pointerId) {
            endDrag(true);
          }
        }}
        onPointerCancel={() => {
          endDrag(false);
        }}
        onLostPointerCapture={() => {
          endDrag(false);
        }}
        onKeyDown={onHandleKey}
      />
    );
  }

  let body: ReactNode;
  if (uploading?.status === "uploading") {
    body = (
      <MediaUploadingRow
        name={uploading.name}
        size={uploading.size}
        progress={uploading.progress}
        onCancel={() => {
          controller?.cancel(id);
        }}
      />
    );
  } else if (uploading?.status === "failed") {
    body = (
      <MediaFailedRow
        message={uploading.message}
        onRetry={() => {
          controller?.retry(id);
        }}
        onRemove={() => {
          runEditorCommand(editor, removeImage, { id });
        }}
      />
    );
  } else if (state === "empty") {
    body = (
      <MediaPlaceholderRow
        label="Add an image"
        icon={<ImageIcon aria-hidden="true" className={MEDIA_ICON_CLASS} />}
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
    body = editable ? (
      <div className="flex flex-col gap-2">
        <ImageUnavailableRow name={fields.name} />
        <div className="flex">
          <EditorTextButton
            label="Replace"
            icon={<RefreshCw aria-hidden="true" />}
            onClick={openSource}
          />
        </div>
      </div>
    ) : (
      <ImageUnavailableRow name={fields.name} />
    );
  } else {
    const captionNode = readOnly ? (
      fields.caption === undefined ? null : (
        <figcaption className={IMAGE_CAPTION_CLASS}>{fields.caption}</figcaption>
      )
    ) : fields.caption !== undefined || captionOpen ? (
      <CaptionField
        key={fields.caption ?? ""}
        id={id}
        caption={fields.caption}
        autoFocus={captionOpen}
        onSettled={() => {
          setCaptionOpen(false);
        }}
      />
    ) : null;

    const handles =
      editable && selected && showReady ? (
        <>
          {renderHandle("left")}
          {renderHandle("right")}
        </>
      ) : null;

    const figure = (
      <ImageFigure
        fields={fields}
        width={shownWidth}
        src={src ?? ""}
        figureRef={figureRef}
        onLoad={() => {
          const measured = measuredPercent(anchorRef.current, figureRef.current);
          if (measured !== undefined) {
            setNatural(measured);
          }
        }}
        onError={() => {
          setFailedUrl(src);
        }}
        handles={handles}
        caption={captionNode}
      />
    );
    body = editable ? (
      <div ref={cardRef} data-image-card="" onClick={onCardClick}>
        {figure}
      </div>
    ) : (
      figure
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
        data-image-state={phase}
        className="relative"
      >
        {body}
        {editable ? (
          <>
            <ImageToolbarPopover
              id={id}
              align={fields.align}
              openHref={openHref}
              readAnchor={readAnchor}
              onCaption={() => {
                setCaptionOpen(true);
              }}
              onReplace={openSource}
            />
            <MediaSourcePopover
              blockId={id}
              config={IMAGE_SOURCE_CONFIG}
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

// The caption is the input restyled as text. It commits on blur and on Enter, and Escape restores
// the stored caption. Keys typed here never reach the editor.
function CaptionField({
  id,
  caption,
  autoFocus,
  onSettled,
}: {
  id: string;
  caption: string | undefined;
  autoFocus: boolean;
  onSettled: () => void;
}) {
  const editor = useEditorRef();
  return (
    <MediaTextInput
      label="Image caption"
      placeholder="Write a caption…"
      maxLength={IMAGE_CAPTION_MAX}
      initial={caption ?? ""}
      autoFocus={autoFocus}
      className="text-muted-foreground mt-2 h-auto border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
      normalize={(text) => cleanFileText(text, IMAGE_CAPTION_MAX) ?? ""}
      readStored={() => storedCaption(editor, id)}
      onCommit={(text) => {
        runEditorCommand(editor, setImageCaption, { id, caption: text });
      }}
      onSettled={onSettled}
    />
  );
}

function ImageFigure({
  fields,
  width,
  src,
  figureRef,
  onLoad,
  onError,
  handles,
  caption,
}: {
  fields: ImageFields;
  width: number | undefined;
  src: string;
  figureRef: RefObject<HTMLElement | null>;
  onLoad: () => void;
  onError: () => void;
  handles: ReactNode;
  caption: ReactNode;
}) {
  // Caption, then name, is the alt text. An empty alt is allowed for a decorative image.
  const alt = fields.caption ?? fields.name ?? "";
  return (
    <figure
      ref={figureRef}
      className={imageFigureClassName(width, fields.align)}
      style={imageFigureStyle(width)}
    >
      <div className="relative">
        {/* eslint-disable-next-line @next/next/no-img-element -- stored or resolved image url, loaded without next/image */}
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          draggable={false}
          referrerPolicy="no-referrer"
          className={imageMediaClassName(width)}
          onLoad={onLoad}
          onError={onError}
        />
        {handles}
      </div>
      {caption}
    </figure>
  );
}
