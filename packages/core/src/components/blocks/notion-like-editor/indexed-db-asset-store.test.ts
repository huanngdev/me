import { describe, expect, test } from "bun:test";

import type { AssetRecord } from "./editor-assets";
import { createIndexedDbAssetStore } from "./indexed-db-asset-store";

const MESSAGE = "Browser storage for files is unavailable.";

type Outcome = "ok" | "error" | "blocked" | "abort" | "request-error" | "bad-list";
type StoreData = Map<string, unknown>;
type DatabaseData = Map<string, StoreData>;

class BlockedIndexedDb implements IDBFactory {
  cmp(): number {
    return 0;
  }

  databases(): Promise<IDBDatabaseInfo[]> {
    return Promise.resolve([]);
  }

  deleteDatabase(): IDBOpenDBRequest {
    throw new Error("blocked");
  }

  open(): IDBOpenDBRequest {
    throw new Error("blocked");
  }
}

class VersionEvent extends Event implements IDBVersionChangeEvent {
  readonly oldVersion = 0;
  readonly newVersion: number | null = 1;
}

function stringList(names: readonly string[]) {
  const values = [...names];
  const list = {
    get length() {
      return values.length;
    },
    contains(value: string) {
      return values.includes(value);
    },
    item(index: number) {
      return values[index] ?? null;
    },
  };
  if (typeof list.contains !== "function" || list.length !== values.length) {
    throw new Error("Expected a string list.");
  }

  return list;
}

type RequestListener = (event: Event) => void;

class MemoryRequest<T> extends EventTarget {
  #success: RequestListener | null = null;
  #error: RequestListener | null = null;
  readonly readyState: IDBRequestReadyState = "done";
  readonly error: DOMException | null;
  readonly source: MemoryStore;
  readonly transaction: MemoryTransaction | null;

  constructor(
    readonly result: T,
    source: MemoryStore,
    transaction: MemoryTransaction | null,
    private readonly failed: boolean,
  ) {
    super();
    this.error = failed ? new DOMException("fail") : null;
    this.source = source;
    this.transaction = transaction;
  }

  get onsuccess(): RequestListener | null {
    return this.#success;
  }

  set onsuccess(handler: RequestListener | null) {
    this.#success = handler;
    if (handler && !this.failed) {
      queueMicrotask(() => handler(new Event("success")));
    }
  }

  get onerror(): RequestListener | null {
    return this.#error;
  }

  set onerror(handler: RequestListener | null) {
    this.#error = handler;
    if (handler && this.failed) {
      queueMicrotask(() => handler(new Event("error")));
    }
  }
}

class MemoryStore {
  readonly autoIncrement = false;
  readonly keyPath = null;
  name: string;
  readonly transaction: MemoryTransaction;

  constructor(
    readonly storeName: string,
    private readonly data: StoreData,
    transaction: MemoryTransaction,
    private readonly outcome: Outcome,
  ) {
    this.name = storeName;
    this.transaction = transaction;
  }

  get indexNames() {
    return stringList([]);
  }

  add(): IDBRequest<IDBValidKey> {
    throw new Error("add is not used by these tests.");
  }

  clear(): IDBRequest<undefined> {
    throw new Error("clear is not used by these tests.");
  }

  count(): IDBRequest<number> {
    throw new Error("count is not used by these tests.");
  }

  createIndex(): IDBIndex {
    throw new Error("createIndex is not used by these tests.");
  }

  delete(query: IDBValidKey | IDBKeyRange): MemoryRequest<undefined> {
    if (typeof query === "string") {
      this.data.delete(query);
    }
    return this.request(undefined);
  }

  deleteIndex(): void {
    throw new Error("deleteIndex is not used by these tests.");
  }

  get(query: IDBValidKey | IDBKeyRange): MemoryRequest<unknown> {
    const value = typeof query === "string" ? this.data.get(query) : undefined;
    return this.request(value);
  }

