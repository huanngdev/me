import { nanoid, type SlateEditor } from "platejs";

import { runEditorCommand, type EditorCommand } from "../commands/editor-commands";
import { insertImages, setImageSource } from "./editor-image-commands";
import type { UploadedFile } from "./editor-file-upload";
import type { UploadController } from "./editor-upload-controller";
import {
  MEDIA_MIME_PREFIXES,
  applyMediaSource,
  mediaBlockEntry,
  mediaMimePrefix,
  sanitizeMediaSource,
} from "./editor-media-source";

// A paste or drop takes at most this many files. The rest are skipped with one notice.
export const MEDIA_FILE_LIMIT = 10;
export const MEDIA_FILE_LIMIT_MESSAGE = "Only the first 10 files were added.";

// The one place that routes a file to a block kind. A later kind adds its mime prefix here.
export function mediaKindForFile(file: { readonly type: string }): "image" | null {
  return file.type.startsWith(MEDIA_MIME_PREFIXES.image) ? "image" : null;
}

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

// One undo step. Returns false when the block is gone, is not media, already has a file, or the
// editor is read-only. The caller's stored file is then not used.
export function applyFinishedUpload(
  editor: SlateEditor,
  blockId: string,
  file: UploadedFile,
): boolean {
  return runEditorCommand(editor, finishMediaUpload, { blockId, file });
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
    return runEditorCommand(editor, setImageSource, { id: blockId, file });
  }

  return applyFinishedUpload(editor, blockId, file);
}

// One image block per file, in order, each with its upload started. The insert is one undo step, and
// the uploads start after it. An expanded selection is replaced in that same step.
export function insertImageFiles(
  editor: SlateEditor,
  controller: UploadController,
  files: readonly File[],
): boolean {
  const pending = files.map((file) => ({ file, id: nanoid() }));
  const inserted = runEditorCommand(editor, insertImages, {
    ids: pending.map((item) => item.id),
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
