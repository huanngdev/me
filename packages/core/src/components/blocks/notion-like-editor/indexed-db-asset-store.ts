import type { AssetRecord, AssetStore } from "./editor-assets";

const STORE = "assets";
const UNAVAILABLE = "Browser storage for files is unavailable.";

type StoredAsset = {
  record: AssetRecord;
  blob: Blob;
};

type IndexedDbAssetStoreOptions = {
  dbName?: string;
  getIndexedDb?: () => IDBFactory;
};

// Local browser storage only. A production adapter has to verify auth and document scope on the server.
export function createIndexedDbAssetStore(options?: IndexedDbAssetStoreOptions): AssetStore {
  const dbName = options?.dbName ?? "notion-like-editor-assets";
  let opening: Promise<IDBDatabase> | undefined;

  function database(): Promise<IDBDatabase> {
    opening ??= openDatabase(resolveFactory(options?.getIndexedDb), dbName).catch(
      (error: unknown) => {
        opening = undefined;
        throw error;
      },
    );
    return opening;
  }

  async function transaction<T>(
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore) => IDBRequest<T> | Promise<T>,
  ): Promise<T> {
    const db = await database();
    const tx = db.transaction(STORE, mode);
    const done = transactionDone(tx);
    try {
      // Attach the request handler in this turn. A later microtask misses a
      // success that the connection already has cached.
      const produced = run(tx.objectStore(STORE));
      const result = isRequest(produced) ? await requestResult(produced) : await produced;
      await done;
      return result;
    } catch (error) {
      await done.catch(() => undefined);
      throw error instanceof Error ? error : new Error(UNAVAILABLE);
    }
  }

  return {
    async put(record, blob) {
      await transaction("readwrite", (store) => store.put({ record, blob }, record.id));
    },

    async get(id) {
      const value: unknown = await transaction("readonly", (store) => store.get(id));
      if (!isStoredAsset(value)) {
        return null;
      }

      return value;
    },

    async delete(id) {
      await transaction("readwrite", (store) => store.delete(id));
    },

    async list() {
      const values: unknown = await transaction("readonly", (store) => store.getAll());
      if (!Array.isArray(values)) {
        return [];
      }

      const records: AssetRecord[] = [];
      for (const value of values) {
        if (isStoredAsset(value)) {
          records.push(value.record);
        }
      }
      return records;
    },
  };
}

function resolveFactory(getIndexedDb: (() => IDBFactory) | undefined): IDBFactory {
  try {
    if (getIndexedDb) {
      return getIndexedDb();
    }

    if (typeof indexedDB === "undefined") {
      throw new Error(UNAVAILABLE);
    }

    return indexedDB;
  } catch (error) {
    throw new Error(
      error instanceof Error && error.message === UNAVAILABLE ? error.message : UNAVAILABLE,
    );
  }
}

function openDatabase(factory: IDBFactory, dbName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      request = factory.open(dbName, 1);
    } catch {
      reject(new Error(UNAVAILABLE));
      return;
    }

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error(UNAVAILABLE));
    request.onblocked = () => reject(new Error(UNAVAILABLE));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    if (request.readyState === "done") {
      if (request.error) {
        reject(new Error(UNAVAILABLE));
        return;
      }

      resolve(request.result);
      return;
    }

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error(UNAVAILABLE));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(new Error(UNAVAILABLE));
    transaction.onabort = () => reject(new Error(UNAVAILABLE));
  });
}

function isRequest(value: unknown): value is IDBRequest {
  return typeof value === "object" && value !== null && "onsuccess" in value && "result" in value;
}

function isStoredAsset(value: unknown): value is StoredAsset {
  if (typeof value !== "object" || value === null || !("record" in value) || !("blob" in value)) {
    return false;
  }

  return isAssetRecord(value.record) && value.blob instanceof Blob;
}

function isAssetRecord(value: unknown): value is AssetRecord {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  if (!("id" in value) || typeof value.id !== "string") {
    return false;
  }

  if (!("kind" in value) || !isKind(value.kind)) {
    return false;
  }

  if (!("name" in value) || typeof value.name !== "string") {
    return false;
  }

  if (!("mimeType" in value) || typeof value.mimeType !== "string") {
    return false;
  }

  if (!("byteSize" in value) || typeof value.byteSize !== "number") {
    return false;
  }

  return "createdAt" in value && typeof value.createdAt === "string";
}

function isKind(value: unknown): value is AssetRecord["kind"] {
  return value === "image" || value === "video" || value === "audio" || value === "file";
}
