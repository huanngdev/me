import { KEYS } from "platejs";

import type { AssetRecord, UploadSource } from "./editor-assets";
import { FILE_MIME_TYPES } from "./editor-document-schema";
import {
  createMediaKind,
  decodeUrlFileName,
  readMediaAlignCaption,
  sanitizeMediaName,
  type MediaKind,
  type MediaPastePlan,
  type MediaRole,
} from "./editor-media";

export const FILE_UNSAFE_URL = "A file with an unsafe URL was removed.";
export const FILE_BOTH_SOURCES = "A file URL was removed because the file already has an asset.";
export const FILE_UPLOAD_INTERRUPTED = "Upload didn't finish";
export const FILE_NOT_FOUND = "File not found";
export const FILE_STORAGE_UNAVAILABLE = "Browser storage for files is unavailable.";
export const FILE_NO_ACCESS = "You don't have access to this file";

let fileKind: MediaKind | undefined;

// editor-paste imports this module while editor-media is still evaluating.
// The route is registered on first use, after that module has finished.
export function ensureFileMedia(): MediaKind {
  if (!fileKind) {
    fileKind = createMediaKind({
      nodeType: KEYS.file,
      assetKind: "file",
      pluginKey: "fileRuntime",
      mimePrefix: "",
      messages: {
        unsafeUrl: FILE_UNSAFE_URL,
        bothSources: FILE_BOTH_SOURCES,
        uploadInterrupted: FILE_UPLOAD_INTERRUPTED,
        notFound: FILE_NOT_FOUND,
        storageUnavailable: FILE_STORAGE_UNAVAILABLE,
      },
      replaceUnset: ["url", "assetId", "mimeType", "byteSize", "name"],
      commands: {
        insertFiles: { id: "block.insert.file", label: "File" },
        insertUrl: { id: "block.insert.file-url", label: "File from URL" },
        remove: { id: "block.file.remove", label: "Remove file" },
        replace: { id: "block.file.replace", label: "Replace file" },
      },
      readProps: readFileProps,
      propsFromUrl: (url) => ({ name: decodeUrlFileName(url) ?? "file" }),
      applyReady: fileReady,
    });
  }

  return fileKind;
}

export const fileMedia = {
  get spec() {
    return ensureFileMedia().spec;
  },
  get plugin() {
    return ensureFileMedia().plugin;
  },
};

export const attachFileRuntime: MediaKind["attach"] = (editor, store, options) =>
  ensureFileMedia().attach(editor, store, options);
export const fileUploadState: MediaKind["uploadState"] = (editor, blockId) =>
  ensureFileMedia().uploadState(editor, blockId);
export const cachedFileUrl: MediaKind["cachedAssetUrl"] = (editor, assetId) =>
  ensureFileMedia().cachedAssetUrl(editor, assetId);
export const fileAssetFileName: MediaKind["assetFileName"] = (editor, assetId) =>
  ensureFileMedia().assetFileName(editor, assetId);
export const fileAssetIsMissing: MediaKind["assetIsMissing"] = (editor, assetId) =>
  ensureFileMedia().assetIsMissing(editor, assetId);
export const fileAssetIsDenied: MediaKind["assetIsDenied"] = (editor, assetId) =>
  ensureFileMedia().assetIsDenied(editor, assetId);
export const markFileDenied: MediaKind["markAssetDenied"] = (editor, assetId) => {
  ensureFileMedia().markAssetDenied(editor, assetId);
};
export const cachedFileExpiresAt: MediaKind["cachedAssetExpiresAt"] = (editor, assetId) =>
  ensureFileMedia().cachedAssetExpiresAt(editor, assetId);
export const fileAssetIsAdapter: MediaKind["assetIsAdapter"] = (editor, assetId) =>
  ensureFileMedia().assetIsAdapter(editor, assetId);
export const resolveFileURL: MediaKind["resolveAssetURL"] = (editor, assetId) =>
  ensureFileMedia().resolveAssetURL(editor, assetId);
