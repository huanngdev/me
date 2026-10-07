import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Caption, CaptionTextarea, showCaption } from "@platejs/caption/react";
import { AlignCenter, AlignLeft, AlignRight, Captions, ImagePlus, Trash2 } from "lucide-react";
import type { TElement } from "platejs";
import {
  PlateElement,
  useEditorRef,
  useElement,
  useFocused,
  usePluginOption,
  useReadOnly,
  useSelected,
  type PlateElementProps,
} from "platejs/react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/dropdown-menu";
import { cn } from "@/lib/utils";

import type { AssetStore } from "./editor-assets";
import { runEditorCommand } from "./editor-commands";
import { IMAGE_MAX_WIDTH, IMAGE_MIN_WIDTH, type ImageAlign } from "./editor-document-schema";
import {
  IMAGE_NOT_FOUND,
  IMAGE_UPLOAD_INTERRUPTED,
  assetIsMissing,
  attachImageRuntime,
  beginImageUpload,
  cachedAssetUrl,
  clampImageWidth,
  imageResizeStep,
  imageRuntimePlugin,
  imageUploadState,
  removeImage,
  replaceImageFromFile,
  resolveAssetURL,
  retryImageUpload,
  setImageAlign,
  setImageAlt,
  setImageWidth,
} from "./editor-image";
import { hrElementClassName } from "./hr-element";

const TOOLBAR_CLASS =
  "absolute top-1 right-1 z-10 flex max-w-full flex-wrap gap-1 rounded-md border border-border bg-background p-1 opacity-0 pointer-events-none group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100";

export function ImageRuntime({ store }: { store: AssetStore | null }) {
  const editor = useEditorRef();
  useEffect(() => attachImageRuntime(editor, store), [editor, store]);
  return null;
}

