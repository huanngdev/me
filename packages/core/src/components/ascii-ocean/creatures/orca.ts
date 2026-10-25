import { smoothstep } from "../math";
import type { Coat, CreatureDef, Oklch, PaintPoint } from "./types";

// The renderer's cell flags. Importing them from the renderer would make a cycle, so they are repeated here.
const FLAG_FIN = 3;

const BLACK: Oklch = [0.17, 0.01, 260];
const WHITE: Oklch = [0.96, 0.005, 250];
const SADDLE_GREY: Oklch = [0.6, 0.01, 250];
// The flipper is black like the body, so its tip rim is a lighter grey to outline it.
const FIN_RIM: Oklch = [0.5, 0.01, 260];

/**
 * Killer whale, black base. A white eye patch sits behind and above each eye, and a grey saddle
 * patch sits just behind the dorsal fin. Fins are black.
 */
const orcaCoat: Coat = {
  regions: [BLACK, WHITE, SADDLE_GREY, FIN_RIM],
  paint: (p: PaintPoint) => {
    if (p.flag === FLAG_FIN) return p.across > 0.8 ? 3 : 0;
    // Eye patch: an oval behind the eye on both flanks, drawn a little larger than life (s 0.11–0.25,
    // across 0.3 to the edge) so it still reads as the orca's mark at a few cells per body width.
    const ds = (p.s - 0.18) / 0.07;
    const da = (p.across - 0.68) / 0.38;
    if (ds * ds + da * da <= 1) return 1;
    // Saddle: grey where across is under a soft edge that is widest at its centre (s 0.525).
    if (p.s >= 0.45 && p.s <= 0.6 && p.across < 0.7 - (0.3 * Math.abs(p.s - 0.525)) / 0.075) {
      return 2;
    }
    return 0;
  },
};

/** Killer whale: a robust torpedo with a blunt head, big paddle flippers, a tall dorsal and a black-and-white coat. */
export const ORCA: CreatureDef = {
  realLength: 7,
  taxon: "mammal",
  shape: {
    halfWidth: (s) => {
      // Blunt head: fills out fast, then swells to the broadest point near 0.3 of the length.
      if (s < 0.02) return 0.05 + 0.01 * smoothstep(0, 0.02, s);
      if (s < 0.12) return 0.06 + 0.04 * smoothstep(0.02, 0.12, s);
      // anatomy: [est. 1] widest near the front at ~0.2 TL full width (the research estimate is ~0.18).
      if (s < 0.3) return 0.1;
      // Long taper into a slim tail stock, then a thin peduncle to the flukes.
      if (s < 0.84) return 0.1 - 0.072 * Math.pow((s - 0.3) / 0.54, 1.2);
      return 0.028 - 0.008 * smoothstep(0.84, 1, s);
    },
    pectoral: [0.14, 0.24, 0.32, 0.26],
    paddle: true,
    falcate: false,
    pelvic: [0, 0, 0, 0],
    dorsal: [0.36, 0.45],
    secondDorsal: [0, 0],
    eye: [0.1, 0.12],
    gills: [0, 0],
    tint: [1, 1, 1],
    // anatomy: [est. 1] fluke span ~0.24 TL (half-span 0.12).
    tail: { kind: "fluke", span: 0.12, length: 0.17, notch: 0.03 },
    undulation: 0.15,
    finFlap: 0.03,
  },
  coats: { orca: orcaCoat },
  defaultCoat: "orca",
};
