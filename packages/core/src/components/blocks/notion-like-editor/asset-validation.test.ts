import { describe, expect, test } from "bun:test";

import { validateUpload } from "./asset-validation";
import { ASSET_LIMITS, type UploadSource } from "./editor-assets";

function source(bytes: number[], name: string, type: string, size = bytes.length): UploadSource {
  const blob = new Blob([Uint8Array.from(bytes)]);
  return {
    name,
    type,
    size,
    slice: (start, end) => blob.slice(start, end),
  };
}

const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const jpeg = [0xff, 0xd8, 0xff, 0xe0];
const gif = [..."GIF89a".split("").map((char) => char.charCodeAt(0))];
const gif87 = [..."GIF87a".split("").map((char) => char.charCodeAt(0))];
const webp = [
  ..."RIFF".split("").map((char) => char.charCodeAt(0)),
  0,
  0,
  0,
  0,
  ..."WEBP".split("").map((char) => char.charCodeAt(0)),
];
const webm = [0x1a, 0x45, 0xdf, 0xa3];
const mp4 = [0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d];
const m4a = [0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x4d, 0x34, 0x41, 0x20];
const mp3 = [..."ID3".split("").map((char) => char.charCodeAt(0)), 0x03];
const mp3Frame = [0xff, 0xfb, 0x90, 0x00];
const wav = [
  ..."RIFF".split("").map((char) => char.charCodeAt(0)),
  0,
  0,
  0,
  0,
  ..."WAVE".split("").map((char) => char.charCodeAt(0)),
];
const ogg = [..."OggS".split("").map((char) => char.charCodeAt(0))];
const pdf = [..."%PDF-1.4".split("").map((char) => char.charCodeAt(0))];
const svg = [
  ...'<svg xmlns="http://www.w3.org/2000/svg">'.split("").map((char) => char.charCodeAt(0)),
];

describe("validateUpload", () => {
  test("accepts image magic bytes and ignores the declared type", async () => {
    expect(await validateUpload(source(png, "photo.mp4", "video/mp4"), "image")).toEqual({
      ok: true,
      mimeType: "image/png",
    });
    expect(await validateUpload(source(jpeg, "a.jpg", ""), "image")).toEqual({
      ok: true,
      mimeType: "image/jpeg",
    });
    expect(await validateUpload(source(gif, "a.gif", ""), "image")).toEqual({
      ok: true,
      mimeType: "image/gif",
    });
    expect(await validateUpload(source(gif87, "old.gif", ""), "image")).toEqual({
      ok: true,
      mimeType: "image/gif",
    });
    expect(await validateUpload(source(webp, "a.webp", ""), "image")).toEqual({
      ok: true,
      mimeType: "image/webp",
    });
  });

  test("accepts video and audio magic bytes", async () => {
    expect(await validateUpload(source(mp4, "clip.mp4", ""), "video")).toEqual({
      ok: true,
      mimeType: "video/mp4",
    });
    expect(await validateUpload(source(webm, "clip.webm", ""), "video")).toEqual({
      ok: true,
      mimeType: "video/webm",
    });
    expect(await validateUpload(source(mp3, "song.mp3", ""), "audio")).toEqual({
      ok: true,
      mimeType: "audio/mpeg",
    });
    expect(await validateUpload(source(mp3Frame, "song.mp3", ""), "audio")).toEqual({
      ok: true,
      mimeType: "audio/mpeg",
    });
    expect(await validateUpload(source(wav, "song.wav", ""), "audio")).toEqual({
      ok: true,
      mimeType: "audio/wav",
    });
    expect(await validateUpload(source(ogg, "song.ogg", ""), "audio")).toEqual({
      ok: true,
      mimeType: "audio/ogg",
    });
    expect(await validateUpload(source(m4a, "song.m4a", ""), "audio")).toEqual({
      ok: true,
      mimeType: "audio/mp4",
    });
  });

  test("rejects a PNG renamed as mp4 for video", async () => {
    const result = await validateUpload(source(png, "clip.mp4", "video/mp4"), "video");
    expect(result).toEqual({
      ok: false,
      error: "This file is not an MP4 or WebM video.",
    });
    expect(await validateUpload(source(m4a, "song.m4a", "audio/mp4"), "video")).toEqual({
      ok: false,
      error: "This file is not an MP4 or WebM video.",
    });
  });

  test("rejects SVG images because they can contain scripts", async () => {
    const result = await validateUpload(source(svg, "icon.svg", "image/svg+xml"), "image");
    expect(result).toEqual({
      ok: false,
      error: "SVG images are not allowed because they can contain scripts.",
    });
  });

  test("rejects an oversize file and names the limit", async () => {
    const image = await validateUpload(
      source(png, "big.png", "image/png", 14 * 1024 * 1024),
      "image",
    );
    expect(image).toEqual({
      ok: false,
      error: "This image is 14 MB. The limit is 10 MB.",
    });

    const video = await validateUpload(
      source(mp4, "big.mp4", "video/mp4", ASSET_LIMITS.video + 1),
      "video",
    );
    expect(video.ok).toBe(false);
    if (!video.ok) {
      expect(video.error).toContain("100 MB");
    }

    const audio = await validateUpload(
      source(mp3, "big.mp3", "audio/mpeg", ASSET_LIMITS.audio + 1),
      "audio",
    );
    expect(audio.ok).toBe(false);
    if (!audio.ok) {
      expect(audio.error).toContain("25 MB");
    }

    const file = await validateUpload(
      source([1], "big.bin", "application/octet-stream", ASSET_LIMITS.file + 1),
      "file",
    );
    expect(file.ok).toBe(false);
    if (!file.ok) {
      expect(file.error).toContain("25 MB");
    }
  });

  test("accepts any file bytes and detects a PDF", async () => {
    expect(await validateUpload(source(pdf, "notes.txt", "text/plain"), "file")).toEqual({
      ok: true,
      mimeType: "application/pdf",
    });
    expect(
      await validateUpload(source([104, 101, 108, 108, 111], "notes.bin", "text/plain"), "file"),
    ).toEqual({
      ok: true,
      mimeType: "application/octet-stream",
    });
  });
});
