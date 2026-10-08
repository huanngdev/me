import { useEffect, useRef, useState } from "react";
import { Caption, CaptionTextarea } from "@platejs/caption/react";
import { File, FileArchive, FileText, Trash2 } from "lucide-react";
import {
  PlateElement,
  useEditorRef,
  useElement,
  useFocused,
  useReadOnly,
  useSelected,
  type PlateElementProps,
} from "platejs/react";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/dialog";
import { cn } from "@/lib/utils";

import { formatBytes } from "./asset-validation";
import type { AssetStore } from "./editor-assets";
import { runEditorCommand } from "./editor-commands";
import { isSafeImageUrl } from "./editor-document-schema";
import {
  FILE_NOT_FOUND,
  FILE_NO_ACCESS,
  FILE_UPLOAD_INTERRUPTED,
  attachFileRuntime,
  beginFileUpload,
  cachedFileExpiresAt,
  cachedFileUrl,
  ensureFileMedia,
  fileAssetFileName,
  fileAssetIsAdapter,
  fileAssetIsDenied,
  fileAssetIsMissing,
  fileExtension,
  fileUploadState,
  holdFileUpload,
  markFileDenied,
  refreshFileURL,
  removeFile,
  replaceFileFromFile,
  resolveFileURL,
  retryFileUpload,
} from "./editor-file";
import { hrElementClassName } from "./hr-element";
import {
  MEDIA_TOOLBAR_CLASS,
  MediaCaptionButton,
  MediaFileButton,
  MediaIconButton,
  MediaNotice,
  MediaProgress,
  keepMediaSelection,
  mediaCaptionText,
  mediaFrameState,
  mediaStringAttr,
  useMediaUpload,
  useResolvedMedia,
} from "./media-element-parts";

const PDF_PREVIEW_UNAVAILABLE = "This browser can't preview PDFs";
const PDF_DIALOG_CLASS =
  "flex h-[min(85vh,calc(100dvh-2rem))] w-[min(90vw,calc(100%-2rem))] max-w-[min(90vw,calc(100%-2rem))] flex-col gap-3 overflow-hidden sm:max-w-[min(90vw,calc(100%-2rem))]";

export function FileRuntime({ store }: { store: AssetStore | null }) {
  const editor = useEditorRef();
  useEffect(() => attachFileRuntime(editor, store), [editor, store]);
  return null;
}

