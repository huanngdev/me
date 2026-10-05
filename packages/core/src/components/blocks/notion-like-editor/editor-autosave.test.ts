import { describe, expect, test } from "bun:test";

import { createAutosave, type AutosaveState, type AutosaveTimers } from "./editor-autosave";
import type {
  EditorPersistenceAdapter,
  RecoverySnapshot,
  SaveRequest,
  SaveResult,
} from "./editor-persistence";
import type { EditorValue } from "./editor-value";

function paragraph(text: string): EditorValue {
  return [{ type: "p", id: "block-1", children: [{ text }] }];
}

function createFakeTimers() {
  let now = 0;
  let nextId = 1;
  const entries: Array<{ id: number; at: number; callback: () => void }> = [];

  const timers: AutosaveTimers = {
    setTimeout: (callback, delayMs) => {
      const id = nextId;
      nextId += 1;
      entries.push({ id, at: now + delayMs, callback });
      return id;
    },
    clearTimeout: (id) => {
      const index = entries.findIndex((entry) => entry.id === id);
      if (index >= 0) {
        entries.splice(index, 1);
      }
    },
  };

  function advance(ms: number): void {
    now += ms;
    for (;;) {
      let nextIndex = -1;
      for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        if (!entry || entry.at > now) {
          continue;
        }

        if (nextIndex === -1) {
          nextIndex = index;
          continue;
        }

        const current = entries[nextIndex];
        if (
          !current ||
          entry.at < current.at ||
          (entry.at === current.at && entry.id < current.id)
        ) {
          nextIndex = index;
        }
      }

      const next = nextIndex >= 0 ? entries[nextIndex] : undefined;
      if (!next || nextIndex < 0) {
        return;
      }

      entries.splice(nextIndex, 1);
      next.callback();
    }
  }

  return { timers, advance };
}

type WaitingSave = {
  resolve: (result: SaveResult) => void;
};

function createFakeAdapter() {
  const saves: SaveRequest[] = [];
  const recoveries: RecoverySnapshot[] = [];
  const waiting: WaitingSave[] = [];
  let active = 0;
  let maxActive = 0;
  let onRevision: ((revision: number) => void) | undefined;

  const adapter: EditorPersistenceAdapter = {
    load: async () => null,
    save: (request) => {
      saves.push(structuredClone(request));
      active += 1;
      maxActive = Math.max(maxActive, active);
      return new Promise((resolve) => {
        waiting.push({
          resolve: (result) => {
            active -= 1;
            resolve(result);
          },
        });
      });
    },
    saveRecovery: async (snapshot) => {
      recoveries.push(structuredClone(snapshot));
    },
    subscribe: (_documentId, onExternalRevision) => {
      onRevision = onExternalRevision;
      return () => {
        onRevision = undefined;
      };
    },
  };

  return {
    adapter,
    saves,
    recoveries,
    active: () => active,
    maxActive: () => maxActive,
    resolveNext(result: SaveResult) {
      const next = waiting.shift();
      if (!next) {
        throw new Error("No save is waiting");
      }

      next.resolve(result);
    },
    emit(revision: number) {
      onRevision?.(revision);
    },
  };
}

function trackStatus() {
  const states: AutosaveState[] = [];
  return {
    states,
    onStatus: (state: AutosaveState) => {
      states.push({ ...state });
    },
    get status() {
      return states.at(-1)?.status;
    },
  };
}

