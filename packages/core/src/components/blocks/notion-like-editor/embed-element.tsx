import { useEffect, useRef, useState } from "react";
import { Caption, CaptionTextarea } from "@platejs/caption/react";
import { ExternalLink, Play, Trash2 } from "lucide-react";
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

import { runEditorCommand } from "./editor-commands";
import { convertEmbedToText, removeEmbed } from "./editor-embed";
import {
  EMBED_IFRAME_ALLOW,
  EMBED_SANDBOX,
  embedFrameSrc,
  embedProviderLabel,
  embedTitle,
  isYouTubeShort,
  type EmbedProvider,
} from "./editor-embed-url";
import { hrElementClassName } from "./hr-element";
import {
  MEDIA_TOOLBAR_CLASS,
  MediaCaptionButton,
  MediaIconButton,
  mediaCaptionText,
  mediaStringAttr,
  useFacadeIsolation,
  useIsolatedMediaTarget,
} from "./media-element-parts";

export function EmbedElement(props: PlateElementProps) {
  const element = useElement();
  const readOnly = useReadOnly();
  const selected = useSelected();
  const focused = useFocused();
  const provider = mediaProvider(element.provider);
  const videoId = mediaStringAttr(element, "videoId");
  const hash = mediaStringAttr(element, "hash");
  const sourceUrl = mediaStringAttr(element, "sourceUrl");
  const startSeconds = mediaStart(element.startSeconds);
  const [active, setActive] = useState(false);
  const frame = useRef<HTMLElement>(null);
  const iframe = useRef<HTMLIFrameElement>(null);
  const title = provider === undefined ? "Video" : embedTitle(provider);
  const short = provider === "youtube" && sourceUrl !== undefined && isYouTubeShort(sourceUrl);
  const showFrame = provider !== undefined && videoId !== undefined && sourceUrl !== undefined;

  useFacadeIsolation(frame);
  useIsolatedMediaTarget(iframe, active);
  useEmbedFrameFocus(iframe, active);

  return (
    <PlateElement
      {...props}
      className={cn("group relative py-2", hrElementClassName(selected, focused, readOnly))}
    >
      <figure
        ref={frame}
        contentEditable={false}
        data-embed-state={active ? "playing" : "facade"}
        className="relative mx-auto w-full max-w-full"
      >
        {showFrame ? (
          <div
            className={cn(
              "bg-muted relative z-0 mx-auto overflow-hidden",
              short ? "w-auto max-w-full" : "w-full",
            )}
            style={
              short
                ? { aspectRatio: "9 / 16", height: "70vh", maxHeight: "70vh" }
                : { aspectRatio: "16 / 9", width: "100%" }
            }
          >
            {active ? (
              <iframe
                ref={iframe}
                title={title}
                src={embedFrameSrc({ provider, videoId, hash, startSeconds }, true)}
                loading="lazy"
                allow={EMBED_IFRAME_ALLOW}
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
                sandbox={EMBED_SANDBOX}
                className="absolute inset-0 h-full w-full border-0"
              />
            ) : (
              <EmbedFacade
                provider={provider}
                title={title}
                onActivate={() => {
                  setActive(true);
                }}
              />
            )}
          </div>
        ) : null}
        {sourceUrl !== undefined ? (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground mt-2 inline-flex text-sm underline underline-offset-4"
          >
            Open original
          </a>
        ) : null}
        {showFrame && !readOnly ? (
          <EmbedToolbar
            id={typeof element.id === "string" ? element.id : ""}
            sourceUrl={sourceUrl}
          />
        ) : null}
        {showFrame || mediaCaptionText(element).length > 0 ? (
          <Caption>
            <CaptionTextarea placeholder="Write a caption…" />
          </Caption>
        ) : null}
      </figure>
      {props.children}
    </PlateElement>
  );
}

