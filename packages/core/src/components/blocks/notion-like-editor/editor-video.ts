import { KEYS, type TElement } from "platejs";

import type { EditorCommand } from "./editor-commands";
import type { AssetKind, AssetRecord, UploadSource } from "./editor-assets";
import {
  isSafeImageUrl,
  VIDEO_ALIGNS,
  VIDEO_MAX_WIDTH,
  VIDEO_MIME_TYPES,
  VIDEO_MIN_WIDTH,
} from "./editor-document-schema";
import { parseEmbedUrl } from "./editor-embed-url";
import { insertEmbedFromUrl } from "./editor-embed";
import { setPasteRepairs } from "./editor-paste";
import { probeImageSize } from "./editor-image";
import {
  createMediaKind,
  readMediaLayoutProps,
  type MediaKind,
  type MediaPastePlan,
  type MediaRole,
} from "./editor-media";

export const VIDEO_UNSAFE_URL = "A video with an unsafe URL was removed.";
export const VIDEO_BOTH_SOURCES = "A video URL was removed because the video already has an asset.";
export const VIDEO_UPLOAD_INTERRUPTED = "Upload didn't finish";
export const VIDEO_NOT_FOUND = "Video not found";
export const VIDEO_STORAGE_UNAVAILABLE = "Browser storage for files is unavailable.";
export const VIDEO_EMBED_REJECTED = "YouTube and Vimeo embeds are a separate block.";
export const VIDEO_CANT_PLAY = "This video can't play in this browser";
export const VIDEO_POSTER_BOTH =
  "A poster URL was removed because the poster already has an asset.";
export const VIDEO_POSTER_UNSAFE = "A poster with an unsafe URL was removed.";

const PROBE_TIMEOUT_MS = 1000;

export const videoHtmlDeserializer = {
  rules: [{ validNodeName: "VIDEO" }],
  parse({ element }: { element: HTMLElement }): TElement {
    const node: TElement = { type: KEYS.video, children: [{ text: "" }] };
    const src = element.getAttribute("src") ?? nestedSourceAttr(element, "src");
    if (src !== null && src.length > 0) {
      node.url = src;
    }

    const mime = element.getAttribute("type") ?? nestedSourceAttr(element, "type");
    if (mime !== null && isVideoMime(mime)) {
      node.mimeType = mime;
    }

    const poster = element.getAttribute("poster");
    if (poster !== null && poster.length > 0) {
      node.posterUrl = poster;
    }

    const caption = figureCaption(element);
    if (caption !== undefined) {
      node.caption = [{ text: caption }];
    }

    return node;
  },
};

let videoKind: MediaKind | undefined;

// editor-paste imports this module while editor-media is still evaluating.
// The route is registered on first use, after that module has finished.
export function ensureVideoMedia(): MediaKind {
  if (!videoKind) {
    videoKind = createMediaKind({
      nodeType: KEYS.video,
      assetKind: "video",
      pluginKey: "videoRuntime",
      mimePrefix: "video/",
      minWidth: VIDEO_MIN_WIDTH,
      maxWidth: VIDEO_MAX_WIDTH,
      aligns: VIDEO_ALIGNS,
      messages: {
        unsafeUrl: VIDEO_UNSAFE_URL,
        bothSources: VIDEO_BOTH_SOURCES,
        uploadInterrupted: VIDEO_UPLOAD_INTERRUPTED,
        notFound: VIDEO_NOT_FOUND,
        storageUnavailable: VIDEO_STORAGE_UNAVAILABLE,
      },
      replaceUnset: ["url", "assetId", "mimeType", "naturalWidth", "naturalHeight", "durationMs"],
      commands: {
        insertFiles: { id: "block.insert.video", label: "Video" },
        insertUrl: { id: "block.insert.video-url", label: "Video from URL" },
        align: { id: "block.video.align", label: "Align video" },
        width: { id: "block.video.width", label: "Video width" },
        remove: { id: "block.video.remove", label: "Remove video" },
        replace: { id: "block.video.replace", label: "Replace video" },
      },
      readProps: readVideoProps,
      rejectUrl: videoEmbedRejection,
      onRejectedUrl: (editor, _url, message) => {
        setPasteRepairs(editor, [{ path: [], message }]);
      },
      applyReady: videoReady,
      probe: probeForKind,
    });
  }

  return videoKind;
}

export const videoMedia = {
  get spec() {
    return ensureVideoMedia().spec;
  },
  get minWidth() {
    return ensureVideoMedia().minWidth;
  },
  get plugin() {
    return ensureVideoMedia().plugin;
  },
};

export const attachVideoRuntime: MediaKind["attach"] = (editor, store, options) =>
  ensureVideoMedia().attach(editor, store, options);
export const detachVideoRuntime: MediaKind["detach"] = (editor) => {
  ensureVideoMedia().detach(editor);
};
export const videoUploadState: MediaKind["uploadState"] = (editor, blockId) =>
  ensureVideoMedia().uploadState(editor, blockId);
