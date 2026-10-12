import type { EditorValue } from "../document/editor-value";
import { exportHtmlDocument } from "./html-export";
import type { IoExportOptions, IoExportResult, IoFormat } from "./io-types";
import { exportJsonDocument } from "./json-document";

export async function exportEditorDocument(
  value: EditorValue,
  format: IoFormat,
  options?: IoExportOptions,
): Promise<IoExportResult> {
  if (format === "markdown") {
    const markdown = await import("./markdown-document");
    return markdown.exportMarkdownDocument(value, options);
  }

  if (format === "html") {
    return exportHtmlDocument(value, options);
  }

  return {
    content: exportJsonDocument(value),
    mimeType: "application/json",
    extension: "json",
    warnings: [],
  };
}
