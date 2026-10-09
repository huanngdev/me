import { describe, expect, test } from "bun:test";

import { createAutosave, type AutosaveState } from "../lib/document/editor-autosave";
import type {
  EditorPersistenceAdapter,
  RecoverySnapshot,
  SaveRequest,
  SaveResult,
} from "../lib/document/editor-persistence";
import { controllable, createFakeTimers, paragraphValue } from "./test-utils";

const UNKNOWN_SAVE_MESSAGE =
  "The document could not be saved. Copy it before closing this tab, then try again.";

type WaitingSave = {
  resolve: (result: SaveResult) => void;
};

function createFakeAdapter(options?: { save?: EditorPersistenceAdapter["save"] }) {
  const saves: SaveRequest[] = [];
  const recoveries: RecoverySnapshot[] = [];
  const waiting: WaitingSave[] = [];
  let active = 0;
  let maxActive = 0;
  let onRevision: ((revision: number) => void) | undefined;
  let recoveryGate: ReturnType<typeof controllable<void>> | undefined;

  const adapter: EditorPersistenceAdapter = {
    load: async () => null,
    save:
      options?.save ??
      ((request) => {
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
      }),
    saveRecovery: async (snapshot) => {
      if (recoveryGate) {
        await recoveryGate.promise;
      }
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
    holdRecovery() {
      recoveryGate = controllable<void>();
    },
    releaseRecovery() {
      recoveryGate?.resolve();
      recoveryGate = undefined;
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

const unavailable = {
  status: "error",
  reason: "unavailable",
  message: "Browser storage is unavailable. Copy your document before closing this tab.",
} as const;

describe("autosave queue", () => {
  test("a debounced save waits until the delay", async () => {
    const clock = createFakeTimers();
    const fake = createFakeAdapter();
    const autosave = createAutosave({
      adapter: fake.adapter,
      documentId: "demo",
      revision: 0,
      debounceMs: 800,
      maxWaitMs: 4000,
      timers: clock.timers,
      onStatus: () => undefined,
    });

    autosave.schedule(paragraphValue("a"));
    clock.advance(799);

    expect(fake.saves).toHaveLength(0);

    clock.advance(1);

    expect(fake.saves).toHaveLength(1);
    expect(fake.saves[0]?.content).toEqual(paragraphValue("a"));
    fake.resolveNext({ status: "saved", revision: 1 });
    await Promise.resolve();
  });

  test("the max wait flushes the newest content while typing continues", () => {
    const clock = createFakeTimers();
    const fake = createFakeAdapter();
    const autosave = createAutosave({
      adapter: fake.adapter,
      documentId: "demo",
      revision: 0,
      debounceMs: 800,
      maxWaitMs: 4000,
      timers: clock.timers,
      onStatus: () => undefined,
    });
    autosave.schedule(paragraphValue("b"));

    for (const text of ["c", "d", "e", "f", "g", "h", "i"]) {
      clock.advance(500);
      autosave.schedule(paragraphValue(text));
    }

    expect(fake.saves).toHaveLength(0);

    clock.advance(500);

    expect(fake.saves).toHaveLength(1);
    expect(fake.saves[0]?.content).toEqual(paragraphValue("i"));
    expect(fake.maxActive()).toBe(1);
  });

  test("flush sends the latest content without waiting for the debounce", async () => {
    const clock = createFakeTimers();
    const fake = createFakeAdapter();
    const autosave = createAutosave({
      adapter: fake.adapter,
      documentId: "demo",
      revision: 0,
      timers: clock.timers,
      onStatus: () => undefined,
    });
    autosave.schedule(paragraphValue("first"));
    autosave.schedule(paragraphValue("latest"));

    const flushed = autosave.flush();

    expect(fake.saves).toHaveLength(1);
    expect(fake.saves[0]?.content).toEqual(paragraphValue("latest"));
    fake.resolveNext({ status: "saved", revision: 1 });
    await flushed;
  });

  test("flush with nothing queued resolves without saving", async () => {
    const clock = createFakeTimers();
    const fake = createFakeAdapter();
    const autosave = createAutosave({
      adapter: fake.adapter,
      documentId: "demo",
      revision: 0,
      timers: clock.timers,
      onStatus: () => undefined,
    });

    await autosave.flush();

    expect(fake.saves).toHaveLength(0);
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
    autosave.schedule(paragraphValue("one"));

    const flushed = autosave.flush();

    expect(fake.active()).toBe(1);

    autosave.schedule(paragraphValue("two"));

    expect(fake.saves).toHaveLength(1);
    expect(fake.active()).toBe(1);

    fake.resolveNext({ status: "saved", revision: 5 });
    await Promise.resolve();

    expect(status.status).not.toBe("saved");
    expect(fake.saves).toHaveLength(2);
    expect(fake.saves[1]?.baseRevision).toBe(5);
    expect(fake.saves[1]?.content).toEqual(paragraphValue("two"));
    expect(fake.active()).toBe(1);
    expect(fake.maxActive()).toBe(1);

    fake.resolveNext({ status: "saved", revision: 6 });
    await flushed;

    expect(status.status).toBe("saved");
    expect(fake.active()).toBe(0);
  });

  test("a second flush during an in-flight save waits and then saves the held content", async () => {
    const clock = createFakeTimers();
    const fake = createFakeAdapter();
    const autosave = createAutosave({
      adapter: fake.adapter,
      documentId: "demo",
      revision: 0,
      timers: clock.timers,
      onStatus: () => undefined,
    });
    autosave.schedule(paragraphValue("held"));
    const first = autosave.flush();

    const second = autosave.flush();

    expect(fake.saves).toHaveLength(1);
    expect(fake.active()).toBe(1);

    fake.resolveNext({ status: "saved", revision: 1 });
    await Promise.resolve();

    expect(fake.saves).toHaveLength(2);
    expect(fake.saves[1]?.baseRevision).toBe(1);
    expect(fake.saves[1]?.content).toEqual(paragraphValue("held"));

    fake.resolveNext({ status: "saved", revision: 2 });
    await first;
    await second;

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
    autosave.schedule(paragraphValue("old"));
    const flushed = autosave.flush();
    autosave.schedule(paragraphValue("new"));

    fake.resolveNext({ status: "saved", revision: 1 });
    await Promise.resolve();

    expect(status.states.some((state) => state.status === "saved")).toBe(false);
    expect(fake.saves[1]?.content).toEqual(paragraphValue("new"));

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
    const latest = paragraphValue("Persist me");
    autosave.schedule(latest);

    const failed = autosave.flush();
    fake.resolveNext(unavailable);
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

  test("a later failed save replaces the save-failed snapshot with the newest content", async () => {
    const clock = createFakeTimers();
    const fake = createFakeAdapter();
    const autosave = createAutosave({
      adapter: fake.adapter,
      documentId: "demo",
      revision: 2,
      timers: clock.timers,
      onStatus: () => undefined,
    });
    autosave.schedule(paragraphValue("one"));
    const first = autosave.flush();
    fake.resolveNext(unavailable);
    await first;
    autosave.schedule(paragraphValue("two"));

    const second = autosave.flush();
    fake.resolveNext(unavailable);
    await second;

    expect(fake.recoveries).toHaveLength(2);
    expect(fake.recoveries[1]?.reason).toBe("save-failed");
    expect(fake.recoveries[1]?.content).toEqual(paragraphValue("two"));
  });

  test("a failed save with newer queued content arms the debounce again", async () => {
    const clock = createFakeTimers();
    const fake = createFakeAdapter();
    const autosave = createAutosave({
      adapter: fake.adapter,
      documentId: "demo",
      revision: 0,
      debounceMs: 800,
      maxWaitMs: 4000,
      timers: clock.timers,
      onStatus: () => undefined,
    });
    autosave.schedule(paragraphValue("one"));
    const pending = autosave.flush();
    autosave.schedule(paragraphValue("two"));
    fake.resolveNext(unavailable);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(fake.saves).toHaveLength(1);

    clock.advance(800);

    expect(fake.saves).toHaveLength(2);
    expect(fake.saves[1]?.content).toEqual(paragraphValue("two"));

    fake.resolveNext({ status: "saved", revision: 1 });
    await pending;
  });

  test("flush after an error saves the held content again", async () => {
    const clock = createFakeTimers();
    const fake = createFakeAdapter();
    const autosave = createAutosave({
      adapter: fake.adapter,
      documentId: "demo",
      revision: 0,
      timers: clock.timers,
      onStatus: () => undefined,
    });
    autosave.schedule(paragraphValue("held"));
    const failed = autosave.flush();
    fake.resolveNext(unavailable);
    await failed;

    const again = autosave.flush();

    expect(fake.saves).toHaveLength(2);
    expect(fake.saves[1]?.content).toEqual(paragraphValue("held"));
    expect(fake.saves[1]?.baseRevision).toBe(0);

    fake.resolveNext({ status: "saved", revision: 1 });
    await again;
  });

  test("a conflict save result stops further saves and writes one snapshot", async () => {
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
    autosave.schedule(paragraphValue("local"));

    const flushed = autosave.flush();
    fake.resolveNext({ status: "conflict", currentRevision: 8 });
    await flushed;

    expect(status.status).toBe("conflict");
    expect(fake.recoveries).toHaveLength(1);
    expect(fake.recoveries[0]?.reason).toBe("conflict");
    expect(fake.recoveries[0]?.content).toEqual(paragraphValue("local"));

    autosave.schedule(paragraphValue("later"));
    await autosave.flush();
    clock.advance(5000);

    expect(fake.saves).toHaveLength(1);
  });

  test("a save that finishes after a conflict does not change the revision", async () => {
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
    autosave.schedule(paragraphValue("local"));
    const flushed = autosave.flush();
    fake.emit(6);
    await Promise.resolve();
    await Promise.resolve();

    fake.resolveNext({ status: "saved", revision: 99 });
    await flushed;

    expect(status.status).toBe("conflict");
    expect(fake.saves).toHaveLength(1);
    expect(fake.recoveries).toHaveLength(1);
    expect(fake.recoveries[0]?.revision).toBe(1);
  });

  test("an external revision equal to the base does not write a recovery snapshot", async () => {
    const clock = createFakeTimers();
    const fake = createFakeAdapter();
    const autosave = createAutosave({
      adapter: fake.adapter,
      documentId: "demo",
      revision: 1,
      timers: clock.timers,
      onStatus: () => undefined,
    });
    autosave.schedule(paragraphValue("local"));

    fake.emit(1);
    await Promise.resolve();

    expect(fake.recoveries).toHaveLength(0);
  });

  test("an external revision stops further saves and writes the local content", async () => {
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
    autosave.schedule(paragraphValue("local"));

    fake.emit(6);
    await Promise.resolve();
    await Promise.resolve();

    expect(status.status).toBe("conflict");
    expect(fake.recoveries).toHaveLength(1);
    expect(fake.recoveries[0]?.reason).toBe("conflict");
    expect(fake.recoveries[0]?.content).toEqual(paragraphValue("local"));

    autosave.schedule(paragraphValue("later"));
    clock.advance(5000);
    await autosave.flush();

    expect(fake.saves).toHaveLength(0);
  });

  test("an external revision before any edit conflicts without a recovery snapshot", async () => {
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

    fake.emit(4);
    await Promise.resolve();
    await Promise.resolve();

    expect(status.status).toBe("conflict");
    expect(fake.recoveries).toHaveLength(0);
    expect(fake.saves).toHaveLength(0);
    void autosave;
  });

  test("a conflict while the editor is read-only writes no recovery snapshot", async () => {
    const clock = createFakeTimers();
    const fake = createFakeAdapter();
    const status = trackStatus();
    let locked = false;
    const autosave = createAutosave({
      adapter: fake.adapter,
      documentId: "demo",
      revision: 0,
      timers: clock.timers,
      readOnly: () => locked,
      onStatus: status.onStatus,
    });
    autosave.schedule(paragraphValue("local"));
    const flushed = autosave.flush();
    locked = true;

    fake.resolveNext({ status: "conflict", currentRevision: 3 });
    await flushed;

    expect(status.status).toBe("conflict");
    expect(fake.recoveries).toHaveLength(0);
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
    autosave.schedule(paragraphValue("pending"));

    expect(fake.saves).toHaveLength(0);

    autosave.dispose();

    expect(fake.saves).toHaveLength(1);
    expect(fake.saves[0]?.content).toEqual(paragraphValue("pending"));
  });

  test("read-only mode does not save or write recovery", async () => {
    const clock = createFakeTimers();
    const fake = createFakeAdapter();
    const autosave = createAutosave({
      adapter: fake.adapter,
      documentId: "demo",
      revision: 0,
      initialContent: paragraphValue("stored"),
      timers: clock.timers,
      readOnly: () => true,
      onStatus: () => undefined,
    });

    autosave.schedule(paragraphValue("typed"));
    await autosave.flush();
    await autosave.retry();
    fake.emit(3);
    await Promise.resolve();
    autosave.dispose();
    clock.advance(5000);

    expect(fake.saves).toHaveLength(0);
    expect(fake.recoveries).toHaveLength(0);
  });

  test("a save that throws is reported as an unknown error", async () => {
    const clock = createFakeTimers();
    const status = trackStatus();
    const fake = createFakeAdapter({
      save: () => {
        throw new Error("disk");
      },
    });
    const autosave = createAutosave({
      adapter: fake.adapter,
      documentId: "demo",
      revision: 0,
      timers: clock.timers,
      onStatus: status.onStatus,
    });
    autosave.schedule(paragraphValue("Hi"));

    await autosave.flush();

    expect(status.status).toBe("error");
    expect(status.states.at(-1)?.message).toBe(UNKNOWN_SAVE_MESSAGE);
    expect(fake.recoveries[0]?.reason).toBe("save-failed");
    expect(fake.recoveries[0]?.content).toEqual(paragraphValue("Hi"));
  });

  test("a rejected save is reported as an unknown error", async () => {
    const clock = createFakeTimers();
    const status = trackStatus();
    const fake = createFakeAdapter({
      save: () => Promise.reject(new Error("nope")),
    });
    const autosave = createAutosave({
      adapter: fake.adapter,
      documentId: "demo",
      revision: 0,
      timers: clock.timers,
      onStatus: status.onStatus,
    });
    autosave.schedule(paragraphValue("Hi"));

    await autosave.flush();

    expect(status.status).toBe("error");
    expect(status.states.at(-1)?.message).toBe(UNKNOWN_SAVE_MESSAGE);
    expect(fake.recoveries).toHaveLength(1);
  });

  test("the default timers save the latest content after the debounce", async () => {
    const fake = createFakeAdapter();
    const autosave = createAutosave({
      adapter: fake.adapter,
      documentId: "demo",
      revision: 0,
      debounceMs: 30,
      maxWaitMs: 500,
      onStatus: () => undefined,
    });
    autosave.schedule(paragraphValue("first"));
    autosave.schedule(paragraphValue("second"));

    await Bun.sleep(15);

    expect(fake.saves).toHaveLength(0);

    await Bun.sleep(80);

    expect(fake.saves).toHaveLength(1);
    expect(fake.saves[0]?.content).toEqual(paragraphValue("second"));
    fake.resolveNext({ status: "saved", revision: 1 });
    await Promise.resolve();
    autosave.dispose();
  });
});