export function ImageElement(props: PlateElementProps) {
  "use no memo";
  // Asset URLs and upload progress live outside React. Memoizing the first read kept the skeleton up.

  const element = useElement();
  const readOnly = useReadOnly();
  const selected = useSelected();
  const focused = useFocused();
  const id = typeof element.id === "string" ? element.id : "";
  const assetId = stringAttr(element, "assetId");
  const url = stringAttr(element, "url");
  const alt = stringAttr(element, "alt") ?? "";
  const align = alignAttr(element);
  const naturalWidth = pixelAttr(element, "naturalWidth");
  const naturalHeight = pixelAttr(element, "naturalHeight");
  const storedWidth = pixelAttr(element, "width");
  const asset = useResolvedAsset(assetId);
  const upload = useImageUpload(id);
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
  const ratio =
    naturalWidth !== undefined && naturalHeight !== undefined
      ? `${String(naturalWidth)} / ${String(naturalHeight)}`
      : undefined;

  return (
    <PlateElement
      {...props}
      className={cn("group relative py-2", hrElementClassName(selected, focused, readOnly))}
    >
      <figure
        ref={frame}
        contentEditable={false}
        data-image-state={imageState({
          pending,
          failed,
          missing,
          failedUrl,
          showImage,
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
              setFailedUrl(true);
            }}
          />
        ) : null}
        {showImage && !loaded ? <Skeleton ratio={ratio} /> : null}
        {pending ? <Skeleton ratio={ratio} /> : null}
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
        {showImage || captionText(element).length > 0 ? (
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
      <div className={cn(TOOLBAR_CLASS, selected && "pointer-events-auto opacity-100")}>
        <AlignMenu id={id} align={align} />
        <AltTextControl id={id} alt={alt} />
        <CaptionButton />
        <FileButton id={id} label="Replace" mode="replace" />
        <IconButton label="Remove" onClick={(editor) => runEditorCommand(editor, removeImage, id)}>
          <Trash2 aria-hidden className="size-4" />
        </IconButton>
      </div>
      <ResizeHandle
        side="left"
        id={id}
        frame={frame}
        storedWidth={storedWidth}
        previewWidth={dragWidth}
        setPreviewWidth={setDragWidth}
      />
      <ResizeHandle
        side="right"
        id={id}
        frame={frame}
        storedWidth={storedWidth}
        previewWidth={dragWidth}
        setPreviewWidth={setDragWidth}
      />
    </>
  );
}

function AlignMenu({ id, align }: { id: string; align: ImageAlign | undefined }) {
  const editor = useEditorRef();
  const current = align ?? "center";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Align image"
        onMouseDown={keepEditorSelection}
        className={iconButtonClass}
      >
        <AlignIcon align={current} />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <AlignItem id={id} align="left" editor={editor} />
        <AlignItem id={id} align={null} editor={editor} />
        <AlignItem id={id} align="right" editor={editor} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AlignItem({
  id,
  align,
  editor,
}: {
  id: string;
  align: ImageAlign | null;
  editor: ReturnType<typeof useEditorRef>;
}) {
  const label =
    align === "left" ? "Align left" : align === "right" ? "Align right" : "Align center";
  return (
    <DropdownMenuItem
      onMouseDown={keepEditorSelection}
      onSelect={() => {
        runEditorCommand(editor, setImageAlign, { id, align });
      }}
    >
      <AlignIcon align={align ?? "center"} />
      <span>{label}</span>
    </DropdownMenuItem>
  );
}

function AlignIcon({ align }: { align: ImageAlign | "center" }) {
  const className = "size-4";
  if (align === "left") {
    return <AlignLeft aria-hidden className={className} />;
  }

  if (align === "right") {
    return <AlignRight aria-hidden className={className} />;
  }

  return <AlignCenter aria-hidden className={className} />;
}

function AltTextControl({ id, alt }: { id: string; alt: string }) {
  const editor = useEditorRef();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(alt);
  if (!open) {
    return (
      <button
        type="button"
        className={iconButtonClass}
        onMouseDown={keepEditorSelection}
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

function CaptionButton() {
  const editor = useEditorRef();
  const element = useElement();
  return (
    <button
      type="button"
      aria-label="Caption"
      className={iconButtonClass}
      onMouseDown={keepEditorSelection}
      onClick={() => {
        showCaption(editor, element);
      }}
    >
      <Captions aria-hidden className="size-4" />
    </button>
  );
}

function FileButton({
  id,
  label,
  mode,
}: {
  id: string;
  label: string;
  mode: "replace" | "insert";
}) {
  const editor = useEditorRef();
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        aria-label={label}
        className={iconButtonClass}
        onMouseDown={keepEditorSelection}
        onClick={() => {
          input.current?.click();
        }}
      >
        {mode === "insert" ? <ImagePlus aria-hidden className="size-4" /> : null}
        {label}
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.item(0);
          event.target.value = "";
          if (!file) {
            return;
          }

          if (mode === "replace") {
            runEditorCommand(editor, replaceImageFromFile, { id, file });
            return;
          }

          beginImageUpload(editor, id, file);
        }}
      />
    </>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: (editor: ReturnType<typeof useEditorRef>) => void;
  children: React.ReactNode;
}) {
  const editor = useEditorRef();
  return (
    <button
      type="button"
      aria-label={label}
      className={iconButtonClass}
      onMouseDown={keepEditorSelection}
      onClick={() => {
        onClick(editor);
      }}
    >
      {children}
    </button>
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
      {readOnly ? null : (
        <div className="flex flex-wrap gap-2">
          {retry ? (
            <button
              type="button"
              onMouseDown={keepEditorSelection}
              onClick={() => {
                retryImageUpload(editor, id);
              }}
            >
              Retry
            </button>
          ) : null}
          {insert ? <FileButton id={id} label="Insert image" mode="insert" /> : null}
          <button
            type="button"
            onMouseDown={keepEditorSelection}
            onClick={() => {
              runEditorCommand(editor, removeImage, id);
            }}
          >
            Remove
          </button>
        </div>
      )}
    </div>
  );
}

function Skeleton({ ratio }: { ratio: string | undefined }) {
  return (
    <div
      data-image-skeleton=""
      className="bg-muted absolute inset-0"
      style={{ aspectRatio: ratio }}
    />
  );
}

function ResizeHandle({
  side,
  id,
  frame,
  storedWidth,
  previewWidth,
  setPreviewWidth,
}: {
  side: "left" | "right";
  id: string;
  frame: { current: HTMLElement | null };
  storedWidth: number | undefined;
  previewWidth: number | null;
  setPreviewWidth: (width: number | null) => void;
}) {
  const editor = useEditorRef();
  const current = previewWidth ?? storedWidth;
  const max = containerCap(frame.current);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-valuemin={IMAGE_MIN_WIDTH}
      aria-valuemax={max}
      aria-valuenow={current ?? max}
      aria-label={side === "left" ? "Resize image from the left" : "Resize image from the right"}
      tabIndex={0}
      contentEditable={false}
      className={cn(
        "absolute top-0 z-10 h-full w-2 cursor-col-resize",
        side === "left" ? "left-0" : "right-0",
      )}
      onPointerDown={(event) => {
        startResize(event, side, frame.current, storedWidth, setPreviewWidth, (next) => {
          runEditorCommand(editor, setImageWidth, { id, width: next });
        });
      }}
      onDoubleClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        runEditorCommand(editor, setImageWidth, { id, width: null });
      }}
      onKeyDown={(event) => {
        const delta = resizeDelta(event.key);
        if (delta === undefined) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        const start = measuredWidth(frame.current, storedWidth);
        runEditorCommand(editor, setImageWidth, {
          id,
          width: clampImageWidth(start + delta, containerCap(frame.current)),
        });
      }}
    />
  );
}

