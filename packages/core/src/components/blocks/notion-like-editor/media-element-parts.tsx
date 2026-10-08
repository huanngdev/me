import { useEffect, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { showCaption } from "@platejs/caption/react";
import { AlignCenter, AlignLeft, AlignRight, Captions } from "lucide-react";
import type { TElement } from "platejs";
import { useEditorRef, useElement, usePluginOption, useReadOnly } from "platejs/react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/dropdown-menu";
import { cn } from "@/lib/utils";

export const MEDIA_TOOLBAR_CLASS =
  "absolute top-1 right-1 z-10 flex max-w-full flex-wrap gap-1 rounded-md border border-border bg-background p-1 opacity-0 pointer-events-none group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100";

export const mediaIconButtonClass =
  "text-foreground hover:bg-muted inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs";

export type MediaAlign = "left" | "right";

type MediaEditor = ReturnType<typeof useEditorRef>;

type RevisionPlugin = Parameters<typeof usePluginOption>[0];

export function keepMediaSelection(event: { preventDefault: () => void }): void {
  event.preventDefault();
}

export function MediaAlignMenu({
  label,
  align,
  onAlign,
}: {
  label: string;
  align: MediaAlign | undefined;
  onAlign: (editor: MediaEditor, align: MediaAlign | null) => void;
}) {
  const editor = useEditorRef();
  const current = align ?? "center";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={label}
        onMouseDown={keepMediaSelection}
        className={mediaIconButtonClass}
      >
        <MediaAlignIcon align={current} />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <MediaAlignItem align="left" editor={editor} onAlign={onAlign} />
        <MediaAlignItem align={null} editor={editor} onAlign={onAlign} />
        <MediaAlignItem align="right" editor={editor} onAlign={onAlign} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MediaAlignItem({
  align,
  editor,
  onAlign,
}: {
  align: MediaAlign | null;
  editor: MediaEditor;
  onAlign: (editor: MediaEditor, align: MediaAlign | null) => void;
}) {
  const label =
    align === "left" ? "Align left" : align === "right" ? "Align right" : "Align center";
  return (
    <DropdownMenuItem
      onMouseDown={keepMediaSelection}
      onSelect={() => {
        onAlign(editor, align);
      }}
    >
      <MediaAlignIcon align={align ?? "center"} />
      <span>{label}</span>
    </DropdownMenuItem>
  );
}

function MediaAlignIcon({ align }: { align: MediaAlign | "center" }) {
  const className = "size-4";
  if (align === "left") {
    return <AlignLeft aria-hidden className={className} />;
  }

  if (align === "right") {
    return <AlignRight aria-hidden className={className} />;
  }

  return <AlignCenter aria-hidden className={className} />;
}

export function MediaCaptionButton() {
  const editor = useEditorRef();
  const element = useElement();
  return (
    <button
      type="button"
      aria-label="Caption"
      className={mediaIconButtonClass}
      onMouseDown={keepMediaSelection}
      onClick={() => {
        showCaption(editor, element);
      }}
    >
      <Captions aria-hidden className="size-4" />
    </button>
  );
}

export function MediaFileButton({
  label,
  accept,
  icon,
  onFile,
}: {
  label: string;
  accept: string;
  icon?: ReactNode;
  onFile: (editor: MediaEditor, file: File) => void;
}) {
  const editor = useEditorRef();
  const inputId = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        aria-label={label}
        className={mediaIconButtonClass}
        onMouseDown={keepMediaSelection}
        onClick={() => {
          inputId.current?.click();
        }}
      >
        {icon}
        {label}
      </button>
      <input
        ref={inputId}
        type="file"
        accept={accept}
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.item(0);
          event.target.value = "";
          if (!file) {
            return;
          }

          onFile(editor, file);
        }}
      />
    </>
  );
}

export function MediaIconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: (editor: MediaEditor) => void;
  children: ReactNode;
}) {
  const editor = useEditorRef();
  return (
    <button
      type="button"
      aria-label={label}
      className={mediaIconButtonClass}
      onMouseDown={keepMediaSelection}
      onClick={() => {
        onClick(editor);
      }}
    >
      {children}
    </button>
  );
}

