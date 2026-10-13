import {
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { Image as ImageIcon, RefreshCw } from "lucide-react";
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
  IMAGE_WIDTH_MAX,
  cleanImageFields,
  type ImageFields,
} from "../../lib/features/editor-image";
import {
  removeImage,
  setImageCaption,
  setImageSource,
  setImageWidth,
} from "../../lib/features/editor-image-commands";
import { isHttpFileUrl, isRootRelativeFileUrl } from "../../lib/features/editor-file-url";
import { blockSelectionActive } from "../../lib/plugins/editor-block-selection";
import {
  isControlTarget,
  useMediaActionsOpen,
  useMediaCardSelect,
  useMediaHover,
} from "./media-card";
import { MediaCaptionField } from "./media-caption";
import { MediaResizeHandles, useNaturalMediaPercent } from "./media-resize";
import { mediaResolveState, type MediaState } from "./media-state";
import {
  openMediaActions,
  openMediaSource,
  selectMediaBlock,
} from "../../lib/plugins/editor-media-ui";
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
import { EditorTextButton } from "../ui/block-toolbar";
import { ImageToolbarPopover } from "../ui/image-toolbar-popover";
import { MediaSourcePopover, type MediaSourceConfig } from "../ui/media-source-popover";
import { MEDIA_ICON_CLASS, mediaBlockClassName } from "./media-classes";
import { MediaFailedRow, MediaPlaceholderRow, MediaUploadingRow } from "./media-rows";
import { useResolvedFileUrl, useUploadController, useUploadState } from "./file-upload-scope";

export type ImageState = MediaState;

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
  const anchorRef = useRef<HTMLDivElement>(null);
  const figureRef = useRef<HTMLElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const src = resolved.status === "ready" ? resolved.url : undefined;
  const state = mediaResolveState(fields.url, resolved.status, src, failedUrl);
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
  const { natural, remeasure } = useNaturalMediaPercent(
    anchorRef,
    figureRef,
    fields.width === undefined && showReady,
  );

  // Mouse-down selects the block, as a bookmark card does. Hovering it opens its toolbar.
  useMediaCardSelect(cardRef, id, !readOnly && showReady);
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
      <MediaCaptionField
        key={fields.caption ?? ""}
        id={id}
        label="Image caption"
        caption={fields.caption}
        autoFocus={captionOpen}
        onSettled={() => {
          setCaptionOpen(false);
        }}
        onCommit={(text) => {
          runEditorCommand(editor, setImageCaption, { id, caption: text });
        }}
      />
    ) : null;

    const handles =
      editable && (selected || actionsOpen) && showReady ? (
        <MediaResizeHandles
          kind="image"
          label="Resize image"
          width={fields.width}
          align={fields.align}
          value={preview ?? fields.width ?? natural ?? IMAGE_WIDTH_MAX}
          anchorRef={anchorRef}
          figureRef={figureRef}
          onPreview={setPreview}
          onCommit={writeWidth}
        />
      ) : null;

    const figure = (
      <ImageFigure
        fields={fields}
        width={shownWidth}
        src={src ?? ""}
        figureRef={figureRef}
        onLoad={remeasure}
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
    <PlateElement {...props} className={mediaBlockClassName(selected, focused, readOnly)}>
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
              width={fields.width}
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
