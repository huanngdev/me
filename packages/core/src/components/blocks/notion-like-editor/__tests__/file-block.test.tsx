import { describe, expect, test } from "bun:test";
import { KEYS, type SlateEditor, type TElement } from "platejs";
import { createPlateEditor } from "platejs/react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";

import { EditorSurface } from "../components/editor/editor-surface";
import { runEditorCommand } from "../lib/commands/editor-commands";
import { allowedChildTypes, EDITOR_ELEMENT_RULES } from "../lib/document/editor-document-schema";
import { createEditorDocument } from "../lib/document/editor-document";
import { parseEditorDocument, type ParseResult } from "../lib/document/editor-document-validate";
import type { EditorValue } from "../lib/document/editor-value";
import type {
  FileUploadAdapter,
  UploadedFile,
  FileUploadOptions,
} from "../lib/features/editor-file-upload";
import {
  FILE_KEY,
  FILE_URL_REMOVED,
  fileElement,
  fileExtension,
  fileNameFromUrl,
  displayFileName,
} from "../lib/features/editor-file";
import {
  clearFileSource,
  insertFile,
  insertFiles,
  removeFile,
  renameFile,
  setFileSource,
} from "../lib/features/editor-file-commands";
import { fileIconKind } from "../lib/features/editor-file-icon";
import { formatFileSize } from "../lib/features/editor-file-url";
import { IMAGE_KEY } from "../lib/features/editor-image";
import { MEDIA_FILE_LIMIT_MESSAGE } from "../lib/features/editor-media";
import { MEDIA_NOT_SUPPORTED, pasteRepairsOf } from "../lib/paste/editor-paste";
import {
  mediaActionsBlockId,
  mediaSourceBlockId,
  onMediaUiKeyDown,
  openMediaSource,
} from "../lib/plugins/editor-media-ui";
import { chooseSlashItem, slashMenuItems } from "../lib/plugins/editor-slash";
import { createEditorPlugins } from "../lib/plugins/editor-plugins";
import { NotionLikeEditorStatic } from "../notion-like-editor-static";
import { caret, createEditor, expectOk, expectUnsupported, field, isRecord } from "./test-utils";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

if (!("ResizeObserver" in globalThis)) {
  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  globalThis.ResizeObserver = ResizeObserverStub;
}

const LINK = "https://cdn.example.com/a.pdf";

function paragraph(text: string, id: string): TElement {
  return { type: KEYS.p, id, children: [{ text }] };
}

function file(id: string, extra: Record<string, unknown> = {}): TElement {
  return { type: FILE_KEY, id, children: [{ text: "" }], ...extra };
}

function fileNode(editor: SlateEditor, id: string): Record<string, unknown> {
  const node = editor.children.find((child) => field(child, "id") === id);
  if (!isRecord(node)) {
    throw new Error(`No block ${id}.`);
  }
  return node;
}

function types(editor: SlateEditor): unknown[] {
  return editor.children.map((node) => field(node, "type"));
}

