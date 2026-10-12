import type { SlateEditor, TElement } from "platejs";

import type { EditorCommand } from "../commands/editor-commands";
import { FILE_KEY, fileElement, fileNameFromUrl } from "./editor-file";
import { cleanFileName, isHttpFileUrl, sanitizeStoredFileUrl } from "./editor-file-url";
import type { UploadedFile } from "./editor-file-upload";
import {
  MEDIA_MIME_PREFIXES,
  MEDIA_SOURCE_ATTRS,
  applyMediaSource,
  isEmbedLink,
  isStoredMediaUrl,
  mediaBlockEntry,
  placeNewMediaBlocks,
  removeMediaBlockAt,
  sanitizeMediaSource,
  type MediaSource,
} from "./editor-media-source";

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
  const entry = mediaBlockEntry(editor, id);
  return entry !== undefined && entry[0].type === FILE_KEY ? entry : undefined;
}

// One file block with this id. The id must be new.
export const insertFile: EditorCommand<{ id: string }> = {
  id: "block.insert.file",
  label: "File",
  group: "insert",
  run: (editor, { id }) =>
    placeNewMediaBlocks(editor, [{ id, element: fileElement({}, id) }], false),
};

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
export const setFileSource: EditorCommand<{ id: string; file: UploadedFile }> = {
  id: "block.file.set-source",
  label: "Set file",
  group: "action",
  run: (editor, { id, file }) => {
    const entry = writableFile(editor, id);
    if (entry === undefined) {
      return false;
    }

    const source = isEmbedLink(file)
      ? linkSource(file)
      : sanitizeMediaSource(file, MEDIA_MIME_PREFIXES.file);
    if (source === null) {
      return false;
    }

    applyMediaSource(editor, entry[1], source);
    return true;
  },
};

// Back to the empty placeholder. The name, size and mime type are removed with the url.
export const clearFileSource: EditorCommand<{ id: string }> = {
  id: "block.file.clear-source",
  label: "Remove file",
  group: "action",
  run: (editor, { id }) => {
    const entry = writableFile(editor, id);
    if (entry === undefined) {
      return false;
    }

    editor.tf.unsetNodes([...MEDIA_SOURCE_ATTRS], { at: entry[1] });
    return true;
  },
};

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
export const removeFile: EditorCommand<{ id: string }> = {
  id: "block.file.remove",
  label: "Delete",
  group: "action",
  run: (editor, { id }) => {
    const entry = writableFile(editor, id);
    if (entry === undefined) {
      return false;
    }

    removeMediaBlockAt(editor, entry[1]);
    return true;
  },
};
