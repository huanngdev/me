import type { EditorValue } from "../document/editor-value";

export type IoFormat = "json" | "html" | "markdown";

export type IoWarning = {
  code: string;
  message: string;
  count: number;
};

export type IoExportResult = {
  content: string;
  mimeType: string;
  extension: "json" | "html" | "md";
  warnings: IoWarning[];
};

export type IoImportResult =
  { ok: true; value: EditorValue; warnings: IoWarning[] } | { ok: false; error: string };

export type IoExportOptions = {
  title?: string;
};

type WarningDraft = {
  count: number;
  message: (count: number) => string;
};

export function createWarnings(): {
  add: (code: string, message: (count: number) => string, times?: number) => void;
  list: () => IoWarning[];
} {
  const drafts = new Map<string, WarningDraft>();

  return {
    add(code, message, times = 1) {
      if (times <= 0) {
        return;
      }

      const existing = drafts.get(code);
      if (existing === undefined) {
        drafts.set(code, { count: times, message });
        return;
      }

      existing.count += times;
    },
    list() {
      const warnings: IoWarning[] = [];
      for (const [code, draft] of drafts) {
        warnings.push({
          code,
          message: draft.message(draft.count),
          count: draft.count,
        });
      }

      return warnings;
    },
  };
}

export function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}
