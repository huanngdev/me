import type { SlateEditor } from "platejs";

import { runEditorCommand, type EditorCommand } from "../commands/editor-commands";
import type { UploadedFile } from "./editor-file-upload";
import {
  applyMediaSource,
  mediaBlockEntry,
  mediaMimePrefix,
  sanitizeMediaSource,
} from "./editor-media-source";

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
