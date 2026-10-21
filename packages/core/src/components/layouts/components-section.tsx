import {
  AudioLines,
  Box,
  Clapperboard,
  Fish,
  LayoutGrid,
  Map,
  SquareTerminal,
  TableProperties,
  Tags,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { DotPattern } from "@/components/dot-pattern";

import { ShowcaseCard } from "./showcase-card";

export const COMPONENT_LIST: {
  slug: string;
  name: string;
  description: string;
  icon: LucideIcon;
}[] = [
  {
    slug: "github-contributions-3d",
    name: "GitHub Contributions 3D",
    description: "An interactive Three.js contribution calendar with six themes.",
    icon: Box,
  },
  {
    slug: "shadcn-tags-input",
    name: "Tags Input",
    description: "A composable tags input built on shadcn primitives.",
    icon: Tags,
  },
  {
    slug: "scroll-minimap",
    name: "Scroll Minimap",
    description: "A compact scrollspy navigator for long content.",
    icon: Map,
  },
  {
    slug: "video-player",
    name: "Video Player",
    description: "A headless media player with shadcn controls.",
    icon: Clapperboard,
  },
  {
    slug: "audio-player",
    name: "Audio Player",
    description: "A compact audio player with shadcn controls.",
    icon: AudioLines,
  },
  {
    slug: "zod-data-table",
    name: "Zod Data Table",
    description: "A typed TanStack table generated from a Zod object schema.",
    icon: TableProperties,
  },
  {
    slug: "tile-treemap",
    name: "Tile Treemap",
    description: "Divide a single box into proportionally sized, color-coded tiles.",
    icon: LayoutGrid,
  },
  {
    slug: "cli-command",
    name: "CLI Command",
    description: "A command block with a tab per package manager.",
    icon: SquareTerminal,
  },
  {
    slug: "ascii-ocean",
    name: "ASCII Ocean",
    description: "A canvas ASCII ocean where sharks and whales swim among schools of bait fish.",
    icon: Fish,
  },
];

export const COMPONENT_COUNT = COMPONENT_LIST.length;

export type ComponentPreview = { node: ReactNode; scale?: number };

export function ComponentsSection({
  previews,
}: {
  previews?: Partial<Record<string, ComponentPreview>>;
}) {
  if (COMPONENT_LIST.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-muted-foreground text-sm">No components to display yet.</p>
      </div>
    );
  }

  return (
    <ul className="grid grid-cols-1 sm:grid-cols-3">
      {COMPONENT_LIST.map((comp) => {
        const Icon = comp.icon;
        const preview = previews?.[comp.slug];
        const scale = preview?.scale ?? 0.5;
        return (
          <li key={comp.slug} className="border-b p-3 sm:border-r">
            <ShowcaseCard
              href={`/components/${comp.slug}`}
              name={comp.name}
              linkLabel={`View ${comp.name} component`}
            >
              {preview ? (
                <>
                  <DotPattern className="z-0" />
                  <div
                    inert
                    aria-hidden="true"
                    className="pointer-events-none absolute top-1/2 left-1/2 z-10 flex items-center justify-center p-6 select-none"
                    style={{
                      width: `${100 / scale}%`,
                      height: `${100 / scale}%`,
                      transform:
                        scale === 1
                          ? "translate(-50%, -50%)"
                          : `translate(-50%, -50%) scale(${scale})`,
                    }}
                  >
                    {preview.node}
                  </div>
                </>
              ) : (
                <>
                  <DotPattern className="z-0" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Icon className="text-muted-foreground pointer-events-none relative z-10 size-8 transition-transform duration-300 ease-out group-hover:scale-110" />
                  </div>
                </>
              )}
            </ShowcaseCard>
          </li>
        );
      })}
    </ul>
  );
}
