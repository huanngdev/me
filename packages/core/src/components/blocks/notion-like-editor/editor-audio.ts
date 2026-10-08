import { KEYS, type TElement } from "platejs";

import type { AssetKind, AssetRecord, UploadSource } from "./editor-assets";
import {
  AUDIO_ALIGNS,
  AUDIO_MIME_TYPES,
  isSafeImageUrl,
  isStoredAudioName,
} from "./editor-document-schema";
import {
  createMediaKind,
  readMediaAlignCaption,
  type MediaKind,
  type MediaPastePlan,
  type MediaRole,
} from "./editor-media";

export const AUDIO_UNSAFE_URL = "An audio file with an unsafe URL was removed.";
export const AUDIO_BOTH_SOURCES =
  "An audio URL was removed because the audio already has an asset.";
export const AUDIO_UPLOAD_INTERRUPTED = "Upload didn't finish";
export const AUDIO_NOT_FOUND = "Audio not found";
export const AUDIO_STORAGE_UNAVAILABLE = "Browser storage for files is unavailable.";
export const AUDIO_CANT_PLAY = "This audio can't play in this browser";

const PROBE_TIMEOUT_MS = 1000;

export const audioHtmlDeserializer = {
  rules: [{ validNodeName: "AUDIO" }],
  parse({ element }: { element: HTMLElement }): TElement {
    const node: TElement = { type: KEYS.audio, children: [{ text: "" }] };
    const src = element.getAttribute("src") ?? nestedSourceAttr(element, "src");
    if (src !== null && src.length > 0) {
      node.url = src;
    }

    const mime = element.getAttribute("type") ?? nestedSourceAttr(element, "type");
    if (mime !== null && isAudioMime(mime)) {
      node.mimeType = mime;
    }

    const caption = figureCaption(element);
    if (caption !== undefined) {
      node.caption = [{ text: caption }];
    }

    return node;
  },
};

let audioKind: MediaKind | undefined;

// editor-paste imports this module while editor-media is still evaluating.
// The route is registered on first use, after that module has finished.
export function ensureAudioMedia(): MediaKind {
  if (!audioKind) {
    audioKind = createMediaKind({
      nodeType: KEYS.audio,
      assetKind: "audio",
      pluginKey: "audioRuntime",
      mimePrefix: "audio/",
      aligns: AUDIO_ALIGNS,
      messages: {
        unsafeUrl: AUDIO_UNSAFE_URL,
        bothSources: AUDIO_BOTH_SOURCES,
        uploadInterrupted: AUDIO_UPLOAD_INTERRUPTED,
        notFound: AUDIO_NOT_FOUND,
        storageUnavailable: AUDIO_STORAGE_UNAVAILABLE,
      },
      replaceUnset: ["url", "assetId", "mimeType", "durationMs", "name"],
      commands: {
        insertFiles: { id: "block.insert.audio", label: "Audio" },
        insertUrl: { id: "block.insert.audio-url", label: "Audio from URL" },
        align: { id: "block.audio.align", label: "Align audio" },
        remove: { id: "block.audio.remove", label: "Remove audio" },
        replace: { id: "block.audio.replace", label: "Replace audio" },
      },
      readProps: readAudioProps,
      applyReady: audioReady,
      probe: probeForKind,
    });
  }

  return audioKind;
}

export const audioMedia = {
  get spec() {
    return ensureAudioMedia().spec;
  },
  get plugin() {
    return ensureAudioMedia().plugin;
  },
};

export const attachAudioRuntime: MediaKind["attach"] = (editor, store, options) =>
  ensureAudioMedia().attach(editor, store, options);
export const audioUploadState: MediaKind["uploadState"] = (editor, blockId) =>
  ensureAudioMedia().uploadState(editor, blockId);
export const cachedAudioUrl: MediaKind["cachedAssetUrl"] = (editor, assetId) =>
  ensureAudioMedia().cachedAssetUrl(editor, assetId);
export const audioFileName: MediaKind["assetFileName"] = (editor, assetId) =>
  ensureAudioMedia().assetFileName(editor, assetId);
export const audioAssetIsMissing: MediaKind["assetIsMissing"] = (editor, assetId) =>
  ensureAudioMedia().assetIsMissing(editor, assetId);
export const audioAssetIsAdapter: MediaKind["assetIsAdapter"] = (editor, assetId) =>
  ensureAudioMedia().assetIsAdapter(editor, assetId);
export const resolveAudioURL: MediaKind["resolveAssetURL"] = (editor, assetId) =>
  ensureAudioMedia().resolveAssetURL(editor, assetId);
export const refreshAudioURL: MediaKind["refreshAssetURL"] = (editor, assetId) =>
  ensureAudioMedia().refreshAssetURL(editor, assetId);
