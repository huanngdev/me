import { describe, expect, test } from "bun:test";
import { CaptionPlugin } from "@platejs/caption/react";
import { ElementApi, KEYS, type SlateEditor, type TElement } from "platejs";
import { createPlateEditor } from "platejs/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";

import { formatBytes } from "./asset-validation";
import { cleanupUnreferencedAssets, collectAssetIds } from "./asset-references";
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
import { isVoidElementType } from "./editor-document-schema";
import { parseEditorDocument, type ParseResult } from "./editor-document-validate";
import {
  ASSET_LIMITS,
  type AssetRecord,
  type AssetStore,
  type UploadSource,
} from "./editor-assets";
import { EditorSurface } from "./editor-surface";
import { createEditorPlugins } from "./editor-plugins";
import { sanitizeMediaName } from "./editor-media";
import { pasteRepairsOf } from "./editor-paste";
import {
  attachImageRuntime,
  handleImageDrop,
  imageUploadState,
  type ImageDropEvent,
} from "./editor-image";
import {
  FILE_BOTH_SOURCES,
  FILE_NO_ACCESS,
  FILE_NOT_FOUND,
  FILE_UNSAFE_URL,
  attachFileRuntime,
  fileMedia,
  fileUploadState,
  holdFileUpload,
  insertFileFromFiles,
  insertFileFromUrl,
  removeFile,
  replaceFileFromFile,
  retryFileUpload,
} from "./editor-file";
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

const PDF_BYTES = Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
const PNG_BYTES = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
]);

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
  return parseEditorDocument(createEditorDocument("doc-file", content));
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

function contentOf(editor: SlateEditor): EditorValue {
  const content: EditorValue = [];
  for (const node of editor.children) {
    if (ElementApi.isElement(node)) {
      content.push(node);
    }
  }
  return content;
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

  throw new Error("The file upload did not settle.");
}

function openFile(value: EditorValue = [paragraph("", "empty")]) {
  let step = 0;
  const memory = createMemoryAssetStore();
  const editor = createEditor(value);
  editor.tf.select(caret([0, 0], 0));
  const detach = attachFileRuntime(editor, memory.store, {
    createId: () => {
      step += 1;
      return `id-${String(step)}`;
    },
    now: () => "2026-10-08T00:00:00.000Z",
  });

  return { editor, memory, detach };
}

