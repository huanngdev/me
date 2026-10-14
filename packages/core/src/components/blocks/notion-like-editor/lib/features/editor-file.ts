import type { TElement } from "platejs";

import { cleanFileName, isRootRelativeFileUrl, parseUrl } from "./editor-file-url";
import {
  MEDIA_MIME_PREFIXES,
  cleanMediaSourceFields,
  isStoredMediaAttr,
  type MediaSource,
} from "./editor-media-source";

// The file block: a link to a file with its name, size and mime type. It has no width, alignment or
// caption. The shared source fields are in editor-media-source.ts. The commands are in
// editor-file-commands.ts. This module imports no command code, so the static renderer can use it.

export const FILE_KEY = "file";

export const FILE_URL_REMOVED =
  "A file has an unsupported url. The file was cleared to an empty placeholder.";
export const FILE_ATTRS_CLEANED = "A file lost an attribute that is not valid. The file was kept.";

type FileFields = Partial<MediaSource>;

type CleanedFile = {
  fields: FileFields;
  dropped: boolean; // true when a field was present and removed
};

// A literal list. The file fields are written in this order.
const FILE_FIELD_KEYS = [
  "url",
  "name",
  "size",
  "mime",
] as const satisfies readonly (keyof MediaSource)[];

// The check for one stored file attribute. Any valid mime type is allowed.
export function isStoredFileAttr(attr: string, value: unknown): boolean {
  return isStoredMediaAttr(attr, value, MEDIA_MIME_PREFIXES.file);
}

// Cleans each field of a raw file block, the way paste does. A stored file comes out unchanged.
export function cleanFileFields(raw: Record<string, unknown>): CleanedFile {
  return cleanMediaSourceFields(raw, MEDIA_MIME_PREFIXES.file);
}

export function fileElement(fields: FileFields, id?: string): TElement {
  const node: TElement = { type: FILE_KEY, children: [{ text: "" }] };
  if (id !== undefined) {
    node.id = id;
  }

  for (const key of FILE_FIELD_KEYS) {
    const value = fields[key];
    if (value !== undefined) {
      node[key] = value;
    }
  }
  return node;
}

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

// The name a link gets when it has none: its last path segment, decoded and cleaned, or else its host.
// A root-relative url has no host, so only its path counts.
export function fileNameFromUrl(url: string): string | undefined {
  const parsed = parseUrl(url);
  const path =
    parsed !== null
      ? parsed.pathname
      : isRootRelativeFileUrl(url)
        ? url.split(/[?#]/)[0]
        : undefined;
  if (path === undefined) {
    return undefined;
  }

  const segments = path.split("/").filter((segment) => segment.length > 0);
  const last = segments[segments.length - 1] ?? "";
  const name = cleanFileName(decodeSegment(last));
  if (name !== undefined && name.length > 0) {
    return name;
  }

  return parsed === null ? undefined : cleanFileName(parsed.hostname);
}

// The name to show: the stored name, else the name in the url, else "File".
export function displayFileName(fields: FileFields): string {
  if (fields.name !== undefined) {
    return fields.name;
  }

  const fromUrl = fields.url === undefined ? undefined : fileNameFromUrl(fields.url);
  return fromUrl ?? "File";
}

// The part of a name from its last dot, dot included. A name with no dot, or one that starts with
// a dot, has no extension.
export function fileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 && dot < name.length - 1 ? name.slice(dot) : "";
}
