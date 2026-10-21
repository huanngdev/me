import type { ComponentDocs } from "./types";

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
      name: "ref",
      type: "Ref<AsciiOceanHandle>",
      default: "—",
      description:
        "Imperative handle: playJump() makes a random animal that can jump do its jump, and hasJumpers() says whether any animal can jump at all.",
    },
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
      type: '"feed" | "splash" | "none"',
      default: '"feed"',
      description:
        '"feed" drops food and nearby animals swim over to eat, each in its own way; "splash" flashes the water; "none" ignores presses.',
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

export type OceanInteraction = "feed" | "splash" | "none";

export type OceanColors = "natural" | "theme";

export type AsciiOceanHandle = {
  playJump(): number;
  hasJumpers(): boolean;
};

export type AsciiOceanProps = {
  ref?: Ref<AsciiOceanHandle>;
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
      title: "Feeding moves",
      items: [
        "Sharks: classic circles its prey, then lunges, or breaches; hammerhead sweeps its head across the food like a metal detector and bites; great hammerhead pins the food under its head before taking it; tiger takes every scrap, one after another; mako bursts at full speed and turns sharply to snatch its prey, or breaches; thresher whips its long upper tail through a bait ball, stunning fish, then doubles back for the rest; nurse hoovers the food in with suction; zebra noses along the bottom and takes one morsel at a time.",
        "Koi: slow over the pellets with mouth open, and each bite breaks the surface.",
        "Bottlenose dolphins: approach and bite, leap clear of the water to take what lies under the arc, or swim into a bait ball and slap it with their fluke, stunning fish, then mop them up.",
        "Orcas: the pod circles a bait ball, flashing white bellies and blowing bubbles to tighten it; then each orca in turn slaps the ball with its fluke and eats the stunned fish (carousel). Or a spyhop: rises head-first out of the water to look around, then drops back and bites.",
        "Humpbacks: blow a spiral bubble net around the bait and lunge up through the middle with mouth open (bubble net); or charge at the bait with throat pleats ballooning (lunge); or blow, raise the flukes and dive, then come back up for bait. They feed on krill, so they answer food one at a time.",
      ],
    },
    {
      title: "Tips",
      items: [
        "Give the canvas a monospace font; glyphs come from its font-family.",
        "Colours follow the page's background-color and color, and switch with the theme.",
        "Props are read once, so change `key` to swap the roster or scene.",
        "Use the ref's playJump() to trigger a jump; it returns the duration so you can disable your button.",
        "With prefers-reduced-motion, the canvas shows a still frame.",
        "`seed` makes a scene repeatable.",
      ],
    },
  ],
};
