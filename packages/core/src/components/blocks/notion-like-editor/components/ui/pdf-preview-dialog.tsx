import { useEffect, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/dialog";
import { Spinner } from "@/components/spinner";

import { loadPdfPreview } from "../../lib/features/editor-pdf-preview";
import { MediaDownloadButton } from "./media-download-button";

const FAILED_MESSAGE = "This PDF can't be previewed.";

function ignore(): void {}

type Preview = { status: "ready"; objectUrl: string } | { status: "failed" };

// A PDF opened in the browser's viewer. Nothing is fetched until the dialog is open. Closing aborts
// the fetch and revokes the object URL. The parent gives each open a new key, so every open starts
// in the loading state and never shows the result of an earlier open.
export function PdfPreviewDialog({
  name,
  url,
  open,
  onOpenChange,
  returnFocus,
}: {
  name: string;
  url: string; // the resolved url of the file
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocus: () => void; // where focus goes when the dialog closes
}) {
  const [preview, setPreview] = useState<Preview | undefined>(undefined);

  useEffect(() => {
    if (!open) {
      return;
    }

    const controller = new AbortController();
    let objectUrl: string | undefined;
    loadPdfPreview(url, controller.signal).then(
      (result) => {
        if (controller.signal.aborted) {
          return;
        }
        if (!result.ok) {
          setPreview({ status: "failed" });
          return;
        }
        objectUrl = URL.createObjectURL(result.blob);
        setPreview({ status: "ready", objectUrl });
      },
      () => {
        if (!controller.signal.aborted) {
          setPreview({ status: "failed" });
        }
      },
    );
    return () => {
      controller.abort();
      if (objectUrl !== undefined) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [open, url]);

  const state = preview?.status ?? "loading";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="h-[85vh] grid-rows-[auto_minmax(0,1fr)] sm:max-w-4xl"
        onKeyDown={(event) => {
          // Keys typed in the dialog never reach the editor.
          event.stopPropagation();
        }}
        onCloseAutoFocus={(event) => {
          // Radix would return focus to a DialogTrigger, and this dialog has none, so focus would
          // fall to the body. The parent says where it goes.
          event.preventDefault();
          returnFocus();
        }}
      >
        <DialogHeader className="flex-row items-center gap-2 pr-10">
          <DialogTitle className="min-w-0 flex-1 truncate">{name}</DialogTitle>
          <DialogDescription className="sr-only">PDF preview</DialogDescription>
          <MediaDownloadButton kind="file" href={url} name={name} onDownload={ignore} />
        </DialogHeader>
        <div data-pdf-preview-state={state} className="min-h-0">
          {preview?.status === "ready" ? (
            // No sandbox attribute: a sandboxed frame disables the browser's PDF viewer. The frame
            // only ever holds the object URL of a blob that loadPdfPreview checked as a PDF.
            <iframe title={name} src={preview.objectUrl} className="size-full border-0" />
          ) : preview?.status === "failed" ? (
            <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
              {FAILED_MESSAGE}
            </div>
          ) : (
            <div className="flex h-full items-center justify-center">
              <Spinner aria-label="Loading the PDF" />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
