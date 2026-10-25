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
 * Garden pond: clear water with a faint blue-green tint. Shallow, so much less haze than the sea.
 * This is a deliberate art-direction change from the R11 research (docs/ascii-ocean-anatomy.md), which
 * gives algae-green and tannin-brown colours and k values; those read as murky and hid the koi. The
 * tones are pale aqua instead, the absorb k keeps red fastest and green slowest (so depth still leans
 * blue-green) but is low, since a koi seen from above sits under well under a metre of water, and the
 * veil and fill are low enough for red and white to read.
 */
export const POND: Habitat = {
  id: "pond",
  absorb: [0.12, 0.06, 0.08],
  veil: 0.06,
  water: {
    dark: { surface: [46, 100, 112], deep: [20, 56, 70] },
    light: { surface: [178, 210, 218], deep: [112, 158, 172] },
  },
  fill: { dark: 0.6, light: 0.45 },
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
