import { ElementApi, KEYS, PathApi, nanoid, type SlateEditor, type TElement } from "platejs";

import {
  cleanFileName,
  isHttpFileUrl,
  sanitizeMimeType,
  sanitizeStoredFileUrl,
  sanitizeUploadedFile,
} from "./editor-file-url";
import type { UploadedFile } from "./editor-file-upload";

// Media block types and the mime prefix each one accepts. Every key is a block type.
// An empty prefix accepts any mime type. Every media block reads its prefix from here.
export const MEDIA_MIME_PREFIXES = {
  image: "image/",
  file: "",
  video: "video/",
  audio: "audio/",
} as const;

export type MediaBlockType = keyof typeof MEDIA_MIME_PREFIXES;

const MEDIA_PREFIX_BY_TYPE = new Map<string, string>(Object.entries(MEDIA_MIME_PREFIXES));

// The longest id a media block can have. Every media block shares it.
export const MEDIA_ID_MAX = 128;

// The attributes a media block stores for its file. Nothing else about the file is stored.
export const MEDIA_SOURCE_ATTRS = ["url", "name", "size", "mime"] as const;

export type MediaSource = {
  url: string;
  name?: string;
  size?: number;
  mime?: string;
};

export function isMediaBlockType(type: string): type is MediaBlockType {
  return MEDIA_PREFIX_BY_TYPE.has(type);
}

// A stored url is a valid stored value and never a blob url, which only exists in one browser tab.
export function isStoredMediaUrl(value: unknown): value is string {
  return (
    typeof value === "string" && sanitizeStoredFileUrl(value) === value && !/^blob:/i.test(value)
  );
}

// A stored name is already cleaned, so cleaning it again changes nothing.
export function isStoredMediaName(value: unknown): value is string {
  return typeof value === "string" && cleanFileName(value) === value;
}

