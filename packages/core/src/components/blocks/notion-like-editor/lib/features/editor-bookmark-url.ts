import type { TElement } from "platejs";

export const BOOKMARK_KEY = "bookmark";

export const BOOKMARK_URL_MAX = 2048;
export const BOOKMARK_TITLE_MAX = 300;
export const BOOKMARK_DESCRIPTION_MAX = 500;
export const BOOKMARK_SITE_NAME_MAX = 100;

export const BOOKMARK_INVALID_URL = "That link is not an http or https URL.";
export const BOOKMARK_PASTE_DROPPED =
  "A bookmark was removed because its link is not an http or https URL.";

const ELLIPSIS = "…";

export type BookmarkFields = {
  url: string;
  title?: string;
  description?: string;
  siteName?: string;
  imageUrl?: string;
  fetchedAt?: string;
};

export type LinkPreview = {
  title?: string;
  description?: string;
  siteName?: string;
  imageUrl?: string;
};

// A server fetchPreview must block private, loopback, and link-local addresses after DNS,
// re-check every redirect (≤ 3), cap the body at 512 KB and the time at 5 s, and parse only text/html.
// This editor never fetches the URL itself.
export type LinkPreviewAdapter = {
  fetchPreview: (url: string, signal: AbortSignal) => Promise<LinkPreview | null>;
};

export function sanitizeBookmarkText(value: string, limit: number): string | undefined {
  const normalized = value.normalize("NFC");
  let stripped = "";
  for (const char of normalized) {
    const code = char.codePointAt(0);
    if (code === undefined || code <= 0x1f || code === 0x7f) {
      continue;
    }

    if ((code >= 0x202a && code <= 0x202e) || (code >= 0x2066 && code <= 0x2069)) {
      continue;
    }

    stripped += char;
  }

  const collapsed = stripped.replace(/\s+/g, " ").trim();
  if (collapsed.length === 0 || limit < 1) {
    return undefined;
  }

  const points = [...collapsed];
  if (points.length <= limit) {
    return collapsed;
  }

  return `${points.slice(0, limit - 1).join("")}${ELLIPSIS}`;
}

export function normalizeBookmarkUrl(input: string): string | undefined {
  const trimmed = input.trim();
  if (trimmed.length === 0 || trimmed.length > BOOKMARK_URL_MAX) {
    return undefined;
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return undefined;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return undefined;
  }

  if (url.username.length > 0 || url.password.length > 0) {
    return undefined;
  }

  if (url.href.length > BOOKMARK_URL_MAX) {
    return undefined;
  }

  return url.href;
}

export function normalizeBookmarkImageUrl(input: string): string | undefined {
  if (input.length === 0 || input.length > BOOKMARK_URL_MAX || input !== input.trim()) {
    return undefined;
  }

  if (input.startsWith("/")) {
    if (input.startsWith("//") || hasBookmarkControl(input)) {
      return undefined;
    }

    return input;
  }

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return undefined;
  }

  if (url.protocol !== "https:" || url.username.length > 0 || url.password.length > 0) {
    return undefined;
  }

  if (url.href.length > BOOKMARK_URL_MAX || url.href !== input) {
    return undefined;
  }

  return url.href;
}

export function isBookmarkFetchedAt(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    return false;
  }

  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}

export function isStoredBookmarkText(value: unknown, limit: number): boolean {
  return typeof value === "string" && sanitizeBookmarkText(value, limit) === value;
}

export function storedBookmarkUrl(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = normalizeBookmarkUrl(value);
  if (normalized !== value) {
    return undefined;
  }

  return value;
}

export function bookmarkElement(fields: BookmarkFields, id?: string): TElement {
  const node: TElement = {
    type: BOOKMARK_KEY,
    url: fields.url,
    children: [{ text: "" }],
  };
  if (id !== undefined) {
    node.id = id;
  }

  assignBookmarkField(node, "title", fields.title);
  assignBookmarkField(node, "description", fields.description);
  assignBookmarkField(node, "siteName", fields.siteName);
  assignBookmarkField(node, "imageUrl", fields.imageUrl);
  assignBookmarkField(node, "fetchedAt", fields.fetchedAt);
  return node;
}

export function storedBookmark(node: Record<string, unknown>): BookmarkFields | undefined {
  const url = storedBookmarkUrl(node.url);
  if (url === undefined) {
    return undefined;
  }

  const title = readStoredText(node, "title", BOOKMARK_TITLE_MAX);
  const description = readStoredText(node, "description", BOOKMARK_DESCRIPTION_MAX);
  const siteName = readStoredText(node, "siteName", BOOKMARK_SITE_NAME_MAX);
  if (title === false || description === false || siteName === false) {
    return undefined;
  }

  let imageUrl: string | undefined;
  if ("imageUrl" in node) {
    if (typeof node.imageUrl !== "string") {
      return undefined;
    }

    const normalized = normalizeBookmarkImageUrl(node.imageUrl);
    if (normalized !== node.imageUrl) {
      return undefined;
    }

    imageUrl = normalized;
  }

  let fetchedAt: string | undefined;
  if ("fetchedAt" in node) {
    if (!isBookmarkFetchedAt(node.fetchedAt)) {
      return undefined;
    }

    fetchedAt = node.fetchedAt;
  }

  return {
    url,
    title,
    description,
    siteName,
    imageUrl,
    fetchedAt,
  };
}

export function bookmarkPreviewFields(preview: LinkPreview): Omit<BookmarkFields, "url"> {
  return {
    title: readPreviewText(preview.title, BOOKMARK_TITLE_MAX),
    description: readPreviewText(preview.description, BOOKMARK_DESCRIPTION_MAX),
    siteName: readPreviewText(preview.siteName, BOOKMARK_SITE_NAME_MAX),
    imageUrl:
      typeof preview.imageUrl === "string"
        ? normalizeBookmarkImageUrl(preview.imageUrl)
        : undefined,
  };
}

export function bookmarkDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function assignBookmarkField(node: TElement, key: string, value: string | undefined): void {
  if (value !== undefined) {
    node[key] = value;
  }
}

function readStoredText(
  node: Record<string, unknown>,
  key: string,
  limit: number,
): string | undefined | false {
  if (!(key in node)) {
    return undefined;
  }

  if (!isStoredBookmarkText(node[key], limit)) {
    return false;
  }

  if (typeof node[key] !== "string") {
    return false;
  }

  return node[key];
}

function readPreviewText(value: string | undefined, limit: number): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return sanitizeBookmarkText(value, limit);
}

function hasBookmarkControl(value: string): boolean {
  for (const char of value) {
    const code = char.codePointAt(0);
    if (code === undefined || code <= 0x1f || code === 0x7f || code === 0x20) {
      return true;
    }
  }

  return false;
}