export const queuePastedAudioUpload: MediaKind["queuePastedUpload"] = (id, file) => {
  ensureAudioMedia().queuePastedUpload(id, file);
};
export const flushPastedAudioUploads: MediaKind["flushPastedUploads"] = (editor) => {
  ensureAudioMedia().flushPastedUploads(editor);
};
export const beginAudioUpload: MediaKind["beginUpload"] = (editor, blockId, file, role) => {
  ensureAudioMedia().beginUpload(editor, blockId, file, role);
};
export const holdAudioUpload: MediaKind["holdUpload"] = (editor, blockId) => {
  ensureAudioMedia().holdUpload(editor, blockId);
};
export const retryAudioUpload: MediaKind["retryUpload"] = (editor, blockId) => {
  ensureAudioMedia().retryUpload(editor, blockId);
};
export const insertAudioFromFiles = {
  id: "block.insert.audio",
  label: "Audio",
  group: "insert" as const,
  run: (
    editor: Parameters<MediaKind["insertFromFiles"]["run"]>[0],
    files: readonly UploadSource[],
  ) => {
    ensureAudioMedia().insertFromFiles.run(editor, files);
  },
};
export const insertAudioFromUrl = {
  id: "block.insert.audio-url",
  label: "Audio from URL",
  group: "insert" as const,
  run: (editor: Parameters<MediaKind["insertFromUrl"]["run"]>[0], url: string) => {
    ensureAudioMedia().insertFromUrl.run(editor, url);
  },
};
export const setAudioAlign: MediaKind["setAlign"] = {
  id: "block.audio.align",
  label: "Align audio",
  group: "action",
  run: (editor, payload) => {
    ensureAudioMedia().setAlign.run(editor, payload);
  },
};
export const removeAudio: MediaKind["remove"] = {
  id: "block.audio.remove",
  label: "Remove audio",
  group: "action",
  run: (editor, id) => {
    ensureAudioMedia().remove.run(editor, id);
  },
};
export const replaceAudioFromFile: MediaKind["replaceFromFile"] = {
  id: "block.audio.replace",
  label: "Replace audio",
  group: "action",
  run: (editor, payload) => {
    ensureAudioMedia().replaceFromFile.run(editor, payload);
  },
};
export const planPastedAudio: MediaKind["planPasted"] = (node) =>
  ensureAudioMedia().planPasted(node);
export const pastedAudioDroppedUrl: MediaKind["pastedDroppedUrl"] = (node) =>
  ensureAudioMedia().pastedDroppedUrl(node);

export type AudioPastePlan = MediaPastePlan;

export function storedAudioName(value: string): string | undefined {
  const trimmed = value.trim();
  return isStoredAudioName(trimmed) ? trimmed : undefined;
}

export function formatAudioDuration(durationMs: number): string {
  const totalSeconds = Math.floor(durationMs / 1000);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60);
  const paddedSeconds = String(seconds).padStart(2, "0");
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const hourMinutes = minutes % 60;
    return `${String(hours)}:${String(hourMinutes).padStart(2, "0")}:${paddedSeconds}`;
  }

  return `${String(minutes)}:${paddedSeconds}`;
}

export function audioDisplayName(name: string | undefined, url: string | undefined): string {
  if (name !== undefined && isStoredAudioName(name)) {
    return name;
  }

  const segment = urlPathSegment(url);
  return segment ?? "Audio";
}

export function probeAudioDuration(blob: Blob): Promise<{ durationMs?: number } | undefined> {
  if (typeof document === "undefined" || typeof URL.createObjectURL !== "function") {
    return Promise.resolve(undefined);
  }

  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const audio = document.createElement("audio");
    let settled = false;
    const finish = (value: { durationMs?: number } | undefined): void => {
      if (settled) {
        return;
      }

      settled = true;
      window.clearTimeout(timer);
      URL.revokeObjectURL(url);
      try {
        audio.removeAttribute("src");
        audio.load();
      } catch {
        // The element only exists to read loadedmetadata.
      }
      resolve(value);
    };
    const timer = window.setTimeout(() => {
      finish(undefined);
    }, PROBE_TIMEOUT_MS);
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      const durationMs = Number.isFinite(audio.duration)
        ? Math.round(audio.duration * 1000)
        : undefined;
      finish(isPositivePixel(durationMs) ? { durationMs } : undefined);
    };
    audio.onerror = () => {
      finish(undefined);
    };
    audio.src = url;
  });
}

function probeForKind(
  blob: Blob,
  kind: AssetKind,
): Promise<{ width?: number; height?: number; durationMs?: number } | undefined> {
  if (kind === "audio") {
    return probeAudioDuration(blob);
  }

  return Promise.resolve(undefined);
}

function audioReady(record: AssetRecord, _role: MediaRole) {
  const props: Record<string, unknown> = {
    assetId: record.id,
    mimeType: record.mimeType,
  };
  const name = storedAudioName(record.name);
  if (name !== undefined) {
    props.name = name;
  }

  if (isPositivePixel(record.durationMs)) {
    props.durationMs = record.durationMs;
  }

  return { props, unset: [], save: "fold" as const };
}

function readAudioProps(node: Record<string, unknown>): Record<string, unknown> {
  const props = readMediaAlignCaption(node);
  if (typeof node.mimeType === "string" && isAudioMime(node.mimeType)) {
    props.mimeType = node.mimeType;
  }

  if (isPositivePixel(node.durationMs)) {
    props.durationMs = node.durationMs;
  }

  if (isStoredAudioName(node.name)) {
    props.name = node.name;
  }

  return props;
}

function isAudioMime(value: string): boolean {
  return AUDIO_MIME_TYPES.some((mime) => mime === value);
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

function urlPathSegment(url: string | undefined): string | undefined {
  if (url === undefined || !isSafeImageUrl(url)) {
    return undefined;
  }

  const path = url.split("?")[0]?.split("#")[0] ?? "";
  const raw = path.split("/").pop() ?? "";
  if (raw.length === 0) {
    return undefined;
  }

  try {
    const decoded = decodeURIComponent(raw);
    return decoded.length > 0 ? decoded : undefined;
  } catch {
    return raw;
  }
}

function isPositivePixel(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
