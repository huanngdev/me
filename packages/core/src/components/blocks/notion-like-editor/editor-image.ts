import {
  ElementApi,
  KEYS,
  PathApi,
  createSlatePlugin,
  nanoid,
  type SlateEditor,
  type TElement,
  type TRange,
} from "platejs";

export const imageHtmlDeserializer = {
  rules: [{ validNodeName: "IMG" }],
  parse({ element }: { element: HTMLElement }): TElement {
    const node: TElement = { type: KEYS.img, children: [{ text: "" }] };
    const src = element.getAttribute("src");
    if (src !== null && src.length > 0) {
      node.url = src;
    }

    const alt = element.getAttribute("alt");
    if (alt !== null) {
      node.alt = alt;
    }

    const caption = figureCaption(element);
    if (caption !== undefined) {
      node.caption = [{ text: caption }];
    }

    return node;
  },
};

function figureCaption(element: HTMLElement): string | undefined {
  const parent = element.parentElement;
  if (parent === null || parent.tagName !== "FIGURE") {
    return undefined;
  }

  for (const child of parent.children) {
    if (child.tagName !== "FIGCAPTION") {
      continue;
    }

    const text = child.textContent?.trim() ?? "";
    return text.length > 0 ? text : undefined;
  }

  return undefined;
}

import { applyUploadToBlock } from "./asset-references";
import { createUploadController, type UploadController } from "./upload-controller";
import {
  directText,
  isPlainParagraph,
  runEditorCommand,
  type EditorCommand,
} from "./editor-commands";
import type { AssetProbe, AssetStore, UploadSource, UploadState } from "./editor-assets";
import {
  IMAGE_ALT_MAX,
  IMAGE_ALIGNS,
  IMAGE_MAX_WIDTH,
  IMAGE_MIN_WIDTH,
  isSafeImageUrl,
  type ImageAlign,
} from "./editor-document-schema";
import { pasteRepairsOf, setPasteRepairs } from "./editor-paste";

// The slash menu that would also call these commands is DEV-125.
// This task's picker is the toolbar Replace button and Insert image on an empty image.

export const IMAGE_FILE_SKIPPED = "This file was not inserted. File blocks are not available yet.";
export const IMAGE_UNSAFE_URL = "An image with an unsafe URL was removed.";
export const IMAGE_DATA_URL = "An image stored as base64 could not be kept. It was removed.";
export const IMAGE_BOTH_SOURCES =
  "An image URL was removed because the image already has an asset.";
export const IMAGE_UPLOAD_INTERRUPTED = "Upload didn't finish";
export const IMAGE_NOT_FOUND = "Image not found";
export const IMAGE_STORAGE_UNAVAILABLE = "Browser storage for files is unavailable.";

const RESIZE_STEP = 16;

export const imageRuntimePlugin = createSlatePlugin({
  key: "imageRuntime",
  options: {
    revision: 0,
  },
});

type ImageRuntime = {
  store: AssetStore | null;
  controller: UploadController | null;
  uploads: Map<string, UploadState>;
  urls: Map<string, string>;
  missing: Set<string>;
  inflight: Set<string>;
};

type ImagePastePlan =
  | { kind: "image"; props: Record<string, unknown>; upload?: UploadSource }
  | { kind: "text"; text: string; repair: string }
  | { kind: "drop"; repair: string };

type AttachImageRuntimeOptions = {
  probe?: AssetProbe;
  createId?: () => string;
  now?: () => string;
};

const runtimes = new WeakMap<SlateEditor, ImageRuntime>();
const pastedUploads: { id: string; file: UploadSource }[] = [];

