import { describe, expect, test } from "bun:test";

import { migrateEditorDocument } from "./editor-document-migrate";
import { parseEditorDocument } from "./editor-document-validate";
import { createLocalStorageAdapter, removeStaleDemoDocuments } from "./local-storage-adapter";
import { DEMO_DOCUMENT_ID } from "./demo-document";
import type { EditorValue } from "./editor-value";
import { createMemoryStorage, expectOk, isRecord } from "./test-utils";

const content = [
  {
    type: "p",
    id: "block-1",
    children: [{ text: "Persist me" }],
  },
] satisfies EditorValue;

const QUOTA_MESSAGE =
  "Browser storage is full. Delete unused data or copy your document before closing this tab.";
const UNAVAILABLE_MESSAGE =
  "Browser storage is unavailable. Copy your document before closing this tab.";

function createEventTarget() {
  const listeners = new Set<EventListener>();
  const target: Pick<Window, "addEventListener" | "removeEventListener"> = {
    addEventListener(_type: string, listener: EventListenerOrEventListenerObject | null) {
      if (typeof listener === "function") {
        listeners.add(listener);
      }
    },
    removeEventListener(_type: string, listener: EventListenerOrEventListenerObject | null) {
      if (typeof listener === "function") {
        listeners.delete(listener);
      }
    },
  };

  return {
    target,
    dispatch(key: string | null, newValue: string | null) {
      const event = new Event("storage");
      Object.assign(event, { key, newValue });
      for (const listener of listeners) {
        listener(event);
      }
    },
    dispatchRaw(event: Event) {
      for (const listener of listeners) {
        listener(event);
      }
    },
  };
}

