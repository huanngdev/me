"use client";

import { AudioPlayer } from "@repo/core/components/audio-player/audio-player";

export function BasicAudioPlayerDemo() {
  return (
    <AudioPlayer title="Audio demo" src="/blocks/notion-like-editor/audio-demo.wav" download />
  );
}