// Keys sorted, so an undo that restores the same content in another key order still matches.
function canonical(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonical(item)).join(",")}]`;
  }
  if (isRecord(value)) {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function snapshot(editor: SlateEditor): string {
  return canonical(editor.children);
}

// Each mutating command is run, then undone once. The document must match the state before it.
function expectOneUndo(editor: SlateEditor, run: () => boolean): void {
  const before = snapshot(editor);
  const undos = editor.history.undos.length;
  expect(run()).toBe(true);
  expect(editor.history.undos.length).toBe(undos + 1);
  editor.tf.undo();
  expect(snapshot(editor)).toBe(before);
}

function parse(content: unknown[]): ParseResult {
  return parseEditorDocument(createEditorDocument("doc", content as EditorValue));
}

function repairMessages(result: ParseResult): string[] {
  return result.status === "ok" ? result.repairs.map((repair) => repair.message) : [];
}

describe("file schema", () => {
  test("a valid file round-trips unchanged, with any mime type", () => {
    const content = [
      paragraph("Before", "p1"),
      file("f1", { url: LINK, name: "a.pdf", size: 2048, mime: "application/pdf" }),
      file("f2", { url: "/blocks/file-demo.txt", mime: "text/plain" }),
      file("f3", { mime: "image/png" }),
      file("f4"),
    ];
    const result = expectOk(parse(content));
    expect(result.repairs).toEqual([]);
    expect(result.document.content).toEqual(content);
  });

  test("a file takes no width, alignment or caption, which are unsupported attributes", () => {
    expectUnsupported(parse([file("f1", { url: LINK, width: 50 })]));
    expectUnsupported(parse([file("f1", { url: LINK, caption: "Nope" })]));
  });

  test("a url that is not storable is repaired to an empty placeholder", () => {
    const result = expectOk(parse([file("f1", { url: "javascript:alert(1)", name: "a.pdf" })]));
    expect(repairMessages(result)).toEqual([FILE_URL_REMOVED]);
    expect(field(result.document.content[0], "url")).toBeUndefined();
  });

  test("a blob url is repaired to an empty placeholder, since it only exists in one tab", () => {
    const result = expectOk(parse([file("f1", { url: "blob:https://x.example/abc" })]));
    expect(repairMessages(result)).toEqual([FILE_URL_REMOVED]);
    expect(field(result.document.content[0], "url")).toBeUndefined();
  });

  test("an invalid optional attribute is dropped with one repair, and the file stays", () => {
    const result = expectOk(parse([file("f1", { url: LINK, size: -1, mime: "not a mime" })]));
    expect(repairMessages(result).length).toBe(2);
    expect(field(result.document.content[0], "url")).toBe(LINK);
    expect(field(result.document.content[0], "size")).toBeUndefined();
    expect(field(result.document.content[0], "mime")).toBeUndefined();
  });

  test("a file is a void block, and the containers that take an image take a file", () => {
    const rule = EDITOR_ELEMENT_RULES.find((item) => item.type === FILE_KEY);
    expect(rule?.isVoid).toBe(true);
    expect(allowedChildTypes(KEYS.toggle)).toContain(FILE_KEY);
    expect(allowedChildTypes(KEYS.column)).toContain(FILE_KEY);
  });
});

describe("file commands", () => {
  test("insertFile places one empty file block, and undo removes it", () => {
    const editor = createEditor([paragraph("Stay", "p1")]);
    editor.tf.select(caret([0, 0], 4));
    expectOneUndo(editor, () => runEditorCommand(editor, insertFile, { id: "f1" }));
    expect(types(editor)).toEqual([KEYS.p]);
    runEditorCommand(editor, insertFile, { id: "f1" });
    expect(types(editor)).toEqual([KEYS.p, FILE_KEY]);
    expect(field(fileNode(editor, "f1"), "url")).toBeUndefined();
  });

  test("insertFile refuses an empty, long, or used id", () => {
    const editor = createEditor([paragraph("Stay", "p1")]);
    editor.tf.select(caret([0, 0], 4));
    expect(runEditorCommand(editor, insertFile, { id: "" })).toBe(false);
    expect(runEditorCommand(editor, insertFile, { id: "p1" })).toBe(false);
    expect(runEditorCommand(editor, insertFile, { id: "x".repeat(129) })).toBe(false);
    expect(types(editor)).toEqual([KEYS.p]);
  });

  test("insertFiles places several blocks in order as one undo step, and refuses duplicate ids", () => {
    const editor = createEditor([paragraph("Stay", "p1")]);
    editor.tf.select(caret([0, 0], 4));
    expect(runEditorCommand(editor, insertFiles, { ids: ["a", "a"] })).toBe(false);
    expect(runEditorCommand(editor, insertFiles, { ids: [] })).toBe(false);
    expectOneUndo(editor, () => runEditorCommand(editor, insertFiles, { ids: ["a", "b", "c"] }));
    runEditorCommand(editor, insertFiles, { ids: ["a", "b", "c"] });
    expect(editor.children.map((node) => field(node, "id"))).toEqual(["p1", "a", "b", "c"]);
  });

  test("setFileSource stores an upload result, and one undo restores the empty block", () => {
    const editor = createEditor([paragraph("Stay", "p1"), file("f1")]);
    expectOneUndo(editor, () =>
      runEditorCommand(editor, setFileSource, {
        id: "f1",
        file: { url: LINK, name: "a.pdf", size: 3, mime: "application/pdf" },
      }),
    );
    runEditorCommand(editor, setFileSource, {
      id: "f1",
      file: { url: LINK, name: "a.pdf", size: 3, mime: "application/pdf" },
    });
    expect(fileNode(editor, "f1")).toMatchObject({
      url: LINK,
      name: "a.pdf",
      size: 3,
      mime: "application/pdf",
    });
  });

  test("setFileSource with only a url is a link, named from the url, and http or https only", () => {
    const editor = createEditor([paragraph("Stay", "p1"), file("f1")]);
    expect(
      runEditorCommand(editor, setFileSource, { id: "f1", file: { url: "ftp://x.example/a.pdf" } }),
    ).toBe(false);
    expect(
      runEditorCommand(editor, setFileSource, { id: "f1", file: { url: "javascript:alert(1)" } }),
    ).toBe(false);
    expect(
      runEditorCommand(editor, setFileSource, {
        id: "f1",
        file: { url: "https://example.com/docs/My%20Report.pdf" },
      }),
    ).toBe(true);
    expect(fileNode(editor, "f1")).toMatchObject({
      url: "https://example.com/docs/My%20Report.pdf",
      name: "My Report.pdf",
    });
    expect(fileNode(editor, "f1").size).toBeUndefined();
    expect(fileNode(editor, "f1").mime).toBeUndefined();
  });

  test("a link with no path is named after its host", () => {
    const editor = createEditor([paragraph("Stay", "p1"), file("f1")]);
    runEditorCommand(editor, setFileSource, { id: "f1", file: { url: "https://example.com/" } });
    expect(field(fileNode(editor, "f1"), "name")).toBe("example.com");
  });

  test("a replacement drops the size and mime of the old file that the new one does not have", () => {
    const editor = createEditor([
      paragraph("Stay", "p1"),
      file("f1", { url: LINK, name: "a.pdf", size: 10, mime: "application/pdf" }),
    ]);
    expectOneUndo(editor, () =>
      runEditorCommand(editor, setFileSource, {
        id: "f1",
        file: { url: "https://cdn.example.com/b.txt" },
      }),
    );
    runEditorCommand(editor, setFileSource, {
      id: "f1",
      file: { url: "https://cdn.example.com/b.txt" },
    });
    expect(fileNode(editor, "f1").size).toBeUndefined();
    expect(fileNode(editor, "f1").mime).toBeUndefined();
    expect(field(fileNode(editor, "f1"), "name")).toBe("b.txt");
  });

  test("renameFile cleans the name, refuses an empty one, and needs a url", () => {
    const editor = createEditor([
      paragraph("Stay", "p1"),
      file("f1", { url: LINK, name: "a.pdf" }),
      file("f2"),
    ]);
    expect(runEditorCommand(editor, renameFile, { id: "f1", name: "   " })).toBe(false);
    expect(runEditorCommand(editor, renameFile, { id: "f2", name: "b.pdf" })).toBe(false);
    expectOneUndo(editor, () =>
      runEditorCommand(editor, renameFile, { id: "f1", name: "  my   report‮.pdf  " }),
    );
    runEditorCommand(editor, renameFile, { id: "f1", name: "  my   report.pdf  " });
    expect(field(fileNode(editor, "f1"), "name")).toBe("my report.pdf");
    runEditorCommand(editor, renameFile, { id: "f1", name: "x".repeat(300) });
    expect(String(field(fileNode(editor, "f1"), "name")).length).toBe(255);
  });

  test("clearFileSource removes the url and the file fields, and keeps the block", () => {
    const editor = createEditor([
      paragraph("Stay", "p1"),
      file("f1", { url: LINK, name: "a.pdf", size: 3, mime: "application/pdf" }),
    ]);
    expectOneUndo(editor, () => runEditorCommand(editor, clearFileSource, { id: "f1" }));
    runEditorCommand(editor, clearFileSource, { id: "f1" });
    expect(fileNode(editor, "f1")).toMatchObject({ type: FILE_KEY });
    expect(field(fileNode(editor, "f1"), "url")).toBeUndefined();
    expect(field(fileNode(editor, "f1"), "name")).toBeUndefined();
  });

  test("removeFile deletes the block in one undo step, and an empty document gets a paragraph", () => {
    const editor = createEditor([paragraph("Stay", "p1"), file("f1", { url: LINK })]);
    expectOneUndo(editor, () => runEditorCommand(editor, removeFile, { id: "f1" }));
    runEditorCommand(editor, removeFile, { id: "f1" });
    expect(types(editor)).toEqual([KEYS.p]);

    const only = createEditor([file("f1", { url: LINK })]);
    runEditorCommand(only, removeFile, { id: "f1" });
    expect(types(only)).toEqual([KEYS.p]);
  });

  test("a command refuses a block that is not a file", () => {
    const editor = createEditor([
      paragraph("Stay", "p1"),
      { type: IMAGE_KEY, id: "img", url: LINK, children: [{ text: "" }] },
    ]);
    expect(runEditorCommand(editor, removeFile, { id: "img" })).toBe(false);
    expect(runEditorCommand(editor, renameFile, { id: "img", name: "x.png" })).toBe(false);
  });
});

describe("file helpers", () => {
  test("the icon follows the mime type first, then the extension", () => {
    expect(fileIconKind("application/pdf", "a.pdf")).toBe("text");
    expect(fileIconKind("text/plain", undefined)).toBe("text");
    expect(fileIconKind("image/png", "a.pdf")).toBe("image");
    expect(fileIconKind("video/mp4", undefined)).toBe("video");
    expect(fileIconKind("audio/mpeg", undefined)).toBe("audio");
    expect(fileIconKind("application/zip", undefined)).toBe("archive");
    expect(fileIconKind("text/csv", undefined)).toBe("spreadsheet");
    expect(fileIconKind("text/html", undefined)).toBe("code");
  });

  test("a generic or missing mime type falls back to the extension, and then to the plain icon", () => {
    expect(fileIconKind("application/octet-stream", "data.xlsx")).toBe("spreadsheet");
    expect(fileIconKind(undefined, "bundle.TAR.GZ")).toBe("archive");
    expect(fileIconKind(undefined, "clip.webm")).toBe("video");
    expect(fileIconKind(undefined, "x.bin")).toBe("file");
    expect(fileIconKind(undefined, undefined)).toBe("file");
  });

  test("a link is named from its last path segment, decoded, or from its host", () => {
    expect(fileNameFromUrl("https://example.com/docs/My%20Report.pdf")).toBe("My Report.pdf");
    expect(fileNameFromUrl("https://example.com/")).toBe("example.com");
    expect(fileNameFromUrl("/files/a%2Fb.txt")).toBe("a_b.txt");
    expect(fileNameFromUrl("/blocks/file-demo.txt?v=2")).toBe("file-demo.txt");
    expect(fileNameFromUrl("/")).toBeUndefined();
  });

  test("the extension is the part from the last dot", () => {
    expect(fileExtension("a.tar.gz")).toBe(".gz");
    expect(fileExtension(".bashrc")).toBe("");
    expect(fileExtension("noext")).toBe("");
    expect(fileExtension("trailing.")).toBe("");
  });

  test("the shown name is the stored name, else the url's name, else File", () => {
    expect(displayFileName({ name: "Stored.pdf", url: LINK })).toBe("Stored.pdf");
    expect(displayFileName({ url: LINK })).toBe("a.pdf");
    expect(displayFileName({})).toBe("File");
    expect(formatFileSize(2048)).toBe("2 KB");
  });

  test("fileElement writes only the file fields, in order", () => {
    expect(
      fileElement({ url: LINK, name: "a.pdf", size: 1, mime: "application/pdf" }, "f1"),
    ).toEqual({
      type: FILE_KEY,
      id: "f1",
      url: LINK,
      name: "a.pdf",
      size: 1,
      mime: "application/pdf",
      children: [{ text: "" }],
    });
  });
});

describe("slash File item", () => {
  test("the File item is offered right after Image, with its description and keywords", () => {
    const editor = createEditor([paragraph("", "target")]);
    editor.tf.select(caret([0, 0], 0));
    editor.tf.insertText("/");
    const items = slashMenuItems(editor);
    const ids = items.map((item) => item.id);
    expect(ids[ids.indexOf("image") + 1]).toBe("file");
    expect(items.find((item) => item.id === "file")).toMatchObject({
      label: "File",
      description: "Upload or embed with a link",
      group: "Advanced",
    });
    expect(items.find((item) => item.id === "file")?.keywords).toEqual(
      expect.arrayContaining(["attachment", "pdf"]),
    );
  });

  test("choosing File inserts an empty file block and opens its source popover", () => {
    const editor = createEditor([paragraph("", "target"), paragraph("below", "below")]);
    editor.tf.select(caret([0, 0], 0));
    editor.tf.insertText("/");
    runEditorCommand(editor, chooseSlashItem, "file");
    const inserted = editor.children.find((node) => field(node, "type") === FILE_KEY);
    expect(inserted).toBeDefined();
    expect(mediaSourceBlockId(editor)).toBe(String(field(inserted, "id")));
    expect(field(inserted, "url")).toBeUndefined();
  });

  test("the File item is not offered in read-only mode", () => {
    const editor = createEditor([paragraph("", "target")]);
    editor.tf.select(caret([0, 0], 0));
    editor.tf.insertText("/");
    editor.dom.readOnly = true;
    expect(slashMenuItems(editor).some((item) => item.id === "file")).toBe(false);
  });
});

// ----- Mounted editor -------------------------------------------------------------------------

type Pending = {
  file: File;
  options: FileUploadOptions;
  resolve: (value: UploadedFile) => void;
  reject: (error: unknown) => void;
};

// Each upload waits until the test settles it.
function controlledAdapter(): { adapter: FileUploadAdapter; calls: Pending[] } {
  const calls: Pending[] = [];
  const adapter: FileUploadAdapter = {
    upload(file, options) {
      return new Promise<UploadedFile>((resolve, reject) => {
        calls.push({ file, options, resolve, reject });
      });
    },
    resolveUrl: (url) => Promise.resolve(url),
  };
  return { adapter, calls };
}

// Resolves each upload to a url named after its file.
function namedAdapter(): FileUploadAdapter {
  return {
    upload: (file) => Promise.resolve({ url: `https://cdn.example.com/${file.name}` }),
    resolveUrl: (url) => Promise.resolve(url),
  };
}

