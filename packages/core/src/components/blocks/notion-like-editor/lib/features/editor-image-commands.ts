import type { EditorCommand } from "../commands/editor-commands";
import { IMAGE_KEY, imageElement } from "./editor-image";
import { embedUrlSource, placeNewMediaBlocks } from "./editor-media-source";
import {
  createMediaAlignCommand,
  createMediaCaptionCommand,
  createMediaClearSourceCommand,
  createMediaInsertCommand,
  createMediaRemoveCommand,
  createMediaSetSourceCommand,
  createMediaWidthCommand,
} from "./editor-media-commands";

// The image commands. The shared ones are built by editor-media-commands.ts.

// One image block with this id, placed like a bookmark: see placeMediaBlocks. The id must be new.
export const insertImage: EditorCommand<{ id: string }> = createMediaInsertCommand(IMAGE_KEY);

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
export const setImageSource = createMediaSetSourceCommand(IMAGE_KEY, embedUrlSource);

// Back to the empty placeholder. Width, alignment and caption stay.
export const clearImageSource = createMediaClearSourceCommand(IMAGE_KEY);

// null removes the width, which means the natural size.
export const setImageWidth = createMediaWidthCommand(IMAGE_KEY);

export const setImageAlign = createMediaAlignCommand(IMAGE_KEY);

// An empty caption removes the attribute. A longer caption is cut to the limit.
export const setImageCaption = createMediaCaptionCommand(IMAGE_KEY);

// Removes the block. An empty document gets an empty paragraph, as the bookmark remove does.
export const removeImage = createMediaRemoveCommand(IMAGE_KEY);
