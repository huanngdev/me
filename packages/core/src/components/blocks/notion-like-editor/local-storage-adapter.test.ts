import { describe, expect, test } from "bun:test";

import { migrateEditorDocument } from "./editor-document-migrate";
import { parseEditorDocument } from "./editor-document-validate";
import { createLocalStorageAdapter } from "./local-storage-adapter";
import type { EditorValue } from "./editor-value";

const content = [
  {
    type: "p",
    id: "block-1",
    children: [{ text: "Persist me" }],
  },
] satisfies EditorValue;

function createMemoryStorage(options?: { throwOnGet?: unknown; throwOnSet?: unknown }): Storage {
  const values = new Map<string, string>();

  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key) {
      if (options?.throwOnGet) {
        throw options.throwOnGet;
      }

      return values.get(key) ?? null;
    },
    key(index) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      if (options?.throwOnSet) {
        throw options.throwOnSet;
      }

      values.set(key, value);
    },
  };
}

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
  };
}

describe("local storage adapter", () => {
  test("save and load round-trip through parseEditorDocument", async () => {
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
    const parsed = parseEditorDocument(migrateEditorDocument(loaded, "demo"));
    expect(parsed.status).toBe("ok");
    if (parsed.status !== "ok") {
      throw new Error("expected a valid document");
    }

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

    expect(result.status).toBe("error");
    if (result.status !== "error") {
      throw new Error("expected an error");
    }

    expect(result.reason).toBe("quota");
    expect(result.message).toBe(
      "Browser storage is full. Delete unused data or copy your document before closing this tab.",
    );
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

    expect(result).toMatchObject({ status: "error", reason: "quota" });
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

    expect(result.status).toBe("error");
    if (result.status !== "error") {
      throw new Error("expected an error");
    }

    expect(result.reason).toBe("unavailable");
    expect(result.message).toBe(
      "Browser storage is unavailable. Copy your document before closing this tab.",
    );
  });

  test("corrupt JSON is returned as a raw string and parses as invalid", async () => {
    const storage = createMemoryStorage();
    storage.setItem("notion-like-editor:demo", "{bad");
    const adapter = createLocalStorageAdapter({ storage, target: createEventTarget().target });
    const loaded = await adapter.load("demo");

    expect(loaded).toBe("{bad");
    const parsed = parseEditorDocument(migrateEditorDocument(loaded, "demo"));
    expect(parsed.status).toBe("invalid");
  });

  test("storage events for other keys are ignored", () => {
    const storage = createMemoryStorage();
    const events = createEventTarget();
    const adapter = createLocalStorageAdapter({ storage, target: events.target });
    const seen: number[] = [];
    const unsubscribe = adapter.subscribe?.("demo", (revision) => {
      seen.push(revision);
    });

    events.dispatch("other", JSON.stringify({ revision: 9 }));
    events.dispatch("notion-like-editor:demo:recovery:conflict", JSON.stringify({ revision: 3 }));
    events.dispatch("notion-like-editor:demo", null);
    expect(seen).toEqual([]);

    events.dispatch("notion-like-editor:demo", JSON.stringify({ revision: 4 }));
    expect(seen).toEqual([4]);

    unsubscribe?.();
    events.dispatch("notion-like-editor:demo", JSON.stringify({ revision: 5 }));
    expect(seen).toEqual([4]);
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
    expect(replaced).not.toBeNull();
    expect(conflict).not.toBeNull();
    expect(failed).not.toBeNull();
    if (replaced === null) {
      throw new Error("expected the replaced-invalid snapshot");
    }

    const parsed: unknown = JSON.parse(replaced);
    expect(typeof parsed === "object" && parsed !== null && "raw" in parsed && parsed.raw).toBe(
      "{bad",
    );
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
      message: "Browser storage is unavailable. Copy your document before closing this tab.",
    });

    await expect(adapter.load("demo")).rejects.toBeInstanceOf(DOMException);
  });
});
