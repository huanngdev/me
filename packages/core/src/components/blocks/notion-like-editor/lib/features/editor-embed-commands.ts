import type { EditorCommand } from "../commands/editor-commands";
import { EMBED_KEY, embedFieldsOf, EMBED_SOURCE_ATTRS } from "./editor-embed";
import { parseEmbedUrl } from "./editor-embed-url";
import type { UploadedFile } from "./editor-file-upload";
import {
  createMediaAlignCommand,
  createMediaCaptionCommand,
  createMediaInsertCommand,
  createMediaRemoveCommand,
  createMediaWidthCommand,
  writableMediaBlock,
} from "./editor-media-commands";

// The embed commands. A link that is not YouTube or Vimeo is refused. The layout commands are the
// shared ones the video block uses.

export const insertEmbed: EditorCommand<{ id: string }> = createMediaInsertCommand(EMBED_KEY);

// Stores the provider, id, hash, start and normalized link of a YouTube or Vimeo link. Only the url of
// the file is read. Any other link gives false and changes nothing.
export const setEmbedSource: EditorCommand<{ id: string; file: UploadedFile }> = {
  id: "block.embed.set-source",
  label: "Set embed",
  group: "action",
  run: (editor, { id, file }) => {
    const entry = writableMediaBlock(editor, id, EMBED_KEY);
    const parsed = parseEmbedUrl(file.url);
    if (entry === undefined || parsed === undefined) {
      return false;
    }

    const fields = embedFieldsOf(parsed);
    const props: Record<string, string | number> = {
      provider: parsed.provider,
      videoId: parsed.videoId,
      url: parsed.sourceUrl,
    };
    if (fields.hash !== undefined) {
      props.hash = fields.hash;
    }
    if (fields.startSeconds !== undefined) {
      props.startSeconds = fields.startSeconds;
    }

    const drop = EMBED_SOURCE_ATTRS.filter((key) => !(key in props));
    editor.tf.setNodes(props, { at: entry[1] });
    if (drop.length > 0) {
      editor.tf.unsetNodes([...drop], { at: entry[1] });
    }
    return true;
  },
};

export const setEmbedCaption = createMediaCaptionCommand(EMBED_KEY);

// null removes the width, which means the natural size.
export const setEmbedWidth = createMediaWidthCommand(EMBED_KEY);

export const setEmbedAlign = createMediaAlignCommand(EMBED_KEY);

// Removes the block. An empty document gets an empty paragraph, as the bookmark remove does.
export const removeEmbed = createMediaRemoveCommand(EMBED_KEY);
