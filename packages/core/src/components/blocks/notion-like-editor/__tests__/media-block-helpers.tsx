import { expect } from "bun:test";
import { KEYS, type SlateEditor, type TElement } from "platejs";
import { createPlateEditor } from "platejs/react";
import { act } from "react";
import { createRoot } from "react-dom/client";

import { EditorSurface } from "../components/editor/editor-surface";
import type { EditorValue } from "../lib/document/editor-value";
import type {
  FileUploadAdapter,
  FileUploadOptions,
  UploadedFile,
} from "../lib/features/editor-file-upload";
import { createEditorPlugins } from "../lib/plugins/editor-plugins";
import { field } from "./test-utils";

// Shared by the video and audio block tests. The mount, the clicks and the keys follow the file block
// tests, so a media block behaves the same way under each of them.

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

if (!("ResizeObserver" in globalThis)) {
  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  globalThis.ResizeObserver = ResizeObserverStub;
}

// happy-dom reports no media type as playable, and the player treats that as a source it cannot play. Every
// type is reported as probably playable here, so the player keeps the source. Nothing is played.
for (const element of ["audio", "video"] as const) {
  const proto: { canPlayType?: () => string } = Object.getPrototypeOf(
    document.createElement(element),
  );
  proto.canPlayType = () => "probably";
}

export function paragraph(text: string, id: string): TElement {
  return { type: KEYS.p, id, children: [{ text }] };
}

export function mediaBlock(
  type: string,
  id: string,
  extra: Record<string, unknown> = {},
): TElement {
  return { type, id, children: [{ text: "" }], ...extra };
}

export function nodeOf(editor: SlateEditor, id: string): Record<string, unknown> {
  const node = editor.children.find((child) => field(child, "id") === id);
  if (node === undefined || typeof node !== "object") {
    throw new Error(`No block ${id}.`);
  }
  return node as Record<string, unknown>;
}

export function types(editor: SlateEditor): unknown[] {
  return editor.children.map((node) => field(node, "type"));
}

// Keys sorted, so an undo that restores the same content in another key order still matches.
export function canonical(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonical(item)).join(",")}]`;
  }
  if (typeof value === "object" && value !== null) {
    const record: Record<string, unknown> = { ...value };
    const keys = Object.keys(record).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function snapshot(editor: SlateEditor): string {
  return canonical(editor.children);
}

// Each mutating command is run, then undone once. The document must match the state before it.
export function expectOneUndo(editor: SlateEditor, run: () => boolean): void {
  const before = snapshot(editor);
  const undos = editor.history.undos.length;
  expect(run()).toBe(true);
  expect(editor.history.undos.length).toBe(undos + 1);
  editor.tf.undo();
  expect(snapshot(editor)).toBe(before);
}

export function withViewport(): () => void {
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

export type Pending = {
  file: File;
  options: FileUploadOptions;
  resolve: (value: UploadedFile) => void;
  reject: (error: unknown) => void;
};

// Each upload waits until the test settles it.
export function controlledAdapter(): { adapter: FileUploadAdapter; calls: Pending[] } {
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
export function namedAdapter(): FileUploadAdapter {
  return {
    upload: (file) => Promise.resolve({ url: `https://cdn.example.com/${file.name}` }),
    resolveUrl: (url) => Promise.resolve(url),
  };
}

export type Mounted = {
  editor: SlateEditor;
  host: HTMLElement;
  cleanup: () => Promise<void>;
};

export async function mount(
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

export async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
  });
}

export function blockHost(host: HTMLElement, id: string): Element | null {
  return host.querySelector(`[data-block-id="${id}"]`);
}

// The element with this selector, in the whole document (popovers portal out of the editor).
export function find(selector: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(selector);
}

export function buttonWithLabel(label: string): HTMLElement | null {
  return find(`[aria-label="${label}"]`);
}

export async function click(element: Element | null): Promise<void> {
  if (!(element instanceof HTMLElement)) {
    throw new Error("Missing element to click.");
  }
  await act(async () => {
    element.click();
  });
}

// The mousedown, mouseup and click of a real pointer press, on a block that has never been focused.
export async function realClick(target: Element | null): Promise<void> {
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

export async function press(
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
export async function typeInto(input: HTMLInputElement, text: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  await act(async () => {
    setter?.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

export function fileInput(): HTMLInputElement {
  const input = find("[data-media-file-input]");
  if (!(input instanceof HTMLInputElement)) {
    throw new Error("Missing the file input.");
  }
  return input;
}

// Chooses a file in the source popover, the way the browser reports it.
export async function chooseFile(file: File): Promise<void> {
  const input = fileInput();
  Object.defineProperty(input, "files", { configurable: true, value: [file] });
  await act(async () => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

// Pastes files with plain text, the way a clipboard holds them.
export function pasteFiles(editor: SlateEditor, files: File[]): void {
  const data = new DataTransfer();
  data.setData("text/plain", "ignored");
  Object.defineProperty(data, "files", { configurable: true, value: files });
  editor.tf.insertData(data);
}

// Fires a media event on the player, as the browser does when metadata loads or playback fails.
export async function fireMedia(player: Element | null, type: string): Promise<void> {
  if (player === null) {
    throw new Error(`Missing the player for ${type}.`);
  }
  await act(async () => {
    player.dispatchEvent(new Event(type));
  });
}
