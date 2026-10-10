"use client";

import { RefreshCw } from "lucide-react";

import { cn } from "@/lib/utils";

import { EditorTextButton } from "../ui/block-toolbar";

import type { AutosaveStatus } from "../../lib/document/editor-autosave";

type EditorSaveStatusProps = {
  status: AutosaveStatus;
  message?: string;
  onRetry: () => void;
};

const FALLBACK_ERROR =
  "The document could not be saved. Copy it before closing this tab, then try again.";

function statusText(status: AutosaveStatus, message: string | undefined): string {
  switch (status) {
    case "saved":
      return "Saved";
    case "saving":
      return "Saving…";
    case "dirty":
      return "Unsaved changes";
    case "conflict":
      return "Changed in another tab. Your copy was saved for recovery. Reload to continue.";
    case "error":
      return message && message.length > 0 ? message : FALLBACK_ERROR;
  }
}

// The healthy states are silent: no "Saved"/"Saving…"/"Unsaved changes" label.
// Only the failure states are visible, because they are the only way the user
// learns their text is not being saved. This is a deliberate exception.
export function EditorSaveStatus({ status, message, onRetry }: EditorSaveStatusProps) {
  if (status !== "error" && status !== "conflict") {
    return null;
  }
  const isError = status === "error";

  return (
    <div
      aria-live="polite"
      className={cn(
        "flex max-w-full flex-wrap items-center justify-end gap-2 text-right text-sm text-pretty",
        isError ? "text-destructive" : "text-muted-foreground",
      )}
    >
      <span>{statusText(status, message)}</span>
      {isError ? (
        <EditorTextButton
          variant="outline"
          label="Retry"
          icon={<RefreshCw aria-hidden="true" />}
          onClick={onRetry}
        />
      ) : null}
    </div>
  );
}