function EmbedFacade({
  provider,
  title,
  onActivate,
}: {
  provider: EmbedProvider;
  title: string;
  onActivate: () => void;
}) {
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const node = button.current;
    if (!node) {
      return;
    }

    const onClick = (): void => {
      onActivate();
    };
    node.addEventListener("click", onClick);
    return () => {
      node.removeEventListener("click", onClick);
    };
  }, [onActivate]);

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
      <button
        ref={button}
        type="button"
        aria-label={`Play ${title}`}
        className="bg-background text-foreground inline-flex size-11 items-center justify-center rounded-full"
      >
        <Play aria-hidden className="size-5" />
      </button>
      <p className="text-foreground text-sm">{title}</p>
      <p className="text-muted-foreground text-xs">{embedProviderLabel(provider)}</p>
    </div>
  );
}

function EmbedToolbar({ id, sourceUrl }: { id: string; sourceUrl: string | undefined }) {
  const editor = useEditorRef();
  const selected = useSelected();

  return (
    <div
      data-embed-toolbar=""
      className={cn(MEDIA_TOOLBAR_CLASS, selected && "pointer-events-auto opacity-100")}
    >
      <MediaCaptionButton />
      {sourceUrl !== undefined ? (
        <a
          href={sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open original"
          className="text-foreground hover:bg-muted inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs"
        >
          <ExternalLink aria-hidden className="size-4" />
          Open original
        </a>
      ) : null}
      <MediaIconButton
        label="Convert to text"
        onClick={(current) => {
          runEditorCommand(current, convertEmbedToText, id);
        }}
      >
        Convert to text
      </MediaIconButton>
      <MediaIconButton
        label="Remove"
        onClick={() => {
          runEditorCommand(editor, removeEmbed, id);
        }}
      >
        <Trash2 aria-hidden className="size-4" />
      </MediaIconButton>
    </div>
  );
}

// Chrome's sequential Tab skips an iframe inside contenteditable in one direction.
// Activation focuses the player. While it is mounted, Tab from the control before it
// and Shift+Tab from the control after it move into the iframe. Keys from inside the
// player stay with the browser, which is what leaves the iframe again.
function useEmbedFrameFocus(
  iframeRef: { current: HTMLIFrameElement | null },
  active: boolean,
): void {
  useEffect(() => {
    if (!active) {
      return;
    }

    iframeRef.current?.focus({ preventScroll: true });
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Tab" || event.altKey || event.metaKey || event.ctrlKey) {
        return;
      }

      const frame = iframeRef.current;
      const current = document.activeElement;
      if (
        !(frame instanceof HTMLIFrameElement) ||
        !(current instanceof HTMLElement) ||
        current === frame
      ) {
        return;
      }

      const stops = tabStopsExcept(frame);
      const index = stops.indexOf(current);
      const neighbor = event.shiftKey ? stops[index - 1] : stops[index + 1];
      if (index < 0 || !(neighbor instanceof HTMLElement) || !straddles(current, frame, neighbor)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      frame.focus({ preventScroll: true });
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [active, iframeRef]);
}

function tabStopsExcept(frame: HTMLElement): HTMLElement[] {
  const stops: HTMLElement[] = [];
  for (const node of document.querySelectorAll(
    "a[href], button, textarea, input, select, iframe",
  )) {
    if (
      node instanceof HTMLElement &&
      node !== frame &&
      node.tabIndex >= 0 &&
      !node.hasAttribute("disabled")
    ) {
      stops.push(node);
    }
  }
  return stops;
}

function straddles(current: HTMLElement, frame: HTMLElement, neighbor: HTMLElement): boolean {
  const following = Node.DOCUMENT_POSITION_FOLLOWING;
  const after = (left: HTMLElement, right: HTMLElement): boolean =>
    (left.compareDocumentPosition(right) & following) !== 0;
  const forward = after(current, frame) && after(frame, neighbor);
  const backward = after(neighbor, frame) && after(frame, current);
  return forward || backward;
}

function mediaProvider(value: unknown): EmbedProvider | undefined {
  return value === "youtube" || value === "vimeo" ? value : undefined;
}

function mediaStart(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}
