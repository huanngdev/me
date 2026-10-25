import { describe, expect, test } from "bun:test";

import { attenuate, AsciiRenderer, type OceanPalette } from "../renderer";
import type { OceanColors } from "../creatures/types";
import type { RosterEntry } from "../creatures/roster";
import { World } from "../world";

const W = 1200;
const H = 700;

const DARK_PAGE: OceanPalette = {
  background: [10, 10, 10],
  foreground: [230, 238, 255],
  mode: "dark",
};
const WHITE_PAGE: OceanPalette = {
  background: [255, 255, 255],
  foreground: [20, 20, 20],
  mode: "light",
};

type Rect = { x: number; y: number; w: number; h: number; style: string };

/** Builds a renderer on a fake canvas, records its fillRect calls, and returns it with a world. */
function scene(
  colors: OceanColors,
  page: OceanPalette = DARK_PAGE,
  seed = 42,
  roster?: RosterEntry[],
) {
  const realDocument = globalThis.document;
  const rects: Rect[] = [];
  let fillStyle = "";
  const ctx = {
    font: "",
    textAlign: "",
    textBaseline: "",
    strokeStyle: "",
    lineWidth: 0,
    get fillStyle() {
      return fillStyle;
    },
    set fillStyle(value: string) {
      fillStyle = value;
    },
    fillRect(x: number, y: number, w: number, h: number) {
      rects.push({ x, y, w, h, style: fillStyle });
    },
    fillText() {},
    drawImage() {},
    setTransform() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    clearRect() {},
    createLinearGradient() {
      return { addColorStop() {} };
    },
    createRadialGradient() {
      return { addColorStop() {} };
    },
    getImageData() {
      return null;
    },
  };
  const fakeCanvas = () => ({ width: 0, height: 0, getContext: () => ctx });

  // The background canvas is created in the constructor, so the fake document only needs to live that long.
  Reflect.set(globalThis, "document", { createElement: () => fakeCanvas() });
  try {
    const renderer = new AsciiRenderer(fakeCanvas() as unknown as HTMLCanvasElement);
    renderer.setFontFamily("monospace");
    renderer.setPalette(page);
    renderer.setColors(colors);
    renderer.resize(W, H, 1);
    const world = new World({ seed, roster });
    world.resize(W, H, renderer.cellWidth, renderer.cellHeight);
    return { renderer, world, rects };
  } finally {
    Reflect.set(globalThis, "document", realDocument);
  }
}

/** Steps the world, then renders one frame into a clean rect log. */
function renderAt(s: ReturnType<typeof scene>, steps: number) {
  for (let k = 0; k < steps; k++) s.world.step(1 / 60);
  s.rects.length = 0;
  s.renderer.render(s.world, 1 / 60);
  return s.rects;
}

/** Full-width cell body fills are cw - 1 wide; the page grid and dots are not. */
function bodyFills(rects: Rect[], cw: number) {
  return rects.filter((r) => r.w === cw - 1 && r.style.startsWith("rgb("));
}

function parseRgb(style: string): [number, number, number] {
  const [r, g, b] = style.slice(4, -1).split(",").map(Number);
  return [r, g, b];
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[sorted.length >> 1];
}

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** Folds a string into a running FNV-1a 32-bit hash. */
function fnv(hash: number, text: string) {
  let h = hash;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, FNV_PRIME);
  }
  return h >>> 0;
}

/** Hashes the draw calls of a natural-mode render of the default seed-42 world at steps 100, 200 and 300. */
function naturalSharkHash(seed: number, surface = true) {
  const realDocument = globalThis.document;
  let hash = FNV_OFFSET;
  let fillStyle = "";
  const ctx = {
    font: "",
    textAlign: "",
    textBaseline: "",
    strokeStyle: "",
    lineWidth: 0,
    get fillStyle() {
      return fillStyle;
    },
    set fillStyle(value: string) {
      fillStyle = value;
    },
    fillRect(x: number, y: number, w: number, h: number) {
      hash = fnv(
        hash,
        `rect ${Math.round(x * 100)},${Math.round(y * 100)},${Math.round(w * 100)},${Math.round(h * 100)} ${fillStyle};`,
      );
    },
    fillText(text: string, x: number, y: number) {
      hash = fnv(hash, `text ${text},${Math.round(x * 100)},${Math.round(y * 100)} ${fillStyle};`);
    },
    drawImage() {},
    setTransform() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    clearRect() {},
    createLinearGradient() {
      return { addColorStop() {} };
    },
    createRadialGradient() {
      return { addColorStop() {} };
    },
    getImageData() {
      return null;
    },
  };
  const fakeCanvas = () => ({ width: 0, height: 0, getContext: () => ctx });

  Reflect.set(globalThis, "document", { createElement: () => fakeCanvas() });
  try {
    const renderer = new AsciiRenderer(fakeCanvas() as unknown as HTMLCanvasElement);
    renderer.setFontFamily("monospace");
    renderer.setColors("natural");
    renderer.setSurface(surface);
    renderer.resize(W, H, 1);
    const world = new World({ seed });
    world.resize(W, H, renderer.cellWidth, renderer.cellHeight);
    for (let step = 1; step <= 300; step++) {
      world.step(1 / 60);
      if (step % 100 === 0) renderer.render(world, 1 / 60);
    }
  } finally {
    Reflect.set(globalThis, "document", realDocument);
  }
  return hash;
}