function firstFile(editor: SlateEditor): TElement | undefined {
  return editor.children.find((block) => block.type === KEYS.file);
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

async function mountFile(
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

const urlFile = fileNode("clip", {
  url: "https://files.example/notes.txt",
  mimeType: "application/octet-stream",
  name: "notes.txt",
  byteSize: 12,
  caption: [{ text: "A short note." }],
});

describe("file schema", () => {
  test("an asset file and a url file round-trip with name, size, and caption", () => {
    expect(isVoidElementType(KEYS.file)).toBe(true);
    expect(fileMedia.spec.nodeType).toBe(KEYS.file);
    expect(fileMedia.spec.assetKind).toBe("file");
    expect(fileMedia.spec.mimePrefix).toBe("");
    expect(fileMedia.spec.aligns).toBeUndefined();
    expect(fileMedia.spec.commands.align).toBeUndefined();
    expect(fileMedia.spec.commands.width).toBeUndefined();

    const asset = fileNode("asset-file", {
      assetId: "asset-1",
      mimeType: "application/pdf",
      name: "tài-liệu.pdf",
      byteSize: 0,
      caption: [{ text: "Stored" }],
    });
    const remote = fileNode("url-file", {
      url: "/blocks/notion-like-editor/file-demo.txt",
      mimeType: "application/octet-stream",
      name: "📄 notes.pdf",
      byteSize: 73,
      caption: [{ text: "Remote" }],
    });
    const content = [asset, remote];
    const parsed = expectOk(documentOf(content));

    expect(parsed.repairs).toEqual([]);
    expect(parsed.document.content).toBe(content);
    expect(collectAssetIds(content).has("asset-1")).toBe(true);
  });

  test("a sourceless file is ok", () => {
    const content = [fileNode("pending")];
    const parsed = expectOk(documentOf(content));
    expect(parsed.document.content).toBe(content);
  });

  test("unknown attrs, unsafe urls, both sources, a bad mime, and a bad size are rejected", () => {
    const width = expectUnsupported(documentOf([fileNode("clip", { width: 320 })]));
    const align = expectUnsupported(documentOf([fileNode("clip", { align: "left" })]));
    const mime = expectUnsupported(
      documentOf([fileNode("clip", { mimeType: "text/plain", name: "notes.txt" })]),
    );
    const javascript = expectUnsupported(
      documentOf([fileNode("clip", { url: "javascript:alert(1)", name: "notes.txt" })]),
    );
    const data = expectUnsupported(
      documentOf([fileNode("clip", { url: "data:text/plain,hi", name: "notes.txt" })]),
    );
    const blob = expectUnsupported(
      documentOf([fileNode("clip", { url: "blob:https://files.example/1", name: "notes.txt" })]),
    );
    const both = expectUnsupported(
      documentOf([
        fileNode("clip", {
          assetId: "asset-1",
          url: "https://files.example/notes.txt",
          name: "notes.txt",
        }),
      ]),
    );
    const negative = expectUnsupported(
      documentOf([
        fileNode("clip", {
          url: "https://files.example/notes.txt",
          name: "notes.txt",
          byteSize: -1,
        }),
      ]),
    );
    const fraction = expectUnsupported(
      documentOf([
        fileNode("clip", {
          url: "https://files.example/notes.txt",
          name: "notes.txt",
          byteSize: 1.5,
        }),
      ]),
    );
    const unnamed = expectUnsupported(
      documentOf([fileNode("clip", { url: "https://files.example/notes.txt" })]),
    );

    expect(messages(width)).toContain("width");
    expect(messages(align)).toContain("align");
    expect(messages(mime)).toContain("mime");
    expect(messages(javascript)).toContain("unsupported url");
    expect(messages(data)).toContain("data:");
    expect(messages(blob)).toContain("blob:");
    expect(messages(both)).toContain("both assetId and url");
    expect(messages(negative)).toContain("size");
    expect(messages(fraction)).toContain("size");
    expect(messages(unnamed)).toContain("name");
    expect(width.raw).toBeDefined();
    expect(blob.raw).toBeDefined();
    expect(javascript.raw).toBeDefined();
  });

  test("a stored name with bidi, controls, a path, or 300 characters is rejected, and a clean Unicode name is kept", () => {
    const bidi = expectUnsupported(documentOf([fileNode("clip", { name: "notes\u202E.txt" })]));
    const control = expectUnsupported(documentOf([fileNode("clip", { name: "bad\nname.txt" })]));
    const path = expectUnsupported(documentOf([fileNode("clip", { name: "../notes.txt" })]));
    const long = expectUnsupported(documentOf([fileNode("clip", { name: "a".repeat(300) })]));
    const spaced = expectUnsupported(documentOf([fileNode("clip", { name: " notes.txt " })]));
    const clean = expectOk(
      documentOf([
        fileNode("clip", {
          url: "https://files.example/tài-liệu.pdf",
          name: "tài-liệu.pdf",
          mimeType: "application/pdf",
        }),
      ]),
    );

    expect(messages(bidi)).toContain("name");
    expect(messages(control)).toContain("name");
    expect(messages(path)).toContain("name");
    expect(messages(long)).toContain("name");
    expect(messages(spaced)).toContain("name");
    expect(clean.document.content).toHaveLength(1);
    expect(sanitizeMediaName(" \u202Eto\nne.txt ")).toBe("tone.txt");
    expect(sanitizeMediaName("../notes.pdf")).toBe("notes.pdf");
    expect(sanitizeMediaName("a/b.txt")).toBe("ab.txt");
    expect(sanitizeMediaName("tài-liệu.pdf")).toBe("tài-liệu.pdf");
    expect(sanitizeMediaName("📄 notes.pdf")).toBe("📄 notes.pdf");
    expect(sanitizeMediaName("à".repeat(300))).toHaveLength(255);
    expect(sanitizeMediaName("\n\u202E")).toBeUndefined();
  });
});

describe("file size formatting", () => {
  test("bytes, kilobytes, and megabytes use a 1024 base", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(999)).toBe("999 B");
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1.5 * 1024 * 1024)).toBe("1.5 MB");
    expect(formatBytes(25 * 1024 * 1024)).toBe("25 MB");
  });
});

