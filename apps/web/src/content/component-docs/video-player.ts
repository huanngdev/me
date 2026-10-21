import type { ComponentDocs } from "./types";

export const DOCS: ComponentDocs = {
  keywords: ["video", "player", "media", "movie", "stream", "subtitles"],
  usage: `"use client";

import { VideoPlayer } from "@/components/video-player/video-player";

export function Example() {
  return (
    <VideoPlayer
      title="Sprite Fight"
      src={{
        src: "https://files.vidstack.io/sprite-fight/720p.mp4",
        type: "video/mp4",
      }}
      poster="https://files.vidstack.io/sprite-fight/poster.webp"
      tracks={[
        {
          id: "english",
          src: "/captions/english.vtt",
          kind: "subtitles",
          label: "English",
          lang: "en-US",
          type: "vtt",
          default: true,
        },
        {
          id: "chapters",
          src: "/captions/chapters.vtt",
          kind: "chapters",
          label: "Chapters",
          lang: "en-US",
          type: "vtt",
        },
      ]}
      download
    />
  );
}`,
  examples: [
    {
      title: "Streaming sources",
      description: "The provider is selected from the source URL or explicit MIME type.",
      code: `"use client";

import { useState } from "react";
import { VideoPlayer, type VideoPlayerProps } from "@/components/video-player/video-player";

const sources = [
  {
    label: "MP4",
    src: { src: "https://example.com/video.mp4", type: "video/mp4" },
  },
  {
    label: "HLS",
    src: { src: "https://example.com/master.m3u8", type: "application/x-mpegurl" },
  },
  {
    label: "DASH",
    src: { src: "https://example.com/manifest.mpd", type: "application/dash+xml" },
  },
] satisfies { label: string; src: VideoPlayerProps["src"] }[];

export function StreamingExample() {
  const [index, setIndex] = useState(0);
  const source = sources[index] ?? sources[0]!;

  return <VideoPlayer key={source.label} title={source.label} src={source.src} />;
}`,
    },
    {
      title: "Source examples",
      code: `// Direct file or CDN object
const file = { src: "https://cdn.example.com/video.mp4", type: "video/mp4" };

// Adaptive streaming
const hls = { src: "https://cdn.example.com/master.m3u8", type: "application/x-mpegurl" };
const dash = { src: "https://cdn.example.com/manifest.mpd", type: "application/dash+xml" };

// Provider embeds — the provider's policies still apply
const youtube = { src: "https://www.youtube.com/watch?v=VIDEO_ID", type: "video/youtube" };
const vimeo = { src: "https://vimeo.com/VIDEO_ID", type: "video/vimeo" };

// Multiple file qualities
const qualities = [
  { src: "/video-1080.mp4", type: "video/mp4", width: 1920, height: 1080 },
  { src: "/video-720.mp4", type: "video/mp4", width: 1280, height: 720 },
];`,
      language: "ts",
    },
  ],
  props: [
    {
      name: "src",
      type: "PlayerSrc",
      default: "—",
      description: "One source or an ordered list of file, stream, object, or embed sources.",
    },
    {
      name: "title",
      type: "string",
      default: "—",
      description: "Required accessible title and Media Session title.",
    },
    {
      name: "poster",
      type: "string",
      default: "—",
      description: "Poster image displayed before playback starts.",
    },
    {
      name: "tracks",
      type: "VideoPlayerTrack[]",
      default: "[]",
      description: "Caption, subtitle, chapter, metadata, or description tracks.",
    },
    {
      name: "playbackRates",
      type: "readonly number[]",
      default: "0.5–2×",
      description: "Rates displayed in the playback settings menu.",
    },
    {
      name: "skipSeconds",
      type: "number",
      default: "10",
      description: "Seconds used by the backward and forward buttons.",
    },
    {
      name: "download",
      type: "boolean | string",
      default: "false",
      description: "Shows download for direct sources, or uses an explicit download URL.",
    },
    {
      name: "load",
      type: '"eager" | "idle" | "visible" | "play" | "custom"',
      default: '"visible"',
      description: "Controls when the media provider begins loading.",
    },
    {
      name: "streamType",
      type: "MediaStreamType",
      default: '"unknown"',
      description: "Declare live, low-latency live, or DVR behavior when it cannot be inferred.",
    },
    {
      name: "storage",
      type: "string | MediaStorage | null",
      default: "null",
      description: "Persists volume, captions, time, speed, and quality preferences.",
    },
    {
      name: "className",
      type: "string",
      default: "—",
      description: "Classes applied to the player root.",
    },
  ],
  types: `type VideoPlayerTrack = Omit<TrackProps, "id"> & {
  id: string;
};

type VideoPlayerProps = Omit<
  MediaPlayerProps,
  "children" | "className" | "controls" | "src" | "title"
> & {
  src: MediaPlayerProps["src"];
  title: string;
  tracks?: VideoPlayerTrack[];
  playbackRates?: readonly number[];
  skipSeconds?: number;
  download?: boolean | string;
  className?: string;
};`,
  notes: [
    {
      title: "Features",
      items: [
        "Play, pause, replay, and configurable skip controls",
        "Seek slider with played and buffered progress",
        "Volume, mute, persisted preferences, and playback speed",
        "HLS and DASH adaptive quality selection",
        "Caption tracks, chapter titles, and multiple audio tracks",
        "Live and DVR streams with return-to-live control",
        "Fullscreen, picture in picture, AirPlay, and Google Cast when supported",
        "MP4, WebM, HLS, DASH, YouTube, Vimeo, Blob, and MediaStream providers",
        "Loading, buffering, ended, autoplay-failure, and playback-error states",
        "Keyboard shortcuts, focus states, tooltips, and screen-reader announcements",
        "Lazy media and poster loading with reduced-motion-safe transitions",
        "Responsive controls designed for a 360px viewport",
      ],
    },
  ],
};