function withViewport(): () => void {
  const previousWidth = Reflect.get(globalThis, "innerWidth");
  const previousHeight = Reflect.get(globalThis, "innerHeight");
  Reflect.set(globalThis, "innerWidth", 1280);
  Reflect.set(globalThis, "innerHeight", 800);
  return () => {
    if (previousWidth === undefined) {
      Reflect.deleteProperty(globalThis, "innerWidth");
    } else {
      Reflect.set(globalThis, "innerWidth", previousWidth);
    }
    if (previousHeight === undefined) {
      Reflect.deleteProperty(globalThis, "innerHeight");
    } else {
      Reflect.set(globalThis, "innerHeight", previousHeight);
    }
  };
}

type Mounted = {
  editor: SlateEditor;
  host: HTMLElement;
  cleanup: () => Promise<void>;
};

async function mount(
  value: EditorValue,
  options: { adapter?: FileUploadAdapter | null; readOnly?: boolean } = {},
): Promise<Mounted> {
  const restoreViewport = withViewport();
  const editor = createPlateEditor({ plugins: createEditorPlugins(), value });
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <EditorSurface
        editor={editor}
        readOnly={options.readOnly === true}
        placeholder=""
        className="editor"
        fileUpload={options.adapter ?? null}
      />,
    );
  });
  return {
    editor,
    host,
    cleanup: async () => {
      await act(async () => {
        root.unmount();
      });
      host.remove();
      restoreViewport();
    },
  };
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
  });
}