export function attachImageRuntime(
  editor: SlateEditor,
  store: AssetStore | null,
  options?: AttachImageRuntimeOptions,
): () => void {
  detachImageRuntime(editor);

  const runtime: ImageRuntime = {
    store,
    controller: null,
    uploads: new Map(),
    urls: new Map(),
    missing: new Set(),
    inflight: new Set(),
  };

  if (store) {
    runtime.controller = createUploadController({
      store,
      createId: options?.createId ?? nanoid,
      now: options?.now ?? (() => new Date().toISOString()),
      probe: options?.probe ?? probeImageSize,
      onChange: (state) => {
        acceptUploadState(editor, runtime, state);
      },
    });
  }

  runtimes.set(editor, runtime);
  const restoreChange = watchImageRemoval(editor, runtime);
  // A replaced runtime must re-run image effects. The new map is empty until they do.
  bumpRuntime(editor);

  return () => {
    restoreChange();
    detachImageRuntime(editor);
  };
}

export function detachImageRuntime(editor: SlateEditor): void {
  const runtime = runtimes.get(editor);
  if (!runtime) {
    return;
  }

  runtime.controller?.dispose();
  for (const url of runtime.urls.values()) {
    URL.revokeObjectURL(url);
  }
  runtime.urls.clear();
  runtimes.delete(editor);
}

export async function probeImageSize(
  blob: Blob,
): Promise<{ width?: number; height?: number } | undefined> {
  const create = globalThis.createImageBitmap;
  if (typeof create !== "function") {
    return undefined;
  }

  try {
    const image = await create(blob);
    const width = image.width;
    const height = image.height;
    image.close();
    if (!isPositivePixel(width) || !isPositivePixel(height)) {
      return undefined;
    }

    return { width, height };
  } catch {
    return undefined;
  }
}

export function imageUploadState(editor: SlateEditor, blockId: string): UploadState | undefined {
  const state = runtimes.get(editor)?.uploads.get(blockId);
  return state ? { ...state } : undefined;
}

export function cachedAssetUrl(editor: SlateEditor, assetId: string): string | undefined {
  return runtimes.get(editor)?.urls.get(assetId);
}

export function assetIsMissing(editor: SlateEditor, assetId: string): boolean {
  return runtimes.get(editor)?.missing.has(assetId) === true;
}

// Resolves an asset id to an object URL for this editor. The URL is cached until the editor unmounts.
export function resolveAssetURL(editor: SlateEditor, assetId: string): string | undefined {
  const runtime = runtimes.get(editor);
  if (!runtime) {
    return undefined;
  }

  const cached = runtime.urls.get(assetId);
  if (cached !== undefined) {
    return cached;
  }

  if (runtime.missing.has(assetId) || runtime.inflight.has(assetId)) {
    return undefined;
  }

  runtime.inflight.add(assetId);
  void loadAssetUrl(editor, runtime, assetId);
  return undefined;
}

export function queuePastedImageUpload(id: string, file: UploadSource): void {
  pastedUploads.push({ id, file });
}

export function flushPastedImageUploads(editor: SlateEditor): void {
  const batch = pastedUploads.splice(0, pastedUploads.length);
  for (const item of batch) {
    beginImageUpload(editor, item.id, item.file);
  }
}

export function planPastedImage(node: Record<string, unknown>): ImagePastePlan {
  const alt =
    typeof node.alt === "string" && node.alt.length <= IMAGE_ALT_MAX ? node.alt : undefined;
  const assetId =
    typeof node.assetId === "string" && node.assetId.length > 0 ? node.assetId : undefined;
  const url = typeof node.url === "string" ? node.url : undefined;
  const props = optionalImageProps(node, alt);

  if (url !== undefined && isDataImageUrl(url)) {
    const file = fileFromDataUrl(url);
    if (!file) {
      return alt === undefined || alt.length === 0
        ? { kind: "drop", repair: IMAGE_DATA_URL }
        : { kind: "text", text: alt, repair: IMAGE_DATA_URL };
    }

    return { kind: "image", props, upload: file };
  }

  if (assetId !== undefined && url !== undefined) {
    return { kind: "image", props: { ...props, assetId }, upload: undefined };
  }

  if (url !== undefined && !isSafeImageUrl(url)) {
    return alt === undefined || alt.length === 0
      ? { kind: "drop", repair: IMAGE_UNSAFE_URL }
      : { kind: "text", text: alt, repair: IMAGE_UNSAFE_URL };
  }

  if (assetId !== undefined) {
    props.assetId = assetId;
  }

  if (url !== undefined) {
    props.url = url;
  }

  return { kind: "image", props };
}

