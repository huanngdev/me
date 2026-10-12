import type { SlateEditor, TElement } from "platejs";

import type { EditorCommand } from "../commands/editor-commands";
import { cleanFileText } from "./editor-file-url";
import type { UploadedFile } from "./editor-file-upload";
import {
  IMAGE_CAPTION_MAX,
  IMAGE_KEY,
  imageElement,
  isImageAlign,
  isImageWidth,
  sanitizeImageEmbedUrl,
  type ImageAlign,
} from "./editor-image";
import {
  MEDIA_MIME_PREFIXES,
  MEDIA_SOURCE_ATTRS,
  applyMediaSource,
  isEmbedLink,
  mediaBlockEntry,
  placeNewMediaBlocks,
  removeMediaBlockAt,
  sanitizeMediaSource,
  type MediaSource,
} from "./editor-media-source";

function embedSource(file: UploadedFile): MediaSource | null {
  const url = sanitizeImageEmbedUrl(file.url);
  return url === null ? null : { url };
}

function writableImage(editor: SlateEditor, id: string): [TElement, number[]] | undefined {
  const entry = mediaBlockEntry(editor, id);
  return entry !== undefined && entry[0].type === IMAGE_KEY ? entry : undefined;
}

// One image block with this id, placed like a bookmark: see placeMediaBlocks. The id must be new.
export const insertImage: EditorCommand<{ id: string }> = {
  id: "block.insert.image",
  label: "Image",
  group: "insert",
  run: (editor, { id }) =>
    placeNewMediaBlocks(editor, [{ id, element: imageElement({}, id) }], false),
};

// One image block per id, in order, as one undo step. Ids must be new and unique. With
// `replaceSelection`, an expanded selection is deleted first, in the same step.
export const insertImages: EditorCommand<{ ids: string[]; replaceSelection?: boolean }> = {
  id: "block.insert.images",
  label: "Image",
  group: "insert",
  run: (editor, { ids, replaceSelection = false }) =>
    placeNewMediaBlocks(
      editor,
      ids.map((id) => ({ id, element: imageElement({}, id) })),
      replaceSelection,
    ),
};

// A url-only value is an embed link and must be http or https. Any other value is an upload result.
export const setImageSource: EditorCommand<{ id: string; file: UploadedFile }> = {
  id: "block.image.set-source",
  label: "Set image",
  group: "action",
  run: (editor, { id, file }) => {
    const entry = writableImage(editor, id);
    if (entry === undefined) {
      return false;
    }

    const source = isEmbedLink(file)
      ? embedSource(file)
      : sanitizeMediaSource(file, MEDIA_MIME_PREFIXES.image);
    if (source === null) {
      return false;
    }

    applyMediaSource(editor, entry[1], source);
    return true;
  },
};

// Back to the empty placeholder. Width, alignment and caption stay.
export const clearImageSource: EditorCommand<{ id: string }> = {
  id: "block.image.clear-source",
  label: "Remove image",
  group: "action",
  run: (editor, { id }) => {
    const entry = writableImage(editor, id);
    if (entry === undefined) {
      return false;
    }

    editor.tf.unsetNodes([...MEDIA_SOURCE_ATTRS], { at: entry[1] });
    return true;
  },
};

// null removes the width, which means the natural size.
export const setImageWidth: EditorCommand<{ id: string; width: number | null }> = {
  id: "block.image.width",
  label: "Image width",
  group: "action",
  run: (editor, { id, width }) => {
    const entry = writableImage(editor, id);
    if (entry === undefined) {
      return false;
    }

    if (width === null) {
      editor.tf.unsetNodes(["width"], { at: entry[1] });
      return true;
    }

    if (!isImageWidth(width)) {
      return false;
    }

    editor.tf.setNodes({ width }, { at: entry[1] });
    return true;
  },
};

export const setImageAlign: EditorCommand<{ id: string; align: ImageAlign }> = {
  id: "block.image.align",
  label: "Image alignment",
  group: "action",
  run: (editor, { id, align }) => {
    const entry = writableImage(editor, id);
    if (entry === undefined || !isImageAlign(align)) {
      return false;
    }

    editor.tf.setNodes({ align }, { at: entry[1] });
    return true;
  },
};

// An empty caption removes the attribute. A longer caption is cut to the limit.
export const setImageCaption: EditorCommand<{ id: string; caption: string }> = {
  id: "block.image.caption",
  label: "Image caption",
  group: "action",
  run: (editor, { id, caption }) => {
    const entry = writableImage(editor, id);
    if (entry === undefined || typeof caption !== "string") {
      return false;
    }

    const text = cleanFileText(caption, IMAGE_CAPTION_MAX);
    if (text === undefined) {
      editor.tf.unsetNodes(["caption"], { at: entry[1] });
      return true;
    }

    editor.tf.setNodes({ caption: text }, { at: entry[1] });
    return true;
  },
};

// Removes the block. An empty document gets an empty paragraph, as the bookmark remove does.
export const removeImage: EditorCommand<{ id: string }> = {
  id: "block.image.remove",
  label: "Delete",
  group: "action",
  run: (editor, { id }) => {
    const entry = writableImage(editor, id);
    if (entry === undefined) {
      return false;
    }

    removeMediaBlockAt(editor, entry[1]);
    return true;
  },
};
