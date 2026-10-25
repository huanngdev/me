import { smoothstep } from "../math";
import { blobs } from "./paint";
import type { Coat, CreatureDef, KoiVariety, Oklch, PaintPoint } from "./types";

// The renderer's cell flags. Importing them from the renderer would make a cycle, so they are repeated here.
const FLAG_FIN = 3;

const SHIROJI: Oklch = [0.985, 0.012, 90];
const HI: Oklch = [0.66, 0.21, 35];
const SUMI: Oklch = [0.22, 0.01, 260];
const YAMABUKI: Oklch = [0.8, 0.15, 85];
const ASAGI: Oklch = [0.6, 0.045, 240];
const ASAGI_NET: Oklch = [0.74, 0.03, 235];

const fract = (x: number) => x - Math.floor(x);

/** Kohaku's red patches on white; a red cap on the head for two in three fish. Shared with sanke. */
function kohakuRed(p: PaintPoint) {
  if (p.s < 0.03 || p.s > 0.86) return false;
  const cap = p.s < 0.14 && p.id % 3 !== 0;
  return blobs(p.s, p.v / p.L, p.id, 0.09, 1) > (cap ? 0.35 : 0.5);
}

/** Realistic koi colourings, from the species notes. Region 0 is always the base skin. */
const coats: Record<KoiVariety, Coat> = {
  // White with red patches; white fins.
  kohaku: {
    regions: [SHIROJI, HI],
    softInk: true,
    paint: (p) => (p.flag !== FLAG_FIN && kohakuRed(p) ? 1 : 0),
  },
  // Kohaku with small black spots on the white, none on the head.
  sanke: {
    regions: [SHIROJI, HI, SUMI],
    softInk: true,
    paint: (p) => {
      if (p.flag === FLAG_FIN) return 0;
      if (kohakuRed(p)) return 1;
      if (
        p.s >= 0.15 &&
        p.s <= 0.8 &&
        p.across < 0.85 &&
        blobs(p.s, p.v / p.L, p.id, 0.035, 7) > 0.8
      ) {
        return 2;
      }
      return 0;
    },
  },
  // Black base with red and white over it; red wins where they overlap. Black reaches the head.
  // Pectoral roots (motoguro) are black; the other fins are white.
  showa: {
    regions: [SUMI, HI, SHIROJI],
    softInk: true,
    paint: (p) => {
      if (p.flag === FLAG_FIN) return p.s < 0.4 && p.across < 0.35 ? 0 : 2;
      // Thresholds tuned so black stays the commonest colour (the noise centres on 0.5).
      if (blobs(p.s, p.v / p.L, p.id, 0.1, 3) > 0.62) return 1;
      if (blobs(p.s, p.v / p.L, p.id, 0.08, 5) > (p.s < 0.12 ? 0.8 : 0.66)) return 2;
      return 0;
    },
  },
  // White with one round red spot on the head, centred at 0.075 L and radius 0.045 L.
  tancho: {
    regions: [SHIROJI, HI],
    softInk: true,
    paint: (p) => {
      if (p.flag === FLAG_FIN) return 0;
      const dx = (p.s - 0.075) * p.L;
      const r = 0.045 * p.L;
      return dx * dx + p.v * p.v < r * r ? 1 : 0;
    },
  },
  // A single metallic gold colour that catches the light.
  ogon: {
    regions: [YAMABUKI],
    softInk: true,
    glint: true,
    paint: () => 0,
  },
  // Blue-grey back with a lighter scale net; red flanks and pectoral roots; a pale plain head.
  asagi: {
    regions: [ASAGI, ASAGI_NET, HI],
    softInk: true,
    paint: (p) => {
      if (p.flag === FLAG_FIN) return p.s < 0.4 && p.across < 0.35 ? 2 : 1;
      if (p.s < 0.14) return 1;
      if (p.across > 0.62) return 2;
      // Scale net: lines on a grid of cells 0.035 L square.
      return fract(p.s / 0.035) < 0.2 || fract(p.v / p.L / 0.035) < 0.2 ? 1 : 0;
    },
  },
};

/** Thick, deep-bodied spindle with a blunt head, large round pectorals that scull, and a long low dorsal. */
export const KOI: CreatureDef = {
  realLength: 0.75,
  taxon: "fish",
  shape: {
    halfWidth: (s) => {
      // Blunt head: fills out fast, then holds its depth through the shoulders.
      if (s < 0.12) return 0.11 * Math.pow(Math.sin(((s / 0.12) * Math.PI) / 2), 0.5);
      if (s < 0.42) return 0.11 + 0.01 * smoothstep(0.12, 0.42, s);
      // One continuous taper from the shoulders to a short peduncle, then a thick stalk into the fin.
      if (s < 0.76) return 0.12 - 0.07 * smoothstep(0.42, 0.76, s);
      if (s < 0.82) return 0.05 - 0.01 * smoothstep(0.76, 0.82, s);
      return 0.04 - 0.005 * smoothstep(0.82, 1, s);
    },
    // Large round paddles just behind the head: the tip sits behind the leading root, so they fan sideways.
    pectoral: [0.12, 0.26, 0.36, 0.25],
    paddle: true,
    falcate: false,
    pelvic: [0.44, 0.52, 0.6, 0.12],
    dorsal: [0.3, 0.62],
    secondDorsal: [0, 0],
    eye: [0.06, 0.09],
    gills: [0.13, 0.17],
    tint: [1, 1, 1],
    tail: { kind: "caudal", length: 0.24, width: 0.07, twist: 0.06 },
    undulation: 0.55,
    finFlap: 0.25,
    finFlapRate: 1.4,
  },
  coats,
  defaultCoat: "kohaku",
};
