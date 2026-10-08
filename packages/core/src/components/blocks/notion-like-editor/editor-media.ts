import {
  ElementApi,
  PathApi,
  createSlatePlugin,
  nanoid,
  type SlateEditor,
  type TElement,
  type TRange,
} from "platejs";

import { applyUploadToBlock } from "./asset-references";
import { createUploadController, type UploadController } from "./upload-controller";
import { directText, isPlainParagraph, type EditorCommand } from "./editor-commands";
import type {
  AssetProbe,
  AssetRecord,
  AssetStore,
  UploadSource,
  UploadState,
} from "./editor-assets";
import { isSafeImageUrl } from "./editor-document-schema";
import { pasteRepairsOf, setPasteRepairs } from "./editor-paste";

// Anything that is not an image or a video stays here until file blocks exist.
export const MEDIA_FILE_SKIPPED = "This file was not inserted. File blocks are not available yet.";

const RESIZE_STEP = 16;

export type MediaRole = "source" | "poster";

export type MediaDropEvent = {
  clientX: number;
  clientY: number;
  preventDefault: () => void;
  dataTransfer: DataTransfer | null;
  view: Window | null;
};

export type MediaPastePlan =
  | { kind: "media"; props: Record<string, unknown>; upload?: UploadSource }
  | { kind: "text"; text: string; repair: string }
  | { kind: "drop"; repair: string };

type MediaMessages = {
  unsafeUrl: string;
  bothSources: string;
  uploadInterrupted: string;
  notFound: string;
  storageUnavailable: string;
  dataUrl?: string;
};

type ReadyWrite = {
  props: Record<string, unknown>;
  unset: readonly string[];
  // fold: the asset id joins the insert or replace undo.
  // own: the write is its own undo step.
  save: "fold" | "own";
};

export type MediaKindSpec = {
  nodeType: string;
  assetKind: AssetRecord["kind"];
  pluginKey: string;
  mimePrefix: string;
  minWidth: number;
  maxWidth: number;
  aligns: readonly string[];
  messages: MediaMessages;
  replaceUnset: readonly string[];
  commands: {
    insertFiles: { id: string; label: string };
    insertUrl: { id: string; label: string };
    align: { id: string; label: string };
    width: { id: string; label: string };
    remove: { id: string; label: string };
    replace: { id: string; label: string };
  };
  readProps: (node: Record<string, unknown>) => Record<string, unknown>;
  fallbackText?: (node: Record<string, unknown>) => string | undefined;
  dataUrlFile?: (url: string) => UploadSource | undefined;
  rejectUrl?: (url: string) => string | undefined;
  onRejectedUrl?: (editor: SlateEditor, url: string, message: string) => void;
  applyReady: (record: AssetRecord, role: MediaRole) => ReadyWrite;
  probe?: AssetProbe;
};

type CachedAsset = {
  url: string;
  objectUrl: boolean;
  name?: string;
};

type MediaRuntime = {
  store: AssetStore | null;
  controller: UploadController | null;
  uploads: Map<string, UploadState>;
  roles: Map<string, MediaRole>;
  cache: Map<string, CachedAsset>;
  refreshed: Set<string>;
  missing: Set<string>;
  inflight: Set<string>;
};

type MediaRoute = {
  mimePrefix: string;
  insert: (editor: SlateEditor, files: readonly UploadSource[], scope: "highest" | "local") => void;
};

const routes: MediaRoute[] = [];

export type MediaKind = ReturnType<typeof createMediaKind>;

