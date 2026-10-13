import { nanoid, type SlateEditor } from "platejs";

import { runEditorCommand, type EditorCommand } from "../commands/editor-commands";
import { setAudioSource } from "./editor-audio-commands";
import { setFileSource } from "./editor-file-commands";
import { setImageSource } from "./editor-image-commands";
import type { UploadedFile } from "./editor-file-upload";
import { mediaBlockElement } from "./editor-media-commands";
import type { UploadController } from "./editor-upload-controller";
import { setVideoSource } from "./editor-video-commands";
import { setEmbedSource } from "./editor-embed-commands";
import {
  MEDIA_MIME_PREFIXES,
  applyMediaSource,
  isMediaBlockType,
  mediaBlockEntry,
  mediaMimePrefix,
  placeNewMediaBlocks,
  sanitizeMediaSource,
  type MediaBlockType,
} from "./editor-media-source";

// A paste or drop takes at most this many files. The rest are skipped with one notice.
export const MEDIA_FILE_LIMIT = 10;
export const MEDIA_FILE_LIMIT_MESSAGE = "Only the first 10 files were added.";

// The block kind a file becomes. Image, video and audio files become their own block. Every other
// file becomes a file block.
type MediaKind = MediaBlockType;

// The one place that routes a file to a block kind.
export function mediaKindForFile(file: { readonly type: string }): MediaKind {
  if (file.type.startsWith(MEDIA_MIME_PREFIXES.image)) {
    return "image";
  }
  if (file.type.startsWith(MEDIA_MIME_PREFIXES.video)) {
    return "video";
  }
  if (file.type.startsWith(MEDIA_MIME_PREFIXES.audio)) {
    return "audio";
  }
  return "file";
}

// The source command of each block type. An upload result for a block that already has a file uses it.
const SET_SOURCE_BY_TYPE: Record<
  MediaBlockType,
  EditorCommand<{ id: string; file: UploadedFile }>
> = {
  image: setImageSource,
  file: setFileSource,
  video: setVideoSource,
  audio: setAudioSource,
  embed: setEmbedSource,
};

// Writes an upload result into a media block that is still empty. The block must exist, be a media
// block, and have no url. Otherwise nothing changes.
export const finishMediaUpload: EditorCommand<{ blockId: string; file: UploadedFile }> = {
  id: "block.media.finish-upload",
  label: "Add file",
  group: "action",
  run: (editor, { blockId, file }) => {
    const entry = mediaBlockEntry(editor, blockId);
    if (entry === undefined || typeof entry[0].url === "string") {
      return false;
    }

    const prefix = mediaMimePrefix(entry[0].type);
    if (prefix === undefined) {
      return false;
    }

    const source = sanitizeMediaSource(file, prefix);
    if (source === null) {
      return false;
    }

    applyMediaSource(editor, entry[1], source);
    return true;
  },
};

// Several new media blocks, in order, as one undo step. Each kind makes its own block.
export const insertMediaBlocks: EditorCommand<{
  items: readonly { kind: MediaKind; id: string }[];
  replaceSelection?: boolean;
}> = {
  id: "block.insert.media",
  label: "Insert files",
  group: "insert",
  run: (editor, { items, replaceSelection = false }) =>
    placeNewMediaBlocks(
      editor,
      items.map((item) => ({
        id: item.id,
        element: mediaBlockElement(item.kind, item.id),
      })),
      replaceSelection,
    ),
};

// The first fill of an empty block. It is written outside the undo history, so one undo removes a
// block that a paste or slash insert added, instead of first emptying it. Redo brings back the empty
// placeholder, and its upload is not running again. Returns false when the block is gone, is not
// media, already has a file, or the editor is read-only. The caller's stored file is then not used.
export function applyFinishedUpload(
  editor: SlateEditor,
  blockId: string,
  file: UploadedFile,
): boolean {
  let applied = false;
  editor.tf.withoutSaving(() => {
    applied = runEditorCommand(editor, finishMediaUpload, { blockId, file });
  });
  return applied;
}

// A finished upload fills an empty block. A block that already has a file is being replaced, so the
// new file takes its place in one undo step. Otherwise this is the same as applyFinishedUpload.
export function applyUploadResult(
  editor: SlateEditor,
  blockId: string,
  file: UploadedFile,
): boolean {
  const entry = mediaBlockEntry(editor, blockId);
  if (entry !== undefined && typeof entry[0].url === "string") {
    const type = entry[0].type;
    if (!isMediaBlockType(type)) {
      return false;
    }
    return runEditorCommand(editor, SET_SOURCE_BY_TYPE[type], { id: blockId, file });
  }

  return applyFinishedUpload(editor, blockId, file);
}

// One media block per file, in order, each with its upload started. Image, video and audio files
// become their own blocks and the rest become file blocks. The insert is one undo step, and the
// uploads start after it. An expanded selection is replaced in that same step.
export function insertMediaFiles(
  editor: SlateEditor,
  controller: UploadController,
  files: readonly File[],
): boolean {
  const pending = files.map((file) => ({ file, id: nanoid(), kind: mediaKindForFile(file) }));
  const inserted = runEditorCommand(editor, insertMediaBlocks, {
    items: pending.map((item) => ({ kind: item.kind, id: item.id })),
    replaceSelection: true,
  });
  if (!inserted) {
    return false;
  }

  for (const item of pending) {
    controller.start(item.id, item.file);
  }
  return true;
}
