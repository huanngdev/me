import { describe, expect, test } from "bun:test";
import { CaptionPlugin } from "@platejs/caption/react";
import { KEYS, type SlateEditor, type TElement } from "platejs";
import { createPlateEditor } from "platejs/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";

import { collectAssetIds } from "./asset-references";
import {
  clearFormatting,
  getBlockType,
  runEditorCommand,
  setLineHeight,
  setTextAlign,
  turnIntoBlockquote,
  turnIntoHeading1,
} from "./editor-commands";
import { createEditorDocument } from "./editor-document";
import { allowedChildTypes, isVoidElementType } from "./editor-document-schema";
import { parseEditorDocument, type ParseResult } from "./editor-document-validate";
import { ASSET_LIMITS, type AssetStore, type UploadSource } from "./editor-assets";
import { handleImageDrop } from "./editor-image";
import { EditorSurface } from "./editor-surface";
import { createEditorPlugins } from "./editor-plugins";
import { MEDIA_FILE_SKIPPED } from "./editor-media";
import { pasteRepairsOf } from "./editor-paste";
import {
  AUDIO_BOTH_SOURCES,
  AUDIO_CANT_PLAY,
  AUDIO_NOT_FOUND,
  AUDIO_UNSAFE_URL,
  attachAudioRuntime,
  audioDisplayName,
  audioMedia,
  audioUploadState,
  ensureAudioMedia,
  formatAudioDuration,
  holdAudioUpload,
  insertAudioFromFiles,
  insertAudioFromUrl,
  probeAudioDuration,
  removeAudio,
  replaceAudioFromFile,
  retryAudioUpload,
  setAudioAlign,
} from "./editor-audio";
import type { EditorValue } from "./editor-value";
import {
  blockIds,
  caret,
  createEditor,
  createMemoryAssetStore,
  expectOk,
  expectUnsupported,
  field,
  isRecord,
  texts,
} from "./test-utils";

const WAV_BYTES = Uint8Array.from([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45, 0x66, 0x6d, 0x74, 0x20,
]);

const OGG_BYTES = Uint8Array.from([
  0x4f, 0x67, 0x67, 0x53, 0x00, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
]);

const PNG_BYTES = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
]);

const LONG_NAME =
  "A very long audio file name that must ellipsize inside a three hundred sixty pixel column";

function paragraph(text: string, id: string): TElement {
  return { type: "p", id, children: [{ text }] };
}

function audio(id: string, extra: Record<string, unknown> = {}): TElement {
  const node: TElement = { type: "audio", id, children: [{ text: "" }] };
  for (const [key, value] of Object.entries(extra)) {
    node[key] = value;
  }
  return node;
}

function quote(id: string, children: TElement[]): TElement {
  return { type: "blockquote", id, children };
}

function callout(id: string, children: TElement[]): TElement {
  return { type: "callout", id, children };
}

function toggle(id: string, children: TElement[]): TElement {
  return { type: "toggle", id, children };
}

function cell(kind: "td" | "th", id: string, children: TElement[]): TElement {
  return { type: kind, id, children };
}

function row(id: string, cells: TElement[]): TElement {
  return { type: "tr", id, children: cells };
}

function tableNode(id: string, rows: TElement[]): TElement {
  return { type: "table", id, children: rows };
}

function documentOf(content: TElement[]): ParseResult {
  return parseEditorDocument(createEditorDocument("doc-audio", content));
}

function messages(result: ParseResult): string {
  if (result.status !== "invalid" && result.status !== "unsupported") {
    return "";
  }

  return result.issues.map((issue) => issue.message).join("\n");
}

function typesOf(editor: SlateEditor): string[] {
  return editor.children.map((block) => block.type);
}

function childTypes(node: unknown): string[] {
  if (!isRecord(node) || !Array.isArray(node.children)) {
    return [];
  }

  return node.children.map((child) => {
    const type = field(child, "type");
    return typeof type === "string" ? type : "";
  });
}

function childIds(node: unknown): string[] {
  if (!isRecord(node) || !Array.isArray(node.children)) {
    return [];
  }

  return node.children.map((child) => {
    const id = field(child, "id");
    return typeof id === "string" ? id : "";
  });
}

function selectBlock(editor: SlateEditor, index: number): void {
  const anchor = editor.api.start([index]);
  const focus = editor.api.end([index]);
  if (!anchor || !focus) {
    throw new Error(`Missing block ${index}.`);
  }

  editor.tf.select({ anchor, focus });
}

function snapshot(value: unknown) {
  return JSON.parse(JSON.stringify(value));
}

function byteBlob(bytes: Uint8Array, type: string): Blob {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return new Blob([copy], { type });
}

function uploadSource(
  bytes: Uint8Array,
  name: string,
  type: string,
  size = bytes.byteLength,
): UploadSource {
  const blob = byteBlob(bytes, type);
  return {
    name,
    type,
    size,
    slice: (start, end) => blob.slice(start, end),
  };
}

function wavSource(name = "tone.wav", size = WAV_BYTES.byteLength): UploadSource {
  return uploadSource(WAV_BYTES, name, "audio/wav", size);
}

