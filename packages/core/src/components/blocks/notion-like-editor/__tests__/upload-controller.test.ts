import { describe, expect, test } from "bun:test";

import type {
  FileUploadAdapter,
  FileUploadOptions,
  UploadedFile,
} from "../lib/features/editor-file-upload";
import { createUploadController, type UploadState } from "../lib/features/editor-upload-controller";

type Call = {
  file: File;
  options: FileUploadOptions;
  resolve: (value: UploadedFile) => void;
  reject: (error: unknown) => void;
};

// Each upload waits until the test settles it.
function fakeAdapter(): { adapter: FileUploadAdapter; calls: Call[] } {
  const calls: Call[] = [];
  const adapter: FileUploadAdapter = {
    upload(file, options) {
      return new Promise<UploadedFile>((resolve, reject) => {
        calls.push({ file, options, resolve, reject });
      });
    },
  };
  return { adapter, calls };
}

function setup() {
  const { adapter, calls } = fakeAdapter();
  const done: { blockId: string; file: UploadedFile }[] = [];
  const controller = createUploadController({
    adapter,
    onDone: (blockId, file) => {
      done.push({ blockId, file });
    },
  });
  return { controller, calls, done };
}

// Lets promise callbacks run, so a settled upload reaches the controller.
async function settle(): Promise<void> {
  for (let index = 0; index < 5; index += 1) {
    await Promise.resolve();
  }
}

function fileNamed(name: string, body = "hello", type = "text/plain"): File {
  return new File([body], name, { type });
}

function uploadingProgress(state: UploadState | undefined): number {
  if (state?.status !== "uploading") {
    throw new Error(`Expected an uploading state, got ${state?.status ?? "none"}.`);
  }

  return state.progress;
}

