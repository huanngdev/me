import { hash3, smoothstep } from "../math";
import type { SharkKind } from "../world";
import { countershaded } from "./paint";
import type { Coat, CreatureDef, Oklch, PaintPoint } from "./types";

// The renderer's fin flag, repeated here because importing the renderer would make a cycle.
const FLAG_FIN = 3;

/** Classic top-down half-width at s ∈ [0, 1] (snout → tail), as a fraction of length. */
function classicHalfWidth(s: number) {
  // anatomy: [est. 1] conical snout tapering to a point, then full width ~0.18 TL at the gills.
  if (s < 0.16) return 0.1 * Math.pow(Math.sin(((s / 0.16) * Math.PI) / 2), 0.7);
  if (s < 0.38) return 0.1 + 0.005 * smoothstep(0.16, 0.38, s);
  if (s < 0.84) return 0.019 + 0.086 * Math.pow(1 - (s - 0.38) / 0.46, 1.25);
  const k = (s - 0.84) / 0.16;
  return 0.019 * (1 - k) + 0.012 * Math.sin(k * Math.PI);
}

/** Tiger shark bars: wavy vertical bars over the back half, fading out toward the head. */
function tigerBar(s: number, v: number, L: number, across: number) {
  if (s < 0.2 || s > 0.9 || across > 0.85) return false;
  const wobble = 0.35 * Math.sin((v / L) * 25 + s * 5);
  const bar = Math.sin(s * Math.PI * 2 * 9 + wobble);
  return bar > 0.65 - 0.5 * smoothstep(0.2, 0.42, s) + 0.4 * smoothstep(0.8, 0.9, s);
}

/** Leopard spots on a jittered grid, so they ride along with the skin. */
function zebraSpot(s: number, v: number, L: number, id: number) {
  if (s < 0.07) return false;
  const gu = (s * L) / (L * 0.06);
  const gv = v / (L * 0.045);
  const cu = Math.floor(gu);
  const cv = Math.floor(gv);
  const jx = hash3(cu, cv, id) * 0.5 + 0.25;
  const jy = hash3(cu, cv, id + 11) * 0.5 + 0.25;
  return (gu - cu - jx) ** 2 + (gv - cv - jy) ** 2 < 0.08;
}

/** Pale ridges down the back, between the spots. */
function zebraRidge(s: number, across: number) {
  return s > 0.08 && s < 0.55 && (across < 0.1 || Math.abs(across - 0.6) < 0.08);
}

// Natural colours, OKLCH. Dorsal view: the back and flank show, the belly only as a rim (see countershaded).
// anatomy: [est. 1] great white: dark grey to blue-grey back, white belly.
const CLASSIC_BACK: Oklch = [0.42, 0.02, 250];
const CLASSIC_BELLY: Oklch = [0.96, 0.005, 250];
// anatomy: [est. 1] scalloped hammerhead: olive-grey back, paler belly.
const HAMMER_BACK: Oklch = [0.5, 0.035, 110];
const HAMMER_BELLY: Oklch = [0.9, 0.015, 95];
// anatomy: [est. 1] great hammerhead: slate-grey back, white belly.
const GREATHAMMER_BACK: Oklch = [0.46, 0.025, 250];
const GREATHAMMER_BELLY: Oklch = [0.95, 0.005, 250];
// anatomy: [est. 1] tiger: grey-brown back, darker bars, pale belly.
const TIGER_BACK: Oklch = [0.5, 0.035, 70];
const TIGER_BAR: Oklch = [0.27, 0.025, 60];
const TIGER_BELLY: Oklch = [0.9, 0.02, 85];
// anatomy: [est. 1] zebra: tan to yellow-brown back, dark spots, pale ridges.
const ZEBRA_BACK: Oklch = [0.72, 0.08, 85];
const ZEBRA_SPOT: Oklch = [0.3, 0.04, 55];
const ZEBRA_RIDGE: Oklch = [0.85, 0.05, 90];
const ZEBRA_BELLY: Oklch = [0.9, 0.04, 90];
// anatomy: [est. 1] shortfin mako: metallic indigo-blue back, white belly.
const MAKO_BACK: Oklch = [0.38, 0.1, 275];
const MAKO_BELLY: Oklch = [0.95, 0.005, 250];
// anatomy: [est. 1] thresher: bronze to purplish-grey back, white belly.
const THRESHER_BACK: Oklch = [0.45, 0.06, 310];
const THRESHER_BELLY: Oklch = [0.95, 0.01, 90];
// anatomy: [est. 1] nurse: uniform tawny yellow-brown, pale belly.
const NURSE_BACK: Oklch = [0.6, 0.08, 70];
const NURSE_BELLY: Oklch = [0.9, 0.03, 85];

