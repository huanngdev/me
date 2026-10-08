import { KEYS, type TElement } from "platejs";

// Plate's parseVideoUrl (@platejs/media 53.1.4, dist/src-C28rUpXn.js) accepts
// Dailymotion, Youku, Coub, every *.youtube.com host, and vimeopro.com. It stores
// the player URL and drops the start time and the Vimeo privacy hash.
// BaseMediaEmbedPlugin deserializes any iframe src into { url }.
// This parser accepts only the YouTube and Vimeo URLs from DEV-108.
export const EMBED_URL_MAX = 2048;

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const VIMEO_ID = /^\d{1,12}$/;
const VIMEO_HASH = /^[0-9a-f]{6,20}$/;

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
  "www.youtu.be",
  "m.youtu.be",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
  "m.youtube-nocookie.com",
]);

const VIMEO_HOSTS = new Set([
  "vimeo.com",
  "www.vimeo.com",
  "m.vimeo.com",
  "player.vimeo.com",
  "www.player.vimeo.com",
  "m.player.vimeo.com",
]);

export const EMBED_IFRAME_ALLOW =
  "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen";

export const EMBED_SANDBOX =
  "allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox";

export type EmbedProvider = "youtube" | "vimeo";

export type ParsedEmbed = {
  provider: EmbedProvider;
  videoId: string;
  hash?: string;
  startSeconds?: number;
  sourceUrl: string;
};

export function parseEmbedUrl(input: string): ParsedEmbed | undefined {
  const trimmed = input.trim();
  if (trimmed.length === 0 || trimmed.length > EMBED_URL_MAX) {
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

  if (url.username.length > 0 || url.password.length > 0 || url.port.length > 0) {
    return undefined;
  }

  const host = url.hostname.toLowerCase();
  const start = readStart(url);
  if (!start.ok) {
    return undefined;
  }

  const parsed = YOUTUBE_HOSTS.has(host)
    ? parseYouTube(url, host)
    : VIMEO_HOSTS.has(host)
      ? parseVimeo(url, host)
      : undefined;
  if (parsed === undefined) {
    return undefined;
  }

  const sourceUrl = normalizedHttps(url);
  if (sourceUrl.length > EMBED_URL_MAX) {
    return undefined;
  }

  const embed: ParsedEmbed = {
    provider: parsed.provider,
    videoId: parsed.videoId,
    sourceUrl,
  };
  const hash = "hash" in parsed ? parsed.hash : undefined;
  if (hash !== undefined) {
    embed.hash = hash;
  }
  if (start.seconds !== undefined) {
    embed.startSeconds = start.seconds;
  }

  return embed;
}

export function isYouTubeShort(sourceUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(sourceUrl);
  } catch {
    return false;
  }

  const [first] = pathSegments(url);
  return first === "shorts";
}

export function embedTitle(provider: EmbedProvider): string {
  return provider === "youtube" ? "YouTube video" : "Vimeo video";
}

export function embedProviderLabel(provider: EmbedProvider): string {
  return provider === "youtube" ? "YouTube" : "Vimeo";
}

export function embedFrameSrc(
  embed: Pick<ParsedEmbed, "provider" | "videoId" | "hash" | "startSeconds">,
  autoplay: boolean,
): string {
  if (embed.provider === "youtube") {
    const params = new URLSearchParams();
    if (embed.startSeconds !== undefined) {
      params.set("start", String(embed.startSeconds));
    }
    if (autoplay) {
      params.set("autoplay", "1");
    }
    const query = params.toString();
    const suffix = query.length > 0 ? `?${query}` : "";
    return `https://www.youtube-nocookie.com/embed/${embed.videoId}${suffix}`;
  }

  const params = new URLSearchParams();
  if (embed.hash !== undefined) {
    params.set("h", embed.hash);
  }
  if (autoplay) {
    params.set("autoplay", "1");
  }
  const query = params.toString();
  const suffix = query.length > 0 ? `?${query}` : "";
  const time = embed.startSeconds !== undefined ? `#t=${String(embed.startSeconds)}s` : "";
  return `https://player.vimeo.com/video/${embed.videoId}${suffix}${time}`;
}

export function embedElement(parsed: ParsedEmbed, id?: string): TElement {
  const node: TElement = {
    type: KEYS.mediaEmbed,
    provider: parsed.provider,
    videoId: parsed.videoId,
    sourceUrl: parsed.sourceUrl,
    children: [{ text: "" }],
  };
  if (id !== undefined) {
    node.id = id;
  }
  if (parsed.hash !== undefined) {
    node.hash = parsed.hash;
  }
  if (parsed.startSeconds !== undefined) {
    node.startSeconds = parsed.startSeconds;
  }

  return node;
}

export function storedEmbed(node: Record<string, unknown>): ParsedEmbed | undefined {
  const provider = node.provider;
  const videoId = node.videoId;
  const sourceUrl = node.sourceUrl;
  if ((provider !== "youtube" && provider !== "vimeo") || typeof videoId !== "string") {
    return undefined;
  }
  if (typeof sourceUrl !== "string") {
    return undefined;
  }

  const parsed = parseEmbedUrl(sourceUrl);
  if (parsed === undefined || parsed.provider !== provider || parsed.videoId !== videoId) {
    return undefined;
  }
  if (parsed.sourceUrl !== sourceUrl) {
    return undefined;
  }

  const hash = node.hash;
  if (parsed.hash !== undefined) {
    if (hash !== parsed.hash) {
      return undefined;
    }
  } else if (hash !== undefined) {
    return undefined;
  }

  const startSeconds = node.startSeconds;
  if (parsed.startSeconds !== undefined) {
    if (startSeconds !== parsed.startSeconds) {
      return undefined;
    }
  } else if (startSeconds !== undefined) {
    return undefined;
  }

  return parsed;
}