function withFiles(files: readonly UploadSource[], html?: string): DataTransfer {
  const data = new DataTransfer();
  if (html !== undefined) {
    data.setData("text/html", html);
  }

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

  throw new Error("The audio upload did not settle.");
}

function openAudio(value: EditorValue = [paragraph("", "empty")]) {
  let step = 0;
  const memory = createMemoryAssetStore();
  const editor = createEditor(value);
  editor.tf.select(caret([0, 0], 0));
  const detach = attachAudioRuntime(editor, memory.store, {
    probe: async (_blob, kind) => {
      if (kind !== "audio") {
        return undefined;
      }
      return { durationMs: 1500 };
    },
    createId: () => {
      step += 1;
      return `id-${String(step)}`;
    },
    now: () => "2026-10-08T00:00:00.000Z",
  });

  return { editor, memory, detach };
}

function isAudio(node: Element | null): node is HTMLAudioElement {
  const sample = document.createElement("audio");
  return node instanceof sample.constructor;
}

function audioNode(editor: SlateEditor): TElement | undefined {
  return editor.children.find((block) => block.type === KEYS.audio);
}

function isAudioPrototype(value: object): value is { canPlayType: (type: string) => string } {
  return "canPlayType" in value && typeof value.canPlayType === "function";
}

function audioPrototype(): { canPlayType: (type: string) => string } {
  const sample = document.createElement("audio");
  const proto: unknown = Object.getPrototypeOf(sample);
  if (typeof proto !== "object" || proto === null || !isAudioPrototype(proto)) {
    throw new Error("Missing audio prototype.");
  }

  return proto;
}

function stubCanPlay(value: string): () => void {
  const proto = audioPrototype();
  const previous = proto.canPlayType;
  proto.canPlayType = () => value;
  return () => {
    proto.canPlayType = previous;
  };
}

type FakeObserver = {
  callback: (entries: { isIntersecting: boolean }[]) => void;
  rootMargin: string;
  observe: () => void;
  disconnect: () => void;
};

function installObserver(): { last: () => FakeObserver | undefined; restore: () => void } {
  const previous = Reflect.get(globalThis, "IntersectionObserver");
  let current: FakeObserver | undefined;
  function Observer(
    this: FakeObserver,
    callback: (entries: { isIntersecting: boolean }[]) => void,
    options?: { rootMargin?: string },
  ) {
    this.callback = callback;
    this.rootMargin = options?.rootMargin ?? "";
    this.observe = () => undefined;
    this.disconnect = () => undefined;
    current = {
      callback: this.callback,
      rootMargin: this.rootMargin,
      observe: this.observe,
      disconnect: this.disconnect,
    };
  }
  Reflect.set(globalThis, "IntersectionObserver", Observer);
  return {
    last: () => current,
    restore() {
      if (previous === undefined) {
        Reflect.deleteProperty(globalThis, "IntersectionObserver");
      } else {
        Reflect.set(globalThis, "IntersectionObserver", previous);
      }
    },
  };
}

