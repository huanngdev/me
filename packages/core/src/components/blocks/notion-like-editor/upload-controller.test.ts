import { describe, expect, test } from "bun:test";

import type { UploadSource, UploadState } from "./editor-assets";
import { createUploadController } from "./upload-controller";
import { controllable, createMemoryAssetStore } from "./test-utils";

const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function source(name = "photo.png", bytes = png): UploadSource {
  const blob = new Blob([Uint8Array.from(bytes)]);
  return {
    name,
    type: "application/octet-stream",
    size: bytes.length,
    slice: (start, end) => blob.slice(start, end),
  };
}

class DelayedBlob extends Blob {
  constructor(
    private readonly gate: Promise<void>,
    parts: BlobPart[],
  ) {
    super(parts);
  }

  override async arrayBuffer(): Promise<ArrayBuffer> {
    await this.gate;
    return super.arrayBuffer();
  }
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

function controllerFor(
  saved: ReturnType<typeof createMemoryAssetStore>,
  options?: {
    onChange?: (state: UploadState) => void;
    probe?: (
      file: Blob,
      kind: UploadState["kind"],
    ) => Promise<{
      width?: number;
      height?: number;
      durationMs?: number;
    }>;
  },
) {
  return createUploadController({
    store: saved.store,
    createId: ids(),
    now: () => "2026-10-05T00:00:00.000Z",
    onChange: options?.onChange ?? (() => undefined),
    probe: options?.probe,
  });
}

describe("uploads", () => {
  test("a slow store moves from pending to processing to ready", async () => {
    const saved = createMemoryAssetStore();
    saved.hold();
    const states: UploadState["status"][] = [];
    const controller = controllerFor(saved, {
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
    const saved = createMemoryAssetStore();
    saved.failNext(new Error("disk full"));
    const controller = controllerFor(saved);

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

  test("a store failure that is not an Error uses the fallback message", async () => {
    const saved = createMemoryAssetStore();
    saved.failNext("disk");
    const controller = controllerFor(saved);

    const uploadId = controller.start(source(), { blockId: "block-1", kind: "image" });
    await until(() => controller.get(uploadId)?.status === "failed");

    expect(controller.get(uploadId)?.error).toBe("The file could not be saved. Try again.");
  });

  test("cancel during a slow store deletes the late write and never reports ready", async () => {
    const saved = createMemoryAssetStore();
    saved.hold();
    const states: UploadState["status"][] = [];
    const controller = controllerFor(saved, {
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

  test("cancel during validation leaves the upload canceled and stores nothing", async () => {
    const saved = createMemoryAssetStore();
    const gate = controllable<void>();
    const file: UploadSource = {
      name: "photo.png",
      type: "image/png",
      size: png.length,
      slice: () => new DelayedBlob(gate.promise, [Uint8Array.from(png)]),
    };
    const controller = controllerFor(saved);
    const uploadId = controller.start(file, { blockId: "block-1", kind: "image" });
    await until(() => controller.get(uploadId)?.status === "processing");

    controller.cancel(uploadId);
    gate.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(controller.get(uploadId)?.status).toBe("canceled");
    expect(saved.puts()).toBe(0);
  });

  test("cancel during a probe stores nothing", async () => {
    const saved = createMemoryAssetStore();
    const gate = controllable<void>();
    let probeStarted = false;
    const controller = controllerFor(saved, {
      probe: async () => {
        probeStarted = true;
        await gate.promise;
        return { width: 1, height: 1 };
      },
    });
    const uploadId = controller.start(source(), { blockId: "block-1", kind: "image" });
    await until(() => probeStarted);

    controller.cancel(uploadId);
    gate.resolve();
    await until(() => controller.get(uploadId)?.status === "canceled");

    expect(controller.get(uploadId)?.status).toBe("canceled");
    expect(saved.puts()).toBe(0);
  });

  test("a file that cannot be read fails the upload", async () => {
    const saved = createMemoryAssetStore();
    const controller = controllerFor(saved);
    const file: UploadSource = {
      name: "photo.png",
      type: "image/png",
      size: png.length,
      slice: () => {
        throw new Error("unreadable");
      },
    };

    const uploadId = controller.start(file, { blockId: "block-1", kind: "image" });
    await until(() => controller.get(uploadId)?.status === "failed");

    expect(controller.get(uploadId)?.error).toBe("unreadable");
    expect(saved.puts()).toBe(0);
  });

  test("a file that fails validation is not stored", async () => {
    const saved = createMemoryAssetStore();
    const controller = controllerFor(saved);

    const uploadId = controller.start(source("notes.bin", [1, 2, 3, 4]), {
      blockId: "block-1",
      kind: "image",
    });
    await until(() => controller.get(uploadId)?.status === "failed");

    expect(controller.get(uploadId)?.error).toBe(
      "This file is not a PNG, JPEG, GIF, or WebP image.",
    );
    expect(saved.puts()).toBe(0);
  });

  test("retry of a ready upload does not store a second copy", async () => {
    const saved = createMemoryAssetStore();
    const controller = controllerFor(saved);
    const uploadId = controller.start(source(), { blockId: "block-1", kind: "image" });
    await until(() => controller.get(uploadId)?.status === "ready");
    const puts = saved.puts();

    await controller.retry(uploadId);

    expect(controller.get(uploadId)?.status).toBe("ready");
    expect(saved.puts()).toBe(puts);
    expect(saved.records.size).toBe(1);
  });

  test("retry while the upload is still processing waits and stores one asset", async () => {
    const saved = createMemoryAssetStore();
    saved.hold();
    const controller = controllerFor(saved);
    const uploadId = controller.start(source(), { blockId: "block-1", kind: "image" });
    await until(() => saved.puts() === 1 && controller.get(uploadId)?.status === "processing");

    const retried = controller.retry(uploadId);
    saved.release();
    await retried;

    expect(controller.get(uploadId)?.status).toBe("ready");
    expect(saved.puts()).toBe(1);
    expect(saved.records.size).toBe(1);
  });

  test("retry after the file is gone asks for the file again", async () => {
    const saved = createMemoryAssetStore();
    saved.hold();
    const controller = controllerFor(saved);
    const uploadId = controller.start(source(), { blockId: "block-1", kind: "image" });

    controller.cancel(uploadId);
    saved.release();
    await controller.retry(uploadId);

    expect(controller.get(uploadId)?.status).toBe("failed");
    expect(controller.get(uploadId)?.error).toBe("Choose the file again.");
  });

  test("an injected probe stores width and height", async () => {
    const saved = createMemoryAssetStore();
    const controller = controllerFor(saved, {
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

  test("an injected probe stores duration", async () => {
    const saved = createMemoryAssetStore();
    const controller = controllerFor(saved, {
      probe: async () => ({ durationMs: 1200 }),
    });
    const uploadId = controller.start(source(), { blockId: "block-1", kind: "image" });
    await until(() => controller.get(uploadId)?.status === "ready");
    const assetId = controller.get(uploadId)?.assetId;
    if (!assetId) {
      throw new Error("expected an asset id");
    }

    expect(saved.records.get(assetId)?.record.durationMs).toBe(1200);
    expect(saved.records.get(assetId)?.record.width).toBeUndefined();
  });

  test("cancel of an unknown upload does nothing", () => {
    const saved = createMemoryAssetStore();
    const controller = controllerFor(saved);

    controller.cancel("missing");

    expect(controller.get("missing")).toBeUndefined();
  });

  test("canceling twice leaves the upload canceled", async () => {
    const saved = createMemoryAssetStore();
    saved.hold();
    const controller = controllerFor(saved);
    const uploadId = controller.start(source(), { blockId: "block-1", kind: "image" });

    controller.cancel(uploadId);
    controller.cancel(uploadId);

    expect(controller.get(uploadId)?.status).toBe("canceled");
    saved.release();
  });

  test("cancel of a ready upload leaves the stored asset in place", async () => {
    const saved = createMemoryAssetStore();
    const controller = controllerFor(saved);
    const uploadId = controller.start(source(), { blockId: "block-1", kind: "image" });
    await until(() => controller.get(uploadId)?.status === "ready");

    controller.cancel(uploadId);

    expect(controller.get(uploadId)?.status).toBe("ready");
    expect(saved.records.size).toBe(1);
  });

  test("dispose during a slow store deletes the late write", async () => {
    const saved = createMemoryAssetStore();
    saved.hold();
    const controller = controllerFor(saved);
    const uploadId = controller.start(source(), { blockId: "block-1", kind: "image" });
    await until(() => saved.puts() === 1 && controller.get(uploadId)?.status === "processing");

    controller.dispose();
    saved.release();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(controller.get(uploadId)?.status).toBe("processing");
    expect(saved.records.size).toBe(0);
  });

  test("a store error after cancel does not replace the canceled status", async () => {
    const saved = createMemoryAssetStore();
    saved.hold();
    const controller = controllerFor(saved);
    const uploadId = controller.start(source(), { blockId: "block-1", kind: "image" });
    await until(() => saved.puts() === 1);

    controller.cancel(uploadId);
    saved.failNext(new Error("disk"));
    saved.release();
    await until(() => saved.records.size === 0);
    await Promise.resolve();

    expect(controller.get(uploadId)?.status).toBe("canceled");
    expect(controller.get(uploadId)?.error).toBeUndefined();
  });
});