  getAll(): MemoryRequest<unknown> {
    if (this.outcome === "bad-list") {
      return this.request<unknown>("nope");
    }
    return this.request<unknown>([...this.data.values()]);
  }

  getAllKeys(): IDBRequest<IDBValidKey[]> {
    throw new Error("getAllKeys is not used by these tests.");
  }

  getKey(): IDBRequest<IDBValidKey | undefined> {
    throw new Error("getKey is not used by these tests.");
  }

  index(): IDBIndex {
    throw new Error("index is not used by these tests.");
  }

  openCursor(): IDBRequest<IDBCursorWithValue | null> {
    throw new Error("openCursor is not used by these tests.");
  }

  openKeyCursor(): IDBRequest<IDBCursor | null> {
    throw new Error("openKeyCursor is not used by these tests.");
  }

  put(value: unknown, key?: IDBValidKey): MemoryRequest<string> {
    const id = typeof key === "string" ? key : "";
    this.data.set(id, value);
    return this.request(id);
  }

  private request<T>(result: T): MemoryRequest<T> {
    return new MemoryRequest(result, this, this.transaction, this.outcome === "request-error");
  }
}

class MemoryTransaction extends EventTarget {
  #abort: RequestListener | null = null;
  #complete: RequestListener | null = null;
  #error: RequestListener | null = null;
  readonly durability: IDBTransactionDurability = "default";
  readonly error = null;
  readonly mode: IDBTransactionMode;
  readonly objectStoreNames: ReturnType<typeof stringList>;

  constructor(
    readonly db: MemoryDatabase,
    private readonly stores: DatabaseData,
    mode: IDBTransactionMode,
    private readonly outcome: Outcome,
  ) {
    super();
    this.mode = mode;
    this.objectStoreNames = stringList([...stores.keys()]);
  }

  abort(): void {
    return undefined;
  }

  commit(): void {
    return undefined;
  }

  objectStore(name: string): MemoryStore {
    const data = this.stores.get(name);
    if (!data) {
      throw new Error(`Missing store ${name}.`);
    }
    return new MemoryStore(name, data, this, this.outcome);
  }

  get oncomplete(): RequestListener | null {
    return this.#complete;
  }

  set oncomplete(handler: RequestListener | null) {
    this.#complete = handler;
    if (handler && this.outcome !== "abort") {
      queueMicrotask(() => handler(new Event("complete")));
    }
  }

  get onabort(): RequestListener | null {
    return this.#abort;
  }

  set onabort(handler: RequestListener | null) {
    this.#abort = handler;
    if (handler && this.outcome === "abort") {
      queueMicrotask(() => handler(new Event("abort")));
    }
  }

  get onerror(): RequestListener | null {
    return this.#error;
  }

  set onerror(handler: RequestListener | null) {
    this.#error = handler;
  }
}

class MemoryDatabase extends EventTarget {
  onabort: IDBDatabase["onabort"] = null;
  onclose: IDBDatabase["onclose"] = null;
  onerror: IDBDatabase["onerror"] = null;
  onversionchange: IDBDatabase["onversionchange"] = null;
  readonly version = 1;

  constructor(
    readonly name: string,
    private readonly stores: DatabaseData,
    private readonly outcome: Outcome,
  ) {
    super();
  }

  get objectStoreNames() {
    return stringList([...this.stores.keys()]);
  }

  close(): void {
    return undefined;
  }

  createObjectStore(name: string): MemoryStore {
    const data: StoreData = new Map();
    this.stores.set(name, data);
    return new MemoryStore(
      name,
      data,
      new MemoryTransaction(this, this.stores, "versionchange", this.outcome),
      this.outcome,
    );
  }

  deleteObjectStore(name: string): void {
    this.stores.delete(name);
  }

  transaction(storeNames: string | string[], mode?: IDBTransactionMode): MemoryTransaction {
    return new MemoryTransaction(this, this.stores, mode ?? "readonly", this.outcome);
  }
}