export type ImageDropEvent = {
  clientX: number;
  clientY: number;
  preventDefault: () => void;
  dataTransfer: DataTransfer | null;
  view: Window | null;
};

export function handleImageInsertData(
  editor: SlateEditor,
  data: DataTransfer,
  insertData: (data: DataTransfer) => void,
): boolean {
  const html = data.getData("text/html");
  const files = transferFiles(data);
  const images = files.filter(isImageUpload);
  const others = files.filter((file) => !isImageUpload(file));
  const table = html.toLowerCase().includes("<table");

  if (images.length > 0 && !table) {
    runEditorCommand(editor, insertImageFromFiles, images);
    // This path does not sanitize a fragment, so it replaces any earlier repair list.
    noteSkippedFiles(editor, others.length > 0, true);
    return others.length > 0;
  }

  insertData(data);
  const skipped = others.length > 0 || (images.length > 0 && table);
  noteSkippedFiles(editor, skipped, false);
  return skipped;
}

export function handleImageDrop(editor: SlateEditor, event: ImageDropEvent): boolean {
  const data = event.dataTransfer;
  if (!data) {
    return false;
  }

  const files = transferFiles(data);
  const images = files.filter(isImageUpload);
  const others = files.filter((file) => !isImageUpload(file));
  if (images.length === 0 && others.length === 0) {
    return false;
  }

  event.preventDefault();
  if (images.length > 0 && editor.dom.readOnly !== true) {
    editor.tf.withNewBatch(() => {
      selectDropPoint(editor, event);
      insertImageFiles(editor, images, "local");
    });
    editor.tf.setSplittingOnce(true);
  }

  noteSkippedFiles(editor, others.length > 0, true);
  return others.length > 0;
}

function noteSkippedFiles(editor: SlateEditor, skipped: boolean, replace: boolean): void {
  if (!skipped) {
    if (replace) {
      setPasteRepairs(editor, []);
    }
    return;
  }

  const current = replace ? [] : pasteRepairsOf(editor);
  setPasteRepairs(editor, [...current, { path: [], message: IMAGE_FILE_SKIPPED }]);
}

export function beginImageUpload(editor: SlateEditor, blockId: string, file: UploadSource): void {
  const runtime = runtimes.get(editor);
  if (!runtime) {
    return;
  }

  const current = runtime.uploads.get(blockId);
  if (
    current &&
    runtime.controller &&
    current.status !== "ready" &&
    current.status !== "canceled"
  ) {
    runtime.controller.cancel(current.uploadId);
  }

  if (!runtime.controller) {
    runtime.uploads.set(blockId, {
      uploadId: nanoid(),
      blockId,
      kind: "image",
      name: file.name,
      status: "failed",
      error: IMAGE_STORAGE_UNAVAILABLE,
    });
    bumpRuntime(editor);
    return;
  }

  runtime.controller.start(file, { blockId, kind: "image" });
}

export function retryImageUpload(editor: SlateEditor, blockId: string): void {
  const runtime = runtimes.get(editor);
  const state = runtime?.uploads.get(blockId);
  if (!runtime?.controller || !state || editor.dom.readOnly === true) {
    return;
  }

  void runtime.controller.retry(state.uploadId);
}

export const insertImageFromFiles: EditorCommand<readonly UploadSource[]> = {
  id: "block.insert.image",
  label: "Image",
  group: "insert",
  run: (editor, files) => {
    if (editor.dom.readOnly === true) {
      return;
    }

    insertImageFiles(editor, files, "highest");
  },
};

export const insertImageFromUrl: EditorCommand<string> = {
  id: "block.insert.image-url",
  label: "Image from URL",
  group: "insert",
  run: (editor, url) => {
    if (editor.dom.readOnly === true) {
      return;
    }

    const trimmed = url.trim();
    if (!isSafeImageUrl(trimmed)) {
      return;
    }

    insertImageFiles(editor, [], "highest", { id: nanoid(), url: trimmed });
  },
};

