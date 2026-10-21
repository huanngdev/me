import type { ComponentDocs } from "./types";

export const DOCS: ComponentDocs = {
  keywords: ["treemap", "tiles", "chart", "visualization", "proportional", "breakdown"],
  usage: `"use client";

import { TileTreemap } from "@/components/tile-treemap";

const data = [
  { label: "TypeScript", value: 42 },
  { label: "JavaScript", value: 23 },
  { label: "Python", value: 14 },
  { label: "Rust", value: 9 },
];

export function Example() {
  return <TileTreemap data={data} />;
}`,
  examples: [
    {
      title: "Add the chart tokens",
      description: "Eight categorical colors that adapt to light and dark mode.",
      code: `:root {
  --chart-1: oklch(0.5 0.19 292);
  --chart-2: oklch(0.53 0.11 195);
  --chart-3: oklch(0.55 0.13 75);
  --chart-4: oklch(0.51 0.16 255);
  --chart-5: oklch(0.53 0.18 20);
  --chart-6: oklch(0.54 0.14 150);
  --chart-7: oklch(0.52 0.14 230);
  --chart-8: oklch(0.55 0.15 45);
}

.dark {
  --chart-1: oklch(0.66 0.17 292);
  --chart-2: oklch(0.7 0.1 195);
  --chart-3: oklch(0.75 0.12 75);
  --chart-4: oklch(0.67 0.14 255);
  --chart-5: oklch(0.68 0.16 20);
  --chart-6: oklch(0.71 0.13 150);
  --chart-7: oklch(0.69 0.13 230);
  --chart-8: oklch(0.73 0.14 45);
}`,
      language: "css",
    },
  ],
  props: [
    {
      name: "data",
      type: "TileTreemapItem[]",
      default: "—",
      description: "Items to lay out. Each tile area is proportional to its value.",
    },
    {
      name: "height",
      type: "number",
      default: "16:10",
      description: "Fixed pixel height. Falls back to a 16:10 aspect ratio when omitted.",
    },
    {
      name: "className",
      type: "string",
      default: "—",
      description: "Classes applied to the treemap container.",
    },
    {
      name: "valueFormatter",
      type: "(value, percentage) => string",
      default: "—",
      description: "Formats the value shown inside each tile.",
    },
    {
      name: "hoverScale",
      type: "number",
      default: "1.04",
      description: "Scale applied to a tile on hover or keyboard focus.",
    },
  ],
  types: `type TileTreemapItem = {
  label: string;
  value: number;
  color?: string;
};

type TileTreemapProps = {
  data: TileTreemapItem[];
  height?: number;
  className?: string;
  valueFormatter?: (value: number, percentage: number) => string;
  hoverScale?: number;
};`,
  notes: [],
};
