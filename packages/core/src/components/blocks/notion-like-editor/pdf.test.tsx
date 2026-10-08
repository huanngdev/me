import { describe, expect, test } from "bun:test";
import { ElementApi, KEYS, type SlateEditor, type TElement } from "platejs";
import { createPlateEditor } from "platejs/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { AssetRecord, AssetStore, UploadSource } from "./editor-assets";
import { EditorSurface } from "./editor-surface";
import { attachFileRuntime } from "./editor-file";
import { createEditorPlugins } from "./editor-plugins";
import type { EditorValue } from "./editor-value";
import { caret, createEditor, createMemoryAssetStore, field } from "./test-utils";

const PDF_BYTES = Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
const HTML_BYTES = new TextEncoder().encode("<html><body>not a pdf</body></html>");

function paragraph(text: string, id: string): TElement {
  return { type: "p", id, children: [{ text }] };
}

function fileNode(id: string, extra: Record<string, unknown> = {}): TElement {
  const node: TElement = { type: "file", id, children: [{ text: "" }] };
  for (const [key, value] of Object.entries(extra)) {
    node[key] = value;
  }
  return node;
}

function byteBlob(bytes: Uint8Array, type: string): Blob {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return new Blob([copy], { type });
}

function uploadSource(bytes: Uint8Array, name: string, type: string): UploadSource {
  const blob = byteBlob(bytes, type);
  return {
    name,
    type,
    size: bytes.byteLength,
    slice: (start, end) => blob.slice(start, end),
  };
}

function withFiles(files: readonly UploadSource[]): DataTransfer {
  const data = new DataTransfer();
  const listed: { length: number; [index: number]: UploadSource } = { length: files.length };
  files.forEach((file, index) => {
    listed[index] = file;
  });
  Object.defineProperty(data, "files", {
    configurable: true,
    enumerable: true,
    get: () => listed,
  });
  return data;
}

function contentOf(editor: SlateEditor): EditorValue {
  const content: EditorValue = [];
  for (const node of editor.children) {
    if (ElementApi.isElement(node)) {
      content.push(node);
    }
  }
  return content;
}

function firstFile(editor: SlateEditor): TElement | undefined {
  return editor.children.find((block) => block.type === KEYS.file);
}

async function settle(): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  }
}

async function until(ready: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (ready()) {
      return;
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  }

  throw new Error("The PDF upload did not settle.");
}

function openFile(value: EditorValue = [paragraph("", "empty")]) {
  const memory = createMemoryAssetStore();
  const editor = createEditor(value);
  editor.tf.select(caret([0, 0], 0));
  const detach = attachFileRuntime(editor, memory.store, {
    now: () => "2026-10-08T00:00:00.000Z",
  });
  return { editor, memory, detach };
}

function isReactContainer(value: object): value is Parameters<typeof createRoot>[0] {
  return "nodeType" in value && value.nodeType === 1;
}