export const setImageAlign: EditorCommand<{ id: string; align: ImageAlign | null }> = {
  id: "block.image.align",
  label: "Align image",
  group: "action",
  run: (editor, payload) => {
    const entry = writableImage(editor, payload.id);
    if (!entry) {
      return;
    }

    if (payload.align === null) {
      editor.tf.unsetNodes("align", { at: entry[1] });
      return;
    }

    if (!IMAGE_ALIGNS.some((align) => align === payload.align)) {
      return;
    }

    editor.tf.setNodes({ align: payload.align }, { at: entry[1] });
  },
};

export const setImageAlt: EditorCommand<{ id: string; alt: string | null }> = {
  id: "block.image.alt",
  label: "Alt text",
  group: "action",
  run: (editor, payload) => {
    const entry = writableImage(editor, payload.id);
    if (!entry) {
      return;
    }

    if (payload.alt === null) {
      editor.tf.unsetNodes("alt", { at: entry[1] });
      return;
    }

    if (payload.alt.length > IMAGE_ALT_MAX) {
      return;
    }

    editor.tf.setNodes({ alt: payload.alt }, { at: entry[1] });
  },
};

export const setImageWidth: EditorCommand<{ id: string; width: number | null }> = {
  id: "block.image.width",
  label: "Image width",
  group: "action",
  run: (editor, payload) => {
    const entry = writableImage(editor, payload.id);
    if (!entry) {
      return;
    }

    if (payload.width === null) {
      editor.tf.unsetNodes("width", { at: entry[1] });
      return;
    }

    if (!isPositivePixel(payload.width)) {
      return;
    }

    editor.tf.setNodes(
      { width: clampImageWidth(payload.width, IMAGE_MAX_WIDTH) },
      { at: entry[1] },
    );
  },
};

export const removeImage: EditorCommand<string> = {
  id: "block.image.remove",
  label: "Remove image",
  group: "action",
  run: (editor, id) => {
    const entry = writableImage(editor, id);
    if (!entry) {
      return;
    }

    cancelImageUpload(editor, id);
    editor.tf.removeNodes({ at: entry[1], voids: true });
  },
};

export const replaceImageFromFile: EditorCommand<{ id: string; file: UploadSource }> = {
  id: "block.image.replace",
  label: "Replace image",
  group: "action",
  run: (editor, payload) => {
    const entry = writableImage(editor, payload.id);
    if (!entry) {
      return;
    }

    cancelImageUpload(editor, payload.id);
    editor.tf.unsetNodes(["url", "assetId", "naturalWidth", "naturalHeight"], { at: entry[1] });
    beginImageUpload(editor, payload.id, payload.file);
  },
};

export function clampImageWidth(width: number, containerWidth: number): number {
  const cap = Math.max(IMAGE_MIN_WIDTH, Math.min(IMAGE_MAX_WIDTH, Math.floor(containerWidth)));
  return Math.min(cap, Math.max(IMAGE_MIN_WIDTH, Math.round(width)));
}

export function imageResizeStep(): number {
  return RESIZE_STEP;
}

function insertImageFiles(
  editor: SlateEditor,
  files: readonly UploadSource[],
  scope: "highest" | "local",
  single?: Record<string, unknown>,
): void {
  if (single) {
    const id = typeof single.id === "string" ? single.id : nanoid();
    placeImage(editor, { ...single, id }, scope);
    return;
  }

  for (const file of files) {
    const id = nanoid();
    placeImage(editor, { id }, scope);
    beginImageUpload(editor, id, file);
  }
}

