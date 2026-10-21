/**
 * Pond plants: lily pads, water lilies and duckweed floating on still water. Render-side only, so the world rng
 * never sees them. Layout draws from hash3 on a seed made from the canvas size, so the same size gives the same
 * pond. Typed arrays are sized in layout(); step, the pushes and the draw passes allocate nothing.
 */
import { clamp, hash3, oklchToRgb } from "./math";

type OKLCH = [number, number, number];

const SALT = 0x51a7;
const TAU = Math.PI * 2;
/** Pads: one per this many px² of canvas, clamped to PAD_MIN..PAD_MAX. */
const PAD_AREA = 60000;
const PAD_MIN = 6;
const PAD_MAX = 14;
/** Pads' summed disc area is capped at this share of the canvas, so small canvases with big koi stay open. */
const PAD_COVER = 0.08;
/** Pad radius in koi lengths, and the margin a pad keeps from the canvas edge (in radii). */
const PAD_R_MIN = 0.12;
const PAD_R_SPAN = 0.1;
const PAD_MARGIN = 0.5;
const PAD_TRIES = 20;
/** Pads turn at up to this many rad/s. */
const PAD_SPIN = 0.03;
/** Every pad has a 30° V-notch from the centre to the rim: 15° either side of its centreline. */
const NOTCH_COS = Math.cos((15 * Math.PI) / 180);
/** Veins: 7 to 9 spokes at even angles, skipping the notch. A cell is on a spoke within VEIN_HALF cells of it, past VEIN_INNER radii. */
const SPOKES_MIN = 7;
const SPOKES_MAX = 9;
const SPOKE_NOTCH_CLEAR = 0.3;
const VEIN_HALF = 0.5;
const VEIN_INNER = 0.2;
/** Body shading: inner below INNER_EDGE radii, mid below MID_EDGE, outer beyond. Jitter moves a cell one step. */
const INNER_EDGE = 0.4;
const MID_EDGE = 0.75;
/** About one pad in three carries a water lily, 0.3 radii out opposite the notch. 80% of lilies are white. */
const FLOWER_CHANCE = 0.25;
const FLOWER_REACH = 0.3;
const FLOWER_WHITE_CHANCE = 0.8;
/** The lily's 3 by 3 cells: row -1, row 0 (the stamen `@` in the centre), and row +1. */
const FLOWER_ROWS = ["\\|/", "*@*", "/'\\"];
/** Duckweed: 4 to 7 patches of 6 to 16 fronds, each patch 0.06 to 0.14 koi lengths across. */
const PATCH_MIN = 4;
const PATCH_MAX = 7;
const FROND_MIN = 6;
const FROND_MAX = 16;
const PATCH_R_MIN = 0.06;
const PATCH_R_SPAN = 0.08;
/** Loose fronds: 10 to 20 single fronds that drift alone. */
const LOOSE_MIN = 10;
const LOOSE_MAX = 20;
/** Duckweed follows the wind at this multiple of the pad speed. */
const DUCK_SPEED = 1.3;
/** The slow wind drift, px/s: vx = WIND_X sin(RATE t + phase), vy = WIND_Y cos(RATE t + phase). */
const WIND_X = 2.2;
const WIND_X_RATE = 0.05;
const WIND_Y = 1.6;
const WIND_Y_RATE = 0.037;
/** A splash reaches PUSH_REACH_R radii plus PUSH_REACH_SIZE body lengths, and gives PUSH_SPEED px/s. */
const PUSH_SPEED = 14;
const PUSH_DECAY = 1.5;
const PUSH_REACH_R = 1.4;
const PUSH_REACH_SIZE = 0.4;
/** Pads drift back from the margins: px/s² per px past the margin. */
const EDGE_SPRING = 6;
/** A koi pushes plants aside: they take this share of its velocity, scaled by how deep the overlap is. */
const WAKE_GAIN = 0.6;
/** Pads and patches are never pushed faster than this, px/s. The decay then brings them back to the wind. */
const PAD_MAX_SPEED = 40;
/** Sub-cell sample points (x, y pairs) for pad coverage, as in the renderer. */
const SUB = [0.25, 0.3, 0.75, 0.3, 0.25, 0.72, 0.75, 0.72];
/** Shadow offset from the pad centre, in radii. The shadow falls on the floor. */
const SHADOW_DX = 0.18;
const SHADOW_DY = 0.28;
/** The shadow is black: the darker of black and half the page background is always black. */
const SHADOW_ALPHA = { dark: 0.14, light: 0.08 };
// Plant colours in OKLCH, converted once in setPalette.
const BODY_INNER: OKLCH = [0.41, 0.09, 146];
const BODY_MID: OKLCH = [0.46, 0.1, 142];
const BODY_OUTER: OKLCH = [0.5, 0.105, 140];
const RIM: OKLCH = [0.54, 0.1, 138];
const RIM_INK: OKLCH = [0.38, 0.08, 142];
const VEIN_INK: OKLCH = [0.32, 0.08, 148];
const PETAL_WHITE: OKLCH = [0.96, 0.015, 95];
// White petals would vanish on a white page; there they read as cream with a faint pink blush.
const PETAL_WHITE_LIGHT: OKLCH = [0.78, 0.05, 60];
const PETAL_PINK: OKLCH = [0.82, 0.09, 350];
const STAMEN: OKLCH = [0.85, 0.16, 95];
const DUCK: OKLCH = [0.74, 0.17, 128];
const DUCK_DARK: OKLCH = [0.66, 0.15, 132];

