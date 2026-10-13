import {
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { SquarePlay } from "lucide-react";
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

import { runEditorCommand } from "../../lib/commands/editor-commands";
import { cleanEmbedFields } from "../../lib/features/editor-embed";
import { setEmbedCaption, setEmbedWidth } from "../../lib/features/editor-embed-commands";
import {
  EMBED_IFRAME_ALLOW,
  EMBED_SANDBOX,
  embedFrameSrc,
  embedTitle,
  isYouTubeShort,
} from "../../lib/features/editor-embed-url";
import { MEDIA_WIDTH_MAX } from "../../lib/features/editor-media-layout";
import { blockSelectionActive } from "../../lib/plugins/editor-block-selection";
import {
  openMediaActions,
  openMediaSource,
  selectMediaBlock,
} from "../../lib/plugins/editor-media-ui";
import { EmbedActionPopover } from "../ui/embed-action-popover";
import { EmbedLinkPopover } from "../ui/embed-link-popover";
import { IMAGE_CAPTION_CLASS, imageFigureClassName, imageFigureStyle } from "./image-classes";
import { MEDIA_ICON_CLASS, mediaBlockClassName } from "./media-classes";
import {
  isControlTarget,
  useMediaActionsOpen,
  useMediaCardSelect,
  useMediaHover,
} from "./media-card";
import { MediaCaptionField } from "./media-caption";
import { MediaPlaceholderRow } from "./media-rows";
import { MediaResizeHandles, useNaturalMediaPercent } from "./media-resize";

// A short YouTube link is a vertical video. Its box is 9:16, and no taller than 560px.
const SHORT_BOX_STYLE: CSSProperties = {
  aspectRatio: "9 / 16",
  width: "min(100%, calc(min(560px, 70vh) * 9 / 16))",
};

// The embed block. It is one iframe, built from the provider, the video id, the Vimeo hash and the start
// time, so the stored link never reaches the frame. The frame loads with the block.
export function EmbedElement(props: PlateElementProps) {
  const editor = useEditorRef();
  const element = useElement();
  const readOnly = useReadOnly();
  const selected = useSelected();
  const focused = useFocused();
  const { fields } = cleanEmbedFields(element);
  const id = typeof element.id === "string" ? element.id : "";
  const [captionOpen, setCaptionOpen] = useState(false);
  const [preview, setPreview] = useState<number | null>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const figureRef = useRef<HTMLElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const editable = !readOnly;
  const provider = fields.provider;
  const videoId = fields.videoId;
  const ready = provider !== undefined && videoId !== undefined;
  const short = provider === "youtube" && fields.url !== undefined && isYouTubeShort(fields.url);
  const boxWidth = preview ?? fields.width ?? 100;
  const readAnchor = (): HTMLElement | null => anchorRef.current;

  // The rendered width is measured once the box exists, for a block with no stored width.
  const { natural } = useNaturalMediaPercent(
    anchorRef,
    figureRef,
    fields.width === undefined && ready,
  );

  // Mouse-down on the padding around the box selects the block. Hovering the block opens its toolbar.
  useMediaCardSelect(cardRef, id, editable && ready);
  const { open: actionsOpen } = useMediaActionsOpen(id);
  useMediaHover(anchorRef, id, editable && ready && !captionOpen);

  function openSource(): void {
    selectMediaBlock(editor, id);
    openMediaSource(editor, id);
  }

  function openActions(): void {
    selectMediaBlock(editor, id);
    openMediaActions(editor, id);
  }

  // A click on the block outside the frame opens its actions, as a click on the image does.
  function onCardClick(event: ReactMouseEvent<HTMLDivElement>): void {
    if (isControlTarget(event.target) || blockSelectionActive(editor)) {
      return;
    }

    openActions();
  }

  function writeWidth(width: number): void {
    runEditorCommand(editor, setEmbedWidth, { id, width });
  }

  const embedIcon = <SquarePlay aria-hidden="true" className={MEDIA_ICON_CLASS} />;

  let body: ReactNode;
  if (provider === undefined || videoId === undefined) {
    body = (
      <MediaPlaceholderRow
        label="Embed a video"
        icon={embedIcon}
        interactive={editable}
        onActivate={openSource}
      />
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
        label="Embed caption"
        caption={fields.caption}
        autoFocus={captionOpen}
        onSettled={() => {
          setCaptionOpen(false);
        }}
        onCommit={(text) => {
          runEditorCommand(editor, setEmbedCaption, { id, caption: text });
        }}
      />
    ) : null;

    const handles =
      editable && (selected || actionsOpen) ? (
        <MediaResizeHandles
          kind="embed"
          label="Resize embed"
          width={fields.width}
          align={fields.align}
          value={preview ?? fields.width ?? natural ?? MEDIA_WIDTH_MAX}
          anchorRef={anchorRef}
          figureRef={figureRef}
          onPreview={setPreview}
          onCommit={writeWidth}
        />
      ) : null;

    // Read-only has no actions, so the original link is shown under the caption.
    const openOriginal =
      readOnly && fields.url !== undefined ? (
        <a
          href={fields.url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="text-muted-foreground mt-2 self-start text-xs underline-offset-4 hover:underline"
        >
          Open original
        </a>
      ) : null;

    const figure = (
      <figure
        ref={figureRef}
        className={imageFigureClassName(boxWidth, fields.align)}
        style={imageFigureStyle(boxWidth)}
      >
        <div className="relative">
          <div
            className={cn(
              "bg-muted relative overflow-hidden rounded-md",
              short ? "mx-auto" : "aspect-video w-full",
            )}
            style={short ? SHORT_BOX_STYLE : undefined}
          >
            <iframe
              src={embedFrameSrc(
                { provider, videoId, hash: fields.hash, startSeconds: fields.startSeconds },
                false,
              )}
              title={embedTitle(provider)}
              allow={EMBED_IFRAME_ALLOW}
              sandbox={EMBED_SANDBOX}
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
              loading="lazy"
              data-embed-frame=""
              className="absolute inset-0 size-full border-0"
            />
          </div>
          {handles}
        </div>
        {captionNode}
        {openOriginal}
      </figure>
    );
    // The provider's frame takes the pointer, so the page gets no events over it. This strip under the frame
    // can be hovered and clicked. It is positioned below the card, so the block's box is not made taller.
    body = editable ? (
      <div ref={cardRef} data-embed-card="" className="relative" onClick={onCardClick}>
        {figure}
        <div data-embed-strip="" aria-hidden="true" className="absolute inset-x-0 top-full h-2" />
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
        data-embed-state={ready ? "ready" : "empty"}
        className="relative"
      >
        {body}
        {editable ? (
          <>
            <EmbedActionPopover
              id={id}
              align={fields.align}
              width={fields.width}
              href={fields.url}
              readAnchor={readAnchor}
              onCaption={() => {
                setCaptionOpen(true);
              }}
              onReplace={openSource}
            />
            <EmbedLinkPopover blockId={id} readAnchor={readAnchor} />
          </>
        ) : null}
      </div>
      {props.children}
    </PlateElement>
  );
}