// R21a: animals only swim (no hunting, feeding or shows).
// Natural-mode shark draw calls for seed 42 before the water surface existed, with `surface: false`.
// R17: no energy trails in natural mode, and a wider tail sweep when rushing
// R15: seabed
// R21d: proportional turning, wider turning circle, smoothed steering, one separation push per neighbour, stronger pod alignment.
// V3 R8: sharks have heterocercal blade tails (the forked caudal is gone), so the draw calls changed.
// V3 R10: the seed draws for breath and drift come after the fish, which moves the rng stream for every later step, and sharks drift in depth.
// R11: habitat water under the animals (gradient, seabed veiled toward the water), depth veil toward the deep water colour.
// V3 R13: shark pectorals widened (root 0.14 TL, reach 0.32) and the falcate cut made shallower, so the draw calls changed.
const NATURAL_NO_SURFACE_HASH = 1963944584;
// R21a: animals only swim (no hunting, feeding or shows).
// Locks the natural-mode shark draw calls for seed 42 at steps 100, 200 and 300, surface on.
// R9: natural mode gained the water surface (caustics)
// R10: a caustic net of wavy light bands tinting the water cells
// R13: bite ripples
// R17: no energy trails in natural mode, and a wider tail sweep when rushing
// R15: seabed
// R20: open-sea surface (swell, glitter, streaks) replaces caustics
// R21d: proportional turning, wider turning circle, smoothed steering, one separation push per neighbour, stronger pod alignment.
// V3 R8: heterocercal shark tails, so the draw calls changed.
// V3 R10: rng stream and fish drift, as above.
// R11: water fill and depth veil, as above.
// V3 R13: classic shark pectorals widened, so the draw calls changed.
const NATURAL_SHARK_HASH_SEED_42 = 2505656097;

