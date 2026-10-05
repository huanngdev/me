import { EDITOR_SCHEMA_VERSION, serializeEditorDocument } from "./editor-document";
import type { EditorPersistenceAdapter, SaveRequest, SaveResult } from "./editor-persistence";

const QUOTA_MESSAGE =
  "Browser storage is full. Delete unused data or copy your document before closing this tab.";
const UNAVAILABLE_MESSAGE =
  "Browser storage is unavailable. Copy your document before closing this tab.";

type LocalStorageAdapterOptions = {
  storage?: Storage;
  keyPrefix?: string;
  target?: Pick<Window, "addEventListener" | "removeEventListener">;
};

function isQuotaError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  if ("name" in error && error.name === "QuotaExceededError") {
    return true;
  }

  return "code" in error && error.code === 22;
}

function storageFailure(error: unknown): SaveResult {
  if (isQuotaError(error)) {
    return { status: "error", reason: "quota", message: QUOTA_MESSAGE };
  }

  return { status: "error", reason: "unavailable", message: UNAVAILABLE_MESSAGE };
}

function storedRevision(raw: string): number | undefined {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || !("revision" in parsed)) {
      return undefined;
    }

    const revision = parsed.revision;
    if (typeof revision !== "number" || !Number.isInteger(revision) || revision < 0) {
      return undefined;
    }

    return revision;
  } catch {
    return undefined;
  }
}

function revisionFromStorageEvent(event: Event, documentKey: string): number | undefined {
  if (!("key" in event) || !("newValue" in event)) {
    return undefined;
  }

  const { key, newValue } = event;
  if (key !== documentKey || typeof newValue !== "string") {
    return undefined;
  }

  return storedRevision(newValue);
}

export function createLocalStorageAdapter(
  options?: LocalStorageAdapterOptions,
): EditorPersistenceAdapter {
  const keyPrefix = options?.keyPrefix ?? "notion-like-editor";
  const target = options?.target ?? window;

  // Touched only inside a method. A blocked `localStorage` getter throws, and
  // reading it while constructing the adapter would crash the demo during render.
  function openStorage(): Storage {
    return options?.storage ?? window.localStorage;
  }

  function documentKey(documentId: string): string {
    return `${keyPrefix}:${documentId}`;
  }

  function recoveryKey(documentId: string, reason: string): string {
    return `${keyPrefix}:${documentId}:recovery:${reason}`;
  }

  return {
    async load(documentId) {
      const raw = openStorage().getItem(documentKey(documentId));
      if (raw === null) {
        return null;
      }

      try {
        const parsed: unknown = JSON.parse(raw);
        return parsed;
      } catch {
        return raw;
      }
    },

    async save(request: SaveRequest): Promise<SaveResult> {
      const key = documentKey(request.documentId);
      let storage: Storage;
      let raw: string | null;

      try {
        storage = openStorage();
        raw = storage.getItem(key);
      } catch (error) {
        return storageFailure(error);
      }

      // A missing or unreadable value has no revision. The first write uses base 0 and replaces it.
      const current = raw === null ? undefined : storedRevision(raw);
      if (current === undefined) {
        if (request.baseRevision !== 0) {
          return { status: "conflict", currentRevision: 0 };
        }
      } else if (current !== request.baseRevision) {
        return { status: "conflict", currentRevision: current };
      }

      const revision = request.baseRevision + 1;
      const payload = serializeEditorDocument({
        schemaVersion: EDITOR_SCHEMA_VERSION,
        documentId: request.documentId,
        revision,
        content: request.content,
      });

      try {
        storage.setItem(key, payload);
      } catch (error) {
        return storageFailure(error);
      }

      return { status: "saved", revision };
    },

    async saveRecovery(snapshot) {
      openStorage().setItem(
        recoveryKey(snapshot.documentId, snapshot.reason),
        JSON.stringify(snapshot),
      );
    },

    subscribe(documentId, onExternalRevision) {
      const key = documentKey(documentId);
      const listener: EventListener = (event) => {
        const revision = revisionFromStorageEvent(event, key);
        if (revision === undefined) {
          return;
        }

        onExternalRevision(revision);
      };

      target.addEventListener("storage", listener);
      return () => {
        target.removeEventListener("storage", listener);
      };
    },
  };
}
