import { hash3, smoothstep, TAU } from "./math";

/**
 * The open-sea surface, seen from above. A directional sum of sines (a Tessendorf-style sea, with
 * a Phillips-like spectrum) gives the height and its slope along the sun. From those come the swell
 * shading, the sun glitter (Cox and Munk), the wind streaks and the whitecaps.
 *
 * Allocation-free after layout: every per-cell and per-patch array is sized once there.
 */

/** Wave components in the swell sum. */
const COMPONENTS = 14;
/** Shortest and longest wavelengths (px), log-spaced, each with a little hash jitter. */
const LAMBDA_MIN = 70;
const LAMBDA_MAX = 520;
const LAMBDA_JITTER = 0.15;
/** The longest wave has this period (s); it sets g in ω = √(g·2π/λ). */
const LONGEST_PERIOD = 9;
/** Directions spread about the wind by a cos^4 law, within ±45°. */
const SPREAD_MAX = Math.PI / 4;
const SPREAD_POWER = 4;
/** Unit vector from the water toward the sun: the sun is up and to the left. */
const SUN_X = -0.6;
const SUN_Y = -0.8;

/** Glitter: a facet sparkles when its normalised slope is near GLINT_S0, within GLINT_SIGMA. */
const GLINT_S0 = 1.0;
const GLINT_SIGMA = 0.7;
const GLINT_GAIN = 0.12;
/** Cells whose band weight is below this never sparkle (their chance is negligible). */
const GLINT_MIN_BAND = 0.02;
/** A sparkle is re-rolled this many times a second, so it lasts one tick. */
export const GLINT_TICK = 9;
/** The glitter band's centre, as a fraction of the canvas from its top-left, off-canvas toward the sun. */
const BAND_X = -0.35;
const BAND_Y = -0.45;
/** Band falloff, as a fraction of the canvas diagonal: long along the wind, narrow across it. */
const BAND_ALONG = 0.65;
const BAND_ACROSS = 0.36;

/** Windrows: 3 to 6 lines, a sway of this many px across the wind, and a drift of this many px/s downwind. */
const STREAK_MIN = 3;
const STREAK_RANGE = 4;
const STREAK_SWAY = 12;
const STREAK_SPEED = 6;
/** Along-line noise lattice spacing (px): dashes run about this long. */
const STREAK_LENGTH = 36;
/** A streak cell shows where its noise is above this; above STREAK_STRONG it is the brighter level. */
const STREAK_ON = 0.55;
const STREAK_STRONG = 0.75;

/** Whitecaps: a fixed pool of patches, at most one new patch per WHITECAP_GATE seconds. */
const WHITECAP_POOL = 12;
const WHITECAP_MAX_CELLS = 10;
const WHITECAP_MIN_CELLS = 4;
const WHITECAP_GATE = 2;
const WHITECAP_LIFE = 4;
const WHITECAP_LIFE_RANGE = 2;
const WHITECAP_SPEED = 8;
/** Top 0.5% of a Gaussian sits at about 2.58 standard deviations. */
const WHITECAP_SIGMAS = 2.58;
/** Patch cells fall within this many cells of the patch centre. */
const WHITECAP_RADIUS = 1.6;

/** Glyphs for whitecap foam, keyed by foamGlyph: 1 is `.`, 2 is `,`, 3 is `°`. */
export const FOAM_GLYPHS = ["", ".", ",", "°"] as const;

export class SeaSurface {
  private cols = 0;
  private rows = 0;
  private cw = 12;
  private ch = 18;
  private n = 0;
  private seed = 0;
  /** Whitecaps spawned so far: varies the hash that places each new patch. */
  private caps = 0;

  /** Wave components: wavenumber × cos/sin of the direction, the amplitude and the phase. */
  private amp = new Float32Array(COMPONENTS);
  private slopeAmp = new Float32Array(COMPONENTS);
  private omega = new Float64Array(COMPONENTS);
  private rowPhase0 = new Float64Array(0);
  private colS = new Float32Array(0);
  private colC = new Float32Array(0);
  private rowS = new Float32Array(0);
  private rowC = new Float32Array(0);
  private sigmaSlope = 1;
  private sigmaHeight = 1;

  /** Wind direction (unit vector), the way the swell and the streaks run. */
  windX = 1;
  windY = 0;

  /** Per cell: the swell height, and the slope along the sun (in units of its RMS). */
  height = new Float32Array(0);
  z = new Float32Array(0);
  /** Per cell: the chance of a sparkle this tick, from the slope and the band. */
  glint = new Float32Array(0);
  /** Per cell: the glitter band's weight, 0 to 1. */
  band = new Float32Array(0);
  /** Per cell: 0 for none, 1 for a dim windrow cell, 2 for a bright one. */
  streak = new Uint8Array(0);
  /** Per cell: a foam glyph index into FOAM_GLYPHS, 0 for none, and an alpha level 0 to 2. */
  foamGlyph = new Uint8Array(0);
  foamLevel = new Uint8Array(0);
  /** Per cell, static: the cell centre measured across and along the wind, from the canvas centre. */
  private across = new Float32Array(0);
  private along = new Float32Array(0);
  private laneOffset = new Float32Array(STREAK_RANGE + STREAK_MIN);
  private streaks = 0;