export function isStoredMediaSize(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

export function isStoredMediaMime(value: unknown, prefix: string): value is string {
  return typeof value === "string" && sanitizeMimeType(value) === value && value.startsWith(prefix);
}

// The check for one shared source attribute. Other attribute names are not media attributes.
export function isStoredMediaAttr(attr: string, value: unknown, prefix: string): boolean {
  switch (attr) {
    case "url":
      return isStoredMediaUrl(value);
    case "name":
      return isStoredMediaName(value);
    case "size":
      return isStoredMediaSize(value);
    case "mime":
      return isStoredMediaMime(value, prefix);
    default:
      return false;
  }
}

// Cleans the shared source fields of a raw media block, the way paste does. A field that cannot be
// cleaned is left out and sets `dropped`. A mime type must start with `prefix`.
export function cleanMediaSourceFields(
  raw: Record<string, unknown>,
  prefix: string,
): { fields: Partial<MediaSource>; dropped: boolean } {
  const fields: Partial<MediaSource> = {};
  let dropped = false;

  if ("url" in raw) {
    const url = sanitizeStoredFileUrl(raw.url);
    if (url !== null && isStoredMediaUrl(url)) {
      fields.url = url;
    } else {
      dropped = true;
    }
  }

  if ("name" in raw) {
    const name = typeof raw.name === "string" ? cleanFileName(raw.name) : undefined;
    if (name !== undefined) {
      fields.name = name;
    } else {
      dropped = true;
    }
  }

  if ("size" in raw) {
    if (isStoredMediaSize(raw.size)) {
      fields.size = raw.size;
    } else {
      dropped = true;
    }
  }

  if ("mime" in raw) {
    const mime = sanitizeMimeType(raw.mime);
    if (mime !== undefined && mime.startsWith(prefix)) {
      fields.mime = mime;
    } else {
      dropped = true;
    }
  }

  return { fields, dropped };
}

// Turns a raw upload result or embed value into a stored source. A url that is not storable gives
// null. An invalid name, size or mime is dropped, and the mime must start with `prefix`.
export function sanitizeMediaSource(raw: unknown, prefix: string): MediaSource | null {
  const file = sanitizeUploadedFile(raw);
  if (file === null || !isStoredMediaUrl(file.url)) {
    return null;
  }

  const source: MediaSource = { url: file.url };
  if (file.name !== undefined) {
    source.name = file.name;
  }
  if (file.size !== undefined) {
    source.size = file.size;
  }
  if (file.mime !== undefined && file.mime.startsWith(prefix)) {
    source.mime = file.mime;
  }
  return source;
}

// A url-only value is an embed link. Any name, size or mime makes the value an upload result.
export function isEmbedLink(file: UploadedFile): boolean {
  return file.name === undefined && file.size === undefined && file.mime === undefined;
}

// An embed link must be http or https. It is trimmed and at most 2048 characters.
export function sanitizeMediaEmbedUrl(raw: unknown): string | null {
  const clean = sanitizeStoredFileUrl(raw);
  return clean !== null && isHttpFileUrl(clean) ? clean : null;
}

// The source of an embed link that has only a url. The image, video and audio blocks use it.
export function embedUrlSource(file: UploadedFile): MediaSource | null {
  const url = sanitizeMediaEmbedUrl(file.url);
  return url === null ? null : { url };
}

// The block with this id, when it is a media block and the editor is writable.
export function mediaBlockEntry(
  editor: SlateEditor,
  blockId: string,
): [TElement, number[]] | undefined {
  if (editor.dom.readOnly === true) {
    return undefined;
  }

  for (const [node, path] of editor.api.nodes({
    at: [],
    match: (candidate) =>
      ElementApi.isElement(candidate) &&
      candidate.id === blockId &&
      MEDIA_PREFIX_BY_TYPE.has(candidate.type),
  })) {
    if (ElementApi.isElement(node)) {
      return [node, path];
    }
  }

  return undefined;
}

export function mediaMimePrefix(type: string): string | undefined {
  return MEDIA_PREFIX_BY_TYPE.get(type);
}

// Writes the source attributes of one block. Attributes the source does not have are removed.
export function applyMediaSource(editor: SlateEditor, path: number[], source: MediaSource): void {
  const props: Record<string, string | number> = { url: source.url };
  if (source.name !== undefined) {
    props.name = source.name;
  }
  if (source.size !== undefined) {
    props.size = source.size;
  }
  if (source.mime !== undefined) {
    props.mime = source.mime;
  }

  const drop = MEDIA_SOURCE_ATTRS.filter((key) => !(key in props));
  editor.tf.setNodes(props, { at: path });
  if (drop.length > 0) {
    editor.tf.unsetNodes([...drop], { at: path });
  }
}

// A new id is not empty, is short enough, and is not used by any block, void or not.
export function isNewMediaBlockId(editor: SlateEditor, id: unknown): id is string {
  if (typeof id !== "string" || id.length === 0 || id.length > MEDIA_ID_MAX) {
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

// Mirrors the bookmark insert: an empty top-level paragraph is replaced, and anything else gets the
// blocks below the current top-level block. The last new block is selected.
function placeMediaBlocks(editor: SlateEditor, elements: TElement[]): boolean {
  const entry = editor.api.block({ highest: true });
  if (entry === undefined || !ElementApi.isElement(entry[0])) {
    return false;
  }

  const [node, path] = entry;
  const replaceEmpty =
    node.type === KEYS.p && editor.api.string(node).length === 0 && path.length === 1;
  if (replaceEmpty) {
    editor.tf.removeNodes({ at: path });
    editor.tf.insertNodes(elements, { at: path, select: true });
    return true;
  }

  const at = PathApi.next(path);
  if (at === undefined) {
    return false;
  }

  editor.tf.insertNodes(elements, { at, select: true });
  return true;
}

// One new block per entry, in order, as one undo step. Ids must be new and unique. With
// `replaceSelection`, an expanded selection is deleted first, in the same step.
export function placeNewMediaBlocks(
  editor: SlateEditor,
  blocks: readonly { id: string; element: TElement }[],
  replaceSelection: boolean,
): boolean {
  if (blocks.length === 0 || new Set(blocks.map((block) => block.id)).size !== blocks.length) {
    return false;
  }
  if (!blocks.every((block) => isNewMediaBlockId(editor, block.id))) {
    return false;
  }

  if (replaceSelection && editor.selection !== null && !editor.api.isCollapsed()) {
    editor.tf.deleteFragment();
  }
  return placeMediaBlocks(
    editor,
    blocks.map((block) => block.element),
  );
}

// Removes a media block. An empty document gets an empty paragraph, as the bookmark remove does.
export function removeMediaBlockAt(editor: SlateEditor, path: number[]): void {
  editor.tf.removeNodes({ at: path });
  if (editor.children.length === 0) {
    editor.tf.insertNodes(
      { type: KEYS.p, id: nanoid(), children: [{ text: "" }] },
      { at: [0], select: true },
    );
  }
}