function css(c: OKLCH) {
  const [r, g, b] = oklchToRgb(c[0], c[1], c[2]);
  return `rgb(${r},${g},${b})`;
}

/** Vein glyph for a cell's direction from the pad centre: a dash, a bar, or a slash. */
function veinGlyph(dx: number, dy: number) {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax > 2.4 * ay) return "-";
  if (ay > 2.4 * ax) return "|";
  return dx * dy > 0 ? "\\" : "/";
}

/** Caps a body's speed at PAD_MAX_SPEED. */
function capSpeed(ax: Float64Array, ay: Float64Array, i: number) {
  const s = Math.hypot(ax[i], ay[i]);
  if (s > PAD_MAX_SPEED) {
    ax[i] *= PAD_MAX_SPEED / s;
    ay[i] *= PAD_MAX_SPEED / s;
  }
}

/** Moves one body in a splash: a radial kick of PUSH_SPEED if it lies within reach of (x, y). */
function kick(
  px: number,
  py: number,
  vx: Float64Array,
  vy: Float64Array,
  i: number,
  x: number,
  y: number,
  reach: number,
) {
  const dx = px - x;
  const dy = py - y;
  const d = Math.hypot(dx, dy);
  if (d > reach) return;
  // A push at the exact centre goes along +x.
  const ux = d > 0 ? dx / d : 1;
  const uy = d > 0 ? dy / d : 0;
  vx[i] += ux * PUSH_SPEED;
  vy[i] += uy * PUSH_SPEED;
  capSpeed(vx, vy, i);
}

/**
 * A koi's wake on one body: within radius + r, the body takes WAKE_GAIN of the koi's velocity, plus the
 * same amount outward from the koi, scaled by the overlap. Its speed is then capped at PAD_MAX_SPEED.
 */
function nudge(
  px: number,
  py: number,
  r: number,
  x: number,
  y: number,
  vx: number,
  vy: number,
  radius: number,
  ax: Float64Array,
  ay: Float64Array,
  i: number,
) {
  const reach = radius + r;
  const dx = px - x;
  const dy = py - y;
  const d = Math.hypot(dx, dy);
  if (d >= reach) return;
  const gain = (WAKE_GAIN * (reach - d)) / reach;
  const speed = Math.hypot(vx, vy);
  const ux = d > 0 ? dx / d : 1;
  const uy = d > 0 ? dy / d : 0;
  ax[i] += (vx + ux * speed) * gain;
  ay[i] += (vy + uy * speed) * gain;
  capSpeed(ax, ay, i);
}