const tigerCoat: Coat = {
  regions: [TIGER_BACK, TIGER_BAR, TIGER_BELLY],
  paint: (p: PaintPoint) => {
    if (p.flag === FLAG_FIN) return 0;
    if (p.across > 0.8) return 2;
    return tigerBar(p.s, p.v, p.L, p.across) ? 1 : 0;
  },
};

const zebraCoat: Coat = {
  regions: [ZEBRA_BACK, ZEBRA_SPOT, ZEBRA_RIDGE, ZEBRA_BELLY],
  paint: (p: PaintPoint) => {
    if (p.flag === FLAG_FIN) return 0;
    if (p.across > 0.8) return 3;
    if (zebraSpot(p.s, p.v, p.L, p.id)) return 1;
    return zebraRidge(p.s, p.across) ? 2 : 0;
  },
};

/**
 * Shark body outlines, fin layouts and skin, per species. Tail blades (heterocercal) use the values in
 * docs/ascii-ocean-anatomy.md; where the research marked a length as an estimate, the value is one too.
 * Each shark has a natural coat; theme mode ignores coats and keeps the greyscale silhouette.
 */
export const SHARKS: Record<SharkKind, CreatureDef> = {
  classic: {
    realLength: 5,
    taxon: "fish",
    shape: {
      halfWidth: classicHalfWidth,
      // anatomy: [est. 1] root 0.16–0.2 TL, length ~0.2 TL, falcate.
      pectoral: [0.16, 0.3, 0.46, 0.32],
      falcate: true,
      pelvic: [0.57, 0.65, 0.69, 0.085],
      // anatomy: [est. 1] first dorsal origin 0.3–0.35 TL, base ~0.1 TL.
      dorsal: [0.32, 0.42],
      secondDorsal: [0.71, 0.76],
      tail: { kind: "heterocercal", length: 0.22, upper: 0.05, width: 0.012, twist: 0.05 },
      eye: [0.1, 0.14],
      gills: [0.19, 0.29],
      tint: [0.92, 0.97, 1.05],
    },
    coats: { classic: countershaded(CLASSIC_BACK, CLASSIC_BELLY) },
    defaultCoat: "classic",
  },
  // Slim neck under a wide, swept-back cephalofoil (drawn in sampleBody),
  // tall first dorsal, long upper tail lobe. Bronze-olive grey.
  hammerhead: {
    realLength: 3.5,
    taxon: "fish",
    shape: {
      halfWidth: (s) => {
        if (s < 0.06) return 0.045;
        if (s < 0.3) return 0.045 + 0.04 * smoothstep(0.06, 0.3, s);
        return classicHalfWidth(s) * 0.81;
      },
      // anatomy: [est. 1] full head width ~0.24–0.3 TL (span is the half-width, so 0.135).
      head: { span: 0.135, sweep: 0.035, depth: 0.09, notch: 0 },
      // anatomy: [est. 1] root ~0.18 TL, length ~0.2 TL, falcate.
      pectoral: [0.18, 0.31, 0.44, 0.3],
      falcate: true,
      pelvic: [0.56, 0.63, 0.67, 0.075],
      // anatomy: [est. 1] first dorsal origin ~0.28 TL.
      dorsal: [0.28, 0.38],
      secondDorsal: [0.7, 0.74],
      tail: { kind: "heterocercal", length: 0.2, upper: 0.05, width: 0.012, twist: 0.05 },
      eye: null,
      gills: [0.16, 0.26],
      tint: [0.96, 0.98, 0.9],
    },
    coats: { hammer: countershaded(HAMMER_BACK, HAMMER_BELLY) },
    defaultCoat: "hammer",
  },
  // Blunt, square snout on a heavy body; barred back. Warm grey-brown.
  tiger: {
    realLength: 3.8,
    taxon: "fish",
    shape: {
      halfWidth: (s) => {
        // anatomy: [est. 1] square, blunt snout; full width ~0.18 TL at the gills.
        if (s < 0.12) return 0.1 * Math.pow(Math.sin(((s / 0.12) * Math.PI) / 2), 0.3);
        if (s < 0.34) return 0.1 + 0.005 * smoothstep(0.12, 0.34, s);
        if (s < 0.84) return 0.019 + 0.086 * Math.pow(1 - (s - 0.34) / 0.5, 1.2);
        const k = (s - 0.84) / 0.16;
        return 0.019 * (1 - k) + 0.012 * Math.sin(k * Math.PI);
      },
      // anatomy: [5] broad falcate triangle: root ~0.14 TL, reach ~0.3 TL past the edge, tip swept back.
      pectoral: [0.16, 0.3, 0.46, 0.3],
      falcate: true,
      pelvic: [0.57, 0.65, 0.69, 0.085],
      dorsal: [0.33, 0.44],
      secondDorsal: [0.71, 0.75],
      tail: { kind: "heterocercal", length: 0.3, upper: 0.04, width: 0.012, twist: 0.05 },
      eye: [0.08, 0.12],
      gills: [0.19, 0.28],
      tint: [1.02, 0.95, 0.84],
    },
    marking: (s, v, L, across) => tigerBar(s, v, L, across),
    coats: { tiger: tigerCoat },
    defaultCoat: "tiger",
  },
  // Short rounded head, body done by half-length, then a long ribbon of a
  // tail fin. Broad rounded pectorals, spotted sandy skin.
  zebra: {
    realLength: 2.3,
    taxon: "fish",
    shape: {
      halfWidth: (s) => {
        if (s < 0.1) return 0.08 * Math.pow(Math.sin(((s / 0.1) * Math.PI) / 2), 0.7);
        if (s < 0.28) return 0.075 + 0.005 * smoothstep(0.1, 0.28, s);
        if (s < 0.55) return 0.022 + 0.058 * Math.pow(1 - (s - 0.28) / 0.27, 1.1);
        const k = (s - 0.55) / 0.45;
        return 0.022 * (1 - k * k) + 0.012 * Math.sin(k * Math.PI);
      },
      // anatomy: [est. 1] broad, rounded tips: root ~0.12 TL, length ~0.2 TL.
      pectoral: [0.12, 0.3, 0.36, 0.26],
      falcate: false,
      pelvic: [0.42, 0.48, 0.51, 0.065],
      dorsal: [0.36, 0.44],
      secondDorsal: [0.49, 0.53],
      tail: { kind: "heterocercal", length: 0.35, upper: 0.03, width: 0.012, twist: 0.05 },
      eye: [0.06, 0.09],
      gills: [0.13, 0.2],
      tint: [1.08, 0.97, 0.74],
    },
    marking: (s, v, L, _across, id) => zebraSpot(s, v, L, id),
    // Pale ridges down the back, between the spots.
    paleRidge: zebraRidge,
    coats: { zebra: zebraCoat },
    defaultCoat: "zebra",
  },
  // Great hammerhead: a broader, nearly straight-edged cephalofoil with a notch at the centre,
  // a towering sickle first dorsal (drawn long and bright from above), and a cooler slate skin.
  greathammer: {
    realLength: 5,
    taxon: "fish",
    shape: {
      halfWidth: (s) => {
        if (s < 0.05) return 0.04;
        if (s < 0.3) return 0.04 + 0.045 * smoothstep(0.05, 0.3, s);
        return classicHalfWidth(s) * 0.81;
      },
      // anatomy: [3][4] full head width 23–27% TL, so the half-span is 0.125.
      head: { span: 0.125, sweep: 0.006, depth: 0.085, notch: 0.014 },
      // anatomy: [est. 1] root ~0.16 TL, length ~0.2 TL, falcate.
      pectoral: [0.16, 0.32, 0.46, 0.3],
      falcate: true,
      pelvic: [0.55, 0.62, 0.67, 0.085],
      // anatomy: [est. 1] first dorsal origin ~0.24 TL.
      dorsal: [0.24, 0.45],
      secondDorsal: [0.68, 0.74],
      tail: { kind: "heterocercal", length: 0.22, upper: 0.05, width: 0.012, twist: 0.05 },
      eye: null,
      gills: [0.15, 0.25],
      tint: [0.86, 0.93, 1.02],
    },
    coats: { greathammer: countershaded(GREATHAMMER_BACK, GREATHAMMER_BELLY) },
    defaultCoat: "greathammer",
  },
  // Shortfin mako: a long conical snout, a torpedo body that narrows hard to the tail stalk,
  // and a tall crescent tail. Metallic indigo back.
  mako: {
    realLength: 3.5,
    taxon: "fish",
    shape: {
      halfWidth: (s) => {
        // anatomy: [6] long conical snout: the front tapers almost linearly to the full width.
        if (s < 0.2) return 0.09 * Math.sin(((s / 0.2) * Math.PI) / 2);
        if (s < 0.32) return 0.09;
        if (s < 0.86) return 0.014 + 0.076 * Math.pow(1 - (s - 0.32) / 0.54, 1.45);
        const k = (s - 0.86) / 0.14;
        return 0.014 * (1 - k) + 0.01 * Math.sin(k * Math.PI);
      },
      // anatomy: [6] pectorals narrow-tipped and shorter than the head: reach ~0.16 TL.
      pectoral: [0.16, 0.28, 0.42, 0.28],
      falcate: true,
      pelvic: [0.58, 0.64, 0.68, 0.06],
      dorsal: [0.34, 0.45],
      secondDorsal: [0.76, 0.79],
      tail: { kind: "heterocercal", length: 0.22, upper: 0.06, width: 0.012, twist: 0.05 },
      eye: [0.11, 0.15],
      gills: [0.2, 0.3],
      tint: [0.78, 0.9, 1.2],
    },
    coats: { mako: countershaded(MAKO_BACK, MAKO_BELLY) },
    defaultCoat: "mako",
  },
  // Thresher: a compact body over the front half, then the upper tail lobe as a long whip
  // that's as long as the shark itself. Big eyes, long sickle pectorals, bronze-violet skin.
  thresher: {
    realLength: 5,
    taxon: "fish",
    shape: {
      halfWidth: (s) => {
        if (s < 0.08) return 0.07 * Math.pow(Math.sin(((s / 0.08) * Math.PI) / 2), 0.75);
        if (s < 0.2) return 0.07 + 0.02 * smoothstep(0.08, 0.2, s);
        if (s < 0.48) return 0.012 + 0.078 * Math.pow(1 - (s - 0.2) / 0.28, 1.3);
        // The whip: thin, with a slight sickle swell before it tapers out.
        const k = (s - 0.48) / 0.52;
        return 0.012 * (1 - k) + 0.006 * Math.sin(k * Math.PI * 0.9) + 0.002;
      },
      // anatomy: [est. 1] long and sickle-shaped: root ~0.12 TL, length 0.2–0.25 TL.
      pectoral: [0.12, 0.27, 0.36, 0.3],
      falcate: true,
      pelvic: [0.37, 0.41, 0.44, 0.045],
      dorsal: [0.24, 0.32],
      secondDorsal: [0.45, 0.47],
      tail: { kind: "heterocercal", length: 0.5, upper: 0.45, width: 0.01, twist: 0.05 },
      eye: [0.05, 0.1],
      gills: [0.11, 0.18],
      tint: [1.0, 0.9, 1.08],
    },
    coats: { thresher: countershaded(THRESHER_BACK, THRESHER_BELLY) },
    defaultCoat: "thresher",
  },
  // Nurse shark: a blunt, broad head, a heavy flattened body with both dorsals set far back,
  // rounded paddle pectorals, and a long low tail with no lower lobe. Tawny brown.
  nurse: {
    realLength: 2.8,
    taxon: "fish",
    shape: {
      halfWidth: (s) => {
        if (s < 0.08) return 0.085 * Math.pow(Math.sin(((s / 0.08) * Math.PI) / 2), 0.4);
        if (s < 0.3) return 0.085 + 0.025 * smoothstep(0.08, 0.3, s);
        if (s < 0.72) return 0.022 + 0.088 * Math.pow(1 - (s - 0.3) / 0.42, 1.1);
        const k = (s - 0.72) / 0.28;
        return 0.022 * (1 - k * k) + 0.014 * Math.sin(k * Math.PI);
      },
      // anatomy: [11] broad, rounded tips: root ~0.16 TL, length ~0.17 TL. Drawn as paddles.
      pectoral: [0.16, 0.3, 0.36, 0.22],
      paddle: true,
      falcate: false,
      pelvic: [0.45, 0.52, 0.55, 0.075],
      dorsal: [0.5, 0.58],
      secondDorsal: [0.63, 0.69],
      tail: { kind: "heterocercal", length: 0.27, upper: 0.04, width: 0.02, twist: 0.05 },
      eye: [0.05, 0.075],
      gills: [0.14, 0.22],
      tint: [1.1, 0.96, 0.76],
    },
    coats: { nurse: countershaded(NURSE_BACK, NURSE_BELLY) },
    defaultCoat: "nurse",
  },
};
