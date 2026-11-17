import { hash3, smoothstep } from "../math";
import { blobs } from "./paint";
import type { Coat, CreatureDef, Oklch, PaintPoint } from "./types";

// The renderer's cell flags. Importing them from the renderer would make a cycle, so they are repeated here.
const FLAG_FIN = 3;

const BACK: Oklch = [0.3, 0.012, 250];
const FIN_WHITE: Oklch = [0.92, 0.006, 240];
const KNOB: Oklch = [0.2, 0.01, 250];
const BARNACLE: Oklch = [0.8, 0.01, 250];
/** A faint lighter blotch on the back, and the dorsal hump: low contrast on purpose. */
const MOTTLE: Oklch = [0.36, 0.012, 250];

/** Fine pale specks (barnacles) where a fine noise field runs high, so they cluster rather than scatter. */
function speck(p: PaintPoint, scale: number, salt: number, cut: number) {
  return blobs(p.s, p.v / p.L, p.id, scale, salt) > cut;
}

/** Head tubercles: a sparse grid of cells 0.03 L square; a knob sits near each cell's hashed centre. Only on the head. */
function tubercle(p: PaintPoint) {
  if (p.s >= 0.2 || p.across >= 0.8) return false;
  const cell = 0.03 * p.L;
  const cx = (p.s * p.L) / cell;
  const cy = p.v / cell;
  const i = Math.floor(cx);
  const j = Math.floor(cy);
  // Hashed centre, kept inside its cell so a knob never straddles two cells.
  const hx = i + 0.2 + 0.6 * hash3(i, j, p.id * 3 + 11);
  const hy = j + 0.2 + 0.6 * hash3(i, j, p.id * 3 + 12);
  const dx = cx - hx;
  const dy = cy - hy;
  return dx * dx + dy * dy < 0.25 * 0.25;
}

/**
 * Humpback, dark back with huge white flippers. The flippers are freckled, with a knobbly leading
 * edge; the head is studded with tubercles and barnacles, and two blowhole marks sit behind it. The back is
 * faintly mottled, with a lighter hump. Flukes are back-coloured (seen from above), with a pale serrated trailing edge.
 */
const humpbackCoat: Coat = {
  regions: [BACK, FIN_WHITE, KNOB, BARNACLE, MOTTLE],
  paint: (p) => {
    if (p.flag === FLAG_FIN) {
      // The flukes: a pale serrated trailing edge, alternating every 0.015 of the length, and a few barnacles on the edges.
      if (p.s > 0.84) {
        if (p.s > 0.9 && p.across > 0.6 && Math.floor(p.v / (0.015 * p.L)) % 2 === 0) return 1;
        if (p.across > 0.85 && speck(p, 0.012, 19, 0.8)) return 3;
        return 0;
      }
      // Only the flippers are white; other fins keep the back colour.
      if (p.s < 0.22 || p.s > 0.52) return 0;
      // Barnacles cluster on the flipper tips and along the leading edge.
      if ((p.s > 0.44 || p.across > 0.85) && speck(p, 0.012, 13, 0.8)) return 3;
      // Knobbly leading edge: the outermost cells alternate dark every 0.02 of the length.
      if (p.across > 0.85 && Math.floor(p.s / 0.02) % 2 === 0) return 0;
      // Freckles.
      if (blobs(p.s, p.v / p.L, p.id, 0.03, 9) > 0.82) return 0;
      return 1;
    }
    // The blowhole splashguard: a short dark pair either side of the centre line, just behind the snout.
    const vl = Math.abs(p.v) / p.L;
    if (Math.abs(p.s - 0.13) < 0.016 && vl > 0.012 && vl < 0.04) return 2;
    if (tubercle(p)) return 2;
    // Barnacles on the head.
    if (p.s < 0.2 && speck(p, 0.015, 17, 0.78)) return 3;
    // The dorsal hump is a touch lighter than the back, so its ridge reads.
    if (p.s > 0.6 && p.s < 0.68 && p.across < 0.25) return 4;
    // Faint lighter mottling across the back, on a large scale.
    if (p.s > 0.2 && p.s < 0.8 && blobs(p.s, p.v / p.L, p.id, 0.2, 21) > 0.62) return 4;
    return 0;
  },
};

/** Humpback whale: a long, robust body with a broad flat head, very long flippers, and a small dorsal hump. */
export const HUMPBACK: CreatureDef = {
  realLength: 14,
  taxon: "mammal",
  shape: {
    halfWidth: (s) => {
      // Rostrum, then the broad flat head widens to its full depth by 0.15.
      if (s < 0.15) return 0.05 + 0.05 * smoothstep(0.01, 0.15, s);
      if (s < 0.3) return 0.1 + 0.025 * smoothstep(0.15, 0.3, s);
      if (s < 0.45) return 0.125 + 0.005 * smoothstep(0.3, 0.45, s);
      // Long taper into the tail stock, then a thin peduncle to the flukes.
      if (s < 0.84) return 0.13 - 0.1 * Math.pow((s - 0.45) / 0.39, 1.2);
      return 0.03 - 0.008 * smoothstep(0.84, 1, s);
    },
    // Very long flippers, about 30% of the length, swept back like wings.
    pectoral: [0.22, 0.29, 0.52, 0.3],
    paddle: true,
    falcate: false,
    pelvic: [0, 0, 0, 0],
    // A small hump two-thirds of the way back.
    dorsal: [0.62, 0.66],
    secondDorsal: [0, 0],
    eye: [0.16, 0.18],
    gills: [0, 0],
    tint: [1, 1, 1],
    // anatomy: [est. 1] fluke span 0.25–0.3 TL (half-span 0.14).
    tail: { kind: "fluke", span: 0.14, length: 0.15, notch: 0.025 },
    undulation: 0.1,
    finFlap: 0.05,
    finFlapRate: 0.35,
  },
  coats: { humpback: humpbackCoat },
  defaultCoat: "humpback",
};
