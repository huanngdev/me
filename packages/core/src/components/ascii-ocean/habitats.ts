import type { OceanScene } from "./creatures/types";

export type Rgb = [number, number, number];

export type HabitatId = "ocean" | "pond";

/** Water colours for one page mode: the top of the water and the bottom, which animals fade into. */
export interface WaterTone {
  surface: Rgb;
  deep: Rgb;
}

/**
 * A body of water: how light fades through it and what colour it is. The renderer reads one habitat
 * per scene, so a new habitat (a river, a rock pool) is one constant here plus a case in `habitatOf`.
 */
export interface Habitat {
  id: HabitatId;
  /** Per-channel absorption rate k (1/m): light fades as exp(-k · z). Red goes first in clear water. */
  absorb: readonly [number, number, number];
  /** Haze rate k: a uniform veil toward the deep colour at depth, as exp(-k · z). */
  veil: number;
  /** Water colour per page mode (the dark and light pages each get their own tones). */
  water: { dark: WaterTone; light: WaterTone };
  /** How much of the page the water covers, 0 (the page only) to 1 (the water colour), per page mode. */
  fill: { dark: number; light: number };
}

/**
 * Open sea: clear oceanic blue. Absorption and colours from the R11 water research
 * (docs/ascii-ocean-anatomy.md): the absorb k is a suggestion there, and the colours are its sRGB table.
 */
export const OCEAN: Habitat = {
  id: "ocean",
  absorb: [0.9, 0.3, 0.12],
  veil: 0.35,
  water: {
    dark: { surface: [29, 90, 110], deep: [11, 42, 58] },
    light: { surface: [155, 184, 196], deep: [43, 111, 127] },
  },
  fill: { dark: 0.85, light: 0.75 },
};

/**
 * Garden pond: algae-green water with a brown tint. Shallow, so less haze than the sea. The absorb k
 * is a suggestion in the same research note; the colours are its pond rows.
 */
export const POND: Habitat = {
  id: "pond",
  absorb: [0.75, 0.22, 0.55],
  veil: 0.25,
  water: {
    dark: { surface: [74, 90, 42], deep: [28, 58, 42] },
    light: { surface: [143, 163, 106], deep: [91, 122, 74] },
  },
  fill: { dark: 0.85, light: 0.6 },
};

/** The habitat a scene lives in. New scenes and habitats are added here. */
export function habitatOf(scene: OceanScene): Habitat {
  switch (scene) {
    case "ocean":
      return OCEAN;
    case "pond":
      return POND;
    default: {
      // Adding a scene to OceanScene fails to compile here until it has a habitat.
      const unhandled: never = scene;
      throw new Error(`no habitat for scene ${String(unhandled)}`);
    }
  }
}
