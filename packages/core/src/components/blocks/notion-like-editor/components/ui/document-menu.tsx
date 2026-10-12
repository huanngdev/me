"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Ellipsis, Upload } from "lucide-react";
import { useEditorReadOnly, useEditorRef } from "platejs/react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/dropdown-menu";

import { EditorMenuTrigger } from "./block-toolbar";
import { ScrollFadeArea } from "./editor-scroll";

import { runEditorCommand } from "../../lib/commands/editor-commands";
import type { EditorValue } from "../../lib/document/editor-value";
import {
  downloadTextFile,
  exportFileName,
  IMPORT_ACCEPT,
  IMPORT_FILE_BYTE_LIMIT,
  importFormatOf,
  replaceDocument,
} from "../../lib/features/editor-document-io";
import type { IoExportResult, IoFormat, IoImportResult, IoWarning } from "../../lib/io/io-types";

type Download = {
  fileName: string;
  content: string;
  mimeType: string;
};

type DialogState =
  | { mode: "export"; title: string; download: Download; warnings: IoWarning[] }
  | { mode: "import"; fileName: string; value: EditorValue; warnings: IoWarning[] }
  | { mode: "error"; title: string; message: string };

const EXPORT_TITLES: Record<IoFormat, string> = {
  json: "Export as JSON",
  html: "Export as HTML",
  markdown: "Export as Markdown",
};

const IMPORT_TYPE_MESSAGE = "Only .json, .html and .md files can be imported.";
const IMPORT_SIZE_MESSAGE = "This file is too large to import. The limit is 5 MB.";
const IMPORT_READ_MESSAGE = "This file could not be read.";
const EXPORT_FAILED_MESSAGE = "The document could not be exported.";

function WarningList({ warnings }: { warnings: IoWarning[] }) {
  return (
    <ScrollFadeArea className="max-h-40">
      <ul className="text-muted-foreground text-sm">
        {warnings.map((warning) => (
          <li key={warning.code}>{warning.message}</li>
        ))}
      </ul>
    </ScrollFadeArea>
  );
}

