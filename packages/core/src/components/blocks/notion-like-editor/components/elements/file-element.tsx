import {
  useRef,
  useState,
  useSyncExternalStore,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { Eye, Paperclip, RefreshCw } from "lucide-react";
import {
  PlateElement,
  useEditorRef,
  useElement,
  useReadOnly,
  type PlateElementProps,
} from "platejs/react";

import type { SlateEditor } from "platejs";

import { cn } from "@/lib/utils";

import { runEditorCommand } from "../../lib/commands/editor-commands";
import { cleanFileFields, displayFileName } from "../../lib/features/editor-file";
import { removeFile, renameFile, setFileSource } from "../../lib/features/editor-file-commands";
import { fileIconKind } from "../../lib/features/editor-file-icon";
import {
  FILE_NAME_MAX,
  cleanFileName,
  formatFileSize,
  isHttpFileUrl,
} from "../../lib/features/editor-file-url";
import { isPdfMime, pdfViewerAvailable } from "../../lib/features/editor-pdf-preview";
import { findBlockById } from "../../lib/features/editor-synced-block";
import { blockSelectionActive } from "../../lib/plugins/editor-block-selection";
import {
  openMediaActions,
  openMediaSource,
  selectMediaBlock,
} from "../../lib/plugins/editor-media-ui";
import { EditorTextButton, mediaStringAttr } from "../ui/block-toolbar";
import { FileActionPopover } from "../ui/file-action-popover";
import { MediaSourcePopover, type MediaSourceConfig } from "../ui/media-source-popover";
import { PdfPreviewDialog } from "../ui/pdf-preview-dialog";
import { FileRowText, FileTypeIcon } from "../static/file-row";
import { isControlTarget, useMediaCardSelect, useMediaHover } from "./media-card";
import { MEDIA_ICON_CLASS, MEDIA_ROW_CLASS } from "./media-classes";
import { MediaTextInput } from "./media-text-input";
import { MediaFailedRow, MediaPlaceholderRow, MediaUploadingRow } from "./media-rows";
import {
  useResolvedFileUrl,
  useUploadController,
  useUploadState,
  type ResolvedFileUrl,
} from "./file-upload-scope";

export type FileState = "empty" | "loading" | "ready" | "unavailable";

// What the block shows. An upload state takes priority over the stored file's state.
type FilePhase = FileState | "uploading" | "failed";

const FILE_SOURCE_CONFIG: MediaSourceConfig = {
  label: "Add a file",
  uploadLabel: "Upload file",
  embedPlaceholder: "Paste the file link…",
  embedLabel: "Embed link",
  linkLabel: "File link",
  invalidLinkMessage: "Enter a link that starts with http:// or https://",
};

const UNAVAILABLE_DETAIL = "File unavailable";

// Empty without a url. Unavailable when the url did not resolve. Otherwise ready, or loading while
// the url resolves.
function fileState(url: string | undefined, status: ResolvedFileUrl["status"]): FileState {
  if (url === undefined) {
    return "empty";
  }
  if (status === "unavailable") {
    return "unavailable";
  }
  if (status === "ready") {
    return "ready";
  }
  return "loading";
}

function noop(): void {}

// The viewer setting does not change while the page is open, so nothing subscribes. The server
// snapshot is false, so the server render and the first client render match.
function subscribeToNothing(): () => void {
  return noop;
}

function usePdfViewerAvailable(): boolean {
  return useSyncExternalStore(subscribeToNothing, pdfViewerAvailable, () => false);
}

function storedFileName(editor: SlateEditor, id: string): string | undefined {
  const entry = findBlockById(editor, id);
  return entry === undefined ? undefined : mediaStringAttr(entry[0], "name");
}

// The file block. Its body is one of: an upload row, the empty placeholder, the file row, or the
// unavailable row. A ready row opens its actions on hover or click. Read-only, it is a link.
export function FileElement(props: PlateElementProps) {
  const editor = useEditorRef();
  const element = useElement();
  const readOnly = useReadOnly();
  const { fields } = cleanFileFields(element);
  const id = typeof element.id === "string" ? element.id : "";
  const controller = useUploadController();
  const upload = useUploadState(id);
  const resolved = useResolvedFileUrl(fields.url);
  const [renaming, setRenaming] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  // Counts the opens, so each open gets a fresh dialog (see PdfPreviewDialog).
  const [previewCount, setPreviewCount] = useState(0);
  const previewButtonRef = useRef<HTMLButtonElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const editable = !readOnly;
  const uploading = readOnly ? undefined : upload;
  const state = fileState(fields.url, resolved.status);
  const phase: FilePhase = uploading?.status ?? state;
  const src = resolved.status === "ready" ? resolved.url : undefined;
  // Preview needs a PDF mime, a resolved url and the browser's PDF viewer. Otherwise it is not offered.
  const pdfViewer = usePdfViewerAvailable();
  const previewUrl = pdfViewer && isPdfMime(fields.mime) ? src : undefined;
  const name = displayFileName(fields);
  const icon = <FileTypeIcon kind={fileIconKind(fields.mime, name)} />;
  const sizeDetail = fields.size === undefined ? undefined : formatFileSize(fields.size);
  const detail = state === "unavailable" ? UNAVAILABLE_DETAIL : sizeDetail;
  const cardPhase = phase === "ready" || phase === "loading" || phase === "unavailable";

  useMediaCardSelect(cardRef, id, editable && cardPhase);
  useMediaHover(
    anchorRef,
    id,
    editable && (phase === "ready" || phase === "unavailable") && !renaming && !previewOpen,
  );

  const readAnchor = (): HTMLElement | null => anchorRef.current;

  function openSource(): void {
    selectMediaBlock(editor, id);
    openMediaSource(editor, id);
  }

  function openActions(): void {
    selectMediaBlock(editor, id);
    openMediaActions(editor, id);
  }

  function openPreview(): void {
    setPreviewCount((count) => count + 1);
    setPreviewOpen(true);
  }

  // Read-only, focus goes back to the Preview button that opened the dialog. In the editor, to the text.
  function returnPreviewFocus(): void {
    if (readOnly) {
      previewButtonRef.current?.focus();
    } else {
      editor.tf.focus();
    }
  }

  function embedLink(url: string): boolean {
    return runEditorCommand(editor, setFileSource, { id, file: { url } });
  }

  // Mod+click opens an http or https file in a new tab. A click on the row otherwise opens its actions.
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
        icon={<Paperclip aria-hidden="true" className={MEDIA_ICON_CLASS} />}
        onCancel={() => {
          controller?.cancel(id);
        }}
      />
    );
  } else if (uploading?.status === "failed") {
    body = (
      <MediaFailedRow
        message={uploading.message}
        icon={<Paperclip aria-hidden="true" className={MEDIA_ICON_CLASS} />}
        onRetry={() => {
          controller?.retry(id);
        }}
        onRemove={() => {
          runEditorCommand(editor, removeFile, { id });
        }}
      />
    );
  } else if (state === "empty") {
    body = (
      <MediaPlaceholderRow
        label="Add a file"
        icon={<Paperclip aria-hidden="true" className={MEDIA_ICON_CLASS} />}
        interactive={editable}
        onActivate={openSource}
      />
    );
  } else if (readOnly) {
    body =
      state === "ready" && src !== undefined ? (
        <div className="flex items-center gap-2">
          <a
            href={src}
            {...(/^blob:/i.test(src)
              ? { download: name }
              : { target: "_blank", rel: "noopener noreferrer nofollow" })}
            data-file-state={phase}
            className={cn(
              MEDIA_ROW_CLASS,
              "hover:bg-accent focus-visible:ring-ring/50 outline-none focus-visible:ring-[3px]",
            )}
          >
            {icon}
            <FileRowText name={name} detail={detail} />
          </a>
          {previewUrl === undefined ? null : (
            <EditorTextButton
              ref={previewButtonRef}
              label="Preview"
              icon={<Eye aria-hidden="true" />}
              data-file-action="preview"
              onClick={openPreview}
            />
          )}
        </div>
      ) : (
        <div className={MEDIA_ROW_CLASS}>
          {icon}
          <FileRowText name={name} detail={detail} />
        </div>
      );
  } else {
    body = (
      <div
        ref={cardRef}
        data-file-card=""
        data-file-state={phase}
        onClick={onCardClick}
        className={cn(MEDIA_ROW_CLASS, "cursor-pointer")}
      >
        {icon}
        <FileRowText
          name={name}
          detail={detail}
          nameSlot={
            renaming ? (
              <MediaTextInput
                label="File name"
                placeholder="Name this file…"
                maxLength={FILE_NAME_MAX}
                initial={name}
                autoFocus
                className="text-foreground h-7 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
                normalize={(text) => cleanFileName(text) ?? ""}
                readStored={() => storedFileName(editor, id)}
                onCommit={(text) => {
                  runEditorCommand(editor, renameFile, { id, name: text });
                }}
                onSettled={() => {
                  setRenaming(false);
                }}
              />
            ) : undefined
          }
        />
        {state === "unavailable" ? (
          <EditorTextButton
            label="Replace"
            icon={<RefreshCw aria-hidden="true" />}
            onClick={openSource}
          />
        ) : null}
      </div>
    );
  }

  // The row is already a muted card, so the block takes no selected fill.
  return (
    <PlateElement {...props} className="relative py-1">
      <div
        ref={anchorRef}
        contentEditable={false}
        data-block-handle-anchor=""
        data-media-anchor=""
        data-file-state={phase}
        className="relative"
      >
        {body}
        {editable ? (
          <>
            <FileActionPopover
              id={id}
              name={name}
              href={src}
              readAnchor={readAnchor}
              onPreview={previewUrl === undefined ? undefined : openPreview}
              onRename={() => {
                setRenaming(true);
              }}
              onReplace={openSource}
            />
            <MediaSourcePopover
              blockId={id}
              config={FILE_SOURCE_CONFIG}
              readAnchor={readAnchor}
              onEmbed={embedLink}
            />
          </>
        ) : null}
        {previewUrl === undefined ? null : (
          <PdfPreviewDialog
            key={previewCount}
            name={name}
            url={previewUrl}
            open={previewOpen}
            onOpenChange={setPreviewOpen}
            returnFocus={returnPreviewFocus}
          />
        )}
      </div>
      {props.children}
    </PlateElement>
  );
}