function blockHost(host: HTMLElement, id: string): Element | null {
  return host.querySelector(`[data-block-id="${id}"]`);
}

function fileState(host: HTMLElement, id: string): string | null {
  return (
    blockHost(host, id)?.querySelector("[data-file-state]")?.getAttribute("data-file-state") ?? null
  );
}

// The element with this data attribute or aria-label, in the whole document (popovers portal out).
function find(selector: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(selector);
}

function buttonWithLabel(label: string): HTMLElement | null {
  return find(`[aria-label="${label}"]`);
}

async function click(element: Element | null): Promise<void> {
  if (!(element instanceof HTMLElement)) {
    throw new Error("Missing element to click.");
  }
  await act(async () => {
    element.click();
  });
}

// The mousedown, mouseup and click of a real pointer press, on a block that has never been focused.
async function realClick(target: Element | null): Promise<void> {
  if (!(target instanceof HTMLElement)) {
    throw new Error("Missing the click target.");
  }
  await act(async () => {
    target.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }),
    );
    target.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, button: 0 }));
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
  });
}

async function press(
  target: Element | null,
  key: string,
  init: KeyboardEventInit = {},
): Promise<void> {
  if (target === null) {
    throw new Error(`Missing target for ${key}.`);
  }
  await act(async () => {
    target.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }),
    );
  });
}

