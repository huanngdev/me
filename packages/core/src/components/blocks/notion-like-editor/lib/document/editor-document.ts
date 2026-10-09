import { z } from "zod";

import { EMPTY_EDITOR_VALUE, type EditorValue } from "./editor-value";

export const EDITOR_SCHEMA_VERSION = 1;

export const EDITOR_DOCUMENT_LIMITS = {
  maxDepth: 32,
  maxNodes: 20_000,
  maxBytes: 2_000_000,
} as const;

export const editorDocumentSchema = z.object({
  schemaVersion: z.literal(EDITOR_SCHEMA_VERSION),
  documentId: z.string().min(1),
  revision: z.number().int().nonnegative(),
  content: z.custom<EditorValue>((value): value is EditorValue => Array.isArray(value)),
});

export type EditorDocument = z.infer<typeof editorDocumentSchema>;

export function formatBlockLabel(path: readonly number[]): string {
  return `Block ${path.map((index) => String(index + 1)).join(".")}`;
}

export function createEditorDocument(
  documentId: string,
  content: EditorValue = EMPTY_EDITOR_VALUE,
): EditorDocument {
  return {
    schemaVersion: EDITOR_SCHEMA_VERSION,
    documentId,
    revision: 0,
    content,
  };
}

export function serializeEditorDocument(document: EditorDocument): string {
  return JSON.stringify({
    schemaVersion: document.schemaVersion,
    documentId: document.documentId,
    revision: document.revision,
    content: document.content,
  });
}