function stubAnimationFrame(): () => void {
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

async function mountPdf(
  value: EditorValue,
  options: { readOnly?: boolean; store?: AssetStore | null } = {},
) {
  const restoreFrame = stubAnimationFrame();
  const before = new Set(Array.from(document.body.childNodes));
  const host = document.createElement("div");
  document.body.appendChild(host);
  const editor = createPlateEditor({ plugins: createEditorPlugins(), value });
  let root: Root | undefined;
  if (!isReactContainer(host)) {
    throw new Error("Missing mount node.");
  }

  await act(async () => {
    root = createRoot(host);
    root.render(
      <EditorSurface
        editor={editor}
        readOnly={options.readOnly === true}
        placeholder=""
        className="editor"
        assetStore={options.store ?? null}
      />,
    );
  });

  return {
    editor,
    host,
    cleanup: async () => {
      await act(async () => {
        root?.unmount();
      });
      for (const node of Array.from(document.body.childNodes)) {
        if (!before.has(node)) {
          node.remove();
        }
      }
      restoreFrame();
    },
  };
}

function pdfRecord(id: string, mimeType: string, name: string, byteSize: number): AssetRecord {
  return {
    id,
    kind: "file",
    name,
    mimeType,
    byteSize,
    createdAt: "2026-10-08T00:00:00.000Z",
  };
}

function setPdfViewer(value: boolean | undefined): void {
  Object.defineProperty(navigator, "pdfViewerEnabled", {
    configurable: true,
    enumerable: true,
    get: () => value,
  });
}

function restorePdfViewer(previous: PropertyDescriptor | undefined): void {
  if (previous) {
    Object.defineProperty(navigator, "pdfViewerEnabled", previous);
  } else {
    Reflect.deleteProperty(navigator, "pdfViewerEnabled");
  }
}

function controlByText(root: ParentNode, text: string): HTMLElement | undefined {
  for (const element of root.querySelectorAll("button, a")) {
    if (element.textContent === text && element instanceof HTMLElement) {
      return element;
    }
  }
  return undefined;
}

// happy-dom fires error as soon as an iframe points at a blob, before the test can look.
function skipFirstIframeError(): () => void {
  const proto = HTMLIFrameElement.prototype;
  const original = proto.addEventListener;
  proto.addEventListener = function (
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ) {
    if (listener === null) {
      return;
    }
    if (type !== "error" || typeof listener !== "function") {
      return original.call(this, type, listener, options);
    }

    let skipped = false;
    const wrapped: EventListener = (event) => {
      if (!skipped) {
        skipped = true;
        return;
      }
      listener.call(this, event);
    };
    return original.call(this, type, wrapped, options);
  };

  return () => {
    proto.addEventListener = original;
  };
}

function clickControl(element: HTMLElement): void {
  element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
  element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
  element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
}

async function storedPdf(type: string) {
  const record = pdfRecord("local", "application/pdf", "notes.pdf", PDF_BYTES.byteLength);
  const memory = createMemoryAssetStore();
  await memory.store.put(record, byteBlob(PDF_BYTES, type));
  return {
    store: memory.store,
    value: [
      paragraph("Hello", "a"),
      fileNode("clip", {
        assetId: "local",
        name: "notes.pdf",
        mimeType: "application/pdf",
        byteSize: PDF_BYTES.byteLength,
      }),
      paragraph("World", "b"),
    ] satisfies EditorValue,
  };
}

describe("pdf preview", () => {
  test("a pasted PDF stores application/pdf, and a .pdf name with other bytes has no Preview", async () => {
    const previous = Object.getOwnPropertyDescriptor(navigator, "pdfViewerEnabled");
    setPdfViewer(true);
    try {
      const pdf = openFile();
      pdf.editor.tf.insertData(withFiles([uploadSource(PDF_BYTES, "notes.txt", "text/plain")]));
      await until(() => typeof field(firstFile(pdf.editor), "assetId") === "string");
      expect(firstFile(pdf.editor)?.type).toBe("file");
      expect(field(firstFile(pdf.editor), "mimeType")).toBe("application/pdf");
      const shown = await mountPdf(contentOf(pdf.editor), { store: pdf.memory.store });
      await act(async () => {
        await settle();
      });
      expect(controlByText(shown.host, "Preview")).toBeDefined();
      await shown.cleanup();
      pdf.detach();

      const fake = openFile();
      fake.editor.tf.insertData(
        withFiles([uploadSource(HTML_BYTES, "notes.pdf", "application/pdf")]),
      );
      await until(() => typeof field(firstFile(fake.editor), "assetId") === "string");
      expect(firstFile(fake.editor)?.type).toBe("file");
      expect(field(firstFile(fake.editor), "mimeType")).toBe("application/octet-stream");
      const hidden = await mountPdf(contentOf(fake.editor), { store: fake.memory.store });
      await act(async () => {
        await settle();
      });
      expect(controlByText(hidden.host, "Preview")).toBeUndefined();
      expect(hidden.host.querySelector("iframe, object, embed")).toBeNull();
      await hidden.cleanup();
      fake.detach();
    } finally {
      restorePdfViewer(previous);
    }
  });

  test("preview shows only for an asset PDF when pdfViewerEnabled is true", async () => {
    const previous = Object.getOwnPropertyDescriptor(navigator, "pdfViewerEnabled");
    try {
      const asset = await storedPdf("application/pdf");
      setPdfViewer(true);
      const enabled = await mountPdf(asset.value, { store: asset.store });
      await act(async () => {
        await settle();
      });
      expect(controlByText(enabled.host, "Preview")).toBeDefined();
      await enabled.cleanup();

      setPdfViewer(false);
      const disabled = await mountPdf(asset.value, { store: asset.store });
      await act(async () => {
        await settle();
      });
      expect(controlByText(disabled.host, "Preview")).toBeUndefined();
      await disabled.cleanup();

      setPdfViewer(undefined);
      const missing = await mountPdf(asset.value, { store: asset.store });
      await act(async () => {
        await settle();
      });
      expect(controlByText(missing.host, "Preview")).toBeUndefined();
      await missing.cleanup();

      setPdfViewer(true);
      const linked = await mountPdf([
        fileNode("clip", {
          url: "https://files.example/notes.pdf",
          name: "notes.pdf",
          mimeType: "application/pdf",
          byteSize: PDF_BYTES.byteLength,
        }),
      ]);
      await act(async () => {
        await settle();
      });
      expect(controlByText(linked.host, "Preview")).toBeUndefined();
      expect(controlByText(linked.host, "Download")).toBeDefined();
      expect(controlByText(linked.host, "Open")).toBeDefined();
      await linked.cleanup();

      const memory = createMemoryAssetStore();
      const adapter: AssetStore = {
        put: (record, blob) => memory.store.put(record, blob),
        get: (id) => memory.store.get(id),
        delete: (id) => memory.store.delete(id),
        list: () => memory.store.list(),
        resolveUrl: () => Promise.resolve({ url: "https://cdn.example/notes.pdf" }),
      };
      const remote = await mountPdf(
        [
          fileNode("clip", {
            assetId: "private",
            name: "notes.pdf",
            mimeType: "application/pdf",
            byteSize: PDF_BYTES.byteLength,
          }),
        ],
        { store: adapter },
      );
      await act(async () => {
        await settle();
      });
      expect(controlByText(remote.host, "Preview")).toBeUndefined();
      expect(controlByText(remote.host, "Download")).toBeDefined();
      await remote.cleanup();

      const plainRecord = pdfRecord("text", "application/octet-stream", "notes.txt", 4);
      await memory.store.put(plainRecord, byteBlob(Uint8Array.from([1, 2, 3, 4]), "text/plain"));
      const plain = await mountPdf(
        [
          fileNode("clip", {
            assetId: "text",
            name: "notes.txt",
            mimeType: "application/octet-stream",
            byteSize: 4,
          }),
        ],
        { store: memory.store },
      );
      await act(async () => {
        await settle();
      });
      expect(controlByText(plain.host, "Preview")).toBeUndefined();
      expect(controlByText(plain.host, "Download")).toBeDefined();
      await plain.cleanup();
    } finally {
      restorePdfViewer(previous);
    }
  });

  test("the dialog mounts one iframe, and Escape restores focus without history or selection changes", async () => {
    const previous = Object.getOwnPropertyDescriptor(navigator, "pdfViewerEnabled");
    const restoreErrors = skipFirstIframeError();
    setPdfViewer(true);
    try {
      const asset = await storedPdf("application/pdf");
      const mounted = await mountPdf(asset.value, { store: asset.store });
      await act(async () => {
        await settle();
      });
      mounted.editor.tf.select(caret([2, 0], 5));
      const undos = mounted.editor.history.undos.length;
      const selection = JSON.stringify(mounted.editor.selection);
      const children = JSON.stringify(mounted.editor.children);
      expect(document.querySelector("iframe, object, embed")).toBeNull();
      expect(document.querySelector("[data-slot='dialog-content']")).toBeNull();
      expect(document.body.textContent).not.toContain("This browser can't preview PDFs");

      const preview = controlByText(mounted.host, "Preview");
      if (!preview) {
        throw new Error("Missing Preview.");
      }
      await act(async () => {
        clickControl(preview);
        await settle();
      });
      const frames = document.querySelectorAll("iframe");
      expect(frames).toHaveLength(1);
      expect(frames[0]?.getAttribute("src")?.startsWith("blob:")).toBe(true);
      expect(frames[0]?.getAttribute("title")).toBe("Preview of notes.pdf");
      expect(frames[0]?.hasAttribute("sandbox")).toBe(false);
      expect(document.querySelectorAll("object, embed")).toHaveLength(0);
      expect(JSON.stringify(mounted.editor.selection)).toBe(selection);
      expect(mounted.editor.history.undos.length).toBe(undos);
      expect(JSON.stringify(mounted.editor.children)).toBe(children);

      await act(async () => {
        document.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
        );
        await settle();
      });
      expect(document.querySelector("iframe")).toBeNull();
      expect(document.querySelector("[data-slot='dialog-content']")).toBeNull();
      // Radix returns focus on the next timeout, after the dialog has unmounted.
      await act(async () => {
        await settle();
      });
      expect(document.activeElement === preview).toBe(true);
      expect(JSON.stringify(mounted.editor.selection)).toBe(selection);
      expect(mounted.editor.history.undos.length).toBe(undos);
      await mounted.cleanup();
    } finally {
      restoreErrors();
      restorePdfViewer(previous);
    }
  });

  test("a stored PDF blob with an empty type is re-wrapped before createObjectURL", async () => {
    const previousViewer = Object.getOwnPropertyDescriptor(navigator, "pdfViewerEnabled");
    const previousCreate = Reflect.get(URL, "createObjectURL");
    const seen: { blob: Blob; type: string }[] = [];
    setPdfViewer(true);
    Reflect.set(URL, "createObjectURL", (blob: Blob) => {
      seen.push({ blob, type: blob.type });
      return `blob:preview-${String(seen.length)}`;
    });
    try {
      const empty = await storedPdf("");
      const wrapped = await mountPdf(empty.value, { store: empty.store });
      await act(async () => {
        await settle();
      });
      expect(seen.map((entry) => entry.type)).toEqual(["application/pdf"]);
      await wrapped.cleanup();

      const original = byteBlob(PDF_BYTES, "application/pdf");
      const typedRecord = pdfRecord("typed", "application/pdf", "typed.pdf", PDF_BYTES.byteLength);
      const typedStore = createMemoryAssetStore();
      await typedStore.store.put(typedRecord, original);
      seen.length = 0;
      const typed = await mountPdf(
        [
          fileNode("clip", {
            assetId: "typed",
            name: "typed.pdf",
            mimeType: "application/pdf",
            byteSize: PDF_BYTES.byteLength,
          }),
        ],
        { store: typedStore.store },
      );
      await act(async () => {
        await settle();
      });
      expect(seen).toHaveLength(1);
      expect(seen[0]?.blob).toBe(original);
      expect(seen[0]?.type).toBe("application/pdf");
      await typed.cleanup();

      const plain = byteBlob(Uint8Array.from([1, 2, 3, 4]), "text/plain");
      const plainRecord = pdfRecord("plain", "application/octet-stream", "notes.txt", 4);
      const plainStore = createMemoryAssetStore();
      await plainStore.store.put(plainRecord, plain);
      seen.length = 0;
      const other = await mountPdf(
        [
          fileNode("clip", {
            assetId: "plain",
            name: "notes.txt",
            mimeType: "application/octet-stream",
            byteSize: 4,
          }),
        ],
        { store: plainStore.store },
      );
      await act(async () => {
        await settle();
      });
      expect(seen).toHaveLength(1);
      expect(seen[0]?.blob).toBe(plain);
      expect(seen[0]?.type).toBe(plain.type);
      await other.cleanup();
    } finally {
      if (previousCreate === undefined) {
        Reflect.deleteProperty(URL, "createObjectURL");
      } else {
        Reflect.set(URL, "createObjectURL", previousCreate);
      }
      restorePdfViewer(previousViewer);
    }
  });

  test("an iframe error replaces the preview with a download", async () => {
    const previous = Object.getOwnPropertyDescriptor(navigator, "pdfViewerEnabled");
    const restoreErrors = skipFirstIframeError();
    setPdfViewer(true);
    try {
      const asset = await storedPdf("application/pdf");
      const mounted = await mountPdf(asset.value, { store: asset.store });
      await act(async () => {
        await settle();
      });
      const preview = controlByText(mounted.host, "Preview");
      if (!preview) {
        throw new Error("Missing Preview.");
      }
      await act(async () => {
        clickControl(preview);
        await settle();
      });
      const frame = document.querySelector("iframe");
      if (!frame) {
        throw new Error("Missing preview frame.");
      }
      await act(async () => {
        frame.dispatchEvent(new Event("error"));
        await settle();
      });
      const dialog = document.querySelector("[data-slot='dialog-content']");
      expect(dialog?.textContent).toContain("This browser can't preview PDFs");
      expect(dialog?.querySelector("iframe")).toBeNull();
      const download = dialog ? controlByText(dialog, "Download") : undefined;
      expect(download?.getAttribute("href")?.startsWith("blob:")).toBe(true);
      expect(download?.getAttribute("download")).toBe("notes.pdf");
      await mounted.cleanup();
    } finally {
      restoreErrors();
      restorePdfViewer(previous);
    }
  });

  test("read-only preview opens, and the file toolbar stays hidden", async () => {
    const previous = Object.getOwnPropertyDescriptor(navigator, "pdfViewerEnabled");
    const restoreErrors = skipFirstIframeError();
    setPdfViewer(true);
    try {
      const asset = await storedPdf("application/pdf");
      const mounted = await mountPdf(asset.value, { store: asset.store, readOnly: true });
      await act(async () => {
        await settle();
      });
      expect(mounted.host.textContent).not.toContain("Replace file");
      expect(mounted.host.querySelector("[aria-label='Remove']")).toBeNull();
      expect(mounted.host.querySelector("[aria-label='Caption']")).toBeNull();
      expect(mounted.host.querySelector("textarea")).toBeNull();
      const preview = controlByText(mounted.host, "Preview");
      if (!preview) {
        throw new Error("Missing Preview.");
      }
      await act(async () => {
        clickControl(preview);
        await settle();
      });
      expect(document.querySelector("iframe")?.getAttribute("title")).toBe("Preview of notes.pdf");
      await mounted.cleanup();
    } finally {
      restoreErrors();
      restorePdfViewer(previous);
    }
  });
});
