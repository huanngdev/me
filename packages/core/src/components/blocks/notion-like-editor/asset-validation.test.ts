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

function ascii(text: string): number[] {
  return [...text].map((char) => char.charCodeAt(0));
}

const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const jpeg = [0xff, 0xd8, 0xff, 0xe0];
const gif = ascii("GIF89a");
const gif87 = ascii("GIF87a");
const webp = [...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WEBP")];
const webm = [0x1a, 0x45, 0xdf, 0xa3];
const mp4 = [0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d];
const m4a = [0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x4d, 0x34, 0x41, 0x20];
const mp3 = [...ascii("ID3"), 0x03];
const mp3Frame = [0xff, 0xfb, 0x90, 0x00];
const wav = [...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WAVE")];
const ogg = ascii("OggS");
const pdf = ascii("%PDF-1.4");
const svg = ascii('<svg xmlns="http://www.w3.org/2000/svg">');

describe("upload validation", () => {
  test("an image is accepted from its magic bytes and the declared type is ignored", async () => {
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

  test("an AVIF image is accepted from its ftyp brand", async () => {
    const avif = [0x00, 0x00, 0x00, 0x20, ...ascii("ftyp"), ...ascii("avif")];
    const avis = [0x00, 0x00, 0x00, 0x20, ...ascii("ftyp"), ...ascii("avis")];

    expect(await validateUpload(source(avif, "photo.png", "image/png"), "image")).toEqual({
      ok: true,
      mimeType: "image/avif",
    });
    expect(await validateUpload(source(avis, "anim.avif", ""), "image")).toEqual({
      ok: true,
      mimeType: "image/avif",
    });
  });

  test("a file at the image size limit is accepted", async () => {
    const result = await validateUpload(
      source(png, "ok.png", "image/png", ASSET_LIMITS.image),
      "image",
    );

    expect(result).toEqual({ ok: true, mimeType: "image/png" });
  });

  test("video and audio are accepted from their magic bytes", async () => {
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

  test("a PNG renamed as mp4 is rejected for video", async () => {
    const result = await validateUpload(source(png, "clip.mp4", "video/mp4"), "video");

    expect(result).toEqual({
      ok: false,
      error: "This file is not an MP4 or WebM video.",
    });
  });

  test("an M4A file is rejected for video", async () => {
    const result = await validateUpload(source(m4a, "song.m4a", "audio/mp4"), "video");

    expect(result).toEqual({
      ok: false,
      error: "This file is not an MP4 or WebM video.",
    });
  });

  test("bytes that are not an image are rejected", async () => {
    const result = await validateUpload(source([1, 2, 3, 4], "notes.bin", ""), "image");

    expect(result).toEqual({
      ok: false,
      error: "This file is not a PNG, JPEG, GIF, or WebP image.",
    });
  });

  test("a short PNG prefix is rejected", async () => {
    const result = await validateUpload(source([0x89, 0x50], "photo.png", "image/png"), "image");

    expect(result).toEqual({
      ok: false,
      error: "This file is not a PNG, JPEG, GIF, or WebP image.",
    });
  });

  test("bytes that are not audio are rejected", async () => {
    const result = await validateUpload(source([1, 2, 3, 4], "song.bin", ""), "audio");

    expect(result).toEqual({
      ok: false,
      error: "This file is not an MP3, WAV, OGG, or M4A audio file.",
    });
  });

  test("SVG images are rejected because they can contain scripts", async () => {
    const result = await validateUpload(source(svg, "icon.svg", "image/svg+xml"), "image");

    expect(result).toEqual({
      ok: false,
      error: "SVG images are not allowed because they can contain scripts.",
    });
  });

  test("an XML document that contains svg in the first bytes is rejected", async () => {
    const result = await validateUpload(
      source(ascii("<?xml svg>"), "icon.svg", "image/svg+xml"),
      "image",
    );

    expect(result).toEqual({
      ok: false,
      error: "SVG images are not allowed because they can contain scripts.",
    });
  });

  test("an image over the limit names both sizes in megabytes", async () => {
    const result = await validateUpload(
      source(png, "big.png", "image/png", 14 * 1024 * 1024),
      "image",
    );

    expect(result).toEqual({
      ok: false,
      error: "This image is 14 MB. The limit is 10 MB.",
    });
  });

  test("a video one byte over the limit is described as larger than the limit", async () => {
    const result = await validateUpload(
      source(mp4, "big.mp4", "video/mp4", ASSET_LIMITS.video + 1),
      "video",
    );

    expect(result).toEqual({
      ok: false,
      error: "This video is 100.1 MB. The limit is 100 MB.",
    });
  });

  test("audio one byte over the limit names the 25 MB limit", async () => {
    const result = await validateUpload(
      source(mp3, "big.mp3", "audio/mpeg", ASSET_LIMITS.audio + 1),
      "audio",
    );

    expect(result).toEqual({
      ok: false,
      error: "This audio is 25.1 MB. The limit is 25 MB.",
    });
  });

  test("a file one byte over the limit names the 25 MB limit", async () => {
    const result = await validateUpload(
      source([1], "big.bin", "application/octet-stream", ASSET_LIMITS.file + 1),
      "file",
    );

    expect(result).toEqual({
      ok: false,
      error: "This file is 25.1 MB. The limit is 25 MB.",
    });
  });

  test("any file bytes are accepted and a PDF is detected", async () => {
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
