import { ElementApi, type Descendant } from "platejs";

import type { EditorCommand } from "../commands/editor-commands";
import type { EditorValue } from "../document/editor-value";
import type { IoFormat } from "../io/io-types";

export const IMPORT_FILE_BYTE_LIMIT = 5 * 1024 * 1024;

export const IMPORT_ACCEPT = ".json,.html,.htm,.md,.markdown";

export function importFormatOf(fileName: string): IoFormat | null {
  const dot = fileName.lastIndexOf(".");
  if (dot < 0) {
    return null;
  }

  switch (fileName.slice(dot + 1).toLowerCase()) {
    case "json":
      return "json";
    case "html":
    case "htm":
      return "html";
    case "md":
    case "markdown":
      return "markdown";
    default:
      return null;
  }
}

function plainTextOf(node: Descendant): string {
  if (ElementApi.isElement(node)) {
    return node.children.map((child) => plainTextOf(child)).join("");
  }

  return "text" in node && typeof node.text === "string" ? node.text : "";
}

export function exportFileName(value: EditorValue, extension: string): string {
  const first = value[0];
  const title = first ? plainTextOf(first) : "";
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");

  return `${slug || "document"}.${extension}`;
}

export const replaceDocument: EditorCommand<EditorValue> = {
  id: "replace-document",
  label: "Replace document",
  group: "action",
  run: (editor, payload) => {
    if (payload.length === 0) {
      return;
    }

    editor.tf.deselect();
    editor.tf.withoutNormalizing(() => {
      for (let index = editor.children.length - 1; index >= 0; index -= 1) {
        editor.tf.removeNodes({ at: [index] });
      }
      editor.tf.insertNodes(structuredClone(payload), { at: [0] });
    });

    const start = editor.api.start([]);
    if (start) {
      editor.tf.select(start);
    }
  },
};

export function downloadTextFile(fileName: string, content: string, mimeType: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  link.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}
