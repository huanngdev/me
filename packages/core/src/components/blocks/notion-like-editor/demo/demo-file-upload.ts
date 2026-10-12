import { nanoid } from "platejs";

import type {
  FileUploadAdapter,
  FileUploadOptions,
  UploadedFile,
} from "../lib/features/editor-file-upload";

// The demo keeps files in this browser only. Nothing is sent over the network.
const DB_NAME = "notion-like-editor-demo-files";
const STORE_NAME = "files";
const LOCAL_FILE_PREFIX = "local-file:";
// nanoid uses this alphabet. The check keeps any other text out of the store lookup.
const LOCAL_FILE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_BYTES = 25 * 1024 * 1024;
const LIMIT_MESSAGE = "The demo keeps files in this browser and accepts up to 25 MB.";
const STORAGE_MESSAGE = "This browser cannot store files for the demo.";
// Total simulated time for one upload. The progress steps split it evenly.
const DEMO_UPLOAD_MS = 600;
const DEMO_PROGRESS_STEPS = 4;

let databasePromise: Promise<IDBDatabase> | undefined;

function abortError(): Error {
  const error = new Error("The upload was aborted.");
  error.name = "AbortError";
  return error;
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError());
      return;
    }

    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(abortError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

// Read only inside a method. A missing or blocked IndexedDB rejects here, not at import.
function indexedDbFactory(): IDBFactory | null {
  try {
    return typeof indexedDB === "undefined" ? null : indexedDB;
  } catch {
    return null;
  }
}

function requestDatabase(): Promise<IDBDatabase> {
  const factory = indexedDbFactory();
  if (factory === null) {
    return Promise.reject(new Error(STORAGE_MESSAGE));
  }

  return new Promise((resolve, reject) => {
    const request = factory.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(new Error(STORAGE_MESSAGE));
    };
  });
}

// Any failure to open becomes the storage message. A failed open is not cached, so the next call tries again.
function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise === undefined) {
    databasePromise = requestDatabase().catch(() => {
      databasePromise = undefined;
      throw new Error(STORAGE_MESSAGE);
    });
  }

  return databasePromise;
}

function putFile(db: IDBDatabase, id: string, file: File): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(file, id);
    transaction.oncomplete = () => {
      resolve();
    };
    transaction.onerror = () => {
      reject(new Error(STORAGE_MESSAGE));
    };
    transaction.onabort = () => {
      reject(new Error(STORAGE_MESSAGE));
    };
  });
}

function removeFile(db: IDBDatabase, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(id);
    transaction.oncomplete = () => {
      resolve();
    };
    transaction.onerror = () => {
      reject(new Error(STORAGE_MESSAGE));
    };
    transaction.onabort = () => {
      reject(new Error(STORAGE_MESSAGE));
    };
  });
}

function readFile(db: IDBDatabase, id: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(id);
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(new Error(STORAGE_MESSAGE));
    };
  });
}

async function uploadDemoFile(file: File, options: FileUploadOptions): Promise<UploadedFile> {
  const { signal, onProgress } = options;
  if (file.size > MAX_BYTES) {
    throw new Error(LIMIT_MESSAGE);
  }

  if (signal.aborted) {
    throw abortError();
  }

  // Opened before the simulated wait, so a browser that cannot store files fails fast.
  const db = await openDatabase();
  const stepMs = DEMO_UPLOAD_MS / DEMO_PROGRESS_STEPS;
  for (let step = 1; step <= DEMO_PROGRESS_STEPS; step += 1) {
    await wait(stepMs, signal);
    if (step < DEMO_PROGRESS_STEPS) {
      onProgress(step / DEMO_PROGRESS_STEPS);
    }
  }

  const id = nanoid();
  try {
    await putFile(db, id, file);
  } catch {
    throw new Error(STORAGE_MESSAGE);
  }

  if (signal.aborted) {
    // The write finished after the cancel. Remove it, so the cancelled upload leaves nothing behind.
    void removeFile(db, id).catch(() => undefined);
    throw abortError();
  }

  onProgress(1);
  return {
    url: `${LOCAL_FILE_PREFIX}${id}`,
    name: file.name,
    size: file.size,
    mime: file.type,
  };
}

function localFileId(url: string): string | null {
  if (!url.startsWith(LOCAL_FILE_PREFIX)) {
    return null;
  }

  const id = url.slice(LOCAL_FILE_PREFIX.length);
  return LOCAL_FILE_ID.test(id) ? id : null;
}

async function loadObjectUrl(id: string): Promise<string | null> {
  try {
    const db = await openDatabase();
    const blob = await readFile(db, id);
    return blob instanceof Blob ? URL.createObjectURL(blob) : null;
  } catch {
    return null;
  }
}

// One object URL per id for the page lifetime. Concurrent calls share one lookup.
const objectUrls = new Map<string, Promise<string | null>>();

export const demoFileUploadAdapter: FileUploadAdapter = {
  upload(file, options) {
    return uploadDemoFile(file, options);
  },
  resolveUrl(url, signal) {
    const id = localFileId(url);
    if (id === null || signal.aborted) {
      return Promise.resolve(null);
    }

    let pending = objectUrls.get(id);
    if (pending === undefined) {
      pending = loadObjectUrl(id);
      objectUrls.set(id, pending);
      // A failure is not kept, so a later call can try again.
      void pending.then((result) => {
        if (result === null) {
          objectUrls.delete(id);
        }
      });
    }

    return pending;
  },
};
