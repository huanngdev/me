import {
  EDITOR_SCHEMA_VERSION,
  createEditorDocument,
  serializeEditorDocument,
} from "../document/editor-document";
import { migrateEditorDocument } from "../document/editor-document-migrate";
import { parseEditorDocument } from "../document/editor-document-validate";
import type { EditorValue } from "../document/editor-value";
import { assignFreshIds } from "./fresh-ids";
import type { IoImportResult } from "./io-types";

const KEY_ORDER = [
  "schemaVersion",
  "documentId",
  "revision",
  "content",
  "type",
  "id",
  "children",
  "text",
  "url",
  "align",
  "lineHeight",
  "indent",
  "listStyleType",
  "listStart",
  "listRestart",
  "listRestartPolite",
  "checked",
  "icon",
  "variant",
  "lang",
  "colSizes",
  "colSpan",
  "rowSpan",
  "width",
  "maxDepth",
  "texExpression",
  "targetBlockId",
  "title",
  "description",
  "siteName",
  "imageUrl",
  "fetchedAt",
  "entityType",
  "entityId",
  "label",
];

const EXPORT_DOCUMENT_ID = "document";

function orderKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => orderKeys(item));
  }

  if (typeof value !== "object" || value === null) {
    return value;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort((left, right) => {
    const leftIndex = KEY_ORDER.indexOf(left);
    const rightIndex = KEY_ORDER.indexOf(right);
    const leftRank = leftIndex === -1 ? KEY_ORDER.length : leftIndex;
    const rightRank = rightIndex === -1 ? KEY_ORDER.length : rightIndex;
    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    if (left < right) {
      return -1;
    }

    if (left > right) {
      return 1;
    }

    return 0;
  });
  const ordered: Record<string, unknown> = {};
  for (const key of keys) {
    ordered[key] = orderKeys(record[key]);
  }

  return ordered;
}

export function exportJsonDocument(value: EditorValue): string {
  const document = createEditorDocument(EXPORT_DOCUMENT_ID, value);
  const serialized = serializeEditorDocument(document);
  const parsed: unknown = JSON.parse(serialized);
  return `${JSON.stringify(orderKeys(parsed), null, 2)}\n`;
}

function issueError(messages: readonly string[]): string {
  const head = messages.slice(0, 3);
  const rest = messages.length - head.length;
  const body = head.join(" ");
  if (rest <= 0) {
    return body;
  }

  return `${body} and ${rest} more.`;
}

export function importJsonDocument(input: string): IoImportResult {
  let raw: unknown;
  try {
    raw = JSON.parse(input);
  } catch {
    return { ok: false, error: "This file is not JSON." };
  }

  if (
    typeof raw === "object" &&
    raw !== null &&
    !Array.isArray(raw) &&
    "schemaVersion" in raw &&
    typeof raw.schemaVersion === "number" &&
    raw.schemaVersion > EDITOR_SCHEMA_VERSION
  ) {
    return { ok: false, error: "This file was made by a newer version of the editor." };
  }

  const migrated = migrateEditorDocument(raw, EXPORT_DOCUMENT_ID);
  const parsed = parseEditorDocument(migrated);
  if (parsed.status === "future-version") {
    return { ok: false, error: "This file was made by a newer version of the editor." };
  }

  if (parsed.status === "invalid" || parsed.status === "unsupported") {
    const messages = parsed.issues.map((issue) => issue.message);
    return {
      ok: false,
      error: messages.length === 0 ? "This file is not an editor document." : issueError(messages),
    };
  }

  return {
    ok: true,
    value: assignFreshIds(parsed.document.content),
    warnings: [],
  };
}
