import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { ExternalLink, RefreshCw, Trash2, Type } from "lucide-react";
import {
  PlateElement,
  useEditorRef,
  useElement,
  useFocused,
  useReadOnly,
  useSelected,
  type PlateElementProps,
} from "platejs/react";

import { Button } from "@/components/button";
import { cn } from "@/lib/utils";

import {
  applyBookmarkPreview,
  convertBookmarkToText,
  removeBookmark,
} from "../../lib/features/editor-bookmark";
import { bookmarkDomain, type LinkPreviewAdapter } from "../../lib/features/editor-bookmark-url";
import { runEditorCommand } from "../../lib/commands/editor-commands";
import { hrElementClassName } from "./hr-element";
import {
  MEDIA_TOOLBAR_CLASS,
  EditorIconButton,
  EditorTextButton,
  editorControlLabel,
  mediaStringAttr,
  keepMediaSelection,
} from "../ui/block-toolbar";

export const BOOKMARK_PREVIEW_TIMEOUT_MS = 5000;
// One rounded card: the preview image fills the left ~27% at the card's full
// height; the text column fills the rest. Below 26rem of card width the image
// is hidden and the text takes the full width, so the card never overflows.
export const BOOKMARK_CARD_CLASS =
  "@container/card border-border bg-background flex h-[150px] w-full min-w-0 overflow-hidden rounded-xl border";

const LinkPreviewContext = createContext<LinkPreviewAdapter | null>(null);

let previewTimeoutMs = BOOKMARK_PREVIEW_TIMEOUT_MS;

export function setBookmarkPreviewTimeoutMs(ms: number): () => void {
  const previous = previewTimeoutMs;
  previewTimeoutMs = ms;
  return () => {
    previewTimeoutMs = previous;
  };
}

export function LinkPreviewProvider({
  adapter,
  children,
}: {
  adapter: LinkPreviewAdapter | null;
  children: ReactNode;
}) {
  return <LinkPreviewContext.Provider value={adapter}>{children}</LinkPreviewContext.Provider>;
}

type BookmarkPhase = "loading" | "ready" | "fallback" | "unavailable";

export function BookmarkElement(props: PlateElementProps) {
  const editor = useEditorRef();
  const element = useElement();
  const readOnly = useReadOnly();
  const selected = useSelected();
  const focused = useFocused();
  const adapter = useContext(LinkPreviewContext);
  const id = typeof element.id === "string" ? element.id : "";
  const url = mediaStringAttr(element, "url") ?? "";
  const title = mediaStringAttr(element, "title");
  const description = mediaStringAttr(element, "description");
  const imageUrl = mediaStringAttr(element, "imageUrl");
  const fetchedAt = mediaStringAttr(element, "fetchedAt");
  const domain = bookmarkDomain(url);
  const heading = title ?? domain;
  const storedAt = useRef(fetchedAt);
  const cardRef = useRef<HTMLDivElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [phase, setPhase] = useState<BookmarkPhase>(
    fetchedAt !== undefined ? "ready" : adapter ? "loading" : "fallback",
  );

  useEffect(() => {
    storedAt.current = fetchedAt;
  }, [fetchedAt]);

  useEffect(() => {
    if (adapter === null || url.length === 0 || id.length === 0) {
      return;
    }

    if (storedAt.current !== undefined && attempt === 0) {
      return;
    }

    const controller = new AbortController();
    let active = true;
    setPhase("loading");

    const finish = (next: BookmarkPhase): void => {
      if (!active) {
        return;
      }

      setPhase(next);
    };

    const timer = setTimeout(() => {
      controller.abort();
    }, previewTimeoutMs);
    controller.signal.addEventListener("abort", () => {
      clearTimeout(timer);
      finish("unavailable");
    });

    void adapter
      .fetchPreview(url, controller.signal)
      .then((preview) => {
        if (!active) {
          return;
        }

        clearTimeout(timer);
        if (controller.signal.aborted) {
          finish("unavailable");
          return;
        }
        if (preview === null) {
          finish("fallback");
          return;
        }

        const wrote = applyBookmarkPreview(editor, id, url, preview);
        finish(wrote ? "ready" : "unavailable");
      })
      .catch(() => {
        if (!active) {
          return;
        }

        clearTimeout(timer);
        finish("unavailable");
      });

    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [adapter, attempt, editor, id, url]);

  useEffect(() => {
    const node = cardRef.current;
    if (!node || readOnly) {
      return;
    }

    const onMouseDown = (event: MouseEvent): void => {
      if (event.button !== 0) {
        return;
      }

      const target = event.target;
      if (target instanceof Element && target.closest("a, button")) {
        return;
      }

      const path = editor.api.findPath(element);
      if (path) {
        editor.tf.select(path);
      }
    };
    node.addEventListener("mousedown", onMouseDown);
    return () => {
      node.removeEventListener("mousedown", onMouseDown);
    };
  }, [editor, element, readOnly]);

  const body = (
    <BookmarkBody
      description={description}
      heading={heading}
      imageUrl={phase === "loading" ? undefined : imageUrl}
      loading={phase === "loading"}
      unavailable={phase === "unavailable"}
      url={url}
    />
  );

  return (
    <PlateElement
      {...props}
      className={cn("group relative py-1", hrElementClassName(selected, focused, readOnly))}
    >
      <div className="relative" contentEditable={false}>
        {readOnly ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            data-bookmark-card=""
            data-bookmark-status={phase}
            data-bookmark-url={url}
            className={cn(
              BOOKMARK_CARD_CLASS,
              "text-foreground no-underline",
              hrElementClassName(selected, focused, readOnly),
            )}
          >
            {body}
          </a>
        ) : (
          <div
            ref={cardRef}
            data-bookmark-card=""
            data-bookmark-status={phase}
            data-bookmark-url={url}
            className={cn(BOOKMARK_CARD_CLASS, hrElementClassName(selected, focused, readOnly))}
          >
            {body}
          </div>
        )}
        {readOnly ? null : (
          <BookmarkToolbar
            id={id}
            showRefresh={adapter !== null}
            url={url}
            onRefresh={() => {
              setAttempt((current) => current + 1);
            }}
          />
        )}
      </div>
      {props.children}
    </PlateElement>
  );
}

