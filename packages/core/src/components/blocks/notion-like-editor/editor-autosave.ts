import { EDITOR_SCHEMA_VERSION } from "./editor-document";
import type { EditorPersistenceAdapter, SaveResult } from "./editor-persistence";
import type { EditorValue } from "./editor-value";

export type AutosaveStatus = "saved" | "dirty" | "saving" | "error" | "conflict";

export type AutosaveState = {
  status: AutosaveStatus;
  message?: string;
};

export type AutosaveTimers = {
  setTimeout: (callback: () => void, delayMs: number) => unknown;
  clearTimeout: (id: unknown) => void;
};

type AutosaveOptions = {
  adapter: EditorPersistenceAdapter;
  documentId: string;
  revision: number;
  initialContent?: EditorValue;
  debounceMs?: number;
  maxWaitMs?: number;
  timers?: AutosaveTimers;
  readOnly?: () => boolean;
  onStatus: (state: AutosaveState) => void;
};

export type AutosaveController = {
  schedule: (content: EditorValue) => void;
  flush: () => Promise<void>;
  retry: () => Promise<void>;
  dispose: () => void;
};

const UNKNOWN_SAVE_MESSAGE =
  "The document could not be saved. Copy it before closing this tab, then try again.";

function browserTimers(): AutosaveTimers {
  const handles = new Map<number, ReturnType<typeof setTimeout>>();
  let nextId = 1;

  return {
    setTimeout: (callback, delayMs) => {
      const id = nextId;
      nextId += 1;
      handles.set(id, setTimeout(callback, delayMs));
      return id;
    },
    clearTimeout: (id) => {
      if (typeof id !== "number") {
        return;
      }

      const handle = handles.get(id);
      if (handle === undefined) {
        return;
      }

      clearTimeout(handle);
      handles.delete(id);
    },
  };
}