describe("local storage", () => {
  test("save and load round-trip through parse", async () => {
    const storage = createMemoryStorage();
    const adapter = createLocalStorageAdapter({ storage, target: createEventTarget().target });

    const first = await adapter.save({
      documentId: "demo",
      schemaVersion: 1,
      baseRevision: 0,
      content,
    });

    expect(first).toEqual({ status: "saved", revision: 1 });

    const loaded = await adapter.load("demo");
    const parsed = expectOk(parseEditorDocument(migrateEditorDocument(loaded, "demo")));

    expect(parsed.document).toEqual({
      schemaVersion: 1,
      documentId: "demo",
      revision: 1,
      content,
    });

    const second = await adapter.save({
      documentId: "demo",
      schemaVersion: 1,
      baseRevision: 1,
      content,
    });

    expect(second).toEqual({ status: "saved", revision: 2 });
  });

  test("load of a missing key returns null", async () => {
    const storage = createMemoryStorage();
    const adapter = createLocalStorageAdapter({ storage, target: createEventTarget().target });

    const loaded = await adapter.load("demo");

    expect(loaded).toBeNull();
  });

  test("a stale base revision is a conflict", async () => {
    const storage = createMemoryStorage();
    const adapter = createLocalStorageAdapter({ storage, target: createEventTarget().target });
    await adapter.save({
      documentId: "demo",
      schemaVersion: 1,
      baseRevision: 0,
      content,
    });

    const result = await adapter.save({
      documentId: "demo",
      schemaVersion: 1,
      baseRevision: 0,
      content,
    });

    expect(result).toEqual({ status: "conflict", currentRevision: 1 });
  });

  test("a quota error returns an actionable message", async () => {
    const storage = createMemoryStorage({
      throwOnSet: new DOMException("quota", "QuotaExceededError"),
    });
    const adapter = createLocalStorageAdapter({ storage, target: createEventTarget().target });

    const result = await adapter.save({
      documentId: "demo",
      schemaVersion: 1,
      baseRevision: 0,
      content,
    });

    expect(result).toEqual({ status: "error", reason: "quota", message: QUOTA_MESSAGE });
  });

  test("a legacy quota code 22 returns quota", async () => {
    const storage = createMemoryStorage({
      throwOnSet: { name: "NS_ERROR_DOM_QUOTA_REACHED", code: 22 },
    });
    const adapter = createLocalStorageAdapter({ storage, target: createEventTarget().target });

    const result = await adapter.save({
      documentId: "demo",
      schemaVersion: 1,
      baseRevision: 0,
      content,
    });

    expect(result).toEqual({ status: "error", reason: "quota", message: QUOTA_MESSAGE });
  });

  test("a thrown string is unavailable rather than quota", async () => {
    const storage = createMemoryStorage({ throwOnSet: "blocked" });
    const adapter = createLocalStorageAdapter({ storage, target: createEventTarget().target });

    const result = await adapter.save({
      documentId: "demo",
      schemaVersion: 1,
      baseRevision: 0,
      content,
    });

    expect(result).toEqual({
      status: "error",
      reason: "unavailable",
      message: UNAVAILABLE_MESSAGE,
    });
  });

  test("storage access failures return unavailable", async () => {
    const storage = createMemoryStorage({
      throwOnGet: new DOMException("disabled", "SecurityError"),
    });
    const adapter = createLocalStorageAdapter({ storage, target: createEventTarget().target });

    const result = await adapter.save({
      documentId: "demo",
      schemaVersion: 1,
      baseRevision: 0,
      content,
    });

    expect(result).toEqual({
      status: "error",
      reason: "unavailable",
      message: UNAVAILABLE_MESSAGE,
    });
  });

  test("corrupt JSON is returned as a raw string and parses as invalid", async () => {
    const storage = createMemoryStorage();
    storage.setItem("notion-like-editor:demo", "{bad");
    const adapter = createLocalStorageAdapter({ storage, target: createEventTarget().target });

    const loaded = await adapter.load("demo");
    const parsed = parseEditorDocument(migrateEditorDocument(loaded, "demo"));

    expect(loaded).toBe("{bad");
    expect(parsed.status).toBe("invalid");
  });

  test("stored null is replaced by the first save", async () => {
    const storage = createMemoryStorage();
    storage.setItem("notion-like-editor:demo", "null");
    const adapter = createLocalStorageAdapter({ storage, target: createEventTarget().target });

    const result = await adapter.save({
      documentId: "demo",
      schemaVersion: 1,
      baseRevision: 0,
      content,
    });

    expect(result).toEqual({ status: "saved", revision: 1 });
  });

  test("a fractional stored revision is replaced by the first save", async () => {
    const storage = createMemoryStorage();
    storage.setItem("notion-like-editor:demo", JSON.stringify({ revision: 1.5 }));
    const adapter = createLocalStorageAdapter({ storage, target: createEventTarget().target });

    const result = await adapter.save({
      documentId: "demo",
      schemaVersion: 1,
      baseRevision: 0,
      content,
    });

    expect(result).toEqual({ status: "saved", revision: 1 });
  });

  test("unreadable JSON is replaced when the base revision is 0", async () => {
    const storage = createMemoryStorage();
    storage.setItem("notion-like-editor:demo", "{bad");
    const adapter = createLocalStorageAdapter({ storage, target: createEventTarget().target });

    const result = await adapter.save({
      documentId: "demo",
      schemaVersion: 1,
      baseRevision: 0,
      content,
    });
    const loaded = await adapter.load("demo");
    const parsed = expectOk(parseEditorDocument(migrateEditorDocument(loaded, "demo")));

    expect(result).toEqual({ status: "saved", revision: 1 });
    expect(parsed.document.revision).toBe(1);
    expect(parsed.document.content).toEqual(content);
  });

  test("unreadable JSON conflicts when the base revision is not 0", async () => {
    const storage = createMemoryStorage();
    storage.setItem("notion-like-editor:demo", "{bad");
    const adapter = createLocalStorageAdapter({ storage, target: createEventTarget().target });

    const result = await adapter.save({
      documentId: "demo",
      schemaVersion: 1,
      baseRevision: 1,
      content,
    });

    expect(result).toEqual({ status: "conflict", currentRevision: 0 });
  });

  test("storage events for other keys, recovery keys, and null values are ignored", () => {
    const storage = createMemoryStorage();
    const events = createEventTarget();
    const adapter = createLocalStorageAdapter({ storage, target: events.target });
    const seen: number[] = [];
    adapter.subscribe?.("demo", (revision) => {
      seen.push(revision);
    });

    events.dispatch("other", JSON.stringify({ revision: 9 }));
    events.dispatch("notion-like-editor:demo:recovery:conflict", JSON.stringify({ revision: 3 }));
    events.dispatch("notion-like-editor:demo", null);

    expect(seen).toEqual([]);
  });

  test("a storage event delivers the new revision", () => {
    const storage = createMemoryStorage();
    const events = createEventTarget();
    const adapter = createLocalStorageAdapter({ storage, target: events.target });
    const seen: number[] = [];
    adapter.subscribe?.("demo", (revision) => {
      seen.push(revision);
    });

    events.dispatch("notion-like-editor:demo", JSON.stringify({ revision: 4 }));

    expect(seen).toEqual([4]);
  });

  test("unsubscribe stops later storage events", () => {
    const storage = createMemoryStorage();
    const events = createEventTarget();
    const adapter = createLocalStorageAdapter({ storage, target: events.target });
    const seen: number[] = [];
    const unsubscribe = adapter.subscribe?.("demo", (revision) => {
      seen.push(revision);
    });
    events.dispatch("notion-like-editor:demo", JSON.stringify({ revision: 4 }));

    unsubscribe?.();
    events.dispatch("notion-like-editor:demo", JSON.stringify({ revision: 5 }));

    expect(seen).toEqual([4]);
  });

  test("a storage event without a key is ignored", () => {
    const events = createEventTarget();
    const adapter = createLocalStorageAdapter({
      storage: createMemoryStorage(),
      target: events.target,
    });
    const seen: number[] = [];
    adapter.subscribe?.("demo", (revision) => {
      seen.push(revision);
    });

    events.dispatchRaw(new Event("storage"));

    expect(seen).toEqual([]);
  });

  test("recovery snapshots keep a separate key per reason", async () => {
    const storage = createMemoryStorage();
    const adapter = createLocalStorageAdapter({ storage, target: createEventTarget().target });
    const snapshot = {
      documentId: "demo",
      revision: 0,
      savedAt: "2026-10-05T00:00:00.000Z",
      content,
    };

    await adapter.saveRecovery({ ...snapshot, reason: "replaced-invalid", raw: "{bad" });
    await adapter.saveRecovery({ ...snapshot, reason: "conflict" });
    await adapter.saveRecovery({ ...snapshot, reason: "save-failed" });
    const replaced = storage.getItem("notion-like-editor:demo:recovery:replaced-invalid");
    const conflict = storage.getItem("notion-like-editor:demo:recovery:conflict");
    const failed = storage.getItem("notion-like-editor:demo:recovery:save-failed");
    const parsed: unknown = replaced === null ? undefined : JSON.parse(replaced);

    expect(replaced).not.toBeNull();
    expect(conflict).not.toBeNull();
    expect(failed).not.toBeNull();
    expect(isRecord(parsed) && parsed.raw).toBe("{bad");
  });

  test("a throwing storage getter does not crash adapter creation", async () => {
    const events = createEventTarget();
    const adapter = createLocalStorageAdapter({
      get storage(): Storage {
        throw new DOMException("blocked", "SecurityError");
      },
      target: events.target,
    });
    const seen: number[] = [];
    const unsubscribe = adapter.subscribe?.("demo", (revision) => {
      seen.push(revision);
    });

    events.dispatch("notion-like-editor:demo", JSON.stringify({ revision: 2 }));

    expect(seen).toEqual([2]);

    unsubscribe?.();
    const result = await adapter.save({
      documentId: "demo",
      schemaVersion: 1,
      baseRevision: 0,
      content,
    });

    expect(result).toEqual({
      status: "error",
      reason: "unavailable",
      message: UNAVAILABLE_MESSAGE,
    });
    await expect(adapter.load("demo")).rejects.toBeInstanceOf(DOMException);
  });
});

