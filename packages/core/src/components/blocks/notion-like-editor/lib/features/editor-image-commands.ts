import { ElementApi, KEYS, PathApi, nanoid, type SlateEditor, type TElement } from "platejs";

import type { EditorCommand } from "../commands/editor-commands";
import { cleanFileText } from "./editor-file-url";
import type { UploadedFile } from "./editor-file-upload";
import {
  IMAGE_CAPTION_MAX,
  IMAGE_ID_MAX,
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
  mediaBlockEntry,
  sanitizeMediaSource,
  type MediaSource,
} from "./editor-media-source";

// An embed link has only a url. Any name, size or mime makes the value an upload result.
function isEmbedLink(file: UploadedFile): boolean {
  return file.name === undefined && file.size === undefined && file.mime === undefined;
}

function embedSource(file: UploadedFile): MediaSource | null {
  const url = sanitizeImageEmbedUrl(file.url);
  return url === null ? null : { url };
}

function writableImage(editor: SlateEditor, id: string): [TElement, number[]] | undefined {
  const entry = mediaBlockEntry(editor, id);
  return entry !== undefined && entry[0].type === IMAGE_KEY ? entry : undefined;
}

// A new id is not empty, is short enough, and is not used by any block, void or not.
function isNewBlockId(editor: SlateEditor, id: unknown): id is string {
  if (typeof id !== "string" || id.length === 0 || id.length > IMAGE_ID_MAX) {
    return false;
  }

  for (const [node] of editor.api.nodes({
    at: [],
    voids: true,
    match: (candidate) => ElementApi.isElement(candidate) && candidate.id === id,
  })) {
    if (ElementApi.isElement(node)) {
      return false;
    }
  }

  return true;
}

// Mirrors the bookmark insert: an empty top-level paragraph is replaced, and anything else gets
// the block below the current top-level block. The new block is selected.
function placeImage(editor: SlateEditor, element: TElement): boolean {
  const entry = editor.api.block({ highest: true });
  if (entry === undefined || !ElementApi.isElement(entry[0])) {
    return false;
  }

  const [node, path] = entry;
  const replaceEmpty =
    node.type === KEYS.p && editor.api.string(node).length === 0 && path.length === 1;
  if (replaceEmpty) {
    editor.tf.removeNodes({ at: path });
    editor.tf.insertNodes(element, { at: path, select: true });
    return true;
  }

  const at = PathApi.next(path);
  if (at === undefined) {
    return false;
  }

  editor.tf.insertNodes(element, { at, select: true });
  return true;
}

// The payload id is the new block's id. The caller picks it, so it knows the id after the insert.
// Refused when the id is empty, too long, or already used.
export const insertImage: EditorCommand<{ id: string }> = {
  id: "block.insert.image",
  label: "Image",
  group: "insert",
  run: (editor, { id }) => {
    if (!isNewBlockId(editor, id)) {
      return false;
    }

    return placeImage(editor, imageElement({}, id));
  },
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

    editor.tf.removeNodes({ at: entry[1] });
    if (editor.children.length === 0) {
      editor.tf.insertNodes(
        { type: KEYS.p, id: nanoid(), children: [{ text: "" }] },
        { at: [0], select: true },
      );
    }
    return true;
  },
};
