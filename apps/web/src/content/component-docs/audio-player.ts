import type { ComponentDocs } from "./types";

export const DOCS: ComponentDocs = {
  keywords: ["audio", "music", "podcast", "player", "media", "sound"],
  usage: `"use client";

import { AudioPlayer } from "@/components/audio-player/audio-player";

export function Example() {
  return (
    <AudioPlayer
      title="Field recording"
      src={{ src: "/audio/recording.mp3", type: "audio/mpeg" }}
      download
    />
  );
}`,
  examples: [],
  props: [
    {
      name: "src",
      type: "PlayerSrc",
      default: "—",
      description: "A direct audio file, or an object with an explicit MIME type.",
    },
    {
      name: "title",
      type: "string",
      default: "—",
      description: "Accessible name of the player and Media Session title.",
    },
    {
      name: "playbackRates",
      type: "readonly number[]",
      default: "0.5–2×",
      description: "Rates listed in the options menu.",
    },
    {
      name: "download",
      type: "boolean | string",
      default: "false",
      description: "Shows download for the source, or uses an explicit download URL.",
    },
    {
      name: "crossOrigin",
      type: 'MediaPlayerProps["crossOrigin"]',
      default: "true",
      description: "Set null to play cross-origin files that send no CORS headers.",
    },
    {
      name: "load",
      type: '"eager" | "idle" | "visible" | "play" | "custom"',
      default: '"visible"',
      description: "Controls when the media provider begins loading.",
    },
    {
      name: "className",
      type: "string",
      default: "—",
      description: "Classes applied to the player root.",
    },
  ],
  types: `type AudioPlayerProps = Omit<
  MediaPlayerProps,
  "children" | "className" | "controls" | "src" | "title" | "viewType"
> & {
  src: MediaPlayerProps["src"];
  title: string;
  playbackRates?: readonly number[];
  download?: boolean | string;
  className?: string;
};`,
  notes: [
    {
      title: "Features",
      items: [
        "Play, pause, and replay after the end",
        "Seek slider whose thumb announces the current time of the total",
        "Mute button and volume slider, hidden on the narrowest screens",
        "Playback speed menu from 0.5× to 2×, configurable",
        "Download link for direct files, opt-in",
        "Loading, buffering, and playback-error states inside the same row",
        "Tabular times and a single row that works from 280px wide",
        "Keyboard shortcuts scoped to the focused player",
      ],
    },
  ],
};
