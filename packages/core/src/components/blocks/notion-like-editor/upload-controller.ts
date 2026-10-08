import { validateUpload } from "./asset-validation";
import type {
  AssetProbe,
  AssetRecord,
  AssetStore,
  UploadSource,
  UploadState,
} from "./editor-assets";

type UploadControllerOptions = {
  store: AssetStore;
  createId: () => string;
  now: () => string;
  onChange: (state: UploadState) => void;
  probe?: AssetProbe;
};

type UploadEntry = {
  state: UploadState;
  file?: UploadSource;
  assetId?: string;
  canceled: boolean;
  inflight?: Promise<void>;
};

export type UploadController = {
  start: (file: UploadSource, target: { blockId: string; kind: UploadState["kind"] }) => string;
  cancel: (uploadId: string) => void;
  // Stops the upload but keeps the file, so Retry can run without a new picker.
  // cancel() still drops the file. Delete-during-upload uses that path.
  hold: (uploadId: string) => void;
  retry: (uploadId: string) => Promise<void>;
  get: (uploadId: string) => UploadState | undefined;
  dispose: () => void;
};

export function createUploadController(options: UploadControllerOptions): UploadController {
  const uploads = new Map<string, UploadEntry>();
  let disposed = false;

  function emit(entry: UploadEntry): void {
    options.onChange({ ...entry.state });
  }

  function patch(uploadId: string, next: Partial<UploadState>): void {
    const entry = uploads.get(uploadId);
    if (!entry) {
      return;
    }

    entry.state = { ...entry.state, ...next };
    emit(entry);
  }

  function start(
    file: UploadSource,
    target: { blockId: string; kind: UploadState["kind"] },
  ): string {
    const uploadId = options.createId();
    const entry: UploadEntry = {
      canceled: false,
      file,
      state: {
        uploadId,
        blockId: target.blockId,
        kind: target.kind,
        name: file.name,
        status: "pending",
      },
    };
    uploads.set(uploadId, entry);
    emit(entry);
    void schedule(uploadId);
    return uploadId;
  }

  function cancel(uploadId: string): void {
    const entry = uploads.get(uploadId);
    if (!entry || entry.state.status === "ready" || entry.state.status === "canceled") {
      return;
    }

    entry.canceled = true;
    entry.file = undefined;
    patch(uploadId, { status: "canceled", error: undefined });
  }

  function hold(uploadId: string): void {
    const entry = uploads.get(uploadId);
    if (
      !entry ||
      entry.state.status === "ready" ||
      entry.state.status === "canceled" ||
      entry.state.status === "failed"
    ) {
      return;
    }

    entry.canceled = true;
    patch(uploadId, { status: "failed", error: "Upload canceled." });
  }

  async function retry(uploadId: string): Promise<void> {
    const entry = uploads.get(uploadId);
    if (!entry || disposed || entry.state.status === "ready") {
      return;
    }

    if (entry.inflight) {
      await entry.inflight;
    }

    const current = uploads.get(uploadId);
    if (!current || disposed || current.state.status === "ready" || current.inflight) {
      return;
    }

    if (!current.file) {
      patch(uploadId, { status: "failed", error: "Choose the file again." });
      return;
    }

    current.canceled = false;
    patch(uploadId, { status: "pending", error: undefined });
    await schedule(uploadId);
  }

  function schedule(uploadId: string): Promise<void> {
    const entry = uploads.get(uploadId);
    if (!entry) {
      return Promise.resolve();
    }

    if (entry.inflight) {
      return entry.inflight;
    }

    const inflight = Promise.resolve()
      .then(() => run(uploadId))
      .finally(() => {
        const current = uploads.get(uploadId);
        if (current?.inflight === inflight) {
          current.inflight = undefined;
        }
      });
    entry.inflight = inflight;
    return inflight;
  }

  async function run(uploadId: string): Promise<void> {
    const entry = uploads.get(uploadId);
    if (!entry || disposed || entry.canceled || entry.state.status === "ready") {
      return;
    }

    if (entry.assetId) {
      patch(uploadId, { status: "ready", assetId: entry.assetId, error: undefined });
      return;
    }

    const file = entry.file;
    if (!file) {
      patch(uploadId, { status: "failed", error: "Choose the file again." });
      return;
    }

    patch(uploadId, { status: "processing", error: undefined });

    try {
      const validation = await validateUpload(file, entry.state.kind);
      if (stopped(uploadId)) {
        return;
      }

      if (!validation.ok) {
        patch(uploadId, { status: "failed", error: validation.error });
        return;
      }

      const probed = options.probe
        ? await options.probe(file.slice(0, file.size), entry.state.kind)
        : undefined;
      if (stopped(uploadId)) {
        return;
      }

      const assetId = options.createId();
      const record = withProbe(
        {
          id: assetId,
          kind: entry.state.kind,
          name: file.name,
          mimeType: validation.mimeType,
          byteSize: file.size,
          createdAt: options.now(),
        },
        probed,
      );
      try {
        await options.store.put(record, file.slice(0, file.size));
      } catch (error) {
        await options.store.delete(assetId).catch(() => undefined);
        if (stopped(uploadId)) {
          return;
        }

        patch(uploadId, { status: "failed", error: errorMessage(error) });
        return;
      }

      if (stopped(uploadId)) {
        await options.store.delete(assetId).catch(() => undefined);
        return;
      }

      const current = uploads.get(uploadId);
      if (!current) {
        await options.store.delete(assetId).catch(() => undefined);
        return;
      }

      current.assetId = assetId;
      patch(uploadId, { status: "ready", assetId, error: undefined });
    } catch (error) {
      if (stopped(uploadId)) {
        return;
      }

      patch(uploadId, { status: "failed", error: errorMessage(error) });
    }
  }

  function stopped(uploadId: string): boolean {
    const entry = uploads.get(uploadId);
    return disposed || !entry || entry.canceled || entry.state.status === "canceled";
  }

  function dispose(): void {
    disposed = true;
    for (const entry of uploads.values()) {
      entry.file = undefined;
      entry.canceled = true;
    }
  }

  return {
    start,
    cancel,
    hold,
    retry,
    get(uploadId) {
      const state = uploads.get(uploadId)?.state;
      return state ? { ...state } : undefined;
    },
    dispose,
  };
}

function withProbe(
  record: AssetRecord,
  probed: { width?: number; height?: number; durationMs?: number } | undefined,
): AssetRecord {
  const next: AssetRecord = { ...record };
  if (typeof probed?.width === "number") {
    next.width = probed.width;
  }
  if (typeof probed?.height === "number") {
    next.height = probed.height;
  }
  if (typeof probed?.durationMs === "number") {
    next.durationMs = probed.durationMs;
  }
  return next;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return "The file could not be saved. Try again.";
}