function placeImage(
  editor: SlateEditor,
  props: Record<string, unknown>,
  scope: "highest" | "local",
): void {
  const entry = scope === "highest" ? editor.api.block({ highest: true }) : editor.api.block();
  if (!entry || !ElementApi.isElement(entry[0]) || typeof entry[0].type !== "string") {
    return;
  }

  const [node, path] = entry;
  let imagePath = path;
  const replace =
    isPlainParagraph(node) &&
    directText(node).length === 0 &&
    (scope === "local" || path.length === 1);
  if (replace) {
    const drop = Object.keys(node).filter(
      (key) => key !== "type" && key !== "children" && key !== "id",
    );
    if (drop.length > 0) {
      editor.tf.unsetNodes(drop, { at: path });
    }
    editor.tf.setNodes({ type: KEYS.img, ...props }, { at: path });
  } else {
    const at = PathApi.next(path);
    if (!at) {
      return;
    }

    editor.tf.insertNodes(imageElement(props), { at, select: false });
    imagePath = at;
  }

  const after = PathApi.next(imagePath);
  if (!after) {
    return;
  }

  const next = editor.api.node(after);
  const nextNode = next?.[0];
  if (
    next &&
    next[1].length === imagePath.length &&
    ElementApi.isElement(nextNode) &&
    isPlainParagraph(nextNode)
  ) {
    const start = editor.api.start(after);
    if (start) {
      editor.tf.select(start);
    }
    return;
  }

  editor.tf.insertNodes({ type: KEYS.p, children: [{ text: "" }] }, { at: after, select: true });
}

function imageElement(props: Record<string, unknown>): TElement {
  return {
    type: KEYS.img,
    children: [{ text: "" }],
    ...props,
  };
}

function writableImage(editor: SlateEditor, id: string): [TElement, number[]] | undefined {
  if (editor.dom.readOnly === true) {
    return undefined;
  }

  return imageEntry(editor, id);
}

function imageEntry(editor: SlateEditor, id: string): [TElement, number[]] | undefined {
  for (const [node, path] of editor.api.nodes({
    at: [],
    match: (candidate) =>
      ElementApi.isElement(candidate) && candidate.type === KEYS.img && candidate.id === id,
  })) {
    if (ElementApi.isElement(node)) {
      return [node, path];
    }
  }

  return undefined;
}

function cancelImageUpload(editor: SlateEditor, blockId: string): void {
  const runtime = runtimes.get(editor);
  const state = runtime?.uploads.get(blockId);
  if (!runtime?.controller || !state || state.status === "ready" || state.status === "canceled") {
    runtime?.uploads.delete(blockId);
    return;
  }

  runtime.controller.cancel(state.uploadId);
  runtime.uploads.delete(blockId);
  bumpRuntime(editor);
}

function acceptUploadState(editor: SlateEditor, runtime: ImageRuntime, state: UploadState): void {
  if (state.status === "canceled") {
    runtime.uploads.delete(state.blockId);
    bumpRuntime(editor);
    return;
  }

  runtime.uploads.set(state.blockId, state);
  bumpRuntime(editor);
  if (state.status !== "ready" || state.assetId === undefined || !runtime.store) {
    return;
  }

  const assetId = state.assetId;
  const blockId = state.blockId;
  void runtime.store.get(assetId).then((stored) => {
    if (!stored || runtimes.get(editor) !== runtime) {
      return;
    }

    const props: Record<string, unknown> = { assetId };
    if (isPositivePixel(stored.record.width) && isPositivePixel(stored.record.height)) {
      props.naturalWidth = stored.record.width;
      props.naturalHeight = stored.record.height;
    }

    const entry = imageEntry(editor, blockId);
    if (!entry) {
      return;
    }

    const node = entry[0];
    if (typeof node.assetId === "string" || typeof node.url === "string") {
      return;
    }

    if (applyUploadToBlock(editor, blockId, props)) {
      // The write is not its own undo step. Fold it into the insert or replace
      // so one undo restores the block that was there before the upload.
      rememberAssetWrite(editor, blockId, props);
    }
    bumpRuntime(editor);
  });
}

