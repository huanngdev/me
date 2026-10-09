"use client";

import { RotateCcw } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/alert";
import { CopyButton } from "@/components/copy-button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/tooltip";

import { EditorTextButton } from "../ui/block-toolbar";

import { EDITOR_SCHEMA_VERSION } from "../../lib/document/editor-document";
import type { EditorRecoveryResult } from "../../hooks/use-editor-document";

type EditorRecoveryNoticeProps = {
  result: EditorRecoveryResult;
  raw: unknown;
  error?: string;
  onStartOver: () => void;
};

function titleFor(result: EditorRecoveryResult): string {
  switch (result.status) {
    case "invalid":
      return "This document could not be read";
    case "unsupported":
      return "This document uses unsupported content";
    case "future-version":
      return "This document is from a newer editor";
  }
}

function detailFor(result: EditorRecoveryResult): string {
  switch (result.status) {
    case "invalid":
      return "The saved document is not valid. Copy the JSON if you need it, or start over. The original stays in recovery storage.";
    case "unsupported":
      return "This editor cannot open some of the saved content. Copy the JSON if you need it, or start over. The original stays in recovery storage.";
    case "future-version":
      return `This document uses schema version ${String(result.schemaVersion)}. This editor reads version ${String(EDITOR_SCHEMA_VERSION)}. Copy the JSON if you need it, or start over. The original stays in recovery storage.`;
  }
}

function rawJson(raw: unknown): string {
  if (typeof raw === "string") {
    return raw;
  }

  try {
    const text = JSON.stringify(raw, null, 2);
    if (typeof text === "string") {
      return text;
    }
  } catch {
    return "";
  }

  return "";
}

export function EditorRecoveryNotice({
  result,
  raw,
  error,
  onStartOver,
}: EditorRecoveryNoticeProps) {
  const text = rawJson(raw);
  const issues = result.status === "future-version" ? [] : result.issues;
  const shown = issues.slice(0, 5);
  const extra = issues.length - shown.length;

  return (
    <div className="mx-auto w-full max-w-[700px] min-w-0 py-8 sm:py-12">
      <Alert className="min-w-0">
        <AlertTitle>{titleFor(result)}</AlertTitle>
        <AlertDescription>
          <p>{detailFor(result)}</p>
          {shown.length > 0 ? (
            <ul className="mt-3 list-disc pl-5">
              {shown.map((issue, index) => (
                <li key={`${issue.path.join(".")}-${String(index)}`}>{issue.message}</li>
              ))}
            </ul>
          ) : null}
          {extra > 0 ? <p className="mt-2">{`${String(extra)} more.`}</p> : null}
        </AlertDescription>
        <pre
          tabIndex={0}
          aria-label="Document JSON"
          className="border-border bg-muted text-foreground mt-3 max-h-60 w-full max-w-full min-w-0 overflow-auto rounded-md border p-3 font-mono text-sm"
        >
          {text}
        </pre>
        {error ? (
          <p role="alert" className="text-destructive mt-3 text-sm text-pretty">
            {error}
          </p>
        ) : null}
        <TooltipProvider>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <CopyButton text={text} variant="outline" size="icon" aria-label="Copy JSON" />
              </TooltipTrigger>
              <TooltipContent>Copy JSON</TooltipContent>
            </Tooltip>
            <EditorTextButton
              variant="outline"
              label="Start over"
              icon={<RotateCcw aria-hidden="true" />}
              onClick={onStartOver}
            />
          </div>
        </TooltipProvider>
      </Alert>
    </div>
  );
}