  /** Whitecap pool: centre (px), age and life (s), cell count, and per-cell offsets and glyphs. */
  private wcActive = new Uint8Array(WHITECAP_POOL);
  private wcX = new Float32Array(WHITECAP_POOL);
  private wcY = new Float32Array(WHITECAP_POOL);
  private wcAge = new Float32Array(WHITECAP_POOL);
  private wcLife = new Float32Array(WHITECAP_POOL);
  private wcCount = new Uint8Array(WHITECAP_POOL);
  private wcOffX = new Float32Array(WHITECAP_POOL * WHITECAP_MAX_CELLS);
  private wcOffY = new Float32Array(WHITECAP_POOL * WHITECAP_MAX_CELLS);
  private wcGlyph = new Uint8Array(WHITECAP_POOL * WHITECAP_MAX_CELLS);
  private wcGate = 0;
  private time = 0;

  /**
   * Sizes every array for a cols × rows grid of cw × ch cells, and draws the swell from `seed`. Call
   * once per resize; the same seed gives the same sea.
   */
  layout(cols: number, rows: number, cw: number, ch: number, seed: number) {
    this.cols = cols;
    this.rows = rows;
    this.cw = cw;
    this.ch = ch;
    this.n = cols * rows;
    this.seed = seed;
    const K = COMPONENTS;
    const W = cols * cw;
    const H = rows * ch;
    const diag = Math.hypot(W, H);

    const theta = hash3(seed, 1, 101) * TAU;
    this.windX = Math.cos(theta);
    this.windY = Math.sin(theta);
    const sunLen = Math.hypot(SUN_X, SUN_Y);
    const sx = SUN_X / sunLen;
    const sy = SUN_Y / sunLen;
    const g = ((TAU / LONGEST_PERIOD) ** 2 * LAMBDA_MAX) / TAU;

    // Pass 1: each component's direction, wavelength and phase; then its raw amplitude.
    const rawAmp = new Float64Array(K);
    const dirCos = new Float64Array(K);
    const dirSin = new Float64Array(K);
    const wavePhase = new Float64Array(K);
    const waveK = new Float64Array(K);
    let ampSum = 0;
    for (let k = 0; k < K; k++) {
      const base = LAMBDA_MIN * (LAMBDA_MAX / LAMBDA_MIN) ** (k / (K - 1));
      const lambda = base * (1 + LAMBDA_JITTER * (2 * hash3(seed, k, 2) - 1));
      // Rejection-sample the spread from cos^4 over ±45°; a run of misses falls back to the wind.
      let spread = 0;
      for (let j = 0; j < 16; j++) {
        const s = (2 * hash3(seed, k, 10 + j) - 1) * SPREAD_MAX;
        if (hash3(seed, k, 40 + j) < Math.cos(s) ** SPREAD_POWER) {
          spread = s;
          break;
        }
      }
      const dir = theta + spread;
      const kw = TAU / lambda;
      waveK[k] = kw;
      dirCos[k] = Math.cos(dir);
      dirSin[k] = Math.sin(dir);
      wavePhase[k] = hash3(seed, k, 3) * TAU;
      this.omega[k] = Math.sqrt((g * TAU) / lambda);
      // Phillips-like: the amplitude grows with wavelength and sits along the wind.
      rawAmp[k] = lambda ** 1.5 * Math.cos(spread) ** 2;
      ampSum += rawAmp[k];
    }

    let sumAmp2 = 0;
    let sumSlope2 = 0;
    for (let k = 0; k < K; k++) {
      const a = rawAmp[k] / ampSum;
      this.amp[k] = a;
      this.slopeAmp[k] = a * waveK[k] * (dirCos[k] * sx + dirSin[k] * sy);
      sumAmp2 += this.amp[k] ** 2;
      sumSlope2 += this.slopeAmp[k] ** 2;
    }
    // The RMS of a sum of random-phase sines is the root of half the sum of squares.
    this.sigmaHeight = Math.sqrt(sumAmp2 / 2);
    this.sigmaSlope = Math.sqrt(sumSlope2 / 2) || 1;

    // Static per-column and per-row tables: the x and y parts of each component's phase.
    this.colS = new Float32Array(cols * K);
    this.colC = new Float32Array(cols * K);
    this.rowPhase0 = new Float64Array(rows * K);
    this.rowS = new Float32Array(rows * K);
    this.rowC = new Float32Array(rows * K);
    for (let c = 0; c < cols; c++) {
      const x = (c + 0.5) * cw;
      for (let k = 0; k < K; k++) {
        const p = waveK[k] * x * dirCos[k];
        this.colS[c * K + k] = Math.sin(p);
        this.colC[c * K + k] = Math.cos(p);
      }
    }
    for (let r = 0; r < rows; r++) {
      const y = (r + 0.5) * ch;
      for (let k = 0; k < K; k++) {
        this.rowPhase0[r * K + k] = waveK[k] * y * dirSin[k] + wavePhase[k];
      }
    }

    // Per-cell statics: the glitter band, and the streak frame (across and along the wind).
    this.height = new Float32Array(this.n);
    this.z = new Float32Array(this.n);
    this.glint = new Float32Array(this.n);
    this.band = new Float32Array(this.n);
    this.streak = new Uint8Array(this.n);
    this.foamGlyph = new Uint8Array(this.n);
    this.foamLevel = new Uint8Array(this.n);
    this.across = new Float32Array(this.n);
    this.along = new Float32Array(this.n);
    const bandX = BAND_X * W;
    const bandY = BAND_Y * H;
    const la = BAND_ALONG * diag;
    const lb = BAND_ACROSS * diag;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const x = (c + 0.5) * cw;
        const y = (r + 0.5) * ch;
        const dx = x - bandX;
        const dy = y - bandY;
        const bAlong = dx * this.windX + dy * this.windY;
        const bAcross = -dx * this.windY + dy * this.windX;
        this.band[i] = Math.exp(-(bAlong ** 2) / (2 * la * la) - bAcross ** 2 / (2 * lb * lb));
        const ox = x - W / 2;
        const oy = y - H / 2;
        this.along[i] = ox * this.windX + oy * this.windY;
        this.across[i] = -ox * this.windY + oy * this.windX;
      }
    }

    // Windrows: 3 to 6 lanes, spaced irregularly across the wind.
    this.streaks = STREAK_MIN + Math.floor(hash3(seed, 2, 60) * STREAK_RANGE);
    for (let k = 0; k < this.streaks; k++) {
      this.laneOffset[k] = (hash3(seed, k, 61) - 0.5) * 0.9 * diag;
    }

    this.wcActive.fill(0);
    this.wcGate = WHITECAP_GATE;
    this.time = 0;
    this.caps = 0;
  }

  /** Advances the sea to time t (s). Call once per rendered frame, natural water only. */
  step(t: number, dt: number) {
    const { cols, rows, colS, colC, rowS, rowC, rowPhase0, omega, amp, slopeAmp } = this;
    const K = COMPONENTS;
    this.time = t;
    // The time term is per row and component, so each cell only adds its column and row parts.
    for (let r = 0; r < rows; r++) {
      for (let k = 0; k < K; k++) {
        const p = rowPhase0[r * K + k] - omega[k] * t;
        rowS[r * K + k] = Math.sin(p);
        rowC[r * K + k] = Math.cos(p);
      }
    }
    const { height, z, glint, band } = this;
    const invSlope = 1 / this.sigmaSlope;
    for (let r = 0; r < rows; r++) {
      const rb = r * K;
      for (let c = 0; c < cols; c++) {
        const cb = c * K;
        let h = 0;
        let s = 0;
        for (let k = 0; k < K; k++) {
          const cs = colS[cb + k];
          const cc = colC[cb + k];
          const rs = rowS[rb + k];
          const rc = rowC[rb + k];
          // Angle-sum identities: sin(a + b) and cos(a + b) from the column and row parts.
          h += amp[k] * (cs * rc + cc * rs);
          s += slopeAmp[k] * (cc * rc - cs * rs);
        }
        const i = r * cols + c;
        height[i] = h;
        z[i] = s * invSlope;
      }
    }

    // Glitter: a facet sparkles where its slope reflects the sun, and the band makes that happen mostly in one region.
    for (let i = 0; i < this.n; i++) {
      // Outside the band the weight is near zero, so skip the exp there.
      const b = band[i];
      if (b < GLINT_MIN_BAND) {
        glint[i] = 0;
        continue;
      }
      const d = (z[i] - GLINT_S0) / GLINT_SIGMA;
      glint[i] = GLINT_GAIN * Math.exp(-0.5 * d * d) * b * b;
    }

    this.updateStreaks(t);
    this.updateWhitecaps(dt);
  }

  /** The glitter band's weight at a cell, 0 to 1. */
  bandAt(c: number, r: number) {
    return this.band[r * this.cols + c];
  }

  /** The sparkle roll for a cell on this tick: GLINT_TICK ticks a second, so a sparkle lasts one tick. */
  sparkle(c: number, r: number, t: number) {
    const tick = Math.floor(t * GLINT_TICK);
    return hash3(c, r, tick) < this.glint[r * this.cols + c];
  }

  private updateStreaks(t: number) {
    const { streak, across, along, cw, n } = this;
    streak.fill(0);
    for (let k = 0; k < this.streaks; k++) {
      // Each lane wanders across the wind, and its noise runs downwind so the dashes travel.
      const lane = this.laneOffset[k] + STREAK_SWAY * Math.sin(0.05 * t + k);
      for (let i = 0; i < n; i++) {
        if (Math.abs(across[i] - lane) > 0.7 * cw) continue;
        const v = valueNoise((along[i] - STREAK_SPEED * t) / STREAK_LENGTH, k, this.seed);
        if (v <= STREAK_ON) continue;
        const level = v > STREAK_STRONG ? 2 : 1;
        if (level > streak[i]) streak[i] = level;
      }
    }
  }

  private updateWhitecaps(dt: number) {
    const { wcActive, wcX, wcY, wcAge, wcLife, wcCount, wcOffX, wcOffY, wcGlyph } = this;
    const { foamGlyph, foamLevel, cw, ch, cols, rows, height, n } = this;
    foamGlyph.fill(0);
    foamLevel.fill(0);
    const dx = this.windX * WHITECAP_SPEED * dt;
    const dy = this.windY * WHITECAP_SPEED * dt;
    for (let p = 0; p < WHITECAP_POOL; p++) {
      if (!wcActive[p]) continue;
      wcAge[p] += dt;
      if (wcAge[p] >= wcLife[p]) {
        wcActive[p] = 0;
        continue;
      }
      wcX[p] += dx;
      wcY[p] += dy;
      const age01 = wcAge[p] / wcLife[p];
      const level = age01 < 0.5 ? 2 : age01 < 0.8 ? 1 : 0;
      for (let m = 0; m < wcCount[p]; m++) {
        const k = p * WHITECAP_MAX_CELLS + m;
        const c = Math.floor((wcX[p] + wcOffX[k]) / cw);
        const r = Math.floor((wcY[p] + wcOffY[k]) / ch);
        if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
        const i = r * cols + c;
        if (foamGlyph[i]) continue;
        foamGlyph[i] = wcGlyph[k];
        foamLevel[i] = level;
      }
    }

    this.wcGate -= dt;
    if (this.wcGate > 0) return;
    // Find a free slot and a cell on a crest. The scan starts at a hashed cell so the spot changes.
    let slot = -1;
    for (let p = 0; p < WHITECAP_POOL; p++) {
      if (!wcActive[p]) {
        slot = p;
        break;
      }
    }
    if (slot < 0) return;
    const thr = WHITECAP_SIGMAS * this.sigmaHeight;
    const start = Math.floor(hash3(this.seed, Math.floor(this.time * 10), 70) * n);
    let crest = -1;
    for (let j = 0; j < n; j++) {
      const i = (start + j) % n;
      if (height[i] > thr) {
        crest = i;
        break;
      }
    }
    if (crest < 0) return;
    this.wcGate = WHITECAP_GATE + hash3(this.seed, this.caps, 71);
    this.caps++;
    const cx = ((crest % cols) + 0.5) * cw;
    const cy = (Math.floor(crest / cols) + 0.5) * ch;
    wcActive[slot] = 1;
    wcX[slot] = cx;
    wcY[slot] = cy;
    wcAge[slot] = 0;
    wcLife[slot] = WHITECAP_LIFE + WHITECAP_LIFE_RANGE * hash3(this.seed, this.caps, 72);
    const count =
      WHITECAP_MIN_CELLS +
      Math.floor(hash3(this.seed, this.caps, 73) * (WHITECAP_MAX_CELLS - WHITECAP_MIN_CELLS + 1));
    wcCount[slot] = count;
    for (let m = 0; m < count; m++) {
      const k = slot * WHITECAP_MAX_CELLS + m;
      wcOffX[k] = (hash3(this.seed, this.caps * 16 + m, 74) * 2 - 1) * WHITECAP_RADIUS * cw;
      wcOffY[k] = (hash3(this.seed, this.caps * 16 + m, 75) * 2 - 1) * WHITECAP_RADIUS * ch;
      const pick = hash3(this.seed, this.caps * 16 + m, 76);
      wcGlyph[k] = pick < 0.4 ? 3 : pick < 0.7 ? 1 : 2;
    }
  }
}

/** One-dimensional value noise in [0, 1): lattice values from the hash, smoothly blended. */
function valueNoise(u: number, lane: number, seed: number) {
  const i = Math.floor(u);
  const f = u - i;
  const a = hash3(i, lane, seed + 17);
  const b = hash3(i + 1, lane, seed + 17);
  return a + (b - a) * smoothstep(0, 1, f);
}
