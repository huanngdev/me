// One URL policy for the plugin, popover, paste, HTML deserialize, validator, and render.
// A bare domain is not rewritten here. The link input calls normalizeLinkInput.

export const LINK_URL_MAX = 2048;

export const UNSAFE_LINK_PASTE = "A pasted link used an unsafe URL. The text was kept.";

const ALLOWED_SCHEMES = new Set(["http", "https", "mailto", "tel"]);

const BARE_DOMAIN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}(?:[/?#][^\s]*)?$/i;

type PasteRepair = {
  path: number[];
  message: string;
};

let unsafePasteRepairs: PasteRepair[] = [];

export function sanitizeLinkUrl(raw: string): string | undefined {
  if (raw.length === 0 || raw.length > LINK_URL_MAX || hasForbiddenChar(raw)) {
    return undefined;
  }

  if (raw.startsWith("//")) {
    return undefined;
  }

  if (raw.startsWith("/")) {
    return raw;
  }

  if (raw.startsWith("#")) {
    return raw;
  }

  const match = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(raw);
  if (match === null) {
    return undefined;
  }

  const scheme = match[1];
  if (scheme === undefined || !ALLOWED_SCHEMES.has(scheme.toLowerCase())) {
    return undefined;
  }

  return raw;
}

// Typed space/Enter autolink only. Popover, paste, HTML, and stored links still use sanitizeLinkUrl.
export function typedAutolinkUrl(raw: string): string | undefined {
  const url = sanitizeLinkUrl(raw);
  if (url === undefined) {
    return undefined;
  }

  const match = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(url);
  const scheme = match?.[1];
  if (scheme === undefined || !ALLOWED_SCHEMES.has(scheme.toLowerCase())) {
    return undefined;
  }

  return url;
}

// Only the link popover uses this. Paste and autolink keep the typed characters.
export function normalizeLinkInput(raw: string): string {
  const trimmed = raw.trim();
  if (sanitizeLinkUrl(trimmed) !== undefined) {
    return trimmed;
  }

  if (BARE_DOMAIN.test(trimmed)) {
    return `https://${trimmed}`;
  }

  return trimmed;
}

export function isExternalLinkUrl(url: string): boolean {
  const colon = url.indexOf(":");
  if (colon <= 0) {
    return false;
  }

  const scheme = url.slice(0, colon).toLowerCase();
  return scheme === "http" || scheme === "https";
}

export function noteUnsafePastedLink(): void {
  unsafePasteRepairs.push({ path: [], message: UNSAFE_LINK_PASTE });
}

export function unsafePastedLinkRepairs(): readonly PasteRepair[] {
  return unsafePasteRepairs;
}

export function clearUnsafePastedLinkRepairs(): void {
  unsafePasteRepairs = [];
}

function hasForbiddenChar(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x20 || code === 0x7f || code === 0x2028 || code === 0x2029) {
      return true;
    }
  }

  return false;
}
