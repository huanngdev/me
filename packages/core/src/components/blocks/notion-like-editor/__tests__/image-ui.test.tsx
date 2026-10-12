import { describe, expect, test } from "bun:test";
import { KEYS, type SlateEditor, type TElement } from "platejs";
import { createPlateEditor } from "platejs/react";
import { act } from "react";
import { createRoot } from "react-dom/client";

import { EditorSurface } from "../components/editor/editor-surface";
import { runEditorCommand } from "../lib/commands/editor-commands";
import type { EditorValue } from "../lib/document/editor-value";
import type {
  FileUploadAdapter,
  FileUploadOptions,
  UploadedFile,
} from "../lib/features/editor-file-upload";
import {
  IMAGE_KEY,
  clampImageWidth,
  dragImageWidth,
  keyImageWidth,
  naturalImagePercent,
} from "../lib/features/editor-image";
import {
  insertImage,
  removeImage,
  setImageCaption,
  setImageWidth,
} from "../lib/features/editor-image-commands";
import { MEDIA_FILE_LIMIT_MESSAGE, mediaKindForFile } from "../lib/features/editor-media";
import { BOOKMARK_KEY } from "../lib/features/editor-bookmark-url";
import { MEDIA_NOT_SUPPORTED, pasteRepairsOf } from "../lib/paste/editor-paste";
import {
  selectedImageId,
  mediaActionsBlockId,
  mediaSourceBlockId,
  onMediaUiKeyDown,
  openMediaSource,
} from "../lib/plugins/editor-media-ui";
import { chooseSlashItem, slashMenuItems } from "../lib/plugins/editor-slash";
import { createEditorPlugins } from "../lib/plugins/editor-plugins";
import { caret, createEditor, field } from "./test-utils";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

if (!("ResizeObserver" in globalThis)) {
  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  globalThis.ResizeObserver = ResizeObserverStub;
}

const PNG = "https://cdn.example.com/a.png";

function paragraph(text: string, id: string): TElement {
  return { type: KEYS.p, id, children: [{ text }] };
}

function image(id: string, extra: Record<string, unknown> = {}): TElement {
  return { type: IMAGE_KEY, id, children: [{ text: "" }], ...extra };
}

function imageNode(editor: SlateEditor, id: string): TElement | undefined {
  return editor.children.find((node) => field(node, "id") === id) as TElement | undefined;
}

function ids(editor: SlateEditor): string[] {
  return editor.children.map((node) => String(field(node, "id")));
}