export function createAutosave(options: AutosaveOptions): AutosaveController {
  const debounceMs = options.debounceMs ?? 800;
  const maxWaitMs = options.maxWaitMs ?? 4000;
  const timers = options.timers ?? browserTimers();
  const readOnly = options.readOnly ?? (() => false);

  let baseRevision = options.revision;
  let status: AutosaveStatus = "saved";
  let message: string | undefined;
  let held = options.initialContent;
  let queued: EditorValue | undefined;
  let debounceTimer: unknown;
  let maxWaitTimer: unknown;
  let inflightId = 0;
  let nextSaveId = 0;
  let conflicted = false;
  let disposed = false;
  let sawError = false;
  let idleWaiters: Array<() => void> = [];
  const unsubscribe = options.adapter.subscribe?.(options.documentId, (revision) => {
    if (readOnly() || conflicted || disposed || revision === baseRevision) {
      return;
    }

    void enterConflict();
  });

  function emit(nextStatus: AutosaveStatus, nextMessage?: string): void {
    if (status === nextStatus && message === nextMessage) {
      return;
    }

    status = nextStatus;
    message = nextMessage;
    options.onStatus({ status, message });
  }

  function clearTimers(): void {
    if (debounceTimer !== undefined) {
      timers.clearTimeout(debounceTimer);
      debounceTimer = undefined;
    }

    if (maxWaitTimer !== undefined) {
      timers.clearTimeout(maxWaitTimer);
      maxWaitTimer = undefined;
    }
  }

  function settle(): void {
    if (inflightId !== 0 || queued !== undefined) {
      return;
    }

    const waiting = idleWaiters;
    idleWaiters = [];
    for (const resolve of waiting) {
      resolve();
    }
  }

  function waitForIdle(): Promise<void> {
    if (inflightId === 0 && queued === undefined) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      idleWaiters.push(resolve);
    });
  }

  function armTimers(): void {
    if (debounceTimer !== undefined) {
      timers.clearTimeout(debounceTimer);
    }

    debounceTimer = timers.setTimeout(() => {
      debounceTimer = undefined;
      startSave();
    }, debounceMs);

    if (maxWaitTimer === undefined) {
      maxWaitTimer = timers.setTimeout(() => {
        maxWaitTimer = undefined;
        startSave();
      }, maxWaitMs);
    }
  }

  function snapshotContent(): EditorValue | undefined {
    return queued ?? held;
  }

  async function writeRecovery(reason: "conflict" | "save-failed"): Promise<void> {
    const content = snapshotContent();
    if (!content || readOnly()) {
      return;
    }

    try {
      await options.adapter.saveRecovery({
        documentId: options.documentId,
        revision: baseRevision,
        savedAt: new Date().toISOString(),
        content,
        reason,
      });
    } catch {
      // The document save already failed or conflicted. Surface that status anyway.
    }
  }

  async function enterConflict(): Promise<void> {
    if (conflicted) {
      return;
    }

    conflicted = true;
    clearTimers();
    await writeRecovery("conflict");
    queued = undefined;
    emit("conflict");
    settle();
  }

  async function finish(saveId: number, content: EditorValue, result: SaveResult): Promise<void> {
    if (saveId !== inflightId) {
      return;
    }

    inflightId = 0;

    if (conflicted) {
      settle();
      return;
    }

    if (result.status === "conflict") {
      held = queued ?? content;
      await enterConflict();
      return;
    }

    if (result.status === "error") {
      if (queued === undefined) {
        held = content;
      }

      emit("error", result.message);
      if (!sawError) {
        sawError = true;
        await writeRecovery("save-failed");
      }

      if (queued !== undefined && !disposed && !conflicted && !readOnly()) {
        armTimers();
      }

      settle();
      return;
    }

    baseRevision = result.revision;
    sawError = false;
    if (queued !== undefined) {
      startSave();
      return;
    }

    emit("saved");
    settle();
  }

  function startSave(): void {
    if (readOnly() || conflicted || inflightId !== 0 || queued === undefined) {
      settle();
      return;
    }

    const content = queued;
    queued = undefined;
    clearTimers();
    nextSaveId += 1;
    const saveId = nextSaveId;
    inflightId = saveId;
    emit("saving");

    const request = {
      documentId: options.documentId,
      schemaVersion: EDITOR_SCHEMA_VERSION,
      baseRevision,
      content,
    };

    let pending: Promise<SaveResult>;
    try {
      pending = Promise.resolve(options.adapter.save(request));
    } catch {
      pending = Promise.resolve({
        status: "error",
        reason: "unknown",
        message: UNKNOWN_SAVE_MESSAGE,
      });
    }

    void pending.then(
      (result) => finish(saveId, content, result),
      () =>
        finish(saveId, content, {
          status: "error",
          reason: "unknown",
          message: UNKNOWN_SAVE_MESSAGE,
        }),
    );
  }

  return {
    schedule(content) {
      if (disposed || conflicted || readOnly()) {
        return;
      }

      held = content;
      queued = content;
      if (inflightId === 0) {
        armTimers();
      }

      emit("dirty");
    },

    flush() {
      if (readOnly() || conflicted) {
        return Promise.resolve();
      }

      clearTimers();
      if (queued === undefined && held !== undefined && status !== "saved") {
        queued = held;
      }

      startSave();
      return waitForIdle();
    },

    retry() {
      if (disposed || conflicted || readOnly() || held === undefined) {
        return Promise.resolve();
      }

      clearTimers();
      queued = held;
      if (inflightId === 0) {
        startSave();
      }

      return waitForIdle();
    },

    dispose() {
      disposed = true;
      unsubscribe?.();
      clearTimers();
      if (readOnly() || conflicted) {
        return;
      }

      if (queued === undefined && held !== undefined && status !== "saved" && inflightId === 0) {
        queued = held;
      }

      if (inflightId === 0) {
        startSave();
      }
    },
  };
}