export function MediaNotice({
  message,
  retry,
  onRetry,
  onRemove,
  openUrl,
  download,
  children,
}: {
  message: string;
  retry: boolean;
  onRetry?: (editor: MediaEditor) => void;
  onRemove?: (editor: MediaEditor) => void;
  openUrl?: string;
  download?: { href: string; name: string };
  children?: ReactNode;
}) {
  const editor = useEditorRef();
  const readOnly = useReadOnly();
  return (
    <div className="border-border bg-muted text-foreground flex max-w-full flex-col gap-2 rounded-md border p-3 text-sm">
      <p className="break-all">{message}</p>
      {openUrl !== undefined ? (
        <a href={openUrl} target="_blank" rel="noopener noreferrer" className="underline">
          Open original
        </a>
      ) : null}
      {download !== undefined ? (
        <a href={download.href} download={download.name} className="underline">
          Download
        </a>
      ) : null}
      {readOnly ? null : (
        <div className="flex flex-wrap gap-2">
          {retry && onRetry ? (
            <button
              type="button"
              onMouseDown={keepMediaSelection}
              onClick={() => {
                onRetry(editor);
              }}
            >
              Retry
            </button>
          ) : null}
          {children}
          {onRemove ? (
            <button
              type="button"
              onMouseDown={keepMediaSelection}
              onClick={() => {
                onRemove(editor);
              }}
            >
              Remove
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}

export function MediaSkeleton({
  marker,
  ratio,
}: {
  marker: "image" | "video" | "audio";
  ratio: string | undefined;
}) {
  if (marker === "audio") {
    return <div data-audio-skeleton="" className="bg-muted h-14 w-full" />;
  }

  const style = { aspectRatio: ratio };
  if (marker === "image") {
    return <div data-image-skeleton="" className="bg-muted absolute inset-0" style={style} />;
  }

  return <div data-video-skeleton="" className="bg-muted absolute inset-0" style={style} />;
}

export function MediaResizeHandle({
  side,
  frame,
  storedWidth,
  previewWidth,
  setPreviewWidth,
  minWidth,
  maxWidth,
  label,
  step,
  clamp,
  commit,
}: {
  side: "left" | "right";
  frame: { current: HTMLElement | null };
  storedWidth: number | undefined;
  previewWidth: number | null;
  setPreviewWidth: (width: number | null) => void;
  minWidth: number;
  maxWidth: number;
  label: string;
  step: number;
  clamp: (width: number, containerWidth: number) => number;
  commit: (editor: MediaEditor, width: number | null) => void;
}) {
  const editor = useEditorRef();
  const current = previewWidth ?? storedWidth;
  const max = containerCap(frame.current, maxWidth);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-valuemin={minWidth}
      aria-valuemax={max}
      aria-valuenow={current ?? max}
      aria-label={label}
      tabIndex={0}
      contentEditable={false}
      className={cn(
        "absolute top-0 z-10 h-full w-2 cursor-col-resize",
        side === "left" ? "left-0" : "right-0",
      )}
      onPointerDown={(event) => {
        startResize(
          event,
          side,
          frame.current,
          storedWidth,
          minWidth,
          maxWidth,
          clamp,
          setPreviewWidth,
          (next) => {
            commit(editor, next);
          },
        );
      }}
      onDoubleClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        commit(editor, null);
      }}
      onKeyDown={(event) => {
        const delta = resizeDelta(event.key, step);
        if (delta === undefined) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        const start = measuredWidth(frame.current, storedWidth, minWidth);
        commit(editor, clamp(start + delta, containerCap(frame.current, maxWidth)));
      }}
    />
  );
}

export function MediaProgress({ onCancel }: { onCancel: (editor: MediaEditor) => void }) {
  const editor = useEditorRef();
  return (
    <div className="flex max-w-full flex-col gap-2">
      <div role="progressbar" className="bg-muted h-1 w-full overflow-hidden rounded-full">
        <div className="bg-foreground/40 h-full w-1/3 animate-pulse" />
      </div>
      <button
        type="button"
        onMouseDown={keepMediaSelection}
        onClick={() => {
          onCancel(editor);
        }}
      >
        Cancel
      </button>
    </div>
  );
}

export function useResolvedMedia(
  assetId: string | undefined,
  plugin: RevisionPlugin,
  resolve: (editor: MediaEditor, assetId: string) => void,
  cachedUrl: (editor: MediaEditor, assetId: string) => string | undefined,
  isMissing: (editor: MediaEditor, assetId: string) => boolean,
  isAdapter: (editor: MediaEditor, assetId: string) => boolean,
): { url?: string; missing: boolean; adapter: boolean } {
  "use no memo";
  // This hook is compiled on its own. The same external map has to be read on every revision.

  const editor = useEditorRef();
  const revision = usePluginOption(plugin, "revision");
  useEffect(() => {
    if (assetId !== undefined) {
      resolve(editor, assetId);
    }
  }, [assetId, editor, resolve, revision]);

  if (assetId === undefined) {
    return { missing: false, adapter: false };
  }

  return {
    url: cachedUrl(editor, assetId),
    missing: isMissing(editor, assetId),
    adapter: isAdapter(editor, assetId),
  };
}

export function useMediaUpload<T>(
  blockId: string,
  plugin: RevisionPlugin,
  read: (editor: MediaEditor, blockId: string) => T,
): T | undefined {
  "use no memo";
  // Upload status is plugin state, not a document change. A memoized read would skip failed and ready.

  const editor = useEditorRef();
  const revision = usePluginOption(plugin, "revision");
  void revision;
  return blockId.length === 0 ? undefined : read(editor, blockId);
}

export function mediaFrameState(state: {
  pending: boolean;
  failed: string | undefined;
  missing: boolean;
  failedUrl: boolean;
  showMedia: boolean;
  loaded: boolean;
}): string {
  if (state.pending || (state.showMedia && !state.loaded)) {
    return "loading";
  }

  if (state.failed !== undefined || state.missing || state.failedUrl) {
    return "error";
  }

  if (!state.showMedia) {
    return "empty";
  }

  return "ready";
}

export function mediaStringAttr(element: TElement, key: string): string | undefined {
  const value: unknown = Reflect.get(element, key);
  return typeof value === "string" ? value : undefined;
}

export function mediaPixelAttr(element: TElement, key: string): number | undefined {
  const value: unknown = Reflect.get(element, key);
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

export function mediaAlignAttr(element: TElement): MediaAlign | undefined {
  const value = mediaStringAttr(element, "align");
  return value === "left" || value === "right" ? value : undefined;
}

export function mediaCaptionText(element: TElement): string {
  const caption: unknown = Reflect.get(element, "caption");
  if (!Array.isArray(caption)) {
    return "";
  }

  const first: unknown = caption[0];
  if (typeof first !== "object" || first === null || !("text" in first)) {
    return "";
  }

  return typeof first.text === "string" ? first.text : "";
}

export function mediaRatio(
  width: number | undefined,
  height: number | undefined,
): string | undefined {
  if (width === undefined || height === undefined) {
    return undefined;
  }

  return `${String(width)} / ${String(height)}`;
}

function startResize(
  event: ReactPointerEvent<HTMLDivElement>,
  side: "left" | "right",
  frame: HTMLElement | null,
  storedWidth: number | undefined,
  minWidth: number,
  maxWidth: number,
  clamp: (width: number, containerWidth: number) => number,
  setPreviewWidth: (width: number | null) => void,
  commit: (width: number) => void,
): void {
  if (event.button !== 0) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  const handle = event.currentTarget;
  const originX = event.clientX;
  const initial = measuredWidth(frame, storedWidth, minWidth);
  const cap = containerCap(frame, maxWidth);
  let latest = initial;
  const move = (pointer: PointerEvent): void => {
    const delta = side === "right" ? pointer.clientX - originX : originX - pointer.clientX;
    latest = clamp(initial + delta, cap);
    setPreviewWidth(latest);
  };
  const stop = (): void => {
    handle.removeEventListener("pointermove", move);
    handle.removeEventListener("pointerup", stop);
    handle.removeEventListener("pointercancel", stop);
    setPreviewWidth(null);
    if (latest !== initial) {
      commit(latest);
    }
  };
  handle.addEventListener("pointermove", move);
  handle.addEventListener("pointerup", stop);
  handle.addEventListener("pointercancel", stop);
  if (event.isTrusted) {
    handle.setPointerCapture(event.pointerId);
  }
}

function resizeDelta(key: string, step: number): number | undefined {
  if (key === "ArrowRight" || key === "ArrowUp") {
    return step;
  }

  if (key === "ArrowLeft" || key === "ArrowDown") {
    return -step;
  }

  return undefined;
}

function measuredWidth(
  frame: HTMLElement | null,
  storedWidth: number | undefined,
  minWidth: number,
): number {
  if (storedWidth !== undefined) {
    return storedWidth;
  }

  const measured = frame?.getBoundingClientRect().width ?? minWidth;
  return measured > 0 ? measured : minWidth;
}

function containerCap(frame: HTMLElement | null, maxWidth: number): number {
  const parent = frame?.parentElement?.getBoundingClientRect().width ?? maxWidth;
  return parent > 0 ? parent : maxWidth;
}

const MEDIA_PLAYBACK_EVENTS = [
  "pointerdown",
  "pointerup",
  "mousedown",
  "mouseup",
  "click",
  "keydown",
  "keyup",
  "beforeinput",
  "input",
] as const;

export function useIsolatedMediaPlayback<T extends HTMLMediaElement>(
  mediaRef: { current: T | null },
  displayUrl: string | undefined,
  mimeType: string | undefined,
  setFailedUrl: (failed: boolean) => void,
): void {
  useEffect(() => {
    const node = mediaRef.current;
    if (!node) {
      return;
    }

    // Slate listens on the editable ancestor during bubble. Stopping here leaves
    // the browser's own media controls (play, seek, volume) intact.
    const stop = (event: Event): void => {
      event.stopPropagation();
    };
    for (const name of MEDIA_PLAYBACK_EVENTS) {
      node.addEventListener(name, stop);
    }

    if (mimeType !== undefined && node.canPlayType(mimeType) === "") {
      setFailedUrl(true);
    }

    return () => {
      for (const name of MEDIA_PLAYBACK_EVENTS) {
        node.removeEventListener(name, stop);
      }
    };
  }, [displayUrl, mimeType, setFailedUrl, mediaRef]);
}

export function useLazyMediaPreload<T extends HTMLMediaElement>(
  mediaRef: { current: T | null },
  displayUrl: string | undefined,
  active: boolean,
  setPreload: (value: "none" | "metadata") => void,
): void {
  useEffect(() => {
    const node = mediaRef.current;
    if (!node || !active) {
      return;
    }

    if (typeof IntersectionObserver !== "function") {
      setPreload("metadata");
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setPreload("metadata");
          observer.disconnect();
        }
      },
      { rootMargin: "100% 0px" },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, [active, displayUrl, setPreload, mediaRef]);
}
