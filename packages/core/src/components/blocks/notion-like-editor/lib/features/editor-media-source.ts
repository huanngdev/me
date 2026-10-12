import { ElementApi, type SlateEditor, type TElement } from "platejs";

import {
  cleanFileName,
  sanitizeMimeType,
  sanitizeStoredFileUrl,
  sanitizeUploadedFile,
} from "./editor-file-url";

// Media block types and the mime prefix each one accepts. Every key is a block type.
// The image block reads its prefix from here.
export const MEDIA_MIME_PREFIXES = { image: "image/" } as const;

const MEDIA_PREFIX_BY_TYPE = new Map<string, string>(Object.entries(MEDIA_MIME_PREFIXES));

// The attributes a media block stores for its file. Nothing else about the file is stored.
export const MEDIA_SOURCE_ATTRS = ["url", "name", "size", "mime"] as const;

export type MediaSource = {
  url: string;
  name?: string;
  size?: number;
  mime?: string;
};

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
