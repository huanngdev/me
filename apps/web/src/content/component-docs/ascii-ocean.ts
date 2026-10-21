import type { CreatureSpecies } from "@repo/core/components/ascii-ocean/ascii-ocean";

import type { ComponentDocs } from "./types";

/** Display names for the species sheet. Ids are the API; these are for people. */
export const SPECIES_NAMES: Record<CreatureSpecies, string> = {
  classic: "Great white shark",
  hammerhead: "Scalloped hammerhead",
  greathammer: "Great hammerhead",
  tiger: "Tiger shark",
  mako: "Shortfin mako",
  thresher: "Thresher shark",
  nurse: "Nurse shark",
  zebra: "Zebra shark",
  koi: "Koi",
  bottlenose: "Bottlenose dolphin",
  orca: "Orca",
  humpback: "Humpback whale",
};

export const DOCS: ComponentDocs = {
  keywords: ["ocean", "fish", "sharks", "koi", "whale", "dolphin", "background", "canvas"],
  usage: `import { AsciiOcean } from "@/components/ascii-ocean/ascii-ocean";

export function Example() {
  return (
    <AsciiOcean
      creatures={[
        { species: "bottlenose", count: 3 },
        { species: "orca" },
      ]}
      className="aspect-video w-full"
    />
  );
}`,
  examples: [
    {
      title: "Koi pond",
      description: "A bait-free pond with a mix of koi coats.",
      code: `<AsciiOcean
  scene="pond"
  creatures={[
    {
      species: "koi",
      count: 7,
      variety: ["kohaku", "sanke", "showa", "tancho", "ogon", "asagi"],
    },
  ]}
  className="aspect-video w-full"
/>`,
      language: "tsx",
    },
    {
      title: "Calm background",
      description:
        "Theme colours, no surface effects, and presses ignored. This is how the site cover uses it.",
      code: `<AsciiOcean
  colors="theme"
  surface={false}
  interaction="none"
  className="absolute inset-0"
/>`,
      language: "tsx",
    },
  ],
  props: [
    {
      name: "creatures",
      type: "CreatureGroup[]",
      default: "4 classic sharks",
      description:
        "Animals to put in the water, each with an optional count and size. Counts are 1–12 per group and 16 in total. Fixed for the life of the canvas; change `key` to swap the roster.",
    },
    {
      name: "sharks",
      type: "SharkSpec[]",
      default: "4 classic sharks",
      description: "Deprecated: use `creatures`. Still supported. Size is relative to the biggest.",
    },
    {
      name: "scene",
      type: '"ocean" | "pond"',
      default: '"ocean"',
      description:
        '"pond" is a bait-free tank, so baitFish defaults to off. "ocean" is the open sea.',
    },
    {
      name: "baitFish",
      type: 'number | "auto" | false',
      default: '"auto" (off for "pond")',
      description:
        'Bait fish population: a multiple of the area default, "auto", or false for none.',
    },
    {
      name: "scale",
      type: '"stylized" | "true"',
      default: '"stylized"',
      description: '"true" keeps real length ratios between species; "stylized" compresses them.',
    },
    {
      name: "interaction",
      type: '"splash" | "none"',
      default: '"splash"',
      description: '"splash" flashes the water where you press; "none" ignores presses.',
    },
    {
      name: "colors",
      type: '"natural" | "theme"',
      default: '"natural"',
      description:
        '"natural" paints animals in their real colours on any theme; "theme" keeps them greyscale and inverts them on light backgrounds.',
    },
    {
      name: "surface",
      type: "boolean",
      default: "true",
      description:
        "Sea surface (swell, sun glitter, wind streaks) and wakes (natural colours only). Turn off for a calmer background.",
    },
    {
      name: "seed",
      type: "number",
      default: "—",
      description:
        "Same seed, same scene: positions and choices repeat exactly. Omit for a different ocean each mount.",
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

export type CreatureSpecies = SharkKind | "koi" | "bottlenose" | "orca" | "humpback";

export type CreatureGroup = {
  species: CreatureSpecies;
  count?: number;
  size?: number;
  variety?: string | string[];
};

export type KoiVariety = "kohaku" | "sanke" | "showa" | "tancho" | "ogon" | "asagi";

export type OceanScene = "ocean" | "pond";

export type OceanScale = "stylized" | "true";

export type OceanInteraction = "splash" | "none";

export type OceanColors = "natural" | "theme";

export type AsciiOceanProps = {
  creatures?: CreatureGroup[];
  /** @deprecated Use \`creatures\`. */
  sharks?: SharkSpec[];
  scene?: OceanScene;
  baitFish?: number | "auto" | false;
  scale?: OceanScale;
  interaction?: OceanInteraction;
  colors?: OceanColors;
  surface?: boolean;
  seed?: number;
  className?: string;
};`,
  notes: [
    {
      title: "Tips",
      items: [
        "Give the canvas a monospace font; glyphs come from its font-family.",
        "Colours follow the page's background-color and color, and switch with the theme.",
        "Props are read once, so change `key` to swap the roster or scene.",
        "With prefers-reduced-motion, the canvas shows a still frame.",
        "`seed` makes a scene repeatable.",
      ],
    },
  ],
};