export const videoUploadRole: MediaKind["uploadRole"] = (editor, blockId) =>
  ensureVideoMedia().uploadRole(editor, blockId);
export const cachedVideoUrl: MediaKind["cachedAssetUrl"] = (editor, assetId) =>
  ensureVideoMedia().cachedAssetUrl(editor, assetId);
export const videoFileName: MediaKind["assetFileName"] = (editor, assetId) =>
  ensureVideoMedia().assetFileName(editor, assetId);
export const videoAssetIsMissing: MediaKind["assetIsMissing"] = (editor, assetId) =>
  ensureVideoMedia().assetIsMissing(editor, assetId);
export const videoAssetIsAdapter: MediaKind["assetIsAdapter"] = (editor, assetId) =>
  ensureVideoMedia().assetIsAdapter(editor, assetId);
export const resolveVideoURL: MediaKind["resolveAssetURL"] = (editor, assetId) =>
  ensureVideoMedia().resolveAssetURL(editor, assetId);
export const refreshVideoURL: MediaKind["refreshAssetURL"] = (editor, assetId) =>
  ensureVideoMedia().refreshAssetURL(editor, assetId);
export const queuePastedVideoUpload: MediaKind["queuePastedUpload"] = (id, file) => {
  ensureVideoMedia().queuePastedUpload(id, file);
};
export const flushPastedVideoUploads: MediaKind["flushPastedUploads"] = (editor) => {
  ensureVideoMedia().flushPastedUploads(editor);
};
export const beginVideoUpload: MediaKind["beginUpload"] = (editor, blockId, file, role) => {
  ensureVideoMedia().beginUpload(editor, blockId, file, role);
};
export const holdVideoUpload: MediaKind["holdUpload"] = (editor, blockId) => {
  ensureVideoMedia().holdUpload(editor, blockId);
};
export const retryVideoUpload: MediaKind["retryUpload"] = (editor, blockId) => {
  ensureVideoMedia().retryUpload(editor, blockId);
};
export const insertVideoFromFiles = {
  id: "block.insert.video",
  label: "Video",
  group: "insert" as const,
  run: (
    editor: Parameters<MediaKind["insertFromFiles"]["run"]>[0],
    files: readonly UploadSource[],
  ) => {
    ensureVideoMedia().insertFromFiles.run(editor, files);
  },
};
export const insertVideoFromUrl = {
  id: "block.insert.video-url",
  label: "Video from URL",
  group: "insert" as const,
  run: (editor: Parameters<MediaKind["insertFromUrl"]["run"]>[0], url: string) => {
    if (parseEmbedUrl(url) !== undefined) {
      insertEmbedFromUrl.run(editor, url);
      return;
    }

    ensureVideoMedia().insertFromUrl.run(editor, url);
  },
};
export const setVideoAlign: MediaKind["setAlign"] = {
  id: "block.video.align",
  label: "Align video",
  group: "action",
  run: (editor, payload) => {
    ensureVideoMedia().setAlign.run(editor, payload);
  },
};
export const setVideoWidth: MediaKind["setWidth"] = {
  id: "block.video.width",
  label: "Video width",
  group: "action",
  run: (editor, payload) => {
    ensureVideoMedia().setWidth.run(editor, payload);
  },
};
export const removeVideo: MediaKind["remove"] = {
  id: "block.video.remove",
  label: "Remove video",
  group: "action",
  run: (editor, id) => {
    ensureVideoMedia().remove.run(editor, id);
  },
};
export const replaceVideoFromFile: MediaKind["replaceFromFile"] = {
  id: "block.video.replace",
  label: "Replace video",
  group: "action",
  run: (editor, payload) => {
    ensureVideoMedia().replaceFromFile.run(editor, payload);
  },
};
export const planPastedVideo: MediaKind["planPasted"] = (node) =>
  ensureVideoMedia().planPasted(node);
export const pastedVideoDroppedUrl: MediaKind["pastedDroppedUrl"] = (node) =>
  ensureVideoMedia().pastedDroppedUrl(node);

export function pastedVideoPosterRepair(node: Record<string, unknown>): string | undefined {
  const asset =
    typeof node.posterAssetId === "string" && node.posterAssetId.length > 0
      ? node.posterAssetId
      : undefined;
  const url = typeof node.posterUrl === "string" ? node.posterUrl : undefined;
  if (asset !== undefined && url !== undefined) {
    return VIDEO_POSTER_BOTH;
  }

  if (url !== undefined && !isSafeImageUrl(url)) {
    return VIDEO_POSTER_UNSAFE;
  }

  return undefined;
}

export const setVideoPoster: EditorCommand<{ id: string; file: UploadSource }> = {
  id: "block.video.poster",
  label: "Set poster",
  group: "action",
  run: (editor, payload) => {
    if (!ensureVideoMedia().writable(editor, payload.id)) {
      return;
    }

    ensureVideoMedia().beginUpload(editor, payload.id, payload.file, "poster");
  },
};

