import { describe, expect, test } from "bun:test";

import type { AssetRecord, AssetStore, UploadSource, UploadState } from "./editor-assets";
import { createUploadController } from "./upload-controller";

const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function source(name = "photo.png"): UploadSource {
  const blob = new Blob([Uint8Array.from(png)]);
  return {
    name,
    type: "application/octet-stream",
    size: png.length,
    slice: (start, end) => blob.slice(start, end),
  };
}

function memoryStore() {
  const records = new Map<string, { record: AssetRecord; blob: Blob }>();
  let puts = 0;
  let fail: Error | undefined;
  let gate: Promise<void> | undefined;
  let releaseGate: (() => void) | undefined;

  const store: AssetStore = {
    async put(record, blob) {
      puts += 1;
      if (gate) {
        await gate;
      }
      if (fail) {
        const error = fail;
        fail = undefined;
        throw error;
      }
      records.set(record.id, { record, blob });
    },
    async get(id) {
      return records.get(id) ?? null;
    },
    async delete(id) {
      records.delete(id);
    },
    async list() {
      return [...records.values()].map((entry) => entry.record);
    },
  };

  return {
    store,
    records,
    puts: () => puts,
    hold() {
      gate = new Promise<void>((resolve) => {
        releaseGate = resolve;
      });
    },
    release() {
      releaseGate?.();
      gate = undefined;
    },
    failNext(error: Error) {
      fail = error;
    },
  };
}

function ids() {
  let n = 0;
  return () => {
    n += 1;
    return `id-${String(n)}`;
  };
}

async function until(read: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (read()) {
      return;
    }
    await Promise.resolve();
  }
  throw new Error("timed out waiting for upload state");
}

describe("upload controller", () => {
  test("a slow store moves from pending to processing to ready", async () => {
    const saved = memoryStore();
    saved.hold();
    const states: UploadState["status"][] = [];
    const controller = createUploadController({
      store: saved.store,
      createId: ids(),
      now: () => "2026-10-05T00:00:00.000Z",
      onChange: (state) => {
        states.push(state.status);
      },
    });

    const uploadId = controller.start(source(), { blockId: "block-1", kind: "image" });
    expect(controller.get(uploadId)?.status).toBe("pending");
    await until(() => controller.get(uploadId)?.status === "processing");
    await until(() => saved.puts() === 1);
    expect(controller.get(uploadId)?.status).toBe("processing");

    saved.release();
    await until(() => controller.get(uploadId)?.status === "ready");
    expect(states).toEqual(["pending", "processing", "ready"]);
    expect(controller.get(uploadId)?.assetId).toBe("id-2");
    expect(saved.records.get("id-2")?.record.mimeType).toBe("image/png");
    expect(saved.records.get("id-2")?.record.width).toBeUndefined();
  });

  test("a failing store can be retried and stores one asset", async () => {
    const saved = memoryStore();
    saved.failNext(new Error("disk full"));
    const controller = createUploadController({
      store: saved.store,
      createId: ids(),
      now: () => "2026-10-05T00:00:00.000Z",
      onChange: () => undefined,
    });

    const uploadId = controller.start(source(), { blockId: "block-1", kind: "image" });
    await until(() => controller.get(uploadId)?.status === "failed");
    expect(controller.get(uploadId)?.error).toBe("disk full");
    expect(saved.records.size).toBe(0);

    await controller.retry(uploadId);
    await until(() => controller.get(uploadId)?.status === "ready");
    expect(saved.records.size).toBe(1);
    expect(saved.puts()).toBe(2);
    expect(controller.get(uploadId)?.uploadId).toBe(uploadId);
  });

  test("cancel during a slow store deletes the late write and never reports ready", async () => {
    const saved = memoryStore();
    saved.hold();
    const states: UploadState["status"][] = [];
    const controller = createUploadController({
      store: saved.store,
      createId: ids(),
      now: () => "2026-10-05T00:00:00.000Z",
      onChange: (state) => {
        states.push(state.status);
      },
    });

    const uploadId = controller.start(source(), { blockId: "block-1", kind: "image" });
    await until(() => saved.puts() === 1 && controller.get(uploadId)?.status === "processing");
    controller.cancel(uploadId);
    expect(controller.get(uploadId)?.status).toBe("canceled");

    saved.release();
    await until(() => saved.records.size === 0);
    await Promise.resolve();
    expect(states.includes("ready")).toBe(false);
    expect(controller.get(uploadId)?.status).toBe("canceled");
  });

  test("retry of a ready upload does not store a second copy", async () => {
    const saved = memoryStore();
    const controller = createUploadController({
      store: saved.store,
      createId: ids(),
      now: () => "2026-10-05T00:00:00.000Z",
      onChange: () => undefined,
    });

    const uploadId = controller.start(source(), { blockId: "block-1", kind: "image" });
    await until(() => controller.get(uploadId)?.status === "ready");
    const puts = saved.puts();
    await controller.retry(uploadId);
    expect(controller.get(uploadId)?.status).toBe("ready");
    expect(saved.puts()).toBe(puts);
    expect(saved.records.size).toBe(1);
  });

  test("retry after the file is gone asks for the file again", async () => {
    const saved = memoryStore();
    saved.hold();
    const controller = createUploadController({
      store: saved.store,
      createId: ids(),
      now: () => "2026-10-05T00:00:00.000Z",
      onChange: () => undefined,
    });

    const uploadId = controller.start(source(), { blockId: "block-1", kind: "image" });
    controller.cancel(uploadId);
    saved.release();
    await controller.retry(uploadId);
    expect(controller.get(uploadId)?.status).toBe("failed");
    expect(controller.get(uploadId)?.error).toBe("Choose the file again.");
  });

  test("an injected probe stores width and height", async () => {
    const saved = memoryStore();
    const controller = createUploadController({
      store: saved.store,
      createId: ids(),
      now: () => "2026-10-05T00:00:00.000Z",
      onChange: () => undefined,
      probe: async () => ({ width: 12, height: 8 }),
    });

    const uploadId = controller.start(source(), { blockId: "block-1", kind: "image" });
    await until(() => controller.get(uploadId)?.status === "ready");
    const assetId = controller.get(uploadId)?.assetId;
    if (!assetId) {
      throw new Error("expected an asset id");
    }
    expect(saved.records.get(assetId)?.record.width).toBe(12);
    expect(saved.records.get(assetId)?.record.height).toBe(8);
  });
});