describe("file commands", () => {
  test("insert from files and from a url, and one undo removes each insert", async () => {
    const uploaded = openFile();
    const beforeFiles = snapshot(uploaded.editor.children);
    expect(insertFileFromFiles.id).toBe("block.insert.file");
    expect(insertFileFromFiles.label).toBe("File");
    expect(
      runEditorCommand(uploaded.editor, insertFileFromFiles, [
        uploadSource(PDF_BYTES, " \u202Enotes\n.pdf ", "text/plain"),
      ]),
    ).toBe(true);
    await until(() => field(firstFile(uploaded.editor), "assetId") === "id-2");

    expect(field(firstFile(uploaded.editor), "mimeType")).toBe("application/pdf");
    expect(field(firstFile(uploaded.editor), "name")).toBe("notes.pdf");
    expect(field(firstFile(uploaded.editor), "byteSize")).toBe(PDF_BYTES.byteLength);
    expect(field(firstFile(uploaded.editor), "url")).toBeUndefined();
    expect(field(firstFile(uploaded.editor), "width")).toBeUndefined();
    expect(uploaded.editor.history.undos.length).toBe(1);
    uploaded.editor.tf.undo();
    expect(uploaded.editor.children).toEqual(beforeFiles);
    uploaded.detach();

    const linked = openFile();
    const beforeUrl = snapshot(linked.editor.children);
    expect(insertFileFromUrl.id).toBe("block.insert.file-url");
    expect(insertFileFromUrl.label).toBe("File from URL");
    expect(
      runEditorCommand(
        linked.editor,
        insertFileFromUrl,
        "https://files.example/docs/my%20notes.txt",
      ),
    ).toBe(true);
    expect(field(firstFile(linked.editor), "url")).toBe(
      "https://files.example/docs/my%20notes.txt",
    );
    expect(field(firstFile(linked.editor), "name")).toBe("my notes.txt");
    expect(linked.editor.history.undos.length).toBe(1);
    linked.editor.tf.undo();
    expect(linked.editor.children).toEqual(beforeUrl);

    runEditorCommand(linked.editor, insertFileFromUrl, "https://files.example/a/../notes.txt");
    expect(field(firstFile(linked.editor), "name")).toBe("notes.txt");
    linked.editor.tf.undo();
    runEditorCommand(
      linked.editor,
      insertFileFromUrl,
      "https://files.example/docs/%2E%2E%2Fsecret.txt",
    );
    expect(field(firstFile(linked.editor), "name")).toBe("secret.txt");
    linked.editor.tf.undo();

    const invalid = snapshot(linked.editor.children);
    runEditorCommand(linked.editor, insertFileFromUrl, "javascript:alert(1)");
    runEditorCommand(linked.editor, insertFileFromUrl, "blob:https://files.example/1");
    runEditorCommand(linked.editor, insertFileFromUrl, "data:text/plain,hi");
    expect(linked.editor.children).toEqual(invalid);
    linked.detach();
  });

  test("replace keeps the block id, and caption and remove each undo in one step", async () => {
    const { editor, detach } = openFile();
    runEditorCommand(editor, insertFileFromUrl, "https://files.example/notes.txt");
    const id = field(firstFile(editor), "id");
    runEditorCommand(editor, replaceFileFromFile, {
      id: String(id),
      file: uploadSource(Uint8Array.from([1, 2, 3, 4]), "notes.zip", "application/pdf"),
    });
    await until(() => field(firstFile(editor), "assetId") === "id-2");

    expect(field(firstFile(editor), "id")).toBe(id);
    expect(field(firstFile(editor), "url")).toBeUndefined();
    expect(field(firstFile(editor), "mimeType")).toBe("application/octet-stream");
    expect(field(firstFile(editor), "name")).toBe("notes.zip");
    editor.tf.undo();
    expect(field(firstFile(editor), "id")).toBe(id);
    expect(field(firstFile(editor), "url")).toBe("https://files.example/notes.txt");
    expect(field(firstFile(editor), "assetId")).toBeUndefined();
    detach();

    const captioned = createEditor([urlFile]);
    captioned.tf.setNodes({ caption: [{ text: "A new caption" }] }, { at: [0] });
    expect(field(captioned.children[0], "caption")).toEqual([{ text: "A new caption" }]);
    expect(field(captioned.children[0], "url")).toBe("https://files.example/notes.txt");
    expect(captioned.history.undos.length).toBe(1);
    captioned.tf.undo();
    expect(field(captioned.children[0], "caption")).toEqual([{ text: "A short note." }]);

    runEditorCommand(captioned, removeFile, "clip");
    expect(typesOf(captioned)).toEqual([]);
    expect(captioned.history.undos.length).toBe(1);
    captioned.tf.undo();
    expect(field(captioned.children[0], "id")).toBe("clip");
    expect(field(captioned.children[0], "url")).toBe("https://files.example/notes.txt");
  });

  test("read-only refuses file commands", () => {
    const editor = createEditor([paragraph("", "empty")]);
    editor.tf.select(caret([0, 0], 0));
    const before = snapshot(editor.children);
    expect(
      runEditorCommand(editor, insertFileFromUrl, "https://files.example/notes.txt", {
        readOnly: true,
      }),
    ).toBe(false);
    expect(
      runEditorCommand(
        editor,
        insertFileFromFiles,
        [uploadSource(PDF_BYTES, "notes.pdf", "application/pdf")],
        {
          readOnly: true,
        },
      ),
    ).toBe(false);
    expect(editor.children).toEqual(before);

    editor.dom.readOnly = true;
    runEditorCommand(editor, insertFileFromUrl, "https://files.example/notes.txt");
    runEditorCommand(editor, replaceFileFromFile, {
      id: "clip",
      file: uploadSource(PDF_BYTES, "notes.pdf", "application/pdf"),
    });
    runEditorCommand(editor, removeFile, "clip");
    expect(editor.children).toEqual(before);
  });

  test("turn into and clear formatting leave a selected file block as a file", () => {
    const editor = createEditor([paragraph("Alpha", "a"), urlFile, paragraph("Beta", "b")]);
    selectBlock(editor, 1);
    const before = snapshot(editor.children[1]);
    runEditorCommand(editor, turnIntoHeading1, undefined);
    runEditorCommand(editor, turnIntoBlockquote, undefined);
    runEditorCommand(editor, setTextAlign, "center");
    runEditorCommand(editor, setLineHeight, 2);
    runEditorCommand(editor, clearFormatting, undefined);
    expect(editor.children[1]).toEqual(before);
    expect(getBlockType(editor)).toBe("file");
  });
});

