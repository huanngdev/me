import { describe, expect, test } from "bun:test";

import { demoFileUploadAdapter } from "../demo/demo-file-upload";

const MAX_BYTES = 25 * 1024 * 1024;
const STORAGE_MESSAGE = "This browser cannot store files for the demo.";
const LIMIT_MESSAGE = "The demo keeps files in this browser and accepts up to 25 MB.";

// Sets or removes the global indexedDB, and returns a function that puts back the old value.
function setIndexedDb(value: unknown): () => void {
  const previous = Reflect.get(globalThis, "indexedDB");
  if (value === undefined) {
    Reflect.deleteProperty(globalThis, "indexedDB");
  } else {
    Reflect.set(globalThis, "indexedDB", value);
  }

  return () => {
    if (previous === undefined) {
      Reflect.deleteProperty(globalThis, "indexedDB");
    } else {
      Reflect.set(globalThis, "indexedDB", previous);
    }
  };
}

// A File that reports a size, without allocating the bytes.
function fileOfSize(size: number): File {
  const file = new File(["x"], "big.bin", { type: "application/octet-stream" });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

// The test DOM has no IndexedDB, so these cases run with it removed on purpose.
describe("demo file upload without IndexedDB", () => {
  test("upload rejects with the documented storage message", async () => {
    const restore = setIndexedDb(undefined);
    try {
      const file = new File(["hello"], "a.txt", { type: "text/plain" });
      await expect(
        demoFileUploadAdapter.upload(file, {
          signal: new AbortController().signal,
          onProgress: () => {},
        }),
      ).rejects.toThrow(STORAGE_MESSAGE);
    } finally {
      restore();
    }
  });

  test("resolveUrl returns null for a local file reference", async () => {
    const restore = setIndexedDb(undefined);
    try {
      const signal = new AbortController().signal;
      expect(await demoFileUploadAdapter.resolveUrl?.("local-file:abc123", signal)).toBeNull();
    } finally {
      restore();
    }
  });

  test("resolveUrl returns null for other urls and malformed ids", async () => {
    const signal = new AbortController().signal;
    expect(
      await demoFileUploadAdapter.resolveUrl?.("https://example.com/a.png", signal),
    ).toBeNull();
    expect(await demoFileUploadAdapter.resolveUrl?.("local-file:../secret", signal)).toBeNull();
    expect(await demoFileUploadAdapter.resolveUrl?.("local-file:", signal)).toBeNull();
  });

  test("an aborted signal rejects with an AbortError", async () => {
    const restore = setIndexedDb(undefined);
    try {
      const aborted = new AbortController();
      aborted.abort();
      const file = new File(["hello"], "a.txt", { type: "text/plain" });
      const error = await demoFileUploadAdapter
        .upload(file, { signal: aborted.signal, onProgress: () => {} })
        .then(
          () => undefined,
          (caught: unknown) => caught,
        );
      expect(error).toBeInstanceOf(Error);
      expect(error instanceof Error ? error.name : "").toBe("AbortError");
    } finally {
      restore();
    }
  });

  test("a file over 25 MB is refused before any storage call", async () => {
    let opened = 0;
    const restore = setIndexedDb({
      open() {
        opened += 1;
        throw new Error("open must not run");
      },
    });
    try {
      await expect(
        demoFileUploadAdapter.upload(fileOfSize(MAX_BYTES + 1), {
          signal: new AbortController().signal,
          onProgress: () => {},
        }),
      ).rejects.toThrow(LIMIT_MESSAGE);
      expect(opened).toBe(0);
    } finally {
      restore();
    }
  });

  test("a file of exactly 25 MB passes the limit", async () => {
    const restore = setIndexedDb(undefined);
    try {
      await expect(
        demoFileUploadAdapter.upload(fileOfSize(MAX_BYTES), {
          signal: new AbortController().signal,
          onProgress: () => {},
        }),
      ).rejects.toThrow(STORAGE_MESSAGE);
    } finally {
      restore();
    }
  });

  test("a storage failure during open gives the storage message", async () => {
    const restore = setIndexedDb({
      open() {
        throw new Error("blocked");
      },
    });
    try {
      const file = new File(["hello"], "a.txt", { type: "text/plain" });
      await expect(
        demoFileUploadAdapter.upload(file, {
          signal: new AbortController().signal,
          onProgress: () => {},
        }),
      ).rejects.toThrow(STORAGE_MESSAGE);
    } finally {
      restore();
    }
  });
});