export function createMediaKind(spec: MediaKindSpec) {
  const plugin = createSlatePlugin({
    key: spec.pluginKey,
    options: { revision: 0 },
  });
  const runtimes = new WeakMap<SlateEditor, MediaRuntime>();
  const pastedUploads: { id: string; file: UploadSource }[] = [];

  function bump(editor: SlateEditor): void {
    const current = editor.getOption(plugin, "revision");
    editor.setOption(plugin, "revision", current + 1);
  }

  function findEntry(editor: SlateEditor, id: string): [TElement, number[]] | undefined {
    for (const [node, path] of editor.api.nodes({
      at: [],
      match: (candidate) =>
        ElementApi.isElement(candidate) && candidate.type === spec.nodeType && candidate.id === id,
    })) {
      if (ElementApi.isElement(node)) {
        return [node, path];
      }
    }

    return undefined;
  }

  function writable(editor: SlateEditor, id: string): [TElement, number[]] | undefined {
    if (editor.dom.readOnly === true) {
      return undefined;
    }

    return findEntry(editor, id);
  }

  function attach(
    editor: SlateEditor,
    store: AssetStore | null,
    options?: { probe?: AssetProbe; createId?: () => string; now?: () => string },
  ): () => void {
    detach(editor);

    const runtime: MediaRuntime = {
      store,
      controller: null,
      uploads: new Map(),
      roles: new Map(),
      cache: new Map(),
      refreshed: new Set(),
      missing: new Set(),
      inflight: new Set(),
    };

    if (store) {
      runtime.controller = createUploadController({
        store,
        createId: options?.createId ?? nanoid,
        now: options?.now ?? (() => new Date().toISOString()),
        probe: options?.probe ?? spec.probe,
        onChange: (state) => {
          acceptUploadState(editor, runtime, state);
        },
      });
    }

    runtimes.set(editor, runtime);
    const restoreChange = watchRemoval(editor, runtime);
    // A replaced runtime must re-run media effects. The new map is empty until they do.
    bump(editor);

    return () => {
      restoreChange();
      detach(editor);
    };
  }

  function detach(editor: SlateEditor): void {
    const runtime = runtimes.get(editor);
    if (!runtime) {
      return;
    }

    runtime.controller?.dispose();
    for (const cached of runtime.cache.values()) {
      if (cached.objectUrl) {
        URL.revokeObjectURL(cached.url);
      }
    }
    runtime.cache.clear();
    runtimes.delete(editor);
  }

  function uploadState(editor: SlateEditor, blockId: string): UploadState | undefined {
    const state = runtimes.get(editor)?.uploads.get(blockId);
    return state ? { ...state } : undefined;
  }

  function uploadRole(editor: SlateEditor, blockId: string): MediaRole | undefined {
    return runtimes.get(editor)?.roles.get(blockId);
  }

  function cachedAssetUrl(editor: SlateEditor, assetId: string): string | undefined {
    return runtimes.get(editor)?.cache.get(assetId)?.url;
  }

  function assetFileName(editor: SlateEditor, assetId: string): string | undefined {
    return runtimes.get(editor)?.cache.get(assetId)?.name;
  }

  function assetIsMissing(editor: SlateEditor, assetId: string): boolean {
    return runtimes.get(editor)?.missing.has(assetId) === true;
  }

  function assetIsAdapter(editor: SlateEditor, assetId: string): boolean {
    const runtime = runtimes.get(editor);
    if (runtime?.store?.resolveUrl === undefined) {
      return false;
    }

    const cached = runtime.cache.get(assetId);
    return cached !== undefined && !cached.objectUrl;
  }

  function resolveAssetURL(editor: SlateEditor, assetId: string): string | undefined {
    const runtime = runtimes.get(editor);
    if (!runtime) {
      return undefined;
    }

    const cached = runtime.cache.get(assetId);
    if (cached !== undefined) {
      return cached.url;
    }

    if (runtime.missing.has(assetId) || runtime.inflight.has(assetId)) {
      return undefined;
    }

    runtime.inflight.add(assetId);
    void loadAssetUrl(editor, runtime, assetId);
    return undefined;
  }

  function refreshAssetURL(editor: SlateEditor, assetId: string): boolean {
    const runtime = runtimes.get(editor);
    const cached = runtime?.cache.get(assetId);
    if (!runtime || !cached || cached.objectUrl || runtime.refreshed.has(assetId)) {
      return false;
    }

    runtime.refreshed.add(assetId);
    runtime.cache.delete(assetId);
    runtime.missing.delete(assetId);
    void loadAssetUrl(editor, runtime, assetId);
    return true;
  }

  function queuePastedUpload(id: string, file: UploadSource): void {
    pastedUploads.push({ id, file });
  }

  function flushPastedUploads(editor: SlateEditor): void {
    const batch = pastedUploads.splice(0, pastedUploads.length);
    for (const item of batch) {
      beginUpload(editor, item.id, item.file, "source");
    }
  }

  function planPasted(node: Record<string, unknown>): MediaPastePlan {
    const props = spec.readProps(node);
    const assetId =
      typeof node.assetId === "string" && node.assetId.length > 0 ? node.assetId : undefined;
    const url = typeof node.url === "string" ? node.url : undefined;
    const fallback = spec.fallbackText?.(node);

    if (url !== undefined && spec.dataUrlFile && isDataUrl(url)) {
      const file = spec.dataUrlFile(url);
      const repair = spec.messages.dataUrl ?? spec.messages.unsafeUrl;
      if (!file) {
        return fallback === undefined
          ? { kind: "drop", repair }
          : { kind: "text", text: fallback, repair };
      }

      return { kind: "media", props, upload: file };
    }

    if (assetId !== undefined && url !== undefined) {
      return { kind: "media", props: { ...props, assetId } };
    }

    if (url !== undefined && spec.rejectUrl) {
      const message = spec.rejectUrl(url);
      if (message !== undefined) {
        return fallback === undefined
          ? { kind: "drop", repair: message }
          : { kind: "text", text: fallback, repair: message };
      }
    }

    if (url !== undefined && !isSafeImageUrl(url)) {
      return fallback === undefined
        ? { kind: "drop", repair: spec.messages.unsafeUrl }
        : { kind: "text", text: fallback, repair: spec.messages.unsafeUrl };
    }

    if (assetId !== undefined) {
      props.assetId = assetId;
    }

    if (url !== undefined) {
      props.url = url;
    }

    return { kind: "media", props };
  }

  function pastedDroppedUrl(node: Record<string, unknown>): boolean {
    return (
      typeof node.assetId === "string" && node.assetId.length > 0 && typeof node.url === "string"
    );
  }

  function beginUpload(
    editor: SlateEditor,
    blockId: string,
    file: UploadSource,
    role: MediaRole,
  ): void {
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

    runtime.roles.set(blockId, role);
    if (!runtime.controller) {
      runtime.uploads.set(blockId, {
        uploadId: nanoid(),
        blockId,
        kind: role === "poster" ? "image" : spec.assetKind,
        name: file.name,
        status: "failed",
        error: spec.messages.storageUnavailable,
      });
      bump(editor);
      return;
    }

    runtime.controller.start(file, {
      blockId,
      kind: role === "poster" ? "image" : spec.assetKind,
    });
  }

  function holdUpload(editor: SlateEditor, blockId: string): void {
    const runtime = runtimes.get(editor);
    const state = runtime?.uploads.get(blockId);
    if (
      !runtime?.controller ||
      !state ||
      (state.status !== "pending" && state.status !== "processing")
    ) {
      return;
    }

    runtime.controller.hold(state.uploadId);
  }

  function retryUpload(editor: SlateEditor, blockId: string): void {
    const runtime = runtimes.get(editor);
    const state = runtime?.uploads.get(blockId);
    if (!runtime?.controller || !state || editor.dom.readOnly === true) {
      return;
    }

    void runtime.controller.retry(state.uploadId);
  }

  function insertFiles(
    editor: SlateEditor,
    files: readonly UploadSource[],
    scope: "highest" | "local",
  ): void {
    if (editor.dom.readOnly === true) {
      return;
    }

    for (const file of files) {
      const id = nanoid();
      place(editor, { id }, scope);
      beginUpload(editor, id, file, "source");
    }
  }

  const insertFromFiles: EditorCommand<readonly UploadSource[]> = {
    id: spec.commands.insertFiles.id,
    label: spec.commands.insertFiles.label,
    group: "insert",
    run: (editor, files) => {
      insertFiles(editor, files, "highest");
    },
  };

  const insertFromUrl: EditorCommand<string> = {
    id: spec.commands.insertUrl.id,
    label: spec.commands.insertUrl.label,
    group: "insert",
    run: (editor, url) => {
      if (editor.dom.readOnly === true) {
        return;
      }

      const trimmed = url.trim();
      const rejected = spec.rejectUrl?.(trimmed);
      if (rejected !== undefined) {
        spec.onRejectedUrl?.(editor, trimmed, rejected);
        return;
      }

      if (!isSafeImageUrl(trimmed)) {
        return;
      }

      place(editor, { id: nanoid(), url: trimmed }, "highest");
    },
  };

  const setAlign: EditorCommand<{ id: string; align: string | null }> = {
    id: spec.commands.align.id,
    label: spec.commands.align.label,
    group: "action",
    run: (editor, payload) => {
      const entry = writable(editor, payload.id);
      if (!entry) {
        return;
      }

      if (payload.align === null) {
        editor.tf.unsetNodes("align", { at: entry[1] });
        return;
      }

      if (!spec.aligns.some((align) => align === payload.align)) {
        return;
      }

      editor.tf.setNodes({ align: payload.align }, { at: entry[1] });
    },
  };

  const setWidth: EditorCommand<{ id: string; width: number | null }> = {
    id: spec.commands.width.id,
    label: spec.commands.width.label,
    group: "action",
    run: (editor, payload) => {
      const entry = writable(editor, payload.id);
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

      editor.tf.setNodes({ width: clampWidth(payload.width, spec.maxWidth) }, { at: entry[1] });
    },
  };

  const remove: EditorCommand<string> = {
    id: spec.commands.remove.id,
    label: spec.commands.remove.label,
    group: "action",
    run: (editor, id) => {
      const entry = writable(editor, id);
      if (!entry) {
        return;
      }

      cancelUpload(editor, id);
      editor.tf.removeNodes({ at: entry[1], voids: true });
    },
  };

  const replaceFromFile: EditorCommand<{ id: string; file: UploadSource }> = {
    id: spec.commands.replace.id,
    label: spec.commands.replace.label,
    group: "action",
    run: (editor, payload) => {
      const entry = writable(editor, payload.id);
      if (!entry) {
        return;
      }

      cancelUpload(editor, payload.id);
      editor.tf.unsetNodes([...spec.replaceUnset], { at: entry[1] });
      beginUpload(editor, payload.id, payload.file, "source");
    },
  };

  function clampWidth(width: number, containerWidth: number): number {
    const cap = Math.max(spec.minWidth, Math.min(spec.maxWidth, Math.floor(containerWidth)));
    return Math.min(cap, Math.max(spec.minWidth, Math.round(width)));
  }

  function place(
    editor: SlateEditor,
    props: Record<string, unknown>,
    scope: "highest" | "local",
  ): void {
    const entry = scope === "highest" ? editor.api.block({ highest: true }) : editor.api.block();
    if (!entry || !ElementApi.isElement(entry[0]) || typeof entry[0].type !== "string") {
      return;
    }

    const [node, path] = entry;
    let mediaPath = path;
    const replaceEmpty =
      isPlainParagraph(node) &&
      directText(node).length === 0 &&
      (scope === "local" || path.length === 1);
    if (replaceEmpty) {
      const drop = Object.keys(node).filter(
        (key) => key !== "type" && key !== "children" && key !== "id",
      );
      if (drop.length > 0) {
        editor.tf.unsetNodes(drop, { at: path });
      }
      editor.tf.setNodes({ type: spec.nodeType, ...props }, { at: path });
    } else {
      const at = PathApi.next(path);
      if (!at) {
        return;
      }

      editor.tf.insertNodes(mediaElement(props), { at, select: false });
      mediaPath = at;
    }

    const after = PathApi.next(mediaPath);
    if (!after) {
      return;
    }

    const next = editor.api.node(after);
    const nextNode = next?.[0];
    if (
      next &&
      next[1].length === mediaPath.length &&
      ElementApi.isElement(nextNode) &&
      isPlainParagraph(nextNode)
    ) {
      const start = editor.api.start(after);
      if (start) {
        editor.tf.select(start);
      }
      return;
    }

    editor.tf.insertNodes({ type: "p", children: [{ text: "" }] }, { at: after, select: true });
  }

  function mediaElement(props: Record<string, unknown>): TElement {
    return {
      type: spec.nodeType,
      children: [{ text: "" }],
      ...props,
    };
  }

  function cancelUpload(editor: SlateEditor, blockId: string): void {
    const runtime = runtimes.get(editor);
    const state = runtime?.uploads.get(blockId);
    if (!runtime?.controller || !state || state.status === "ready" || state.status === "canceled") {
      runtime?.uploads.delete(blockId);
      runtime?.roles.delete(blockId);
      return;
    }

    runtime.controller.cancel(state.uploadId);
    runtime.uploads.delete(blockId);
    runtime.roles.delete(blockId);
    bump(editor);
  }

  function acceptUploadState(editor: SlateEditor, runtime: MediaRuntime, state: UploadState): void {
    if (state.status === "canceled") {
      runtime.uploads.delete(state.blockId);
      runtime.roles.delete(state.blockId);
      bump(editor);
      return;
    }

    runtime.uploads.set(state.blockId, state);
    bump(editor);
    if (state.status !== "ready" || state.assetId === undefined || !runtime.store) {
      return;
    }

    const assetId = state.assetId;
    const blockId = state.blockId;
    const role = runtime.roles.get(blockId) ?? "source";
    void runtime.store.get(assetId).then((stored) => {
      if (!stored || runtimes.get(editor) !== runtime) {
        return;
      }

      const entry = findEntry(editor, blockId);
      if (!entry) {
        return;
      }

      const write = spec.applyReady(stored.record, role);
      if (write.save === "own") {
        editor.tf.withNewBatch(() => {
          editor.tf.setNodes(write.props, { at: entry[1] });
          if (write.unset.length > 0) {
            editor.tf.unsetNodes([...write.unset], { at: entry[1] });
          }
        });
        bump(editor);
        return;
      }

      const node = entry[0];
      if (typeof node.assetId === "string" || typeof node.url === "string") {
        return;
      }

      if (applyUploadToBlock(editor, blockId, write.props)) {
        // The write is not its own undo step. Fold it into the insert or replace
        // so one undo restores the block that was there before the upload.
        rememberAssetWrite(editor, blockId, write.props);
      }
      bump(editor);
    });
  }

  function rememberAssetWrite(
    editor: SlateEditor,
    blockId: string,
    props: Record<string, unknown>,
  ): void {
    const entry = findEntry(editor, blockId);
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

  function watchRemoval(editor: SlateEditor, runtime: MediaRuntime): () => void {
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

        if (!findEntry(editor, blockId)) {
          runtime.controller?.cancel(state.uploadId);
          runtime.uploads.delete(blockId);
          runtime.roles.delete(blockId);
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
    runtime: MediaRuntime,
    assetId: string,
  ): Promise<void> {
    try {
      if (!runtime.store) {
        runtime.missing.add(assetId);
        return;
      }

      if (runtime.store.resolveUrl) {
        const resolved = await runtime.store.resolveUrl(assetId);
        if (runtimes.get(editor) !== runtime) {
          return;
        }

        if (!isResolvedUrl(resolved)) {
          runtime.missing.add(assetId);
          return;
        }

        runtime.cache.set(assetId, { url: resolved.url, objectUrl: false });
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

      runtime.cache.set(assetId, {
        url: URL.createObjectURL(stored.blob),
        objectUrl: true,
        name: stored.record.name,
      });
    } catch {
      if (runtimes.get(editor) === runtime) {
        runtime.missing.add(assetId);
      }
    } finally {
      runtime.inflight.delete(assetId);
      // A load that finishes after a new runtime is attached still has to wake that runtime.
      if (runtimes.has(editor)) {
        bump(editor);
      }
    }
  }

  const kind = {
    spec,
    plugin,
    attach,
    detach,
    uploadState,
    uploadRole,
    cachedAssetUrl,
    assetFileName,
    assetIsMissing,
    assetIsAdapter,
    resolveAssetURL,
    refreshAssetURL,
    queuePastedUpload,
    flushPastedUploads,
    planPasted,
    pastedDroppedUrl,
    beginUpload,
    holdUpload,
    retryUpload,
    insertFiles,
    insertFromFiles,
    insertFromUrl,
    setAlign,
    setWidth,
    remove,
    replaceFromFile,
    clampWidth,
    resizeStep: () => RESIZE_STEP,
    writable,
    messages: spec.messages,
    minWidth: spec.minWidth,
    maxWidth: spec.maxWidth,
  };

  registerMediaRoute({
    mimePrefix: spec.mimePrefix,
    insert: insertFiles,
  });

  return kind;
}

export function readMediaLayoutProps(
  node: Record<string, unknown>,
  minWidth: number,
  maxWidth: number,
): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  if (node.align === "left" || node.align === "right") {
    props.align = node.align;
  }

  if (
    typeof node.width === "number" &&
    node.width >= minWidth &&
    node.width <= maxWidth &&
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

export function handleMediaInsertData(
  editor: SlateEditor,
  data: DataTransfer,
  insertData: (data: DataTransfer) => void,
): boolean {
  const html = data.getData("text/html");
  const files = transferFiles(data);
  const matched = matchFiles(files);
  const table = html.toLowerCase().includes("<table");
  const mediaCount = matched.reduce((sum, group) => sum + group.files.length, 0);

  if (mediaCount > 0 && !table) {
    if (editor.dom.readOnly !== true) {
      editor.tf.withNewBatch(() => {
        for (const group of matched) {
          group.route.insert(editor, group.files, "highest");
        }
      });
      editor.tf.setSplittingOnce(true);
    }
    noteSkippedFiles(editor, files.length > mediaCount, true);
    return files.length > mediaCount;
  }

  insertData(data);
  const skipped = files.length > mediaCount || (mediaCount > 0 && table);
  noteSkippedFiles(editor, skipped, false);
  return skipped;
}

export function handleMediaDrop(editor: SlateEditor, event: MediaDropEvent): boolean {
  const data = event.dataTransfer;
  if (!data) {
    return false;
  }

  const files = transferFiles(data);
  if (files.length === 0) {
    return false;
  }

  const matched = matchFiles(files);
  const mediaCount = matched.reduce((sum, group) => sum + group.files.length, 0);
  event.preventDefault();
  if (mediaCount > 0 && editor.dom.readOnly !== true) {
    editor.tf.withNewBatch(() => {
      selectDropPoint(editor, event);
      for (const group of matched) {
        group.route.insert(editor, group.files, "local");
      }
    });
    editor.tf.setSplittingOnce(true);
  }

  noteSkippedFiles(editor, files.length > mediaCount, true);
  return files.length > mediaCount;
}

function registerMediaRoute(route: MediaRoute): void {
  if (routes.some((item) => item.mimePrefix === route.mimePrefix)) {
    return;
  }

  routes.push(route);
}

function matchFiles(
  files: readonly UploadSource[],
): { route: MediaRoute; files: UploadSource[] }[] {
  const grouped: { route: MediaRoute; files: UploadSource[] }[] = [];
  for (const file of files) {
    const type = file.type.toLowerCase();
    const route = routes.find((item) => type.startsWith(item.mimePrefix));
    if (!route) {
      continue;
    }

    const existing = grouped.find((group) => group.route === route);
    if (existing) {
      existing.files.push(file);
    } else {
      grouped.push({ route, files: [file] });
    }
  }

  return grouped;
}

function noteSkippedFiles(editor: SlateEditor, skipped: boolean, replace: boolean): void {
  if (!skipped) {
    if (replace) {
      setPasteRepairs(editor, []);
    }
    return;
  }

  const current = replace ? [] : pasteRepairsOf(editor);
  setPasteRepairs(editor, [...current, { path: [], message: MEDIA_FILE_SKIPPED }]);
}

function isDataUrl(value: string): boolean {
  return value.trim().toLowerCase().startsWith("data:");
}

function isResolvedUrl(value: unknown): value is { url: string; expiresAt?: number } {
  if (typeof value !== "object" || value === null || !("url" in value)) {
    return false;
  }

  return typeof value.url === "string" && isSafeImageUrl(value.url);
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

function selectDropPoint(editor: SlateEditor, event: MediaDropEvent): void {
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

function isPositivePixel(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
