import type { IoFormat, IoImportResult } from "./io-types";
import { importHtmlDocument } from "./html-import";
import { importJsonDocument } from "./json-document";

export async function importEditorDocument(
  input: string,
  format: IoFormat,
): Promise<IoImportResult> {
  try {
    if (format === "json") {
      return importJsonDocument(input);
    }

    if (format === "html") {
      return importHtmlDocument(input);
    }

    const markdown = await import("./markdown-document");
    return await markdown.importMarkdownDocument(input);
  } catch {
    return { ok: false, error: "This file could not be read." };
  }
}
