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
import {
  IMAGE_MIN_WIDTH,
  VIDEO_MAX_WIDTH,
  VIDEO_MIN_WIDTH,
  allowedChildTypes,
  isVoidElementType,
} from "./editor-document-schema";
import { parseEditorDocument, type ParseResult } from "./editor-document-validate";
import { ASSET_LIMITS, type AssetStore, type UploadSource } from "./editor-assets";
import { imageMedia } from "./editor-image";
import { EditorSurface } from "./editor-surface";
import { createEditorPlugins } from "./editor-plugins";
import { pasteRepairsOf } from "./editor-paste";
import {
  VIDEO_BOTH_SOURCES,
  VIDEO_CANT_PLAY,
  VIDEO_EMBED_REJECTED,
  VIDEO_NOT_FOUND,
  VIDEO_POSTER_BOTH,
  VIDEO_POSTER_UNSAFE,
  VIDEO_UNSAFE_URL,
  attachVideoRuntime,
  holdVideoUpload,
  insertVideoFromFiles,
  insertVideoFromUrl,
  probeVideoMetadata,
  removeVideo,
  removeVideoPoster,
  replaceVideoFromFile,
  retryVideoUpload,
  setVideoAlign,
  setVideoPoster,
  setVideoWidth,
  videoMedia,
  videoUploadState,
} from "./editor-video";
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

const WEBM_BYTES = Uint8Array.from([
  0x1a, 0x45, 0xdf, 0xa3, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
]);

const PNG_BYTES = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
]);

function paragraph(text: string, id: string): TElement {
  return { type: "p", id, children: [{ text }] };
}