export const refreshFileURL: MediaKind["refreshAssetURL"] = (editor, assetId) =>
  ensureFileMedia().refreshAssetURL(editor, assetId);
export const queuePastedFileUpload: MediaKind["queuePastedUpload"] = (id, file) => {
  ensureFileMedia().queuePastedUpload(id, file);
};
export const flushPastedFileUploads: MediaKind["flushPastedUploads"] = (editor) => {
  ensureFileMedia().flushPastedUploads(editor);
};
export const beginFileUpload: MediaKind["beginUpload"] = (editor, blockId, file, role) => {
  ensureFileMedia().beginUpload(editor, blockId, file, role);
};
export const holdFileUpload: MediaKind["holdUpload"] = (editor, blockId) => {
  ensureFileMedia().holdUpload(editor, blockId);
};
export const retryFileUpload: MediaKind["retryUpload"] = (editor, blockId) => {
  ensureFileMedia().retryUpload(editor, blockId);
};
export const insertFileFromFiles = {
  id: "block.insert.file",
  label: "File",
  group: "insert" as const,
  run: (
    editor: Parameters<MediaKind["insertFromFiles"]["run"]>[0],
    files: readonly UploadSource[],
  ) => {
    ensureFileMedia().insertFromFiles.run(editor, files);
  },
};
export const insertFileFromUrl = {
  id: "block.insert.file-url",
  label: "File from URL",
  group: "insert" as const,
  run: (editor: Parameters<MediaKind["insertFromUrl"]["run"]>[0], url: string) => {
    ensureFileMedia().insertFromUrl.run(editor, url);
  },
};
export const removeFile: MediaKind["remove"] = {
  id: "block.file.remove",
  label: "Remove file",
  group: "action",
  run: (editor, id) => {
    ensureFileMedia().remove.run(editor, id);
  },
};
export const replaceFileFromFile: MediaKind["replaceFromFile"] = {
  id: "block.file.replace",
  label: "Replace file",
  group: "action",
  run: (editor, payload) => {
    ensureFileMedia().replaceFromFile.run(editor, payload);
  },
};
export const planPastedFile: MediaKind["planPasted"] = (node) => ensureFileMedia().planPasted(node);
export const pastedFileDroppedUrl: MediaKind["pastedDroppedUrl"] = (node) =>
  ensureFileMedia().pastedDroppedUrl(node);

export type FilePastePlan = MediaPastePlan;

export function fileExtension(name: string): string | undefined {
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) {
    return undefined;
  }

  const extension = name.slice(dot + 1).toLowerCase();
  if (extension.length === 0 || extension.length > 16 || extension.includes(" ")) {
    return undefined;
  }

  return extension;
}

function fileReady(record: AssetRecord, _role: MediaRole) {
  const props: Record<string, unknown> = {
    assetId: record.id,
    mimeType: record.mimeType,
    name: sanitizeMediaName(record.name) ?? "file",
  };
  if (Number.isSafeInteger(record.byteSize) && record.byteSize >= 0) {
    props.byteSize = record.byteSize;
  }

  return { props, unset: [], save: "fold" as const };
}

function readFileProps(node: Record<string, unknown>): Record<string, unknown> {
  const shared = readMediaAlignCaption(node);
  const props: Record<string, unknown> = {};
  if ("caption" in shared) {
    props.caption = shared.caption;
  }

  if (typeof node.mimeType === "string" && isFileMime(node.mimeType)) {
    props.mimeType = node.mimeType;
  }

  if (typeof node.name === "string") {
    const name = sanitizeMediaName(node.name);
    if (name !== undefined) {
      props.name = name;
    }
  }

  if (isStoredByteSize(node.byteSize)) {
    props.byteSize = node.byteSize;
  }

  return props;
}

function isFileMime(value: string): boolean {
  return FILE_MIME_TYPES.some((mime) => mime === value);
}

function isStoredByteSize(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
