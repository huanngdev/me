import { describe, expect, test } from "bun:test";
import { createPlateEditor } from "platejs/react";
import { act, useEffect, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

import { EditorSurface } from "../components/editor/editor-surface";
import {
  FileUploadScope,
  useFileUploadAdapter,
  useResolvedFileUrl,
  useUploadController,
  useUploadState,
  type ResolvedFileUrl,
} from "../components/elements/file-upload-scope";
import type { EditorValue } from "../lib/document/editor-value";
import type {
  FileUploadAdapter,
  FileUploadOptions,
  UploadedFile,
} from "../lib/features/editor-file-upload";
import type { UploadController, UploadState } from "../lib/features/editor-upload-controller";
import { createEditorPlugins } from "../lib/plugins/editor-plugins";

const VALUE = [{ type: "p", id: "p1", children: [{ text: "" }] }] satisfies EditorValue;

type Snapshot = {
  adapter: FileUploadAdapter | null;
  controller: UploadController | null;
  state: UploadState | undefined;
  resolved: ResolvedFileUrl;
};

// Records what the hooks return after each commit.
function Probe({
  blockId,
  stored,
  snapshots,
}: {
  blockId: string;
  stored?: string;
  snapshots: Snapshot[];
}) {
  const adapter = useFileUploadAdapter();
  const controller = useUploadController();
  const state = useUploadState(blockId);
  const resolved = useResolvedFileUrl(stored);

  useEffect(() => {
    snapshots.push({ adapter, controller, state, resolved });
  });

  return null;
}

function last(snapshots: Snapshot[]): Snapshot {
  const snapshot = snapshots.at(-1);
  if (snapshot === undefined) {
    throw new Error("The probe has not rendered.");
  }

  return snapshot;
}

type Call = { file: File; options: FileUploadOptions; resolve: (value: UploadedFile) => void };

function fakeUploadAdapter(): { adapter: FileUploadAdapter; calls: Call[] } {
  const calls: Call[] = [];
  return {
    calls,
    adapter: {
      upload(file, options) {
        return new Promise<UploadedFile>((resolve) => {
          calls.push({ file, options, resolve });
        });
      },
    },
  };
}

function stubEnvironment(): () => void {
  const previousFrame = Reflect.get(globalThis, "requestAnimationFrame");
  const previousCancel = Reflect.get(globalThis, "cancelAnimationFrame");
  Reflect.set(globalThis, "requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  Reflect.set(globalThis, "cancelAnimationFrame", () => {});
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
  return () => {
    Reflect.set(globalThis, "requestAnimationFrame", previousFrame);
    Reflect.set(globalThis, "cancelAnimationFrame", previousCancel);
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT");
  };
}

type Mounted = {
  host: HTMLElement;
  render: (node: ReactNode) => Promise<void>;
  cleanup: () => Promise<void>;
};

async function mount(): Promise<Mounted> {
  const restore = stubEnvironment();
  const host = document.createElement("div");
  document.body.appendChild(host);
  let root: Root | undefined;

  await act(async () => {
    root = createRoot(host);
  });

  return {
    host,
    render: async (node) => {
      await act(async () => {
        root?.render(node);
      });
    },
    cleanup: async () => {
      await act(async () => {
        root?.unmount();
      });
      host.remove();
      restore();
    },
  };
}

// Lets resolved promises settle inside act, so a resolved url reaches the hook.
async function flush(): Promise<void> {
  await act(async () => {
    for (let index = 0; index < 5; index += 1) {
      await Promise.resolve();
    }
  });
}

// The scope's context value sits above the editable in the React tree. This walks up from the
// editable node to read the value the scope provides.
function scopeValueAbove(node: Element): { adapter: unknown; controller: unknown } | undefined {
  const key = Object.keys(node).find((name) => name.startsWith("__reactFiber$"));
  if (key === undefined) {
    return undefined;
  }

  let fiber: unknown = Reflect.get(node, key);
  while (typeof fiber === "object" && fiber !== null) {
    const props: unknown = Reflect.get(fiber, "memoizedProps");
    const value: unknown =
      typeof props === "object" && props !== null ? Reflect.get(props, "value") : undefined;
    if (
      typeof value === "object" &&
      value !== null &&
      "adapter" in value &&
      "controller" in value
    ) {
      return value;
    }

    fiber = Reflect.get(fiber, "return");
  }

  return undefined;
}

describe("file upload scope", () => {
  test("without an adapter the hooks return null, undefined and idle", async () => {
    const snapshots: Snapshot[] = [];
    const view = await mount();
    try {
      await view.render(
        <FileUploadScope adapter={null} onDone={() => {}}>
          <Probe blockId="b1" snapshots={snapshots} />
        </FileUploadScope>,
      );

      expect(last(snapshots)).toEqual({
        adapter: null,
        controller: null,
        state: undefined,
        resolved: { status: "idle" },
      });
    } finally {
      await view.cleanup();
    }
  });

  test("with an adapter the hooks return it and a controller", async () => {
    const snapshots: Snapshot[] = [];
    const { adapter } = fakeUploadAdapter();
    const view = await mount();
    try {
      await view.render(
        <FileUploadScope adapter={adapter} onDone={() => {}}>
          <Probe blockId="b1" snapshots={snapshots} />
        </FileUploadScope>,
      );

      const snapshot = last(snapshots);
      expect(snapshot.adapter).toBe(adapter);
      expect(snapshot.controller).not.toBeNull();
    } finally {
      await view.cleanup();
    }
  });

  // Each case mounts its own tree. A re-render would leave the fiber read below stale.
  async function adapterAboveEditable(adapter: FileUploadAdapter | null): Promise<unknown> {
    const view = await mount();
    try {
      await view.render(
        <EditorSurface
          editor={createPlateEditor({ plugins: createEditorPlugins(), value: VALUE })}
          readOnly={false}
          placeholder=""
          className="editor"
          fileUpload={adapter}
        />,
      );

      const editable = view.host.querySelector("[data-slate-editor]");
      if (editable === null) {
        throw new Error("The editable node is missing.");
      }

      return scopeValueAbove(editable)?.adapter;
    } finally {
      await view.cleanup();
    }
  }

  test("the adapter prop reaches the scope through EditorSurface", async () => {
    const { adapter } = fakeUploadAdapter();
    expect(await adapterAboveEditable(adapter)).toBe(adapter);
  });

  test("without the prop the scope provides a null adapter", async () => {
    expect(await adapterAboveEditable(null)).toBeNull();
  });

  test("useUploadState re-renders on progress", async () => {
    const snapshots: Snapshot[] = [];
    const { adapter, calls } = fakeUploadAdapter();
    const view = await mount();
    try {
      await view.render(
        <FileUploadScope adapter={adapter} onDone={() => {}}>
          <Probe blockId="b1" snapshots={snapshots} />
        </FileUploadScope>,
      );

      const controller = last(snapshots).controller;
      if (controller === null) {
        throw new Error("No controller.");
      }

      await act(async () => {
        controller.start("b1", new File(["hello"], "a.txt", { type: "text/plain" }));
      });
      expect(last(snapshots).state).toMatchObject({ status: "uploading", progress: 0 });

      await act(async () => {
        calls[0].options.onProgress(0.5);
      });
      expect(last(snapshots).state).toMatchObject({ status: "uploading", progress: 0.5 });
    } finally {
      await view.cleanup();
    }
  });

  test("unmounting the scope aborts its running uploads", async () => {
    const snapshots: Snapshot[] = [];
    const { adapter, calls } = fakeUploadAdapter();
    const view = await mount();
    await view.render(
      <FileUploadScope adapter={adapter} onDone={() => {}}>
        <Probe blockId="b1" snapshots={snapshots} />
      </FileUploadScope>,
    );

    const controller = last(snapshots).controller;
    if (controller === null) {
      throw new Error("No controller.");
    }

    await act(async () => {
      controller.start("b1", new File(["hello"], "a.txt", { type: "text/plain" }));
    });
    await view.cleanup();
    expect(calls[0].options.signal.aborted).toBe(true);
  });

  test("useResolvedFileUrl returns an https url at once, without calling the adapter", async () => {
    const snapshots: Snapshot[] = [];
    let resolveCalls = 0;
    const adapter: FileUploadAdapter = {
      upload: () => Promise.reject(new Error("not used")),
      resolveUrl: () => {
        resolveCalls += 1;
        return Promise.resolve("blob:https://example.com/x");
      },
    };
    const view = await mount();
    try {
      await view.render(
        <FileUploadScope adapter={adapter} onDone={() => {}}>
          <Probe blockId="b1" stored="https://cdn.example.com/a.png" snapshots={snapshots} />
        </FileUploadScope>,
      );
      await flush();

      expect(snapshots[0].resolved).toEqual({
        status: "ready",
        url: "https://cdn.example.com/a.png",
      });
      expect(resolveCalls).toBe(0);
    } finally {
      await view.cleanup();
    }
  });

  test("useResolvedFileUrl calls resolveUrl for a local-file reference", async () => {
    const snapshots: Snapshot[] = [];
    const requested: string[] = [];
    const adapter: FileUploadAdapter = {
      upload: () => Promise.reject(new Error("not used")),
      resolveUrl: (url) => {
        requested.push(url);
        return Promise.resolve("blob:https://example.com/abc");
      },
    };
    const view = await mount();
    try {
      await view.render(
        <FileUploadScope adapter={adapter} onDone={() => {}}>
          <Probe blockId="b1" stored="local-file:abc" snapshots={snapshots} />
        </FileUploadScope>,
      );
      expect(snapshots[0].resolved).toEqual({ status: "loading" });

      await flush();
      expect(last(snapshots).resolved).toEqual({
        status: "ready",
        url: "blob:https://example.com/abc",
      });
      expect(requested).toEqual(["local-file:abc"]);
    } finally {
      await view.cleanup();
    }
  });

  test("useResolvedFileUrl is unavailable when resolveUrl gives null", async () => {
    const snapshots: Snapshot[] = [];
    const adapter: FileUploadAdapter = {
      upload: () => Promise.reject(new Error("not used")),
      resolveUrl: () => Promise.resolve(null),
    };
    const view = await mount();
    try {
      await view.render(
        <FileUploadScope adapter={adapter} onDone={() => {}}>
          <Probe blockId="b1" stored="local-file:missing" snapshots={snapshots} />
        </FileUploadScope>,
      );
      await flush();

      expect(last(snapshots).resolved).toEqual({ status: "unavailable" });
    } finally {
      await view.cleanup();
    }
  });

  test("useResolvedFileUrl resolves again when the stored url changes", async () => {
    const snapshots: Snapshot[] = [];
    const adapter: FileUploadAdapter = {
      upload: () => Promise.reject(new Error("not used")),
      resolveUrl: (url) => Promise.resolve(`blob:https://example.com/${url.slice(11)}`),
    };
    const view = await mount();
    try {
      await view.render(
        <FileUploadScope adapter={adapter} onDone={() => {}}>
          <Probe blockId="b1" stored="local-file:one" snapshots={snapshots} />
        </FileUploadScope>,
      );
      await flush();
      expect(last(snapshots).resolved).toEqual({
        status: "ready",
        url: "blob:https://example.com/one",
      });

      const before = snapshots.length;
      await view.render(
        <FileUploadScope adapter={adapter} onDone={() => {}}>
          <Probe blockId="b1" stored="local-file:two" snapshots={snapshots} />
        </FileUploadScope>,
      );
      // The first render after the change is loading, before the new url resolves.
      expect(snapshots[before].resolved).toEqual({ status: "loading" });

      await flush();
      expect(last(snapshots).resolved).toEqual({
        status: "ready",
        url: "blob:https://example.com/two",
      });
    } finally {
      await view.cleanup();
    }
  });
});