function isSetNodeOperation(value: unknown): value is {
  type: "set_node";
  path: number[];
  properties: Record<string, unknown>;
  newProperties: Record<string, unknown>;
} {
  if (
    typeof value !== "object" ||
    value === null ||
    !("type" in value) ||
    value.type !== "set_node"
  ) {
    return false;
  }

  if (
    !("path" in value) ||
    !Array.isArray(value.path) ||
    !value.path.every((step) => typeof step === "number")
  ) {
    return false;
  }

  return (
    "properties" in value &&
    typeof value.properties === "object" &&
    value.properties !== null &&
    "newProperties" in value &&
    typeof value.newProperties === "object" &&
    value.newProperties !== null
  );
}

// Slate deletes a property on undo when it is in newProperties and absent from properties.
function rememberAssetWrite(
  editor: SlateEditor,
  blockId: string,
  props: Record<string, unknown>,
): void {
  const entry = imageEntry(editor, blockId);
  const undos: unknown = editor.history.undos;
  if (!entry || !Array.isArray(undos) || undos.length === 0) {
    return;
  }

  const batch: unknown = undos[undos.length - 1];
  if (
    typeof batch !== "object" ||
    batch === null ||
    !("operations" in batch) ||
    !Array.isArray(batch.operations)
  ) {
    return;
  }

  for (let index = batch.operations.length - 1; index >= 0; index -= 1) {
    const operation: unknown = batch.operations[index];
    if (!isSetNodeOperation(operation) || !PathApi.equals(operation.path, entry[1])) {
      continue;
    }

    for (const [key, value] of Object.entries(props)) {
      operation.newProperties[key] = value;
    }
    return;
  }
}

function watchImageRemoval(editor: SlateEditor, runtime: ImageRuntime): () => void {
  const onChange = editor.onChange;
  if (typeof onChange !== "function") {
    return () => undefined;
  }

  const wrapped = (options?: { operation?: unknown }): void => {
    onChange(options);
    if (runtimes.get(editor) !== runtime) {
      return;
    }

    for (const [blockId, state] of runtime.uploads) {
      if (state.status === "ready" || state.status === "canceled") {
        continue;
      }

      if (!imageEntry(editor, blockId)) {
        runtime.controller?.cancel(state.uploadId);
        runtime.uploads.delete(blockId);
      }
    }
  };

  editor.onChange = wrapped;
  return () => {
    if (editor.onChange === wrapped) {
      editor.onChange = onChange;
    }
  };
}

async function loadAssetUrl(
  editor: SlateEditor,
  runtime: ImageRuntime,
  assetId: string,
): Promise<void> {
  try {
    if (!runtime.store) {
      runtime.missing.add(assetId);
      return;
    }

    const stored = await runtime.store.get(assetId);
    if (runtimes.get(editor) !== runtime) {
      return;
    }

    if (!stored) {
      runtime.missing.add(assetId);
      return;
    }

    runtime.urls.set(assetId, URL.createObjectURL(stored.blob));
  } catch {
    if (runtimes.get(editor) === runtime) {
      runtime.missing.add(assetId);
    }
  } finally {
    runtime.inflight.delete(assetId);
    // A load that finishes after a new runtime is attached still has to wake that runtime.
    if (runtimes.has(editor)) {
      bumpRuntime(editor);
    }
  }
}

function bumpRuntime(editor: SlateEditor): void {
  const current = editor.getOption(imageRuntimePlugin, "revision");
  editor.setOption(imageRuntimePlugin, "revision", current + 1);
}

function optionalImageProps(
  node: Record<string, unknown>,
  alt: string | undefined,
): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  if (alt !== undefined) {
    props.alt = alt;
  }

  if (node.align === "left" || node.align === "right") {
    props.align = node.align;
  }

  if (
    typeof node.width === "number" &&
    node.width >= IMAGE_MIN_WIDTH &&
    node.width <= IMAGE_MAX_WIDTH &&
    Number.isInteger(node.width)
  ) {
    props.width = node.width;
  }

  if (isPositivePixel(node.naturalWidth) && isPositivePixel(node.naturalHeight)) {
    props.naturalWidth = node.naturalWidth;
    props.naturalHeight = node.naturalHeight;
  }

  if (isCaption(node.caption)) {
    props.caption = node.caption;
  }

  return props;
}

