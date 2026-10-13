import type { SlateEditor, TElement } from "platejs";

import type { EditorCommand } from "../commands/editor-commands";
import { FILE_KEY, fileElement, fileNameFromUrl } from "./editor-file";
import { cleanFileName, isHttpFileUrl, sanitizeStoredFileUrl } from "./editor-file-url";
import type { UploadedFile } from "./editor-file-upload";
import {
  createMediaClearSourceCommand,
  createMediaInsertCommand,
  createMediaRemoveCommand,
  createMediaSetSourceCommand,
  writableMediaBlock,
} from "./editor-media-commands";
import { isStoredMediaUrl, placeNewMediaBlocks, type MediaSource } from "./editor-media-source";

// A link is http or https only. Its name is the file name in the url, unless one is given.
function linkSource(file: UploadedFile): MediaSource | null {
  const url = sanitizeStoredFileUrl(file.url);
  if (url === null || !isHttpFileUrl(url) || !isStoredMediaUrl(url)) {
    return null;
  }

  const name = fileNameFromUrl(url);
  return name === undefined ? { url } : { url, name };
}

function writableFile(editor: SlateEditor, id: string): [TElement, number[]] | undefined {
  return writableMediaBlock(editor, id, FILE_KEY);
}

// One file block with this id. The id must be new.
export const insertFile: EditorCommand<{ id: string }> = createMediaInsertCommand(FILE_KEY);

// One file block per id, in order, as one undo step. Ids must be new and unique. With
// `replaceSelection`, an expanded selection is deleted first, in the same step.
export const insertFiles: EditorCommand<{ ids: string[]; replaceSelection?: boolean }> = {
  id: "block.insert.files",
  label: "File",
  group: "insert",
  run: (editor, { ids, replaceSelection = false }) =>
    placeNewMediaBlocks(
      editor,
      ids.map((id) => ({ id, element: fileElement({}, id) })),
      replaceSelection,
    ),
};

// A url-only value is a link and must be http or https. Any other value is an upload result, and
// its name, size and mime type are kept when they are valid.
export const setFileSource = createMediaSetSourceCommand(FILE_KEY, linkSource);

// Back to the empty placeholder. The name, size and mime type are removed with the url.
export const clearFileSource = createMediaClearSourceCommand(FILE_KEY);

// The name is cleaned the way paste cleans names, so it is never empty and at most 255 characters.
// A file with no url has no name to change, so it is refused.
export const renameFile: EditorCommand<{ id: string; name: string }> = {
  id: "block.file.rename",
  label: "Rename file",
  group: "action",
  run: (editor, { id, name }) => {
    const entry = writableFile(editor, id);
    if (entry === undefined || typeof entry[0].url !== "string" || typeof name !== "string") {
      return false;
    }

    const clean = cleanFileName(name);
    if (clean === undefined || clean.length === 0) {
      return false;
    }

    editor.tf.setNodes({ name: clean }, { at: entry[1] });
    return true;
  },
};

// Removes the block. An empty document gets an empty paragraph, as the bookmark remove does.
export const removeFile: EditorCommand<{ id: string }> = createMediaRemoveCommand(FILE_KEY);