export const removeVideoPoster: EditorCommand<string> = {
  id: "block.video.poster.remove",
  label: "Remove poster",
  group: "action",
  run: (editor, id) => {
    const entry = ensureVideoMedia().writable(editor, id);
    if (!entry) {
      return;
    }

    editor.tf.unsetNodes(["posterAssetId", "posterUrl"], { at: entry[1] });
  },
};

export function clampVideoWidth(width: number, containerWidth: number): number {
  return ensureVideoMedia().clampWidth(width, containerWidth);
}

export function videoResizeStep(): number {
  return ensureVideoMedia().resizeStep();
}

export type VideoPastePlan = MediaPastePlan;

export function videoEmbedRejection(url: string): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }

  const host = parsed.hostname.toLowerCase();
  if (
    host === "youtube.com" ||
    host === "youtu.be" ||
    host.endsWith(".youtube.com") ||
    host === "vimeo.com" ||
    host.endsWith(".vimeo.com")
  ) {
    return VIDEO_EMBED_REJECTED;
  }

  return undefined;
}

export function probeVideoMetadata(
  blob: Blob,
): Promise<{ width?: number; height?: number; durationMs?: number } | undefined> {
  if (typeof document === "undefined" || typeof URL.createObjectURL !== "function") {
    return Promise.resolve(undefined);
  }

  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const video = document.createElement("video");
    let settled = false;
    const finish = (
      value: { width?: number; height?: number; durationMs?: number } | undefined,
    ): void => {
      if (settled) {
        return;
      }

      settled = true;
      window.clearTimeout(timer);
      URL.revokeObjectURL(url);
      try {
        video.removeAttribute("src");
        video.load();
      } catch {
        // The element only exists to read loadedmetadata.
      }
      resolve(value);
    };
    const timer = window.setTimeout(() => {
      finish(undefined);
    }, PROBE_TIMEOUT_MS);
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      const result: { width?: number; height?: number; durationMs?: number } = {};
      if (isPositivePixel(video.videoWidth) && isPositivePixel(video.videoHeight)) {
        result.width = video.videoWidth;
        result.height = video.videoHeight;
      }

      const durationMs = Number.isFinite(video.duration)
        ? Math.round(video.duration * 1000)
        : undefined;
      if (isPositivePixel(durationMs)) {
        result.durationMs = durationMs;
      }

      finish(result.width === undefined && result.durationMs === undefined ? undefined : result);
    };
    video.onerror = () => {
      finish(undefined);
    };
    video.src = url;
  });
}

function probeForKind(
  blob: Blob,
  kind: AssetKind,
): Promise<{ width?: number; height?: number; durationMs?: number } | undefined> {
  if (kind === "image") {
    return probeImageSize(blob);
  }

  if (kind === "video") {
    return probeVideoMetadata(blob);
  }

  return Promise.resolve(undefined);
}

function videoReady(record: AssetRecord, role: MediaRole) {
  if (role === "poster") {
    return {
      props: { posterAssetId: record.id },
      unset: ["posterUrl"],
      save: "own" as const,
    };
  }

  const props: Record<string, unknown> = {
    assetId: record.id,
    mimeType: record.mimeType,
  };
  if (isPositivePixel(record.width) && isPositivePixel(record.height)) {
    props.naturalWidth = record.width;
    props.naturalHeight = record.height;
  }

  if (isPositivePixel(record.durationMs)) {
    props.durationMs = record.durationMs;
  }

  return { props, unset: [], save: "fold" as const };
}

function readVideoProps(node: Record<string, unknown>): Record<string, unknown> {
  const props = readMediaLayoutProps(node, VIDEO_MIN_WIDTH, VIDEO_MAX_WIDTH);
  if (typeof node.mimeType === "string" && isVideoMime(node.mimeType)) {
    props.mimeType = node.mimeType;
  }

  if (isPositivePixel(node.durationMs)) {
    props.durationMs = node.durationMs;
  }

  const posterAsset =
    typeof node.posterAssetId === "string" && node.posterAssetId.length > 0
      ? node.posterAssetId
      : undefined;
  const posterUrl = typeof node.posterUrl === "string" ? node.posterUrl : undefined;
  if (posterAsset !== undefined) {
    props.posterAssetId = posterAsset;
  } else if (posterUrl !== undefined && isSafeImageUrl(posterUrl)) {
    props.posterUrl = posterUrl;
  }

  return props;
}

function isVideoMime(value: string): boolean {
  return VIDEO_MIME_TYPES.some((mime) => mime === value);
}

function nestedSourceAttr(element: HTMLElement, name: string): string | null {
  for (const child of element.children) {
    if (child.tagName !== "SOURCE") {
      continue;
    }

    const value = child.getAttribute(name);
    if (value !== null && value.length > 0) {
      return value;
    }
  }

  return null;
}

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

function isPositivePixel(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