describe("upload controller", () => {
  test("reports progress, clamps it, and never moves it backwards", async () => {
    const { controller, calls } = setup();
    const seen: number[] = [];
    let notifications = 0;
    controller.subscribe(() => {
      notifications += 1;
    });

    controller.start("b1", fileNamed("slow.txt"));
    expect(controller.get("b1")).toEqual({
      status: "uploading",
      name: "slow.txt",
      size: 5,
      progress: 0,
    });
    const afterStart = notifications;

    const call = calls[0];
    call.options.onProgress(0.5);
    seen.push(uploadingProgress(controller.get("b1")));
    expect(notifications).toBe(afterStart + 1);

    call.options.onProgress(0.2);
    call.options.onProgress(0.5);
    call.options.onProgress(Number.NaN);
    expect(notifications).toBe(afterStart + 1);
    expect(uploadingProgress(controller.get("b1"))).toBe(0.5);

    call.options.onProgress(2);
    seen.push(uploadingProgress(controller.get("b1")));
    call.options.onProgress(-1);
    expect(uploadingProgress(controller.get("b1"))).toBe(1);

    expect(seen).toEqual([0.5, 1]);
    call.resolve({ url: "https://cdn.example.com/slow.txt" });
    await settle();
  });

  test("a finished upload calls onDone once with the File's fields filled in", async () => {
    const { controller, calls, done } = setup();
    controller.start("b1", fileNamed("notes.txt", "hello", "text/plain"));

    calls[0].resolve({ url: "https://cdn.example.com/notes" });
    await settle();

    expect(done).toEqual([
      {
        blockId: "b1",
        file: {
          url: "https://cdn.example.com/notes",
          name: "notes.txt",
          size: 5,
          mime: "text/plain",
        },
      },
    ]);
    expect(controller.get("b1")).toBeUndefined();
  });

  test("keeps the name, size and mime that the adapter returns", async () => {
    const { controller, calls, done } = setup();
    controller.start("b1", fileNamed("notes.txt"));

    calls[0].resolve({ url: "local-file:abc", name: "renamed.md", size: 9, mime: "text/markdown" });
    await settle();

    expect(done[0].file).toEqual({
      url: "local-file:abc",
      name: "renamed.md",
      size: 9,
      mime: "text/markdown",
    });
  });

  test("a failure shows the error message, and retry uploads the same file again", async () => {
    const { controller, calls, done } = setup();
    const file = fileNamed("flaky.txt");
    controller.start("b1", file);

    calls[0].reject(new Error("Network\n  went down"));
    await settle();
    expect(controller.get("b1")).toEqual({
      status: "failed",
      name: "flaky.txt",
      size: 5,
      message: "Network went down",
    });

    controller.retry("b1");
    expect(calls).toHaveLength(2);
    expect(calls[1].file).toBe(file);

    calls[1].resolve({ url: "https://cdn.example.com/flaky" });
    await settle();
    expect(done).toHaveLength(1);
    expect(controller.get("b1")).toBeUndefined();
  });

  test("a failure with no message shows the fallback, and a long message is cut", async () => {
    const { controller, calls } = setup();
    controller.start("b1", fileNamed("a.txt"));
    calls[0].reject({ message: "not an error" });
    await settle();
    expect(controller.get("b1")).toMatchObject({ status: "failed", message: "Upload failed." });

    controller.start("b2", fileNamed("b.txt"));
    calls[1].reject(new Error("x".repeat(400)));
    await settle();
    const state = controller.get("b2");
    expect(state?.status).toBe("failed");
    if (state?.status === "failed") {
      expect(state.message.length).toBeLessThanOrEqual(200);
    }
  });

  test("a synchronous throw from the adapter becomes a failure", async () => {
    const throwing: FileUploadAdapter = {
      upload() {
        throw new Error("Cannot start");
      },
    };
    const controller = createUploadController({ adapter: throwing, onDone: () => {} });
    controller.start("b1", fileNamed("a.txt"));
    await settle();
    expect(controller.get("b1")).toMatchObject({ status: "failed", message: "Cannot start" });
  });

  test("retry does nothing while an upload is running", () => {
    const { controller, calls } = setup();
    controller.start("b1", fileNamed("a.txt"));
    controller.retry("b1");
    expect(calls).toHaveLength(1);
  });

  test("cancel aborts the upload, forgets it, and a late result is ignored", async () => {
    const { controller, calls, done } = setup();
    controller.start("b1", fileNamed("a.txt"));
    const { signal } = calls[0].options;

    controller.cancel("b1");
    expect(signal.aborted).toBe(true);
    expect(controller.get("b1")).toBeUndefined();

    calls[0].resolve({ url: "https://cdn.example.com/late" });
    await settle();
    expect(done).toHaveLength(0);
    expect(controller.get("b1")).toBeUndefined();
  });

  test("an abort error after cancel leaves no failed state", async () => {
    const { controller, calls } = setup();
    controller.start("b1", fileNamed("a.txt"));
    let notified = 0;
    controller.subscribe(() => {
      notified += 1;
    });

    controller.cancel("b1");
    const before = notified;
    const abort = new Error("aborted");
    abort.name = "AbortError";
    calls[0].reject(abort);
    await settle();

    expect(controller.get("b1")).toBeUndefined();
    expect(notified).toBe(before);
  });

  test("starting a second upload on the same block aborts the first, and only the second can finish", async () => {
    const { controller, calls, done } = setup();
    controller.start("b1", fileNamed("first.txt"));
    controller.start("b1", fileNamed("second.txt"));

    expect(calls[0].options.signal.aborted).toBe(true);
    expect(calls[1].options.signal.aborted).toBe(false);

    calls[0].resolve({ url: "https://cdn.example.com/first" });
    await settle();
    expect(done).toHaveLength(0);

    calls[1].resolve({ url: "https://cdn.example.com/second" });
    await settle();
    expect(done).toHaveLength(1);
    expect(done[0].file.name).toBe("second.txt");
  });

  test("an invalid result becomes a failure with a fixed message and no onDone", async () => {
    const { controller, calls, done } = setup();
    controller.start("b1", fileNamed("a.txt"));

    calls[0].resolve({ url: "javascript:alert(1)" });
    await settle();

    expect(done).toHaveLength(0);
    expect(controller.get("b1")).toMatchObject({
      status: "failed",
      message: "The upload returned an invalid file.",
    });
  });

  test("dispose aborts every upload and forgets them", () => {
    const { controller, calls } = setup();
    controller.start("b1", fileNamed("a.txt"));
    controller.start("b2", fileNamed("b.txt"));

    controller.dispose();
    expect(calls[0].options.signal.aborted).toBe(true);
    expect(calls[1].options.signal.aborted).toBe(true);
    expect(controller.get("b1")).toBeUndefined();
    expect(controller.get("b2")).toBeUndefined();
  });

  test("ids lists the blocks with a running or failed upload, and no others", async () => {
    const { controller, calls } = setup();
    expect(controller.ids()).toEqual([]);

    controller.start("b1", fileNamed("a.txt"));
    controller.start("b2", fileNamed("b.txt"));
    expect(controller.ids()).toEqual(["b1", "b2"]);

    calls[0].reject(new Error("no"));
    await settle();
    expect(controller.get("b1")?.status).toBe("failed");
    expect(controller.ids()).toEqual(["b1", "b2"]);

    controller.cancel("b2");
    expect(controller.ids()).toEqual(["b1"]);

    calls[1].resolve({ url: "local-file:x" });
    await settle();
    expect(controller.ids()).toEqual(["b1"]);
  });

  test("a listener that throws does not stop the other listeners", () => {
    const { controller, calls } = setup();
    let steady = 0;
    controller.subscribe(() => {
      throw new Error("listener failed");
    });
    controller.subscribe(() => {
      steady += 1;
    });

    controller.start("b1", fileNamed("a.txt"));
    calls[0].options.onProgress(0.4);
    expect(steady).toBe(2);
  });

  test("get returns the same object until the state changes", () => {
    const { controller, calls } = setup();
    controller.start("b1", fileNamed("a.txt"));

    const first = controller.get("b1");
    expect(controller.get("b1")).toBe(first);

    calls[0].options.onProgress(0.3);
    const second = controller.get("b1");
    expect(second).not.toBe(first);
    expect(controller.get("b1")).toBe(second);

    calls[0].options.onProgress(0.1);
    expect(controller.get("b1")).toBe(second);
  });

  test("progress after completion is ignored", async () => {
    const { controller, calls } = setup();
    controller.start("b1", fileNamed("a.txt"));
    const onProgress = calls[0].options.onProgress;
    calls[0].resolve({ url: "https://cdn.example.com/a" });
    await settle();

    onProgress(0.9);
    expect(controller.get("b1")).toBeUndefined();
  });

  test("a subscribed listener is removed by its unsubscribe function", () => {
    const { controller, calls } = setup();
    let notified = 0;
    const unsubscribe: () => void = controller.subscribe(() => {
      notified += 1;
    });
    unsubscribe();

    controller.start("b1", fileNamed("a.txt"));
    calls[0].options.onProgress(0.5);
    expect(notified).toBe(0);
  });
});
