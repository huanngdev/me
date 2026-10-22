import { BOTTLENOSE } from "./bottlenose";
import { HUMPBACK } from "./humpback";
import { KOI } from "./koi";
import { ORCA } from "./orca";
import { SHARKS } from "./sharks";
import type { CreatureDef, CreatureSpecies } from "./types";

export const CREATURES: Record<CreatureSpecies, CreatureDef> = {
  ...SHARKS,
  koi: KOI,
  bottlenose: BOTTLENOSE,
  orca: ORCA,
  humpback: HUMPBACK,
};

/** Stable index per species; the renderer stores this in its per-cell `bodyKind` buffer. */
export const CREATURE_IDS = Object.keys(CREATURES) as CreatureSpecies[];
