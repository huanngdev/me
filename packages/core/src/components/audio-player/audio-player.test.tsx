import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { formatMediaTime } from "../video-player/use-video-player";
import { AudioPlayer } from "./audio-player";

const SOURCE = { src: "https://cdn.example.com/tone.mp3", type: "audio/mpeg" } as const;

describe("formatMediaTime", () => {
  test("formats minutes and seconds, and hours when present", () => {
    expect(formatMediaTime(0)).toBe("0:00");
    expect(formatMediaTime(65.9)).toBe("1:05");
    expect(formatMediaTime(3725)).toBe("1:02:05");
  });

  test("shows zero for values that are not a finite, non-negative time", () => {
    expect(formatMediaTime(Number.NaN)).toBe("0:00");
    expect(formatMediaTime(Number.POSITIVE_INFINITY)).toBe("0:00");
    expect(formatMediaTime(-4)).toBe("0:00");
  });
});

describe("AudioPlayer", () => {
  const markup = renderToStaticMarkup(<AudioPlayer src={SOURCE} title="Field recording" />);

  test("is named by its title", () => {
    expect(markup).toContain('aria-label="Field recording"');
  });

  test("renders no native audio controls", () => {
    expect(markup).not.toMatch(/\scontrols(=|\s|>)/);
  });

  test("renders its buttons as shadcn Button", () => {
    expect(markup).toContain('data-variant="ghost"');
    expect(markup).toContain('data-size="icon"');
    expect(markup).toContain('aria-label="Loading"');
    expect(markup).toContain('aria-label="Mute"');
    expect(markup).toContain('aria-label="More options"');
  });

  test("does not render the Download item without a download prop", () => {
    expect(markup).not.toContain("Download");
  });
});