describe("stale demo documents", () => {
  test("cleanup drops old demo copies and keeps recovery and other documents", () => {
    const storage = createMemoryStorage();
    const currentKey = `notion-like-editor:${DEMO_DOCUMENT_ID}`;
    const outdatedKey = "notion-like-editor:demo-ffffffff";

    expect(outdatedKey).not.toBe(currentKey);

    storage.setItem(currentKey, "current");
    storage.setItem("notion-like-editor:demo", "legacy");
    storage.setItem(outdatedKey, "outdated");
    storage.setItem("notion-like-editor:demo:recovery:conflict", "legacy recovery");
    storage.setItem(`${currentKey}:recovery:save-failed`, "current recovery");
    storage.setItem(`${outdatedKey}:recovery:conflict`, "outdated recovery");
    storage.setItem("notion-like-editor:other", "other");

    removeStaleDemoDocuments(storage, DEMO_DOCUMENT_ID);

    expect(storage.getItem(currentKey)).toBe("current");
    expect(storage.getItem("notion-like-editor:demo")).toBeNull();
    expect(storage.getItem(outdatedKey)).toBeNull();
    expect(storage.getItem("notion-like-editor:demo:recovery:conflict")).toBe("legacy recovery");
    expect(storage.getItem(`${currentKey}:recovery:save-failed`)).toBe("current recovery");
    expect(storage.getItem(`${outdatedKey}:recovery:conflict`)).toBe("outdated recovery");
    expect(storage.getItem("notion-like-editor:other")).toBe("other");
  });

  test("cleanup survives storage that throws", () => {
    const storage: Storage = {
      get length(): number {
        throw new DOMException("blocked", "SecurityError");
      },
      clear() {
        throw new DOMException("blocked", "SecurityError");
      },
      getItem() {
        throw new DOMException("blocked", "SecurityError");
      },
      key() {
        throw new DOMException("blocked", "SecurityError");
      },
      removeItem() {
        throw new DOMException("blocked", "SecurityError");
      },
      setItem() {
        throw new DOMException("blocked", "SecurityError");
      },
    };

    expect(() => removeStaleDemoDocuments(storage, DEMO_DOCUMENT_ID)).not.toThrow();
  });
});
