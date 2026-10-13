import type { EditorCommand } from "../commands/editor-commands";
import { AUDIO_KEY } from "./editor-audio";
import { embedUrlSource } from "./editor-media-source";
import {
  createMediaCaptionCommand,
  createMediaClearSourceCommand,
  createMediaInsertCommand,
  createMediaRemoveCommand,
  createMediaSetSourceCommand,
} from "./editor-media-commands";

// The audio commands. The shared ones are built by editor-media-commands.ts. A url-only value is an
// embed link and must be http or https.

export const insertAudio: EditorCommand<{ id: string }> = createMediaInsertCommand(AUDIO_KEY);

export const setAudioSource = createMediaSetSourceCommand(AUDIO_KEY, embedUrlSource);

export const clearAudioSource = createMediaClearSourceCommand(AUDIO_KEY);

export const setAudioCaption = createMediaCaptionCommand(AUDIO_KEY);

// Removes the block. An empty document gets an empty paragraph, as the bookmark remove does.
export const removeAudio = createMediaRemoveCommand(AUDIO_KEY);
