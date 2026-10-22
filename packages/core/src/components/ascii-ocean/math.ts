// Ported from https://github.com/stackedlol/ascii-sharks (used with the author's permission).
export const TAU = Math.PI * 2;

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** Uniform random source, returning values in [0, 1). */
export type Rng = () => number;

/** Seeded 32-bit PRNG (mulberry32): the same seed always yields the same sequence. */
export function createRng(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const rand = (rng: Rng, lo: number, hi: number) => lo + rng() * (hi - lo);

export const randInt = (rng: Rng, lo: number, hi: number) => Math.floor(rand(rng, lo, hi + 1));

export function smoothstep(e0: number, e1: number, x: number) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Shortest signed angle from a to b, in (-PI, PI]. */
export function angleDiff(a: number, b: number) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/** Cheap integer hash → [0, 1). Deterministic, so textures stay stable. */
export function hash3(x: number, y: number, z: number) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const K1 = 1 / 260;
const K2 = 1 / 310;
const K3 = 1 / 190;
const CURRENT_SCALE = 3400;

/**
 * Divergence-free ocean current: the curl of a slowly drifting stream
 * function ψ(x, y, t). Because it has no sources or sinks, it moves the
 * schools around without bunching them up in one corner.
 */
export function current(x: number, y: number, t: number, out: { x: number; y: number }) {
  const a = x * K1 + t * 0.07;
  const b = y * K2 - t * 0.05;
  const c = (x + y) * K3 + t * 0.11;
  // u = ∂ψ/∂y, v = -∂ψ/∂x with ψ = sin(a)cos(b) + 0.5 sin(c)
  out.x = (-K2 * Math.sin(a) * Math.sin(b) + 0.5 * K3 * Math.cos(c)) * CURRENT_SCALE;
  out.y = (-K1 * Math.cos(a) * Math.cos(b) - 0.5 * K3 * Math.cos(c)) * CURRENT_SCALE;
  return out;
}

/** Converts OKLCH (L 0–1, C, H in degrees) to sRGB bytes 0–255, clamped to the gamut. */
export function oklchToRgb(l: number, c: number, h: number): [number, number, number] {
  const rad = (h * Math.PI) / 180;
  const a = c * Math.cos(rad);
  const b = c * Math.sin(rad);
  // OKLab → LMS (cube-rooted), then cube to LMS.
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;
  const L3 = l_ * l_ * l_;
  const M3 = m_ * m_ * m_;
  const S3 = s_ * s_ * s_;
  // LMS → linear sRGB.
  const lin = [
    4.0767416621 * L3 - 3.3077115913 * M3 + 0.2309699292 * S3,
    -1.2684380046 * L3 + 2.6097574011 * M3 - 0.3413193965 * S3,
    -0.0041960863 * L3 - 0.7034186147 * M3 + 1.707614701 * S3,
  ];
  // Linear → gamma-encoded sRGB, then bytes.
  const encode = (x: number) =>
    Math.round(
      clamp((x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055) * 255, 0, 255),
    );
  return [encode(lin[0]), encode(lin[1]), encode(lin[2])];
}

/** OKLab lightness (0–1) of an sRGB colour given as bytes 0–255: the inverse of the lightness path in oklchToRgb. */
export function rgbToOklabL(r: number, g: number, b: number): number {
  const lin = (c: number) => {
    const x = c / 255;
    return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  };
  const R = lin(r);
  const G = lin(g);
  const B = lin(b);
  // Linear sRGB → LMS, cube root, then the lightness row of the OKLab matrix.
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
}