export function FileElement(props: PlateElementProps) {
  "use no memo";
  // Asset URLs and upload progress live outside React. Memoizing the first read kept the card empty.

  const editor = useEditorRef();
  const element = useElement();
  const readOnly = useReadOnly();
  const selected = useSelected();
  const focused = useFocused();
  const id = typeof element.id === "string" ? element.id : "";
  const assetId = mediaStringAttr(element, "assetId");
  const url = mediaStringAttr(element, "url");
  const mimeType = mediaStringAttr(element, "mimeType");
  const storedName = mediaStringAttr(element, "name");
  const byteSize = storedByteSize(Reflect.get(element, "byteSize"));
  const asset = useResolvedMedia(
    assetId,
    ensureFileMedia().plugin,
    resolveFileURL,
    cachedFileUrl,
    fileAssetIsMissing,
    fileAssetIsAdapter,
  );
  const upload = useMediaUpload(id, ensureFileMedia().plugin, fileUploadState);
  const displayUrl = assetId !== undefined ? asset.url : url;
  const denied = assetId !== undefined && fileAssetIsDenied(editor, assetId);
  const missing = assetId !== undefined && asset.missing && !denied;
  const resolving = assetId !== undefined && displayUrl === undefined && !missing && !denied;
  const sourcePending =
    resolving ||
    (assetId === undefined &&
      url === undefined &&
      (upload?.status === "pending" ||
        upload?.status === "processing" ||
        upload?.status === "ready"));
  const sourceFailed = upload?.status === "failed" ? upload.error : undefined;
  const uploading =
    upload?.status === "pending" || upload?.status === "processing" ? upload : undefined;
  const showFile =
    displayUrl !== undefined && !denied && !missing && sourceFailed === undefined && !sourcePending;
  const cachedName = assetId !== undefined ? fileAssetFileName(editor, assetId) : undefined;
  const label = storedName ?? cachedName ?? upload?.name ?? "file";
  const extension = fileExtension(label);
  const openHref =
    showFile && displayUrl !== undefined && isSafeImageUrl(displayUrl) ? displayUrl : undefined;
  const downloadHref = showFile && displayUrl !== undefined ? displayUrl : undefined;
  const previewUrl =
    assetId !== undefined &&
    mimeType === "application/pdf" &&
    !fileAssetIsAdapter(editor, assetId) &&
    downloadHref !== undefined &&
    downloadHref.startsWith("blob:") &&
    pdfViewerEnabled()
      ? downloadHref
      : undefined;

  useEffect(() => {
    if (assetId === undefined) {
      return;
    }

    const expiresAt = cachedFileExpiresAt(editor, assetId);
    if (expiresAt === undefined || expiresAt > Date.now()) {
      return;
    }

    if (!refreshFileURL(editor, assetId)) {
      markFileDenied(editor, assetId);
    }
  }, [assetId, displayUrl, editor]);

  return (
    <PlateElement
      {...props}
      className={cn(
        "group relative max-w-full py-2",
        hrElementClassName(selected, focused, readOnly),
      )}
    >
      <figure
        contentEditable={false}
        data-file-state={mediaFrameState({
          pending: sourcePending,
          failed: denied ? FILE_NO_ACCESS : sourceFailed,
          missing,
          failedUrl: denied,
          showMedia: showFile,
          loaded: showFile,
        })}
        className="relative max-w-full"
      >
        {showFile && downloadHref !== undefined ? (
          <FileRow
            name={label}
            mimeType={mimeType}
            byteSize={byteSize}
            extension={extension}
            downloadHref={downloadHref}
            openHref={openHref}
            previewUrl={previewUrl}
          />
        ) : null}
        {sourcePending ? (
          <div className="border-border flex min-w-0 items-center gap-3 rounded-md border p-3">
            <FileTypeIcon name={label} mimeType={mimeType} />
            <p className="min-w-0 text-sm [overflow-wrap:anywhere]">{label}</p>
          </div>
        ) : null}
        {uploading && !readOnly ? (
          <MediaProgress
            onCancel={(current) => {
              holdFileUpload(current, id);
            }}
          />
        ) : null}
        {sourceFailed !== undefined ? (
          <MediaNotice
            message={sourceFailed}
            retry={sourceFailed !== "Choose the file again."}
            onRetry={(current) => {
              retryFileUpload(current, id);
            }}
            onRemove={(current) => {
              runEditorCommand(current, removeFile, id);
            }}
          />
        ) : null}
        {denied && sourceFailed === undefined ? (
          <MediaNotice message={FILE_NO_ACCESS} retry={false} />
        ) : null}
        {missing ? (
          <MediaNotice
            message={FILE_NOT_FOUND}
            retry={false}
            onRemove={(current) => {
              runEditorCommand(current, removeFile, id);
            }}
          />
        ) : null}
        {!showFile && !sourcePending && sourceFailed === undefined && !missing && !denied ? (
          <MediaNotice
            message={FILE_UPLOAD_INTERRUPTED}
            retry={false}
            onRemove={(current) => {
              runEditorCommand(current, removeFile, id);
            }}
          >
            {readOnly ? null : (
              <MediaFileButton
                label="Insert file"
                accept="*/*"
                onFile={(current, file) => {
                  beginFileUpload(current, id, file, "source");
                }}
              />
            )}
          </MediaNotice>
        ) : null}
        {showFile && !readOnly ? <FileToolbar id={id} /> : null}
        {!readOnly && (showFile || mediaCaptionText(element).length > 0) ? (
          <Caption>
            <CaptionTextarea placeholder="Write a caption…" />
          </Caption>
        ) : mediaCaptionText(element).length > 0 ? (
          <p className="text-muted-foreground mt-1 text-sm">{mediaCaptionText(element)}</p>
        ) : null}
      </figure>
      {props.children}
    </PlateElement>
  );
}

