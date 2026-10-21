import type { SharkKind } from "../world";

/** Every animal the sim and renderer know how to draw. Later rounds extend this union. */
export type CreatureSpecies = SharkKind | "koi" | "bottlenose" | "orca" | "humpback";

/** Which animals to put in the water. `size` is an extra multiplier on the real-size scaling. */
export type CreatureGroup = {
  species: CreatureSpecies;
  /** How many of this species, 1–12. Default 1. */
  count?: number;
  /** Extra size multiplier on top of the species' real-size scaling. Default 1. */
  size?: number;
  /** Coat to use, or a list to pick from per animal (koi: kohaku, sanke, showa, tancho, ogon, asagi). Ignored by species without coats. */
  variety?: string | string[];
};

/** `ocean` is the open sea; `pond` is a bait-free tank, so baitFish defaults to off. */
export type OceanScene = "ocean" | "pond";

/** `stylized` compresses the size gap between species; `true` keeps real length ratios. */
export type OceanScale = "stylized" | "true";

/** What a pointer press does to the water. */
export type OceanInteraction =
  /** A press drops food: nearby animals swim over to eat, each in its own way. */
  | "feed"
  /** A press flashes the water. */
  | "splash"
  /** Presses are ignored. */
  | "none";

/** OKLCH colour: lightness 0–1, chroma, hue in degrees. */
export type Oklch = [number, number, number];

/** Koi colour varieties; each one is a coat on the koi species. */
export type KoiVariety = "kohaku" | "sanke" | "showa" | "tancho" | "ogon" | "asagi";

/** Where on the body a point is, for painting: s along (0 snout → 1 tail), v across in px (signed), L the body length, across 0 (spine) → 1 (edge of the body), flag the renderer's cell flag (body, fin, ridge, eye...). */
export type PaintPoint = {
  s: number;
  v: number;
  L: number;
  across: number;
  flag: number;
  id: number;
  /** The animal has rolled far enough to show its underside (orca belly, a shark's pale ventral side). */
  belly: boolean;
  /** How far the underside shows, 0 (none) → 1 (fully rolled), eased across the roll so a belly grows in. `belly` is `bellyAmount > 0.5`. */
  bellyAmount: number;
};

/** Natural colours: `regions[0]` is the base skin; `paint` returns a region index for a point. */
export interface Coat {
  regions: readonly Oklch[];
  paint?: (p: PaintPoint) => number;
  /** Sparkle the scale glyphs in pale gold and white instead of the accent colours (ogon). */
  glint?: boolean;
}

/** `natural` paints animals in their real colours on any theme; `theme` keeps them greyscale. */
export type OceanColors = "natural" | "theme";

/** Tail drawn instead of the shark's forked caudal fin. */
export type TailShape =
  /** Whale/dolphin flukes: a horizontal, swept-back wing. From `1 - length` to the tail tip; the tips reach the end, the centre notch sits `notch` before it. */
  | { kind: "fluke"; span: number; length: number; notch: number }
  /** A fish's vertical caudal fin seen from above: a narrow blade behind the peduncle. `width` is its half-width at the tip at rest, `twist` the extra half-width at the peak of a beat, both fractions of length. */
  | { kind: "caudal"; length: number; width: number; twist: number };

/** Body outline and fin layout per species. All values are fractions of length. */
export interface BodyShape {
  halfWidth: (s: number) => number;
  /** Pectoral fin: leading root, trailing root, tip position along the body, and reach. */
  pectoral: [number, number, number, number];
  /** Notched (falcate) trailing edge on the pectorals. */
  falcate: boolean;
  /** Rounded paddle pectorals (koi, orca) instead of the triangle; `falcate` is ignored. */
  paddle?: boolean;
  /** Pelvic fins: leading root, trailing root, tip, reach. */
  pelvic: [number, number, number, number];
  /** Forked caudal fin reach, or 0 when the tail is a ribbon (zebra shark). */
  caudal: number;
  dorsal: [number, number];
  secondDorsal: [number, number];
  /**
   * Hammerheads' cephalofoil: half-span, how far its tips sweep back, its depth, and the
   * notch in the middle of the front edge. All fractions of length; absent for other sharks.
   */
  head?: { span: number; sweep: number; depth: number; notch: number };
  /** null when the eyes sit somewhere else (hammerhead: on the cephalofoil tips). */
  eye: [number, number] | null;
  gills: [number, number];
  /** Skin colour multipliers (r, g, b). */
  tint: [number, number, number];
  /** Tail drawn instead of the shark's forked caudal fin. */
  tail?: TailShape;
  /** Multiplies the side-to-side body wave. Default 1. Whales and dolphins beat their tails up and down, so from above they barely bend; use about 0.15 for them. */
  undulation?: number;
  /** Pectoral flex amplitude. Default 0.06. */
  finFlap?: number;
  /** Pectoral flex frequency as a multiple of the tail-beat phase. Default 0.5. */
  finFlapRate?: number;
}

export interface CreatureDef {
  /** Typical adult length in metres. Sets the size ratios between species. */
  realLength: number;
  shape: BodyShape;
  /** Dark skin markings at body point (s along, v across); `id` seeds per-animal patterns. */
  marking?: (s: number, v: number, L: number, across: number, id: number) => boolean;
  /** Pale ridges along the back (zebra shark). */
  paleRidge?: (s: number, across: number) => boolean;
  /** Named natural colour schemes (koi varieties). Sharks leave it out and keep their tinted greys. */
  coats?: Record<string, Coat>;
  /** Coat used when a group gives no variety. */
  defaultCoat?: string;
}
