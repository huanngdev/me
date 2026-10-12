import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Ellipsis, Play, SquarePlay } from "lucide-react";
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
  embedProviderLabel,
  embedTitle,
  isYouTubeShort,
} from "../../lib/features/editor-embed-url";
import { MEDIA_WIDTH_MAX } from "../../lib/features/editor-media-layout";
import {
  openMediaActions,
  openMediaSource,
  selectMediaBlock,
} from "../../lib/plugins/editor-media-ui";
import { EditorIconButton, EditorTextButton } from "../ui/block-toolbar";
import { EmbedActionPopover } from "../ui/embed-action-popover";
import { EmbedLinkPopover } from "../ui/embed-link-popover";
import { hrElementClassName } from "./hr-element";
import { IMAGE_CAPTION_CLASS, imageFigureClassName, imageFigureStyle } from "./image-classes";
import { MEDIA_ICON_CLASS } from "./media-classes";
import { onPlayerClick, onPlayerKeyDown, onPlayerKeyUp, useMediaCardSelect } from "./media-card";
import { MediaCaptionField } from "./media-caption";
import { MediaPlaceholderRow } from "./media-rows";
import { MediaResizeHandles, useNaturalMediaPercent } from "./media-resize";

// A short YouTube link is a vertical video. Its box is 9:16, and no taller than 560px.
const SHORT_BOX_STYLE: CSSProperties = {
  aspectRatio: "9 / 16",
  width: "min(100%, calc(min(560px, 70vh) * 9 / 16))",
};

// The embed block. Before the click it is a facade with the provider's name and a Load button, so no
// request reaches YouTube or Vimeo. After the click it is one iframe. The loaded state is local view
// state, kept for one source, so a new link shows the facade again.
export function EmbedElement(props: PlateElementProps) {
  const editor = useEditorRef();
  const element = useElement();
  const readOnly = useReadOnly();
  const selected = useSelected();
  const focused = useFocused();
  const { fields } = cleanEmbedFields(element);
  const id = typeof element.id === "string" ? element.id : "";
  const [loadedKey, setLoadedKey] = useState<string | undefined>(undefined);
  const [captionOpen, setCaptionOpen] = useState(false);
  const [preview, setPreview] = useState<number | null>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const figureRef = useRef<HTMLElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  // Set by Load. Once the frame exists, a read-only block moves focus to it, so the keyboard reaches the player.
  const focusFrame = useRef(false);

  const editable = !readOnly;
  const provider = fields.provider;
  const videoId = fields.videoId;
  const ready = provider !== undefined && videoId !== undefined;
  const sourceKey = [provider, videoId, fields.hash, fields.startSeconds, fields.url].join("|");
  const loaded = ready && loadedKey === sourceKey;
  const short = provider === "youtube" && fields.url !== undefined && isYouTubeShort(fields.url);
  const boxWidth = preview ?? fields.width ?? 100;
  const readAnchor = (): HTMLElement | null => anchorRef.current;

  useEffect(() => {
    if (loaded && focusFrame.current) {
      focusFrame.current = false;
      frameRef.current?.focus();
    }
  }, [loaded]);

  // The rendered width is measured once the box exists, for a block with no stored width.
  const { natural } = useNaturalMediaPercent(
    anchorRef,
    figureRef,
    fields.width === undefined && ready,
  );

  // Mouse-down on the padding around the box selects the block. The facade button and the frame are controls.
  useMediaCardSelect(cardRef, id, editable && ready);

  function openSource(): void {
    selectMediaBlock(editor, id);
    openMediaSource(editor, id);
  }

  function openActions(): void {
    selectMediaBlock(editor, id);
    openMediaActions(editor, id);
  }

  function writeWidth(width: number): void {
    runEditorCommand(editor, setEmbedWidth, { id, width });
  }

  const embedIcon = <SquarePlay aria-hidden="true" className={MEDIA_ICON_CLASS} />;
  // The More button sits over the top-right corner, always visible in an editable editor.
  const moreButton = editable ? (
    <div className="bg-background/80 absolute top-2 right-2 rounded-md">
      <EditorIconButton
        variant="ghost"
        label="Embed actions"
        icon={<Ellipsis aria-hidden="true" />}
        data-embed-more=""
        onClick={openActions}
      />
    </div>
  ) : null;

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
    const providerName = embedProviderLabel(provider);
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
      editable && selected ? (
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

    // Read-only has no More button, so the original link is shown under the caption.
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
            {loaded ? (
              <iframe
                ref={frameRef}
                src={embedFrameSrc(
                  { provider, videoId, hash: fields.hash, startSeconds: fields.startSeconds },
                  true,
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
            ) : (
              <div
                data-embed-facade=""
                className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-sm"
              >
                <span className="text-muted-foreground">{providerName}</span>
                <EditorTextButton
                  label={`Load ${providerName} video`}
                  variant="outline"
                  icon={<Play aria-hidden="true" />}
                  data-embed-load=""
                  onClick={(event) => {
                    onPlayerClick(event);
                    focusFrame.current = readOnly;
                    // The button leaves the page when the frame appears. In edit mode the editor takes focus instead.
                    if (editable) {
                      editor.tf.focus();
                    }
                    setLoadedKey(sourceKey);
                  }}
                  onKeyDown={(event) => {
                    onPlayerKeyDown(editor, event);
                  }}
                  onKeyUp={onPlayerKeyUp}
                />
              </div>
            )}
          </div>
          {moreButton}
          {handles}
        </div>
        {captionNode}
        {openOriginal}
      </figure>
    );
    body = editable ? (
      <div ref={cardRef} data-embed-card="">
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
        data-embed-state={!ready ? "empty" : loaded ? "loaded" : "facade"}
        className="relative"
      >
        {body}
        {editable ? (
          <>
            <EmbedActionPopover
              id={id}
              align={fields.align}
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