describe("editor autosave", () => {
  test("debounce waits until the delay and max wait flushes the newest content", async () => {
    const clock = createFakeTimers();
    const fake = createFakeAdapter();
    const status = trackStatus();
    const autosave = createAutosave({
      adapter: fake.adapter,
      documentId: "demo",
      revision: 0,
      debounceMs: 800,
      maxWaitMs: 4000,
      timers: clock.timers,
      onStatus: status.onStatus,
    });

    autosave.schedule(paragraph("a"));
    clock.advance(799);
    expect(fake.saves).toHaveLength(0);

    clock.advance(1);
    expect(fake.saves).toHaveLength(1);
    expect(fake.saves[0]?.content).toEqual(paragraph("a"));
    fake.resolveNext({ status: "saved", revision: 1 });
    await Promise.resolve();

    autosave.schedule(paragraph("b"));
    for (const text of ["c", "d", "e", "f", "g", "h", "i"]) {
      clock.advance(500);
      autosave.schedule(paragraph(text));
    }
    expect(fake.saves).toHaveLength(1);

    clock.advance(500);
    expect(fake.saves).toHaveLength(2);
    expect(fake.saves[1]?.content).toEqual(paragraph("i"));
    expect(fake.maxActive()).toBe(1);
  });

  test("flush sends the latest content without waiting", async () => {
    const clock = createFakeTimers();
    const fake = createFakeAdapter();
    const autosave = createAutosave({
      adapter: fake.adapter,
      documentId: "demo",
      revision: 0,
      timers: clock.timers,
      onStatus: () => undefined,
    });

    autosave.schedule(paragraph("first"));
    autosave.schedule(paragraph("latest"));
    const flushed = autosave.flush();
    expect(fake.saves).toHaveLength(1);
    expect(fake.saves[0]?.content).toEqual(paragraph("latest"));
    fake.resolveNext({ status: "saved", revision: 1 });
    await flushed;
  });

  test("content saved during an in-flight save uses the new base revision", async () => {
    const clock = createFakeTimers();
    const fake = createFakeAdapter();
    const status = trackStatus();
    const autosave = createAutosave({
      adapter: fake.adapter,
      documentId: "demo",
      revision: 4,
      timers: clock.timers,
      onStatus: status.onStatus,
    });

    autosave.schedule(paragraph("one"));
    const flushed = autosave.flush();
    expect(fake.active()).toBe(1);
    autosave.schedule(paragraph("two"));
    expect(fake.saves).toHaveLength(1);
    expect(fake.active()).toBe(1);

    fake.resolveNext({ status: "saved", revision: 5 });
    await Promise.resolve();
    expect(status.status).not.toBe("saved");
    expect(fake.saves).toHaveLength(2);
    expect(fake.saves[1]?.baseRevision).toBe(5);
    expect(fake.saves[1]?.content).toEqual(paragraph("two"));
    expect(fake.active()).toBe(1);
    expect(fake.maxActive()).toBe(1);

    fake.resolveNext({ status: "saved", revision: 6 });
    await flushed;
    expect(status.status).toBe("saved");
    expect(fake.active()).toBe(0);
  });

  test("a resolved save does not mark saved while newer content is pending", async () => {
    const clock = createFakeTimers();
    const fake = createFakeAdapter();
    const status = trackStatus();
    const autosave = createAutosave({
      adapter: fake.adapter,
      documentId: "demo",
      revision: 0,
      timers: clock.timers,
      onStatus: status.onStatus,
    });

    autosave.schedule(paragraph("old"));
    const flushed = autosave.flush();
    autosave.schedule(paragraph("new"));
    fake.resolveNext({ status: "saved", revision: 1 });
    await Promise.resolve();
    expect(status.states.some((state) => state.status === "saved")).toBe(false);
    expect(fake.saves[1]?.content).toEqual(paragraph("new"));

    fake.resolveNext({ status: "saved", revision: 2 });
    await flushed;
    expect(status.status).toBe("saved");
  });

  test("a failed save keeps the latest content, writes one snapshot, and retry replaces it", async () => {
    const clock = createFakeTimers();
    const fake = createFakeAdapter();
    const status = trackStatus();
    const autosave = createAutosave({
      adapter: fake.adapter,
      documentId: "demo",
      revision: 2,
      timers: clock.timers,
      onStatus: status.onStatus,
    });
    const latest = paragraph("Persist me");

    autosave.schedule(latest);
    const failed = autosave.flush();
    fake.resolveNext({
      status: "error",
      reason: "unavailable",
      message: "Browser storage is unavailable. Copy your document before closing this tab.",
    });
    await failed;

    expect(status.status).toBe("error");
    expect(status.states.at(-1)?.message).toContain("Browser storage is unavailable");
    expect(fake.recoveries).toHaveLength(1);
    expect(fake.recoveries[0]?.reason).toBe("save-failed");
    expect(fake.recoveries[0]?.content).toEqual(latest);

    const retried = autosave.retry();
    expect(fake.saves).toHaveLength(2);
    fake.resolveNext({ status: "saved", revision: 3 });
    await retried;

    expect(status.status).toBe("saved");
    expect(fake.recoveries).toHaveLength(1);
    expect(fake.saves[1]?.baseRevision).toBe(2);
    expect(fake.saves[1]?.content).toEqual(latest);
    expect(JSON.stringify(fake.saves[1]?.content)).toBe(JSON.stringify(latest));
  });

  test("a conflict save result stops further saves", async () => {
    const clock = createFakeTimers();
    const fake = createFakeAdapter();
    const status = trackStatus();
    const autosave = createAutosave({
      adapter: fake.adapter,
      documentId: "demo",
      revision: 1,
      timers: clock.timers,
      onStatus: status.onStatus,
    });

    autosave.schedule(paragraph("local"));
    const flushed = autosave.flush();
    fake.resolveNext({ status: "conflict", currentRevision: 8 });
    await flushed;

    expect(status.status).toBe("conflict");
    expect(fake.recoveries).toHaveLength(1);
    expect(fake.recoveries[0]?.reason).toBe("conflict");
    expect(fake.recoveries[0]?.content).toEqual(paragraph("local"));

    autosave.schedule(paragraph("later"));
    await autosave.flush();
    clock.advance(5000);
    expect(fake.saves).toHaveLength(1);
  });

  test("an external revision stops further saves", async () => {
    const clock = createFakeTimers();
    const fake = createFakeAdapter();
    const status = trackStatus();
    const autosave = createAutosave({
      adapter: fake.adapter,
      documentId: "demo",
      revision: 1,
      timers: clock.timers,
      onStatus: status.onStatus,
    });

    autosave.schedule(paragraph("local"));
    fake.emit(1);
    await Promise.resolve();
    expect(fake.recoveries).toHaveLength(0);

    fake.emit(6);
    await Promise.resolve();
    await Promise.resolve();

    expect(status.status).toBe("conflict");
    expect(fake.recoveries).toHaveLength(1);
    expect(fake.recoveries[0]?.reason).toBe("conflict");
    expect(fake.recoveries[0]?.content).toEqual(paragraph("local"));

    autosave.schedule(paragraph("later"));
    clock.advance(5000);
    await autosave.flush();
    expect(fake.saves).toHaveLength(0);
  });

  test("dispose starts the pending save without waiting for the debounce", () => {
    const clock = createFakeTimers();
    const fake = createFakeAdapter();
    const autosave = createAutosave({
      adapter: fake.adapter,
      documentId: "demo",
      revision: 0,
      timers: clock.timers,
      onStatus: () => undefined,
    });

    autosave.schedule(paragraph("pending"));
    expect(fake.saves).toHaveLength(0);
    autosave.dispose();
    expect(fake.saves).toHaveLength(1);
    expect(fake.saves[0]?.content).toEqual(paragraph("pending"));
  });

  test("read-only mode does not save or write recovery", async () => {
    const clock = createFakeTimers();
    const fake = createFakeAdapter();
    const autosave = createAutosave({
      adapter: fake.adapter,
      documentId: "demo",
      revision: 0,
      initialContent: paragraph("stored"),
      timers: clock.timers,
      readOnly: () => true,
      onStatus: () => undefined,
    });

    autosave.schedule(paragraph("typed"));
    await autosave.flush();
    await autosave.retry();
    fake.emit(3);
    await Promise.resolve();
    autosave.dispose();
    clock.advance(5000);

    expect(fake.saves).toHaveLength(0);
    expect(fake.recoveries).toHaveLength(0);
  });
});
