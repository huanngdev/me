import { hash3 } from "../math";
import type { Coat, Oklch } from "./types";

// The renderer's fin flag, repeated here for the same reason as in the species files.
const FLAG_FIN = 3;

/**
 * Smooth value noise in [0, 1): bilinear blend of hashed lattice values, eased with smoothstep
 * so the pattern has no visible grid. Deterministic for a given (x, y, seed).
 */
export function valueNoise(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = x - x0;
  const ty = y - y0;
  const u = tx * tx * (3 - 2 * tx);
  const v = ty * ty * (3 - 2 * ty);
  const a = hash3(x0, y0, seed);
  const b = hash3(x0 + 1, y0, seed);
  const c = hash3(x0, y0 + 1, seed);
  const d = hash3(x0 + 1, y0 + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/**
 * Body-anchored patch noise: `s` along the body, `vOverL` across it as a fraction of the length,
 * `scale` the patch size, and `salt` picks an independent pattern. Patches ride along with the skin.
 */
export function blobs(s: number, vOverL: number, id: number, scale: number, salt: number): number {
  return valueNoise(s / scale, vOverL / scale, id * 131 + salt);
}

/**
 * Countershading, seen from above: `back` over the top, `belly` past `edge` (0 at the spine, 1 at the
 * flank edge). The belly shows only as a thin rim, with a sharp line where it meets the back. Fins take the back.
 */
export function countershaded(back: Oklch, belly: Oklch, edge = 0.8): Coat {
  return {
    regions: [back, belly],
    paint: (p) => (p.flag !== FLAG_FIN && p.across > edge ? 1 : 0),
  };
}
