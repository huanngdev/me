// Ported from https://github.com/stackedlol/ascii-sharks (used with the author's permission).
/**
 * Draws the World as a grid of ASCII cells:
 *   1. a cell grid on the page background, in the page's colours
 *   2. a wake field that diffuses where things swim, lighting the dots cyan
 *   3. fish as minimal ASCII dashes, one per cell, glinting on hard turns
 *   4. creatures rasterised cell-by-cell with supersampled edges: grey blocks
 *      shaded by the light, dense glyphs, and shimmering accent colours
 */
import { clamp, hash3, oklchToRgb, rgbToOklabL, TAU } from "./math";
import { CREATURE_IDS, CREATURES } from "./creatures";
import { TAXA } from "./creatures/taxa";
import type {
  Coat,
  CreatureDef,
  OceanColors,
  OceanScene,
  PaintPoint,
  TailShape,
} from "./creatures/types";
import { Effects } from "./effects";
import { type Habitat, habitatOf, OCEAN, type Rgb } from "./habitats";
import { PondSurface } from "./pond";
import { FOAM_GLYPHS, GLINT_TICK, SeaSurface } from "./sea";
import { type Creature, SPINE_NODES, type World } from "./world";

export type OceanPalette = {
  /** Page background, opaque rgb 0–255. */
  background: [number, number, number];
  /** Page foreground (text colour), rgb 0–255. */
  foreground: [number, number, number];
  /** "light" when the background is light; greys are inverted so the scene reads as a negative. */
  mode: "light" | "dark";
};

/** Used until the engine reads the page theme: the original black-background look. */
export const DEFAULT_PALETTE: OceanPalette = {
  background: [0, 0, 0],
  foreground: [230, 238, 255],
  mode: "dark",
};

const ALPHA_LEVELS = 6;
const FISH_ALPHAS = [0.28, 0.42, 0.58, 0.74, 0.9];

// Dot colour classes: blue, green, red, pale; the last entry is the cyan wake.
const DOT_RGB: [number, number, number][] = [
  [48, 52, 235],
  [52, 205, 60],
  [228, 50, 44],
  [190, 212, 255],
  [110, 230, 255],
];
const DOT_BASE_ALPHA = [1, 1, 1, 1, 1];
const WAKE = DOT_RGB.length - 1;
// The pale cyan wake washes out on light backgrounds, so it darkens there.
const WAKE_RGB_LIGHT: [number, number, number] = [0, 130, 180];

// Water surface (natural mode, surface on, ocean and pond): the open sea from above, built in sea.ts.
/** Swell tint: light on a face that tilts toward the sun, shade on one that tilts away. */
const SWELL_RGB = { dark: [170, 225, 255], light: [0, 110, 160] } as const;
const SWELL_SHADE_RGB = [0, 0, 0] as const;
/** Peak alpha of the swell tints per page mode; the top level of each is exactly this. */
const SWELL_PEAK = {
  dark: { lit: 0.025, shade: 0.03 },
  light: { lit: 0.02, shade: 0.02 },
} as const;
const SWELL_LEVELS = 4;
/** Normalised slope where the tint starts, and the span over which it reaches the top level. */
const SWELL_START = 0.8;
const SWELL_SPAN = 1.6;
/** Glitter sparkle colour per page mode, and its alpha per brightness level. */
const GLINT_RGB = { dark: [255, 244, 214], light: [20, 70, 120] } as const;
const GLINT_ALPHA = { dark: [0.35, 0.5, 0.7], light: [0.4, 0.5, 0.6] } as const;
/** One sparkle in this many is a `*`, on dark pages only (a `*` does not read on light ones). */
const GLINT_STAR = 40;
/** Windrow and whitecap foam colour per page mode. Windrows have two alpha levels, foam three. */
const FOAM_RGB = { dark: [225, 240, 250], light: [30, 60, 80] } as const;
const STREAK_ALPHA = [0.09, 0.13] as const;
const FOAM_ALPHA = [0.25, 0.42, 0.6] as const;

// Surface rings on natural water: a wobbling radius, gaps in the arc, and the swell's drift (px/s).
// The still pond wobbles less and has fewer gaps. Ring glyphs are dots, ticks and commas only.
const RING_WOBBLE = 0.18;
const RING_GAP = 0.45;
const RING_WOBBLE_POND = 0.06;
const RING_GAP_POND = 0.27;
const RING_DRIFT = 6;
const RING_GLYPHS = [".", "'", "`", ","];
/** The sea's layout seed: one fixed sea, the same on every load. */
const SEA_SEED = 0x5ea;

/** Phase of harmonic `j` of a ring with shape seed `seed` (0 to 1): each harmonic gets its own offset. */
function ringPhase(seed: number, j: number) {
  return TAU * ((seed * (7.31 + 3.7 * j)) % 1);
}

/** `levels` alpha steps up to `peak`: step k is (k + 1) / levels of it, so the top step is the peak. */
function rampStyles(rgb: readonly number[], peak: number, levels: number) {
  return Array.from(
    { length: levels },
    (_, k) => `rgba(${rgb.join(",")},${((peak * (k + 1)) / levels).toFixed(3)})`,
  );
}

// Spray: each alpha quantised to ALPHA_LEVELS styles.
const SPRAY_RGB = { dark: [230, 238, 255], light: [60, 70, 85] } as const;
const PARTICLE_ALPHA = 0.85;

const ACCENTS = ["#e0892c", "#e03a32", "#b44ae0", "#33c8cc", "#3cb54a", "#3150e8", "#d9c14a"];

/** Fixed creature glyph colours: the dark-mode values, and their inverses for light mode. */
const INK = {
  dark: { bright: "#ffffff", ink: "#0e0f13", inkSoft: "#1b1d24", eye: "#9aa0ad" },
  light: { bright: "#000000", ink: "#f1f0ec", inkSoft: "#e4e2db", eye: "#655f52" },
};

// Sparse glyphs on bright skin, dense glyphs in shadow, so the texture
// reinforces the shading instead of fighting it.
const SKIN_RAMP = ":;t%SX8#@";
const FIN_GLYPHS = "%;tS:";
const RIDGE_GLYPHS = "@8%";
const EDGE_HEAVY = ":;";
const EDGE_LIGHT = ".',`";

const FLAG_BODY = 1;
const FLAG_EDGE = 2;
const FLAG_FIN = 3;
const FLAG_RIDGE = 4;
const FLAG_EYE = 5;
/** Dark skin markings: tiger bars, zebra-shark spots. */
const FLAG_MARK = 6;
const MARK_GLYPHS = "#%@";

// Sub-cell sample offsets for anti-aliased silhouettes.
const SUBSAMPLES = [0.25, 0.3, 0.75, 0.3, 0.25, 0.72, 0.75, 0.72];

// Natural mode only. Five bits per channel for the fillStyle cache.
const STYLE_CACHE_SIZE = 1 << 15;
const DEPTH_STEPS = 16;

/** Factor per depth step (depth quantised to 1/16), so no Math.exp per cell. z = (1 - depth) * 2.2. */
function waterTable(k: number) {
  const table = new Float32Array(DEPTH_STEPS + 1);
  for (let i = 0; i <= DEPTH_STEPS; i++) {
    table[i] = Math.exp(-k * (1 - i / DEPTH_STEPS) * 2.2);
  }
  return table;
}

type WaterTables = { r: Float32Array; g: Float32Array; b: Float32Array; veil: Float32Array };

/** Per-channel absorb factors (light from the animal loses red first) and the haze, for one habitat. */
function waterTables(absorb: Habitat["absorb"], veilK: number): WaterTables {
  return {
    r: waterTable(absorb[0]),
    g: waterTable(absorb[1]),
    b: waterTable(absorb[2]),
    veil: waterTable(veilK),
  };
}

const habitatTables = new WeakMap<Habitat, WaterTables>();
/** The water tables of a habitat, built once. */
function tablesFor(habitat: Habitat) {
  let tables = habitatTables.get(habitat);
  if (!tables) {
    tables = waterTables(habitat.absorb, habitat.veil);
    habitatTables.set(habitat, tables);
  }
  return tables;
}

function depthIndex(depth: number) {
  return clamp(Math.round(depth * DEPTH_STEPS), 0, DEPTH_STEPS);
}

/** Mix two rgb colours: t = 0 is a, t = 1 is b. */
function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

/** Absorb the channel, then veil it toward the haze target (the habitat's deep water colour). */
function attenuateChannel(c: number, toward: number, absorb: number, haze: number) {
  return clamp(Math.round(toward + (c * absorb - toward) * haze), 0, 255);
}

/**
 * Natural colour as seen through water at depth (0 far, 1 near): absorbed, then veiled toward `toward`,
 * the water's deep colour. The scene picks the habitat; the ocean default is the original behaviour.
 */
export function attenuate(c: Rgb, toward: Rgb, depth: number, scene: OceanScene = "ocean"): Rgb {
  const w = tablesFor(habitatOf(scene));
  const zi = depthIndex(depth);
  return [
    attenuateChannel(c[0], toward[0], w.r[zi], w.veil[zi]),
    attenuateChannel(c[1], toward[1], w.g[zi], w.veil[zi]),
    attenuateChannel(c[2], toward[2], w.b[zi], w.veil[zi]),
  ];
}

// Coat ramps: lighting steps per region, as rgb before water. Built once per coat, then only looked up.
const COAT_STEPS = 16;
// Koi fins are translucent: they veil as if one step further off.
const COAT_FIN_VEIL = 0.15;
// Glyph ink on a coat's dark regions: a light ink, so black patches still show texture.
const COAT_LIGHT_INK = "rgba(236,238,242,0.55)";
// Glint glyphs on a coat with `glint`: pale gold or white.
const COAT_GLINT = ["#f6e7a8", "#ffffff"];
// Lightness margin from the page: coat regions stay this far off the background's OKLab lightness.
const COAT_CONTRAST_DARK = 0.12;
const COAT_CONTRAST_LIGHT = 0.06;

/** Per region, COAT_STEPS rgb triples: the region's OKLCH lit from dark to bright, kept off the page. */
function buildCoatRamps(coat: Coat, bgL: number, dark: boolean): Uint8Array[] {
  return coat.regions.map(([l, c, h]) => {
    const ramp = new Uint8Array(COAT_STEPS * 3);
    for (let k = 0; k < COAT_STEPS; k++) {
      const shade = k / (COAT_STEPS - 1);
      let lit = clamp(l * (0.62 + 0.55 * shade), 0, 1);
      lit = clamp(
        dark ? Math.max(lit, bgL + COAT_CONTRAST_DARK) : Math.min(lit, bgL - COAT_CONTRAST_LIGHT),
        0,
        1,
      );
      const [r, g, b] = oklchToRgb(lit, c, h);
      ramp[3 * k] = r;
      ramp[3 * k + 1] = g;
      ramp[3 * k + 2] = b;
    }
    return ramp;
  });
}

/** Natural body fill level for a half cell, by its flag. */
function halfLevel(flag: number, shade: number) {
  if (flag === FLAG_RIDGE) return 226;
  if (flag === FLAG_EYE) return 12;
  if (flag === FLAG_MARK) return 24 + shade * 22;
  if (flag === FLAG_FIN) return 40 + shade * 120;
  return 46 + shade * 160;
}

/** How far a tail reaches across the body, as a fraction of length: a fluke's span or a blade's widest half-width. */
function tailSpan(tail: TailShape) {
  return tail.kind === "fluke" ? tail.span : tail.width + tail.twist;
}