function renderAudio(value: EditorValue, readOnly = false): string {
  const editor = createPlateEditor({ plugins: createEditorPlugins(), value });
  return renderToStaticMarkup(
    <EditorSurface editor={editor} readOnly={readOnly} placeholder="" className="editor" />,
  );
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

async function mountAudio(
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

const urlAudio = audio("clip", {
  url: "https://audio.example/tone.wav",
  mimeType: "audio/wav",
  name: "tone.wav",
  durationMs: 65000,
  caption: [{ text: "A short tone." }],
});

describe("audio schema", () => {
  test("an asset audio and a url audio round-trip with name, duration, and caption", () => {
    expect(isVoidElementType(KEYS.audio)).toBe(true);
    expect(audioMedia.spec.nodeType).toBe(KEYS.audio);
    expect(audioMedia.spec.assetKind).toBe("audio");
    expect(audioMedia.spec.mimePrefix).toBe("audio/");
    expect(audioMedia.spec.minWidth).toBeUndefined();
    expect(audioMedia.spec.commands.width).toBeUndefined();
    expect(allowedChildTypes("toggle")).toContain(KEYS.audio);
    expect(allowedChildTypes("blockquote")).toEqual(["p"]);

    const asset = audio("asset-audio", {
      assetId: "asset-1",
      mimeType: "audio/mpeg",
      name: "song.mp3",
      durationMs: 1500,
      align: "left",
      caption: [{ text: "Stored" }],
    });
    const remote = audio("url-audio", {
      url: "https://audio.example/tone.wav",
      mimeType: "audio/wav",
      name: "tone.wav",
      durationMs: 2000,
      align: "right",
      caption: [{ text: "Remote" }],
    });
    const content = [asset, remote];
    const parsed = expectOk(documentOf(content));

    expect(parsed.repairs).toEqual([]);
    expect(parsed.document.content).toBe(content);
    expect(collectAssetIds(content).has("asset-1")).toBe(true);
  });

  test("a sourceless audio node is ok", () => {
    const content = [audio("pending")];
    const parsed = expectOk(documentOf(content));
    expect(parsed.document.content).toBe(content);
  });

  test("playback state, width, a bad mime, an unsafe url, both sources, and a bad name are rejected", () => {
    const currentTime = expectUnsupported(documentOf([audio("clip", { currentTime: 3 })]));
    const paused = expectUnsupported(documentOf([audio("clip", { paused: true })]));
    const width = expectUnsupported(documentOf([audio("clip", { width: 320 })]));
    const mime = expectUnsupported(documentOf([audio("clip", { mimeType: "audio/webm" })]));
    const unsafe = expectUnsupported(
      documentOf([audio("clip", { url: "http://audio.example/tone.wav" })]),
    );
    const blob = expectUnsupported(
      documentOf([audio("clip", { url: "blob:https://audio.example/1" })]),
    );
    const both = expectUnsupported(
      documentOf([audio("clip", { assetId: "asset-1", url: "https://audio.example/tone.wav" })]),
    );
    const named = expectUnsupported(documentOf([audio("clip", { name: "bad\nname.wav" })]));
    const long = expectUnsupported(documentOf([audio("clip", { name: "a".repeat(256) })]));
    const spaced = expectUnsupported(documentOf([audio("clip", { name: " tone.wav " })]));
    const duration = expectUnsupported(documentOf([audio("clip", { durationMs: 1.5 })]));

    expect(messages(currentTime)).toContain("currentTime");
    expect(messages(paused)).toContain("paused");
    expect(messages(width)).toContain("width");
    expect(messages(mime)).toContain("mimeType");
    expect(messages(unsafe)).toContain("unsupported url");
    expect(messages(blob)).toContain("blob:");
    expect(messages(both)).toContain("both assetId and url");
    expect(messages(named)).toContain("name");
    expect(messages(long)).toContain("name");
    expect(messages(spaced)).toContain("name");
    expect(messages(duration)).toContain("duration");
    expect(currentTime.raw).toBeDefined();
    expect(width.raw).toBeDefined();
  });
});

describe("audio commands", () => {
  test("insert from files and from a url, and one undo removes each insert", async () => {
    const uploaded = openAudio();
    const beforeFiles = snapshot(uploaded.editor.children);

    expect(insertAudioFromFiles.id).toBe("block.insert.audio");
    expect(insertAudioFromFiles.label).toBe("Audio");
    expect(
      runEditorCommand(uploaded.editor, insertAudioFromFiles, [wavSource("  tone.wav  ")]),
    ).toBe(true);
    await until(() => field(audioNode(uploaded.editor), "assetId") === "id-2");

    expect(field(audioNode(uploaded.editor), "mimeType")).toBe("audio/wav");
    expect(field(audioNode(uploaded.editor), "name")).toBe("tone.wav");
    expect(field(audioNode(uploaded.editor), "durationMs")).toBe(1500);
    expect(field(audioNode(uploaded.editor), "url")).toBeUndefined();
    expect(field(audioNode(uploaded.editor), "width")).toBeUndefined();
    expect(uploaded.editor.history.undos.length).toBe(1);
    uploaded.editor.tf.undo();
    expect(uploaded.editor.children).toEqual(beforeFiles);
    uploaded.detach();

    const linked = openAudio();
    const beforeUrl = snapshot(linked.editor.children);
    expect(insertAudioFromUrl.id).toBe("block.insert.audio-url");
    expect(insertAudioFromUrl.label).toBe("Audio from URL");
    expect(
      runEditorCommand(linked.editor, insertAudioFromUrl, "https://audio.example/tone.wav"),
    ).toBe(true);
    expect(field(audioNode(linked.editor), "url")).toBe("https://audio.example/tone.wav");
    linked.editor.tf.undo();
    expect(linked.editor.children).toEqual(beforeUrl);

    const invalid = snapshot(linked.editor.children);
    runEditorCommand(linked.editor, insertAudioFromUrl, "http://audio.example/tone.wav");
    runEditorCommand(linked.editor, insertAudioFromUrl, "blob:https://audio.example/1");
    expect(linked.editor.children).toEqual(invalid);
    linked.detach();
  });

  test("replace keeps the block id, and align, caption, and remove each undo in one step", async () => {
    const { editor, detach } = openAudio();
    runEditorCommand(editor, insertAudioFromUrl, "https://audio.example/tone.wav");
    const id = field(audioNode(editor), "id");
    runEditorCommand(editor, replaceAudioFromFile, { id: String(id), file: wavSource() });
    await until(() => field(audioNode(editor), "assetId") === "id-2");

    expect(field(audioNode(editor), "id")).toBe(id);
    expect(field(audioNode(editor), "url")).toBeUndefined();
    expect(field(audioNode(editor), "mimeType")).toBe("audio/wav");
    expect(field(audioNode(editor), "name")).toBe("tone.wav");
    editor.tf.undo();
    expect(field(audioNode(editor), "id")).toBe(id);
    expect(field(audioNode(editor), "url")).toBe("https://audio.example/tone.wav");
    expect(field(audioNode(editor), "assetId")).toBeUndefined();
    detach();

    const aligned = createEditor([urlAudio]);
    runEditorCommand(aligned, setAudioAlign, { id: "clip", align: "left" });
    expect(field(aligned.children[0], "align")).toBe("left");
    aligned.tf.undo();
    expect(field(aligned.children[0], "align")).toBeUndefined();
    runEditorCommand(aligned, setAudioAlign, { id: "clip", align: "center" });
    expect(field(aligned.children[0], "align")).toBeUndefined();
    runEditorCommand(aligned, ensureAudioMedia().setWidth, { id: "clip", width: 240 });
    expect(field(aligned.children[0], "width")).toBeUndefined();

    aligned.tf.setNodes({ caption: [{ text: "A new caption" }] }, { at: [0] });
    expect(field(aligned.children[0], "caption")).toEqual([{ text: "A new caption" }]);
    expect(field(aligned.children[0], "url")).toBe("https://audio.example/tone.wav");
    aligned.tf.undo();
    expect(field(aligned.children[0], "caption")).toEqual([{ text: "A short tone." }]);

    runEditorCommand(aligned, removeAudio, "clip");
    expect(typesOf(aligned)).toEqual([]);
    aligned.tf.undo();
    expect(field(aligned.children[0], "id")).toBe("clip");
    expect(field(aligned.children[0], "url")).toBe("https://audio.example/tone.wav");
  });

  test("read-only refuses audio commands", () => {
    const editor = createEditor([paragraph("", "empty")]);
    editor.tf.select(caret([0, 0], 0));
    const before = snapshot(editor.children);
    expect(
      runEditorCommand(editor, insertAudioFromUrl, "https://audio.example/a.wav", {
        readOnly: true,
      }),
    ).toBe(false);
    expect(runEditorCommand(editor, insertAudioFromFiles, [wavSource()], { readOnly: true })).toBe(
      false,
    );
    expect(editor.children).toEqual(before);

    editor.dom.readOnly = true;
    runEditorCommand(editor, insertAudioFromUrl, "https://audio.example/a.wav");
    runEditorCommand(editor, setAudioAlign, { id: "clip", align: "left" });
    runEditorCommand(editor, removeAudio, "clip");
    expect(editor.children).toEqual(before);
  });

  test("turn into and clear formatting leave a selected audio block as audio", () => {
    const editor = createEditor([paragraph("Alpha", "a"), urlAudio, paragraph("Beta", "b")]);
    selectBlock(editor, 1);
    const before = snapshot(editor.children[1]);
    runEditorCommand(editor, turnIntoHeading1, undefined);
    runEditorCommand(editor, turnIntoBlockquote, undefined);
    runEditorCommand(editor, setTextAlign, "center");
    runEditorCommand(editor, setLineHeight, 2);
    runEditorCommand(editor, clearFormatting, undefined);
    expect(editor.children[1]).toEqual(before);
    expect(getBlockType(editor)).toBe("audio");
  });
});

describe("audio upload", () => {
  test("oversize, the wrong bytes, and a corrupt sniff fail with no asset id", async () => {
    const oversize = openAudio();
    runEditorCommand(oversize.editor, insertAudioFromFiles, [
      wavSource("big.wav", ASSET_LIMITS.audio + 1),
    ]);
    const oversizeId = String(field(audioNode(oversize.editor), "id"));
    await until(() => audioUploadState(oversize.editor, oversizeId)?.status === "failed");
    expect(audioUploadState(oversize.editor, oversizeId)?.error).toContain("25 MB");
    expect(audioUploadState(oversize.editor, oversizeId)?.error).toContain("limit");
    expect(field(audioNode(oversize.editor), "assetId")).toBeUndefined();
    oversize.detach();

    const wrong = openAudio();
    runEditorCommand(wrong.editor, insertAudioFromFiles, [
      uploadSource(PNG_BYTES, "song.mp3", "audio/mpeg"),
    ]);
    const wrongId = String(field(audioNode(wrong.editor), "id"));
    await until(() => audioUploadState(wrong.editor, wrongId)?.status === "failed");
    expect(audioUploadState(wrong.editor, wrongId)?.error).toContain("not an MP3");
    expect(field(audioNode(wrong.editor), "assetId")).toBeUndefined();
    wrong.detach();

    const corrupt = openAudio();
    runEditorCommand(corrupt.editor, insertAudioFromFiles, [
      uploadSource(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]), "bad.mp3", "audio/mpeg"),
    ]);
    const corruptId = String(field(audioNode(corrupt.editor), "id"));
    await until(() => audioUploadState(corrupt.editor, corruptId)?.status === "failed");
    expect(audioUploadState(corrupt.editor, corruptId)?.error).toContain("not an MP3");
    expect(await corrupt.memory.store.list()).toEqual([]);
    corrupt.detach();
  });

  test("cancel keeps the file for retry, and deleting during upload writes nothing", async () => {
    const canceled = openAudio();
    canceled.memory.hold();
    runEditorCommand(canceled.editor, insertAudioFromFiles, [wavSource()]);
    const id = String(field(audioNode(canceled.editor), "id"));
    await until(
      () =>
        canceled.memory.puts() === 1 || audioUploadState(canceled.editor, id)?.status === "failed",
    );
    if (canceled.memory.puts() !== 1) {
      throw new Error(
        `upload ${JSON.stringify(audioUploadState(canceled.editor, id))} puts ${String(canceled.memory.puts())}`,
      );
    }
    holdAudioUpload(canceled.editor, id);
    canceled.memory.release();
    await settle();

    expect(audioUploadState(canceled.editor, id)?.status).toBe("failed");
    expect(audioUploadState(canceled.editor, id)?.error).toBe("Upload canceled.");
    expect(field(audioNode(canceled.editor), "assetId")).toBeUndefined();
    expect(typesOf(canceled.editor)).toContain("audio");

    retryAudioUpload(canceled.editor, id);
    await until(() => field(audioNode(canceled.editor), "assetId") === "id-3");
    expect(field(audioNode(canceled.editor), "mimeType")).toBe("audio/wav");
    expect(field(audioNode(canceled.editor), "name")).toBe("tone.wav");
    canceled.detach();

    const removed = openAudio([paragraph("Keep", "keep")]);
    removed.editor.tf.select(caret([0, 0], 4));
    removed.memory.hold();
    runEditorCommand(removed.editor, insertAudioFromFiles, [wavSource()]);
    await until(() => removed.memory.puts() === 1);
    const removedId = String(field(audioNode(removed.editor), "id"));
    const audioPath = removed.editor.children.findIndex((block) => block.type === KEYS.audio);
    removed.editor.tf.removeNodes({ at: [audioPath], voids: true });
    removed.memory.release();
    await settle();

    expect(typesOf(removed.editor)).not.toContain("audio");
    expect(await removed.memory.store.list()).toEqual([]);
    expect(JSON.stringify(removed.editor.children)).not.toContain(removedId);
    removed.detach();
  });

  test("the headless metadata probe returns undefined", async () => {
    const probed = await probeAudioDuration(byteBlob(WAV_BYTES, "audio/wav"));
    expect(probed).toBeUndefined();
  });

  test("an adapter audio refreshes its url once", async () => {
    const restorePlay = stubCanPlay("maybe");
    const memory = createMemoryAssetStore();
    const urls = ["https://cdn.example/one.wav", "https://cdn.example/two.wav"];
    let calls = 0;
    const store: AssetStore = {
      put: (record, blob) => memory.store.put(record, blob),
      get: (id) => memory.store.get(id),
      delete: (id) => memory.store.delete(id),
      list: () => memory.store.list(),
      resolveUrl: () => {
        const url = urls[Math.min(calls, urls.length - 1)] ?? urls[0];
        calls += 1;
        return Promise.resolve({ url });
      },
    };
    try {
      const mounted = await mountAudio(
        [audio("clip", { assetId: "asset-1", mimeType: "audio/wav", name: "tone.wav" })],
        { store },
      );
      await act(async () => {
        await settle();
      });
      const first = mounted.host.querySelector("audio");
      expect(first?.getAttribute("src")).toBe("https://cdn.example/one.wav");
      await act(async () => {
        first?.dispatchEvent(new Event("error"));
        await settle();
      });
      const second = mounted.host.querySelector("audio");
      expect(second?.getAttribute("src")).toBe("https://cdn.example/two.wav");
      expect(mounted.host.textContent).not.toContain(AUDIO_CANT_PLAY);
      await act(async () => {
        second?.dispatchEvent(new Event("error"));
        await settle();
      });
      expect(mounted.host.textContent).toContain(AUDIO_CANT_PLAY);
      expect(mounted.host.textContent).toContain("Download");
      expect(calls).toBe(2);
      await mounted.cleanup();
    } finally {
      restorePlay();
    }
  });
});