function isCaption(value: unknown): boolean {
  if (!Array.isArray(value) || value.length === 0) {
    return false;
  }

  return value.every((item) => {
    if (typeof item !== "object" || item === null || !("text" in item)) {
      return false;
    }

    return typeof item.text === "string" && !("children" in item);
  });
}

function isDataImageUrl(value: string): boolean {
  return value.trim().toLowerCase().startsWith("data:");
}

function fileFromDataUrl(url: string): UploadSource | undefined {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i.exec(url.trim());
  const mime = match?.[1]?.toLowerCase();
  const payload = match?.[2];
  if (!mime || !payload) {
    return undefined;
  }

  let binary: string;
  try {
    binary = atob(payload.replace(/\s/g, ""));
  } catch {
    return undefined;
  }

  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index) & 0xff;
  }

  const extension = mime.slice("image/".length).replace("+xml", "").replace("jpeg", "jpg");
  const blob = new Blob([bytes], { type: mime });
  return {
    name: `pasted.${extension}`,
    type: mime,
    size: bytes.byteLength,
    slice: (start, end) => blob.slice(start, end),
  };
}

function isImageUpload(file: UploadSource): boolean {
  return file.type.toLowerCase().startsWith("image/");
}

function isUploadSource(value: unknown): value is UploadSource {
  return (
    typeof value === "object" &&
    value !== null &&
    "name" in value &&
    typeof value.name === "string" &&
    "type" in value &&
    typeof value.type === "string" &&
    "size" in value &&
    typeof value.size === "number" &&
    "slice" in value &&
    typeof value.slice === "function"
  );
}

function transferFiles(data: DataTransfer): UploadSource[] {
  const files: UploadSource[] = [];
  const list: unknown = data.files;
  if (
    typeof list !== "object" ||
    list === null ||
    !("length" in list) ||
    typeof list.length !== "number"
  ) {
    return files;
  }

  for (let index = 0; index < list.length; index += 1) {
    const file: unknown = Reflect.get(list, index);
    if (isUploadSource(file)) {
      files.push(file);
    }
  }

  return files;
}

function selectDropPoint(editor: SlateEditor, event: ImageDropEvent): void {
  const view = event.view;
  if (view === null) {
    return;
  }

  const domRange = view.document.caretRangeFromPoint(event.clientX, event.clientY);
  if (domRange === null) {
    return;
  }

  const range = slateRangeFromDom(editor, domRange);
  if (range) {
    editor.tf.select(range);
  }
}

function slateRangeFromDom(editor: SlateEditor, domRange: Range): TRange | undefined {
  const method: unknown = Reflect.get(editor.api, "toSlateRange");
  if (typeof method !== "function") {
    return undefined;
  }

  const result: unknown = Reflect.apply(method, editor.api, [
    editor,
    domRange,
    { exactMatch: false },
  ]);
  return isSlateRange(result) ? result : undefined;
}

function isSlatePoint(value: unknown): value is { path: number[]; offset: number } {
  if (typeof value !== "object" || value === null || !("path" in value) || !("offset" in value)) {
    return false;
  }

  const path: unknown = value.path;
  return (
    Array.isArray(path) &&
    path.every((step) => typeof step === "number") &&
    typeof value.offset === "number"
  );
}

function isSlateRange(value: unknown): value is TRange {
  if (typeof value !== "object" || value === null || !("anchor" in value) || !("focus" in value)) {
    return false;
  }

  return isSlatePoint(value.anchor) && isSlatePoint(value.focus);
}

function isPositivePixel(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

// planPastedImage records the both-sources repair at the call site when both keys were present.
export function pastedImageDroppedUrl(node: Record<string, unknown>): boolean {
  return (
    typeof node.assetId === "string" && node.assetId.length > 0 && typeof node.url === "string"
  );
}