/** True when cell (col, row)'s centre lies outside the disc of radius rad centred at (cx, cy). */
function outsideDisc(
  col: number,
  row: number,
  cx: number,
  cy: number,
  rad: number,
  cw: number,
  ch: number,
) {
  const dx = (col + 0.5) * cw - cx;
  const dy = (row + 0.5) * ch - cy;
  return dx * dx + dy * dy > rad * rad;
}

/** Wraps a coordinate that has drifted past one edge back in from the other, by a body of radius R. */
function wrap(p: number, span: number, R: number) {
  if (p < -R) return p + span + 2 * R;
  if (p > span + R) return p - span - 2 * R;
  return p;
}

/**
 * The pond's floating plants, drawn over the water. Pads are opaque: each has a rim, a three-shade body,
 * veins on spokes, a centre `o`, and sometimes a water lily. Koi that cruise shallow push pads aside; deeper
 * koi pass underneath and are hidden. Duckweed drifts in patches and loose fronds on the same wind.
 *
 * Call layout() on resize, then per frame: pushFrom() per koi, step(), and drawShadows() and drawPlants() in
 * the render. Splashes call push().
 */
export class PondSurface {
  /** Pads in use. The arrays hold the most a canvas can take; the first padCount are live. */
  padCount = 0;
  padX = new Float64Array(0);
  padY = new Float64Array(0);
  padR = new Float64Array(0);
  /** Rotation and spin of each pad, rad and rad/s. */
  padRot = new Float64Array(0);
  padSpin = new Float64Array(0);
  /** Notch centreline, the lily's direction (opposite the notch), and the spokes' start angle and count. */
  padNotch = new Float64Array(0);
  padFlowerAng = new Float64Array(0);
  padSpokeBase = new Float64Array(0);
  padSpokeN = new Uint8Array(0);
  /** 1 when the pad carries a water lily; 1 when that lily is white (else pink). */
  padFlower = new Uint8Array(0);
  padFlowerWhite = new Uint8Array(0);
  /** Push velocity per pad, px/s. It decays, and the wind is added on top. */
  padVx = new Float64Array(0);
  padVy = new Float64Array(0);
  /** Duckweed patches in use: centres, radii and push velocities. */
  patchCount = 0;
  patchX = new Float64Array(0);
  patchY = new Float64Array(0);
  patchR = new Float64Array(0);
  patchVx = new Float64Array(0);
  patchVy = new Float64Array(0);
  /** Fronds in patches: the patch each belongs to, its offset from the centre, its glyph (0 `°`, 1 `·`) and its green (0 light, 1 dark). */
  frondCount = 0;
  frondPatch = new Uint8Array(0);
  frondDx = new Float32Array(0);
  frondDy = new Float32Array(0);
  frondGlyph = new Uint8Array(0);
  frondShade = new Uint8Array(0);
  /** Loose fronds that drift alone: position, push velocity, glyph and green. */
  looseCount = 0;
  looseX = new Float64Array(0);
  looseY = new Float64Array(0);
  looseVx = new Float64Array(0);
  looseVy = new Float64Array(0);
  looseGlyph = new Uint8Array(0);
  looseShade = new Uint8Array(0);

  private width = 0;
  private height = 0;
  private seed = 0;
  private cursor = 0;
  private windPhaseX = 0;
  private windPhaseY = 0;
  private shadowStyle = "";
  private bodyInnerStyle = "";
  private bodyMidStyle = "";
  private bodyOuterStyle = "";
  private rimStyle = "";
  private rimInkStyle = "";
  private veinStyle = "";
  private whiteStyle = "";
  private pinkStyle = "";
  private stamenStyle = "";
  private duckStyle = "";
  private duckDarkStyle = "";

  /** Converts the plant colours once. The shadow is black at a light alpha, so it reads on both pages. */
  setPalette(mode: "light" | "dark") {
    this.shadowStyle = `rgba(0,0,0,${SHADOW_ALPHA[mode]})`;
    this.bodyInnerStyle = css(BODY_INNER);
    this.bodyMidStyle = css(BODY_MID);
    this.bodyOuterStyle = css(BODY_OUTER);
    this.rimStyle = css(RIM);
    this.rimInkStyle = css(RIM_INK);
    this.veinStyle = css(VEIN_INK);
    this.whiteStyle = css(mode === "light" ? PETAL_WHITE_LIGHT : PETAL_WHITE);
    this.pinkStyle = css(PETAL_PINK);
    this.stamenStyle = css(STAMEN);
    this.duckStyle = css(DUCK);
    this.duckDarkStyle = css(DUCK_DARK);
  }