function BookmarkBody({
  description,
  heading,
  imageUrl,
  loading,
  unavailable,
  url,
}: {
  description: string | undefined;
  heading: string;
  imageUrl: string | undefined;
  loading: boolean;
  unavailable: boolean;
  url: string;
}) {
  if (loading) {
    return <div data-bookmark-skeleton="" className="bg-muted h-[150px] w-full rounded-xl" />;
  }

  return (
    <>
      <BookmarkThumbnail imageUrl={imageUrl} />
      <div className="flex min-w-0 flex-1 flex-col p-4">
        <p className="text-foreground min-w-0 truncate text-base font-semibold">{heading}</p>
        {description !== undefined ? (
          <p className="text-muted-foreground mt-1 line-clamp-2 min-w-0 text-sm">{description}</p>
        ) : null}
        {/* The URL always sits at the bottom of the card. */}
        <p className="text-muted-foreground mt-auto min-w-0 truncate pt-3 text-sm">{url}</p>
        {unavailable ? (
          <p data-bookmark-unavailable="" className="text-muted-foreground mt-1 text-xs">
            Preview unavailable
          </p>
        ) : null}
      </div>
    </>
  );
}

function BookmarkThumbnail({ imageUrl }: { imageUrl: string | undefined }) {
  const [broken, setBroken] = useState(false);
  if (imageUrl === undefined || broken) {
    return null;
  }

  // Flush to the card's left/top/bottom edges; hidden below 26rem of card width.
  return (
    <div
      data-bookmark-thumbnail=""
      className="bg-muted hidden h-full w-[27%] shrink-0 overflow-hidden @[26rem]/card:block"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- remote or same-origin preview */}
      <img
        src={imageUrl}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        className="size-full object-cover"
        onError={() => {
          setBroken(true);
        }}
      />
    </div>
  );
}

function BookmarkToolbar({
  id,
  onRefresh,
  showRefresh,
  url,
}: {
  id: string;
  onRefresh: () => void;
  showRefresh: boolean;
  url: string;
}) {
  const editor = useEditorRef();
  const selected = useSelected();

  return (
    <div
      data-bookmark-toolbar=""
      className={cn(MEDIA_TOOLBAR_CLASS, selected && "pointer-events-auto opacity-100")}
    >
      <Button asChild variant="ghost" size="sm">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          aria-label="Open"
          onMouseDown={keepMediaSelection}
        >
          {editorControlLabel(<ExternalLink aria-hidden="true" />, "Open")}
        </a>
      </Button>
      {showRefresh ? (
        <EditorTextButton
          label="Refresh preview"
          icon={<RefreshCw aria-hidden="true" />}
          onClick={() => {
            onRefresh();
          }}
        />
      ) : null}
      <EditorTextButton
        label="Convert to text"
        icon={<Type aria-hidden="true" />}
        onClick={() => {
          runEditorCommand(editor, convertBookmarkToText, id);
        }}
      />
      <EditorIconButton
        variant="destructive"
        label="Delete"
        icon={<Trash2 aria-hidden="true" />}
        onClick={() => {
          runEditorCommand(editor, removeBookmark, id);
        }}
      />
    </div>
  );
}