describe("audio paste and drop", () => {
  test("a file uploads, a pdf is skipped, and html audio or source becomes a url audio", async () => {
    const { editor, detach } = openAudio();
    editor.tf.insertData(withFiles([wavSource()]));
    await until(() => field(audioNode(editor), "assetId") === "id-2");
    expect(field(audioNode(editor), "mimeType")).toBe("audio/wav");
    expect(field(audioNode(editor), "name")).toBe("tone.wav");
    expect(typesOf(editor)).toContain("audio");
    expect(typesOf(editor)).not.toContain("img");
    detach();

    const skipped = createEditor([paragraph("", "empty")]);
    skipped.tf.select(caret([0, 0], 0));
    const before = snapshot(skipped.children);
    skipped.tf.insertData(
      withFiles([uploadSource(Uint8Array.from([1, 2, 3]), "notes.pdf", "application/pdf")]),
    );
    expect(skipped.children).toEqual(before);
    expect(pasteRepairsOf(skipped).map((repair) => repair.message)).toEqual([MEDIA_FILE_SKIPPED]);

    const html = createEditor([paragraph("", "empty")]);
    html.tf.select(caret([0, 0], 0));
    const data = new DataTransfer();
    data.setData(
      "text/html",
      '<figure><audio src="https://audio.example/tone.wav"><source src="https://audio.example/other.mp3" type="audio/mpeg"></audio><figcaption>From the page</figcaption></figure>',
    );
    html.tf.insertData(data);
    const pasted = html.children.find((block) => block.type === KEYS.audio);
    expect(field(pasted, "url")).toBe("https://audio.example/tone.wav");
    expect(field(pasted, "caption")).toEqual([{ text: "From the page" }]);

    const sourced = createEditor([paragraph("", "empty")]);
    sourced.tf.select(caret([0, 0], 0));
    const sourceData = new DataTransfer();
    sourceData.setData(
      "text/html",
      '<audio><source src="https://audio.example/only.mp3" type="audio/mpeg"></audio>',
    );
    sourced.tf.insertData(sourceData);
    const fromSource = sourced.children.find((block) => block.type === KEYS.audio);
    expect(field(fromSource, "url")).toBe("https://audio.example/only.mp3");
    expect(field(fromSource, "mimeType")).toBe("audio/mpeg");
  });

  test("an unsafe src is dropped with a paste repair", () => {
    const unsafe = createEditor([paragraph("", "empty")]);
    unsafe.tf.select(caret([0, 0], 0));
    unsafe.tf.insertFragment([audio("bad", { url: "http://audio.example/tone.wav" })]);
    expect(typesOf(unsafe)).not.toContain("audio");
    expect(pasteRepairsOf(unsafe).map((repair) => repair.message)).toContain(AUDIO_UNSAFE_URL);

    const html = createEditor([paragraph("", "empty")]);
    html.tf.select(caret([0, 0], 0));
    const data = new DataTransfer();
    data.setData("text/html", '<audio src="javascript:alert(1)"></audio>');
    html.tf.insertData(data);
    expect(typesOf(html)).not.toContain("audio");
    expect(pasteRepairsOf(html).map((repair) => repair.message)).toContain(AUDIO_UNSAFE_URL);
  });

  test("a copied audio node keeps its asset and gets a new block id", () => {
    const editor = createEditor([
      audio("clip", {
        assetId: "asset-9",
        mimeType: "audio/mpeg",
        name: "song.mp3",
        durationMs: 1500,
      }),
      paragraph("", "empty"),
    ]);
    editor.tf.select(caret([1, 0], 0));
    editor.tf.insertFragment([
      audio("clip", {
        assetId: "asset-9",
        url: "https://audio.example/song.mp3",
        mimeType: "audio/mpeg",
        name: "song.mp3",
        durationMs: 1500,
      }),
    ]);

    const copies = editor.children.filter((block) => block.type === KEYS.audio);
    expect(copies).toHaveLength(2);
    expect(field(copies[0], "id")).toBe("clip");
    expect(field(copies[1], "assetId")).toBe("asset-9");
    expect(field(copies[1], "url")).toBeUndefined();
    expect(field(copies[1], "id")).not.toBe("clip");
    expect(field(copies[1], "name")).toBe("song.mp3");
    expect(field(copies[1], "durationMs")).toBe(1500);
    expect(pasteRepairsOf(editor).map((repair) => repair.message)).toContain(AUDIO_BOTH_SOURCES);
  });

  test("a mixed paste inserts the image and the audio and skips the zip once", () => {
    const editor = createEditor([paragraph("", "empty")]);
    editor.tf.select(caret([0, 0], 0));
    editor.tf.insertData(
      withFiles([
        uploadSource(PNG_BYTES, "photo.png", "image/png"),
        wavSource(),
        uploadSource(Uint8Array.from([0x50, 0x4b, 0x03, 0x04]), "notes.zip", "application/zip"),
      ]),
    );

    expect(typesOf(editor)).toContain("img");
    expect(typesOf(editor)).toContain("audio");
    expect(pasteRepairsOf(editor).map((repair) => repair.message)).toEqual([MEDIA_FILE_SKIPPED]);
  });

  test("an ogg file is audio only when its mime is audio, and video when its mime is video", () => {
    const asAudio = createEditor([paragraph("", "empty")]);
    asAudio.tf.select(caret([0, 0], 0));
    asAudio.tf.insertData(withFiles([uploadSource(OGG_BYTES, "tone.ogg", "audio/ogg")]));
    expect(typesOf(asAudio)).toContain("audio");
    expect(typesOf(asAudio)).not.toContain("video");

    const asVideo = createEditor([paragraph("", "empty")]);
    asVideo.tf.select(caret([0, 0], 0));
    asVideo.tf.insertData(withFiles([uploadSource(OGG_BYTES, "clip.ogg", "video/ogg")]));
    expect(typesOf(asVideo)).toContain("video");
    expect(typesOf(asVideo)).not.toContain("audio");
  });

  test("a drop uses the same audio route", () => {
    const { editor, detach } = openAudio();
    let prevented = false;
    handleImageDrop(editor, {
      clientX: 0,
      clientY: 0,
      preventDefault: () => {
        prevented = true;
      },
      dataTransfer: withFiles([wavSource("dropped.wav")]),
      view: null,
    });
    expect(prevented).toBe(true);
    expect(typesOf(editor)).toContain("audio");
    expect(field(audioNode(editor), "name")).toBeUndefined();
    detach();
  });
});

