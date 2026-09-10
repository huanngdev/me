import { ArrowUpRight, Box, Clapperboard, Map, TableProperties, Tags } from "lucide-react";
import Link from "next/link";

import { cn } from "../../lib/utils";
import { Separator } from "@/components/separator";

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

  const lastRowStart = COMPONENT_LIST.length - (COMPONENT_LIST.length % 3 || 3);

  return (
    <ul className="grid grid-cols-3">
      {COMPONENT_LIST.map((comp, i) => {
        const Icon = comp.icon;
        return (
          <li
            key={comp.slug}
            className={cn(i < lastRowStart && "border-b", i % 3 !== 2 && "border-r")}
          >
            <Link
              href={`/components/${comp.slug}`}
              className="group hover:bg-muted/40 flex h-14 items-center gap-3 px-4 transition-colors"
            >
              <Icon className="text-muted-foreground size-5 shrink-0" />
              <div className="flex-1 truncate">
                <span className="text-sm font-medium">{comp.name}</span>
              </div>
              <ArrowUpRight className="text-muted-foreground size-4 shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </Link>
          </li>
        );
      })}
      <Separator className="col-span-3" />
    </ul>
  );
}
