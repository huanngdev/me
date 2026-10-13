import type { EditorCommand } from "../commands/editor-commands";
import { embedUrlSource } from "./editor-media-source";
import {
  createMediaAlignCommand,
  createMediaCaptionCommand,
  createMediaClearSourceCommand,
  createMediaInsertCommand,
  createMediaRemoveCommand,
  createMediaSetSourceCommand,
  createMediaWidthCommand,
} from "./editor-media-commands";
import { VIDEO_KEY } from "./editor-video";

// The video commands. The shared ones are built by editor-media-commands.ts. A url-only value is an
// embed link and must be http or https. No other site is parsed here.

export const insertVideo: EditorCommand<{ id: string }> = createMediaInsertCommand(VIDEO_KEY);

export const setVideoSource = createMediaSetSourceCommand(VIDEO_KEY, embedUrlSource);

export const clearVideoSource = createMediaClearSourceCommand(VIDEO_KEY);

export const setVideoCaption = createMediaCaptionCommand(VIDEO_KEY);

// null removes the width, which means the natural size.
export const setVideoWidth = createMediaWidthCommand(VIDEO_KEY);

export const setVideoAlign = createMediaAlignCommand(VIDEO_KEY);

// Removes the block. An empty document gets an empty paragraph, as the bookmark remove does.
export const removeVideo = createMediaRemoveCommand(VIDEO_KEY);
