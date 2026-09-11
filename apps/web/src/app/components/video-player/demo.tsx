"use client";

import { useState } from "react";

import {
  VideoPlayer,
  type VideoPlayerProps,
  type VideoPlayerTrack,
} from "@repo/core/components/video-player/video-player";
import { Button } from "@repo/core/components/button";

const CHAPTERS = `WEBVTT

00:00:00.000 --> 00:00:10.000
The camp

00:00:10.000 --> 00:00:25.000
Into the woods

00:00:25.000 --> 00:01:00.000
The sprite fight`;

const TRACKS: VideoPlayerTrack[] = [
  {
    id: "english",
    kind: "subtitles",
    label: "English",
    lang: "en-US",
    type: "vtt",
    src: "https://files.vidstack.io/sprite-fight/subs/english.vtt",
    default: true,
  },
  {
    id: "chapters",
    kind: "chapters",
    label: "Chapters",
    lang: "en-US",
    type: "vtt",
    content: CHAPTERS,
  },
];

const SOURCES = [
  {
    label: "MP4",
    src: {
      src: "https://files.vidstack.io/sprite-fight/720p.mp4",
      type: "video/mp4",
    },
  },
  {
    label: "HLS",
    src: {
      src: "https://files.vidstack.io/sprite-fight/hls/stream.m3u8",
      type: "application/x-mpegurl",
    },
  },
  {
    label: "DASH",
    src: {
      src: "https://files.vidstack.io/sprite-fight/dash/stream.mpd",
      type: "application/dash+xml",
    },
  },
] satisfies { label: string; src: VideoPlayerProps["src"] }[];

export function BasicVideoPlayerDemo() {
  return (
    <VideoPlayer
      title="Sprite Fight"
      src={SOURCES[0]!.src}
      poster="https://files.vidstack.io/sprite-fight/poster.webp"
      tracks={TRACKS}
      download
    />
  );
}

export function SourceSwitcherDemo() {
  const [activeSource, setActiveSource] = useState(0);
  const source = SOURCES[activeSource] ?? SOURCES[0]!;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2" aria-label="Video source format">
        {SOURCES.map((option, index) => (
          <Button
            key={option.label}
            type="button"
            variant={index === activeSource ? "secondary" : "outline"}
            onClick={() => setActiveSource(index)}
            className="h-11"
          >
            {option.label}
          </Button>
        ))}
      </div>
      <VideoPlayer
        key={source.label}
        title={`Sprite Fight — ${source.label}`}
        src={source.src}
        poster="https://files.vidstack.io/sprite-fight/poster.webp"
        tracks={TRACKS}
      />
    </div>
  );
}