export function DocumentMenu() {
  const editor = useEditorRef();
  const readOnly = useEditorReadOnly();
  const inputRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef(0);
  const mountedRef = useRef(false);
  const [dialog, setDialog] = useState<DialogState | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  function nextRequest(): number {
    requestRef.current += 1;
    return requestRef.current;
  }

  function isCurrent(request: number): boolean {
    return mountedRef.current && request === requestRef.current;
  }

  function showError(title: string, message: string): void {
    setDialog({ mode: "error", title, message });
  }

  async function exportAs(format: IoFormat): Promise<void> {
    const request = nextRequest();
    const value = editor.children as EditorValue;
    try {
      const io = await import("../../lib/io");
      const result: IoExportResult = await io.exportEditorDocument(value, format);
      if (!isCurrent(request)) {
        return;
      }

      const download: Download = {
        fileName: exportFileName(value, result.extension),
        content: result.content,
        mimeType: result.mimeType,
      };
      if (result.warnings.length === 0) {
        downloadTextFile(download.fileName, download.content, download.mimeType);
        return;
      }

      setDialog({
        mode: "export",
        title: EXPORT_TITLES[format],
        download,
        warnings: result.warnings,
      });
    } catch {
      if (isCurrent(request)) {
        showError("Export failed", EXPORT_FAILED_MESSAGE);
      }
    }
  }

  async function importFile(file: File): Promise<void> {
    const request = nextRequest();
    const format = importFormatOf(file.name);
    if (format === null) {
      showError("Import failed", IMPORT_TYPE_MESSAGE);
      return;
    }
    if (file.size > IMPORT_FILE_BYTE_LIMIT) {
      showError("Import failed", IMPORT_SIZE_MESSAGE);
      return;
    }

    try {
      const text = await file.text();
      const io = await import("../../lib/io");
      const result: IoImportResult = await io.importEditorDocument(text, format);
      if (!isCurrent(request)) {
        return;
      }
      if (!result.ok) {
        showError("Import failed", result.error);
        return;
      }

      setDialog({
        mode: "import",
        fileName: file.name,
        value: result.value,
        warnings: result.warnings,
      });
    } catch {
      if (isCurrent(request)) {
        showError("Import failed", IMPORT_READ_MESSAGE);
      }
    }
  }

  function closeDialog(): void {
    setDialog(null);
  }

  return (
    <div
      data-document-menu=""
      contentEditable={false}
      className="relative mx-auto h-0 w-full max-w-[700px]"
    >
      <div className="absolute top-1 right-0 z-10">
        <DropdownMenu>
          <EditorMenuTrigger label="Document options" icon={<Ellipsis aria-hidden="true" />} />
          <DropdownMenuContent
            align="end"
            sideOffset={4}
            collisionPadding={8}
            hideWhenDetached
            className="w-48"
          >
            <DropdownMenuLabel>Export</DropdownMenuLabel>
            <DropdownMenuItem
              data-document-action="export-json"
              onSelect={() => {
                void exportAs("json");
              }}
            >
              <Download aria-hidden="true" />
              JSON
            </DropdownMenuItem>
            <DropdownMenuItem
              data-document-action="export-html"
              onSelect={() => {
                void exportAs("html");
              }}
            >
              <Download aria-hidden="true" />
              HTML
            </DropdownMenuItem>
            <DropdownMenuItem
              data-document-action="export-markdown"
              onSelect={() => {
                void exportAs("markdown");
              }}
            >
              <Download aria-hidden="true" />
              Markdown
            </DropdownMenuItem>
            {readOnly ? null : (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  data-document-action="import"
                  onSelect={() => {
                    inputRef.current?.click();
                  }}
                >
                  <Upload aria-hidden="true" />
                  Import…
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <input
          ref={inputRef}
          type="file"
          accept={IMPORT_ACCEPT}
          className="hidden"
          data-document-import-input=""
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (file) {
              void importFile(file);
            }
          }}
        />
      </div>
      <AlertDialog
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open) {
            closeDialog();
          }
        }}
      >
        <AlertDialogContent data-document-dialog={dialog?.mode}>
          {dialog?.mode === "export" ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>{dialog.title}</AlertDialogTitle>
                <AlertDialogDescription>
                  Some content cannot be kept in this format:
                </AlertDialogDescription>
                <WarningList warnings={dialog.warnings} />
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel size="sm">Cancel</AlertDialogCancel>
                <AlertDialogAction
                  size="sm"
                  onClick={() => {
                    downloadTextFile(
                      dialog.download.fileName,
                      dialog.download.content,
                      dialog.download.mimeType,
                    );
                  }}
                >
                  Download
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          ) : null}
          {dialog?.mode === "import" ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Replace this document?</AlertDialogTitle>
                <AlertDialogDescription>
                  {`"${dialog.fileName}" has ${String(dialog.value.length)} ${dialog.value.length === 1 ? "block" : "blocks"}. It replaces the whole document. You can undo this.`}
                </AlertDialogDescription>
                {dialog.warnings.length > 0 ? (
                  <>
                    <p className="text-muted-foreground text-sm">
                      Some content could not be imported as is:
                    </p>
                    <WarningList warnings={dialog.warnings} />
                  </>
                ) : null}
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel size="sm">Cancel</AlertDialogCancel>
                <AlertDialogAction
                  size="sm"
                  onClick={() => {
                    runEditorCommand(editor, replaceDocument, dialog.value);
                    closeDialog();
                    editor.tf.focus();
                  }}
                >
                  Replace document
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          ) : null}
          {dialog?.mode === "error" ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>{dialog.title}</AlertDialogTitle>
                <AlertDialogDescription>{dialog.message}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogAction size="sm">Close</AlertDialogAction>
              </AlertDialogFooter>
            </>
          ) : null}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
