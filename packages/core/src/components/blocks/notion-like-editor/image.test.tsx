import { describe, expect, test } from "bun:test";
import { CaptionPlugin } from "@platejs/caption/react";
import { KEYS, type SlateEditor, type TElement } from "platejs";
import { createPlateEditor } from "platejs/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";

import { applyUploadToBlock, cleanupUnreferencedAssets } from "./asset-references";
import {
  clearFormatting,
  getBlockType,
  runEditorCommand,
  setLineHeight,
  setTextAlign,
  toggleBulletedList,
  toggleNumberedList,
  toggleTodoChecked,
  toggleTodoList,
  turnIntoBlockquote,
  turnIntoCallout,
  turnIntoHeading1,
  type EditorCommand,
} from "./editor-commands";
import { createEditorDocument } from "./editor-document";
import {
  IMAGE_MAX_WIDTH,
  IMAGE_MIN_WIDTH,
  allowedChildTypes,
  isVoidElementType,
} from "./editor-document-schema";
import { parseEditorDocument, type ParseResult } from "./editor-document-validate";
import type { AssetStore, UploadSource } from "./editor-assets";
import { ASSET_LIMITS } from "./editor-assets";
import {
  IMAGE_BOTH_SOURCES,
  IMAGE_DATA_URL,
  IMAGE_NOT_FOUND,
  IMAGE_UNSAFE_URL,
  assetIsMissing,
  attachImageRuntime,
  handleImageDrop,
  imageUploadState,
  insertImageFromFiles,
  insertImageFromUrl,
  removeImage,
  replaceImageFromFile,
  retryImageUpload,
  setImageAlign,
  setImageAlt,
  setImageWidth,
  type ImageDropEvent,
} from "./editor-image";
import { createEditorPlugins } from "./editor-plugins";
import { pasteRepairsOf } from "./editor-paste";
import { EditorSurface } from "./editor-surface";
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

const PNG_BYTES = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
]);

const PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function paragraph(text: string, id: string): TElement {
  return { type: "p", id, children: [{ text }] };
}