describe("audio player", () => {
  test("duration text is m:ss until an hour, then h:mm:ss, and the name falls back to the url", () => {
    expect(formatAudioDuration(5000)).toBe("0:05");
    expect(formatAudioDuration(65000)).toBe("1:05");
    expect(formatAudioDuration(3_600_000)).toBe("1:00:00");
    expect(formatAudioDuration(3_661_000)).toBe("1:01:01");
    expect(audioDisplayName(undefined, "https://audio.example/clips/my%20tone.wav")).toBe(
      "my tone.wav",
    );
    expect(audioDisplayName("tone.wav", "https://audio.example/other.mp3")).toBe("tone.wav");
  });

  test("the player has no autoplay and switches preload when it nears the viewport", async () => {
    const restorePlay = stubCanPlay("maybe");
    const observers = installObserver();
    try {
      const html = renderAudio([urlAudio, paragraph("After", "after")]);
      expect(html).toContain("<audio");
      expect(html).toContain('preload="none"');
      expect(html).not.toContain("autoplay");
      expect(html).not.toContain("loop");
      expect(html).toContain("controls");
      expect(html).toContain("tone.wav");
      expect(html).toContain("1:05");
      expect(html.toLowerCase()).toContain('contenteditable="false"');

      const mounted = await mountAudio([urlAudio, paragraph("After", "after")]);
      const player = mounted.host.querySelector("audio");
      if (!isAudio(player)) {
        throw new Error("Missing audio.");
      }
      expect(player.autoplay).toBe(false);
      expect(player.loop).toBe(false);
      expect(player.hasAttribute("autoplay")).toBe(false);
      expect(player.hasAttribute("loop")).toBe(false);
      expect(player.controls).toBe(true);
      expect(player.preload).toBe("none");
      expect(observers.last()?.rootMargin).toBe("100% 0px");

      await act(async () => {
        observers.last()?.callback([{ isIntersecting: true }]);
      });
      expect(mounted.host.querySelector("audio")?.preload).toBe("metadata");
      await mounted.cleanup();
    } finally {
      observers.restore();
      restorePlay();
    }
  });

  test("pointer and keys on the player leave the selection and history alone", async () => {
    const restorePlay = stubCanPlay("maybe");
    try {
      const mounted = await mountAudio([paragraph("Before", "before"), urlAudio]);
      const player = mounted.host.querySelector("audio");
      if (!isAudio(player)) {
        throw new Error("Missing audio.");
      }
      const selection = snapshot(mounted.editor.selection);
      const undos = mounted.editor.history.undos.length;
      player.focus();
      await act(async () => {
        player.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
        player.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
        player.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        player.dispatchEvent(
          new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true }),
        );
        player.dispatchEvent(
          new KeyboardEvent("keydown", { key: "ArrowRight", code: "ArrowRight", bubbles: true }),
        );
        player.dispatchEvent(
          new KeyboardEvent("keydown", { key: "ArrowUp", code: "ArrowUp", bubbles: true }),
        );
      });
      expect(snapshot(mounted.editor.selection)).toEqual(selection);
      expect(mounted.editor.history.undos.length).toBe(undos);
      expect(texts(mounted.editor)).toEqual(["Before", ""]);
      await mounted.cleanup();
    } finally {
      restorePlay();
    }
  });

  test("an unsupported codec shows the fallback card", async () => {
    const unsupported = stubCanPlay("");
    try {
      const mounted = await mountAudio([urlAudio]);
      await act(async () => {
        await settle();
      });
      expect(mounted.host.textContent).toContain(AUDIO_CANT_PLAY);
      const link = mounted.host.querySelector("a");
      expect(link?.textContent).toBe("Open original");
      expect(link?.getAttribute("href")).toBe("https://audio.example/tone.wav");
      expect(mounted.host.querySelector("audio")).toBeNull();
      expect(mounted.host.textContent).toContain("Remove");
      await mounted.cleanup();
    } finally {
      unsupported();
    }
  });

  test("read-only keeps a usable player and hides the toolbar", async () => {
    const restorePlay = stubCanPlay("maybe");
    try {
      const html = renderAudio([urlAudio], true);
      expect(html).toContain("<audio");
      expect(html).toContain("controls");
      expect(html).not.toContain("Align audio");
      expect(html).not.toContain("Replace audio");

      const mounted = await mountAudio([urlAudio], { readOnly: true });
      expect(mounted.host.querySelector("audio")?.controls).toBe(true);
      expect(mounted.host.querySelector("[aria-label='Align audio']")).toBeNull();
      expect(mounted.host.querySelector("[aria-label='Replace audio']")).toBeNull();
      expect(mounted.host.querySelector("[aria-label='Remove']")).toBeNull();
      await mounted.cleanup();
    } finally {
      restorePlay();
    }
  });

  test("a long name and an hour-long duration stay inside the player row", async () => {
    const restorePlay = stubCanPlay("maybe");
    try {
      const mounted = await mountAudio([
        audio("clip", {
          url: "https://audio.example/clips/my%20tone.wav",
          mimeType: "audio/mpeg",
          name: LONG_NAME,
          durationMs: 3_661_000,
        }),
        audio("short", {
          url: "https://audio.example/clips/my%20tone.wav",
          mimeType: "audio/wav",
          durationMs: 5000,
        }),
      ]);
      mounted.host.style.width = "360px";
      expect(mounted.host.textContent).toContain(LONG_NAME);
      expect(mounted.host.textContent).toContain("1:01:01");
      expect(mounted.host.textContent).toContain("my tone.wav");
      expect(mounted.host.textContent).toContain("0:05");
      const name = mounted.host.querySelector("p");
      expect(name?.className).toContain("truncate");
      expect(name?.className).toContain("min-w-0");
      const figure = mounted.host.querySelector("figure");
      if (figure && figure.clientWidth > 0) {
        expect(figure.scrollWidth).toBeLessThanOrEqual(figure.clientWidth);
      }
      await mounted.cleanup();
    } finally {
      restorePlay();
    }
  });

  test("a missing asset shows the not-found card", async () => {
    const memory = createMemoryAssetStore();
    const mounted = await mountAudio([audio("gone", { assetId: "missing-audio" })], {
      store: memory.store,
    });
    await act(async () => {
      await settle();
    });
    expect(mounted.host.textContent).toContain(AUDIO_NOT_FOUND);
    expect(mounted.host.textContent).toContain("Remove");
    await mounted.cleanup();
  });
});

