import type { TElement } from "platejs";

import {
  MEDIA_MIME_PREFIXES,
  cleanMediaSourceFields,
  isStoredMediaAttr,
  type MediaSource,
} from "./editor-media-source";
import { cleanMediaCaptionField, isMediaCaption } from "./editor-media-layout";

// The audio block: a compact player for an audio file, with a caption under it. It has no width or
// alignment. The shared source fields are in editor-media-source.ts. The commands are in
// editor-audio-commands.ts. This module imports no command code, so the static renderer can use it.

export const AUDIO_KEY = "audio";

export const AUDIO_URL_REMOVED =
  "An audio file has an unsupported url. The audio was cleared to an empty placeholder.";
export const AUDIO_ATTRS_CLEANED =
  "An audio file lost an attribute that is not valid. The audio was kept.";

export type AudioFields = Partial<MediaSource> & { caption?: string };

export type CleanedAudio = {
  fields: AudioFields;
  dropped: boolean; // true when a field was present and removed
};

// A literal list. The audio fields are written in this order.
const AUDIO_FIELD_KEYS = [
  "url",
  "name",
  "size",
  "mime",
  "caption",
] as const satisfies readonly (keyof AudioFields)[];

// The check for one stored audio attribute. A mime type must start with audio/.
export function isStoredAudioAttr(attr: string, value: unknown): boolean {
  switch (attr) {
    case "caption":
      return isMediaCaption(value);
    default:
      return isStoredMediaAttr(attr, value, MEDIA_MIME_PREFIXES.audio);
  }
}

// Cleans each field of a raw audio block, the way paste does. A stored audio comes out unchanged.
// A field that cannot be cleaned is left out and sets `dropped`.
export function cleanAudioFields(raw: Record<string, unknown>): CleanedAudio {
  const shared = cleanMediaSourceFields(raw, MEDIA_MIME_PREFIXES.audio);
  const caption = cleanMediaCaptionField(raw);
  const fields: AudioFields = { ...shared.fields, ...caption.fields };
  return { fields, dropped: shared.dropped || caption.dropped };
}

export function audioElement(fields: AudioFields, id?: string): TElement {
  const node: TElement = { type: AUDIO_KEY, children: [{ text: "" }] };
  if (id !== undefined) {
    node.id = id;
  }

  for (const key of AUDIO_FIELD_KEYS) {
    const value = fields[key];
    if (value !== undefined) {
      node[key] = value;
    }
  }
  return node;
}