/**
 * Rounded paddle fin: an ellipse from the middle of its root (r0–r1 along the body) out to the
 * tip at (tipU, reach). Its width is the root's length, so the blade stays broad to a round end.
 */
function inPaddle(u: number, a: number, r0: number, r1: number, tipU: number, reach: number) {
  const mu = (r0 + r1) / 2;
  const du = tipU - mu;
  const len = Math.hypot(du, reach);
  if (len === 0) return false;
  const along = ((u - mu) * du + a * reach) / len;
  const off = ((u - mu) * reach - a * du) / len;
  const half = len / 2;
  const width = Math.max((r1 - r0) / 2, 1);
  return ((along - half) / half) ** 2 + (off / width) ** 2 <= 1;
}

function inTriangle(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
) {
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

type Oklch = [number, number, number];

// The seabed, natural mode. It is the deepest layer: colours go through the water at the far depth, then a further veil toward the page.
const FLOOR_DEPTH = 0;
const FLOOR_VEIL = 0.45;
// Natural water: the light patch's peak alpha at the top centre (the surface colour, fading to nothing at its edge).
const WATER_LIGHT_PATCH = 0.22;
/** Low-frequency patches are value noise on a coarse lattice of this many columns and rows over the page. */
const FLOOR_NOISE_COLS = 12;
const FLOOR_NOISE_ROWS = 8;
const FLOOR_SALT = 0x5eab;
// Ocean: pale sand, long regular ripples, a few rocks and shells.
const SAND: Oklch = [0.8, 0.05, 85];
const RIPPLE_LAMBDA = 3.2;
const RIPPLE_THETA = 0.35;
const RIPPLE_RIDGE = 0.8;
const ROCK: Oklch = [0.45, 0.02, 60];
const SHELL: Oklch = [0.85, 0.03, 70];
// Pond: dark silt with rounded pebbles in grey, tan and rust, and sunken brown leaves.
const SILT: Oklch = [0.32, 0.04, 80];
const PEBBLES: Oklch[] = [
  [0.55, 0.01, 250],
  [0.6, 0.04, 75],
  [0.5, 0.07, 45],
];
const LEAF: Oklch = [0.4, 0.06, 60];

/** Value noise in 0–1: bilinear over hashes on a coarse lattice, so the patches span many cells. */
function floorNoise(col: number, row: number, cols: number, rows: number, z: number) {
  const gx = (col / cols) * FLOOR_NOISE_COLS;
  const gy = (row / rows) * FLOOR_NOISE_ROWS;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const fx = gx - x0;
  const fy = gy - y0;
  const top = hash3(x0, y0, z) * (1 - fx) + hash3(x0 + 1, y0, z) * fx;
  const bottom = hash3(x0, y0 + 1, z) * (1 - fx) + hash3(x0 + 1, y0 + 1, z) * fx;
  return top * (1 - fy) + bottom * fy;
}

/** Cell grid, snapped to device pixels, stroked in `stroke` (a CSS colour). */
export function paintGrid(
  g: CanvasRenderingContext2D,
  W: number,
  H: number,
  cw: number,
  ch: number,
  dpr: number,
  stroke: string,
) {
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.strokeStyle = stroke;
  g.lineWidth = 1;
  g.beginPath();
  for (let c = 0; c <= Math.ceil(W / cw); c++) {
    const x = Math.round(c * cw * dpr) + 0.5;
    g.moveTo(x, 0);
    g.lineTo(x, H * dpr);
  }
  for (let r = 0; r <= Math.ceil(H / ch); r++) {
    const y = Math.round(r * ch * dpr) + 0.5;
    g.moveTo(0, y);
    g.lineTo(W * dpr, y);
  }
  g.stroke();
}

/**
 * The depth a body is seen at. Natural colours: its depth plus a fish's drift, then a diving animal (dive 1)
 * reads 45% deeper, dimmer and bluer, and a surfaced one (dive 0) reads at its full depth, in full colour.
 * Theme colours keep the classic cover, so they ignore the drift and the dive and read the base depth only.
 */
function bodyDepthOf(sh: Creature, natural: boolean) {
  if (!natural) return sh.depth;
  const depth = clamp(sh.depth + sh.depthOffset, 0, 1);
  return sh.dive === 0 ? depth : depth * (1 - 0.45 * sh.dive);
}

/** Draw key: the animal's depth. */
function depthKey(sh: Creature) {
  return sh.depth;
}

/**
 * Creature indices in draw order, ascending by depthKey. An insertion sort into `out` (preallocated);
 * it is stable, so ties keep the array order, and without height the order is the array order.
 */
export function drawOrder(creatures: readonly Creature[], out: Int16Array) {
  for (let i = 0; i < creatures.length; i++) out[i] = i;
  for (let i = 1; i < creatures.length; i++) {
    const v = out[i];
    const key = depthKey(creatures[v]);
    let k = i;
    while (k > 0 && depthKey(creatures[out[k - 1]]) > key) {
      out[k] = out[k - 1];
      k--;
    }
    out[k] = v;
  }
}

/** A splash has no body length; it pushes the pond plants as a koi of this length would. */
const SPLASH_PUSH_SIZE = 60;
/** A koi with dive below this swims shallow: it pushes the pond plants and shows on top of them. */
const SHALLOW_DIVE = 0.35;

export class AsciiRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private bg: HTMLCanvasElement;
  private dpr = 1;
  private width = 0;
  private height = 0;
  private cw = 12;
  private ch = 18;
  private cols = 0;
  private rows = 0;
  private fontFamily = "ui-monospace, Menlo, monospace";

  private dotKind = new Uint8Array(0); // 0 none, 1 blue, 2 green, 3 red, 4 pale
  private dotPhase = new Float32Array(0);
  private dotFreq = new Float32Array(0);
  private energy = new Float32Array(0);
  private energyTmp = new Float32Array(0);
  private bucketOf = new Uint8Array(0);
  private bucketOrder = new Int32Array(0);
  private bucketCounts = new Int32Array(DOT_RGB.length * ALPHA_LEVELS + 1);
  /** drawDots scratch: each bucket's start in bucketOrder, and the fill cursor. */
  private bucketStarts = new Int32Array(DOT_RGB.length * ALPHA_LEVELS + 1);
  private bucketCursor = new Int32Array(DOT_RGB.length * ALPHA_LEVELS + 1);
  private dotStyles: string[] = [];
  /** Surface rings and spray: spawned by events, drawn in both colour modes. */
  private effects = new Effects();
  /** Ring colours by alpha level. */
  private ringStyles: string[] = [];
  /** Pond scene: lily pads and duckweed, and the cells the pads cover (rings skip them). */
  private pond = new PondSurface();
  private padMask = new Uint8Array(0);
  /** Pond scene: cells held by a shallow koi, which the pond plants leave on top. */
  private koiMask = new Uint8Array(0);
  /** The pond plants need a koi length to lay out, so layout waits for the first render with a creature. */
  private pondPending = true;
  /** This frame's scene is the pond. Turns off the open sea. */
  private pondScene = false;
  /** Spray colours by alpha level. */
  private particleStyles: string[] = [];
  /** The open sea: swell, glitter, windrows and whitecaps. Natural water with the surface on only. */
  private sea = new SeaSurface();
  private swellLit: string[] = [];
  private swellShade: string[] = [];
  private glintStyles: string[] = [];
  private streakStyles: string[] = [];
  private foamStyles: string[] = [];
  /** Natural colours only: the sea and the ripple sets; see setSurface. */
  private surface = true;
  /** Counts renders; mixed into effect seeds so each frame's randomness differs. */
  private frameCount = 0;
  // Particle draw pass, bound once so the per-frame forEach allocates nothing.
  private drawSprayFn = (x: number, y: number, age01: number) => {
    this.drawParticle(x, y, age01);
  };
  private drawRingFn = (
    x: number,
    y: number,
    r: number,
    alpha: number,
    seed: number,
    age: number,
  ) => {
    this.drawRing(x, y, r, alpha, seed, age);
  };

  private bodyFlag = new Uint8Array(0);
  private bodyShade = new Float32Array(0);
  private bodyKey = new Uint32Array(0);
  private bodyDepth = new Float32Array(0);
  private bodyKind = new Uint8Array(0);
  /** Cells darkened by a creature's shadow on the seabed. */
  private bodyShadow = new Uint8Array(0);
  // Natural mode: each body cell has a top (2i) and bottom (2i + 1) half.
  private halfFlag = new Uint8Array(0);
  private halfShade = new Float32Array(0);
  /** Natural mode, coat species: the coat region of each half cell. */
  private halfRegion = new Uint8Array(0);
  /** Natural mode: index into bodyCoat of the animal that last drew each cell. */
  private bodyCreature = new Uint8Array(0);
  /** Natural mode: this frame's coat per animal (null for species without one), indexed by bodyCreature. */
  private bodyCoat: (Coat | null)[] = [];
  /** Natural mode: how hard each cell's seabed shadow darkens the dots, 0 to 1. */
  private bodyShadowStrength = new Float32Array(0);
  /** Natural mode: quantised rgb (5 bits per channel) to its fillStyle string. */
  private styleCache: string[] = new Array(STYLE_CACHE_SIZE);
  private spine = new Float32Array(SPINE_NODES * 2);
  private arc = new Float32Array(SPINE_NODES);
  private arcTotal = 1;
  private def: CreatureDef = CREATURES.classic;
  private bodyId = 0;
  private finTipLeft = 0;
  private finTipRight = 0;
  /** Tail-fin beat for the current creature: tailLift is sin(phase), and the beat scales the flukes with it. */
  private tailLift = 0;
  private tailBeat = 1;
  /** Half-width of the blade where it leaves the peduncle, in px. Set once per animal, not per sample. */
  private tailW0 = 0;
  /** Natural mode sways a tail blade side to side; theme mode keeps the cover's classic swell, so its draw calls hold. */
  private swayTail = false;
  // The spine's end and the direction past it, for a heterocercal blade (set per creature in rasterize).
  private tailX = 0;
  private tailY = 0;
  private tailDx = 1;
  private tailDy = 0;
  // Scratch outputs of sampleBody(), to avoid allocating per sample.
  private hitFlag = 0;
  private hitShade = 0;
  private hitAcross = 0;
  private hitS = 0;
  private hitV = 0;
  private hitDist = 0;
  /** Reused for every coat paint call, so painting allocates nothing. */
  private paintPoint: PaintPoint = {
    s: 0,
    v: 0,
    L: 0,
    across: 0,
    flag: 0,
    id: 0,
  };
  /** Creature indices in draw order (see drawOrder); resized only when the creature count changes. */
  private order = new Int16Array(0);

  /** Cells holding a fish this frame (frame stamp); dots skip them. */
  private fishStamp = new Uint32Array(0);
  private frameId = 0;
  /** Fish cells bucketed by brightness, so each bucket is one fillStyle. */
  private fishBuckets: number[][] = FISH_ALPHAS.map(() => []);
  private fishStyles: string[] = [];
  private palette: OceanPalette = DEFAULT_PALETTE;
  private colors: OceanColors = "theme";
  /** OKLab lightness of the page background, for the coat contrast floor. Set by setPalette. */
  private bgL = rgbToOklabL(...DEFAULT_PALETTE.background);
  /** Coat ramps for this page; rebuilt whenever the palette changes. */
  private rampCache = new WeakMap<Coat, Uint8Array[]>();
  /** The scene's water and seabed; see setScene. */
  private scene: OceanScene = "ocean";
  private habitat: Habitat = OCEAN;
  private water: WaterTables = tablesFor(OCEAN);
  /** Natural mode: the colour animals veil toward with depth (the habitat's deep water for this page mode). */
  private hazeTarget: Rgb = OCEAN.water.dark.deep;
  /** Natural mode: the water's surface and deep colours over this page, each mixed toward the page. */
  private waterSurface: Rgb = [0, 0, 0];
  private waterDeep: Rgb = [0, 0, 0];
  /** Seed for the seabed's patches, rocks, pebbles and leaves. */
  private floorSeed = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("2D canvas unavailable");
    this.ctx = ctx;
    this.bg = document.createElement("canvas");
    this.updateWater();
    this.buildStyles();
  }

  /** Swap in the page colours: rebuilds the ink styles and repaints the background. */
  setPalette(p: OceanPalette) {
    this.palette = p;
    this.bgL = rgbToOklabL(...p.background);
    this.rampCache = new WeakMap();
    this.updateWater();
    this.buildStyles();
    this.styleCache = new Array(STYLE_CACHE_SIZE);
    if (this.bg.width > 0) this.paintBackground();
  }

  /** The habitat's water over this page: the haze target, and the surface and deep fill colours. */
  private updateWater() {
    const { mode, background } = this.palette;
    const tone = this.habitat.water[mode];
    const fill = this.habitat.fill[mode];
    this.hazeTarget = tone.deep;
    this.waterSurface = mixRgb(background, tone.surface, fill);
    this.waterDeep = mixRgb(background, tone.deep, fill);
  }

  /** Natural keeps animals in their real colours; theme keeps them greyscale and inverts on light pages. */
  setColors(mode: OceanColors) {
    this.colors = mode;
    this.buildStyles();
    this.styleCache = new Array(STYLE_CACHE_SIZE);
    // The seabed is natural-only, so the background repaints when the mode flips.
    if (this.bg.width > 0) this.paintBackground();
  }

  /**
   * The scene sets the water (pond green-brown, ocean blue) and the seabed under the grid.
   * `seed` picks the seabed's patches, rocks and pebbles, so one seed gives one floor.
   */
  setScene(scene: OceanScene, seed = 0) {
    this.scene = scene;
    this.habitat = habitatOf(scene);
    this.water = tablesFor(this.habitat);
    this.updateWater();
    this.floorSeed = seed;
    // Cached styles hold water-attenuated colours, so they belong to the old water.
    this.rampCache = new WeakMap();
    this.styleCache = new Array(STYLE_CACHE_SIZE);
    if (this.bg.width > 0) this.paintBackground();
  }

  /** The open sea and the surface rings (natural colours only). Turn off for a calmer background. */
  setSurface(on: boolean) {
    this.surface = on;
  }

  private buildStyles() {
    const { foreground, mode } = this.palette;
    this.fishStyles = FISH_ALPHAS.map((a) => `rgba(${foreground.join(",")},${a})`);
    const levelStyles = (rgb: readonly number[], peak: number) =>
      Array.from(
        { length: ALPHA_LEVELS },
        (_, k) => `rgba(${rgb.join(",")},${((peak * (k + 1)) / ALPHA_LEVELS).toFixed(3)})`,
      );
    this.ringStyles = levelStyles(mode === "light" ? WAKE_RGB_LIGHT : DOT_RGB[WAKE], 1);
    this.particleStyles = levelStyles(
      mode === "light" ? SPRAY_RGB.light : SPRAY_RGB.dark,
      PARTICLE_ALPHA,
    );
    this.swellLit = rampStyles(SWELL_RGB[mode], SWELL_PEAK[mode].lit, SWELL_LEVELS);
    this.swellShade = rampStyles(SWELL_SHADE_RGB, SWELL_PEAK[mode].shade, SWELL_LEVELS);
    this.glintStyles = GLINT_ALPHA[mode].map((a) => `rgba(${GLINT_RGB[mode].join(",")},${a})`);
    this.streakStyles = STREAK_ALPHA.map((a) => `rgba(${FOAM_RGB[mode].join(",")},${a})`);
    this.foamStyles = FOAM_ALPHA.map((a) => `rgba(${FOAM_RGB[mode].join(",")},${a})`);
    this.dotStyles = [];
    for (let c = 0; c < DOT_RGB.length; c++) {
      const [r, g, b] = c === WAKE && mode === "light" ? WAKE_RGB_LIGHT : DOT_RGB[c];
      for (let l = 0; l < ALPHA_LEVELS; l++) {
        const a = (DOT_BASE_ALPHA[c] * (l + 1)) / ALPHA_LEVELS;
        this.dotStyles.push(`rgba(${r},${g},${b},${a.toFixed(3)})`);
      }
    }
    this.pond.setPalette(mode);
  }

  /** Greys invert on light backgrounds, so the creatures read as a negative. */
  private tone(level: number) {
    return this.palette.mode === "dark" ? level : 255 - level;
  }

  get cellWidth() {
    return this.cw;
  }

  get cellHeight() {
    return this.ch;
  }

  setFontFamily(family: string) {
    if (family) this.fontFamily = family;
    // The natural floor is drawn in this font, so a sized canvas repaints it.
    if (family && this.bg.width > 0) this.paintBackground();
  }

  resize(width: number, height: number, dpr: number) {
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.cw = clamp(Math.round(width / 124), 8, 13);
    this.ch = Math.round(this.cw * 1.45);
    this.cols = Math.ceil(width / this.cw);
    this.rows = Math.ceil(height / this.ch);

    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.bg.width = this.canvas.width;
    this.bg.height = this.canvas.height;

    const n = this.cols * this.rows;
    this.dotKind = new Uint8Array(n);
    this.dotPhase = new Float32Array(n);
    this.dotFreq = new Float32Array(n);
    this.energy = new Float32Array(n);
    this.energyTmp = new Float32Array(n);
    this.bucketOf = new Uint8Array(n);
    this.bucketOrder = new Int32Array(n);
    this.bodyFlag = new Uint8Array(n);
    this.bodyShade = new Float32Array(n);
    this.bodyKey = new Uint32Array(n);
    this.bodyDepth = new Float32Array(n);
    this.bodyKind = new Uint8Array(n);
    this.bodyShadow = new Uint8Array(n);
    this.halfFlag = new Uint8Array(2 * n);
    this.halfShade = new Float32Array(2 * n);
    this.halfRegion = new Uint8Array(2 * n);
    this.bodyCreature = new Uint8Array(n);
    this.bodyShadowStrength = new Float32Array(n);
    this.fishStamp = new Uint32Array(n);
    this.sea.layout(this.cols, this.rows, this.cw, this.ch, SEA_SEED);
    this.padMask = new Uint8Array(n);
    this.koiMask = new Uint8Array(n);
    this.pondPending = true;

    for (let i = 0; i < n; i++) {
      const col = i % this.cols;
      const row = (i / this.cols) | 0;
      // No ambient dots: the grid stays black. Only the cyan wake lights cells.
      this.dotKind[i] = 0;
      this.dotPhase[i] = hash3(col, row, 23) * Math.PI * 2;
      this.dotFreq[i] = 0.3 + hash3(col, row, 37) * 1.1;
    }
    this.paintBackground();
  }

  private paintBackground() {
    const g = this.bg.getContext("2d");
    if (!g) return;
    const { width: W, height: H, dpr, cw, ch } = this;
    const { background, foreground, mode } = this.palette;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = `rgb(${background.join(",")})`;
    g.fillRect(0, 0, W, H);
    // Natural colours have water and a seabed under the grid; theme keeps the flat background.
    if (this.colors === "natural") {
      this.paintWater(g);
      this.paintFloor(g);
    }
    paintGrid(
      g,
      W,
      H,
      cw,
      ch,
      dpr,
      `rgba(${foreground.join(",")},${mode === "dark" ? 0.055 : 0.07})`,
    );
  }

  /**
   * The water, painted once into the background and blitted each frame. A vertical gradient from the
   * surface colour at the top to the deep colour at the bottom, with a broad light patch near the top centre.
   */
  private paintWater(g: CanvasRenderingContext2D) {
    const { width: W, height: H } = this;
    const [sr, sg, sb] = this.waterSurface;
    const surface = `${sr},${sg},${sb}`;
    const down = g.createLinearGradient(0, 0, 0, H);
    down.addColorStop(0, `rgb(${surface})`);
    down.addColorStop(1, `rgb(${this.waterDeep.join(",")})`);
    g.fillStyle = down;
    g.fillRect(0, 0, W, H);
    const light = g.createRadialGradient(W / 2, 0, 0, W / 2, 0, Math.max(W, H) * 0.8);
    light.addColorStop(0, `rgba(${surface},${WATER_LIGHT_PATCH})`);
    light.addColorStop(1, `rgba(${surface},0)`);
    g.fillStyle = light;
    g.fillRect(0, 0, W, H);
  }

  /**
   * The seabed, painted once into the background. Each cell gets at most one glyph, and the patches
   * are faint fills under them. Every colour is seen through the scene's water at the far depth.
   */
  private paintFloor(g: CanvasRenderingContext2D) {
    const { cols, rows, cw, ch, scene, floorSeed, fontFamily } = this;
    const bed = this.waterDeep;
    const dark = this.palette.mode === "dark";
    const z = (k: number) => FLOOR_SALT + floorSeed * 97 + k * 1009;
    const styles = new Map<string, string>();
    /** An OKLCH colour at an alpha, through the water and then veiled toward the water's bed colour. Memoised. */
    const fill = (c: Oklch, alpha: number) => {
      const key = `${c.join()}|${alpha}`;
      let s = styles.get(key);
      if (s === undefined) {
        const [r, gn, b] = attenuate(
          oklchToRgb(c[0], c[1], c[2]),
          this.hazeTarget,
          FLOOR_DEPTH,
          scene,
        );
        const veiled = (x: number, i: number) => Math.round(x + (bed[i] - x) * FLOOR_VEIL);
        s = `rgba(${veiled(r, 0)},${veiled(gn, 1)},${veiled(b, 2)},${alpha.toFixed(3)})`;
        styles.set(key, s);
      }
      return s;
    };

    const taken = new Uint8Array(cols * rows);
    const free = (col: number, row: number) =>
      col >= 0 && row >= 0 && col < cols && row < rows && !taken[row * cols + col];
    const glyph = (text: string, col: number, row: number, style: string) => {
      g.fillStyle = style;
      g.fillText(text, (col + 0.5) * cw, row * ch + ch / 2 + 1);
      taken[row * cols + col] = 1;
    };
    g.font = `600 ${Math.round(ch * 0.74)}px ${fontFamily}`;
    g.textAlign = "center";
    g.textBaseline = "middle";

    if (scene === "ocean") {
      // Rocks: 3–6 clusters of 3–9 cells. The centre is the darkest cell and gets the '@'.
      const clusters = 3 + Math.floor(hash3(0, 0, z(1)) * 4);
      for (let k = 0; k < clusters; k++) {
        const n = 3 + Math.floor(hash3(k, 3, z(1)) * 7);
        const cx = Math.floor(hash3(k, 1, z(1)) * cols);
        const cy = Math.floor(hash3(k, 2, z(1)) * rows);
        // Candidates in a 5×3 box, nearest first. The hash breaks ties, so clusters differ in shape.
        const cand: [number, number, number][] = [];
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            cand.push([dc, dr, dc * dc + 4 * dr * dr + 0.9 * hash3(cx + dc, cy + dr, z(10 + k))]);
          }
        }
        cand.sort((a, b) => a[2] - b[2]);
        for (let j = 0; j < n; j++) {
          const col = cx + cand[j][0];
          const row = cy + cand[j][1];
          if (!free(col, row)) continue;
          if (j === 0) glyph("@", col, row, fill(ROCK, 0.32));
          else glyph(hash3(col, row, z(20)) < 0.5 ? "O" : "o", col, row, fill(ROCK, 0.2));
        }
      }

      // Sand ripples: long slanted ridges. Alternate cells along a ridge draw '-', so it reads as sand, not a solid stripe.
      const cosT = Math.cos(RIPPLE_THETA);
      const sinT = Math.sin(RIPPLE_THETA);
      const base = dark ? 0.22 : 0.16;
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          if (!free(col, row)) continue;
          const v = Math.sin(
            (TAU * (col * cosT + row * sinT)) / RIPPLE_LAMBDA +
              0.9 * Math.sin((TAU * row) / (5 * RIPPLE_LAMBDA)),
          );
          if (v <= RIPPLE_RIDGE) continue;
          // The patch factor (0.6–1) fades the ripples in and out across the floor, in 0.1 steps.
          const patch = Math.round((0.6 + 0.4 * floorNoise(col, row, cols, rows, z(30))) * 10) / 10;
          glyph(col % 2 ? "-" : "~", col, row, fill(SAND, base * patch));
        }
      }

      // Shells: a few scattered dots and commas, faint.
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          if (!free(col, row) || hash3(col, row, z(40)) >= 0.004) continue;
          glyph(hash3(col, row, z(41)) < 0.5 ? "." : ",", col, row, fill(SHELL, 0.2));
        }
      }
    } else {
      // Silt: a lower-frequency darker bed, as faint fills under the glyphs.
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const silt = floorNoise(col, row, cols, rows, z(50));
          if (silt <= 0.5) continue;
          g.fillStyle = fill(SILT, Math.round((0.08 + 0.12 * (silt - 0.5)) * 100) / 100);
          g.fillRect(col * cw, row * ch, cw, ch);
        }
      }

      // Sunken leaves: 4–8 two-cell pairs of brown '~~'.
      const leaves = 4 + Math.floor(hash3(0, 0, z(60)) * 5);
      for (let k = 0; k < leaves; k++) {
        const col = Math.floor(hash3(k, 1, z(61)) * cols);
        const row = Math.floor(hash3(k, 2, z(61)) * rows);
        if (!free(col, row) || !free(col + 1, row)) continue;
        glyph("~", col, row, fill(LEAF, 0.28));
        glyph("~", col + 1, row, fill(LEAF, 0.28));
      }

      // Pebbles: 5% of cells, rounded and mixed in tone, alpha 0.3–0.42.
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          if (!free(col, row) || hash3(col, row, z(70)) >= 0.05) continue;
          const tone = PEBBLES[Math.floor(hash3(col, row, z(71)) * PEBBLES.length)];
          const alpha = Math.round((0.3 + 0.12 * hash3(col, row, z(72))) * 50) / 50;
          const shape = ["o", "°", "."][Math.floor(hash3(col, row, z(73)) * 3)];
          glyph(shape, col, row, fill(tone, alpha));
        }
      }
    }
  }

  render(world: World, dt: number) {
    const { ctx, dpr, cols, ch } = this;
    if (cols === 0) return;
    const t = world.time;
    const natural = this.colors === "natural";
    const surface = natural && this.surface;
    // A still pond has no open sea. Its plants float on natural, surface-on water only.
    this.pondScene = world.scene === "pond";
    const plants = surface && this.pondScene;
    const waves = surface && !this.pondScene;
    this.frameCount++;
    this.padMask.fill(0);
    if (plants && this.pondPending) {
      let bodyL = 0;
      for (const sh of world.creatures) bodyL = Math.max(bodyL, sh.length);
      if (bodyL > 0) {
        this.pond.layout(this.width, this.height, bodyL);
        this.pondPending = false;
      }
    }

    this.consumeEvents(world);
    this.effects.step(dt);
    if (waves) this.sea.step(t, dt);
    if (plants) {
      this.pondWake(world);
      this.pond.step(dt, t);
    }
    this.rasterizeCreatures(world.creatures, t);
    this.depositWake(world);
    this.diffuse(dt);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.bg, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    this.markFish(world);
    this.drawDots(t);

    ctx.font = `600 ${Math.round(ch * 0.74)}px ${this.fontFamily}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    this.drawFish();
    if (waves) this.drawSea(t);
    // Pad shadows fall on the floor, so the creatures swim over them.
    if (plants) this.pond.drawShadows(ctx, this.cw, ch, cols, this.rows);
    if (natural) this.drawNatural(t);
    else this.drawCreatures(t);
    if (plants) {
      this.markShallowKoi(world);
      this.pond.drawPlants(ctx, this.cw, ch, cols, this.rows, this.padMask, this.koiMask);
    }
    // Rings and spray sit above the water line, over the animals.
    this.effects.forEachRing(this.drawRingFn);
    this.effects.forEachParticle(this.drawSprayFn);
  }

  // ── simulation → field ──────────────────────────────────────────────

  private cellIndex(x: number, y: number) {
    const c = Math.floor(x / this.cw);
    const r = Math.floor(y / this.ch);
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return -1;
    return r * this.cols + c;
  }

  private stamp(field: Float32Array, x: number, y: number, radius: number, amount: number) {
    const c0 = Math.floor(x / this.cw);
    const r0 = Math.floor(y / this.ch);
    for (let r = r0 - radius; r <= r0 + radius; r++) {
      for (let c = c0 - radius; c <= c0 + radius; c++) {
        if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) continue;
        const d = Math.hypot(c - c0, (r - r0) * 1.4);
        if (d > radius + 0.5) continue;
        const i = r * this.cols + c;
        field[i] = Math.min(1.6, field[i] + amount * (1 - d / (radius + 1)));
      }
    }
  }

  /** Events become field stamps (wake) and render-side effects (rings and spray). */
  private consumeEvents(world: World) {
    const { effects } = this;
    const natural = this.colors === "natural";
    const surface = natural && this.surface;
    for (let ei = 0; ei < world.events.length; ei++) {
      const e = world.events[ei];
      if (!Number.isFinite(e.x) || !Number.isFinite(e.y)) continue;
      // Effect randomness: hash3 on this seed, the particle index and the frame, never the world rng.
      const seed = this.frameCount * 1031 + ei;
      if (e.kind === "blow") {
        // Natural colours only: theme mode skips the blow and keeps the cover as it was.
        if (natural) effects.spray(e.x, e.y, e.drops, e.reach, seed, e.life);
        continue;
      }
      if (!natural) this.stamp(this.energy, e.x, e.y, 6, 1.4);
      effects.ring(e.x, e.y, 120, 90, 1);
      effects.spray(e.x, e.y, 26, 60, seed);
      if (this.pondScene && surface) this.pond.push(e.x, e.y, SPLASH_PUSH_SIZE);
    }
    world.events.length = 0;
  }

  /** Marks the cells a shallow koi holds this frame, so the pond plants leave them on top. */
  private markShallowKoi(world: World) {
    const { bodyFlag, bodyCreature, koiMask } = this;
    for (let i = 0; i < bodyFlag.length; i++) {
      const sh = bodyFlag[i] ? world.creatures[bodyCreature[i]] : undefined;
      koiMask[i] = sh !== undefined && sh.dive < SHALLOW_DIVE ? 1 : 0;
    }
  }

  /** Koi push the pond plants aside: the snout and the mid-spine each make a wake, moving with the koi. */
  private pondWake(world: World) {
    const mid = (SPINE_NODES >> 1) * 2;
    for (const sh of world.creatures) {
      // Deeper koi pass under the plants without disturbing them.
      if (sh.dive >= SHALLOW_DIVE) continue;
      const vx = Math.cos(sh.heading) * sh.speed;
      const vy = Math.sin(sh.heading) * sh.speed;
      const radius = 0.12 * sh.length;
      this.pond.pushFrom(sh.nodes[0], sh.nodes[1], vx, vy, radius);
      this.pond.pushFrom(sh.nodes[mid], sh.nodes[mid + 1], vx, vy, radius);
    }
  }

  private depositWake(world: World) {
    // Natural water has no energy trails: the ripple rings and spray are the surface response.
    if (this.colors === "natural") return;
    const { energy } = this;
    for (const f of world.fish) {
      if (!f.alive) continue;
      const i = this.cellIndex(f.x, f.y);
      if (i >= 0) energy[i] = Math.min(1.6, energy[i] + 0.012 + f.alarm * 0.03);
    }
    for (const sh of world.creatures) {
      // The tail sweeps the most water.
      for (let k = SPINE_NODES - 6; k < SPINE_NODES; k++) {
        const i = this.cellIndex(sh.nodes[k * 2], sh.nodes[k * 2 + 1]);
        if (i >= 0) energy[i] = Math.min(1.6, energy[i] + 0.05 + sh.speed * 0.0012);
      }
    }
    if (world.pointer.active) {
      this.stamp(energy, world.pointer.x, world.pointer.y, 1, 0.08);
    }
  }

  /** Blur + decay so wakes spread out like ripples and fade. */
  private diffuse(dt: number) {
    const { cols, rows, energy, energyTmp: tmp } = this;
    const decay = Math.exp(-dt * 1.5);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const l = c > 0 ? energy[i - 1] : energy[i];
        const rt = c < cols - 1 ? energy[i + 1] : energy[i];
        const u = r > 0 ? energy[i - cols] : energy[i];
        const d = r < rows - 1 ? energy[i + cols] : energy[i];
        tmp[i] = (energy[i] * 4 + l + rt + u + d) * 0.125 * decay;
      }
    }
    this.energy = tmp;
    this.energyTmp = energy;
  }

  // ── creatures ──────────────────────────────────────────────────────────

  /**
   * Classify one point against the current creature (spine/arc already built).
   * Body coordinates: s along the spine (0 snout → 1 tail), v across it.
   * Writes hit* fields and returns whether the point is on the body.
   */
  private sampleBody(px: number, py: number, L: number) {
    const { spine, arc } = this;
    const N = SPINE_NODES;
    let best = Infinity;
    let bestS = 0;
    let bestSign = 1;
    let bestNx = 0;
    let bestNy = 0;
    for (let k = 0; k < N - 1; k++) {
      const ax = spine[k * 2];
      const ay = spine[k * 2 + 1];
      const sx = spine[(k + 1) * 2] - ax;
      const sy = spine[(k + 1) * 2 + 1] - ay;
      const len2 = sx * sx + sy * sy || 1;
      const u = clamp(((px - ax) * sx + (py - ay) * sy) / len2, 0, 1);
      const qx = ax + sx * u;
      const qy = ay + sy * u;
      const d2 = (px - qx) ** 2 + (py - qy) ** 2;
      if (d2 < best) {
        best = d2;
        const len = Math.sqrt(len2);
        bestS = (arc[k] + u * len) / this.arcTotal;
        bestSign = sx * (py - ay) - sy * (px - ax) >= 0 ? 1 : -1;
        bestNx = (-sy / len) * bestSign;
        bestNy = (sx / len) * bestSign;
      }
    }

    const a = Math.sqrt(best);
    const s = bestS;
    const u = s * L;
    const shape = this.def.shape;
    const w = shape.halfWidth(s) * L;
    this.hitDist = a;
    this.hitS = s;
    this.hitV = a * bestSign;

    const head = shape.head;
    if (head && u < L * (head.sweep + head.depth + head.notch)) {
      // Cephalofoil: a wide wing across the snout, its tips swept back toward the eyes,
      // and on a great hammerhead a shallow notch in the middle of the front edge.
      const span = L * head.span;
      const r = a / span;
      const front = L * head.sweep * r * r + L * head.notch * Math.max(0, 1 - r / 0.14);
      // Full depth almost to the tips, so the wing reads as a solid bar rather than a thin line.
      const depth = L * head.depth * (1 - 0.2 * r * r * r * r);
      if (r <= 1 && u >= front && u <= front + depth) {
        this.hitFlag = r > 0.84 ? FLAG_EYE : FLAG_BODY;
        this.hitShade = r > 0.84 ? 0 : 0.62 - 0.2 * r + (u < front + L * 0.012 ? 0.1 : 0);
        this.hitAcross = r;
        return true;
      }
    }

    // A blade is a fin, so past where it joins the stalk it is tried before the body and wins the cell.
    const tail = shape.tail;
    if (tail?.kind === "caudal" && s > 1 - tail.length + 0.03 && this.tailHit(u, a, L, tail)) {
      this.hitFlag = FLAG_FIN;
      return true;
    }
    if (tail?.kind === "heterocercal" && this.bladeAt(px, py, L, tail)) {
      this.hitFlag = FLAG_FIN;
      return true;
    }

    // Past a fluke's notch there is only water between the lobes, so no body is drawn there.
    const inNotch = tail?.kind === "fluke" && s > 1 - tail.notch;
    // A koi's blade takes over from the stalk past its root, so a body cell the blade misses (its rounded
    // tip, or beside it when it sways) is left as water instead of poking out behind or beside the fin.
    const inBlade = tail?.kind === "caudal" && s > 1 - tail.length + 0.03;
    if (a <= w && !inNotch && !inBlade) {
      const across = a / (w || 1);
      // Rounded back lit from the top-left; flanks fall off into shadow.
      const facing = (bestNx * -0.6 + bestNy * -0.8) * across;
      let shade = 0.58 - across * across * 0.42 + facing * 0.26;
      let flag = FLAG_BODY;
      if (s > shape.dorsal[0] && s < shape.dorsal[1] && across < 0.3) {
        // First dorsal fin, catching the light.
        flag = FLAG_RIDGE;
        shade = 1;
      } else if (s > shape.secondDorsal[0] && s < shape.secondDorsal[1] && across < 0.4) {
        shade = Math.max(shade, 0.82);
      } else if (shape.eye && s > shape.eye[0] && s < shape.eye[1] && across > 0.6) {
        flag = FLAG_EYE;
        shade = 0;
      } else if (
        TAXA[this.def.taxon].gillSlits &&
        s > shape.gills[0] &&
        s < shape.gills[1] &&
        across > 0.58
      ) {
        // Five gill slits.
        if (Math.floor(((s - shape.gills[0]) / (shape.gills[1] - shape.gills[0])) * 5) % 2 === 0)
          shade *= 0.45;
      } else if (s < 0.05) {
        // Pale snout tip.
        shade = Math.max(shade, 0.7);
      } else if (this.def.paleRidge?.(s, across)) {
        // Pale ridges along the back, where the species has them.
        shade = Math.max(shade, 0.8);
      } else if (this.marked(s, a * bestSign, L, across)) {
        flag = FLAG_MARK;
      }
      this.hitFlag = flag;
      this.hitShade = shade;
      this.hitAcross = across;
      return true;
    }

    const tip = bestSign > 0 ? this.finTipRight : this.finTipLeft;
    const [p0, p1, p2] = shape.pectoral;
    if (
      shape.paddle
        ? inPaddle(u, a, L * p0, L * p1, L * p2, tip)
        : inTriangle(u, a, L * p0, 0, L * p1, 0, L * p2, tip) &&
          // Falcate (sickle) fins get a concave trailing edge.
          !(
            shape.falcate &&
            inTriangle(u, a, L * p1, 0, L * (p1 + (p2 - p1) * 0.7), tip * 0.3, L * p2, tip)
          )
    ) {
      this.hitFlag = this.marked(s, a * bestSign, L, 0) ? FLAG_MARK : FLAG_FIN;
      this.hitShade = 0.38 + 0.22 * (1 - clamp(a / tip, 0, 1));
      // Fins: distance from the body relative to the fin's tip, 0 at the root and 1 at the tip.
      this.hitAcross = clamp(a / (tip || 1), 0, 1);
      return true;
    }
    const [v0, v1, v2, vr] = shape.pelvic;
    // A zero-reach pelvic (dolphins) is a degenerate triangle that would match every point.
    if (vr > 0 && inTriangle(u, a, L * v0, 0, L * v1, 0, L * v2, L * vr)) {
      this.hitFlag = FLAG_FIN;
      this.hitShade = 0.36;
      this.hitAcross = clamp(a / (L * vr), 0, 1);
      return true;
    }
    if (tail && tail.kind !== "heterocercal") {
      if (!this.tailHit(u, a, L, tail)) return false;
      this.hitFlag = FLAG_FIN;
      return true;
    }
    return false;
  }

  /**
   * Whether a point (u along, a across) is on a fluke or a koi's caudal blade, both of which end at the body tip.
   * Sets hitShade for the fin; the caller sets the flag.
   */
  private tailHit(u: number, a: number, L: number, tail: TailShape & { kind: "fluke" | "caudal" }) {
    if (tail.kind === "fluke") {
      // A swept-back wing on each side of the centre line, notched at the middle.
      const u0 = L * (1 - tail.length);
      const notchU = L * (1 - tail.notch);
      const halfSpan = L * tail.span * this.tailBeat;
      if (!inTriangle(u, a, u0, 0, L, halfSpan, notchU, 0)) return false;
      this.hitShade = 0.4 + 0.15 * this.tailLift;
      this.hitAcross = clamp(a / (L * tail.span), 0, 1);
      return true;
    }
    return this.bladeHit(u - L, this.hitV, tail, L, L);
  }

  /**
   * Whether a heterocercal blade covers a point. The blade lies on the spine's end, extended straight
   * past the body tip, so the point is measured in the tail's own frame. `L` is the body length.
   */
  private bladeAt(px: number, py: number, L: number, tail: TailShape & { kind: "heterocercal" }) {
    const rx = px - this.tailX;
    const ry = py - this.tailY;
    const along = rx * this.tailDx + ry * this.tailDy;
    const off = rx * -this.tailDy + ry * this.tailDx;
    return this.bladeHit(along, off, tail, L, L / (1 - tail.upper));
  }

  /**
   * A tail blade, seen edge-on from above. `along` is the distance from the body tip (negative toward the
   * snout) and `v` the signed distance from the axis (the same side convention as hitV). The blade starts
   * `length` of the body behind the tip and widens to its tip; in natural mode the beat sways it side to
   * side, the shift growing from nothing at the root to `twist` of the total length at the tip (theme mode
   * widens it by that much instead). A koi's blade ends at the
   * tip, a heterocercal one runs `upper` of the total length past it. Sets hitShade and hitAcross; the
   * caller sets the flag.
   * `L` is the body length and `total` the length the tail width fractions are taken from.
   */
  private bladeHit(
    along: number,
    v: number,
    tail: TailShape & { kind: "caudal" | "heterocercal" },
    L: number,
    total: number,
  ) {
    const base = -tail.length * L;
    const tip = tail.kind === "heterocercal" ? tail.upper * total : 0;
    const k = (along - base) / (tip - base);
    if (k < 0 || k > 1) return false;
    // The blade starts at the peduncle's half-width and widens to the tip.
    const w0 = this.tailW0;
    let hw = w0 + (tail.width * total - w0) * k;
    if (!this.swayTail) hw += tail.twist * total * Math.abs(this.tailLift) * k;
    // The tip is rounded off over its last 12%.
    if (k > 0.88) hw *= Math.sqrt(1 - ((k - 0.88) / 0.12) ** 2);
    // A heterocercal blade is never thinner than half a cell, so it stays visible from above.
    if (tail.kind === "heterocercal") hw = Math.max(hw, this.cw * 0.5);
    // The beat sways the whole blade sideways, trailing the body wave. hitV counts the other way round from
    // the wave's offset, so the blade's centre sits at minus the lift.
    const a = this.swayTail ? Math.abs(v + tail.twist * total * this.tailLift * k) : Math.abs(v);
    if (a > hw) return false;
    this.hitShade = 0.3 + 0.15 * (1 - k);
    this.hitAcross = clamp(a / (hw || 1), 0, 1);
    return true;
  }

  /** Whether a body point (s along, v across) falls on a dark marking. */
  private marked(s: number, v: number, L: number, across: number) {
    return this.def.marking?.(s, v, L, across, this.bodyId) ?? false;
  }

  /**
   * Build a smooth, undulating render spine from the sim spine, then
   * supersample every cell in the creature's bounding box against the shape.
   * Fully covered cells become solid skin; partial cells become edge glyphs.
   */
  private rasterizeCreatures(creatures: Creature[], t: number) {
    const {
      bodyFlag,
      bodyShade,
      bodyKey,
      bodyDepth,
      bodyKind,
      bodyShadow,
      bodyShadowStrength,
      spine,
      arc,
      cw,
      ch,
      cols,
      rows,
    } = this;
    bodyFlag.fill(0);
    bodyShadow.fill(0);
    bodyShadowStrength.fill(0);
    this.bodyCoat.length = 0;
    const natural = this.colors === "natural";
    if (this.order.length !== creatures.length) this.order = new Int16Array(creatures.length);
    drawOrder(creatures, this.order);

    for (let q = 0; q < creatures.length; q++) {
      const sh = creatures[this.order[q]];
      const N = SPINE_NODES;
      const n = sh.nodes;
      // A faster swim sweeps the tail wider in natural mode; theme keeps the cover's classic cap.
      const swim = clamp(sh.speed / 60, 0.4, natural ? 1.7 : 1.4);
      this.def = CREATURES[sh.species];
      const shape = this.def.shape;
      // A heterocercal blade counts toward the length, so the body is shortened to leave room for it:
      // snout to blade tip is sh.length, and L is the body alone.
      const shrink = shape.tail?.kind === "heterocercal" ? 1 - shape.tail.upper : 1;
      const L = sh.length * shrink;
      const undulation = shape.undulation ?? TAXA[this.def.taxon].undulation;
      this.bodyId = sh.id;
      const kindIndex = CREATURE_IDS.indexOf(sh.species);

      // Travelling body wave, growing toward the tail.
      for (let k = 0; k < N; k++) {
        const s = k / (N - 1);
        const a = Math.max(0, k - 1);
        const b = Math.min(N - 1, k + 1);
        let tx = n[a * 2] - n[b * 2];
        let ty = n[a * 2 + 1] - n[b * 2 + 1];
        const tl = Math.hypot(tx, ty) || 1;
        tx /= tl;
        ty /= tl;
        const amp = L * 0.05 * (0.1 + 0.9 * Math.pow(s, 1.8)) * swim * undulation;
        const off = amp * Math.sin(sh.phase - s * 5.2);
        spine[k * 2] = n[0] + (n[k * 2] - n[0]) * shrink - ty * off;
        spine[k * 2 + 1] = n[1] + (n[k * 2 + 1] - n[1]) * shrink + tx * off;
      }
      arc[0] = 0;
      for (let k = 1; k < N; k++) {
        arc[k] =
          arc[k - 1] +
          Math.hypot(spine[k * 2] - spine[(k - 1) * 2], spine[k * 2 + 1] - spine[(k - 1) * 2 + 1]);
      }
      this.arcTotal = arc[N - 1] || 1;
      // The spine's end and the direction past it: where a heterocercal blade starts.
      this.tailX = spine[(N - 1) * 2];
      this.tailY = spine[(N - 1) * 2 + 1];
      const tdx = this.tailX - spine[(N - 2) * 2];
      const tdy = this.tailY - spine[(N - 2) * 2 + 1];
      const tdl = Math.hypot(tdx, tdy) || 1;
      this.tailDx = tdx / tdl;
      this.tailDy = tdy / tdl;
      // How far a heterocercal blade runs past the body tip; 0 for every other tail.
      const ext = sh.length - L;

      // Bank into turns: the inside fin foreshortens, the outside one spreads.
      const bank = clamp(sh.turn * 0.45, -0.35, 0.35);
      const flex = 1 + (shape.finFlap ?? 0.06) * Math.sin(sh.phase * (shape.finFlapRate ?? 0.5));
      const reachFin = shape.pectoral[3];
      this.finTipRight = L * reachFin * flex * (1 - bank);
      this.finTipLeft = L * reachFin * flex * (1 + bank);
      this.tailLift = Math.sin(sh.phase);
      this.tailBeat = 1 + 0.1 * this.tailLift;
      this.swayTail = natural;
      this.tailW0 = shape.tail ? shape.halfWidth(1 - shape.tail.length) * L : 0;

      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (let k = 0; k < N; k++) {
        minX = Math.min(minX, spine[k * 2]);
        maxX = Math.max(maxX, spine[k * 2]);
        minY = Math.min(minY, spine[k * 2 + 1]);
        maxY = Math.max(maxY, spine[k * 2 + 1]);
      }
      const tipX = this.tailX + this.tailDx * ext;
      const tipY = this.tailY + this.tailDy * ext;
      minX = Math.min(minX, tipX);
      maxX = Math.max(maxX, tipX);
      minY = Math.min(minY, tipY);
      maxY = Math.max(maxY, tipY);
      // Padding that covers the widest fin; sharks keep the classic 0.36.
      // Long-finned species pad for the widest fin tip: reach × flap × the outside fin of a full bank.
      // Sharks (reach ≤ 0.26) keep the original 0.36 so their look stays exactly as it was.
      const finReach =
        shape.pectoral[3] > 0.27
          ? Math.max(
              shape.pectoral[3] * (1 + (shape.finFlap ?? 0.06)) * 1.35,
              shape.tail ? tailSpan(shape.tail) : 0,
            )
          : Math.max(shape.pectoral[3], shape.tail ? tailSpan(shape.tail) : 0);
      const reach = Math.max((finReach > 0.34 ? Math.max(0.36, finReach + 0.02) : 0.36) * L, ext);
      const c0 = Math.max(0, Math.floor((minX - reach) / cw));
      const c1 = Math.min(cols - 1, Math.floor((maxX + reach) / cw));
      const r0 = Math.max(0, Math.floor((minY - reach) / ch));
      const r1 = Math.min(rows - 1, Math.floor((maxY + reach) / ch));
      if (c0 > c1 || r0 > r1) continue;

      if (natural) {
        // Each animal's coat goes in bodyCoat; its index is what the cells store.
        const named = this.def.coats;
        const coatName = sh.coat ?? this.def.defaultCoat;
        const coat =
          named && coatName !== undefined && Object.hasOwn(named, coatName)
            ? named[coatName]
            : null;
        this.bodyCoat.push(coat);
        this.rasterizeNatural(sh, L, reach, c0, c1, r0, r1, kindIndex, this.bodyCoat.length - 1, t);
        continue;
      }

      const skipBeyond = reach + Math.hypot(cw, ch);
      const shadowDc = Math.round((L * 0.035) / cw) + 1;
      const shadowDr = Math.round((L * 0.02) / ch) + 1;

      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const x = c * cw;
          const y = r * ch;
          const centerHit = this.sampleBody(x + cw / 2, y + ch / 2, L);
          if (!centerHit && this.hitDist > skipBeyond) continue;
          const flag = this.hitFlag;
          const shade = this.hitShade;
          const s = this.hitS;
          const v = this.hitV;

          let hits = centerHit ? 1 : 0;
          for (let k = 0; k < SUBSAMPLES.length; k += 2) {
            if (this.sampleBody(x + SUBSAMPLES[k] * cw, y + SUBSAMPLES[k + 1] * ch, L)) hits++;
          }
          if (hits === 0) continue;
          const coverage = hits / 5;

          const i = r * cols + c;
          // Body-anchored key so each glyph rides along with the skin.
          const key =
            (hash3(Math.round(s * 52), Math.round(v / (cw * 0.9)), sh.id) * 4294967295) >>> 0;
          bodyKey[i] = key;
          bodyDepth[i] = bodyDepthOf(sh, natural);
          bodyKind[i] = kindIndex;

          if (centerHit && coverage >= 0.6) {
            bodyFlag[i] = flag;
            const flicker = (hash3(c, r, Math.floor(t * 6)) - 0.5) * 0.06;
            bodyShade[i] = clamp(shade + flicker, 0, 1);
            const sc = c + shadowDc;
            const sr = r + shadowDr;
            if (sc < cols && sr < rows) bodyShadow[sr * cols + sc] = 1;
          } else {
            bodyFlag[i] = FLAG_EDGE;
            bodyShade[i] = coverage;
          }
        }
      }
    }
  }

  /**
   * Natural mode: each cell is two half cells, and a half is solid when its centre and at least
   * one side sample hit. Writes the per-half buffers that drawNatural reads.
   */
  private rasterizeNatural(
    sh: Creature,
    L: number,
    reach: number,
    c0: number,
    c1: number,
    r0: number,
    r1: number,
    kindIndex: number,
    creature: number,
    t: number,
  ) {
    const {
      cw,
      ch,
      cols,
      rows,
      bodyFlag,
      bodyShade,
      bodyKey,
      bodyDepth,
      bodyKind,
      bodyCreature,
      halfFlag,
      halfShade,
      halfRegion,
      bodyShadowStrength,
    } = this;
    const coat = this.bodyCoat[creature];
    const skipBeyond = reach + Math.hypot(cw, ch);
    const depth = bodyDepthOf(sh, true);
    const shadowDc = Math.round((L * 0.035 * (0.4 + 1.2 * depth)) / cw) + 1;
    const shadowDr = Math.round((L * 0.02 * (0.4 + 1.2 * depth)) / ch) + 1;
    // Shallow bodies throw a strong shadow, deep ones a faint one.
    const shadowStrength = 0.85 - 0.45 * depth;
    const flickerTick = Math.floor(t * 6);

    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const x = c * cw;
        const y = r * ch;
        const centerHit = this.sampleBody(x + cw / 2, y + ch / 2, L);
        if (!centerHit && this.hitDist > skipBeyond) continue;
        const s = this.hitS;
        const v = this.hitV;

        const i = r * cols + c;
        let hits = 0;
        // Per-half results stay local until the cell is known to hit. Writing the shared
        // buffers on a miss would zero an earlier creature's halves under its bodyFlag.
        let topSolid = false;
        let bottomSolid = false;
        let topFlag = 0;
        let bottomFlag = 0;
        let topShade = 0;
        let bottomShade = 0;
        let topRegion = 0;
        let bottomRegion = 0;
        for (let h = 0; h < 2; h++) {
          const yh = y + ch * (0.25 + 0.5 * h);
          const mid = this.sampleBody(x + cw / 2, yh, L);
          const flag = this.hitFlag;
          const shade = this.hitShade;
          // The mid sample's point, read before the side samples overwrite the hit fields.
          const pointS = this.hitS;
          const pointV = this.hitV;
          const pointAcross = this.hitAcross;
          let sides = 0;
          if (this.sampleBody(x + cw * 0.25, yh, L)) sides++;
          if (this.sampleBody(x + cw * 0.75, yh, L)) sides++;
          hits += sides + (mid ? 1 : 0);

          // A half is solid when its centre and at least one side sample hit.
          if (mid && sides > 0) {
            const flicker = (hash3(c, 2 * r + h, flickerTick) - 0.5) * 0.06;
            const solidShade = clamp(shade + flicker, 0, 1);
            const region = coat ? this.paintRegion(coat, pointS, pointV, pointAcross, flag, L) : 0;
            if (h === 0) {
              topSolid = true;
              topFlag = flag;
              topShade = solidShade;
              topRegion = region;
            } else {
              bottomSolid = true;
              bottomFlag = flag;
              bottomShade = solidShade;
              bottomRegion = region;
            }
          }
        }
        if (hits === 0) continue;

        halfFlag[2 * i] = topSolid ? topFlag : 0;
        halfShade[2 * i] = topShade;
        halfRegion[2 * i] = topRegion;
        halfFlag[2 * i + 1] = bottomSolid ? bottomFlag : 0;
        halfShade[2 * i + 1] = bottomShade;
        halfRegion[2 * i + 1] = bottomRegion;

        // Body-anchored key so each glyph rides along with the skin.
        bodyKey[i] =
          (hash3(Math.round(s * 52), Math.round(v / (cw * 0.9)), sh.id) * 4294967295) >>> 0;
        bodyDepth[i] = bodyDepthOf(sh, true);
        bodyKind[i] = kindIndex;
        bodyCreature[i] = creature;

        if (topSolid || bottomSolid) {
          // The top half wins when both are solid, so the glyph reads from the top.
          bodyFlag[i] = topSolid ? topFlag : bottomFlag;
          bodyShade[i] = topSolid ? topShade : bottomShade;
          const sc = c + shadowDc;
          const sr = r + shadowDr;
          if (sc < cols && sr < rows) {
            const k = sr * cols + sc;
            bodyShadowStrength[k] = Math.max(bodyShadowStrength[k], shadowStrength);
          }
        } else {
          bodyFlag[i] = FLAG_EDGE;
          bodyShade[i] = hits / 6;
        }
      }
    }
  }

  private drawCreatures(t: number) {
    const { ctx, cols, rows, cw, ch, bodyFlag, bodyShade, bodyKey, bodyDepth, bodyKind } = this;
    const n = cols * rows;
    const darkPage = this.palette.mode === "dark";
    for (let i = 0; i < n; i++) {
      const flag = bodyFlag[i];
      if (!flag) continue;
      const col = i % cols;
      const row = (i / cols) | 0;
      const x = col * cw;
      const y = row * ch;
      const key = bodyKey[i];
      const shade = bodyShade[i];
      const dim = 0.7 + 0.3 * bodyDepth[i];
      const def = CREATURES[CREATURE_IDS[bodyKind[i]]];
      const [tr, tg, tb] = def.shape.tint;
      const ink = darkPage ? INK.dark : INK.light;

      // Colours re-roll on a staggered clock so the hide shimmers.
      const tick = Math.floor(t * 2.4 + (key % 997) / 97);
      const roll = hash3(key, tick, 7);

      if (flag === FLAG_EDGE) {
        // Soft, anti-aliased silhouette: no block, just a light glyph.
        const set = shade >= 0.5 ? EDGE_HEAVY : EDGE_LIGHT;
        const g = this.tone((70 + shade * 80) * dim);
        ctx.fillStyle =
          roll < 0.07
            ? ACCENTS[key % ACCENTS.length]
            : `rgb(${Math.round(g * tr)},${Math.round(g * tg)},${Math.min(255, Math.round(g * tb + 6))})`;
        ctx.fillText(set[(key >>> 8) % set.length], x + cw / 2, y + ch / 2 + 1);
        continue;
      }

      let level: number;
      let glyph: string;
      if (flag === FLAG_RIDGE) {
        level = 226;
        glyph = RIDGE_GLYPHS[(key >>> 8) % RIDGE_GLYPHS.length];
      } else if (flag === FLAG_EYE) {
        level = 12;
        glyph = "o";
      } else if (flag === FLAG_MARK) {
        level = 24 + shade * 22;
        glyph = MARK_GLYPHS[(key >>> 8) % MARK_GLYPHS.length];
      } else if (flag === FLAG_FIN) {
        level = 40 + shade * 120;
        glyph = FIN_GLYPHS[(key >>> 8) % FIN_GLYPHS.length];
      } else {
        level = 46 + shade * 160;
        const jitter = ((key >>> 4) % 3) - 1;
        glyph = SKIN_RAMP[clamp(Math.floor((1 - shade) * 8.99) + jitter, 0, SKIN_RAMP.length - 1)];
      }
      // Depth dims toward the background first, then greys invert in light mode.
      level = this.tone(level * dim);
      // Tinted per species; the classic tint is a cool blue-grey, like a back seen through deep water.
      ctx.fillStyle = `rgb(${Math.min(255, Math.round(level * tr))},${Math.min(255, Math.round(level * tg))},${Math.min(255, Math.round(level * tb + 4))})`;
      ctx.fillRect(x + 1, y + 1, cw - 1, ch - 1);

      let color: string;
      if (flag === FLAG_EYE) color = ink.eye;
      else if (flag === FLAG_MARK) {
        const m = this.tone(70);
        color = `rgb(${Math.round(m * tr)},${Math.round(m * tg)},${Math.round(m * tb)})`;
      } else if (roll < 0.09) color = ACCENTS[key % ACCENTS.length];
      else if (roll < 0.13) color = ink.bright;
      else color = shade > 0.55 ? ink.ink : ink.inkSoft;
      ctx.fillStyle = color;
      ctx.fillText(glyph, x + cw / 2, y + ch / 2 + 1);
    }
  }

  /** Region index for one solid half of a coat species, painted with the reused PaintPoint. */
  private paintRegion(coat: Coat, s: number, v: number, across: number, flag: number, L: number) {
    const p = this.paintPoint;
    p.s = s;
    p.v = v;
    p.L = L;
    p.across = across;
    p.flag = flag;
    p.id = this.bodyId;
    const region = coat.paint ? coat.paint(p) : 0;
    return Math.max(0, Math.min(coat.regions.length - 1, region | 0));
  }

  /** A coat region at a lighting shade (0–1), through water at depth: a ramp lookup, then the cached style. */
  private coatStyle(coat: Coat, region: number, shade: number, depth: number) {
    let ramps = this.rampCache.get(coat);
    if (!ramps) {
      ramps = buildCoatRamps(coat, this.bgL, this.palette.mode === "dark");
      this.rampCache.set(coat, ramps);
    }
    const ramp = ramps[region];
    const k = Math.round(clamp(shade, 0, 1) * (COAT_STEPS - 1)) * 3;
    return this.attenuatedStyle(ramp[k], ramp[k + 1], ramp[k + 2], depth);
  }

  /**
   * Natural colour: the tinted level, pulled toward the page background by water depth, as a
   * cached fillStyle. `bAdd` lifts blue as the theme path does for skin.
   */
  private naturalStyle(level: number, tint: [number, number, number], bAdd: number, depth: number) {
    return this.attenuatedStyle(
      Math.min(255, level * tint[0]),
      Math.min(255, level * tint[1]),
      Math.min(255, level * tint[2] + bAdd),
      depth,
    );
  }

  /** An rgb colour (0–255) seen through water at depth, as a cached fillStyle. */
  private attenuatedStyle(r0: number, g0: number, b0: number, depth: number) {
    const zi = depthIndex(depth);
    const target = this.hazeTarget;
    const { r: absR, g: absG, b: absB, veil: haze } = this.water;
    const r = attenuateChannel(r0, target[0], absR[zi], haze[zi]);
    const g = attenuateChannel(g0, target[1], absG[zi], haze[zi]);
    const b = attenuateChannel(b0, target[2], absB[zi], haze[zi]);
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    let style = this.styleCache[key];
    if (style === undefined) {
      style = `rgb(${(r >> 3) * 8 + 4},${(g >> 3) * 8 + 4},${(b >> 3) * 8 + 4})`;
      this.styleCache[key] = style;
    }
    return style;
  }

  /**
   * Natural mode draw: each solid half is a half-height block in its own colour, and a glyph
   * only where both halves are solid. Edge cells keep the light edge glyph.
   */
  private drawNatural(t: number) {
    const {
      ctx,
      cols,
      rows,
      cw,
      ch,
      bodyFlag,
      bodyShade,
      bodyKey,
      bodyDepth,
      bodyKind,
      bodyCreature,
      halfFlag,
      halfShade,
      halfRegion,
    } = this;
    const n = cols * rows;
    const topH = Math.floor(ch / 2);
    for (let i = 0; i < n; i++) {
      const flag = bodyFlag[i];
      if (!flag) continue;
      const col = i % cols;
      const row = (i / cols) | 0;
      const x = col * cw;
      const y = row * ch;
      const key = bodyKey[i];
      const depth = bodyDepth[i];
      const def = CREATURES[CREATURE_IDS[bodyKind[i]]];
      const tint = def.shape.tint;
      const tick = Math.floor(t * 2.4 + (key % 997) / 97);
      const roll = hash3(key, tick, 7);
      // Coat species (koi) paint by region and show no accent shimmer.
      const coat = this.bodyCoat[bodyCreature[i]] ?? null;

      if (flag === FLAG_EDGE) {
        const shade = bodyShade[i];
        const set = shade >= 0.5 ? EDGE_HEAVY : EDGE_LIGHT;
        ctx.fillStyle =
          roll < 0.07 && !coat
            ? ACCENTS[key % ACCENTS.length]
            : this.naturalStyle(70 + shade * 80, tint, 6, depth);
        ctx.fillText(set[(key >>> 8) % set.length], x + cw / 2, y + ch / 2 + 1);
        continue;
      }

      // Top half is h = 0. The bottom takes the rest of the cell so the halves tile exactly.
      for (let h = 0; h < 2; h++) {
        const j = 2 * i + h;
        if (!halfFlag[j]) continue;
        // Eyes stay dark whatever the coat, as on the sharks.
        ctx.fillStyle =
          coat && halfFlag[j] !== FLAG_EYE
            ? this.coatStyle(
                coat,
                halfRegion[j],
                halfShade[j],
                halfFlag[j] === FLAG_FIN ? depth - COAT_FIN_VEIL : depth,
              )
            : this.naturalStyle(halfLevel(halfFlag[j], halfShade[j]), tint, 4, depth);
        if (h === 0) ctx.fillRect(x + 1, y + 1, cw - 1, topH);
        else ctx.fillRect(x + 1, y + 1 + topH, cw - 1, ch - 1 - topH);
      }
      // A cell with one solid half is drawn as a smooth block edge, with no glyph.
      if (!halfFlag[2 * i] || !halfFlag[2 * i + 1]) continue;

      const topFlag = halfFlag[2 * i];
      const topRegion = halfRegion[2 * i];
      const shade = halfShade[2 * i];
      let glyph: string;
      if (topFlag === FLAG_RIDGE) {
        glyph = RIDGE_GLYPHS[(key >>> 8) % RIDGE_GLYPHS.length];
      } else if (topFlag === FLAG_EYE) {
        glyph = "o";
      } else if (topFlag === FLAG_MARK) {
        glyph = MARK_GLYPHS[(key >>> 8) % MARK_GLYPHS.length];
      } else if (topFlag === FLAG_FIN) {
        glyph = FIN_GLYPHS[(key >>> 8) % FIN_GLYPHS.length];
      } else {
        const jitter = ((key >>> 4) % 3) - 1;
        glyph = SKIN_RAMP[clamp(Math.floor((1 - shade) * 8.99) + jitter, 0, SKIN_RAMP.length - 1)];
      }

      let color: string;
      if (topFlag === FLAG_EYE) color = INK.dark.eye;
      else if (topFlag === FLAG_MARK) color = this.naturalStyle(70, tint, 0, depth);
      else if (coat) {
        if (coat.glint && roll < 0.09) color = COAT_GLINT[key % COAT_GLINT.length];
        else if (coat.regions[topRegion][0] > 0.55) {
          color = shade > 0.55 ? INK.dark.ink : INK.dark.inkSoft;
        } else color = COAT_LIGHT_INK;
      } else if (roll < 0.09) color = ACCENTS[key % ACCENTS.length];
      else if (roll < 0.13) color = INK.dark.bright;
      else color = shade > 0.55 ? INK.dark.ink : INK.dark.inkSoft;
      ctx.fillStyle = color;
      ctx.fillText(glyph, x + cw / 2, y + ch / 2 + 1);
    }
  }

  // ── fish, dots ──────────────────────────────────────────────────────

  /**
   * Snap each fish to a cell and bucket it by brightness: far fish are dim,
   * near fish brighter, and turning or panicking fish glint. Nearer fish
   * claim a cell first when two land in the same one.
   */
  private markFish(world: World) {
    const { fishStamp, fishBuckets, bodyFlag } = this;
    const frame = ++this.frameId;
    for (const bucket of fishBuckets) bucket.length = 0;
    for (let pass = 0; pass < 2; pass++) {
      for (const f of world.fish) {
        if (!f.alive || (f.depth > 0.78 ? 0 : 1) !== pass) continue;
        const i = this.cellIndex(f.x, f.y);
        if (i < 0 || fishStamp[i] === frame || bodyFlag[i]) continue;
        fishStamp[i] = frame;
        const glint = clamp(Math.abs(f.turn) / 3.5, 0, 1);
        const v = 0.3 + (0.4 * (f.depth - 0.55)) / 0.45 + 0.3 * Math.max(glint, f.alarm);
        fishBuckets[clamp(Math.floor(v * FISH_ALPHAS.length), 0, FISH_ALPHAS.length - 1)].push(i);
      }
    }
  }

  private drawFish() {
    const { ctx, cw, ch, cols, fishBuckets } = this;
    for (let b = 0; b < fishBuckets.length; b++) {
      const bucket = fishBuckets[b];
      if (!bucket.length) continue;
      ctx.fillStyle = this.fishStyles[b];
      for (const i of bucket) {
        ctx.fillText("-", (i % cols) * cw + cw / 2, ((i / cols) | 0) * ch + ch / 2 + 1);
      }
    }
  }

  /**
   * Every cell's dot twinkles on its own clock, is modulated by slow
   * light bands, and flares cyan where the wake field is strong.
   * Dots are bucketed by colour/alpha so each bucket is one fillStyle.
   */
  private drawDots(t: number) {
    const {
      ctx,
      cols,
      rows,
      cw,
      ch,
      dotKind,
      dotPhase,
      dotFreq,
      energy,
      bodyFlag,
      bodyShadow,
      bodyShadowStrength,
      fishStamp,
      frameId,
      bucketStarts: starts,
      bucketCursor: cursor,
    } = this;
    const { bucketOf, bucketOrder, bucketCounts } = this;
    const surface = this.colors === "natural" && this.surface && !this.pondScene;
    const n = cols * rows;
    const SKIP = bucketCounts.length - 1;
    bucketCounts.fill(0);

    for (let i = 0; i < n; i++) {
      const e = energy[i];
      const kind = dotKind[i];
      if (bodyFlag[i] || fishStamp[i] === frameId || (kind === 0 && e < 0.45)) {
        bucketOf[i] = SKIP;
        continue;
      }
      let bucket: number;
      if (e > 0.45) {
        const level = clamp(Math.floor((e - 0.45) * 5), 0, ALPHA_LEVELS - 1);
        bucket = WAKE * ALPHA_LEVELS + level;
      } else {
        const col = i % cols;
        const row = (i / cols) | 0;
        // Dots stay bright and crisp; the twinkle is a gentle breathe, not a fade.
        const twinkle = 0.5 + 0.5 * Math.sin(t * dotFreq[i] + dotPhase[i]);
        const bands =
          0.85 + 0.15 * Math.sin(col * 0.11 + t * 0.35) * Math.sin(row * 0.17 - t * 0.27);
        let v = clamp((0.55 + 0.45 * twinkle) * bands + e * 2, 0, 1);
        // Natural water with the surface on: the swell brightens the dots on the faces that tilt toward the sun.
        if (surface) v *= clamp(1 + 0.15 * this.sea.z[i], 0.6, 1.4);
        if (bodyShadow[i]) v *= 0.2;
        else if (bodyShadowStrength[i] > 0) v *= 1 - bodyShadowStrength[i];
        bucket =
          (kind - 1) * ALPHA_LEVELS + clamp(Math.floor(v * ALPHA_LEVELS), 0, ALPHA_LEVELS - 1);
      }
      bucketOf[i] = bucket;
      bucketCounts[bucket]++;
    }

    // Counting sort cells by bucket.
    starts[0] = 0;
    for (let b = 1; b < bucketCounts.length; b++) starts[b] = starts[b - 1] + bucketCounts[b - 1];
    cursor.set(starts);
    for (let i = 0; i < n; i++) {
      const b = bucketOf[i];
      if (b !== SKIP) bucketOrder[cursor[b]++] = i;
    }

    const small = Math.max(2, Math.round(cw * 0.19));
    const large = small + 1;
    for (let b = 0; b < SKIP; b++) {
      const count = bucketCounts[b];
      if (!count) continue;
      ctx.fillStyle = this.dotStyles[b];
      const size = b >= WAKE * ALPHA_LEVELS ? large : small;
      const start = starts[b];
      for (let k = start; k < start + count; k++) {
        const i = bucketOrder[k];
        const col = i % cols;
        const row = (i / cols) | 0;
        // Sit the dot low-right in its cell, as in the reference.
        ctx.fillRect(
          Math.round(col * cw + cw * 0.66 - size / 2),
          Math.round(row * ch + ch * 0.64 - size / 2),
          size,
          size,
        );
      }
    }
  }

  // ── water surface: the sea, rings, spray ──────────────────────────

  /**
   * The open sea from above, over the empty water cells: a faint swell tint, then the sun glitter,
   * windrow dashes and whitecap foam on top. Empty means no body or fish, which are both drawn over it.
   */
  private drawSea(t: number) {
    const { ctx, cols, rows, cw, ch, energy, bodyFlag, fishStamp, frameId, sea } = this;
    const { z, streak, foamGlyph, foamLevel } = sea;
    const mode = this.palette.mode;
    // The swell tint: one alpha level per slope band. A run of cells on the same level is one fillRect.
    for (let r = 0; r < rows; r++) {
      let runStart = 0;
      let runStyle = "";
      for (let c = 0; c <= cols; c++) {
        let style = "";
        if (c < cols) {
          const i = r * cols + c;
          const v = z[i];
          const open = !(bodyFlag[i] || energy[i] > 0.45 || fishStamp[i] === frameId);
          if (open && v > SWELL_START) {
            const level = Math.floor(((v - SWELL_START) / SWELL_SPAN) * SWELL_LEVELS);
            style = this.swellLit[clamp(level, 0, SWELL_LEVELS - 1)];
          } else if (open && v < -SWELL_START) {
            const level = Math.floor(((-v - SWELL_START) / SWELL_SPAN) * SWELL_LEVELS);
            style = this.swellShade[clamp(level, 0, SWELL_LEVELS - 1)];
          }
        }
        if (style !== runStyle) {
          if (runStyle !== "") {
            ctx.fillStyle = runStyle;
            ctx.fillRect(runStart * cw, r * ch, (c - runStart) * cw, ch);
          }
          runStart = c;
          runStyle = style;
        }
      }
    }
    // Foam, sparkles and windrow dashes, drawn as text over the tint. Foam wins a cell over a sparkle, which wins over a dash.
    const tick = Math.floor(t * GLINT_TICK);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        if (bodyFlag[i] || energy[i] > 0.45 || fishStamp[i] === frameId) {
          continue;
        }
        const x = (c + 0.5) * cw;
        const y = (r + 0.5) * ch + 1;
        if (foamGlyph[i]) {
          ctx.fillStyle = this.foamStyles[foamLevel[i]];
          ctx.fillText(FOAM_GLYPHS[foamGlyph[i]], x, y);
        } else if (sea.sparkle(c, r, t)) {
          // A sparkle is mostly a dot, sometimes a tick or backtick, and rarely a star (dark pages only).
          const pick = hash3(c, r, tick + 5);
          let glyph = "·";
          if (mode === "dark" && hash3(c, r, tick + 7) < 1 / GLINT_STAR) glyph = "*";
          else if (pick < 0.25) glyph = pick < 0.125 ? "'" : "`";
          const level = Math.floor(hash3(c, r, tick + 8) * this.glintStyles.length);
          ctx.fillStyle = this.glintStyles[level];
          ctx.fillText(glyph, x, y);
        } else if (streak[i]) {
          ctx.fillStyle = this.streakStyles[streak[i] - 1];
          ctx.fillText(hash3(c, r, 3) < 0.5 ? "." : ",", x, y);
        }
      }
    }
  }

  /** One spray droplet at its cell, fading with age01. Spray draws over the animals. */
  private drawParticle(x: number, y: number, age01: number) {
    const { ctx, cw, ch, cols } = this;
    const i = this.cellIndex(x, y);
    if (i < 0) return;
    const level = clamp(Math.floor((1 - age01) * ALPHA_LEVELS), 0, ALPHA_LEVELS - 1);
    const glyph = age01 < 0.25 ? "*" : age01 < 0.5 ? "," : age01 < 0.8 ? "." : "'";
    ctx.fillStyle = this.particleStyles[level];
    ctx.fillText(glyph, (i % cols) * cw + cw / 2, ((i / cols) | 0) * ch + ch / 2 + 1);
  }

  /**
   * A surface ring. On natural water with the surface on it is broken and wobbles like a real splash;
   * theme colours and `surface: false` keep the plain circle, whose draw calls are locked by tests.
   */
  private drawRing(x: number, y: number, r: number, alpha: number, seed: number, age: number) {
    if (this.colors === "natural" && this.surface) this.drawWaterRing(x, y, r, alpha, seed, age);
    else this.drawCircleRing(x, y, r, alpha);
  }

  /**
   * An irregular ring: the radius wobbles with two smooth harmonics, and the arc has gaps where a
   * second noise dips. The ocean ring drifts downwind; a still pond's stays put. `seed` (0 to 1) fixes
   * its shape, so the ring keeps the same breaks as it grows.
   */
  private drawWaterRing(x: number, y: number, r: number, alpha: number, seed: number, age: number) {
    const { ctx, cw, ch, cols, bodyFlag, padMask, ringStyles } = this;
    const level = clamp(Math.floor(alpha * ALPHA_LEVELS), 0, ALPHA_LEVELS - 1);
    ctx.fillStyle = ringStyles[level];
    const pond = this.pondScene;
    const wobble = pond ? RING_WOBBLE_POND : RING_WOBBLE;
    const gap = pond ? RING_GAP_POND : RING_GAP;
    const cx = pond ? x : x + this.sea.windX * RING_DRIFT * age;
    const cy = pond ? y : y + this.sea.windY * RING_DRIFT * age;
    const p0 = ringPhase(seed, 0);
    const p1 = ringPhase(seed, 1);
    const p2 = ringPhase(seed, 2);
    const q0 = ringPhase(seed, 3);
    const q1 = ringPhase(seed, 4);
    const q2 = ringPhase(seed, 5);
    const n = Math.max(8, Math.round((TAU * r) / cw));
    const seedCell = Math.floor(seed * 4096);
    let last = -1;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU;
      // Gap noise in [0, 1]: the arc is drawn where it is above `gap`.
      const openness =
        0.5 +
        0.25 * (Math.sin(3 * a + q0) + 0.6 * Math.sin(4 * a + q1) + 0.4 * Math.sin(7 * a + q2));
      if (openness < gap) continue;
      const wave = Math.sin(2 * a + p0) + 0.6 * Math.sin(3 * a + p1) + 0.4 * Math.sin(5 * a + p2);
      const rr = r * (1 + (wobble * wave) / 1.4);
      const i = this.cellIndex(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      if (i === last) continue;
      last = i;
      if (i < 0 || bodyFlag[i] || padMask[i]) continue;
      // Glyphs are dots, ticks, backticks and commas; a bright part may use a colon. Faded parts are dots.
      const pick = hash3(k, seedCell, 5);
      let glyph: string;
      if (alpha < 0.35) glyph = ".";
      else if (alpha > 0.6 && pick < 0.25) glyph = ":";
      else glyph = RING_GLYPHS[Math.floor(hash3(k, seedCell, 6) * RING_GLYPHS.length)];
      ctx.fillText(glyph, (i % cols) * cw + cw / 2, ((i / cols) | 0) * ch + ch / 2 + 1);
    }
  }

  /** A plain surface ring: about one glyph per cell along its circumference, in the wake colour. */
  private drawCircleRing(x: number, y: number, r: number, alpha: number) {
    const { ctx, cw, ch, cols, bodyFlag, padMask, ringStyles } = this;
    const level = clamp(Math.floor(alpha * ALPHA_LEVELS), 0, ALPHA_LEVELS - 1);
    const faded = alpha < 0.35;
    ctx.fillStyle = ringStyles[level];
    const n = Math.max(8, Math.round((2 * Math.PI * r) / cw));
    let last = -1;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const sin = Math.sin(a);
      const cos = Math.cos(a);
      const i = this.cellIndex(x + cos * r, y + sin * r);
      if (i === last) continue;
      last = i;
      if (i < 0 || bodyFlag[i] || padMask[i]) continue;
      // Glyph from the tangent, so the samples read as a circle: a dash at the top and bottom, brackets at
      // the sides, slashes between. The faded outer part dissolves into dots.
      let glyph: string;
      if (faded) glyph = "·";
      else if (Math.abs(sin) > 0.92) glyph = "-";
      else if (Math.abs(cos) > 0.92) glyph = cos < 0 ? "(" : ")";
      else glyph = sin * cos > 0 ? "/" : "\\";
      ctx.fillText(glyph, (i % cols) * cw + cw / 2, ((i / cols) | 0) * ch + ch / 2 + 1);
    }
  }
}