describe("audio keyboard and containers", () => {
  test("backspace selects an audio block and a second backspace deletes it, and enter inserts after it", () => {
    const editor = createEditor([paragraph("Hello", "a"), urlAudio, paragraph("World", "b")]);
    editor.tf.select(caret([2, 0], 0));
    editor.tf.deleteBackward();
    expect(blockIds(editor)).toEqual(["a", "clip", "b"]);
    expect(editor.selection?.anchor.path[0]).toBe(1);
    editor.tf.deleteBackward();
    expect(typesOf(editor)).toEqual(["p", "p"]);
    expect(texts(editor)).toEqual(["Hello", "World"]);

    const entered = createEditor([paragraph("Hello", "a"), urlAudio, paragraph("World", "b")]);
    selectBlock(entered, 1);
    entered.tf.insertBreak();
    expect(typesOf(entered)).toEqual(["p", "audio", "p", "p"]);
    expect(blockIds(entered)[1]).toBe("clip");
    expect(entered.selection?.anchor.path[0]).toBe(2);
  });

  test("caption editing leaves the source untouched", () => {
    const editor = createEditor([paragraph("Hello", "a"), urlAudio, paragraph("World", "b")]);
    editor.tf.select(editor.api.start([1]) ?? caret([1, 0], 0));
    editor.tf.moveLine({ reverse: false });
    expect(editor.getOption(CaptionPlugin, "focusEndPath")).toEqual([1]);
    editor.tf.setNodes({ caption: [{ text: "Renamed" }] }, { at: [1] });
    expect(field(editor.children[1], "caption")).toEqual([{ text: "Renamed" }]);
    expect(field(editor.children[1], "url")).toBe("https://audio.example/tone.wav");
    expect(field(editor.children[1], "currentTime")).toBeUndefined();
  });

  test("audio stays inside a toggle, splits a quote and a callout, and lifts out of a table cell", () => {
    const kept = createEditor([
      toggle("toggle-1", [
        paragraph("Label", "label"),
        audio("clip", { url: "https://audio.example/a.wav" }),
      ]),
    ]);
    kept.tf.normalize({ force: true });
    expect(typesOf(kept)).toEqual(["toggle"]);
    expect(childTypes(kept.children[0])).toEqual(["p", "audio"]);
    expect(childIds(kept.children[0])).toEqual(["label", "clip"]);

    const split = createEditor([
      quote("quote-1", [
        paragraph("Before", "before"),
        audio("clip", { url: "https://audio.example/a.wav", mimeType: "audio/wav" }),
        paragraph("After", "after"),
      ]),
      callout("callout-1", [
        paragraph("Note", "note"),
        audio("icon", { assetId: "asset-1" }),
        paragraph("Tail", "tail"),
      ]),
    ]);
    split.tf.normalize({ force: true });
    expect(typesOf(split)).toEqual([
      "blockquote",
      "audio",
      "blockquote",
      "callout",
      "audio",
      "callout",
    ]);
    expect(field(split.children[1], "id")).toBe("clip");
    expect(field(split.children[1], "mimeType")).toBe("audio/wav");
    expect(field(split.children[4], "assetId")).toBe("asset-1");

    const lifted = createEditor([
      tableNode("table-1", [
        row("row-1", [
          cell("td", "cell-1", [
            paragraph("Stay", "stay"),
            audio("clip", { url: "https://audio.example/a.wav" }),
          ]),
        ]),
      ]),
      paragraph("After", "after"),
    ]);
    lifted.tf.normalize({ force: true });
    expect(typesOf(lifted)).toEqual(["table", "audio", "p"]);
    expect(field(lifted.children[1], "id")).toBe("clip");
    expect(field(lifted.children[1], "url")).toBe("https://audio.example/a.wav");
    const table = lifted.children[0];
    const body = isRecord(table) && Array.isArray(table.children) ? table.children[0] : undefined;
    const liftedCell =
      isRecord(body) && Array.isArray(body.children) ? body.children[0] : undefined;
    expect(childTypes(liftedCell)).toEqual(["p"]);
    expect(childIds(liftedCell)).toEqual(["stay"]);
  });
});