function video(id: string, extra: Record<string, unknown> = {}): TElement {
  const node: TElement = { type: "video", id, children: [{ text: "" }] };
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
  return parseEditorDocument(createEditorDocument("doc-video", content));
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

function webmSource(size = WEBM_BYTES.byteLength): UploadSource {
  return uploadSource(WEBM_BYTES, "clip.webm", "video/webm", size);
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

  throw new Error("The video upload did not settle.");
}

function openVideo(value: EditorValue = [paragraph("", "empty")]) {
  let step = 0;
  const memory = createMemoryAssetStore();
  const editor = createEditor(value);
  editor.tf.select(caret([0, 0], 0));
  const detach = attachVideoRuntime(editor, memory.store, {
    probe: async (_blob, kind) => {
      if (kind === "image") {
        return { width: 48, height: 24 };
      }
      return { width: 320, height: 180, durationMs: 1500 };
    },
    createId: () => {
      step += 1;
      return `id-${String(step)}`;
    },
    now: () => "2026-10-08T00:00:00.000Z",
  });

  return { editor, memory, detach };
}

function isVideo(node: Element | null): node is HTMLVideoElement {
  const sample = document.createElement("video");
  return node instanceof sample.constructor;
}

function videoNode(editor: SlateEditor): TElement | undefined {
  return editor.children.find((block) => block.type === KEYS.video);
}

function isVideoPrototype(value: object): value is { canPlayType: (type: string) => string } {
  return "canPlayType" in value && typeof value.canPlayType === "function";
}

function videoPrototype(): { canPlayType: (type: string) => string } {
  const sample = document.createElement("video");
  const proto: unknown = Object.getPrototypeOf(sample);
  if (typeof proto !== "object" || proto === null || !isVideoPrototype(proto)) {
    throw new Error("Missing video prototype.");
  }

  return proto;
}

function stubCanPlay(value: string): () => void {
  const proto = videoPrototype();
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

function renderVideo(value: EditorValue, readOnly = false): string {
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

async function mountVideo(
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

const urlVideo = video("clip", {
  url: "https://videos.example/clip.webm",
  mimeType: "video/webm",
  naturalWidth: 640,
  naturalHeight: 360,
  durationMs: 2000,
  caption: [{ text: "A short clip." }],
});

describe("shared media descriptors", () => {
  test("image and video keep separate kinds, limits, and node types", () => {
    expect(imageMedia.spec.nodeType).toBe(KEYS.img);
    expect(imageMedia.spec.assetKind).toBe("image");
    expect(imageMedia.minWidth).toBe(IMAGE_MIN_WIDTH);
    expect(videoMedia.spec.nodeType).toBe(KEYS.video);
    expect(videoMedia.spec.assetKind).toBe("video");
    expect(videoMedia.minWidth).toBe(VIDEO_MIN_WIDTH);
    expect(videoMedia.spec.mimePrefix).toBe("video/");
    expect(imageMedia.spec.mimePrefix).toBe("image/");
  });
});

describe("video schema", () => {
  test("an asset video and a url video round-trip with poster, duration, and size", () => {
    expect(isVoidElementType(KEYS.video)).toBe(true);
    expect(allowedChildTypes("toggle")).toContain(KEYS.video);
    expect(allowedChildTypes("blockquote")).toEqual(["p"]);

    const asset = video("asset-video", {
      assetId: "asset-1",
      mimeType: "video/mp4",
      naturalWidth: 320,
      naturalHeight: 180,
      durationMs: 1500,
      width: 320,
      align: "left",
      posterAssetId: "poster-1",
      caption: [{ text: "Stored" }],
    });
    const remote = video("url-video", {
      url: "https://videos.example/clip.webm",
      mimeType: "video/webm",
      naturalWidth: 640,
      naturalHeight: 360,
      durationMs: 2000,
      align: "right",
      posterUrl: "https://videos.example/poster.png",
      caption: [{ text: "Remote" }],
    });
    const content = [asset, remote];
    const parsed = expectOk(documentOf(content));

    expect(parsed.repairs).toEqual([]);
    expect(parsed.document.content).toBe(content);
    expect(collectAssetIds(content).has("poster-1")).toBe(true);
    expect(collectAssetIds(content).has("asset-1")).toBe(true);
  });

  test("a sourceless video is ok", () => {
    const content = [video("pending")];
    const parsed = expectOk(documentOf(content));
    expect(parsed.document.content).toBe(content);
  });

  test("playback state, a bad mime, an unsafe url, both sources, and a width out of range are rejected", () => {
    const currentTime = expectUnsupported(documentOf([video("clip", { currentTime: 3 })]));
    const paused = expectUnsupported(documentOf([video("clip", { paused: true })]));
    const muted = expectUnsupported(documentOf([video("clip", { muted: true })]));
    const volume = expectUnsupported(documentOf([video("clip", { volume: 0.2 })]));
    const mime = expectUnsupported(documentOf([video("clip", { mimeType: "video/avi" })]));
    const unsafe = expectUnsupported(
      documentOf([video("clip", { url: "http://videos.example/clip.webm" })]),
    );
    const blob = expectUnsupported(
      documentOf([video("clip", { url: "blob:https://videos.example/1" })]),
    );
    const poster = expectUnsupported(
      documentOf([
        video("clip", {
          url: "https://videos.example/clip.webm",
          posterUrl: "javascript:alert(1)",
        }),
      ]),
    );
    const both = expectUnsupported(
      documentOf([video("clip", { assetId: "asset-1", url: "https://videos.example/clip.webm" })]),
    );
    const bothPosters = expectUnsupported(
      documentOf([
        video("clip", {
          url: "https://videos.example/clip.webm",
          posterAssetId: "poster-1",
          posterUrl: "https://videos.example/poster.png",
        }),
      ]),
    );
    const width = expectUnsupported(documentOf([video("clip", { width: VIDEO_MIN_WIDTH - 1 })]));
    const wide = expectUnsupported(documentOf([video("clip", { width: VIDEO_MAX_WIDTH + 1 })]));

    expect(messages(currentTime)).toContain("currentTime");
    expect(messages(paused)).toContain("paused");
    expect(messages(muted)).toContain("muted");
    expect(messages(volume)).toContain("volume");
    expect(messages(mime)).toContain("mimeType");
    expect(messages(unsafe)).toContain("unsupported url");
    expect(messages(blob)).toContain("blob:");
    expect(messages(poster)).toContain("poster");
    expect(messages(both)).toContain("both assetId and url");
    expect(messages(bothPosters)).toContain("both posterAssetId and posterUrl");
    expect(messages(width)).toContain("width");
    expect(messages(wide)).toContain("width");
    expect(currentTime.raw).toBeDefined();
  });
});

describe("video commands", () => {
  test("insert from files and from a url, and one undo removes each insert", async () => {
    const uploaded = openVideo();
    const beforeFiles = snapshot(uploaded.editor.children);

    expect(insertVideoFromFiles.id).toBe("block.insert.video");
    expect(insertVideoFromFiles.label).toBe("Video");
    expect(runEditorCommand(uploaded.editor, insertVideoFromFiles, [webmSource()])).toBe(true);
    await until(() => field(videoNode(uploaded.editor), "assetId") === "id-2");

    expect(field(videoNode(uploaded.editor), "mimeType")).toBe("video/webm");
    expect(field(videoNode(uploaded.editor), "naturalWidth")).toBe(320);
    expect(field(videoNode(uploaded.editor), "naturalHeight")).toBe(180);
    expect(field(videoNode(uploaded.editor), "durationMs")).toBe(1500);
    expect(field(videoNode(uploaded.editor), "url")).toBeUndefined();
    expect(uploaded.editor.history.undos.length).toBe(1);
    uploaded.editor.tf.undo();
    expect(uploaded.editor.children).toEqual(beforeFiles);
    uploaded.detach();

    const linked = openVideo();
    const beforeUrl = snapshot(linked.editor.children);
    expect(insertVideoFromUrl.id).toBe("block.insert.video-url");
    expect(insertVideoFromUrl.label).toBe("Video from URL");
    expect(
      runEditorCommand(linked.editor, insertVideoFromUrl, "https://videos.example/clip.webm"),
    ).toBe(true);
    expect(field(videoNode(linked.editor), "url")).toBe("https://videos.example/clip.webm");
    linked.editor.tf.undo();
    expect(linked.editor.children).toEqual(beforeUrl);

    const invalid = snapshot(linked.editor.children);
    runEditorCommand(linked.editor, insertVideoFromUrl, "http://videos.example/clip.webm");
    expect(linked.editor.children).toEqual(invalid);
    linked.detach();
  });

  test("a provider url inserts an embed and a bad provider id stays put", () => {
    const { editor, detach } = openVideo();
    const before = snapshot(editor.children);
    runEditorCommand(editor, insertVideoFromUrl, "https://www.youtube.com/watch?v=abc");
    runEditorCommand(editor, insertVideoFromUrl, "https://youtu.be/abc");

    expect(editor.children).toEqual(before);
    expect(pasteRepairsOf(editor).map((repair) => repair.message)).toContain(VIDEO_EMBED_REJECTED);
    expect(editor.history.undos.length).toBe(0);

    runEditorCommand(editor, insertVideoFromUrl, "https://vimeo.com/123");
    expect(editor.children.some((block) => block.type === KEYS.mediaEmbed)).toBe(true);
    expect(
      field(
        editor.children.find((block) => block.type === KEYS.mediaEmbed),
        "videoId",
      ),
    ).toBe("123");
    expect(editor.history.undos.length).toBe(1);
    editor.tf.undo();
    expect(editor.children).toEqual(before);

    runEditorCommand(editor, insertVideoFromUrl, "https://player.vimeo.com/video/123");
    expect(
      field(
        editor.children.find((block) => block.type === KEYS.mediaEmbed),
        "provider",
      ),
    ).toBe("vimeo");
    expect(editor.history.undos.length).toBe(1);
    editor.tf.undo();
    expect(editor.children).toEqual(before);
    detach();
  });

  test("replace keeps the block id and one undo restores the url", async () => {
    const { editor, detach } = openVideo();
    runEditorCommand(editor, insertVideoFromUrl, "https://videos.example/clip.webm");
    const id = field(videoNode(editor), "id");
    runEditorCommand(editor, replaceVideoFromFile, { id: String(id), file: webmSource() });
    await until(() => field(videoNode(editor), "assetId") === "id-2");

    expect(field(videoNode(editor), "id")).toBe(id);
    expect(field(videoNode(editor), "url")).toBeUndefined();
    expect(field(videoNode(editor), "mimeType")).toBe("video/webm");
    editor.tf.undo();
    expect(field(videoNode(editor), "id")).toBe(id);
    expect(field(videoNode(editor), "url")).toBe("https://videos.example/clip.webm");
    expect(field(videoNode(editor), "assetId")).toBeUndefined();
    detach();
  });

  test("align, width, caption, and poster each undo in one step", async () => {
    const editor = createEditor([urlVideo]);
    const id = "clip";

    runEditorCommand(editor, setVideoAlign, { id, align: "left" });
    expect(field(editor.children[0], "align")).toBe("left");
    editor.tf.undo();
    expect(field(editor.children[0], "align")).toBeUndefined();

    runEditorCommand(editor, setVideoWidth, { id, width: 200 });
    expect(field(editor.children[0], "width")).toBe(200);
    editor.tf.undo();
    expect(field(editor.children[0], "width")).toBeUndefined();

    runEditorCommand(editor, setVideoWidth, { id, width: 20 });
    expect(field(editor.children[0], "width")).toBe(VIDEO_MIN_WIDTH);
    runEditorCommand(editor, setVideoWidth, { id, width: 9000 });
    expect(field(editor.children[0], "width")).toBe(VIDEO_MAX_WIDTH);

    editor.tf.setNodes({ caption: [{ text: "A new caption" }] }, { at: [0] });
    expect(field(editor.children[0], "caption")).toEqual([{ text: "A new caption" }]);
    expect(field(editor.children[0], "url")).toBe("https://videos.example/clip.webm");
    editor.tf.undo();
    expect(field(editor.children[0], "caption")).toEqual([{ text: "A short clip." }]);

    const posted = openVideo([urlVideo]);
    const beforePoster = posted.editor.history.undos.length;
    runEditorCommand(posted.editor, setVideoPoster, {
      id,
      file: uploadSource(PNG_BYTES, "poster.png", "image/png"),
    });
    await until(() => field(posted.editor.children[0], "posterAssetId") === "id-2");
    expect(field(posted.editor.children[0], "posterUrl")).toBeUndefined();
    expect(field(posted.editor.children[0], "url")).toBe("https://videos.example/clip.webm");
    expect(posted.editor.history.undos.length).toBe(beforePoster + 1);
    posted.editor.tf.undo();
    expect(field(posted.editor.children[0], "posterAssetId")).toBeUndefined();

    runEditorCommand(posted.editor, setVideoPoster, {
      id,
      file: uploadSource(PNG_BYTES, "poster.png", "image/png"),
    });
    await until(() => typeof field(posted.editor.children[0], "posterAssetId") === "string");
    runEditorCommand(posted.editor, removeVideoPoster, id);
    expect(field(posted.editor.children[0], "posterAssetId")).toBeUndefined();
    posted.editor.tf.undo();
    expect(typeof field(posted.editor.children[0], "posterAssetId")).toBe("string");
    posted.detach();
  });

  test("read-only refuses video commands", () => {
    const editor = createEditor([paragraph("", "empty")]);
    editor.tf.select(caret([0, 0], 0));
    const before = snapshot(editor.children);
    expect(
      runEditorCommand(editor, insertVideoFromUrl, "https://videos.example/a.webm", {
        readOnly: true,
      }),
    ).toBe(false);
    expect(runEditorCommand(editor, insertVideoFromFiles, [webmSource()], { readOnly: true })).toBe(
      false,
    );
    expect(editor.children).toEqual(before);

    editor.dom.readOnly = true;
    runEditorCommand(editor, insertVideoFromUrl, "https://videos.example/a.webm");
    runEditorCommand(editor, setVideoAlign, { id: "clip", align: "left" });
    runEditorCommand(editor, setVideoWidth, { id: "clip", width: 200 });
    expect(editor.children).toEqual(before);
  });

  test("turn into and clear formatting leave a selected video as a video", () => {
    const editor = createEditor([paragraph("Alpha", "a"), urlVideo, paragraph("Beta", "b")]);
    selectBlock(editor, 1);
    const before = snapshot(editor.children[1]);
    runEditorCommand(editor, turnIntoHeading1, undefined);
    runEditorCommand(editor, turnIntoBlockquote, undefined);
    runEditorCommand(editor, setTextAlign, "center");
    runEditorCommand(editor, setLineHeight, 2);
    runEditorCommand(editor, clearFormatting, undefined);
    expect(editor.children[1]).toEqual(before);
    expect(getBlockType(editor)).toBe("video");
  });
});

describe("video upload", () => {
  test("oversize, the wrong bytes, and a corrupt sniff fail with no asset id", async () => {
    const oversize = openVideo();
    runEditorCommand(oversize.editor, insertVideoFromFiles, [webmSource(ASSET_LIMITS.video + 1)]);
    const oversizeId = String(field(videoNode(oversize.editor), "id"));
    await until(() => videoUploadState(oversize.editor, oversizeId)?.status === "failed");
    expect(videoUploadState(oversize.editor, oversizeId)?.error).toContain("limit");
    expect(field(videoNode(oversize.editor), "assetId")).toBeUndefined();
    oversize.detach();

    const wrong = openVideo();
    runEditorCommand(wrong.editor, insertVideoFromFiles, [
      uploadSource(PNG_BYTES, "clip.mp4", "video/mp4"),
    ]);
    const wrongId = String(field(videoNode(wrong.editor), "id"));
    await until(() => videoUploadState(wrong.editor, wrongId)?.status === "failed");
    expect(videoUploadState(wrong.editor, wrongId)?.error).toContain("not an MP4");
    expect(field(videoNode(wrong.editor), "assetId")).toBeUndefined();
    wrong.detach();

    const corrupt = openVideo();
    runEditorCommand(corrupt.editor, insertVideoFromFiles, [
      uploadSource(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]), "bad.webm", "video/webm"),
    ]);
    const corruptId = String(field(videoNode(corrupt.editor), "id"));
    await until(() => videoUploadState(corrupt.editor, corruptId)?.status === "failed");
    expect(videoUploadState(corrupt.editor, corruptId)?.error).toContain("not an MP4");
    expect(await corrupt.memory.store.list()).toEqual([]);
    corrupt.detach();
  });

  test("cancel keeps the file for retry, and deleting during upload writes nothing", async () => {
    const canceled = openVideo();
    canceled.memory.hold();
    runEditorCommand(canceled.editor, insertVideoFromFiles, [webmSource()]);
    const id = String(field(videoNode(canceled.editor), "id"));
    await until(
      () =>
        canceled.memory.puts() === 1 || videoUploadState(canceled.editor, id)?.status === "failed",
    );
    if (canceled.memory.puts() !== 1) {
      throw new Error(
        `upload ${JSON.stringify(videoUploadState(canceled.editor, id))} puts ${String(canceled.memory.puts())}`,
      );
    }
    holdVideoUpload(canceled.editor, id);
    canceled.memory.release();
    await settle();

    expect(videoUploadState(canceled.editor, id)?.status).toBe("failed");
    expect(videoUploadState(canceled.editor, id)?.error).toBe("Upload canceled.");
    expect(field(videoNode(canceled.editor), "assetId")).toBeUndefined();
    expect(typesOf(canceled.editor)).toContain("video");

    retryVideoUpload(canceled.editor, id);
    await until(() => field(videoNode(canceled.editor), "assetId") === "id-3");
    expect(field(videoNode(canceled.editor), "mimeType")).toBe("video/webm");
    canceled.detach();

    const removed = openVideo([paragraph("Keep", "keep")]);
    removed.editor.tf.select(caret([0, 0], 4));
    removed.memory.hold();
    runEditorCommand(removed.editor, insertVideoFromFiles, [webmSource()]);
    await until(() => removed.memory.puts() === 1);
    const removedId = String(field(videoNode(removed.editor), "id"));
    const videoPath = removed.editor.children.findIndex((block) => block.type === KEYS.video);
    removed.editor.tf.removeNodes({ at: [videoPath], voids: true });
    removed.memory.release();
    await settle();

    expect(typesOf(removed.editor)).not.toContain("video");
    expect(await removed.memory.store.list()).toEqual([]);
    expect(JSON.stringify(removed.editor.children)).not.toContain(removedId);
    removed.detach();
  });

  test("the headless metadata probe returns undefined", async () => {
    const probed = await probeVideoMetadata(byteBlob(WEBM_BYTES, "video/webm"));
    expect(probed).toBeUndefined();
  });
});

describe("video paste and drop", () => {
  test("a video file uploads, a pdf becomes a file block, and html video or source becomes a url video", async () => {
    const { editor, detach } = openVideo();
    editor.tf.insertData(withFiles([webmSource()]));
    await until(() => field(videoNode(editor), "assetId") === "id-2");
    expect(field(videoNode(editor), "mimeType")).toBe("video/webm");
    expect(typesOf(editor)).toContain("video");
    expect(typesOf(editor)).not.toContain("img");
    detach();

    const skipped = createEditor([paragraph("", "empty")]);
    skipped.tf.select(caret([0, 0], 0));
    skipped.tf.insertData(
      withFiles([uploadSource(Uint8Array.from([1, 2, 3]), "notes.pdf", "application/pdf")]),
    );
    expect(typesOf(skipped)).toContain("file");
    expect(pasteRepairsOf(skipped)).toEqual([]);

    const html = createEditor([paragraph("", "empty")]);
    html.tf.select(caret([0, 0], 0));
    const data = new DataTransfer();
    data.setData(
      "text/html",
      '<figure><video src="https://videos.example/clip.webm"><source src="https://videos.example/other.mp4" type="video/mp4"></video><figcaption>From the page</figcaption></figure>',
    );
    html.tf.insertData(data);
    const pasted = html.children.find((block) => block.type === KEYS.video);
    expect(field(pasted, "url")).toBe("https://videos.example/clip.webm");
    expect(field(pasted, "caption")).toEqual([{ text: "From the page" }]);

    const sourced = createEditor([paragraph("", "empty")]);
    sourced.tf.select(caret([0, 0], 0));
    const sourceData = new DataTransfer();
    sourceData.setData(
      "text/html",
      '<video><source src="https://videos.example/only.webm" type="video/webm"></video>',
    );
    sourced.tf.insertData(sourceData);
    const fromSource = sourced.children.find((block) => block.type === KEYS.video);
    expect(field(fromSource, "url")).toBe("https://videos.example/only.webm");
    expect(field(fromSource, "mimeType")).toBe("video/webm");
  });

  test("an unsafe src and a youtube src are dropped with a paste repair", () => {
    const unsafe = createEditor([paragraph("", "empty")]);
    unsafe.tf.select(caret([0, 0], 0));
    unsafe.tf.insertFragment([video("bad", { url: "http://videos.example/clip.webm" })]);
    expect(typesOf(unsafe)).not.toContain("video");
    expect(pasteRepairsOf(unsafe).map((repair) => repair.message)).toContain(VIDEO_UNSAFE_URL);

    const embed = createEditor([paragraph("", "empty")]);
    embed.tf.select(caret([0, 0], 0));
    embed.tf.insertFragment([video("embed", { url: "https://www.youtube.com/watch?v=abc" })]);
    expect(typesOf(embed)).not.toContain("video");
    expect(pasteRepairsOf(embed).map((repair) => repair.message)).toContain(VIDEO_EMBED_REJECTED);
  });

  test("a fragment keeps an asset id and one poster source", () => {
    const editor = createEditor([paragraph("", "empty")]);
    editor.tf.select(caret([0, 0], 0));
    editor.tf.insertFragment([
      video("frag", {
        assetId: "asset-9",
        url: "https://videos.example/clip.webm",
        mimeType: "video/webm",
        posterAssetId: "poster-9",
        posterUrl: "https://videos.example/poster.png",
        naturalWidth: 320,
        naturalHeight: 180,
        durationMs: 1500,
      }),
    ]);

    const pasted = editor.children.find((block) => block.type === KEYS.video);
    expect(field(pasted, "assetId")).toBe("asset-9");
    expect(field(pasted, "url")).toBeUndefined();
    expect(field(pasted, "posterAssetId")).toBe("poster-9");
    expect(field(pasted, "posterUrl")).toBeUndefined();
    expect(field(pasted, "durationMs")).toBe(1500);
    const repairs = pasteRepairsOf(editor).map((repair) => repair.message);
    expect(repairs).toContain(VIDEO_BOTH_SOURCES);
    expect(repairs).toContain(VIDEO_POSTER_BOTH);

    const poster = createEditor([paragraph("", "empty")]);
    poster.tf.select(caret([0, 0], 0));
    poster.tf.insertFragment([
      video("poster", {
        url: "https://videos.example/clip.webm",
        posterUrl: "http://videos.example/poster.png",
      }),
    ]);
    const kept = poster.children.find((block) => block.type === KEYS.video);
    expect(field(kept, "url")).toBe("https://videos.example/clip.webm");
    expect(field(kept, "posterUrl")).toBeUndefined();
    expect(pasteRepairsOf(poster).map((repair) => repair.message)).toContain(VIDEO_POSTER_UNSAFE);
  });
});

describe("video player", () => {
  test("the player has no autoplay and switches preload when it nears the viewport", async () => {
    const restorePlay = stubCanPlay("maybe");
    const observers = installObserver();
    try {
      const html = renderVideo([urlVideo, paragraph("After", "after")]);
      expect(html).toContain("<video");
      expect(html).toContain("playsInline");
      expect(html).toContain('preload="none"');
      expect(html).not.toContain("autoplay");
      expect(html).not.toContain("loop");
      expect(html).toContain("aspect-ratio:640 / 360");
      expect(html).toContain("controls");

      const mounted = await mountVideo([urlVideo, paragraph("After", "after")]);
      const player = mounted.host.querySelector("video");
      if (!isVideo(player)) {
        throw new Error("Missing video.");
      }
      expect(player.autoplay).toBe(false);
      expect(player.loop).toBe(false);
      expect(player.hasAttribute("autoplay")).toBe(false);
      expect(player.hasAttribute("loop")).toBe(false);
      expect(
        player.playsInline === true ||
          player.hasAttribute("playsinline") ||
          player.hasAttribute("playsInline"),
      ).toBe(true);
      expect(player.controls).toBe(true);
      expect(player.preload).toBe("none");
      expect(observers.last()?.rootMargin).toBe("100% 0px");

      await act(async () => {
        observers.last()?.callback([{ isIntersecting: true }]);
      });
      expect(mounted.host.querySelector("video")?.preload).toBe("metadata");
      await mounted.cleanup();
    } finally {
      observers.restore();
      restorePlay();
    }
  });

  test("pointer and keys on the video leave the selection and history alone", async () => {
    const restorePlay = stubCanPlay("maybe");
    try {
      const mounted = await mountVideo([paragraph("Before", "before"), urlVideo]);
      const player = mounted.host.querySelector("video");
      if (!isVideo(player)) {
        throw new Error("Missing video.");
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

  test("an unsupported codec shows the fallback, and a failed poster keeps playback", async () => {
    const unsupported = stubCanPlay("");
    try {
      const mounted = await mountVideo([urlVideo]);
      await act(async () => {
        await settle();
      });
      expect(mounted.host.textContent).toContain(VIDEO_CANT_PLAY);
      const link = mounted.host.querySelector("a");
      expect(link?.textContent).toBe("Open original");
      expect(link?.getAttribute("href")).toBe("https://videos.example/clip.webm");
      expect(mounted.host.querySelector("video")).toBeNull();
      await mounted.cleanup();
    } finally {
      unsupported();
    }

    const playable = stubCanPlay("maybe");
    try {
      const mounted = await mountVideo([
        video("clip", {
          url: "https://videos.example/clip.webm",
          mimeType: "video/webm",
          naturalWidth: 320,
          naturalHeight: 180,
          posterUrl: "https://videos.example/poster.png",
        }),
      ]);
      const poster = mounted.host.querySelector("[data-video-poster]");
      await act(async () => {
        poster?.dispatchEvent(new Event("error"));
      });
      const player = mounted.host.querySelector("video");
      expect(player).not.toBeNull();
      expect(player?.getAttribute("poster")).toBeNull();
      expect(mounted.host.textContent).not.toContain(VIDEO_CANT_PLAY);
      await mounted.cleanup();
    } finally {
      playable();
    }
  });

  test("read-only keeps a usable player and hides the toolbar", async () => {
    const restorePlay = stubCanPlay("maybe");
    try {
      const html = renderVideo([urlVideo], true);
      expect(html).toContain("<video");
      expect(html).toContain("controls");
      expect(html).not.toContain("Align video");
      expect(html).not.toContain("Replace video");
      expect(html).not.toContain('role="separator"');

      const mounted = await mountVideo([urlVideo], { readOnly: true });
      expect(mounted.host.querySelector("video")?.controls).toBe(true);
      expect(mounted.host.querySelector("[aria-label='Align video']")).toBeNull();
      expect(mounted.host.querySelector("[aria-label='Replace video']")).toBeNull();
      expect(mounted.host.querySelector("[role='separator']")).toBeNull();
      await mounted.cleanup();
    } finally {
      restorePlay();
    }
  });

  test("an adapter video refreshes its url once, then shows the fallback", async () => {
    const restorePlay = stubCanPlay("maybe");
    const memory = createMemoryAssetStore();
    const urls = ["https://cdn.example/one.webm", "https://cdn.example/two.webm"];
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
      const mounted = await mountVideo(
        [video("clip", { assetId: "asset-1", mimeType: "video/webm" })],
        { store },
      );
      await act(async () => {
        await settle();
      });
      const first = mounted.host.querySelector("video");
      expect(first?.getAttribute("src")).toBe("https://cdn.example/one.webm");
      await act(async () => {
        first?.dispatchEvent(new Event("error"));
        await settle();
      });
      const second = mounted.host.querySelector("video");
      expect(second?.getAttribute("src")).toBe("https://cdn.example/two.webm");
      expect(mounted.host.textContent).not.toContain(VIDEO_CANT_PLAY);
      await act(async () => {
        second?.dispatchEvent(new Event("error"));
        await settle();
      });
      expect(mounted.host.textContent).toContain(VIDEO_CANT_PLAY);
      expect(calls).toBe(2);
      await mounted.cleanup();
    } finally {
      restorePlay();
    }
  });

  test("a missing asset shows the not-found card", async () => {
    const memory = createMemoryAssetStore();
    const mounted = await mountVideo([video("gone", { assetId: "missing-video" })], {
      store: memory.store,
    });
    await act(async () => {
      await settle();
    });
    expect(mounted.host.textContent).toContain(VIDEO_NOT_FOUND);
    expect(mounted.host.textContent).toContain("Remove");
    await mounted.cleanup();
  });
});

describe("video keyboard and containers", () => {
  test("backspace selects a video and a second backspace deletes it, and enter inserts after it", () => {
    const editor = createEditor([paragraph("Hello", "a"), urlVideo, paragraph("World", "b")]);
    editor.tf.select(caret([2, 0], 0));
    editor.tf.deleteBackward();
    expect(blockIds(editor)).toEqual(["a", "clip", "b"]);
    expect(editor.selection?.anchor.path[0]).toBe(1);
    editor.tf.deleteBackward();
    expect(typesOf(editor)).toEqual(["p", "p"]);
    expect(texts(editor)).toEqual(["Hello", "World"]);

    const entered = createEditor([paragraph("Hello", "a"), urlVideo, paragraph("World", "b")]);
    selectBlock(entered, 1);
    entered.tf.insertBreak();
    expect(typesOf(entered)).toEqual(["p", "video", "p", "p"]);
    expect(blockIds(entered)[1]).toBe("clip");
    expect(entered.selection?.anchor.path[0]).toBe(2);
  });

  test("caption editing leaves the source untouched", async () => {
    const editor = createEditor([paragraph("Hello", "a"), urlVideo, paragraph("World", "b")]);
    editor.tf.select(editor.api.start([1]) ?? caret([1, 0], 0));
    editor.tf.moveLine({ reverse: false });
    expect(editor.getOption(CaptionPlugin, "focusEndPath")).toEqual([1]);
    editor.tf.setNodes({ caption: [{ text: "Renamed" }] }, { at: [1] });
    expect(field(editor.children[1], "caption")).toEqual([{ text: "Renamed" }]);
    expect(field(editor.children[1], "url")).toBe("https://videos.example/clip.webm");
    expect(field(editor.children[1], "currentTime")).toBeUndefined();
  });

  test("a video stays inside a toggle, splits a quote and a callout, and lifts out of a table cell", () => {
    const kept = createEditor([
      toggle("toggle-1", [
        paragraph("Label", "label"),
        video("clip", { url: "https://videos.example/a.webm" }),
      ]),
    ]);
    kept.tf.normalize({ force: true });
    expect(typesOf(kept)).toEqual(["toggle"]);
    expect(childTypes(kept.children[0])).toEqual(["p", "video"]);
    expect(childIds(kept.children[0])).toEqual(["label", "clip"]);

    const split = createEditor([
      quote("quote-1", [
        paragraph("Before", "before"),
        video("clip", { url: "https://videos.example/a.webm", mimeType: "video/webm" }),
        paragraph("After", "after"),
      ]),
      callout("callout-1", [
        paragraph("Note", "note"),
        video("icon", { assetId: "asset-1" }),
        paragraph("Tail", "tail"),
      ]),
    ]);
    split.tf.normalize({ force: true });
    expect(typesOf(split)).toEqual([
      "blockquote",
      "video",
      "blockquote",
      "callout",
      "video",
      "callout",
    ]);
    expect(field(split.children[1], "id")).toBe("clip");
    expect(field(split.children[1], "mimeType")).toBe("video/webm");
    expect(field(split.children[4], "assetId")).toBe("asset-1");

    const lifted = createEditor([
      tableNode("table-1", [
        row("row-1", [
          cell("td", "cell-1", [
            paragraph("Stay", "stay"),
            video("clip", { url: "https://videos.example/a.webm" }),
          ]),
        ]),
      ]),
      paragraph("After", "after"),
    ]);
    lifted.tf.normalize({ force: true });
    expect(typesOf(lifted)).toEqual(["table", "video", "p"]);
    expect(field(lifted.children[1], "id")).toBe("clip");
    expect(field(lifted.children[1], "url")).toBe("https://videos.example/a.webm");
    const table = lifted.children[0];
    const body = isRecord(table) && Array.isArray(table.children) ? table.children[0] : undefined;
    const liftedCell =
      isRecord(body) && Array.isArray(body.children) ? body.children[0] : undefined;
    expect(childTypes(liftedCell)).toEqual(["p"]);
    expect(childIds(liftedCell)).toEqual(["stay"]);
  });

  test("remove deletes the video", () => {
    const editor = createEditor([urlVideo, paragraph("After", "after")]);
    runEditorCommand(editor, removeVideo, "clip");
    expect(typesOf(editor)).toEqual(["p"]);
    expect(texts(editor)).toEqual(["After"]);
  });
});
