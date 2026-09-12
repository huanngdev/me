import {
  ArrowUpRight,
  Box,
  Clapperboard,
  LayoutGrid,
  Map,
  TableProperties,
  Tags,
} from "lucide-react";
import Link from "next/link";

import { DotPattern } from "@/components/dot-pattern";

const COMPONENT_LIST: {
  slug: string;
  name: string;
  description: string;
  icon: typeof ArrowUpRight;
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
];

export const COMPONENT_COUNT = COMPONENT_LIST.length;

export function ComponentsSection() {
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
        return (
          <li key={comp.slug} className="border-b p-3 sm:border-r">
            <article className="group relative overflow-hidden rounded-xl border">
              <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden">
                <DotPattern className="z-0" />
                <Icon className="text-muted-foreground pointer-events-none relative z-10 size-8 transition-transform duration-300 ease-out group-hover:scale-110" />
              </div>
              <div className="border-t px-3 py-2.5">
                <div className="flex items-center gap-3">
                  <h2 className="min-w-0 flex-1 truncate text-sm font-medium">{comp.name}</h2>
                  <ArrowUpRight className="text-muted-foreground mt-0.5 size-4 shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </div>
                <p className="text-muted-foreground mt-0.5 line-clamp-1 text-xs">
                  {comp.description}
                </p>
              </div>
              <Link
                href={`/components/${comp.slug}`}
                aria-label={`View ${comp.name} component`}
                className="focus-visible:ring-ring absolute inset-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-inset"
              />
            </article>
          </li>
        );
      })}
    </ul>
  );
}
