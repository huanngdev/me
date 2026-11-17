import { smoothstep } from "../math";
import type { Coat, CreatureDef, Oklch, PaintPoint } from "./types";

// The renderer's cell flags. Importing them from the renderer would make a cycle, so they are repeated here.
const FLAG_FIN = 3;

const CAPE: Oklch = [0.42, 0.02, 245];
const FLANK: Oklch = [0.62, 0.015, 240];
const BEAK: Oklch = [0.52, 0.018, 245];
// Flippers are a shade darker than the cape, so they read against it; the leading edge is lighter, like the flank.
const FLIPPER: Oklch = [0.3, 0.02, 245];
const FLIPPER_EDGE: Oklch = [0.74, 0.012, 240];

/**
 * Dark grey cape over the back, lighter flanks, and a darker beak. Flippers are a darker slate with a lighter
 * leading edge, so they stay visible against the cape and the flank.
 */
const bottlenoseCoat: Coat = {
  regions: [CAPE, FLANK, BEAK, FLIPPER, FLIPPER_EDGE],
  paint: (p: PaintPoint) => {
    if (p.flag === FLAG_FIN) return p.s < 0.17 ? 4 : 3;
    if (p.s < 0.06) return 2;
    // The cape narrows behind the dorsal, down to across 0.35 toward the tail stock.
    const cape = 0.5 - 0.15 * smoothstep(0.52, 0.7, p.s);
    return p.across < cape ? 0 : 1;
  },
};

/** Bottlenose dolphin: a short beak, a round melon, a long barely-bending body, pointed flippers, and wide flukes. */
export const BOTTLENOSE: CreatureDef = {
  realLength: 3,
  taxon: "mammal",
  shape: {
    halfWidth: (s) => {
      // Short beak, then the melon swells up behind it.
      // anatomy: [est. 1] short beak, round melon; full width ~0.2 TL.
      if (s < 0.04) return 0.025;
      if (s < 0.12) return 0.025 + 0.06 * smoothstep(0.04, 0.12, s);
      if (s < 0.3) return 0.085 + 0.015 * smoothstep(0.12, 0.3, s);
      // Tapers into a narrow tail stock.
      if (s < 0.86) return 0.1 - 0.08 * Math.pow((s - 0.3) / 0.56, 1.3);
      return 0.02 - 0.005 * smoothstep(0.86, 1, s);
    },
    // anatomy: [est. 1] falcate flipper, root just behind the eye (~0.14 TL), reach ~0.25 TL past the spine.
    // Stylised: reach 0.30 rather than 0.25 so the flipper clears the body by 3+ cells at the species-tab size.
    pectoral: [0.14, 0.22, 0.3, 0.3],
    falcate: true,
    pelvic: [0, 0, 0, 0],
    dorsal: [0.42, 0.52],
    secondDorsal: [0, 0],
    eye: [0.1, 0.12],
    gills: [0, 0],
    tint: [0.95, 0.98, 1.04],
    // anatomy: [est. 1] fluke span ~0.2 TL (half-span 0.11).
    tail: { kind: "fluke", span: 0.11, length: 0.18, notch: 0.03 },
    undulation: 0.15,
    finFlap: 0.03,
  },
  coats: { bottlenose: bottlenoseCoat },
  defaultCoat: "bottlenose",
};