class MemoryOpenRequest extends EventTarget {
  onblocked: RequestListener | null = null;
  onerror: RequestListener | null = null;
  onsuccess: RequestListener | null = null;
  onupgradeneeded: RequestListener | null = null;
  readonly readyState: IDBRequestReadyState = "done";
  readonly error: DOMException | null = null;
  readonly source: MemoryStore;
  readonly transaction: MemoryTransaction | null = null;
  readonly result: MemoryDatabase;

  constructor(database: MemoryDatabase) {
    super();
    this.result = database;
    this.source = new MemoryStore(
      "unused",
      new Map(),
      new MemoryTransaction(database, new Map(), "readonly", "ok"),
      "ok",
    );
  }
}

class MemoryIndexedDb {
  readonly databasesData = new Map<string, DatabaseData>();

  constructor(private readonly outcome: Outcome = "ok") {}

  cmp(): number {
    return 0;
  }

  databases(): Promise<IDBDatabaseInfo[]> {
    return Promise.resolve([]);
  }

  deleteDatabase(): IDBOpenDBRequest {
    throw new Error("deleteDatabase is not used by these tests.");
  }

  open(name: string): MemoryOpenRequest {
    let stores = this.databasesData.get(name);
    if (!stores) {
      stores = new Map();
      this.databasesData.set(name, stores);
    }
    const request = new MemoryOpenRequest(new MemoryDatabase(name, stores, this.outcome));
    const outcome = this.outcome;
    queueMicrotask(() => arm(request, outcome));
    return request;
  }

  seed(dbName: string, key: string, value: unknown): void {
    const stores = this.databasesData.get(dbName);
    const data = stores?.get("assets");
    if (!data) {
      throw new Error("The asset store is not open yet.");
    }
    data.set(key, value);
  }
}

function arm(request: MemoryOpenRequest, outcome: Outcome): void {
  const upgrade = request.onupgradeneeded;
  const success = request.onsuccess;
  const error = request.onerror;
  const blocked = request.onblocked;
  if (outcome === "error" && error) {
    queueMicrotask(() => error(new Event("error")));
    return;
  }
  if (outcome === "blocked" && blocked) {
    queueMicrotask(() => blocked(new VersionEvent("blocked")));
    return;
  }
  if (upgrade) {
    queueMicrotask(() => upgrade(new VersionEvent("upgradeneeded")));
  }
  if (success) {
    queueMicrotask(() => success(new Event("success")));
  }
}

function isIndexedDb(value: unknown): value is IDBFactory {
  return (
    typeof value === "object" &&
    value !== null &&
    "open" in value &&
    typeof value.open === "function"
  );
}

function indexedDbOf(factory: MemoryIndexedDb): IDBFactory {
  const boundary: unknown = factory;
  if (!isIndexedDb(boundary)) {
    throw new Error("Expected IndexedDB.");
  }

  return boundary;
}

function record(): AssetRecord {
  return {
    id: "asset-1",
    kind: "file",
    name: "notes.bin",
    mimeType: "application/octet-stream",
    byteSize: 4,
    createdAt: "2026-10-05T00:00:00.000Z",
  };
}