  /** Places the pads, water lilies and duckweed for a canvas of this size. bodyL is the largest koi's length in px. */
  layout(width: number, height: number, bodyL: number) {
    this.width = width;
    this.height = height;
    // An integer seed from the size, so a new size reseeds the draws.
    this.seed = (Math.round(width) * 73856093) ^ (Math.round(height) * 19349663) ^ SALT;
    this.cursor = 0;
    this.windPhaseX = this.rnd() * TAU;
    this.windPhaseY = this.rnd() * TAU;

    const want = clamp(Math.round((width * height) / PAD_AREA), PAD_MIN, PAD_MAX);
    this.padX = new Float64Array(want);
    this.padY = new Float64Array(want);
    this.padR = new Float64Array(want);
    this.padRot = new Float64Array(want);
    this.padSpin = new Float64Array(want);
    this.padNotch = new Float64Array(want);
    this.padFlowerAng = new Float64Array(want);
    this.padSpokeBase = new Float64Array(want);
    this.padSpokeN = new Uint8Array(want);
    this.padFlower = new Uint8Array(want);
    this.padFlowerWhite = new Uint8Array(want);
    this.padVx = new Float64Array(want);
    this.padVy = new Float64Array(want);
    this.padCount = 0;
    const coverLimit = PAD_COVER * width * height;
    let covered = 0;
    // Rejection: each pad gets PAD_TRIES tries to find a clear spot, then is left out. Stop once the cover is full.
    for (let i = 0; i < want && covered < coverLimit; i++) {
      for (let attempt = 0; attempt < PAD_TRIES; attempt++) {
        const r = (PAD_R_MIN + PAD_R_SPAN * this.rnd()) * bodyL;
        const u = this.rnd();
        const v = this.rnd();
        const lo = PAD_MARGIN * r;
        const spanX = width - 2 * lo;
        const spanY = height - 2 * lo;
        if (spanX < 0 || spanY < 0) continue;
        const x = lo + spanX * u;
        const y = lo + spanY * v;
        if (covered + Math.PI * r * r > coverLimit) break;
        if (this.overlapsPad(x, y, r)) continue;
        this.placePad(this.padCount++, x, y, r);
        covered += Math.PI * r * r;
        break;
      }
    }

    const patches = PATCH_MIN + Math.floor(this.rnd() * (PATCH_MAX - PATCH_MIN + 1));
    this.patchCount = patches;
    this.patchX = new Float64Array(PATCH_MAX);
    this.patchY = new Float64Array(PATCH_MAX);
    this.patchR = new Float64Array(PATCH_MAX);
    this.patchVx = new Float64Array(PATCH_MAX);
    this.patchVy = new Float64Array(PATCH_MAX);
    this.frondPatch = new Uint8Array(PATCH_MAX * FROND_MAX);
    this.frondDx = new Float32Array(PATCH_MAX * FROND_MAX);
    this.frondDy = new Float32Array(PATCH_MAX * FROND_MAX);
    this.frondGlyph = new Uint8Array(PATCH_MAX * FROND_MAX);
    this.frondShade = new Uint8Array(PATCH_MAX * FROND_MAX);
    this.frondCount = 0;
    for (let p = 0; p < patches; p++) {
      const R = (PATCH_R_MIN + PATCH_R_SPAN * this.rnd()) * bodyL;
      this.patchX[p] = this.rnd() * width;
      this.patchY[p] = this.rnd() * height;
      this.patchR[p] = R;
      const n = FROND_MIN + Math.floor(this.rnd() * (FROND_MAX - FROND_MIN + 1));
      for (let f = 0; f < n; f++) {
        const a = this.rnd() * TAU;
        // hash^1.5 pulls fronds toward the centre, so the patch is denser there.
        const d = Math.pow(this.rnd(), 1.5) * R;
        const k = this.frondCount++;
        this.frondPatch[k] = p;
        this.frondDx[k] = Math.cos(a) * d;
        this.frondDy[k] = Math.sin(a) * d;
        this.frondGlyph[k] = this.rnd() < 0.4 ? 1 : 0;
        this.frondShade[k] = this.rnd() < 0.5 ? 0 : 1;
      }
    }

    const loose = LOOSE_MIN + Math.floor(this.rnd() * (LOOSE_MAX - LOOSE_MIN + 1));
    this.looseCount = loose;
    this.looseX = new Float64Array(LOOSE_MAX);
    this.looseY = new Float64Array(LOOSE_MAX);
    this.looseVx = new Float64Array(LOOSE_MAX);
    this.looseVy = new Float64Array(LOOSE_MAX);
    this.looseGlyph = new Uint8Array(LOOSE_MAX);
    this.looseShade = new Uint8Array(LOOSE_MAX);
    for (let k = 0; k < loose; k++) {
      this.looseX[k] = this.rnd() * width;
      this.looseY[k] = this.rnd() * height;
      this.looseGlyph[k] = this.rnd() < 0.4 ? 1 : 0;
      this.looseShade[k] = this.rnd() < 0.5 ? 0 : 1;
    }
  }