function FileRow({
  name,
  mimeType,
  byteSize,
  extension,
  downloadHref,
  openHref,
  previewUrl,
}: {
  name: string;
  mimeType: string | undefined;
  byteSize: number | undefined;
  extension: string | undefined;
  downloadHref: string;
  openHref: string | undefined;
  previewUrl: string | undefined;
}) {
  const details = [byteSize === undefined ? undefined : formatBytes(byteSize), extension].filter(
    (part) => part !== undefined,
  );

  return (
    <div className="border-border bg-muted flex min-w-0 items-start gap-3 rounded-md border p-3">
      <FileTypeIcon name={name} mimeType={mimeType} />
      <div className="min-w-0 flex-1">
        <p className="text-foreground min-w-0 text-sm [overflow-wrap:anywhere]">{name}</p>
        {details.length > 0 ? (
          <p className="text-muted-foreground font-mono text-xs">{details.join(" · ")}</p>
        ) : null}
        <div className="mt-2 flex flex-wrap gap-3 text-sm">
          <a href={downloadHref} download={name} rel="noopener noreferrer" className="underline">
            Download
          </a>
          {openHref !== undefined ? (
            <a href={openHref} target="_blank" rel="noopener noreferrer" className="underline">
              Open
            </a>
          ) : null}
          {previewUrl !== undefined ? (
            <PdfPreview name={name} byteSize={byteSize} objectUrl={previewUrl} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function PdfPreview({
  name,
  byteSize,
  objectUrl,
}: {
  name: string;
  byteSize: number | undefined;
  objectUrl: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="underline"
          onMouseDown={keepMediaSelection}
          onClick={(event) => {
            // Slate selects the void on click unless this event stops before the editor.
            event.stopPropagation();
            event.currentTarget.focus();
          }}
        >
          Preview
        </button>
      </DialogTrigger>
      <PdfPreviewDialog name={name} byteSize={byteSize} objectUrl={objectUrl} />
    </Dialog>
  );
}

function PdfPreviewDialog({
  name,
  byteSize,
  objectUrl,
}: {
  name: string;
  byteSize: number | undefined;
  objectUrl: string;
}) {
  const [failed, setFailed] = useState(false);
  const size = byteSize === undefined ? undefined : formatBytes(byteSize);

  // No sandbox on the frame: Chrome's PDF viewer refuses one, and this blob is our sniffed PDF.
  return (
    <DialogContent showCloseButton={false} className={PDF_DIALOG_CLASS}>
      <DialogHeader className="min-w-0 pr-0">
        <DialogTitle className="min-w-0 [overflow-wrap:anywhere]">{name}</DialogTitle>
        <DialogDescription className={size === undefined ? "sr-only" : "font-mono text-xs"}>
          {size ?? `Preview of ${name}`}
        </DialogDescription>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
          <a href={objectUrl} download={name} rel="noopener noreferrer" className="underline">
            Download
          </a>
          <a href={objectUrl} target="_blank" rel="noopener noreferrer" className="underline">
            Open in new tab
          </a>
          <DialogClose asChild>
            <button type="button" className="underline">
              Close
            </button>
          </DialogClose>
        </div>
      </DialogHeader>
      {failed ? (
        <PdfPreviewFallback name={name} objectUrl={objectUrl} />
      ) : (
        <PdfFrame
          src={objectUrl}
          title={`Preview of ${name}`}
          onFail={() => {
            setFailed(true);
          }}
        />
      )}
    </DialogContent>
  );
}

function PdfFrame({ src, title, onFail }: { src: string; title: string; onFail: () => void }) {
  const frameRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) {
      return;
    }

    const fail = () => {
      onFail();
    };
    frame.addEventListener("error", fail);
    return () => {
      frame.removeEventListener("error", fail);
    };
  }, [onFail, src]);

  return (
    <iframe
      ref={frameRef}
      src={src}
      title={title}
      className="bg-background min-h-0 w-full flex-1 border-0"
      onLoad={(event) => {
        if (pdfFrameLoadedNothing(event.currentTarget)) {
          onFail();
        }
      }}
    />
  );
}

function PdfPreviewFallback({ name, objectUrl }: { name: string; objectUrl: string }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-start justify-center gap-3">
      <p>{PDF_PREVIEW_UNAVAILABLE}</p>
      <a href={objectUrl} download={name} rel="noopener noreferrer" className="underline">
        Download
      </a>
    </div>
  );
}

function pdfViewerEnabled(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }

  const enabled: unknown = Reflect.get(navigator, "pdfViewerEnabled");
  return enabled === true;
}

// Chrome's PDF plugin keeps a blob URL or throws when the frame is read.
// Nothing loaded only when navigation left that blob for an empty document.
function pdfFrameLoadedNothing(frame: HTMLIFrameElement): boolean {
  let loaded: Document | null;
  try {
    loaded = frame.contentDocument;
  } catch {
    return false;
  }

  if (
    !loaded ||
    loaded.URL === "about:blank" ||
    loaded.URL.startsWith("blob:") ||
    loaded.contentType === "application/pdf"
  ) {
    return false;
  }

  const body = loaded.body;
  if (!body || body.querySelector("embed, object") !== null) {
    return false;
  }

  return (body.textContent ?? "").trim().length === 0;
}

function FileTypeIcon({ name, mimeType }: { name: string; mimeType: string | undefined }) {
  const extension = fileExtension(name);
  const className = "text-muted-foreground mt-0.5 size-5 shrink-0";
  if (
    mimeType === "application/pdf" ||
    extension === "pdf" ||
    extension === "txt" ||
    extension === "md"
  ) {
    return <FileText aria-hidden className={className} />;
  }

  if (
    extension === "zip" ||
    extension === "rar" ||
    extension === "7z" ||
    extension === "gz" ||
    extension === "tar"
  ) {
    return <FileArchive aria-hidden className={className} />;
  }

  return <File aria-hidden className={className} />;
}

function FileToolbar({ id }: { id: string }) {
  const selected = useSelected();

  return (
    <div className={cn(MEDIA_TOOLBAR_CLASS, selected && "pointer-events-auto opacity-100")}>
      <MediaCaptionButton />
      <MediaFileButton
        label="Replace file"
        accept="*/*"
        onFile={(editor, file) => {
          runEditorCommand(editor, replaceFileFromFile, { id, file });
        }}
      />
      <MediaIconButton
        label="Remove"
        onClick={(editor) => {
          runEditorCommand(editor, removeFile, id);
        }}
      >
        <Trash2 aria-hidden className="size-4" />
      </MediaIconButton>
    </div>
  );
}

function storedByteSize(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return value;
  }

  return undefined;
}
