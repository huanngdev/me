import { EDITOR_SCHEMA_VERSION } from "./editor-document";

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

export function migrateEditorDocument(raw: unknown, documentId: string): unknown {
  if (isUnknownArray(raw)) {
    return {
      schemaVersion: EDITOR_SCHEMA_VERSION,
      documentId,
      revision: 0,
      content: raw,
    };
  }

  return raw;
}
