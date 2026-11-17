import type { CreatureSpecies } from "@repo/core/ascii-ocean/creatures/types";

/** Display facts for one species: common name, taxon, group, and one factual sentence. */
export type SpeciesInfo = {
  name: string;
  taxon: "fish" | "mammal";
  group: "shark" | "dolphin" | "whale" | "fish";
  note: string;
};

/** Common name, group and a one-sentence note for every species the ocean draws. */
export const SPECIES_INFO: Record<CreatureSpecies, SpeciesInfo> = {
  classic: {
    name: "Great white shark",
    taxon: "fish",
    group: "shark",
    note: "A conical snout, a stout body, broad sickle pectorals and a tall crescent tail fin, seen edge-on from above.",
  },
  hammerhead: {
    name: "Scalloped hammerhead",
    taxon: "fish",
    group: "shark",
    note: "A slim neck under a wide, swept-back head, with a tall first dorsal fin.",
  },
  greathammer: {
    name: "Great hammerhead",
    taxon: "fish",
    group: "shark",
    note: "A broader head with a notch at its centre, a tall sickle-shaped first dorsal fin and a slate skin.",
  },
  tiger: {
    name: "Tiger shark",
    taxon: "fish",
    group: "shark",
    note: "A blunt, square snout on a heavy body, with wavy vertical bars over the back half.",
  },
  mako: {
    name: "Shortfin mako",
    taxon: "fish",
    group: "shark",
    note: "A long conical snout, a torpedo body that narrows toward the tail and a tall crescent tail.",
  },
  thresher: {
    name: "Thresher shark",
    taxon: "fish",
    group: "shark",
    note: "A compact front body and an upper tail lobe as long as the shark itself.",
  },
  nurse: {
    name: "Nurse shark",
    taxon: "fish",
    group: "shark",
    note: "A blunt, broad head, a heavy flattened body, rounded paddle fins and a long low tail with no lower lobe.",
  },
  zebra: {
    name: "Zebra shark",
    taxon: "fish",
    group: "shark",
    note: "A short rounded head, a long ribbon-like tail fin and spots on sandy skin.",
  },
  koi: {
    name: "Koi",
    taxon: "fish",
    group: "fish",
    note: "A thick, deep-bodied fish with a blunt head, large round pectoral fins and a long low dorsal fin.",
  },
  bottlenose: {
    name: "Bottlenose dolphin",
    taxon: "mammal",
    group: "dolphin",
    note: "A short beak, a round melon, a long body that barely bends, sickle-shaped flippers and wide flukes.",
  },
  orca: {
    name: "Orca",
    taxon: "mammal",
    group: "whale",
    note: "Black with a white eye patch and a grey saddle behind the tall dorsal fin.",
  },
  humpback: {
    name: "Humpback whale",
    taxon: "mammal",
    group: "whale",
    note: "A dark back with very long white flippers, a studded head and a small dorsal hump.",
  },
};

/** One-line colour description for each koi coat. */
export const KOI_VARIETY_NOTES: Record<string, string> = {
  kohaku: "White base with red patches on top and sharp red edges.",
  sanke: "White with red patches and black spots.",
  showa: "Black base with red and white patches over it, and black covering the head.",
  tancho: "White with a single round red spot on the head and no other red.",
  ogon: "One metallic colour: gold (yamabuki), platinum or orange (orenji).",
  asagi:
    "Blue-grey back with a scale pattern, red flanks and belly, and red at the base of the pectoral fins.",
};