describe("natural mode", () => {
  test("bodies split into half-height blocks", () => {
    const s = scene("natural");
    const rects = renderAt(s, 100);
    const { cellWidth: cw, cellHeight: ch } = s.renderer;
    const halves = rects.filter((r) => r.w === cw - 1 && Math.abs(r.h - ch / 2) <= 1);
    expect(halves.length).toBeGreaterThan(0);
  });

  test("body styles come from a cache, and a second frame creates none", () => {
    const s = scene("natural");
    // Each write is a cache miss: the string was not cached yet.
    const writes = new Map<string, number>();
    let misses = 0;
    const cache = (s.renderer as unknown as { styleCache: string[] }).styleCache;
    (s.renderer as unknown as { styleCache: string[] }).styleCache = new Proxy(cache, {
      set(target, prop, value) {
        if (typeof prop === "string" && /^\d+$/.test(prop)) {
          misses++;
          writes.set(value, (writes.get(value) ?? 0) + 1);
        }
        return Reflect.set(target, prop, value);
      },
    });

    const first = renderAt(s, 100);
    const styles = new Set(bodyFills(first, s.renderer.cellWidth).map((r) => r.style));
    expect(styles.size).toBeGreaterThan(0);
    expect(styles.size).toBeLessThanOrEqual(32768);
    // Each style string is built once: a repeated write would mean a miss on a cached key.
    for (const count of writes.values()) expect(count).toBe(1);

    // Same world time, so the same keys: every lookup must hit.
    const before = misses;
    s.rects.length = 0;
    s.renderer.render(s.world, 1 / 60);
    expect(misses - before).toBe(0);
  });

  test("water attenuation: far bodies lose red relative to blue, on dark and white pages", () => {
    // A red kohaku koi, not the default sharks: blue-grey bodies gain R/B when the neutral page veil
    // greys them out, so the red-loss claim is only meaningful for a body that carries red.
    const kohaku: RosterEntry[] = [{ species: "koi", rel: 1, depth: 1, coat: "kohaku" }];
    const ratio = (page: OceanPalette, depth: number) => {
      const s = scene("natural", page, 42, kohaku);
      for (const sh of s.world.creatures) sh.depth = depth;
      const fills = bodyFills(renderAt(s, 100), s.renderer.cellWidth);
      const ratios = fills
        .map((r) => parseRgb(r.style))
        .filter(([, , b]) => b > 0)
        .map(([r, , b]) => r / b);
      return median(ratios);
    };
    for (const page of [DARK_PAGE, WHITE_PAGE]) {
      expect(ratio(page, 0.55)).toBeLessThan(ratio(page, 1));
    }
  });

  test("attenuate: full depth keeps colour; far light on a white page absorbs red and stays blue-grey", () => {
    expect(attenuate([200, 100, 50], [0, 0, 0], 1)).toEqual([200, 100, 50]);
    // Dark page: absorption removes red first, so R < G < B.
    const [r, g, b] = attenuate([200, 200, 200], [10, 10, 10], 0);
    expect(r).toBeLessThan(g);
    expect(g).toBeLessThan(b);
    // White page: far grey light veils toward white, but red is still absorbed, so R < B.
    const [wr, , wb] = attenuate([200, 200, 200], [255, 255, 255], 0);
    expect(wr).toBeLessThan(wb);
    expect(wr).toBeGreaterThan(100);
  });

  test("a body cell's halves survive later creatures whose cells miss", () => {
    // Four sharks with overlapping bounding boxes, so later creatures visit cells that earlier ones filled.
    const roster: RosterEntry[] = [
      { species: "classic", rel: 1, depth: 0.6 },
      { species: "tiger", rel: 1, depth: 0.8 },
      { species: "hammerhead", rel: 1, depth: 0.7 },
      { species: "zebra", rel: 1, depth: 0.9 },
    ];
    // FLAG_EDGE is 2 in the renderer: a solid flag is anything else that is non-zero.
    const FLAG_EDGE = 2;
    for (const seed of [1, 2, 3]) {
      const s = scene("natural", DARK_PAGE, seed, roster);
      const buffers = s.renderer as unknown as { bodyFlag: Uint8Array; halfFlag: Uint8Array };
      for (let frame = 0; frame < 300; frame++) {
        s.world.step(1 / 60);
        s.renderer.render(s.world, 1 / 60);
        let orphans = 0;
        for (let i = 0; i < buffers.bodyFlag.length; i++) {
          const flag = buffers.bodyFlag[i];
          if (
            flag &&
            flag !== FLAG_EDGE &&
            !buffers.halfFlag[2 * i] &&
            !buffers.halfFlag[2 * i + 1]
          ) {
            orphans++;
          }
        }
        expect(orphans).toBe(0);
      }
    }
  });

  test("performance guard: natural renders stay within 1.8x theme", () => {
    const frames = 300;
    const theme = scene("theme");
    const natural = scene("natural");
    const cost = { theme: 0, natural: 0 };
    // Alternate the modes frame by frame, after a warm-up, so JIT and GC drift hit both alike.
    for (let k = -30; k < frames; k++) {
      for (const [mode, s] of [
        ["theme", theme],
        ["natural", natural],
      ] as const) {
        s.world.step(1 / 60);
        s.rects.length = 0;
        const start = performance.now();
        s.renderer.render(s.world, 1 / 60);
        if (k >= 0) cost[mode] += performance.now() - start;
      }
    }
    const themeMean = cost.theme / frames;
    const naturalMean = cost.natural / frames;
    console.warn(
      `ascii-ocean render mean (fake ctx, ${frames} frames, 1200x700): theme ${themeMean.toFixed(3)} ms, natural ${naturalMean.toFixed(3)} ms, ratio ${(naturalMean / themeMean).toFixed(2)}`,
    );
    // 1.8, not 1.6: the R20 sea surface adds ~0.3 ms (natural is ~1.35x alone, ~1.7x under the parallel suite).
    expect(naturalMean).toBeLessThanOrEqual(themeMean * 1.8);
  });

  test("seed 42 natural sharks with the surface off match the pre-surface draw calls", () => {
    expect(naturalSharkHash(42, false)).toBe(NATURAL_NO_SURFACE_HASH);
  });

  test("seed 42 natural sharks match the locked draw calls", () => {
    expect(naturalSharkHash(42)).toBe(NATURAL_SHARK_HASH_SEED_42);
  });
});