function startResize(
  event: ReactPointerEvent<HTMLDivElement>,
  side: "left" | "right",
  frame: HTMLElement | null,
  storedWidth: number | undefined,
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
  const initial = measuredWidth(frame, storedWidth);
  const cap = containerCap(frame);
  let latest = initial;
  const move = (pointer: PointerEvent): void => {
    const delta = side === "right" ? pointer.clientX - originX : originX - pointer.clientX;
    latest = clampImageWidth(initial + delta, cap);
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

function resizeDelta(key: string): number | undefined {
  if (key === "ArrowRight" || key === "ArrowUp") {
    return imageResizeStep();
  }

  if (key === "ArrowLeft" || key === "ArrowDown") {
    return -imageResizeStep();
  }

  return undefined;
}

function measuredWidth(frame: HTMLElement | null, storedWidth: number | undefined): number {
  if (storedWidth !== undefined) {
    return storedWidth;
  }

  const measured = frame?.getBoundingClientRect().width ?? IMAGE_MIN_WIDTH;
  return measured > 0 ? measured : IMAGE_MIN_WIDTH;
}

function containerCap(frame: HTMLElement | null): number {
  const parent = frame?.parentElement?.getBoundingClientRect().width ?? IMAGE_MAX_WIDTH;
  return parent > 0 ? parent : IMAGE_MAX_WIDTH;
}

function useResolvedAsset(assetId: string | undefined): { url?: string; missing: boolean } {
  "use no memo";
  // This hook is compiled on its own. The same external map has to be read on every revision.

  const editor = useEditorRef();
  const revision = usePluginOption(imageRuntimePlugin, "revision");
  useEffect(() => {
    if (assetId !== undefined) {
      resolveAssetURL(editor, assetId);
    }
  }, [assetId, editor, revision]);

  if (assetId === undefined) {
    return { missing: false };
  }

  return { url: cachedAssetUrl(editor, assetId), missing: assetIsMissing(editor, assetId) };
}

function useImageUpload(blockId: string) {
  "use no memo";
  // Upload status is plugin state, not a document change. A memoized read would skip failed and ready.

  const editor = useEditorRef();
  const revision = usePluginOption(imageRuntimePlugin, "revision");
  void revision;
  return blockId.length === 0 ? undefined : imageUploadState(editor, blockId);
}

function imageState(state: {
  pending: boolean;
  failed: string | undefined;
  missing: boolean;
  failedUrl: boolean;
  showImage: boolean;
  loaded: boolean;
}): string {
  if (state.pending || (state.showImage && !state.loaded)) {
    return "loading";
  }

  if (state.failed !== undefined || state.missing || state.failedUrl) {
    return "error";
  }

  if (!state.showImage) {
    return "empty";
  }

  return "ready";
}

function keepEditorSelection(event: { preventDefault: () => void }): void {
  event.preventDefault();
}

const iconButtonClass =
  "text-foreground hover:bg-muted inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs";

function stringAttr(element: TElement, key: string): string | undefined {
  const value: unknown = Reflect.get(element, key);
  return typeof value === "string" ? value : undefined;
}

function pixelAttr(element: TElement, key: string): number | undefined {
  const value: unknown = Reflect.get(element, key);
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

function alignAttr(element: TElement): ImageAlign | undefined {
  const value = stringAttr(element, "align");
  return value === "left" || value === "right" ? value : undefined;
}

function captionText(element: TElement): string {
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
