import type { ComponentDocs } from "./types";

export const DOCS: ComponentDocs = {
  keywords: ["background", "animated", "canvas", "hero", "fish", "sharks", "ascii", "animation"],
  usage: `import { AsciiOcean } from "@/components/ascii-ocean/ascii-ocean";

export function Example() {
  return (
    <AsciiOcean
      sharks={[
        { kind: "hammerhead", size: 1 },
        { kind: "greathammer", size: 0.85 },
      ]}
      className="aspect-video w-full rounded-lg"
    />
  );
}`,
  examples: [],
  props: [
    {
      name: "sharks",
      type: "SharkSpec[]",
      default: "4 classic sharks",
      description:
        "Sharks in the water. Size is relative to the biggest. Fixed for the life of the canvas; change `key` to swap the roster.",
    },
    {
      name: "className",
      type: "string",
      default: "—",
      description: "Classes for the canvas. Give it a size; the canvas fills it.",
    },
  ],
  types: `export type SharkKind = "classic" | "hammerhead" | "zebra" | "tiger" | "greathammer" | "mako" | "thresher" | "nurse";

export type SharkSpec = { kind: SharkKind; size: number };

export type AsciiOceanProps = {
  sharks?: SharkSpec[];
  className?: string;
};`,
  notes: [],
};
