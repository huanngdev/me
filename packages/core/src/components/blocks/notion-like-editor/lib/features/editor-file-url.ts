import { sanitizeBookmarkText } from "./editor-bookmark-url";
import { truncateUnits } from "./editor-find";
import type { FileUploadAdapter, UploadedFile } from "./editor-file-upload";

const STORED_FILE_URL_MAX = 2048;
export const FILE_NAME_MAX = 255;
const FILE_MIME_MAX = 127;

const DENIED_SCHEMES: readonly string[] = ["javascript", "data", "vbscript"];
const SCHEME_PREFIX = /^[^/?#:]*:/;
const CONTROL_CHAR = /\p{Cc}/u;
const WHITESPACE = /\s/;
const MIME_TYPE = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/;
const UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// The value is trimmed, then checked. Letters only are kept from the scheme, so a hidden
// character inside `javascript:` does not hide the scheme from the check.
export function sanitizeStoredFileUrl(raw: unknown): string | null {
  if (typeof raw !== "string") {
    return null;
  }

  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > STORED_FILE_URL_MAX) {
    return null;
  }

  if (CONTROL_CHAR.test(trimmed) || WHITESPACE.test(trimmed)) {
    return null;
  }

  const prefix = SCHEME_PREFIX.exec(trimmed)?.[0];
  if (prefix !== undefined) {
    const scheme = prefix
      .slice(0, -1)
      .toLowerCase()
      .replace(/[^a-z]/g, "");
    if (DENIED_SCHEMES.includes(scheme)) {
      return null;
    }
  }

  return trimmed;
}

export function parseUrl(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

// A root-relative path such as /a.png names a same-origin asset. "//host/a" is protocol-relative
// and "/\host" can be read as one by a browser, so both are refused.
export function isRootRelativeFileUrl(url: string): boolean {
  return (
    url.startsWith("/") &&
    !url.startsWith("//") &&
    !url.includes("\\") &&
    !CONTROL_CHAR.test(url) &&
    !WHITESPACE.test(url)
  );
}

// Only http, https, blob and root-relative URLs can reach `src` or `href`.
export function isLoadableFileUrl(url: string): boolean {
  if (isRootRelativeFileUrl(url)) {
    return true;
  }

  const parsed = parseUrl(url);
  if (parsed === null) {
    return false;
  }

  return parsed.protocol === "http:" || parsed.protocol === "https:" || parsed.protocol === "blob:";
}

export function isHttpFileUrl(url: string): boolean {
  const parsed = parseUrl(url);
  return parsed !== null && (parsed.protocol === "http:" || parsed.protocol === "https:");
}

// A url that loads without the adapter: http, https, or root-relative.
export function isDirectFileUrl(url: string): boolean {
  return isHttpFileUrl(url) || isRootRelativeFileUrl(url);
}

// A direct url loads without the adapter. Anything else goes through `resolveUrl`.
// Any throw, abort or unloadable result gives null.
export async function resolveFileUrl(
  adapter: FileUploadAdapter | null,
  stored: string,
  signal: AbortSignal,
): Promise<string | null> {
  const clean = sanitizeStoredFileUrl(stored);
  if (clean === null) {
    return null;
  }

  if (isDirectFileUrl(clean)) {
    return clean;
  }

  if (adapter === null || adapter.resolveUrl === undefined || signal.aborted) {
    return null;
  }

  try {
    const resolved: unknown = await adapter.resolveUrl(clean, signal);
    if (signal.aborted || typeof resolved !== "string" || !isLoadableFileUrl(resolved)) {
      return null;
    }

    return resolved;
  } catch {
    return null;
  }
}

// Strips control and bidi override characters, collapses whitespace, and cuts to the limit.
// Length is counted in UTF-16 units, so the result never exceeds `limit` in `.length`.
export function cleanFileText(value: string, limit: number): string | undefined {
  const text = sanitizeBookmarkText(value, limit);
  if (text === undefined) {
    return undefined;
  }

  return text.length <= limit ? text : truncateUnits(text, limit);
}

// Path separators become underscores, so a name never reads as a path.
export function cleanFileName(value: string): string | undefined {
  return cleanFileText(value.replace(/[/\\]/g, "_"), FILE_NAME_MAX);
}

export function sanitizeMimeType(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > FILE_MIME_MAX || !MIME_TYPE.test(value)) {
    return undefined;
  }

  return value;
}

function isFileSize(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

// Validates an upload result. An invalid url makes the whole result null. Invalid optional
// fields are dropped.
export function sanitizeUploadedFile(raw: unknown): UploadedFile | null {
  if (!isRecord(raw)) {
    return null;
  }

  const url = sanitizeStoredFileUrl(raw.url);
  if (url === null) {
    return null;
  }

  const file: UploadedFile = { url };
  const name = typeof raw.name === "string" ? cleanFileName(raw.name) : undefined;
  if (name !== undefined) {
    file.name = name;
  }

  if (isFileSize(raw.size)) {
    file.size = raw.size;
  }

  const mime = sanitizeMimeType(raw.mime);
  if (mime !== undefined) {
    file.mime = mime;
  }

  return file;
}

// Base 1024, at most one decimal, and no trailing ".0". Invalid input shows as "0 B".
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  let unit = 0;
  let value = bytes;
  while (unit < UNITS.length - 1 && value >= 1024) {
    value /= 1024;
    unit += 1;
  }

  if (unit === 0) {
    return `${Math.floor(value)} B`;
  }

  let rounded = Math.round(value * 10) / 10;
  // Rounding can reach 1024 of this unit, so the value moves up one unit.
  if (rounded >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
    rounded = Math.round(value * 10) / 10;
  }

  return `${rounded} ${UNITS[unit]}`;
}