function image(id: string, extra: Record<string, unknown> = {}): TElement {
  const node: TElement = { type: "img", id, children: [{ text: "" }] };
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
  return parseEditorDocument(createEditorDocument("doc-image", content));
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

function nestedText(node: unknown): string {
  if (!isRecord(node)) {
    return "";
  }

  if (typeof node.text === "string" && !("children" in node)) {
    return node.text;
  }

  if (!Array.isArray(node.children)) {
    return "";
  }

  return node.children.map((child) => nestedText(child)).join("");
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

function pngSource(size = PNG_BYTES.byteLength): UploadSource {
  return uploadSource(PNG_BYTES, "shot.png", "image/png", size);
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
  // happy-dom's files getter has no setter, so an own getter has to shadow it.
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

  throw new Error("The image upload did not settle.");
}

function openImage(value: EditorValue = [paragraph("", "empty")]) {
  let step = 0;
  const memory = createMemoryAssetStore();
  const editor = createEditor(value);
  editor.tf.select(caret([0, 0], 0));
  const detach = attachImageRuntime(editor, memory.store, {
    probe: async () => ({ width: 48, height: 24 }),
    createId: () => {
      step += 1;
      return `id-${String(step)}`;
    },
    now: () => "2026-10-07T00:00:00.000Z",
  });

  return { editor, memory, detach };
}

function imageNode(editor: SlateEditor): TElement | undefined {
  return editor.children.find((block) => block.type === KEYS.img);
}

function stubObjectUrls(): { created: string[]; revoked: string[]; restore: () => void } {
  const created: string[] = [];
  const revoked: string[] = [];
  const previousCreate = Reflect.get(URL, "createObjectURL");
  const previousRevoke = Reflect.get(URL, "revokeObjectURL");
  Reflect.set(URL, "createObjectURL", () => {
    const value = `blob:test-${String(created.length)}`;
    created.push(value);
    return value;
  });
  Reflect.set(URL, "revokeObjectURL", (value: string) => {
    revoked.push(value);
  });

  return {
    created,
    revoked,
    restore() {
      if (previousCreate === undefined) {
        Reflect.deleteProperty(URL, "createObjectURL");
      } else {
        Reflect.set(URL, "createObjectURL", previousCreate);
      }
      if (previousRevoke === undefined) {
        Reflect.deleteProperty(URL, "revokeObjectURL");
      } else {
        Reflect.set(URL, "revokeObjectURL", previousRevoke);
      }
    },
  };
}

function renderImage(value: EditorValue, readOnly = false): string {
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

async function mountImage(
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

const urlImage = image("pic", {
  url: "https://images.example/hill.png",
  naturalWidth: 640,
  naturalHeight: 400,
  alt: "A violet hill",
  caption: [{ text: "A drawing stored with the block." }],
});

describe("image schema", () => {
  test("an asset image and a url image round-trip", () => {
    expect(isVoidElementType(KEYS.img)).toBe(true);
    expect(allowedChildTypes("toggle")).toContain(KEYS.img);
    expect(allowedChildTypes("blockquote")).toEqual(["p"]);
    expect(allowedChildTypes("callout")).toEqual(["p"]);
    expect(allowedChildTypes("td")).toEqual(["p"]);

    const asset = image("asset-image", {
      assetId: "asset-1",
      naturalWidth: 32,
      naturalHeight: 16,
      width: 128,
      align: "left",
      alt: "",
      caption: [{ text: "Stored", bold: true }],
    });
    const remote = image("url-image", {
      url: "/blocks/notion-like-editor/image-demo.svg",
      naturalWidth: 640,
      naturalHeight: 400,
      align: "right",
      alt: "Hill",
      caption: [{ text: "Remote" }],
    });
    const content = [asset, remote];
    const parsed = expectOk(documentOf(content));

    expect(parsed.repairs).toEqual([]);
    expect(parsed.document.content).toBe(content);
  });

  test("a sourceless image is ok", () => {
    const content = [image("pending")];
    const parsed = expectOk(documentOf(content));

    expect(parsed.document.content).toBe(content);
  });

  test("blob, data, http, and javascript urls are unsupported and the raw document is kept", () => {
    const cases = [
      "blob:https://images.example/1",
      "data:image/png;base64,aaaa",
      "http://images.example/hill.png",
      "javascript:alert(1)",
      "//images.example/hill.png",
    ];

    for (const url of cases) {
      const raw = createEditorDocument("doc-image", [image("pic", { url })]);
      const result = expectUnsupported(parseEditorDocument(raw));
      expect(result.raw).toBe(raw);
      expect(messages(result).length).toBeGreaterThan(0);
    }
  });

  test("both sources, one natural dimension, a stored center align, a wide width, and a long alt are unsupported", () => {
    const both = expectUnsupported(
      documentOf([image("pic", { assetId: "asset-1", url: "https://images.example/a.png" })]),
    );
    const oneSide = expectUnsupported(documentOf([image("pic", { naturalWidth: 10 })]));
    const center = expectUnsupported(documentOf([image("pic", { align: "center" })]));
    const narrow = expectUnsupported(documentOf([image("pic", { width: IMAGE_MIN_WIDTH - 1 })]));
    const wide = expectUnsupported(documentOf([image("pic", { width: IMAGE_MAX_WIDTH + 1 })]));
    const alt = expectUnsupported(documentOf([image("pic", { alt: "a".repeat(1001) })]));

    expect(messages(both)).toContain("both assetId and url");
    expect(messages(oneSide)).toContain("natural size");
    expect(messages(center)).toContain("align");
    expect(messages(narrow)).toContain("width");
    expect(messages(wide)).toContain("width");
    expect(messages(alt)).toContain("alt");
  });

  test("a stored image inside a quote is unsupported", () => {
    const result = expectUnsupported(
      documentOf([
        quote("quote-1", [
          paragraph("A", "a"),
          image("pic", { url: "https://images.example/a.png" }),
        ]),
      ]),
    );

    expect(messages(result)).toContain("img");
  });
});

describe("image commands and void props", () => {
  test("insert from files and from a url, and one undo removes each insert", async () => {
    const uploaded = openImage();
    const beforeFiles = snapshot(uploaded.editor.children);

    expect(insertImageFromFiles.id).toBe("block.insert.image");
    expect(insertImageFromFiles.label).toBe("Image");
    expect(insertImageFromFiles.group).toBe("insert");
    expect(runEditorCommand(uploaded.editor, insertImageFromFiles, [pngSource()])).toBe(true);
    await until(() => field(imageNode(uploaded.editor), "assetId") === "id-2");

    expect(field(imageNode(uploaded.editor), "url")).toBeUndefined();
    expect(field(imageNode(uploaded.editor), "naturalWidth")).toBe(48);
    expect(field(imageNode(uploaded.editor), "naturalHeight")).toBe(24);
    expect(uploaded.editor.history.undos.length).toBe(1);
    uploaded.editor.tf.undo();
    expect(uploaded.editor.children).toEqual(beforeFiles);
    uploaded.detach();

    const linked = openImage();
    const beforeUrl = snapshot(linked.editor.children);
    expect(insertImageFromUrl.id).toBe("block.insert.image-url");
    expect(insertImageFromUrl.label).toBe("Image from URL");
    expect(
      runEditorCommand(linked.editor, insertImageFromUrl, "https://images.example/hill.png"),
    ).toBe(true);
    expect(field(imageNode(linked.editor), "url")).toBe("https://images.example/hill.png");
    expect(field(imageNode(linked.editor), "assetId")).toBeUndefined();
    linked.editor.tf.undo();
    expect(linked.editor.children).toEqual(beforeUrl);

    const invalid = snapshot(linked.editor.children);
    runEditorCommand(linked.editor, insertImageFromUrl, "http://images.example/hill.png");
    runEditorCommand(linked.editor, insertImageFromUrl, "javascript:alert(1)");
    expect(linked.editor.children).toEqual(invalid);
    linked.detach();
  });

  test("replace keeps the block id and one undo restores the url", async () => {
    const { editor, detach } = openImage();
    runEditorCommand(editor, insertImageFromUrl, "/blocks/notion-like-editor/image-demo.svg");
    const id = field(imageNode(editor), "id");
    expect(typeof id).toBe("string");

    runEditorCommand(editor, replaceImageFromFile, { id: String(id), file: pngSource() });
    await until(() => field(imageNode(editor), "assetId") === "id-2");

    expect(field(imageNode(editor), "id")).toBe(id);
    expect(field(imageNode(editor), "url")).toBeUndefined();
    expect(field(imageNode(editor), "naturalWidth")).toBe(48);
    editor.tf.undo();
    expect(field(imageNode(editor), "id")).toBe(id);
    expect(field(imageNode(editor), "url")).toBe("/blocks/notion-like-editor/image-demo.svg");
    expect(field(imageNode(editor), "assetId")).toBeUndefined();
    detach();
  });

  test("align, alt, and width each undo in one step", () => {
    const editor = createEditor([urlImage, paragraph("After", "after")]);
    selectBlock(editor, 0);
    const id = "pic";

    runEditorCommand(editor, setImageAlign, { id, align: "left" });
    expect(field(editor.children[0], "align")).toBe("left");
    editor.tf.undo();
    expect(field(editor.children[0], "align")).toBeUndefined();

    runEditorCommand(editor, setImageAlign, { id, align: "right" });
    runEditorCommand(editor, setImageAlign, { id, align: null });
    expect(field(editor.children[0], "align")).toBeUndefined();
    editor.tf.undo();
    expect(field(editor.children[0], "align")).toBe("right");

    runEditorCommand(editor, setImageAlt, { id, alt: "Hill path" });
    expect(field(editor.children[0], "alt")).toBe("Hill path");
    editor.tf.undo();
    expect(field(editor.children[0], "alt")).toBe("A violet hill");

    runEditorCommand(editor, setImageAlt, { id, alt: "" });
    expect(field(editor.children[0], "alt")).toBe("");
    runEditorCommand(editor, setImageAlt, { id, alt: null });
    expect(field(editor.children[0], "alt")).toBeUndefined();
    runEditorCommand(editor, setImageAlt, { id, alt: "a".repeat(1001) });
    expect(field(editor.children[0], "alt")).toBeUndefined();

    runEditorCommand(editor, setImageWidth, { id, width: 200 });
    expect(field(editor.children[0], "width")).toBe(200);
    editor.tf.undo();
    expect(field(editor.children[0], "width")).toBeUndefined();

    runEditorCommand(editor, setImageWidth, { id, width: 20 });
    expect(field(editor.children[0], "width")).toBe(IMAGE_MIN_WIDTH);
    runEditorCommand(editor, setImageWidth, { id, width: 9000 });
    expect(field(editor.children[0], "width")).toBe(IMAGE_MAX_WIDTH);
    runEditorCommand(editor, setImageWidth, { id, width: null });
    expect(field(editor.children[0], "width")).toBeUndefined();
  });

  test("read-only refuses image commands", () => {
    const editor = createEditor([paragraph("", "empty")]);
    editor.tf.select(caret([0, 0], 0));
    const before = snapshot(editor.children);
    const undos = editor.history.undos.length;

    expect(
      runEditorCommand(editor, insertImageFromUrl, "https://images.example/a.png", {
        readOnly: true,
      }),
    ).toBe(false);
    expect(runEditorCommand(editor, insertImageFromFiles, [pngSource()], { readOnly: true })).toBe(
      false,
    );
    expect(editor.children).toEqual(before);
    expect(editor.history.undos.length).toBe(undos);

    editor.dom.readOnly = true;
    runEditorCommand(editor, insertImageFromUrl, "https://images.example/a.png");
    runEditorCommand(editor, setImageAlign, { id: "pic", align: "left" });
    runEditorCommand(editor, setImageAlt, { id: "pic", alt: "Nope" });
    runEditorCommand(editor, setImageWidth, { id: "pic", width: 200 });
    expect(editor.children).toEqual(before);
  });

  const selected: readonly [string, EditorCommand][] = [
    ["heading", turnIntoHeading1],
    ["bulleted list", toggleBulletedList],
    ["numbered list", toggleNumberedList],
    ["to-do list", toggleTodoList],
    ["quote", turnIntoBlockquote],
    ["callout", turnIntoCallout],
  ];

  for (const [label, command] of selected) {
    test(`${label} leaves a selected image as an image`, () => {
      const editor = createEditor([paragraph("Alpha", "a"), urlImage, paragraph("Beta", "b")]);
      selectBlock(editor, 1);
      const before = snapshot(editor.children[1]);

      runEditorCommand(editor, command, undefined);

      expect(editor.children[1]).toEqual(before);
      expect(getBlockType(editor)).toBe("img");
    });
  }

  test("align, line height, and clear formatting do not retype an image", () => {
    const editor = createEditor([paragraph("Alpha", "a"), urlImage, paragraph("Beta", "b")]);
    selectBlock(editor, 1);
    const before = snapshot(editor.children[1]);

    runEditorCommand(editor, setTextAlign, "center");
    runEditorCommand(editor, setLineHeight, 2);
    runEditorCommand(editor, clearFormatting, undefined);

    expect(editor.children[1]).toEqual(before);
    expect(runEditorCommand(editor, toggleTodoChecked, undefined)).toBe(false);
  });

  test("the image's own align, alt, and width writes are accepted", () => {
    const editor = createEditor([urlImage]);
    editor.tf.setNodes({ align: "left", alt: "Path", width: 320 }, { at: [0] });

    expect(field(editor.children[0], "align")).toBe("left");
    expect(field(editor.children[0], "alt")).toBe("Path");
    expect(field(editor.children[0], "width")).toBe(320);
    expect(editor.children[0]?.type).toBe("img");

    editor.tf.setNodes({ type: KEYS.h1 }, { at: [0] });
    expect(editor.children[0]?.type).toBe("img");
  });
});

describe("image upload", () => {
  test("oversize, svg, and corrupt files fail with no asset id", async () => {
    const oversize = openImage();
    runEditorCommand(oversize.editor, insertImageFromFiles, [pngSource(ASSET_LIMITS.image + 1)]);
    const oversizeId = String(field(imageNode(oversize.editor), "id"));
    await until(() => imageUploadState(oversize.editor, oversizeId)?.status === "failed");
    expect(imageUploadState(oversize.editor, oversizeId)?.error).toContain("limit");
    expect(field(imageNode(oversize.editor), "assetId")).toBeUndefined();
    oversize.detach();

    const svg = openImage();
    const svgBytes = new TextEncoder().encode("<svg xmlns='x'>");
    runEditorCommand(svg.editor, insertImageFromFiles, [
      uploadSource(svgBytes, "icon.svg", "image/svg+xml"),
    ]);
    const svgId = String(field(imageNode(svg.editor), "id"));
    await until(() => imageUploadState(svg.editor, svgId)?.status === "failed");
    expect(imageUploadState(svg.editor, svgId)?.error).toContain("SVG");
    expect(field(imageNode(svg.editor), "assetId")).toBeUndefined();
    svg.detach();

    const corrupt = openImage();
    runEditorCommand(corrupt.editor, insertImageFromFiles, [
      uploadSource(new TextEncoder().encode("not-an-image!!!"), "bad.png", "image/png"),
    ]);
    const corruptId = String(field(imageNode(corrupt.editor), "id"));
    await until(() => imageUploadState(corrupt.editor, corruptId)?.status === "failed");
    expect(imageUploadState(corrupt.editor, corruptId)?.error).toContain("not a PNG");
    expect(field(imageNode(corrupt.editor), "assetId")).toBeUndefined();
    expect(await corrupt.memory.store.list()).toEqual([]);
    corrupt.detach();
  });

  test("retry saves the file after a store failure, and remove deletes the image", async () => {
    const { editor, memory, detach } = openImage();
    memory.failNext(new Error("disk full"));
    runEditorCommand(editor, insertImageFromFiles, [pngSource()]);
    const id = String(field(imageNode(editor), "id"));
    await until(() => imageUploadState(editor, id)?.status === "failed");
    expect(imageUploadState(editor, id)?.error).toBe("disk full");
    expect(field(imageNode(editor), "assetId")).toBeUndefined();

    retryImageUpload(editor, id);
    await until(() => typeof field(imageNode(editor), "assetId") === "string");
    expect(field(imageNode(editor), "naturalWidth")).toBe(48);
    expect(field(imageNode(editor), "naturalHeight")).toBe(24);

    runEditorCommand(editor, removeImage, id);
    expect(typesOf(editor)).not.toContain("img");
    detach();
  });

  test("deleting the image while it uploads does not write or reinsert it", async () => {
    const { editor, memory, detach } = openImage([paragraph("Keep", "keep")]);
    editor.tf.select(caret([0, 0], 4));
    memory.hold();
    runEditorCommand(editor, insertImageFromFiles, [pngSource()]);
    await until(() => memory.puts() === 1);
    const id = String(field(imageNode(editor), "id"));
    expect(imageUploadState(editor, id)?.status).not.toBe("ready");

    const imagePath = editor.children.findIndex((block) => block.type === KEYS.img);
    editor.tf.removeNodes({ at: [imagePath], voids: true });
    memory.release();
    await settle();

    expect(typesOf(editor)).not.toContain("img");
    expect(blockIds(editor)).toContain("keep");
    expect(await memory.store.list()).toEqual([]);
    expect(applyUploadToBlock(editor, id, { assetId: "late" })).toBe(false);
    expect(JSON.stringify(editor.children)).not.toContain("late");
    detach();
  });

  test("a finished asset stays until cleanup when the image is deleted after it is ready", async () => {
    const inner = createMemoryAssetStore();
    let waiting: Promise<void> | undefined;
    let releaseWait = (): void => undefined;
    const store: AssetStore = {
      put: (record, blob) => inner.store.put(record, blob),
      get: async (id) => {
        if (waiting) {
          await waiting;
        }
        return inner.store.get(id);
      },
      delete: (id) => inner.store.delete(id),
      list: () => inner.store.list(),
    };
    const editor = createEditor([paragraph("", "empty")]);
    editor.tf.select(caret([0, 0], 0));
    const detach = attachImageRuntime(editor, store, {
      probe: async () => ({ width: 48, height: 24 }),
      createId: (() => {
        let step = 0;
        return () => {
          step += 1;
          return `held-${String(step)}`;
        };
      })(),
      now: () => "2026-10-07T00:00:00.000Z",
    });
    waiting = new Promise((resolve) => {
      releaseWait = () => resolve();
    });

    runEditorCommand(editor, insertImageFromFiles, [pngSource()]);
    const id = String(field(imageNode(editor), "id"));
    await until(() => imageUploadState(editor, id)?.status === "ready");
    editor.tf.removeNodes({ at: [0], voids: true });
    releaseWait();
    waiting = undefined;
    await settle();

    expect(typesOf(editor)).not.toContain("img");
    expect(applyUploadToBlock(editor, id, { assetId: "held-2" })).toBe(false);
    const listed = await store.list();
    expect(listed.map((record) => record.id)).toEqual(["held-2"]);
    const deleted = await cleanupUnreferencedAssets(store, new Set(), {
      now: Date.parse("2026-10-07T00:00:00.000Z") + 1,
      graceMs: 0,
    });
    expect(deleted).toEqual(["held-2"]);
    expect(await store.list()).toEqual([]);
    detach();
  });
});

describe("image paste and drop", () => {
  test("a clipboard image file uploads, and html https keeps alt and caption", async () => {
    const { editor, detach } = openImage();
    editor.tf.insertData(withFiles([pngSource()]));
    await until(() => typeof field(imageNode(editor), "assetId") === "string");
    expect(field(imageNode(editor), "naturalWidth")).toBe(48);
    expect(field(imageNode(editor), "url")).toBeUndefined();
    detach();

    const html = createEditor([paragraph("", "empty")]);
    html.tf.select(caret([0, 0], 0));
    const data = new DataTransfer();
    data.setData(
      "text/html",
      '<figure><img src="https://images.example/hill.png" alt="Hill"><figcaption>From the page</figcaption></figure>',
    );
    html.tf.insertData(data);
    const pasted = html.children.find((block) => block.type === KEYS.img);
    expect(field(pasted, "url")).toBe("https://images.example/hill.png");
    expect(field(pasted, "alt")).toBe("Hill");
    expect(field(pasted, "caption")).toEqual([{ text: "From the page" }]);
    expect(field(pasted, "assetId")).toBeUndefined();
  });

  test("a data url uploads, a bad data url keeps alt, and an unsafe url keeps alt", async () => {
    const { editor, detach } = openImage([paragraph("Stay", "stay")]);
    editor.tf.select(caret([0, 0], 0));
    editor.tf.insertFragment([image("data-image", { url: PNG_DATA_URL, alt: "Shot" })]);
    await until(
      () =>
        field(
          editor.children.find((block) => field(block, "alt") === "Shot"),
          "assetId",
        ) === "id-2",
    );
    const uploaded = editor.children.find((block) => field(block, "alt") === "Shot");
    expect(field(uploaded, "url")).toBeUndefined();
    expect(texts(editor)).toContain("Stay");
    detach();

    const broken = createEditor([paragraph("", "empty")]);
    broken.tf.select(caret([0, 0], 0));
    broken.tf.insertFragment([
      image("broken", { url: "data:image/png;base64,%%%", alt: "Kept alt" }),
    ]);
    expect(typesOf(broken)).not.toContain("img");
    expect(texts(broken)).toContain("Kept alt");
    expect(pasteRepairsOf(broken).map((repair) => repair.message)).toContain(IMAGE_DATA_URL);

    const unsafe = createEditor([paragraph("", "empty")]);
    unsafe.tf.select(caret([0, 0], 0));
    unsafe.tf.insertFragment([
      image("unsafe", { url: "http://images.example/hill.png", alt: "Kept alt" }),
    ]);
    expect(typesOf(unsafe)).not.toContain("img");
    expect(texts(unsafe)).toContain("Kept alt");
    expect(pasteRepairsOf(unsafe).map((repair) => repair.message)).toContain(IMAGE_UNSAFE_URL);
  });

  test("a fragment keeps an asset id and drops a second url", () => {
    const editor = createEditor([paragraph("", "empty")]);
    editor.tf.select(caret([0, 0], 0));
    editor.tf.insertFragment([
      image("frag", {
        assetId: "asset-9",
        url: "https://images.example/hill.png",
        alt: "From a document",
        naturalWidth: 10,
        naturalHeight: 20,
      }),
    ]);

    const pasted = editor.children.find((block) => block.type === KEYS.img);
    expect(field(pasted, "assetId")).toBe("asset-9");
    expect(field(pasted, "url")).toBeUndefined();
    expect(field(pasted, "alt")).toBe("From a document");
    expect(field(pasted, "naturalWidth")).toBe(10);
    expect(field(pasted, "naturalHeight")).toBe(20);
    expect(pasteRepairsOf(editor).map((repair) => repair.message)).toContain(IMAGE_BOTH_SOURCES);
  });

  test("an image file drops at the caret and a non-image file becomes a file block", () => {
    const { editor, detach } = openImage([
      paragraph("Alpha", "a"),
      paragraph("Beta", "b"),
      paragraph("Gamma", "c"),
    ]);
    editor.tf.select(caret([1, 0], 1));
    let prevented = false;
    const dropped: ImageDropEvent = {
      clientX: 0,
      clientY: 0,
      preventDefault: () => {
        prevented = true;
      },
      dataTransfer: withFiles([pngSource()]),
      view: null,
    };

    expect(handleImageDrop(editor, dropped)).toBe(false);
    expect(prevented).toBe(true);
    expect(typesOf(editor)).toEqual(["p", "p", "img", "p"]);
    expect(blockIds(editor)).toEqual(["a", "b", expect.any(String), "c"]);
    detach();

    const other = createEditor([paragraph("Alpha", "a")]);
    other.tf.select(caret([0, 0], 0));
    const before = snapshot(other.children);
    let ignored = false;
    const pdf = uploadSource(Uint8Array.from([1, 2, 3]), "notes.pdf", "application/pdf");
    handleImageDrop(other, {
      clientX: 0,
      clientY: 0,
      preventDefault: () => {
        ignored = true;
      },
      dataTransfer: withFiles([pdf]),
      view: null,
    });

    expect(ignored).toBe(true);
    expect(typesOf(other)).toEqual(["p", "file", "p"]);
    expect(other.children).not.toEqual(before);
    expect(pasteRepairsOf(other)).toEqual([]);
  });
});

describe("image rendering", () => {
  test("a url image renders a figure, lazy img, caption, and a skeleton with the same ratio", async () => {
    const html = renderImage([urlImage, paragraph("After", "after")]);

    expect(html).toContain("<figure");
    expect(html).toContain('alt="A violet hill"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('decoding="async"');
    expect(html).toContain('width="640"');
    expect(html).toContain('height="400"');
    expect(html).toContain("aspect-ratio:640 / 400");
    expect(html).toContain("data-image-skeleton");
    expect(html).toContain('data-image-state="loading"');
    expect(html).toContain("max-width:100%");

    const mounted = await mountImage([urlImage, paragraph("After", "after")]);
    expect(mounted.host.querySelector("textarea")?.value).toBe("A drawing stored with the block.");
    await mounted.cleanup();
  });

  test("read-only shows the caption and alt without handles or a toolbar", async () => {
    const html = renderImage([urlImage], true);

    expect(html).toContain('alt="A violet hill"');
    expect(html).not.toContain('role="separator"');
    expect(html).not.toContain("Replace");
    expect(html).not.toContain("Remove");
    expect(html).not.toContain("Alt text");

    const mounted = await mountImage([urlImage], { readOnly: true });
    expect(mounted.host.querySelector("textarea")?.value).toBe("A drawing stored with the block.");
    expect(mounted.host.querySelector("[role='separator']")).toBeNull();
    await mounted.cleanup();
  });

  test("a sourceless image says the upload did not finish", () => {
    const html = renderImage([image("empty-image")]);

    expect(html).toContain("Upload didn");
    expect(html).toContain("Insert image");
    expect(html).toContain("Remove");
    expect(html).toContain('data-image-state="empty"');
  });

  test("a failed url and a missing asset render error cards, and object urls are revoked", async () => {
    const urls = stubObjectUrls();
    try {
      const failed = await mountImage([urlImage]);
      const img = failed.host.querySelector("img");
      if (!img) {
        throw new Error("Missing img.");
      }
      await act(async () => {
        img.dispatchEvent(new Event("error"));
      });
      expect(failed.host.textContent).toContain("https://images.example/hill.png");
      const link = failed.host.querySelector("a");
      expect(link?.textContent).toBe("Open original");
      expect(link?.getAttribute("rel")).toBe("noopener noreferrer");
      expect(link?.getAttribute("href")).toBe("https://images.example/hill.png");
      await failed.cleanup();

      const memory = createMemoryAssetStore();
      const missing = await mountImage([image("gone", { assetId: "missing-asset", alt: "Gone" })], {
        store: memory.store,
      });
      await act(async () => {
        await settle();
      });
      expect(missing.host.textContent).toContain(IMAGE_NOT_FOUND);
      expect(missing.host.textContent).toContain("Remove");
      await missing.cleanup();

      const record = {
        id: "asset-live",
        kind: "image" as const,
        name: "shot.png",
        mimeType: "image/png",
        byteSize: PNG_BYTES.byteLength,
        width: 48,
        height: 24,
        createdAt: "2026-10-07T00:00:00.000Z",
      };
      const liveStore = createMemoryAssetStore([record]);
      const blob = new Blob([PNG_BYTES], { type: "image/png" });
      liveStore.records.set(record.id, { record, blob });
      const live = await mountImage(
        [
          image("live", {
            assetId: "asset-live",
            naturalWidth: 48,
            naturalHeight: 24,
            alt: "Live",
          }),
        ],
        { store: liveStore.store },
      );
      await act(async () => {
        await settle();
      });
      expect(live.host.querySelector("img")?.getAttribute("src")).toBe("blob:test-0");
      expect(assetIsMissing(live.editor, "asset-live")).toBe(false);
      await live.cleanup();
      expect(urls.revoked).toContain("blob:test-0");
    } finally {
      urls.restore();
    }
  });

  test("resize previews, commits one undo, and the keyboard changes the width by 16", async () => {
    const mounted = await mountImage([
      image("pic", {
        url: "https://images.example/hill.png",
        naturalWidth: 640,
        naturalHeight: 400,
        width: 200,
        alt: "Hill",
      }),
    ]);
    const handle = mounted.host.querySelector("[aria-label='Resize image from the right']");
    if (!(handle instanceof HTMLElement)) {
      throw new Error("Missing resize handle.");
    }

    await act(async () => {
      handle.dispatchEvent(
        new PointerEvent("pointerdown", { button: 0, clientX: 100, bubbles: true }),
      );
      handle.dispatchEvent(new PointerEvent("pointermove", { clientX: 140, bubbles: true }));
    });
    expect(mounted.host.querySelector("figure")?.getAttribute("style")).toContain("width: 240px");
    expect(field(mounted.editor.children[0], "width")).toBe(200);

    await act(async () => {
      handle.dispatchEvent(new PointerEvent("pointerup", { clientX: 140, bubbles: true }));
    });
    expect(field(mounted.editor.children[0], "width")).toBe(240);
    await act(async () => {
      mounted.editor.tf.undo();
    });
    expect(field(mounted.editor.children[0], "width")).toBe(200);

    handle.focus();
    await act(async () => {
      handle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    });
    expect(field(mounted.editor.children[0], "width")).toBe(216);

    await act(async () => {
      handle.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    expect(field(mounted.editor.children[0], "width")).toBeUndefined();
    await mounted.cleanup();
  });

  test("an adapter image refreshes its url once, then shows the fallback", async () => {
    const memory = createMemoryAssetStore();
    const urls = ["https://cdn.example/one.png", "https://cdn.example/two.png"];
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
    const mounted = await mountImage([image("pic", { assetId: "asset-1", alt: "Hill" })], {
      store,
    });
    await act(async () => {
      await settle();
    });
    const first = mounted.host.querySelector("img");
    expect(first?.getAttribute("src")).toBe("https://cdn.example/one.png");
    expect(calls).toBe(1);

    await act(async () => {
      first?.dispatchEvent(new Event("error"));
      await settle();
    });
    const second = mounted.host.querySelector("img");
    expect(second?.getAttribute("src")).toBe("https://cdn.example/two.png");
    expect(calls).toBe(2);
    expect(mounted.host.textContent).not.toContain("Open original");

    await act(async () => {
      second?.dispatchEvent(new Event("error"));
      await settle();
    });
    expect(mounted.host.textContent).toContain("https://cdn.example/two.png");
    expect(mounted.host.querySelector("a")?.textContent).toBe("Open original");
    expect(calls).toBe(2);
    await mounted.cleanup();
  });
});

describe("image keyboard", () => {
  test("backspace or delete beside an image selects it, and a selected image deletes alone", () => {
    const editor = createEditor([paragraph("Hello", "a"), urlImage, paragraph("World", "b")]);
    editor.tf.select(caret([2, 0], 0));
    editor.tf.deleteBackward();

    expect(blockIds(editor)).toEqual(["a", "pic", "b"]);
    expect(editor.selection?.anchor.path[0]).toBe(1);

    editor.tf.deleteBackward();
    expect(typesOf(editor)).toEqual(["p", "p"]);
    expect(blockIds(editor)).toEqual(["a", "b"]);
    expect(texts(editor)).toEqual(["Hello", "World"]);

    const forward = createEditor([paragraph("Hello", "a"), urlImage, paragraph("World", "b")]);
    forward.tf.select(caret([0, 0], 5));
    forward.tf.deleteForward();
    expect(forward.selection?.anchor.path[0]).toBe(1);
    forward.tf.deleteForward();
    expect(typesOf(forward)).toEqual(["p", "p"]);
    expect(texts(forward)).toEqual(["Hello", "World"]);
  });

  test("enter on a selected image inserts a paragraph after it, and arrows move across it", () => {
    const editor = createEditor([paragraph("Hello", "a"), urlImage, paragraph("World", "b")]);
    selectBlock(editor, 1);
    editor.tf.insertBreak();

    expect(typesOf(editor)).toEqual(["p", "img", "p", "p"]);
    expect(blockIds(editor)[1]).toBe("pic");
    expect(editor.selection?.anchor.path[0]).toBe(2);

    const across = createEditor([paragraph("Hello", "a"), urlImage, paragraph("World", "b")]);
    across.tf.select(caret([0, 0], 5));
    across.tf.move({ reverse: false });
    expect(across.selection?.anchor.path[0]).toBe(1);
    across.tf.move({ reverse: false });
    expect(across.selection?.anchor.path[0]).toBe(2);
    across.tf.move({ reverse: true });
    expect(across.selection?.anchor.path[0]).toBe(1);
    across.tf.move({ reverse: true });
    expect(across.selection?.anchor.path[0]).toBe(0);
  });

  test("caption editing leaves the source untouched, and arrows focus the caption", async () => {
    const editor = createEditor([paragraph("Hello", "a"), urlImage, paragraph("World", "b")]);
    editor.tf.select(editor.api.start([1]) ?? caret([1, 0], 0));
    editor.tf.moveLine({ reverse: false });
    expect(editor.getOption(CaptionPlugin, "focusEndPath")).toEqual([1]);

    editor.tf.setNodes({ caption: [{ text: "A new caption" }] }, { at: [1] });
    expect(field(editor.children[1], "caption")).toEqual([{ text: "A new caption" }]);
    expect(field(editor.children[1], "url")).toBe("https://images.example/hill.png");
    expect(field(editor.children[1], "assetId")).toBeUndefined();

    editor.dom.currentKeyboardEvent = new KeyboardEvent("keydown", { key: "ArrowUp" });
    editor.tf.select(caret([1, 0], 0));
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    expect(editor.getOption(CaptionPlugin, "focusEndPath")).toEqual([1]);
  });
});

describe("image containers", () => {
  test("an image stays inside a toggle", () => {
    const editor = createEditor([
      toggle("toggle-1", [
        paragraph("Label", "label"),
        image("pic", { url: "https://images.example/a.png" }),
      ]),
    ]);
    editor.tf.normalize({ force: true });

    expect(typesOf(editor)).toEqual(["toggle"]);
    expect(childTypes(editor.children[0])).toEqual(["p", "img"]);
    expect(childIds(editor.children[0])).toEqual(["label", "pic"]);
  });

  test("a quote and a callout split around an image", () => {
    const editor = createEditor([
      quote("quote-1", [
        paragraph("Before", "before"),
        image("pic", { url: "https://images.example/a.png", alt: "Hill" }),
        paragraph("After", "after"),
      ]),
      callout("callout-1", [
        paragraph("Note", "note"),
        image("icon", { assetId: "asset-1" }),
        paragraph("Tail", "tail"),
      ]),
    ]);
    editor.tf.normalize({ force: true });

    expect(typesOf(editor)).toEqual([
      "blockquote",
      "img",
      "blockquote",
      "callout",
      "img",
      "callout",
    ]);
    expect(field(editor.children[1], "id")).toBe("pic");
    expect(field(editor.children[1], "alt")).toBe("Hill");
    expect(field(editor.children[4], "id")).toBe("icon");
    expect(field(editor.children[4], "assetId")).toBe("asset-1");
    expect(nestedText(editor.children[0])).toBe("Before");
    expect(nestedText(editor.children[2])).toBe("After");
    expect(nestedText(editor.children[3])).toBe("Note");
    expect(nestedText(editor.children[5])).toBe("Tail");
  });

  test("an image in a table cell is lifted after the table and the cell keeps a paragraph", () => {
    const editor = createEditor([
      tableNode("table-1", [
        row("row-1", [
          cell("td", "cell-1", [
            paragraph("Stay", "stay"),
            image("pic", { url: "https://images.example/a.png", alt: "Hill" }),
          ]),
        ]),
      ]),
      paragraph("After", "after"),
    ]);
    editor.tf.normalize({ force: true });

    expect(typesOf(editor)).toEqual(["table", "img", "p"]);
    expect(field(editor.children[1], "id")).toBe("pic");
    expect(field(editor.children[1], "url")).toBe("https://images.example/a.png");
    expect(field(editor.children[1], "alt")).toBe("Hill");
    const table = editor.children[0];
    const body = isRecord(table) && Array.isArray(table.children) ? table.children[0] : undefined;
    const liftedCell =
      isRecord(body) && Array.isArray(body.children) ? body.children[0] : undefined;
    expect(childTypes(liftedCell)).toEqual(["p"]);
    expect(childIds(liftedCell)).toEqual(["stay"]);
  });
});
