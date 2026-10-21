import { Play } from "lucide-react";
import Image from "next/image";

import type { ComponentPreview } from "@repo/core/components/layouts/components-section";

import { AsciiOcean } from "@repo/core/components/ascii-ocean/ascii-ocean";
import { AudioPlayer } from "@repo/core/components/audio-player/audio-player";
import { CliCommand } from "@repo/core/components/cli-command/cli-command";
import { TagsInput } from "@repo/core/components/shadcn-tags-input/tags-input";
import { TileTreemap } from "@repo/core/components/tile-treemap";

import { ScrollMinimapPreview, ZodDataTablePreview } from "./preview-clients";

const VIDEO_POSTER = "https://files.vidstack.io/sprite-fight/poster.webp";

function VideoPosterPreview() {
  return (
    <div className="relative aspect-video w-full max-w-md overflow-hidden rounded-lg border">
      <Image src={VIDEO_POSTER} alt="" fill unoptimized sizes="18rem" className="object-cover" />
      <span className="bg-background/80 text-foreground absolute top-1/2 left-1/2 flex size-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full">
        <Play className="size-4 fill-current" />
      </span>
    </div>
  );
}

export const COMPONENT_PREVIEWS: Partial<Record<string, ComponentPreview>> = {
  "shadcn-tags-input": {
    node: (
      <TagsInput
        defaultValue={["React", "Next.js", "shadcn/ui", "Tailwind"]}
        className="w-full max-w-md"
      />
    ),
    scale: 0.75,
  },
  "scroll-minimap": { node: <ScrollMinimapPreview /> },
  "video-player": { node: <VideoPosterPreview /> },
  "audio-player": {
    node: (
      <AudioPlayer
        title="Audio demo"
        src="/blocks/notion-like-editor/audio-demo.wav"
        preload="none"
        className="w-full max-w-md"
      />
    ),
    scale: 0.75,
  },
  "zod-data-table": { node: <ZodDataTablePreview /> },
  "tile-treemap": {
    node: (
      <TileTreemap
        data={[
          { label: "TypeScript", value: 42 },
          { label: "JavaScript", value: 23 },
          { label: "Python", value: 14 },
          { label: "Rust", value: 9 },
          { label: "Go", value: 7 },
          { label: "CSS", value: 5 },
        ]}
      />
    ),
  },
  "cli-command": {
    node: <CliCommand execute="shadcn@latest add button" className="w-full max-w-md" />,
    scale: 0.75,
  },
  "ascii-ocean": {
    node: <AsciiOcean className="rounded-lg" />,
    scale: 0.4,
  },
};
