import {
  cleanFileName,
  cleanFileText,
  sanitizeMimeType,
  sanitizeUploadedFile,
} from "./editor-file-url";
import type { FileUploadAdapter, UploadedFile } from "./editor-file-upload";

export type UploadState =
  | { status: "uploading"; name: string; size: number; progress: number } // progress 0..1
  | { status: "failed"; name: string; size: number; message: string };

export type UploadController = {
  start: (blockId: string, file: File) => void;
  cancel: (blockId: string) => void; // aborts and forgets the upload; no onDone
  retry: (blockId: string) => void; // only from "failed"; uploads the same File again
  get: (blockId: string) => UploadState | undefined;
  ids: () => string[]; // blocks with an upload that is running or failed
  subscribe: (listener: () => void) => () => void;
  dispose: () => void; // aborts everything
};

const ERROR_MESSAGE_MAX = 200;
const FALLBACK_MESSAGE = "Upload failed.";
const INVALID_MESSAGE = "The upload returned an invalid file.";

// One record per block. A record is live only while it is the block's current record and
// its controller has not been aborted.
type Record = {
  file: File;
  state: UploadState;
  abort?: AbortController; // present only while the upload is running
};

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return cleanFileText(error.message, ERROR_MESSAGE_MAX) ?? FALLBACK_MESSAGE;
  }

  return FALLBACK_MESSAGE;
}

function displayName(file: File): string {
  return cleanFileName(file.name) ?? "";
}

// The browser type can carry parameters, such as "text/plain;charset=utf-8". Only the type is kept.
function fileMimeType(file: File): string | undefined {
  const [essence = ""] = file.type.split(";");
  return sanitizeMimeType(essence.trim());
}

function uploadingState(file: File, progress: number): UploadState {
  return { status: "uploading", name: displayName(file), size: file.size, progress };
}

export function createUploadController(options: {
  adapter: FileUploadAdapter;
  onDone: (blockId: string, file: UploadedFile) => void;
}): UploadController {
  const { adapter, onDone } = options;
  const records = new Map<string, Record>();
  const listeners = new Set<() => void>();
  let disposed = false;

  function notify(): void {
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch {
        // A listener that throws must not stop the others.
      }
    }
  }

  function isLive(blockId: string, record: Record): boolean {
    return (
      records.get(blockId) === record && record.abort !== undefined && !record.abort.signal.aborted
    );
  }

  function setProgress(blockId: string, record: Record, fraction: number): void {
    if (!isLive(blockId, record) || record.state.status !== "uploading") {
      return;
    }

    // Progress is clamped, ignores NaN, and never goes backwards.
    if (Number.isNaN(fraction)) {
      return;
    }

    const next = Math.min(1, Math.max(0, fraction));
    if (next <= record.state.progress) {
      return;
    }

    record.state = { ...record.state, progress: next };
    notify();
  }

  function setFailed(blockId: string, record: Record, message: string): void {
    records.set(blockId, {
      file: record.file,
      state: { status: "failed", name: displayName(record.file), size: record.file.size, message },
    });
    notify();
  }

  function finish(blockId: string, record: Record, raw: unknown): void {
    if (!isLive(blockId, record)) {
      return;
    }

    const valid = sanitizeUploadedFile(raw);
    if (valid === null) {
      setFailed(blockId, record, INVALID_MESSAGE);
      return;
    }

    // The File fills in fields the adapter left out. Each value is cleaned the same way.
    const done: UploadedFile = { url: valid.url };
    const name = valid.name ?? cleanFileName(record.file.name);
    if (name !== undefined) {
      done.name = name;
    }

    done.size = valid.size ?? record.file.size;

    const mime = valid.mime ?? fileMimeType(record.file);
    if (mime !== undefined) {
      done.mime = mime;
    }

    records.delete(blockId);
    notify();
    onDone(blockId, done);
  }

  function fail(blockId: string, record: Record, error: unknown): void {
    if (!isLive(blockId, record)) {
      return;
    }

    setFailed(blockId, record, errorMessage(error));
  }

  function run(blockId: string, record: Record): void {
    const abort = record.abort;
    if (abort === undefined) {
      return;
    }

    // The executor turns a synchronous throw from the adapter into a rejection.
    const pending = new Promise<UploadedFile>((resolve) => {
      resolve(
        adapter.upload(record.file, {
          signal: abort.signal,
          onProgress: (fraction) => {
            setProgress(blockId, record, fraction);
          },
        }),
      );
    });

    pending.then(
      (result) => {
        finish(blockId, record, result);
      },
      (error: unknown) => {
        fail(blockId, record, error);
      },
    );
  }

  function start(blockId: string, file: File): void {
    if (disposed) {
      return;
    }

    records.get(blockId)?.abort?.abort();
    const record: Record = {
      file,
      abort: new AbortController(),
      state: uploadingState(file, 0),
    };
    records.set(blockId, record);
    notify();
    run(blockId, record);
  }

  function cancel(blockId: string): void {
    const record = records.get(blockId);
    if (record === undefined) {
      return;
    }

    // Forget the record before aborting, so a synchronous abort handler cannot report progress.
    records.delete(blockId);
    record.abort?.abort();
    notify();
  }

  function retry(blockId: string): void {
    if (disposed) {
      return;
    }

    const record = records.get(blockId);
    if (record === undefined || record.state.status !== "failed") {
      return;
    }

    start(blockId, record.file);
  }

  return {
    start,
    cancel,
    retry,
    get(blockId) {
      return records.get(blockId)?.state;
    },
    ids() {
      return [...records.keys()];
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose() {
      if (disposed) {
        return;
      }

      disposed = true;
      const active = [...records.values()];
      records.clear();
      for (const record of active) {
        record.abort?.abort();
      }

      if (active.length > 0) {
        notify();
      }

      listeners.clear();
    },
  };
}