describe("file upload", () => {
  test("a pdf is sniffed, a declared mime is ignored, and an oversize file names the 25 MB limit", async () => {
    const pdf = openFile();
    runEditorCommand(pdf.editor, insertFileFromFiles, [
      uploadSource(PDF_BYTES, "notes.txt", "text/plain"),
    ]);
    await until(() => field(firstFile(pdf.editor), "assetId") === "id-2");
    expect(field(firstFile(pdf.editor), "mimeType")).toBe("application/pdf");
    expect(field(firstFile(pdf.editor), "name")).toBe("notes.txt");
    expect(field(firstFile(pdf.editor), "byteSize")).toBe(PDF_BYTES.byteLength);
    pdf.detach();

    const plain = openFile();
    runEditorCommand(plain.editor, insertFileFromFiles, [
      uploadSource(Uint8Array.from([1, 2, 3, 4]), "notes.pdf", "application/pdf"),
    ]);
    await until(() => field(firstFile(plain.editor), "assetId") === "id-2");
    expect(field(firstFile(plain.editor), "mimeType")).toBe("application/octet-stream");
    plain.detach();

    const oversize = openFile();
    runEditorCommand(oversize.editor, insertFileFromFiles, [
      uploadSource(Uint8Array.from([1]), "big.zip", "application/zip", ASSET_LIMITS.file + 1),
    ]);
    const oversizeId = String(field(firstFile(oversize.editor), "id"));
    await until(() => fileUploadState(oversize.editor, oversizeId)?.status === "failed");
    expect(fileUploadState(oversize.editor, oversizeId)?.error).toContain("25 MB");
    expect(fileUploadState(oversize.editor, oversizeId)?.error).toContain("limit");
    expect(fileUploadState(oversize.editor, oversizeId)?.error).toContain("file");
    expect(field(firstFile(oversize.editor), "assetId")).toBeUndefined();
    oversize.detach();
  });

  test("cancel keeps the file for retry, and deleting during upload writes nothing", async () => {
    const canceled = openFile();
    canceled.memory.hold();
    runEditorCommand(canceled.editor, insertFileFromFiles, [
      uploadSource(Uint8Array.from([1, 2, 3, 4]), "notes.txt", "text/plain"),
    ]);
    const id = String(field(firstFile(canceled.editor), "id"));
    await until(() => canceled.memory.puts() === 1);
    holdFileUpload(canceled.editor, id);
    canceled.memory.release();
    await settle();

    expect(fileUploadState(canceled.editor, id)?.status).toBe("failed");
    expect(fileUploadState(canceled.editor, id)?.error).toBe("Upload canceled.");
    expect(field(firstFile(canceled.editor), "assetId")).toBeUndefined();
    expect(typesOf(canceled.editor)).toContain("file");

    retryFileUpload(canceled.editor, id);
    await until(() => field(firstFile(canceled.editor), "assetId") === "id-3");
    expect(field(firstFile(canceled.editor), "mimeType")).toBe("application/octet-stream");
    expect(field(firstFile(canceled.editor), "name")).toBe("notes.txt");
    canceled.detach();

    const removed = openFile([paragraph("Keep", "keep")]);
    removed.editor.tf.select(caret([0, 0], 4));
    removed.memory.hold();
    runEditorCommand(removed.editor, insertFileFromFiles, [
      uploadSource(Uint8Array.from([1, 2, 3, 4]), "notes.txt", "text/plain"),
    ]);
    await until(() => removed.memory.puts() === 1);
    const removedId = String(field(firstFile(removed.editor), "id"));
    const filePath = removed.editor.children.findIndex((block) => block.type === KEYS.file);
    removed.editor.tf.removeNodes({ at: [filePath], voids: true });
    removed.memory.release();
    await settle();

    expect(typesOf(removed.editor)).not.toContain("file");
    expect(await removed.memory.store.list()).toEqual([]);
    expect(JSON.stringify(removed.editor.children)).not.toContain(removedId);
    removed.detach();
  });

  test("the same file twice creates two assets, and deleting one keeps the other", async () => {
    const duplicated = openFile();
    const source = uploadSource(Uint8Array.from([9, 8, 7, 6]), "notes.txt", "text/plain");
    runEditorCommand(duplicated.editor, insertFileFromFiles, [source, source]);
    await until(() => {
      const ids = duplicated.editor.children
        .filter((block) => block.type === KEYS.file)
        .map((block) => field(block, "assetId"));
      return ids.length === 2 && ids.every((id) => typeof id === "string" && id.length > 0);
    });
    const copies = duplicated.editor.children.filter((block) => block.type === KEYS.file);
    const firstAsset = String(field(copies[0], "assetId"));
    const secondAsset = String(field(copies[1], "assetId"));
    expect(firstAsset).not.toBe(secondAsset);
    expect((await duplicated.memory.store.list()).map((record) => record.id).sort()).toEqual(
      [firstAsset, secondAsset].sort(),
    );
    const droppedIndex = duplicated.editor.children.findIndex(
      (block) => field(block, "assetId") === firstAsset,
    );
    duplicated.editor.tf.removeNodes({ at: [droppedIndex], voids: true });
    const dropped = firstAsset;
    const kept = secondAsset;
    const deleted = await cleanupUnreferencedAssets(
      duplicated.memory.store,
      collectAssetIds(contentOf(duplicated.editor)),
      { now: Date.parse("2026-10-08T00:00:00.000Z") + 1, graceMs: 0 },
    );
    expect(deleted).toEqual([dropped]);
    expect((await duplicated.memory.store.list()).map((record) => record.id)).toEqual([kept]);
    duplicated.detach();
  });

  test("two blocks can share one asset, and cleanup removes it only after both are gone", async () => {
    const record: AssetRecord = {
      id: "shared",
      kind: "file",
      name: "notes.txt",
      mimeType: "application/octet-stream",
      byteSize: 4,
      createdAt: "2020-01-01T00:00:00.000Z",
    };
    const memory = createMemoryAssetStore([record]);
    const editor = createEditor([
      fileNode("one", {
        assetId: "shared",
        name: "notes.txt",
        mimeType: "application/octet-stream",
        byteSize: 4,
      }),
      fileNode("two", {
        assetId: "shared",
        name: "notes.txt",
        mimeType: "application/octet-stream",
        byteSize: 4,
      }),
    ]);
    editor.tf.removeNodes({ at: [0], voids: true });
    const kept = await cleanupUnreferencedAssets(memory.store, collectAssetIds(contentOf(editor)), {
      now: Date.now(),
    });
    expect(kept).toEqual([]);
    expect(await memory.store.get("shared")).not.toBeNull();

    editor.tf.removeNodes({ at: [0], voids: true });
    const removed = await cleanupUnreferencedAssets(
      memory.store,
      collectAssetIds(contentOf(editor)),
      { now: Date.now() },
    );
    expect(removed).toEqual(["shared"]);
    expect(await memory.store.get("shared")).toBeNull();
  });

  test("a png whose bytes are not an image stays an image error and does not become a file", async () => {
    const editor = createEditor([paragraph("", "empty")]);
    editor.tf.select(caret([0, 0], 0));
    const memory = createMemoryAssetStore();
    const detach = attachImageRuntime(editor, memory.store, {
      createId: () => "image-id",
      now: () => "2026-10-08T00:00:00.000Z",
    });
    editor.tf.insertData(
      withFiles([
        uploadSource(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]), "photo.png", "image/png"),
      ]),
    );
    const image = editor.children.find((block) => block.type === KEYS.img);
    const id = String(field(image, "id"));
    await until(() => imageUploadState(editor, id)?.status === "failed");
    expect(typesOf(editor)).toContain("img");
    expect(typesOf(editor)).not.toContain("file");
    expect(imageUploadState(editor, id)?.error).toContain("not a PNG");
    detach();
  });
});