export function isEmbedVideoId(provider: EmbedProvider, videoId: string): boolean {
  return provider === "youtube" ? YOUTUBE_ID.test(videoId) : VIMEO_ID.test(videoId);
}

export function isEmbedHash(hash: string): boolean {
  return VIMEO_HASH.test(hash);
}

function parseYouTube(
  url: URL,
  host: string,
): { provider: "youtube"; videoId: string } | undefined {
  const parts = pathSegments(url);
  const shortHost = host === "youtu.be" || host === "www.youtu.be" || host === "m.youtu.be";
  if (shortHost) {
    const id = parts.length === 1 ? parts[0] : undefined;
    return youtubeId(id);
  }

  const nocookie =
    host === "youtube-nocookie.com" ||
    host === "www.youtube-nocookie.com" ||
    host === "m.youtube-nocookie.com";
  if (nocookie) {
    return parts.length === 2 && parts[0] === "embed" ? youtubeId(parts[1]) : undefined;
  }

  const music = host === "music.youtube.com";
  if (music) {
    return parts.length === 1 && parts[0] === "watch"
      ? youtubeId(url.searchParams.get("v"))
      : undefined;
  }

  if (parts.length === 1 && parts[0] === "watch") {
    return youtubeId(url.searchParams.get("v"));
  }

  if (
    parts.length === 2 &&
    (parts[0] === "shorts" || parts[0] === "embed" || parts[0] === "live")
  ) {
    return youtubeId(parts[1]);
  }

  return undefined;
}

function parseVimeo(
  url: URL,
  host: string,
): { provider: "vimeo"; videoId: string; hash?: string } | undefined {
  const parts = pathSegments(url);
  const player =
    host === "player.vimeo.com" || host === "www.player.vimeo.com" || host === "m.player.vimeo.com";
  if (player) {
    if (parts.length !== 2 || parts[0] !== "video") {
      return undefined;
    }
    return vimeoId(parts[1], url.searchParams.get("h"));
  }

  if (parts.length === 1) {
    return vimeoId(parts[0], null);
  }

  if (parts.length === 2 && parts[1] !== undefined && isEmbedHash(parts[1].toLowerCase())) {
    return vimeoId(parts[0], parts[1]);
  }

  if (parts.length === 3 && parts[0] === "channels") {
    return vimeoId(parts[2], url.searchParams.get("h"));
  }

  if (parts.length === 4 && parts[0] === "groups" && parts[2] === "videos") {
    return vimeoId(parts[3], url.searchParams.get("h"));
  }

  return undefined;
}

function youtubeId(
  id: string | null | undefined,
): { provider: "youtube"; videoId: string } | undefined {
  if (id === undefined || id === null || !YOUTUBE_ID.test(id)) {
    return undefined;
  }

  return { provider: "youtube", videoId: id };
}

function vimeoId(
  id: string | undefined,
  hash: string | null,
): { provider: "vimeo"; videoId: string; hash?: string } | undefined {
  if (id === undefined || !VIMEO_ID.test(id)) {
    return undefined;
  }

  if (hash === null || hash.length === 0) {
    return { provider: "vimeo", videoId: id };
  }

  const normalized = hash.toLowerCase();
  if (!isEmbedHash(normalized)) {
    return undefined;
  }

  return { provider: "vimeo", videoId: id, hash: normalized };
}

function pathSegments(url: URL): string[] {
  return url.pathname.split("/").filter((part) => part.length > 0);
}

function readStart(url: URL): { ok: true; seconds?: number } | { ok: false } {
  const raw = firstTime(url);
  if (raw === undefined) {
    return { ok: true };
  }

  const seconds = parseClock(raw);
  if (seconds === undefined) {
    return { ok: false };
  }

  return { ok: true, seconds };
}

function firstTime(url: URL): string | undefined {
  if (url.searchParams.has("t")) {
    return url.searchParams.get("t") ?? "";
  }

  if (url.searchParams.has("start")) {
    return url.searchParams.get("start") ?? "";
  }

  if (url.hash.length > 1) {
    const params = new URLSearchParams(url.hash.slice(1));
    if (params.has("t")) {
      return params.get("t") ?? "";
    }
  }

  return undefined;
}

function parseClock(value: string): number | undefined {
  if (/^\d{1,9}$/.test(value)) {
    return Number(value);
  }

  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i.exec(value);
  if (match === null) {
    return undefined;
  }

  const hours = match[1];
  const minutes = match[2];
  const seconds = match[3];
  if (hours === undefined && minutes === undefined && seconds === undefined) {
    return undefined;
  }

  const total = Number(hours ?? 0) * 3600 + Number(minutes ?? 0) * 60 + Number(seconds ?? 0);
  if (!Number.isSafeInteger(total)) {
    return undefined;
  }

  return total;
}

function normalizedHttps(url: URL): string {
  const copy = new URL(url.href);
  copy.protocol = "https:";
  copy.username = "";
  copy.password = "";
  copy.port = "";
  return copy.href;
}
