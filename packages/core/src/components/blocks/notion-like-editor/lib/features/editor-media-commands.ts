import type { SlateEditor, TElement } from "platejs";

import type { EditorCommand } from "../commands/editor-commands";
import { cleanFileText } from "./editor-file-url";
import { fileElement, FILE_KEY } from "./editor-file";
import type { UploadedFile } from "./editor-file-upload";
import { audioElement, AUDIO_KEY } from "./editor-audio";
import { imageElement, IMAGE_KEY } from "./editor-image";
import {
  isMediaAlign,
  isMediaWidth,
  MEDIA_CAPTION_MAX,
  type MediaAlign,
} from "./editor-media-layout";
import {
  MEDIA_MIME_PREFIXES,
  MEDIA_SOURCE_ATTRS,
  applyMediaSource,
  isEmbedLink,
  mediaBlockEntry,
  placeNewMediaBlocks,
  removeMediaBlockAt,
  sanitizeMediaSource,
  type MediaBlockType,
  type MediaFileType,
  type MediaSource,
} from "./editor-media-source";
import { videoElement, VIDEO_KEY } from "./editor-video";
import { embedElement, EMBED_KEY } from "./editor-embed";

// The commands every media block shares. Each factory takes the block type, so the image, file, video
// and audio commands are one implementation with the type as a parameter. The ids and labels follow
// the type: block.<type>.set-source, "Set image", and so on.

// Blocks with a width and alignment. Their layout is written by the same commands.
export type MediaLayoutType = Extract<MediaBlockType, "image" | "video" | "embed">;

const MEDIA_LABELS: Record<MediaBlockType, string> = {
  image: "Image",
  file: "File",
  video: "Video",
  audio: "Audio",
  embed: "Embed",
};

// The block of this type with this id, when the editor is writable. Another block gives undefined.
export function writableMediaBlock(
  editor: SlateEditor,
  id: string,
  type: MediaBlockType,
): [TElement, number[]] | undefined {
  const entry = mediaBlockEntry(editor, id);
  return entry !== undefined && entry[0].type === type ? entry : undefined;
}

// An empty block of this type, with its id.
export function mediaBlockElement(type: MediaBlockType, id: string): TElement {
  switch (type) {
    case IMAGE_KEY:
      return imageElement({}, id);
    case FILE_KEY:
      return fileElement({}, id);
    case VIDEO_KEY:
      return videoElement({}, id);
    case AUDIO_KEY:
      return audioElement({}, id);
    case EMBED_KEY:
      return embedElement({}, id);
  }
}

// One empty block of this type. The id must be new.
export function createMediaInsertCommand(type: MediaBlockType): EditorCommand<{ id: string }> {
  return {
    id: `block.insert.${type}`,
    label: MEDIA_LABELS[type],
    group: "insert",
    run: (editor, { id }) =>
      placeNewMediaBlocks(editor, [{ id, element: mediaBlockElement(type, id) }], false),
  };
}

// An upload result is stored with the name, size and mime type it has. A url-only value is an embed
// link, and `embed` decides what an embed link stores.
export function createMediaSetSourceCommand(
  type: MediaFileType,
  embed: (file: UploadedFile) => MediaSource | null,
): EditorCommand<{ id: string; file: UploadedFile }> {
  return {
    id: `block.${type}.set-source`,
    label: `Set ${MEDIA_LABELS[type].toLowerCase()}`,
    group: "action",
    run: (editor, { id, file }) => {
      const entry = writableMediaBlock(editor, id, type);
      if (entry === undefined) {
        return false;
      }

      const source = isEmbedLink(file)
        ? embed(file)
        : sanitizeMediaSource(file, MEDIA_MIME_PREFIXES[type]);
      if (source === null) {
        return false;
      }

      applyMediaSource(editor, entry[1], source);
      return true;
    },
  };
}

// Back to the empty placeholder. Layout and caption stay where the block has them.
export function createMediaClearSourceCommand(type: MediaBlockType): EditorCommand<{ id: string }> {
  return {
    id: `block.${type}.clear-source`,
    label: `Remove ${MEDIA_LABELS[type].toLowerCase()}`,
    group: "action",
    run: (editor, { id }) => {
      const entry = writableMediaBlock(editor, id, type);
      if (entry === undefined) {
        return false;
      }

      editor.tf.unsetNodes([...MEDIA_SOURCE_ATTRS], { at: entry[1] });
      return true;
    },
  };
}

// An empty caption removes the attribute. A longer caption is cut to the limit.
export function createMediaCaptionCommand(
  type: MediaBlockType,
): EditorCommand<{ id: string; caption: string }> {
  return {
    id: `block.${type}.caption`,
    label: `${MEDIA_LABELS[type]} caption`,
    group: "action",
    run: (editor, { id, caption }) => {
      const entry = writableMediaBlock(editor, id, type);
      if (entry === undefined || typeof caption !== "string") {
        return false;
      }

      const text = cleanFileText(caption, MEDIA_CAPTION_MAX);
      if (text === undefined) {
        editor.tf.unsetNodes(["caption"], { at: entry[1] });
        return true;
      }

      editor.tf.setNodes({ caption: text }, { at: entry[1] });
      return true;
    },
  };
}

// null removes the width, which means the natural size.
export function createMediaWidthCommand(
  type: MediaLayoutType,
): EditorCommand<{ id: string; width: number | null }> {
  return {
    id: `block.${type}.width`,
    label: `${MEDIA_LABELS[type]} width`,
    group: "action",
    run: (editor, { id, width }) => {
      const entry = writableMediaBlock(editor, id, type);
      if (entry === undefined) {
        return false;
      }

      if (width === null) {
        editor.tf.unsetNodes(["width"], { at: entry[1] });
        return true;
      }

      if (!isMediaWidth(width)) {
        return false;
      }

      editor.tf.setNodes({ width }, { at: entry[1] });
      return true;
    },
  };
}

export function createMediaAlignCommand(
  type: MediaLayoutType,
): EditorCommand<{ id: string; align: MediaAlign }> {
  return {
    id: `block.${type}.align`,
    label: `${MEDIA_LABELS[type]} alignment`,
    group: "action",
    run: (editor, { id, align }) => {
      const entry = writableMediaBlock(editor, id, type);
      if (entry === undefined || !isMediaAlign(align)) {
        return false;
      }

      editor.tf.setNodes({ align }, { at: entry[1] });
      return true;
    },
  };
}

// Removes the block. An empty document gets an empty paragraph, as the bookmark remove does.
export function createMediaRemoveCommand(type: MediaBlockType): EditorCommand<{ id: string }> {
  return {
    id: `block.${type}.remove`,
    label: "Delete",
    group: "action",
    run: (editor, { id }) => {
      const entry = writableMediaBlock(editor, id, type);
      if (entry === undefined) {
        return false;
      }

      removeMediaBlockAt(editor, entry[1]);
      return true;
    },
  };
}