describe("file paste and drop", () => {
  test("a non-media file becomes a file block and an anchor with download stays text", () => {
    const editor = createEditor([paragraph("", "empty")]);
    editor.tf.select(caret([0, 0], 0));
    editor.tf.insertData(
      withFiles([uploadSource(Uint8Array.from([1, 2, 3]), "notes.zip", "application/zip")]),
    );
    expect(typesOf(editor)).toContain("file");
    expect(field(firstFile(editor), "name")).toBeUndefined();
    expect(pasteRepairsOf(editor)).toEqual([]);

    const linked = createEditor([paragraph("", "empty")]);
    linked.tf.select(caret([0, 0], 0));
    const anchor = new DataTransfer();
    anchor.setData(
      "text/html",
      '<a href="https://files.example/notes.zip" download="notes.zip">notes.zip</a>',
    );
    linked.tf.insertData(anchor);
    expect(typesOf(linked)).not.toContain("file");
    expect(texts(linked).join("")).toContain("notes.zip");
  });

  test("a mixed paste inserts the image and two files in order, in one undo", () => {
    const editor = createEditor([paragraph("", "empty")]);
    editor.tf.select(caret([0, 0], 0));
    editor.tf.insertData(
      withFiles([
        uploadSource(PNG_BYTES, "photo.png", "image/png"),
        uploadSource(Uint8Array.from([0x50, 0x4b, 0x03, 0x04]), "notes.zip", "application/zip"),
        uploadSource(Uint8Array.from([104, 105]), "notes.txt", "text/plain"),
      ]),
    );

    expect(typesOf(editor)).toEqual(["img", "file", "file", "p"]);
    expect(editor.history.undos.length).toBe(1);
    editor.tf.undo();
    expect(typesOf(editor)).toEqual(["p"]);
    expect(texts(editor)).toEqual([""]);
  });

  test("a mixed paste between paragraphs stays in one group and one undo", () => {
    const editor = createEditor([
      paragraph("Alpha", "a"),
      paragraph("Beta", "b"),
      paragraph("Gamma", "c"),
    ]);
    editor.tf.select(caret([1, 0], 1));
    editor.tf.insertData(
      withFiles([
        uploadSource(PNG_BYTES, "photo.png", "image/png"),
        uploadSource(Uint8Array.from([0x50, 0x4b, 0x03, 0x04]), "notes.zip", "application/zip"),
        uploadSource(Uint8Array.from([104, 105]), "notes.txt", "text/plain"),
      ]),
    );

    expect(typesOf(editor)).toEqual(["p", "p", "img", "file", "file", "p"]);
    expect(blockIds(editor)[0]).toBe("a");
    expect(blockIds(editor)[1]).toBe("b");
    expect(blockIds(editor).at(-1)).toBe("c");
    expect(texts(editor).filter((text) => text.length > 0)).toEqual(["Alpha", "Beta", "Gamma"]);
    expect(editor.history.undos.length).toBe(1);
    editor.tf.undo();
    expect(typesOf(editor)).toEqual(["p", "p", "p"]);
    expect(blockIds(editor)).toEqual(["a", "b", "c"]);
  });

  test("a copied file keeps its asset and gets a new block id", () => {
    const editor = createEditor([
      fileNode("clip", {
        assetId: "asset-9",
        mimeType: "application/pdf",
        name: "notes.pdf",
        byteSize: 8,
      }),
      paragraph("", "empty"),
    ]);
    editor.tf.select(caret([1, 0], 0));
    editor.tf.insertFragment([
      fileNode("clip", {
        assetId: "asset-9",
        url: "https://files.example/notes.pdf",
        mimeType: "application/pdf",
        name: "notes.pdf",
        byteSize: 8,
      }),
    ]);

    const copies = editor.children.filter((block) => block.type === KEYS.file);
    expect(copies).toHaveLength(2);
    expect(field(copies[0], "id")).toBe("clip");
    expect(field(copies[1], "assetId")).toBe("asset-9");
    expect(field(copies[1], "url")).toBeUndefined();
    expect(field(copies[1], "id")).not.toBe("clip");
    expect(field(copies[1], "name")).toBe("notes.pdf");
    expect(field(copies[1], "byteSize")).toBe(8);
    expect(pasteRepairsOf(editor).map((repair) => repair.message)).toContain(FILE_BOTH_SOURCES);
  });

  test("an unsafe url is dropped, and a drop uses the file route", () => {
    const unsafe = createEditor([paragraph("", "empty")]);
    unsafe.tf.select(caret([0, 0], 0));
    unsafe.tf.insertFragment([fileNode("bad", { url: "javascript:alert(1)", name: "notes.txt" })]);
    expect(typesOf(unsafe)).not.toContain("file");
    expect(pasteRepairsOf(unsafe).map((repair) => repair.message)).toContain(FILE_UNSAFE_URL);

    const editor = createEditor([paragraph("Alpha", "a")]);
    editor.tf.select(caret([0, 0], 0));
    let prevented = false;
    const dropped: ImageDropEvent = {
      clientX: 0,
      clientY: 0,
      preventDefault: () => {
        prevented = true;
      },
      dataTransfer: withFiles([
        uploadSource(Uint8Array.from([1, 2, 3]), "notes.zip", "application/zip"),
      ]),
      view: null,
    };
    expect(handleImageDrop(editor, dropped)).toBe(false);
    expect(prevented).toBe(true);
    expect(typesOf(editor)).toEqual(["p", "file", "p"]);
  });
});