  /** Advances the plants: the wind, pad spin, decaying pushes, pads pushed apart, and soft edges. */
  step(dt: number, t: number) {
    const { padX, padY, padR, padVx, padVy, width, height } = this;
    const n = this.padCount;
    const wx = WIND_X * Math.sin(WIND_X_RATE * t + this.windPhaseX);
    const wy = WIND_Y * Math.cos(WIND_Y_RATE * t + this.windPhaseY);
    const decay = Math.exp(-PUSH_DECAY * dt);
    for (let i = 0; i < n; i++) {
      this.padRot[i] += this.padSpin[i] * dt;
      padVx[i] *= decay;
      padVy[i] *= decay;
      padX[i] += (wx + padVx[i]) * dt;
      padY[i] += (wy + padVy[i]) * dt;
    }
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = padX[j] - padX[i];
        const dy = padY[j] - padY[i];
        const d = Math.hypot(dx, dy);
        const min = padR[i] + padR[j];
        if (d >= min) continue;
        // Coincident centres split along x.
        const ux = d > 0 ? dx / d : 1;
        const uy = d > 0 ? dy / d : 0;
        const half = (min - d) / 2;
        padX[i] -= ux * half;
        padY[i] -= uy * half;
        padX[j] += ux * half;
        padY[j] += uy * half;
      }
    }
    for (let i = 0; i < n; i++) {
      const lo = PAD_MARGIN * padR[i];
      const hiX = width - lo;
      const hiY = height - lo;
      if (padX[i] < lo) padVx[i] += (lo - padX[i]) * EDGE_SPRING * dt;
      else if (padX[i] > hiX) padVx[i] -= (padX[i] - hiX) * EDGE_SPRING * dt;
      if (padY[i] < lo) padVy[i] += (lo - padY[i]) * EDGE_SPRING * dt;
      else if (padY[i] > hiY) padVy[i] -= (padY[i] - hiY) * EDGE_SPRING * dt;
      padX[i] = clamp(padX[i], lo, hiX);
      padY[i] = clamp(padY[i], lo, hiY);
    }

    // Duckweed rides the same wind, faster, and wraps around the edges.
    const { patchX, patchY, patchR, patchVx, patchVy } = this;
    for (let p = 0; p < this.patchCount; p++) {
      patchVx[p] *= decay;
      patchVy[p] *= decay;
      patchX[p] = wrap(patchX[p] + (DUCK_SPEED * wx + patchVx[p]) * dt, width, patchR[p]);
      patchY[p] = wrap(patchY[p] + (DUCK_SPEED * wy + patchVy[p]) * dt, height, patchR[p]);
    }
    const { looseX, looseY, looseVx, looseVy } = this;
    for (let k = 0; k < this.looseCount; k++) {
      looseVx[k] *= decay;
      looseVy[k] *= decay;
      looseX[k] = wrap(looseX[k] + (DUCK_SPEED * wx + looseVx[k]) * dt, width, 0);
      looseY[k] = wrap(looseY[k] + (DUCK_SPEED * wy + looseVy[k]) * dt, height, 0);
    }
  }

  /** A splash at (x, y): pads and patches within reach get a radial kick, capped in speed. */
  push(x: number, y: number, size: number) {
    const extra = PUSH_REACH_SIZE * size;
    for (let i = 0; i < this.padCount; i++) {
      kick(
        this.padX[i],
        this.padY[i],
        this.padVx,
        this.padVy,
        i,
        x,
        y,
        PUSH_REACH_R * this.padR[i] + extra,
      );
    }
    for (let p = 0; p < this.patchCount; p++) {
      kick(
        this.patchX[p],
        this.patchY[p],
        this.patchVx,
        this.patchVy,
        p,
        x,
        y,
        this.patchR[p] + extra,
      );
    }
  }

  /**
   * A koi's wake at (x, y), moving at (vx, vy) px/s, with the given radius: pads, patches and loose fronds within
   * reach are nudged along the koi's motion and outward from it. Called per koi, per frame.
   */
  pushFrom(x: number, y: number, vx: number, vy: number, radius: number) {
    for (let i = 0; i < this.padCount; i++) {
      nudge(
        this.padX[i],
        this.padY[i],
        this.padR[i],
        x,
        y,
        vx,
        vy,
        radius,
        this.padVx,
        this.padVy,
        i,
      );
    }
    for (let p = 0; p < this.patchCount; p++) {
      nudge(
        this.patchX[p],
        this.patchY[p],
        this.patchR[p],
        x,
        y,
        vx,
        vy,
        radius,
        this.patchVx,
        this.patchVy,
        p,
      );
    }
    for (let k = 0; k < this.looseCount; k++) {
      nudge(this.looseX[k], this.looseY[k], 0, x, y, vx, vy, radius, this.looseVx, this.looseVy, k);
    }
  }

  /** Shadows on the floor, under the creatures: each pad's disc, offset down and to the right. */
  drawShadows(g: CanvasRenderingContext2D, cw: number, ch: number, cols: number, rows: number) {
    g.fillStyle = this.shadowStyle;
    for (let i = 0; i < this.padCount; i++) {
      const rad = this.padR[i];
      const sx = this.padX[i] + SHADOW_DX * rad;
      const sy = this.padY[i] + SHADOW_DY * rad;
      const c0 = Math.max(0, Math.floor((sx - rad) / cw));
      const c1 = Math.min(cols - 1, Math.floor((sx + rad) / cw));
      const r0 = Math.max(0, Math.floor((sy - rad) / ch));
      const r1 = Math.min(rows - 1, Math.floor((sy + rad) / ch));
      for (let row = r0; row <= r1; row++) {
        const dy = (row + 0.5) * ch - sy;
        for (let col = c0; col <= c1; col++) {
          const dx = (col + 0.5) * cw - sx;
          if (dx * dx + dy * dy <= rad * rad) g.fillRect(col * cw, row * ch, cw, ch);
        }
      }
    }
  }

  /**
   * Pads, duckweed and then water lilies, drawn over the creatures. Every cell a pad covers is set in padMask,
   * so rings and duckweed skip it. koiMask marks cells held by a shallow koi: the pad leaves those cells alone,
   * so the koi shows on top. Lilies are drawn last, standing above the water.
   */
  drawPlants(
    g: CanvasRenderingContext2D,
    cw: number,
    ch: number,
    cols: number,
    rows: number,
    padMask: Uint8Array,
    koiMask: Uint8Array,
  ) {
    for (let i = 0; i < this.padCount; i++) {
      const cx = this.padX[i];
      const cy = this.padY[i];
      const rad = this.padR[i];
      const axis = this.padRot[i] + this.padNotch[i];
      const nx = Math.cos(axis);
      const ny = Math.sin(axis);
      const c0 = Math.max(0, Math.floor((cx - rad) / cw));
      const c1 = Math.min(cols - 1, Math.floor((cx + rad) / cw));
      const r0 = Math.max(0, Math.floor((cy - rad) / ch));
      const r1 = Math.min(rows - 1, Math.floor((cy + rad) / ch));
      // The cell holding the centre always counts as covered, so a tiny pad still shows.
      const ccol = Math.floor(cx / cw);
      const crow = Math.floor(cy / ch);
      for (let row = r0; row <= r1; row++) {
        for (let col = c0; col <= c1; col++) {
          const idx = row * cols + col;
          if (padMask[idx] || koiMask[idx]) continue;
          // Coverage: the sub-cell points inside the disc, minus the notch wedge.
          let hits = 0;
          for (let k = 0; k < SUB.length; k += 2) {
            const dx = (col + SUB[k]) * cw - cx;
            const dy = (row + SUB[k + 1]) * ch - cy;
            const d = Math.hypot(dx, dy);
            if (d > rad) continue;
            if (d > 0 && (dx * nx + dy * ny) / d >= NOTCH_COS) continue;
            hits++;
          }
          const centre = col === ccol && row === crow;
          if (hits === 0 && centre) hits = 1;
          if (hits === 0) continue;
          padMask[idx] = 1;
          const gx = col * cw + cw / 2;
          const gy = row * ch + ch / 2 + 1;
          const dx = (col + 0.5) * cw - cx;
          const dy = (row + 0.5) * ch - cy;
          const d = Math.hypot(dx, dy);
          // Rim: the outermost ring, 1 to 3 sub-cell hits, or a neighbour outside the disc.
          const rim = hits < 4 || this.touchesEdge(col, row, cx, cy, rad, cw, ch);
          if (rim) {
            g.fillStyle = this.rimStyle;
            g.fillRect(col * cw, row * ch, cw, ch);
            if (!centre) {
              g.fillStyle = this.rimInkStyle;
              g.fillText(hash3(col, row, SALT + 1) < 0.5 ? "." : "'", gx, gy);
            }
          } else {
            // Body: three radial shades with a hash jitter of one step, so the leaf is not flat.
            const t = d / rad;
            let s = t < INNER_EDGE ? 0 : t < MID_EDGE ? 1 : 2;
            s = clamp(s + Math.floor(hash3(col, row, SALT + 2) * 3) - 1, 0, 2);
            g.fillStyle =
              s === 0 ? this.bodyInnerStyle : s === 1 ? this.bodyMidStyle : this.bodyOuterStyle;
            g.fillRect(col * cw, row * ch, cw, ch);
            if (!centre && this.onSpoke(i, dx, dy, d, cw)) {
              g.fillStyle = this.veinStyle;
              g.fillText(veinGlyph(dx, dy), gx, gy);
            }
          }
          if (centre) {
            // The stem attaches at the centre.
            g.fillStyle = this.veinStyle;
            g.fillText("o", gx, gy);
          }
        }
      }
    }

    for (let f = 0; f < this.frondCount; f++) {
      const p = this.frondPatch[f];
      this.drawFrond(
        g,
        this.patchX[p] + this.frondDx[f],
        this.patchY[p] + this.frondDy[f],
        this.frondGlyph[f],
        this.frondShade[f],
        cw,
        ch,
        cols,
        rows,
        padMask,
      );
    }
    for (let k = 0; k < this.looseCount; k++) {
      this.drawFrond(
        g,
        this.looseX[k],
        this.looseY[k],
        this.looseGlyph[k],
        this.looseShade[k],
        cw,
        ch,
        cols,
        rows,
        padMask,
      );
    }

    for (let i = 0; i < this.padCount; i++) {
      if (!this.padFlower[i]) continue;
      const rad = this.padR[i];
      const fa = this.padRot[i] + this.padFlowerAng[i];
      const fc = Math.floor((this.padX[i] + Math.cos(fa) * FLOWER_REACH * rad) / cw);
      const fr = Math.floor((this.padY[i] + Math.sin(fa) * FLOWER_REACH * rad) / ch);
      const petal = this.padFlowerWhite[i] ? this.whiteStyle : this.pinkStyle;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const col = fc + dc;
          const row = fr + dr;
          if (col < 0 || row < 0 || col >= cols || row >= rows) continue;
          const glyph = FLOWER_ROWS[dr + 1][dc + 1];
          g.fillStyle = glyph === "@" ? this.stamenStyle : petal;
          g.fillText(glyph, col * cw + cw / 2, row * ch + ch / 2 + 1);
        }
      }
    }
  }

  /** One frond: a single glyph in one of the two greens, unless a pad covers its cell. */
  private drawFrond(
    g: CanvasRenderingContext2D,
    x: number,
    y: number,
    glyph: number,
    shade: number,
    cw: number,
    ch: number,
    cols: number,
    rows: number,
    padMask: Uint8Array,
  ) {
    const col = Math.floor(x / cw);
    const row = Math.floor(y / ch);
    if (col < 0 || row < 0 || col >= cols || row >= rows) return;
    if (padMask[row * cols + col]) return;
    g.fillStyle = shade === 0 ? this.duckStyle : this.duckDarkStyle;
    g.fillText(glyph === 0 ? "°" : "·", col * cw + cw / 2, row * ch + ch / 2 + 1);
  }

  /** True when the cell's offset (dx, dy) from pad i's centre lies on one of its veins. */
  private onSpoke(i: number, dx: number, dy: number, d: number, cw: number) {
    if (d <= VEIN_INNER * this.padR[i]) return false;
    const n = this.padSpokeN[i];
    const step = TAU / n;
    const axis = this.padNotch[i];
    for (let k = 0; k < n; k++) {
      const a = this.padSpokeBase[i] + k * step;
      // Spokes near the notch are skipped, so the notch reads as a clean cut.
      if (Math.abs(Math.atan2(Math.sin(a - axis), Math.cos(a - axis))) < SPOKE_NOTCH_CLEAR)
        continue;
      // A ray from the centre: the cell must lie ahead of the centre along the spoke.
      if (dx * Math.cos(a) + dy * Math.sin(a) <= 0) continue;
      if (Math.abs(dx * Math.sin(a) - dy * Math.cos(a)) < VEIN_HALF * cw) return true;
    }
    return false;
  }

  /** True when one of the cell's four neighbours has its centre outside the pad's disc. */
  private touchesEdge(
    col: number,
    row: number,
    cx: number,
    cy: number,
    rad: number,
    cw: number,
    ch: number,
  ) {
    return (
      outsideDisc(col - 1, row, cx, cy, rad, cw, ch) ||
      outsideDisc(col + 1, row, cx, cy, rad, cw, ch) ||
      outsideDisc(col, row - 1, cx, cy, rad, cw, ch) ||
      outsideDisc(col, row + 1, cx, cy, rad, cw, ch)
    );
  }

  /** A seeded draw in [0, 1): the same canvas size always draws the same sequence. */
  private rnd() {
    return hash3(this.cursor++, this.seed, SALT);
  }

  private overlapsPad(x: number, y: number, r: number) {
    for (let j = 0; j < this.padCount; j++) {
      if (Math.hypot(x - this.padX[j], y - this.padY[j]) < r + this.padR[j]) return true;
    }
    return false;
  }

  private placePad(i: number, x: number, y: number, r: number) {
    this.padX[i] = x;
    this.padY[i] = y;
    this.padR[i] = r;
    this.padRot[i] = this.rnd() * TAU;
    this.padSpin[i] = (this.rnd() * 2 - 1) * PAD_SPIN;
    this.padNotch[i] = this.rnd() * TAU;
    // The lily sits on the far side of the notch, so the notch never covers it.
    this.padFlowerAng[i] = this.padNotch[i] + Math.PI;
    this.padSpokeBase[i] = this.rnd() * TAU;
    this.padSpokeN[i] = SPOKES_MIN + Math.floor(this.rnd() * (SPOKES_MAX - SPOKES_MIN + 1));
    this.padFlower[i] = this.rnd() < FLOWER_CHANCE ? 1 : 0;
    this.padFlowerWhite[i] = this.rnd() < FLOWER_WHITE_CHANCE ? 1 : 0;
    this.padVx[i] = 0;
    this.padVy[i] = 0;
  }
}
