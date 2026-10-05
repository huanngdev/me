"use client";

import { useEffect, useRef, useState } from "react";

import { createAutosave, type AutosaveStatus } from "./editor-autosave";
import {
  EDITOR_SCHEMA_VERSION,
  createEditorDocument,
  type EditorDocument,
} from "./editor-document";
import { migrateEditorDocument } from "./editor-document-migrate";
import { parseEditorDocument, type ParseResult } from "./editor-document-validate";
import type { EditorPersistenceAdapter } from "./editor-persistence";
import { EMPTY_EDITOR_VALUE, type EditorValue } from "./editor-value";

export type EditorRecoveryResult = Exclude<ParseResult, { status: "ok" }>;

export type EditorDocumentSession =
  | { phase: "loading" }
  | {
      phase: "ready";
      document: EditorDocument;
      status: AutosaveStatus;
      message?: string;
      onContentChange: (value: EditorValue) => void;
      retry: () => Promise<void>;
    }
  | {
      phase: "recovery";
      result: EditorRecoveryResult;
      raw: unknown;
      startOver: () => Promise<void>;
      error?: string;
    };

type UseEditorDocumentOptions = {
  documentId: string;
  adapter: EditorPersistenceAdapter;
  readOnly?: boolean;
  initialValue?: EditorValue;
};

function revisionOf(raw: unknown): number {
  if (typeof raw !== "object" || raw === null || !("revision" in raw)) {
    return 0;
  }

  const revision = raw.revision;
  if (typeof revision !== "number" || !Number.isInteger(revision) || revision < 0) {
    return 0;
  }

  return revision;
}

export function useEditorDocument({
  documentId,
  adapter,
  readOnly = false,
  initialValue,
}: UseEditorDocumentOptions): EditorDocumentSession {
  const [session, setSession] = useState<EditorDocumentSession>({ phase: "loading" });
  const autosaveRef = useRef<ReturnType<typeof createAutosave> | undefined>(undefined);
  const readOnlyRef = useRef(readOnly);
  const initialValueRef = useRef(initialValue);

  useEffect(() => {
    readOnlyRef.current = readOnly;
    initialValueRef.current = initialValue;
  }, [readOnly, initialValue]);

  useEffect(() => {
    let cancelled = false;
    let autosave: ReturnType<typeof createAutosave> | undefined;

    function publishReady(document: EditorDocument): void {
      autosave?.dispose();
      const next = createAutosave({
        adapter,
        documentId,
        revision: document.revision,
        initialContent: document.content,
        readOnly: () => readOnlyRef.current,
        onStatus: (state) => {
          setSession((current) => {
            if (current.phase !== "ready") {
              return current;
            }

            return { ...current, status: state.status, message: state.message };
          });
        },
      });
      autosave = next;
      autosaveRef.current = next;
      setSession({
        phase: "ready",
        document,
        status: "saved",
        onContentChange: (value) => {
          if (readOnlyRef.current) {
            return;
          }

          next.schedule(value);
        },
        retry: () => {
          if (readOnlyRef.current) {
            return Promise.resolve();
          }

          return next.retry();
        },
      });
    }

    function setRecoveryError(message: string): void {
      setSession((current) => {
        if (current.phase !== "recovery") {
          return current;
        }

        return { ...current, error: message };
      });
    }

    async function startOver(raw: unknown): Promise<void> {
      if (cancelled) {
        return;
      }

      try {
        await adapter.saveRecovery({
          documentId,
          revision: revisionOf(raw),
          savedAt: new Date().toISOString(),
          content: EMPTY_EDITOR_VALUE,
          reason: "replaced-invalid",
          raw,
        });
      } catch {
        if (!cancelled) {
          setRecoveryError("Could not back up the original. Copy the JSON first, then try again.");
        }
        return;
      }

      if (cancelled) {
        return;
      }

      const fresh = createEditorDocument(documentId, initialValueRef.current ?? EMPTY_EDITOR_VALUE);
      const saved = await adapter.save({
        documentId,
        schemaVersion: EDITOR_SCHEMA_VERSION,
        baseRevision: revisionOf(raw),
        content: fresh.content,
      });
      if (cancelled) {
        return;
      }

      if (saved.status === "error") {
        setRecoveryError(saved.message);
        return;
      }

      if (saved.status === "conflict") {
        setRecoveryError("This document changed in another tab. Reload to continue.");
        return;
      }

      publishReady({ ...fresh, revision: saved.revision });
    }

    function publishRecovery(result: EditorRecoveryResult, raw: unknown): void {
      setSession({
        phase: "recovery",
        result,
        raw,
        startOver: () => startOver(raw),
      });
    }

    void adapter.load(documentId).then(
      (raw) => {
        if (cancelled) {
          return;
        }

        if (raw === null) {
          publishReady(
            createEditorDocument(documentId, initialValueRef.current ?? EMPTY_EDITOR_VALUE),
          );
          return;
        }

        const parsed = parseEditorDocument(migrateEditorDocument(raw, documentId));
        if (parsed.status === "ok") {
          publishReady(parsed.document);
          return;
        }

        publishRecovery(parsed, raw);
      },
      () => {
        if (cancelled) {
          return;
        }

        publishRecovery(
          {
            status: "invalid",
            issues: [
              {
                path: [],
                message:
                  "Browser storage could not be read. Copy any backup you have, or start over.",
              },
            ],
            raw: undefined,
          },
          undefined,
        );
      },
    );

    return () => {
      cancelled = true;
      autosave?.dispose();
      if (autosaveRef.current === autosave) {
        autosaveRef.current = undefined;
      }
    };
  }, [adapter, documentId]);

  useEffect(() => {
    const flush = () => {
      void autosaveRef.current?.flush();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        flush();
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
    };
  }, []);

  return session;
}