describe("file rendering", () => {
  test("a long name wraps, download has rel, and the card has no iframe or object", () => {
    const name = `${"tài-liệu-".repeat(20)}pdf`;
    const html = renderToStaticMarkup(
      <EditorSurface
        editor={createPlateEditor({
          plugins: createEditorPlugins(),
          value: [
            fileNode("clip", {
              url: "https://files.example/notes.txt",
              name,
              mimeType: "application/octet-stream",
              byteSize: 1536,
            }),
          ],
        })}
        readOnly={false}
        placeholder=""
        className="editor"
      />,
    );

    expect(html).not.toContain("break-words");
    expect(html).toContain("overflow-wrap:anywhere");
    expect(html).toContain(name);
    expect(html).toContain('download="');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html.toLowerCase()).not.toContain("<iframe");
    expect(html.toLowerCase()).not.toContain("<object");
    expect(html).toContain("1.5 KB");
    expect(html).toContain("pdf");
  });

  test("read-only keeps download and open, and hides remove, replace, and the caption control", () => {
    const html = renderToStaticMarkup(
      <EditorSurface
        editor={createPlateEditor({
          plugins: createEditorPlugins(),
          value: [urlFile],
        })}
        readOnly
        placeholder=""
        className="editor"
      />,
    );

    expect(html).toContain("Download");
    expect(html).toContain("Open");
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain("A short note.");
    expect(html).not.toContain("Replace file");
    expect(html).not.toContain('aria-label="Remove"');
    expect(html).not.toContain('aria-label="Caption"');
    expect(html).not.toContain("<textarea");
  });

  test("a missing asset says the file was not found, and a denied adapter has no link", async () => {
    const missing = await mountFile(
      [
        fileNode("clip", {
          assetId: "gone",
          name: "notes.txt",
          mimeType: "application/octet-stream",
          byteSize: 4,
        }),
      ],
      { store: createMemoryAssetStore().store },
    );
    await act(async () => {
      await settle();
    });
    expect(missing.host.textContent).toContain(FILE_NOT_FOUND);
    expect(missing.host.textContent).toContain("Remove");
    expect(missing.host.querySelector("a")).toBeNull();
    await missing.cleanup();

    const memory = createMemoryAssetStore();
    const deniedStore: AssetStore = {
      put: (record, blob) => memory.store.put(record, blob),
      get: (id) => memory.store.get(id),
      delete: (id) => memory.store.delete(id),
      list: () => memory.store.list(),
      resolveUrl: () => Promise.reject(new Error("denied")),
    };
    const denied = await mountFile(
      [
        fileNode("clip", {
          assetId: "private",
          name: "notes.txt",
          mimeType: "application/octet-stream",
          byteSize: 4,
        }),
      ],
      { store: deniedStore },
    );
    await act(async () => {
      await settle();
    });
    expect(denied.host.textContent).toContain(FILE_NO_ACCESS);
    expect(denied.host.querySelector("a")).toBeNull();
    await denied.cleanup();
  });

  test("an expired signed url refreshes once, and a second expired url removes the link", async () => {
    const memory = createMemoryAssetStore();
    let calls = 0;
    const store: AssetStore = {
      put: (record, blob) => memory.store.put(record, blob),
      get: (id) => memory.store.get(id),
      delete: (id) => memory.store.delete(id),
      list: () => memory.store.list(),
      resolveUrl: () => {
        calls += 1;
        if (calls === 1) {
          return Promise.resolve({
            url: "https://cdn.example/one.bin",
            expiresAt: Date.now() - 1000,
          });
        }
        return Promise.resolve({
          url: "https://cdn.example/two.bin",
          expiresAt: Date.now() + 60_000,
        });
      },
    };
    const refreshed = await mountFile(
      [
        fileNode("clip", {
          assetId: "asset-1",
          name: "notes.bin",
          mimeType: "application/octet-stream",
          byteSize: 4,
        }),
      ],
      { store },
    );
    await act(async () => {
      await until(() => calls >= 2);
      await settle();
    });
    const download = refreshed.host.querySelector("a[download]");
    expect(download?.getAttribute("href")).toBe("https://cdn.example/two.bin");
    expect(download?.getAttribute("download")).toBe("notes.bin");
    expect(download?.getAttribute("rel")).toBe("noopener noreferrer");
    expect(calls).toBe(2);
    await refreshed.cleanup();

    let expiredCalls = 0;
    const expiredStore: AssetStore = {
      put: (record, blob) => memory.store.put(record, blob),
      get: (id) => memory.store.get(id),
      delete: (id) => memory.store.delete(id),
      list: () => memory.store.list(),
      resolveUrl: () => {
        expiredCalls += 1;
        return Promise.resolve({
          url: `https://cdn.example/${String(expiredCalls)}.bin`,
          expiresAt: Date.now() - 1000,
        });
      },
    };
    const expired = await mountFile(
      [
        fileNode("clip", {
          assetId: "asset-2",
          name: "notes.bin",
          mimeType: "application/octet-stream",
          byteSize: 4,
        }),
      ],
      { store: expiredStore },
    );
    await act(async () => {
      await until(() => expired.host.textContent?.includes(FILE_NO_ACCESS) === true);
      await settle();
    });
    expect(expiredCalls).toBe(2);
    expect(expired.host.querySelector("a")).toBeNull();
    await expired.cleanup();
  });

  test("an indexeddb object url can be downloaded and is not opened as a page", async () => {
    const record: AssetRecord = {
      id: "local",
      kind: "file",
      name: "notes.txt",
      mimeType: "application/octet-stream",
      byteSize: 4,
      createdAt: "2026-10-08T00:00:00.000Z",
    };
    const memory = createMemoryAssetStore([record]);
    const blob = byteBlob(Uint8Array.from([1, 2, 3, 4]), "application/octet-stream");
    await memory.store.put(record, blob);
    const mounted = await mountFile(
      [
        fileNode("clip", {
          assetId: "local",
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
    const anchors = mounted.host.querySelectorAll("a");
    expect(anchors).toHaveLength(1);
    expect(anchors[0]?.getAttribute("download")).toBe("notes.txt");
    expect(anchors[0]?.getAttribute("rel")).toBe("noopener noreferrer");
    expect(anchors[0]?.getAttribute("href")?.startsWith("blob:")).toBe(true);
    expect(anchors[0]?.textContent).toBe("Download");
    expect(mounted.host.querySelector("iframe, object")).toBeNull();
    await mounted.cleanup();
  });
});

describe("file keyboard and containers", () => {
  test("backspace selects a file and a second backspace deletes it, and enter inserts after it", () => {
    const editor = createEditor([paragraph("Hello", "a"), urlFile, paragraph("World", "b")]);
    editor.tf.select(caret([2, 0], 0));
    editor.tf.deleteBackward();
    expect(blockIds(editor)).toEqual(["a", "clip", "b"]);
    expect(editor.selection?.anchor.path[0]).toBe(1);
    editor.tf.deleteBackward();
    expect(typesOf(editor)).toEqual(["p", "p"]);
    expect(texts(editor)).toEqual(["Hello", "World"]);

    const entered = createEditor([paragraph("Hello", "a"), urlFile, paragraph("World", "b")]);
    selectBlock(entered, 1);
    entered.tf.insertBreak();
    expect(typesOf(entered)).toEqual(["p", "file", "p", "p"]);
    expect(blockIds(entered)[1]).toBe("clip");
    expect(entered.selection?.anchor.path[0]).toBe(2);
  });

  test("caption editing leaves the source untouched", () => {
    const editor = createEditor([paragraph("Hello", "a"), urlFile, paragraph("World", "b")]);
    editor.tf.select(editor.api.start([1]) ?? caret([1, 0], 0));
    editor.tf.moveLine({ reverse: false });
    expect(editor.getOption(CaptionPlugin, "focusEndPath")).toEqual([1]);
    editor.tf.setNodes({ caption: [{ text: "Renamed" }] }, { at: [1] });
    expect(field(editor.children[1], "caption")).toEqual([{ text: "Renamed" }]);
    expect(field(editor.children[1], "url")).toBe("https://files.example/notes.txt");
  });

  test("a file stays inside a toggle, splits a quote and a callout, and lifts out of a table cell", () => {
    const kept = createEditor([
      toggle("toggle-1", [
        paragraph("Label", "label"),
        fileNode("clip", { url: "https://files.example/a.txt", name: "a.txt" }),
      ]),
    ]);
    kept.tf.normalize({ force: true });
    expect(typesOf(kept)).toEqual(["toggle"]);
    expect(childTypes(kept.children[0])).toEqual(["p", "file"]);
    expect(childIds(kept.children[0])).toEqual(["label", "clip"]);

    const split = createEditor([
      quote("quote-1", [
        paragraph("Before", "before"),
        fileNode("clip", {
          url: "https://files.example/a.txt",
          name: "a.txt",
          mimeType: "application/octet-stream",
        }),
        paragraph("After", "after"),
      ]),
      callout("callout-1", [
        paragraph("Note", "note"),
        fileNode("icon", { assetId: "asset-1", name: "a.txt" }),
        paragraph("Tail", "tail"),
      ]),
    ]);
    split.tf.normalize({ force: true });
    expect(typesOf(split)).toEqual([
      "blockquote",
      "file",
      "blockquote",
      "callout",
      "file",
      "callout",
    ]);
    expect(field(split.children[1], "id")).toBe("clip");
    expect(field(split.children[1], "mimeType")).toBe("application/octet-stream");
    expect(field(split.children[4], "assetId")).toBe("asset-1");

    const lifted = createEditor([
      tableNode("table-1", [
        row("row-1", [
          cell("td", "cell-1", [
            paragraph("Stay", "stay"),
            fileNode("clip", { url: "https://files.example/a.txt", name: "a.txt" }),
          ]),
        ]),
      ]),
      paragraph("After", "after"),
    ]);
    lifted.tf.normalize({ force: true });
    expect(typesOf(lifted)).toEqual(["table", "file", "p"]);
    expect(field(lifted.children[1], "id")).toBe("clip");
    expect(field(lifted.children[1], "url")).toBe("https://files.example/a.txt");
    const table = lifted.children[0];
    const body = isRecord(table) && Array.isArray(table.children) ? table.children[0] : undefined;
    const liftedCell =
      isRecord(body) && Array.isArray(body.children) ? body.children[0] : undefined;
    expect(childTypes(liftedCell)).toEqual(["p"]);
    expect(childIds(liftedCell)).toEqual(["stay"]);
  });
});
