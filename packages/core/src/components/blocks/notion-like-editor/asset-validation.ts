import { ASSET_LIMITS, type AssetKind, type UploadSource } from "./editor-assets";

export type UploadValidation = { ok: true; mimeType: string } | { ok: false; error: string };

const AUDIO_BRANDS = new Set(["M4A ", "M4B ", "M4P ", "F4A ", "F4B "]);

const KIND_NOUN: Record<AssetKind, string> = {
  image: "image",
  video: "video",
  audio: "audio",
  file: "file",
};

export async function validateUpload(
  file: UploadSource,
  kind: AssetKind,
): Promise<UploadValidation> {
  const limit = ASSET_LIMITS[kind];
  if (file.size > limit) {
    return {
      ok: false,
      error: `This ${KIND_NOUN[kind]} is ${formatMegabytes(file.size, "up")}. The limit is ${formatMegabytes(limit)}.`,
    };
  }

  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());

  if (kind === "file") {
    return {
      ok: true,
      mimeType: isPdf(bytes) ? "application/pdf" : "application/octet-stream",
    };
  }

  if (kind === "image") {
    return validateImage(bytes);
  }

  if (kind === "video") {
    return validateVideo(bytes);
  }

  return validateAudio(bytes);
}

function validateImage(bytes: Uint8Array): UploadValidation {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { ok: true, mimeType: "image/png" };
  }

  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return { ok: true, mimeType: "image/jpeg" };
  }

  const gif = ascii(bytes, 0, 6);
  if (gif === "GIF87a" || gif === "GIF89a") {
    return { ok: true, mimeType: "image/gif" };
  }

  if (isRiff(bytes, "WEBP")) {
    return { ok: true, mimeType: "image/webp" };
  }

  // ISO BMFF. The major brand sits at byte 8, inside the 16-byte sniff.
  if (hasFtyp(bytes) && (majorBrand(bytes) === "avif" || majorBrand(bytes) === "avis")) {
    return { ok: true, mimeType: "image/avif" };
  }

  if (isSvg(bytes)) {
    return {
      ok: false,
      error: "SVG images are not allowed because they can contain scripts.",
    };
  }

  return {
    ok: false,
    error: "This file is not a PNG, JPEG, GIF, or WebP image.",
  };
}

function validateVideo(bytes: Uint8Array): UploadValidation {
  if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) {
    return { ok: true, mimeType: "video/webm" };
  }

  if (hasFtyp(bytes) && !AUDIO_BRANDS.has(majorBrand(bytes))) {
    return { ok: true, mimeType: "video/mp4" };
  }

  return {
    ok: false,
    error: "This file is not an MP4 or WebM video.",
  };
}

function validateAudio(bytes: Uint8Array): UploadValidation {
  if (isRiff(bytes, "WAVE")) {
    return { ok: true, mimeType: "audio/wav" };
  }

  if (ascii(bytes, 0, 4) === "OggS") {
    return { ok: true, mimeType: "audio/ogg" };
  }

  if (ascii(bytes, 0, 3) === "ID3" || isMp3Frame(bytes)) {
    return { ok: true, mimeType: "audio/mpeg" };
  }

  if (hasFtyp(bytes) && AUDIO_BRANDS.has(majorBrand(bytes))) {
    return { ok: true, mimeType: "audio/mp4" };
  }

  return {
    ok: false,
    error: "This file is not an MP3, WAV, OGG, or M4A audio file.",
  };
}

function isPdf(bytes: Uint8Array): boolean {
  return ascii(bytes, 0, 4) === "%PDF";
}

function isSvg(bytes: Uint8Array): boolean {
  const text = ascii(bytes, 0, bytes.length).trim().toLowerCase();
  return text.startsWith("<svg") || (text.startsWith("<?xml") && text.includes("svg"));
}

function isMp3Frame(bytes: Uint8Array): boolean {
  const first = bytes[0];
  const second = bytes[1];
  return first === 0xff && second !== undefined && (second & 0xe0) === 0xe0;
}

function hasFtyp(bytes: Uint8Array): boolean {
  return ascii(bytes, 4, 8) === "ftyp";
}

function majorBrand(bytes: Uint8Array): string {
  return ascii(bytes, 8, 12);
}

function isRiff(bytes: Uint8Array, form: "WAVE" | "WEBP"): boolean {
  return ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === form;
}

function startsWith(bytes: Uint8Array, prefix: readonly number[]): boolean {
  if (bytes.length < prefix.length) {
    return false;
  }

  return prefix.every((value, index) => bytes[index] === value);
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  let text = "";
  for (let index = start; index < end; index += 1) {
    const byte = bytes[index];
    if (byte === undefined) {
      break;
    }
    text += String.fromCharCode(byte);
  }
  return text;
}

function formatMegabytes(bytes: number, round: "nearest" | "up" = "nearest"): string {
  const scaled = (bytes / (1024 * 1024)) * 10;
  const tenths = round === "up" ? Math.ceil(scaled) : Math.round(scaled);
  const rounded = tenths / 10;
  if (Number.isInteger(rounded)) {
    return `${String(rounded)} MB`;
  }

  return `${rounded.toFixed(1)} MB`;
}