// Sets a text field the way a user types into it, so React sees the change.
async function typeInto(input: HTMLInputElement, text: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  await act(async () => {
    setter?.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function fileInput(): HTMLInputElement {
  const input = find("[data-media-file-input]");
  if (!(input instanceof HTMLInputElement)) {
    throw new Error("Missing the file input.");
  }
  return input;
}

async function chooseFile(file: File): Promise<void> {
  const input = fileInput();
  Object.defineProperty(input, "files", { configurable: true, value: [file] });
  await act(async () => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function fileOf(name: string, type = "text/plain", body = "hello"): File {
  return new File([body], name, { type });
}

// Opens the actions popover of a file row the way a click does, from an editor that never had focus.
async function openActionsOn(host: HTMLElement, id: string): Promise<void> {
  await realClick(blockHost(host, id)?.querySelector("[data-file-card]") ?? null);
}

// Pastes files with plain text and HTML, the way a clipboard holds them.
function pasteFiles(editor: SlateEditor, files: File[]): void {
  const data = new DataTransfer();
  data.setData("text/plain", "ignored");
  Object.defineProperty(data, "files", { configurable: true, value: files });
  editor.tf.insertData(data);
}

describe("file rendering", () => {
  test("an empty file is the Add a file placeholder", async () => {
    const mounted = await mount([paragraph("Before", "p1"), file("f1")]);
    await settle();
    const placeholder = find("[data-media-placeholder]");
    expect(placeholder?.getAttribute("aria-label")).toBe("Add a file");
    expect(placeholder?.textContent).toContain("Add a file");
    expect(fileState(mounted.host, "f1")).toBe("empty");
    await mounted.cleanup();
  });

  test("a stored file shows its name, its size and its file-type icon", async () => {
    const mounted = await mount([
      file("f1", {
        url: "/blocks/file-demo.txt",
        name: "file-demo.txt",
        size: 113,
        mime: "text/plain",
      }),
    ]);
    await settle();
    const card = blockHost(mounted.host, "f1")?.querySelector("[data-file-card]");
    expect(card?.textContent).toContain("file-demo");
    expect(card?.textContent).toContain(".txt");
    expect(card?.textContent).toContain("113 B");
    expect(fileState(mounted.host, "f1")).toBe("ready");
    await mounted.cleanup();
  });

  test("a url that does not resolve shows File unavailable, and Replace when editable", async () => {
    const mounted = await mount([file("f1", { url: "local-file:missing", name: "gone.pdf" })], {
      adapter: {
        upload: () => Promise.reject(new Error("unused")),
        resolveUrl: () => Promise.resolve(null),
      },
    });
    await settle();
    expect(fileState(mounted.host, "f1")).toBe("unavailable");
    expect(blockHost(mounted.host, "f1")?.textContent).toContain("File unavailable");
    expect(blockHost(mounted.host, "f1")?.textContent).toContain("Replace");
    await mounted.cleanup();
  });

  test("read-only, a ready file is a link that opens in a new tab, with no actions", async () => {
    const mounted = await mount([file("f1", { url: LINK, name: "a.pdf", size: 2048 })], {
      readOnly: true,
    });
    await settle();
    const link = blockHost(mounted.host, "f1")?.querySelector("a");
    expect(link?.getAttribute("href")).toBe(LINK);
    expect(link?.getAttribute("target")).toBe("_blank");
    expect(link?.getAttribute("rel")).toBe("noopener noreferrer nofollow");
    expect(find("[data-file-actions]")).toBeNull();
    expect(find("[data-media-placeholder]")).toBeNull();
    await mounted.cleanup();
  });
});

describe("file source popover", () => {
  test("without an adapter it has only the link form, labelled for a file, with no accept filter", async () => {
    const mounted = await mount([paragraph("", "p1"), file("f1")]);
    await act(async () => {
      openMediaSource(mounted.editor, "f1");
    });
    expect(find("[data-media-source-popover]")?.getAttribute("aria-label")).toBe("Add a file");
    expect(find("[role='tab']")).toBeNull();
    const input = find("[data-media-embed-input]");
    expect(input?.getAttribute("aria-label")).toBe("File link");
    expect(input?.getAttribute("placeholder")).toBe("Paste the file link…");
    expect(find("[data-media-embed-submit]")?.textContent).toBe("Embed link");
    await mounted.cleanup();
  });

  test("with an adapter it has Upload file, and the file input takes any file", async () => {
    const { adapter } = controlledAdapter();
    const mounted = await mount([paragraph("", "p1"), file("f1")], { adapter });
    await act(async () => {
      openMediaSource(mounted.editor, "f1");
    });
    expect(find("[data-media-upload]")?.textContent).toBe("Upload file");
    expect(fileInput().getAttribute("accept")).toBeNull();
    await mounted.cleanup();
  });
});

describe("file upload", () => {
  test("an upload shows the uploading row, then the ready row when it finishes", async () => {
    const { adapter, calls } = controlledAdapter();
    const mounted = await mount([paragraph("", "p1"), file("f1")], { adapter });
    await act(async () => {
      openMediaSource(mounted.editor, "f1");
    });
    await chooseFile(fileOf("notes.pdf", "application/pdf", "%PDF"));
    expect(calls.length).toBe(1);
    expect(
      blockHost(mounted.host, "f1")?.querySelector('[data-media-row="uploading"]'),
    ).not.toBeNull();
    expect(fileState(mounted.host, "f1")).toBe("uploading");

    await act(async () => {
      calls[0]?.resolve({
        url: "https://cdn.example.com/notes.pdf",
        name: "notes.pdf",
        size: 4,
        mime: "application/pdf",
      });
    });
    await settle();
    expect(fileState(mounted.host, "f1")).toBe("ready");
    expect(fileNode(mounted.editor, "f1")).toMatchObject({
      url: "https://cdn.example.com/notes.pdf",
      name: "notes.pdf",
      size: 4,
    });
    await mounted.cleanup();
  });

  test("Cancel stops the upload and leaves the empty placeholder", async () => {
    const { adapter, calls } = controlledAdapter();
    const mounted = await mount([paragraph("", "p1"), file("f1")], { adapter });
    await act(async () => {
      openMediaSource(mounted.editor, "f1");
    });
    await chooseFile(fileOf("notes.pdf"));
    await click(buttonWithLabel("Cancel upload"));
    expect(calls[0]?.options.signal.aborted).toBe(true);
    expect(fileState(mounted.host, "f1")).toBe("empty");
    await mounted.cleanup();
  });

  test("a failure shows Retry and Remove, Retry uploads again, and Remove deletes the block", async () => {
    const { adapter, calls } = controlledAdapter();
    const mounted = await mount([paragraph("", "p1"), file("f1")], { adapter });
    await act(async () => {
      openMediaSource(mounted.editor, "f1");
    });
    await chooseFile(fileOf("notes.pdf"));
    await act(async () => {
      calls[0]?.reject(new Error("Network down"));
    });
    await settle();
    expect(
      blockHost(mounted.host, "f1")?.querySelector('[data-media-row="failed"]'),
    ).not.toBeNull();

    await click(buttonWithLabel("Retry"));
    await settle();
    expect(calls.length).toBe(2);
    await act(async () => {
      calls[1]?.reject(new Error("Network down"));
    });
    await settle();

    await click(buttonWithLabel("Remove"));
    expect(types(mounted.editor)).toEqual([KEYS.p]);
    await mounted.cleanup();
  });

  test("deleting the block during an upload cancels the upload", async () => {
    const { adapter, calls } = controlledAdapter();
    const mounted = await mount([paragraph("", "p1"), file("f1")], { adapter });
    await act(async () => {
      openMediaSource(mounted.editor, "f1");
    });
    await chooseFile(fileOf("notes.pdf"));
    await act(async () => {
      runEditorCommand(mounted.editor, removeFile, { id: "f1" });
    });
    await settle();
    expect(calls[0]?.options.signal.aborted).toBe(true);
    await mounted.cleanup();
  });
});

describe("file action popover", () => {
  test("one click on a file that has never been focused selects it and opens the actions", async () => {
    const mounted = await mount([
      paragraph("Before", "p1"),
      file("f1", { url: LINK, name: "a.pdf" }),
    ]);
    await settle();
    expect(mounted.editor.selection).toBeNull();
    await openActionsOn(mounted.host, "f1");
    expect(find("[data-file-actions]")).not.toBeNull();
    expect(find("[data-file-actions]")?.getAttribute("aria-label")).toBe("File actions");
    expect(mounted.editor.selection).not.toBeNull();
    expect(mediaActionsBlockId(mounted.editor)).toBe("f1");
    await mounted.cleanup();
  });

  test("Enter on the selected file opens its actions", async () => {
    const mounted = await mount([
      paragraph("Before", "p1"),
      file("f1", { url: LINK, name: "a.pdf" }),
    ]);
    await settle();
    await act(async () => {
      mounted.editor.tf.select(mounted.editor.api.start([1])!);
    });
    await act(async () => {
      expect(onMediaUiKeyDown(mounted.editor, { key: "Enter", preventDefault() {} })).toBe(true);
    });
    expect(find("[data-file-actions]")).not.toBeNull();
    await mounted.cleanup();
  });

  test("Download links the resolved blob url with the download name, and no new tab", async () => {
    const adapter: FileUploadAdapter = {
      upload: () => Promise.reject(new Error("unused")),
      resolveUrl: () => Promise.resolve("blob:https://app.example/abc"),
    };
    const mounted = await mount(
      [paragraph("Before", "p1"), file("f1", { url: "local-file:abc", name: "a.pdf" })],
      { adapter },
    );
    await settle();
    await openActionsOn(mounted.host, "f1");
    const download = find('[data-file-action="download"]');
    expect(download?.getAttribute("href")).toBe("blob:https://app.example/abc");
    expect(download?.getAttribute("download")).toBe("a.pdf");
    expect(download?.hasAttribute("target")).toBe(false);
    await mounted.cleanup();
  });

  test("Download opens an http file in a new tab with the safe rel, and keeps the download name", async () => {
    const mounted = await mount([
      paragraph("Before", "p1"),
      file("f1", { url: LINK, name: "a.pdf" }),
    ]);
    await settle();
    await openActionsOn(mounted.host, "f1");
    const download = find('[data-file-action="download"]');
    expect(download?.getAttribute("href")).toBe(LINK);
    expect(download?.getAttribute("download")).toBe("a.pdf");
    expect(download?.getAttribute("target")).toBe("_blank");
    expect(download?.getAttribute("rel")).toBe("noopener noreferrer nofollow");
    await mounted.cleanup();
  });

  test("Download is disabled while the url resolves", async () => {
    const adapter: FileUploadAdapter = {
      upload: () => Promise.reject(new Error("unused")),
      resolveUrl: () => new Promise<string | null>(() => undefined),
    };
    const mounted = await mount(
      [paragraph("Before", "p1"), file("f1", { url: "local-file:abc", name: "a.pdf" })],
      { adapter },
    );
    await settle();
    await openActionsOn(mounted.host, "f1");
    const download = find('[data-file-action="download"]');
    expect(download?.getAttribute("aria-disabled")).toBe("true");
    expect(download?.hasAttribute("href")).toBe(false);
    await mounted.cleanup();
  });

  test("Rename turns the name into a field, and Enter commits the new name", async () => {
    const mounted = await mount([
      paragraph("Before", "p1"),
      file("f1", { url: LINK, name: "a.pdf" }),
    ]);
    await settle();
    await openActionsOn(mounted.host, "f1");
    await click(find('[data-file-action="rename"]'));
    const input = find('[aria-label="File name"]');
    if (!(input instanceof HTMLInputElement)) {
      throw new Error("Missing the rename field.");
    }
    expect(input.value).toBe("a.pdf");
    await typeInto(input, "renamed.pdf");
    await press(input, "Enter");
    expect(fileNode(mounted.editor, "f1").name).toBe("renamed.pdf");
    expect(find('[aria-label="File name"]')).toBeNull();
    await mounted.cleanup();
  });

  test("Escape cancels a rename, and an empty name restores the old one", async () => {
    const mounted = await mount([
      paragraph("Before", "p1"),
      file("f1", { url: LINK, name: "a.pdf" }),
    ]);
    await settle();
    await openActionsOn(mounted.host, "f1");
    await click(find('[data-file-action="rename"]'));
    const input = find('[aria-label="File name"]');
    if (!(input instanceof HTMLInputElement)) {
      throw new Error("Missing the rename field.");
    }
    await typeInto(input, "other.pdf");
    await press(input, "Escape");
    expect(fileNode(mounted.editor, "f1").name).toBe("a.pdf");

    await openActionsOn(mounted.host, "f1");
    await click(find('[data-file-action="rename"]'));
    const again = find('[aria-label="File name"]');
    if (!(again instanceof HTMLInputElement)) {
      throw new Error("Missing the rename field.");
    }
    const undos = mounted.editor.history.undos.length;
    await typeInto(again, "   ");
    await press(again, "Enter");
    expect(fileNode(mounted.editor, "f1").name).toBe("a.pdf");
    expect(mounted.editor.history.undos.length).toBe(undos);
    await mounted.cleanup();
  });

  test("Replace with the source popover cancelled keeps the old file", async () => {
    const mounted = await mount([
      paragraph("Before", "p1"),
      file("f1", { url: LINK, name: "a.pdf" }),
    ]);
    await settle();
    await openActionsOn(mounted.host, "f1");
    await click(find('[data-file-action="replace"]'));
    expect(find("[data-media-source-popover]")).not.toBeNull();
    await press(find("[data-media-source-popover]"), "Escape");
    expect(fileNode(mounted.editor, "f1").url).toBe(LINK);
    await mounted.cleanup();
  });

  test("Replace with a new link swaps the file in one undo step", async () => {
    const mounted = await mount([
      paragraph("Before", "p1"),
      file("f1", { url: LINK, name: "a.pdf" }),
    ]);
    await settle();
    await openActionsOn(mounted.host, "f1");
    await click(find('[data-file-action="replace"]'));
    const input = find("[data-media-embed-input]");
    const form = input?.closest("form");
    if (!(input instanceof HTMLInputElement) || form === null || form === undefined) {
      throw new Error("Missing the embed form.");
    }
    const undos = mounted.editor.history.undos.length;
    await typeInto(input, "https://example.com/docs/New.pdf");
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(fileNode(mounted.editor, "f1")).toMatchObject({
      url: "https://example.com/docs/New.pdf",
      name: "New.pdf",
    });
    expect(mounted.editor.history.undos.length).toBe(undos + 1);
    mounted.editor.tf.undo();
    expect(fileNode(mounted.editor, "f1").url).toBe(LINK);
    await mounted.cleanup();
  });

  test("Delete removes the block, and undo brings it back", async () => {
    const mounted = await mount([
      paragraph("Before", "p1"),
      file("f1", { url: LINK, name: "a.pdf" }),
    ]);
    await settle();
    await openActionsOn(mounted.host, "f1");
    await click(find('[data-file-action="delete"]'));
    expect(types(mounted.editor)).toEqual([KEYS.p]);
    await act(async () => {
      mounted.editor.tf.undo();
    });
    await settle();
    expect(types(mounted.editor)).toEqual([KEYS.p, FILE_KEY]);
    expect(fileNode(mounted.editor, "f1").url).toBe(LINK);
    await mounted.cleanup();
  });
});

describe("file static output", () => {
  test("a url the browser loads is a link to the file", () => {
    const html = renderToStaticMarkup(
      <NotionLikeEditorStatic
        value={
          [
            file("f1", { url: "/blocks/file-demo.txt", name: "file-demo.txt", size: 113 }),
          ] as EditorValue
        }
      />,
    );
    expect(html).toContain('href="/blocks/file-demo.txt"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain("file-demo.txt");
    expect(html).toContain("113 B");
  });

  test("a url the browser cannot load is the row without a link, and says it is unavailable", () => {
    const html = renderToStaticMarkup(
      <NotionLikeEditorStatic
        value={[file("f1", { url: "local-file:abc", name: "a.pdf" })] as EditorValue}
      />,
    );
    expect(html).not.toContain("<a ");
    expect(html).toContain("a.pdf");
    expect(html).toContain("File unavailable");
  });
});

describe("file paste and drop", () => {
  test("an image, a pdf and a text file become image, file and file blocks in order, as one undo step", async () => {
    // The uploads stay pending, so the only undo step added is the insert.
    const { adapter, calls } = controlledAdapter();
    const mounted = await mount([paragraph("Stay", "p1")], { adapter });
    mounted.editor.tf.select(caret([0, 0], 4));
    const undos = mounted.editor.history.undos.length;
    await act(async () => {
      pasteFiles(mounted.editor, [
        fileOf("pic.png", "image/png", "x"),
        fileOf("doc.pdf", "application/pdf", "%PDF"),
        fileOf("n.txt", "text/plain", "hi"),
      ]);
    });
    expect(types(mounted.editor)).toEqual([KEYS.p, IMAGE_KEY, FILE_KEY, FILE_KEY]);
    expect(mounted.editor.history.undos.length).toBe(undos + 1);
    expect(pasteRepairsOf(mounted.editor)).toEqual([]);
    expect(calls.map((call) => call.file.name)).toEqual(["pic.png", "doc.pdf", "n.txt"]);

    await act(async () => {
      mounted.editor.tf.undo();
    });
    await settle();
    expect(types(mounted.editor)).toEqual([KEYS.p]);
    expect(calls.every((call) => call.options.signal.aborted)).toBe(true);
    await mounted.cleanup();
  });

  test("twelve files add ten blocks, in order, with one notice", async () => {
    const mounted = await mount([paragraph("Stay", "p1")], { adapter: namedAdapter() });
    mounted.editor.tf.select(caret([0, 0], 4));
    const files = Array.from({ length: 12 }, (_, index) => fileOf(`n${index}.txt`));
    await act(async () => {
      pasteFiles(mounted.editor, files);
    });
    await settle();
    expect(types(mounted.editor).filter((type) => type === FILE_KEY).length).toBe(10);
    expect(pasteRepairsOf(mounted.editor).map((repair) => repair.message)).toEqual([
      MEDIA_FILE_LIMIT_MESSAGE,
    ]);
    await mounted.cleanup();
  });

  test("without an adapter a file is rejected with the old notice, and nothing is inserted", async () => {
    const mounted = await mount([paragraph("Stay", "p1")]);
    mounted.editor.tf.select(caret([0, 0], 4));
    await act(async () => {
      pasteFiles(mounted.editor, [fileOf("n.txt")]);
    });
    expect(types(mounted.editor)).toEqual([KEYS.p]);
    expect(pasteRepairsOf(mounted.editor).map((repair) => repair.message)).toEqual([
      MEDIA_NOT_SUPPORTED,
    ]);
    await mounted.cleanup();
  });

  test("a copied file block keeps its url, name, size and mime when it is pasted", () => {
    const editor = createEditor([paragraph("Stay", "p1")]);
    editor.tf.select(caret([0, 0], 0));
    editor.tf.insertFragment([
      file("copy", { url: LINK, name: "a.pdf", size: 9, mime: "application/pdf" }),
    ]);
    expect(types(editor)).toContain(FILE_KEY);
    expect(editor.children.find((node) => field(node, "type") === FILE_KEY)).toMatchObject({
      url: LINK,
      name: "a.pdf",
      size: 9,
    });
    expect(pasteRepairsOf(editor)).toEqual([]);
  });
});

describe("the first upload into a file block is not an undo step", () => {
  test("paste three files and wait: one undo removes all three, and redo brings back three empty placeholders", async () => {
    const mounted = await mount([paragraph("Stay", "p1")], { adapter: namedAdapter() });
    mounted.editor.tf.select(caret([0, 0], 4));
    await act(async () => {
      pasteFiles(mounted.editor, [
        fileOf("one.pdf", "application/pdf", "%PDF"),
        fileOf("two.txt"),
        fileOf("three.txt"),
      ]);
    });
    await settle();
    expect(mounted.editor.children.slice(1).every((node) => field(node, "url") !== undefined)).toBe(
      true,
    );

    await act(async () => {
      mounted.editor.tf.undo();
    });
    await settle();
    expect(types(mounted.editor)).toEqual([KEYS.p]);

    await act(async () => {
      mounted.editor.tf.redo();
    });
    await settle();
    expect(types(mounted.editor)).toEqual([KEYS.p, FILE_KEY, FILE_KEY, FILE_KEY]);
    expect(mounted.editor.children.slice(1).every((node) => field(node, "url") === undefined)).toBe(
      true,
    );
    expect(document.querySelectorAll("[data-media-placeholder]").length).toBe(3);
    expect(document.querySelector('[data-media-row="uploading"]')).toBeNull();
    await mounted.cleanup();
  });

  test("Replace with an upload is one undo step, and undo returns the old url", async () => {
    const { adapter, calls } = controlledAdapter();
    const mounted = await mount(
      [paragraph("Before", "p1"), file("f1", { url: LINK, name: "a.pdf" })],
      { adapter },
    );
    await settle();
    await openActionsOn(mounted.host, "f1");
    await click(find('[data-file-action="replace"]'));
    await chooseFile(fileOf("new.pdf", "application/pdf", "%PDF"));
    await act(async () => {
      calls[0]?.resolve({ url: "https://cdn.example.com/new.pdf", name: "new.pdf" });
    });
    await settle();
    expect(fileNode(mounted.editor, "f1").url).toBe("https://cdn.example.com/new.pdf");

    await act(async () => {
      mounted.editor.tf.undo();
    });
    await settle();
    expect(fileNode(mounted.editor, "f1").url).toBe(LINK);
    await mounted.cleanup();
  });

  test("slash File, then an upload: one undo removes the block and restores the slash line", async () => {
    const { adapter, calls } = controlledAdapter();
    const mounted = await mount([paragraph("", "target"), paragraph("below", "below")], {
      adapter,
    });
    await settle();
    mounted.editor.tf.select(caret([0, 0], 0));
    await act(async () => {
      mounted.editor.tf.insertText("/");
    });
    const before = JSON.stringify(mounted.editor.children);
    await act(async () => {
      runEditorCommand(mounted.editor, chooseSlashItem, "file");
    });
    const id = mediaSourceBlockId(mounted.editor);
    await settle();
    await chooseFile(fileOf("slash.pdf", "application/pdf", "%PDF"));
    await act(async () => {
      calls[0]?.resolve({ url: "https://cdn.example.com/slash.pdf", name: "slash.pdf" });
    });
    await settle();
    expect(fileNode(mounted.editor, id).url).toBe("https://cdn.example.com/slash.pdf");

    await act(async () => {
      mounted.editor.tf.undo();
    });
    await settle();
    expect(mounted.editor.children.some((node) => field(node, "id") === id)).toBe(false);
    expect(JSON.stringify(mounted.editor.children)).toBe(before);
    await mounted.cleanup();
  });
});