describe("indexed db", () => {
  test("a missing IndexedDB rejects with an actionable message", async () => {
    const store = createIndexedDbAssetStore({ dbName: "missing-indexeddb" });

    await expect(store.list()).rejects.toThrow(MESSAGE);
  });

  test("a factory whose open throws rejects with an actionable message", async () => {
    const store = createIndexedDbAssetStore({
      dbName: "blocked-indexeddb",
      getIndexedDb: () => new BlockedIndexedDb(),
    });

    await expect(store.put(record(), new Blob([Uint8Array.from([1, 2, 3, 4])]))).rejects.toThrow(
      MESSAGE,
    );
    await expect(store.get("asset-1")).rejects.toThrow(MESSAGE);
    await expect(store.delete("asset-1")).rejects.toThrow(MESSAGE);
    await expect(store.list()).rejects.toThrow(MESSAGE);
  });

  test("a factory getter that throws rejects with an actionable message", async () => {
    const store = createIndexedDbAssetStore({
      getIndexedDb() {
        throw new Error("The user blocked storage.");
      },
    });

    await expect(store.list()).rejects.toThrow(MESSAGE);
  });

  test("an open error rejects with an actionable message", async () => {
    const factory = new MemoryIndexedDb("error");
    const store = createIndexedDbAssetStore({
      dbName: "open-error",
      getIndexedDb: () => indexedDbOf(factory),
    });

    await expect(store.list()).rejects.toThrow(MESSAGE);
  });

  test("a blocked open rejects with an actionable message", async () => {
    const factory = new MemoryIndexedDb("blocked");
    const store = createIndexedDbAssetStore({
      dbName: "open-blocked",
      getIndexedDb: () => indexedDbOf(factory),
    });

    await expect(store.list()).rejects.toThrow(MESSAGE);
  });

  test("put, get, list, and delete round-trip a file", async () => {
    const factory = new MemoryIndexedDb();
    const store = createIndexedDbAssetStore({
      dbName: "files",
      getIndexedDb: () => indexedDbOf(factory),
    });
    const blob = new Blob([Uint8Array.from([1, 2, 3, 4])]);

    await store.put(record(), blob);
    const loaded = await store.get("asset-1");
    const listed = await store.list();

    expect(loaded?.record).toEqual(record());
    expect(loaded?.blob).toBeInstanceOf(Blob);
    expect(listed).toEqual([record()]);

    await store.delete("asset-1");
    const after = await store.get("asset-1");
    const remaining = await store.list();

    expect(after).toBeNull();
    expect(remaining).toEqual([]);
  });

  test("a second connection sees the stored file without creating the store again", async () => {
    const factory = new MemoryIndexedDb();
    const first = createIndexedDbAssetStore({
      dbName: "shared",
      getIndexedDb: () => indexedDbOf(factory),
    });
    await first.put(record(), new Blob([Uint8Array.from([1])]));

    const second = createIndexedDbAssetStore({
      dbName: "shared",
      getIndexedDb: () => indexedDbOf(factory),
    });
    const loaded = await second.get("asset-1");

    expect(loaded?.record.id).toBe("asset-1");
  });

  test("list skips a corrupt record and get returns null", async () => {
    const factory = new MemoryIndexedDb();
    const store = createIndexedDbAssetStore({
      dbName: "corrupt",
      getIndexedDb: () => indexedDbOf(factory),
    });
    await store.put(record(), new Blob([Uint8Array.from([1, 2, 3, 4])]));
    factory.seed("corrupt", "bad", { record: { id: 1 }, blob: "nope" });

    const listed = await store.list();
    const corrupt = await store.get("bad");
    const missing = await store.get("missing");

    expect(listed).toEqual([record()]);
    expect(corrupt).toBeNull();
    expect(missing).toBeNull();
  });

  test("a failed request rejects with an actionable message", async () => {
    const factory = new MemoryIndexedDb("request-error");
    const store = createIndexedDbAssetStore({
      dbName: "request-error",
      getIndexedDb: () => indexedDbOf(factory),
    });

    await expect(store.put(record(), new Blob([Uint8Array.from([1])]))).rejects.toThrow(MESSAGE);
  });

  test("an aborted transaction rejects with an actionable message", async () => {
    const factory = new MemoryIndexedDb("abort");
    const store = createIndexedDbAssetStore({
      dbName: "abort",
      getIndexedDb: () => indexedDbOf(factory),
    });

    await expect(store.list()).rejects.toThrow(MESSAGE);
  });

  test("a list result that is not an array is empty", async () => {
    const factory = new MemoryIndexedDb("bad-list");
    const store = createIndexedDbAssetStore({
      dbName: "bad-list",
      getIndexedDb: () => indexedDbOf(factory),
    });

    const listed = await store.list();

    expect(listed).toEqual([]);
  });
});
