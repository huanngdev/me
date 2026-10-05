import { describe, expect, test } from "bun:test";

import type { AssetRecord } from "./editor-assets";
import { createIndexedDbAssetStore } from "./indexed-db-asset-store";

const MESSAGE = "Browser storage for files is unavailable.";

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

describe("indexed db asset store", () => {
  test("a missing IndexedDB rejects with an actionable message", async () => {
    const store = createIndexedDbAssetStore({ dbName: "missing-indexeddb" });
    await expect(store.list()).rejects.toThrow(MESSAGE);
  });

  test("a blocked factory rejects with an actionable message", async () => {
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
});