function typeSlash(editor: SlateEditor, query = ""): void {
  editor.tf.insertText("/");
  if (query.length > 0) {
    editor.tf.insertText(query);
  }
}

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
  render: (readOnly: boolean) => Promise<void>;
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
  const adapter = options.adapter ?? null;
  const render = async (readOnly: boolean): Promise<void> => {
    await act(async () => {
      root.render(
        <EditorSurface
          editor={editor}
          readOnly={readOnly}
          placeholder=""
          className="editor"
          fileUpload={adapter}
        />,
      );
    });
  };
  await render(options.readOnly === true);
  return {
    editor,
    host,
    render,
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

function stateOf(host: HTMLElement, id: string): string | null {
  return (
    host
      .querySelector(`[data-block-id="${id}"] [data-image-state]`)
      ?.getAttribute("data-image-state") ?? null
  );
}

function blockHost(host: HTMLElement, id: string): Element | null {
  return host.querySelector(`[data-block-id="${id}"]`);
}

async function click(element: Element | null): Promise<void> {
  if (!(element instanceof HTMLElement)) {
    throw new Error("Missing element to click.");
  }
  await act(async () => {
    element.click();
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

function buttonWithLabel(label: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[aria-label="${label}"]`);
}

function fileInput(): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>("[data-media-file-input]");
  if (input === null) {
    throw new Error("Missing the file input.");
  }
  return input;
}

// Chooses a file in the source popover, the way the browser reports it.
async function chooseFile(file: File): Promise<void> {
  const input = fileInput();
  Object.defineProperty(input, "files", { configurable: true, value: [file] });
  await act(async () => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function fileOf(name: string, size = 12): File {
  return new File(["x".repeat(size)], name, { type: "image/png" });
}

describe("media kind routing", () => {
  test("only image types route to the image kind", () => {
    expect(mediaKindForFile({ type: "image/png" })).toBe("image");
    expect(mediaKindForFile({ type: "image/webp" })).toBe("image");
    expect(mediaKindForFile({ type: "application/pdf" })).toBeNull();
    expect(mediaKindForFile({ type: "text/plain" })).toBeNull();
    expect(mediaKindForFile({ type: "" })).toBeNull();
  });
});

describe("image resize math", () => {
  test("a centred image grows twice as fast as a left or right aligned one", () => {
    // 200px outward on a 1000px column is 20 percent on the handle's side.
    expect(
      dragImageWidth({ start: 50, deltaPx: 100, columnPx: 1000, handle: "right", align: "center" }),
    ).toBe(70);
    expect(
      dragImageWidth({ start: 50, deltaPx: 100, columnPx: 1000, handle: "right", align: "left" }),
    ).toBe(60);
    expect(
      dragImageWidth({
        start: 50,
        deltaPx: 100,
        columnPx: 1000,
        handle: "right",
        align: undefined,
      }),
    ).toBe(70);
  });

  test("the left handle grows the image when dragged left, and the right handle when dragged right", () => {
    expect(
      dragImageWidth({ start: 50, deltaPx: -100, columnPx: 1000, handle: "left", align: "right" }),
    ).toBe(60);
    expect(
      dragImageWidth({ start: 50, deltaPx: 100, columnPx: 1000, handle: "left", align: "right" }),
    ).toBe(40);
    expect(
      dragImageWidth({ start: 50, deltaPx: 100, columnPx: 1000, handle: "right", align: "right" }),
    ).toBe(60);
  });

  test("a drag clamps to 10 and 100 and rounds to a whole percent", () => {
    expect(
      dragImageWidth({ start: 50, deltaPx: 5000, columnPx: 1000, handle: "right", align: "left" }),
    ).toBe(100);
    expect(
      dragImageWidth({ start: 50, deltaPx: -5000, columnPx: 1000, handle: "right", align: "left" }),
    ).toBe(10);
    expect(
      dragImageWidth({ start: 50, deltaPx: 3, columnPx: 1000, handle: "right", align: "left" }),
    ).toBe(50);
    expect(
      dragImageWidth({ start: 50, deltaPx: 1000, columnPx: 0, handle: "right", align: "left" }),
    ).toBe(50);
    expect(clampImageWidth(4.4)).toBe(10);
    expect(clampImageWidth(101)).toBe(100);
  });

  test("keys step by 5, by 1 with Shift, jump to the ends, and clamp", () => {
    expect(keyImageWidth(50, "ArrowRight", false)).toBe(55);
    expect(keyImageWidth(50, "ArrowLeft", false)).toBe(45);
    expect(keyImageWidth(50, "ArrowRight", true)).toBe(51);
    expect(keyImageWidth(98, "ArrowRight", false)).toBe(100);
    expect(keyImageWidth(12, "ArrowLeft", false)).toBe(10);
    expect(keyImageWidth(50, "Home", false)).toBe(10);
    expect(keyImageWidth(50, "End", false)).toBe(100);
    expect(keyImageWidth(50, "a", false)).toBeNull();
  });
});

describe("measured width of an image without a stored width", () => {
  test("322px in a 700px column is 46 percent, and an unloaded image (0px) gives no value", () => {
    expect(naturalImagePercent(322, 700)).toBe(46);
    expect(naturalImagePercent(0, 700)).toBeUndefined();
    expect(naturalImagePercent(322, 0)).toBeUndefined();
  });

  test("a centred image changes twice as fast as a one-sided one, from the measured 46", () => {
    // A right handle dragged 20px left: centred shrinks by 40px (40 percent), left aligned by 20px (43 percent).
    expect(
      dragImageWidth({ start: 46, deltaPx: -20, columnPx: 700, handle: "right", align: "center" }),
    ).toBe(40);
    expect(
      dragImageWidth({ start: 46, deltaPx: -20, columnPx: 700, handle: "right", align: "left" }),
    ).toBe(43);
    expect(
      dragImageWidth({ start: 46, deltaPx: -60, columnPx: 700, handle: "right", align: "center" }),
    ).toBe(29);
  });
});

// Gives an element a fixed layout width, the way a browser would report it.
function stubWidth(element: Element, width: number): void {
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () => ({
      width,
      height: 0,
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: width,
      bottom: 0,
      toJSON: () => ({}),
    }),
  });
}

describe("slash Image item", () => {
  test("inserts an empty image beside the slash line and opens its source popover", () => {
    const editor = createEditor([paragraph("", "target"), paragraph("below", "below")]);
    editor.tf.select(caret([0, 0], 0));
    typeSlash(editor, "image");
    const item = slashMenuItems(editor).find((entry) => entry.id === "image");
    expect(item).toMatchObject({
      label: "Image",
      description: "Upload or embed with a link",
      group: "Advanced",
    });

    runEditorCommand(editor, chooseSlashItem, "image");
    const inserted = editor.children.find((node) => field(node, "type") === IMAGE_KEY);
    expect(inserted).toBeDefined();
    const id = String(field(inserted, "id"));
    expect(id.length).toBeGreaterThan(0);
    expect(field(inserted, "url")).toBeUndefined();
    expect(mediaSourceBlockId(editor)).toBe(id);
    expect(ids(editor)).toEqual(expect.arrayContaining(["below"]));
  });

  test("the Image item is offered without an adapter, and not in read-only mode", () => {
    const editor = createEditor([paragraph("", "target")]);
    editor.tf.select(caret([0, 0], 0));
    typeSlash(editor);
    expect(slashMenuItems(editor).some((item) => item.id === "image")).toBe(true);

    editor.dom.readOnly = true;
    expect(slashMenuItems(editor).some((item) => item.id === "image")).toBe(false);
  });

  test("the source popover shows the upload tab with an adapter, and only the link form without one", async () => {
    const withAdapter = await mount([paragraph("", "p1"), image("img-1")], {
      adapter: namedAdapter(),
    });
    await act(async () => {
      openMediaSource(withAdapter.editor, "img-1");
    });
    expect(document.querySelectorAll('[role="tab"]').length).toBe(2);
    expect(document.querySelector("[data-media-file-input]")?.getAttribute("accept")).toBe(
      "image/*",
    );
    await withAdapter.cleanup();

    const withoutAdapter = await mount([paragraph("", "p1"), image("img-1")]);
    await act(async () => {
      openMediaSource(withoutAdapter.editor, "img-1");
    });
    expect(document.querySelectorAll('[role="tab"]').length).toBe(0);
    expect(document.querySelector("[data-media-file-input]") === null).toBe(true);
    expect(document.querySelector("[data-media-embed-input]") !== null).toBe(true);
    await withoutAdapter.cleanup();
  });
});

describe("embed link", () => {
  test("an invalid link keeps the popover open with an alert, and a valid one sets the source and closes", async () => {
    const mounted = await mount([paragraph("", "p1"), image("img-1")]);
    await act(async () => {
      openMediaSource(mounted.editor, "img-1");
    });
    const input = document.querySelector<HTMLInputElement>("[data-media-embed-input]");
    const form = input?.closest("form");
    if (input === null || form === null || form === undefined) {
      throw new Error("Missing the embed form.");
    }

    await typeInto(input, "ftp://files.example.com/a.png");
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    const alert = document.querySelector('[role="alert"]');
    expect(alert?.textContent).toBe("Enter a link that starts with http:// or https://");
    expect(document.querySelector("[data-media-source-popover]") !== null).toBe(true);
    expect(imageNode(mounted.editor, "img-1")?.url).toBeUndefined();

    await typeInto(input, PNG);
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(imageNode(mounted.editor, "img-1")?.url).toBe(PNG);
    expect(document.querySelector("[data-media-source-popover]") === null).toBe(true);
    expect(mediaSourceBlockId(mounted.editor)).toBe("");
    await mounted.cleanup();
  });
});

describe("upload from the source popover", () => {
  test("choosing a file closes the popover, shows the uploading row, then the image", async () => {
    const { adapter, calls } = controlledAdapter();
    const mounted = await mount([paragraph("", "p1"), image("img-1")], { adapter });
    await act(async () => {
      openMediaSource(mounted.editor, "img-1");
    });
    await chooseFile(fileOf("photo.png", 12));
    expect(document.querySelector("[data-media-source-popover]") === null).toBe(true);

    const row = blockHost(mounted.host, "img-1")?.querySelector('[data-media-row="uploading"]');
    expect(row?.textContent).toContain("photo.png");
    expect(row?.textContent).toContain("12 B · 0%");
    expect(stateOf(mounted.host, "img-1")).toBe("uploading");

    await act(async () => {
      calls[0]?.options.onProgress(0.5);
    });
    expect(blockHost(mounted.host, "img-1")?.textContent).toContain("12 B · 50%");

    await act(async () => {
      calls[0]?.resolve({ url: PNG });
    });
    await settle();
    expect(imageNode(mounted.editor, "img-1")?.url).toBe(PNG);
    expect(imageNode(mounted.editor, "img-1")?.name).toBe("photo.png");
    expect(stateOf(mounted.host, "img-1")).toBe("ready");
    await mounted.cleanup();
  });

  test("Cancel returns to the placeholder, aborts the upload, and a late result changes nothing", async () => {
    const { adapter, calls } = controlledAdapter();
    const mounted = await mount([paragraph("", "p1"), image("img-1")], { adapter });
    await act(async () => {
      openMediaSource(mounted.editor, "img-1");
    });
    await chooseFile(fileOf("photo.png"));
    await click(buttonWithLabel("Cancel upload"));

    expect(
      blockHost(mounted.host, "img-1")?.querySelector('[data-media-row="uploading"]') === null,
    ).toBe(true);
    expect(stateOf(mounted.host, "img-1")).toBe("empty");
    expect(calls[0]?.options.signal.aborted).toBe(true);

    await act(async () => {
      calls[0]?.resolve({ url: PNG });
    });
    await settle();
    expect(imageNode(mounted.editor, "img-1")?.url).toBeUndefined();
    await mounted.cleanup();
  });

  test("a failure shows the failed row, Retry uploads again, and Remove deletes the block", async () => {
    const { adapter, calls } = controlledAdapter();
    const mounted = await mount([paragraph("", "p1"), image("img-1")], { adapter });
    await act(async () => {
      openMediaSource(mounted.editor, "img-1");
    });
    await chooseFile(fileOf("photo.png"));
    await act(async () => {
      calls[0]?.reject(new Error("Network down"));
    });
    await settle();
    const failed = blockHost(mounted.host, "img-1")?.querySelector('[data-media-row="failed"]');
    expect(failed?.textContent).toContain("Upload failed");
    expect(failed?.textContent).toContain("Network down");

    await click(buttonWithLabel("Retry"));
    expect(calls.length).toBe(2);
    await act(async () => {
      calls[1]?.resolve({ url: PNG });
    });
    await settle();
    expect(imageNode(mounted.editor, "img-1")?.url).toBe(PNG);

    await act(async () => {
      openMediaSource(mounted.editor, "img-1");
    });
    await chooseFile(fileOf("again.png"));
    await act(async () => {
      calls[2]?.reject(new Error("Still down"));
    });
    await settle();
    await click(buttonWithLabel("Remove"));
    expect(imageNode(mounted.editor, "img-1")).toBeUndefined();
    await mounted.cleanup();
  });

  test("deleting the block during an upload aborts it, and undo brings back an empty placeholder", async () => {
    const { adapter, calls } = controlledAdapter();
    const mounted = await mount([paragraph("", "p1"), image("img-1")], { adapter });
    await act(async () => {
      openMediaSource(mounted.editor, "img-1");
    });
    await chooseFile(fileOf("photo.png"));

    await act(async () => {
      runEditorCommand(mounted.editor, removeImage, { id: "img-1" });
    });
    await settle();
    expect(calls[0]?.options.signal.aborted).toBe(true);
    expect(imageNode(mounted.editor, "img-1")).toBeUndefined();

    await act(async () => {
      mounted.editor.tf.undo();
    });
    await settle();
    expect(imageNode(mounted.editor, "img-1")?.url).toBeUndefined();
    expect(stateOf(mounted.host, "img-1")).toBe("empty");
    expect(
      blockHost(mounted.host, "img-1")?.querySelector('[data-media-row="uploading"]') === null,
    ).toBe(true);

    await act(async () => {
      calls[0]?.resolve({ url: PNG });
    });
    await settle();
    expect(imageNode(mounted.editor, "img-1")?.url).toBeUndefined();
    await mounted.cleanup();
  });

  test("moving the block during an upload keeps the upload", async () => {
    const { adapter, calls } = controlledAdapter();
    const mounted = await mount(
      [paragraph("First", "p1"), image("img-1"), paragraph("Last", "p2")],
      { adapter },
    );
    await act(async () => {
      openMediaSource(mounted.editor, "img-1");
    });
    await chooseFile(fileOf("photo.png"));

    await act(async () => {
      mounted.editor.tf.moveNodes({ at: [1], to: [0] });
    });
    await settle();
    expect(ids(mounted.editor)).toEqual(["img-1", "p1", "p2"]);
    expect(calls[0]?.options.signal.aborted).toBe(false);
    expect(stateOf(mounted.host, "img-1")).toBe("uploading");

    await act(async () => {
      calls[0]?.resolve({ url: PNG });
    });
    await settle();
    expect(imageNode(mounted.editor, "img-1")?.url).toBe(PNG);
    await mounted.cleanup();
  });

  test("switching to read-only cancels the upload", async () => {
    const { adapter, calls } = controlledAdapter();
    const mounted = await mount([paragraph("", "p1"), image("img-1")], { adapter });
    await act(async () => {
      openMediaSource(mounted.editor, "img-1");
    });
    await chooseFile(fileOf("photo.png"));

    await mounted.render(true);
    expect(calls[0]?.options.signal.aborted).toBe(true);
    expect(stateOf(mounted.host, "img-1")).toBe("empty");
    await mounted.cleanup();
  });
});

describe("paste and drop of image files", () => {
  function pasteFiles(editor: SlateEditor, files: File[], plain = "", html = ""): void {
    const data = new DataTransfer();
    if (html.length > 0) {
      data.setData("text/html", html);
    }
    data.setData("text/plain", plain);
    Object.defineProperty(data, "files", { configurable: true, value: files });
    editor.tf.insertData(data);
  }

  test("two image files insert two blocks as one undo step, and undo removes them and cancels their uploads", async () => {
    const { adapter, calls } = controlledAdapter();
    const mounted = await mount([paragraph("Stay", "p1")], { adapter });
    mounted.editor.tf.select(caret([0, 0], 4));
    const undos = mounted.editor.history.undos.length;
    await act(async () => {
      pasteFiles(
        mounted.editor,
        [fileOf("one.png"), fileOf("two.png")],
        "ignored text",
        "<img src='x.png'>",
      );
    });

    expect(mounted.editor.children.map((node) => field(node, "type"))).toEqual([
      KEYS.p,
      IMAGE_KEY,
      IMAGE_KEY,
    ]);
    expect(mounted.editor.history.undos.length).toBe(undos + 1);
    expect(pasteRepairsOf(mounted.editor)).toEqual([]);
    expect(calls.length).toBe(2);

    await act(async () => {
      mounted.editor.tf.undo();
    });
    await settle();
    expect(mounted.editor.children.map((node) => field(node, "type"))).toEqual([KEYS.p]);
    expect(calls.every((call) => call.options.signal.aborted)).toBe(true);
    await mounted.cleanup();
  });

  test("the pasted images take their files' urls in order", async () => {
    const mounted = await mount([paragraph("Stay", "p1")], { adapter: namedAdapter() });
    mounted.editor.tf.select(caret([0, 0], 4));
    await act(async () => {
      pasteFiles(
        mounted.editor,
        [fileOf("one.png"), fileOf("two.png")],
        "ignored text",
        "<img src='x.png'>",
      );
    });
    await settle();
    expect(mounted.editor.children.slice(1).map((node) => field(node, "url"))).toEqual([
      "https://cdn.example.com/one.png",
      "https://cdn.example.com/two.png",
    ]);
    await mounted.cleanup();
  });

  test("an empty paragraph at the caret is replaced by the first image", async () => {
    const mounted = await mount([paragraph("", "p1"), paragraph("Next", "p2")], {
      adapter: namedAdapter(),
    });
    mounted.editor.tf.select(caret([0, 0], 0));
    await act(async () => {
      pasteFiles(mounted.editor, [fileOf("solo.png")]);
    });
    await settle();
    expect(mounted.editor.children.map((node) => field(node, "type"))).toEqual([IMAGE_KEY, KEYS.p]);
    await mounted.cleanup();
  });

  test("a non-image file is skipped with the existing notice, and images still insert", async () => {
    const mounted = await mount([paragraph("Stay", "p1")], { adapter: namedAdapter() });
    mounted.editor.tf.select(caret([0, 0], 4));
    await act(async () => {
      pasteFiles(mounted.editor, [
        new File(["%PDF"], "notes.pdf", { type: "application/pdf" }),
        fileOf("pic.png"),
      ]);
    });
    await settle();
    expect(mounted.editor.children.filter((node) => field(node, "type") === IMAGE_KEY).length).toBe(
      1,
    );
    expect(pasteRepairsOf(mounted.editor).map((repair) => repair.message)).toEqual([
      MEDIA_NOT_SUPPORTED,
    ]);
    await mounted.cleanup();
  });

  test("a dropped image file with no resolvable drop point goes after the current block", async () => {
    const mounted = await mount([paragraph("First", "p1"), paragraph("Second", "p2")], {
      adapter: namedAdapter(),
    });
    await settle();
    mounted.editor.tf.select(caret([0, 0], 2));
    const target = blockHost(mounted.host, "p1");
    if (target === null) {
      throw new Error("Missing the drop target.");
    }

    const drop = new Event("drop", { bubbles: true, cancelable: true });
    const data = new DataTransfer();
    Object.defineProperty(data, "files", { configurable: true, value: [fileOf("dropped.png")] });
    Object.defineProperty(drop, "dataTransfer", { configurable: true, value: data });
    await act(async () => {
      target.dispatchEvent(drop);
    });
    await settle();
    expect(drop.defaultPrevented).toBe(true);
    expect(mounted.editor.children.map((node) => field(node, "type"))).toEqual([
      KEYS.p,
      IMAGE_KEY,
      KEYS.p,
    ]);
    expect(mounted.editor.children.map((node) => field(node, "id"))[0]).toBe("p1");
    await mounted.cleanup();
  });

  test("only the first 10 image files are added, with one notice", async () => {
    const mounted = await mount([paragraph("Stay", "p1")], { adapter: namedAdapter() });
    mounted.editor.tf.select(caret([0, 0], 4));
    const files = Array.from({ length: 11 }, (_, index) => fileOf(`n${index}.png`));
    await act(async () => {
      pasteFiles(mounted.editor, files);
    });
    await settle();
    expect(mounted.editor.children.filter((node) => field(node, "type") === IMAGE_KEY).length).toBe(
      10,
    );
    expect(pasteRepairsOf(mounted.editor).map((repair) => repair.message)).toEqual([
      MEDIA_FILE_LIMIT_MESSAGE,
    ]);
    await mounted.cleanup();
  });

  test("without an adapter, an image file keeps the old notice and inserts nothing", async () => {
    const mounted = await mount([paragraph("Stay", "p1")]);
    mounted.editor.tf.select(caret([0, 0], 4));
    await act(async () => {
      pasteFiles(mounted.editor, [fileOf("pic.png")]);
    });
    expect(mounted.editor.children.map((node) => field(node, "type"))).toEqual([KEYS.p]);
    expect(pasteRepairsOf(mounted.editor).map((repair) => repair.message)).toEqual([
      MEDIA_NOT_SUPPORTED,
    ]);
    await mounted.cleanup();
  });
});

describe("image actions popover", () => {
  test("a click on the image opens the actions, and a second click keeps them open", async () => {
    const mounted = await mount([paragraph("Before", "p1"), image("img-1", { url: PNG })]);
    await settle();
    const card = blockHost(mounted.host, "img-1")?.querySelector("[data-image-card]") ?? null;
    await click(card);
    expect(document.querySelector("[data-image-actions]") !== null).toBe(true);
    expect(mediaActionsBlockId(mounted.editor)).toBe("img-1");
    // The row takes focus, so no control's tooltip opens on open.
    expect(document.activeElement?.hasAttribute("data-image-actions-row")).toBe(true);

    await click(card);
    expect(document.querySelector("[data-image-actions]") !== null).toBe(true);
    expect(mediaActionsBlockId(mounted.editor)).toBe("img-1");
    await mounted.cleanup();
  });

  test("Enter on the selected image opens the actions", async () => {
    const mounted = await mount([paragraph("Before", "p1"), image("img-1", { url: PNG })]);
    await settle();
    await act(async () => {
      mounted.editor.tf.select(mounted.editor.api.start([1])!);
    });
    await act(async () => {
      expect(onMediaUiKeyDown(mounted.editor, { key: "Enter", preventDefault() {} })).toBe(true);
    });
    expect(document.querySelector("[data-image-actions]") !== null).toBe(true);
    await mounted.cleanup();
  });

  test("align buttons set the attribute and aria-pressed, Escape returns focus to the editor, and Delete removes the image", async () => {
    const mounted = await mount([paragraph("Before", "p1"), image("img-1", { url: PNG })]);
    await settle();
    await click(blockHost(mounted.host, "img-1")?.querySelector("[data-image-card]") ?? null);

    expect(buttonWithLabel("Align center")?.getAttribute("aria-pressed")).toBe("true");
    await click(buttonWithLabel("Align right"));
    expect(imageNode(mounted.editor, "img-1")?.align).toBe("right");
    expect(buttonWithLabel("Align right")?.getAttribute("aria-pressed")).toBe("true");
    expect(buttonWithLabel("Align center")?.getAttribute("aria-pressed")).toBe("false");

    const popover = document.querySelector("[data-image-actions]");
    await press(popover, "Escape");
    expect(document.querySelector("[data-image-actions]") === null).toBe(true);
    expect(mediaActionsBlockId(mounted.editor)).toBe("");
    expect(document.activeElement?.closest("[data-slate-editor]") !== null).toBe(true);

    await click(blockHost(mounted.host, "img-1")?.querySelector("[data-image-card]") ?? null);
    await click(buttonWithLabel("Delete"));
    expect(imageNode(mounted.editor, "img-1")).toBeUndefined();
    await mounted.cleanup();
  });

  test("Replace keeps the old image when cancelled, and swaps it in one undo step when a link is chosen", async () => {
    const mounted = await mount(
      [paragraph("Before", "p1"), image("img-1", { url: PNG, name: "a.png" })],
      {
        adapter: namedAdapter(),
      },
    );
    await settle();
    await click(blockHost(mounted.host, "img-1")?.querySelector("[data-image-card]") ?? null);
    await click(buttonWithLabel("Replace"));
    expect(mediaSourceBlockId(mounted.editor)).toBe("img-1");
    expect(document.querySelector("[data-media-source-popover]") !== null).toBe(true);

    await press(document.querySelector("[data-media-source-popover]"), "Escape");
    expect(imageNode(mounted.editor, "img-1")?.url).toBe(PNG);

    await click(blockHost(mounted.host, "img-1")?.querySelector("[data-image-card]") ?? null);
    await click(buttonWithLabel("Replace"));
    await chooseFile(fileOf("new.png"));
    await settle();
    const replaced = imageNode(mounted.editor, "img-1");
    expect(replaced?.url).toBe("https://cdn.example.com/new.png");
    expect(replaced?.name).toBe("new.png");

    const before = mounted.editor.history.undos.length;
    expect(before).toBeGreaterThan(0);
    await act(async () => {
      mounted.editor.tf.undo();
    });
    expect(imageNode(mounted.editor, "img-1")?.url).toBe(PNG);
    await mounted.cleanup();
  });

  test("the actions popover is refused in read-only mode, and the image has no controls", async () => {
    const mounted = await mount([paragraph("Before", "p1"), image("img-1", { url: PNG })], {
      readOnly: true,
    });
    await settle();
    expect(blockHost(mounted.host, "img-1")?.querySelector("[data-image-card]") === null).toBe(
      true,
    );
    expect(blockHost(mounted.host, "img-1")?.querySelector('[role="separator"]') === null).toBe(
      true,
    );
    expect(document.querySelector("[data-image-actions]") === null).toBe(true);
    expect(document.querySelector("[data-media-source-popover]") === null).toBe(true);
    expect(
      blockHost(mounted.host, "img-1")?.querySelector("[data-media-placeholder]") === null,
    ).toBe(true);
    await mounted.cleanup();
  });
});

describe("undo and redo from the media popovers", () => {
  test("a keyboard resize made with the action popover open can be undone and redone from the popover and the handle", async () => {
    const mounted = await mount([
      paragraph("Before", "p1"),
      image("img-1", { url: PNG, width: 60 }),
    ]);
    await settle();
    await click(blockHost(mounted.host, "img-1")?.querySelector("[data-image-card]") ?? null);
    const handle = blockHost(mounted.host, "img-1")?.querySelector('[data-image-resize="right"]');
    await press(handle ?? null, "ArrowLeft");
    expect(imageNode(mounted.editor, "img-1")?.width).toBe(55);

    const row = document.querySelector("[data-image-actions-row]");
    await press(row, "z", { metaKey: true });
    expect(imageNode(mounted.editor, "img-1")?.width).toBe(60);
    await press(row, "Z", { metaKey: true, shiftKey: true });
    expect(imageNode(mounted.editor, "img-1")?.width).toBe(55);

    await press(handle ?? null, "z", { metaKey: true });
    expect(imageNode(mounted.editor, "img-1")?.width).toBe(60);
    await press(handle ?? null, "y", { ctrlKey: true });
    expect(imageNode(mounted.editor, "img-1")?.width).toBe(55);
    await mounted.cleanup();
  });

  test("Mod+Z and Mod+Shift+Z from the bookmark action popover undo and redo the document", async () => {
    const mounted = await mount([
      paragraph("Before", "p1"),
      image("img-1", { url: PNG, width: 60 }),
      { type: BOOKMARK_KEY, id: "bk", url: "https://example.com/docs", children: [{ text: "" }] },
    ]);
    await settle();
    await act(async () => {
      runEditorCommand(mounted.editor, setImageWidth, { id: "img-1", width: 40 });
    });
    await click(blockHost(mounted.host, "bk")?.querySelector("[data-bookmark-card]") ?? null);
    const popover = document.querySelector("[data-bookmark-toolbar-popover]");
    expect(popover !== null).toBe(true);
    const focused = document.activeElement;
    await press(focused, "z", { metaKey: true });
    expect(imageNode(mounted.editor, "img-1")?.width).toBe(60);
    await press(focused, "Z", { metaKey: true, shiftKey: true });
    expect(imageNode(mounted.editor, "img-1")?.width).toBe(40);
    await mounted.cleanup();
  });

  test("Mod+Z in the caption field stays the field's own undo, and does not undo the document", async () => {
    const mounted = await mount([
      paragraph("Before", "p1"),
      image("img-1", { url: PNG, width: 60, caption: "Kept" }),
    ]);
    await settle();
    await click(blockHost(mounted.host, "img-1")?.querySelector("[data-image-card]") ?? null);
    await click(buttonWithLabel("Caption"));
    const input = document.querySelector<HTMLInputElement>('[aria-label="Image caption"]');
    if (input === null) {
      throw new Error("Missing the caption input.");
    }
    const undos = mounted.editor.history.undos.length;
    await press(input, "z", { metaKey: true });
    expect(mounted.editor.history.undos.length).toBe(undos);
    expect(imageNode(mounted.editor, "img-1")?.caption).toBe("Kept");
    await mounted.cleanup();
  });
});

describe("image caption", () => {
  test("Caption opens an input, Enter commits one step, and Escape restores the stored caption", async () => {
    const mounted = await mount([paragraph("Before", "p1"), image("img-1", { url: PNG })]);
    await settle();
    await click(blockHost(mounted.host, "img-1")?.querySelector("[data-image-card]") ?? null);
    await click(buttonWithLabel("Caption"));

    const input = document.querySelector<HTMLInputElement>('[aria-label="Image caption"]');
    if (input === null) {
      throw new Error("Missing the caption input.");
    }
    expect(input.placeholder).toBe("Write a caption…");
    expect(input.maxLength).toBe(500);

    const undos = mounted.editor.history.undos.length;
    await typeInto(input, "A sunset");
    await press(input, "Enter");
    expect(imageNode(mounted.editor, "img-1")?.caption).toBe("A sunset");
    expect(mounted.editor.history.undos.length).toBe(undos + 1);

    await click(blockHost(mounted.host, "img-1")?.querySelector("[data-image-card]") ?? null);
    await click(buttonWithLabel("Caption"));
    const again = document.querySelector<HTMLInputElement>('[aria-label="Image caption"]');
    if (again === null) {
      throw new Error("Missing the caption input.");
    }
    await typeInto(again, "Changed");
    await press(again, "Escape");
    expect(imageNode(mounted.editor, "img-1")?.caption).toBe("A sunset");
    await mounted.cleanup();
  });

  test("an empty caption on blur hides the line again, and keys typed in the caption do not reach the editor", async () => {
    const mounted = await mount([paragraph("Before", "p1"), image("img-1", { url: PNG })]);
    await settle();
    await click(blockHost(mounted.host, "img-1")?.querySelector("[data-image-card]") ?? null);
    await click(buttonWithLabel("Caption"));
    const input = document.querySelector<HTMLInputElement>('[aria-label="Image caption"]');
    if (input === null) {
      throw new Error("Missing the caption input.");
    }

    const textBefore = JSON.stringify(mounted.editor.children);
    await press(input, "ArrowLeft");
    await press(input, "x");
    expect(JSON.stringify(mounted.editor.children)).toBe(textBefore);

    await act(async () => {
      input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });
    expect(document.querySelector('[aria-label="Image caption"]') === null).toBe(true);
    expect(imageNode(mounted.editor, "img-1")?.caption).toBeUndefined();
    await mounted.cleanup();
  });

  test("setImageCaption is one undo step", () => {
    const editor = createEditor([image("img-1", { url: PNG })]);
    runEditorCommand(editor, setImageCaption, { id: "img-1", caption: "Hi" });
    expect(field(editor.children[0], "caption")).toBe("Hi");
    editor.tf.undo();
    expect(field(editor.children[0], "caption")).toBeUndefined();
  });
});

describe("image resize handles", () => {
  test("handles show on a selected image with ARIA values, and keys resize in one undo step each", async () => {
    const mounted = await mount([
      paragraph("Before", "p1"),
      image("img-1", { url: PNG, width: 60 }),
    ]);
    await settle();
    await act(async () => {
      mounted.editor.tf.select(mounted.editor.api.start([1])!);
    });
    await settle();

    const handles = () =>
      Array.from(blockHost(mounted.host, "img-1")?.querySelectorAll('[role="separator"]') ?? []);
    expect(handles().length).toBe(2);
    for (const handle of handles()) {
      expect(handle.getAttribute("aria-label")).toBe("Resize image");
      expect(handle.getAttribute("aria-orientation")).toBe("vertical");
      expect(handle.getAttribute("aria-valuemin")).toBe("10");
      expect(handle.getAttribute("aria-valuemax")).toBe("100");
      expect(handle.getAttribute("tabindex")).toBe("0");
    }
    expect(handles()[1]?.getAttribute("aria-valuenow")).toBe("60");

    const right = handles()[1];
    const undos = () => mounted.editor.history.undos.length;
    const start = undos();
    await press(right ?? null, "ArrowRight");
    expect(imageNode(mounted.editor, "img-1")?.width).toBe(65);
    expect(undos()).toBe(start + 1);
    expect(handles()[1]?.getAttribute("aria-valuenow")).toBe("65");

    await press(handles()[0] ?? null, "ArrowLeft", { shiftKey: true });
    expect(imageNode(mounted.editor, "img-1")?.width).toBe(64);

    await press(handles()[0] ?? null, "End");
    expect(imageNode(mounted.editor, "img-1")?.width).toBe(100);
    const atMax = undos();
    await press(handles()[1] ?? null, "ArrowRight");
    expect(undos()).toBe(atMax);

    await press(handles()[1] ?? null, "Home");
    expect(imageNode(mounted.editor, "img-1")?.width).toBe(10);
    await press(handles()[1] ?? null, "ArrowLeft");
    expect(imageNode(mounted.editor, "img-1")?.width).toBe(10);
    await mounted.cleanup();
  });

  test("a block with no measurable width shows 100 and a key writes nothing, since no width is known", async () => {
    const mounted = await mount([paragraph("Before", "p1"), image("img-1", { url: PNG })]);
    await settle();
    await act(async () => {
      mounted.editor.tf.select(mounted.editor.api.start([1])!);
    });
    await settle();
    const handle = blockHost(mounted.host, "img-1")?.querySelector('[role="separator"]');
    expect(handle?.getAttribute("aria-valuenow")).toBe("100");
    const undos = mounted.editor.history.undos.length;
    await press(handle ?? null, "ArrowLeft");
    expect(imageNode(mounted.editor, "img-1")?.width).toBeUndefined();
    expect(mounted.editor.history.undos.length).toBe(undos);
    await mounted.cleanup();
  });
});

describe("insert image through the command", () => {
  test("insertImage and the source popover work with no adapter", async () => {
    const mounted = await mount([paragraph("", "p1")]);
    mounted.editor.tf.select(caret([0, 0], 0));
    await act(async () => {
      expect(runEditorCommand(mounted.editor, insertImage, { id: "new-img" })).toBe(true);
    });
    await act(async () => {
      openMediaSource(mounted.editor, "new-img");
    });
    expect(document.querySelector("[data-media-source-popover]") !== null).toBe(true);
    expect(stateOf(mounted.host, "new-img")).toBe("empty");
    await mounted.cleanup();
  });
});

describe("resize from the measured width", () => {
  test("a key on an image without a stored width starts from the rendered width, and aria-valuenow shows it after load", async () => {
    const mounted = await mount([paragraph("Before", "p1"), image("img-1", { url: PNG })]);
    await settle();
    await act(async () => {
      mounted.editor.tf.select(mounted.editor.api.start([1])!);
    });
    await settle();
    const anchor = blockHost(mounted.host, "img-1")?.querySelector("[data-media-anchor]");
    const figure = blockHost(mounted.host, "img-1")?.querySelector("figure");
    if (!(anchor instanceof HTMLElement) || !(figure instanceof HTMLElement)) {
      throw new Error("Missing the image layout.");
    }
    stubWidth(anchor, 700);
    stubWidth(figure, 322);

    const img = blockHost(mounted.host, "img-1")?.querySelector("img");
    await act(async () => {
      img?.dispatchEvent(new Event("load"));
    });
    const handle = blockHost(mounted.host, "img-1")?.querySelector('[data-image-resize="right"]');
    expect(handle?.getAttribute("aria-valuenow")).toBe("46");

    await press(handle ?? null, "ArrowRight");
    expect(imageNode(mounted.editor, "img-1")?.width).toBe(51);
    await mounted.cleanup();
  });
});

describe("stored image: delete, then undo", () => {
  test("an image loaded from a stored document is deleted by its action popover and comes back whole on undo", async () => {
    const mounted = await mount([
      paragraph("Before", "p1"),
      image("img-1", {
        url: PNG,
        name: "a.png",
        size: 12,
        mime: "image/png",
        width: 60,
        align: "right",
        caption: "A caption",
      }),
    ]);
    await settle();
    await click(blockHost(mounted.host, "img-1")?.querySelector("[data-image-card]") ?? null);
    expect(document.querySelector("[data-image-actions]") !== null).toBe(true);

    await click(buttonWithLabel("Delete"));
    expect(imageNode(mounted.editor, "img-1") === undefined).toBe(true);

    await act(async () => {
      mounted.editor.tf.undo();
    });
    const back = imageNode(mounted.editor, "img-1");
    expect(back?.url).toBe(PNG);
    expect(back?.width).toBe(60);
    expect(back?.caption).toBe("A caption");
    expect(back?.align).toBe("right");
    expect(stateOf(mounted.host, "img-1")).toBe("ready");
    await mounted.cleanup();
  });
});

describe("first click on an unfocused editor", () => {
  test("a mousedown on the image card is not left to the browser, so its caret cannot move off the image", async () => {
    const mounted = await mount([paragraph("Before", "p1"), image("img-1", { url: PNG })]);
    await settle();
    const card = blockHost(mounted.host, "img-1")?.querySelector("[data-image-card]");
    if (!(card instanceof HTMLElement)) {
      throw new Error("Missing the image card.");
    }
    const down = new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 });
    card.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    await mounted.cleanup();
  });

  // A real click sends mousedown, then click. The editor has never been focused and has no selection.
  async function realClick(target: Element | null): Promise<void> {
    if (!(target instanceof HTMLElement)) {
      throw new Error("Missing the click target.");
    }
    await act(async () => {
      target.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }),
      );
      target.dispatchEvent(
        new MouseEvent("mouseup", { bubbles: true, cancelable: true, button: 0 }),
      );
      target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    });
  }

  test("one click on an image that has never been focused selects it and opens the actions", async () => {
    const mounted = await mount([paragraph("Before", "p1"), image("img-1", { url: PNG })]);
    await settle();
    expect(mounted.editor.selection === null).toBe(true);
    expect(document.activeElement === document.body).toBe(true);

    await realClick(blockHost(mounted.host, "img-1")?.querySelector("img") ?? null);
    expect(document.querySelector("[data-image-actions]") !== null).toBe(true);
    expect(selectedImageId(mounted.editor)).toBe("img-1");
    expect(mounted.editor.selection !== null).toBe(true);
    await mounted.cleanup();
  });
});
