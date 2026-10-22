import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import type { OceanColors } from "../creatures/types";
import { AsciiRenderer, type OceanPalette } from "../renderer";
import { SeaSurface } from "../sea";
import { World } from "../world";

const DT = 1 / 60;
/** The renderer's sea seed (SEA_SEED in renderer.ts). */
const SEA_SEED = 0x5ea;

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

/** The swell tints, and the sparkle and foam colours, as their rgba() prefixes. */
const TINT_DARK_LIT = "rgba(170,225,255,";
const TINT_LIGHT_LIT = "rgba(0,110,160,";
const TINT_SHADE = "rgba(0,0,0,";
const GLINT_DARK = "rgba(255,244,214,";
const GLINT_LIGHT = "rgba(20,70,120,";
const FOAM_DARK = "rgba(225,240,250,";
const FOAM_LIGHT = "rgba(30,60,80,";

/** Ring glyphs the open sea may draw, and the glyphs a ring must never draw. */
const RING_GLYPHS = new Set([".", "'", "`", ",", ":"]);
const FORBIDDEN_RING = ["(", ")", "/", "\\", "-"];

type Rect = { x: number; y: number; w: number; h: number; style: string };
type Glyph = { text: string; x: number; y: number; style: string };

/** A renderer on a fake canvas that logs every fillRect and fillText with its style, sized to W × H. */
function stage(
  W: number,
  H: number,
  colors: OceanColors,
  page: OceanPalette = DARK_PAGE,
  scene: "ocean" | "pond" = "ocean",
) {
  const realDocument = globalThis.document;
  const rects: Rect[] = [];
  const texts: Glyph[] = [];
  let fillStyle = "";
  const ctx = {
    font: "",
    textAlign: "",
    textBaseline: "",
    strokeStyle: "",
    lineWidth: 0,
    globalAlpha: 1,
    get fillStyle() {
      return fillStyle;
    },
    set fillStyle(value: string) {
      fillStyle = value;
    },
    fillRect(x: number, y: number, w: number, h: number) {
      rects.push({ x, y, w, h, style: fillStyle });
    },
    fillText(text: string, x: number, y: number) {
      texts.push({ text, x, y, style: fillStyle });
    },
    drawImage() {},
    setTransform() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    clearRect() {},
    getImageData() {
      return null;
    },
  };
  const fakeCanvas = () => ({ width: 0, height: 0, getContext: () => ctx });

  Reflect.set(globalThis, "document", { createElement: () => fakeCanvas() });
  try {
    const renderer = new AsciiRenderer(fakeCanvas() as unknown as HTMLCanvasElement);
    renderer.setFontFamily("monospace");
    renderer.setPalette(page);
    renderer.setColors(colors);
    renderer.setSurface(true);
    renderer.resize(W, H, 1);
    const world = new World({ seed: 42, scene, baitFish: false });
    world.resize(W, H, renderer.cellWidth, renderer.cellHeight);
    // The floor is painted through the same fake context during resize; only frames count below.
    rects.length = 0;
    texts.length = 0;
    return { renderer, world, rects, texts };
  } finally {
    Reflect.set(globalThis, "document", realDocument);
  }
}

/** A sea laid out on a 120 × 47 grid of 10 × 15 px cells, the size of a 1200 × 700 canvas. */
function openSea() {
  const sea = new SeaSurface();
  sea.layout(120, 47, 10, 15, SEA_SEED);
  return sea;
}

/** Alpha of an rgba() style string. */
function alphaOf(style: string) {
  return Number(style.slice(0, -1).split(",")[3]);
}

/** Runs a renderer for `frames` frames and returns the rects and glyphs of the last frame set. */
function run(s: ReturnType<typeof stage>, frames: number) {
  const rects: Rect[] = [];
  const texts: Glyph[] = [];
  for (let k = 0; k < frames; k++) {
    s.world.step(DT);
    s.rects.length = 0;
    s.texts.length = 0;
    s.renderer.render(s.world, DT);
    rects.push(...s.rects);
    texts.push(...s.texts);
  }
  return { rects, texts };
}

describe("open sea: the swell moves", () => {
  test("the height changes over one second by a mean |Δh| above 0.05", () => {
    const sea = openSea();
    sea.step(10, 0);
    const a = Float32Array.from(sea.height);
    sea.step(11, 0);
    const b = sea.height;
    let sum = 0;
    for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
    expect(sum / a.length).toBeGreaterThan(0.05);
  });

  test("the sea is not periodic: along a row, the autocorrelation at lags 5–40 stays below 0.85", () => {
    const sea = openSea();
    sea.step(10, 0);
    const cols = 120;
    let worst = -Infinity;
    for (let r = 0; r < 47; r += 3) {
      const row = Array.from({ length: cols }, (_, c) => sea.height[r * cols + c]);
      const mean = row.reduce((a, b) => a + b, 0) / row.length;
      let variance = 0;
      for (const x of row) variance += (x - mean) ** 2;
      if (variance === 0) continue;
      for (let lag = 5; lag <= 40; lag++) {
        let cov = 0;
        for (let c = 0; c + lag < cols; c++) cov += (row[c] - mean) * (row[c + lag] - mean);
        worst = Math.max(worst, cov / variance);
      }
    }
    expect(worst).toBeLessThan(0.85);
  });
});

describe("open sea: sun glitter", () => {
  test("over 120 frames, 0.3–1.2% of cells sparkle per frame on average", () => {
    const sea = openSea();
    const cells = 120 * 47;
    let sparkles = 0;
    for (let k = 0; k < 120; k++) {
      const t = 10 + k * DT;
      sea.step(t, DT);
      for (let i = 0; i < cells; i++) {
        if (sea.sparkle(i % 120, (i / 120) | 0, t)) sparkles++;
      }
    }
    const perFrame = sparkles / 120 / cells;
    expect(perFrame).toBeGreaterThanOrEqual(0.003);
    expect(perFrame).toBeLessThanOrEqual(0.012);
  });

  test("the density inside the glitter band half is at least twice the outer half", () => {
    const sea = openSea();
    const cells = 120 * 47;
    let inside = 0;
    let outside = 0;
    let insideCells = 0;
    let outsideCells = 0;
    for (let k = 0; k < 120; k++) {
      const t = 10 + k * DT;
      sea.step(t, DT);
      for (let i = 0; i < cells; i++) {
        const c = i % 120;
        const r = (i / 120) | 0;
        const isIn = sea.bandAt(c, r) >= 0.5;
        if (isIn) insideCells++;
        else outsideCells++;
        if (sea.sparkle(c, r, t)) {
          if (isIn) inside++;
          else outside++;
        }
      }
    }
    const densityIn = inside / insideCells;
    const densityOut = outside / outsideCells;
    expect(densityOut).toBeGreaterThan(0);
    expect(densityIn).toBeGreaterThanOrEqual(2 * densityOut);
  });
});

describe("open sea: swell tint", () => {
  test("dark page: every swell tint alpha is at most 0.031", () => {
    const s = stage(1200, 700, "natural", DARK_PAGE);
    const { rects } = run(s, 60);
    const tints = rects.filter(
      (r) => r.style.startsWith(TINT_DARK_LIT) || r.style.startsWith(TINT_SHADE),
    );
    expect(tints.length).toBeGreaterThan(0);
    expect(Math.max(...tints.map((r) => alphaOf(r.style)))).toBeLessThanOrEqual(0.031);
  });

  test("light page: every swell tint alpha is at most 0.031", () => {
    const s = stage(1200, 700, "natural", WHITE_PAGE);
    const { rects } = run(s, 60);
    const tints = rects.filter(
      (r) => r.style.startsWith(TINT_LIGHT_LIT) || r.style.startsWith(TINT_SHADE),
    );
    expect(tints.length).toBeGreaterThan(0);
    expect(Math.max(...tints.map((r) => alphaOf(r.style)))).toBeLessThanOrEqual(0.031);
  });
});

describe("open sea: gates", () => {
  const SEA_STYLES = [
    TINT_DARK_LIT,
    TINT_LIGHT_LIT,
    GLINT_DARK,
    GLINT_LIGHT,
    FOAM_DARK,
    FOAM_LIGHT,
  ];
  // Black is the swell's shade too, but the pond's plant shadows are black as well: a swell shade is at most 0.031.
  const isSea = (style: string) =>
    SEA_STYLES.some((p) => style.startsWith(p)) ||
    (style.startsWith(TINT_SHADE) && alphaOf(style) <= 0.031);

  test("the pond draws no swell, glitter, windrow or foam fills", () => {
    const s = stage(1200, 700, "natural", DARK_PAGE, "pond");
    const { rects, texts } = run(s, 60);
    expect(rects.filter((r) => isSea(r.style)).length).toBe(0);
    expect(texts.filter((g) => isSea(g.style)).length).toBe(0);
  });

  test("theme colours draw no swell, glitter, windrow or foam fills", () => {
    const s = stage(1200, 700, "theme");
    const { rects, texts } = run(s, 60);
    expect(rects.filter((r) => isSea(r.style)).length).toBe(0);
    expect(texts.filter((g) => isSea(g.style)).length).toBe(0);
  });

  test("natural colours with the surface off draw no sea fills", () => {
    const s = stage(1200, 700, "natural");
    s.renderer.setSurface(false);
    const { rects, texts } = run(s, 60);
    expect(rects.filter((r) => isSea(r.style)).length).toBe(0);
    expect(texts.filter((g) => isSea(g.style)).length).toBe(0);
  });
});

describe("open sea: no allocation per frame (structural check)", () => {
  /** The source of a method body, from its declaration to the closing brace at its indent. */
  function methodBody(src: string, header: string) {
    const start = src.indexOf(header);
    expect(start).toBeGreaterThanOrEqual(0);
    const end = src.indexOf("\n  }\n", start);
    return src.slice(start, end);
  }
  const forbidden = [
    /\[\s*\]/,
    /new Array/,
    /\.map\(/,
    /\.filter\(/,
    /\.slice\(/,
    /\.concat\(/,
    /\.push\(/,
    /\.\.\./,
    /=>/,
  ];

  test("SeaSurface.step and its helpers create no arrays or closures", () => {
    const src = readFileSync(new URL("../sea.ts", import.meta.url), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    const step = methodBody(src, "  step(t: number, dt: number) {");
    const streaks = methodBody(src, "  private updateStreaks(t: number) {");
    const whitecaps = methodBody(src, "  private updateWhitecaps(dt: number) {");
    for (const body of [step, streaks, whitecaps]) {
      for (const pattern of forbidden) expect(body).not.toMatch(pattern);
    }
  });

  test("the sea and ring draw code creates no arrays or closures per frame", () => {
    const src = readFileSync(new URL("../renderer.ts", import.meta.url), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    for (const header of [
      "  private drawSea(t: number) {",
      "  private drawWaterRing(x: number, y: number, r: number, alpha: number, seed: number, age: number) {",
    ]) {
      const body = methodBody(src, header);
      for (const pattern of forbidden) expect(body).not.toMatch(pattern);
    }
  });
});

describe("surface rings", () => {
  /** Glyphs drawn by one ring at (x, y) with radius r, on a clean sea with no body. */
  function ringGlyphs(pageMode: "pond" | "ocean", r: number, seed: number) {
    const s = stage(1200, 700, "natural", DARK_PAGE, pageMode);
    const renderer = s.renderer as unknown as {
      drawRing(x: number, y: number, r: number, alpha: number, seed: number, age: number): void;
    };
    // render() sets the scene flag; a direct drawRing call needs it set here.
    Reflect.set(s.renderer, "pondScene", pageMode === "pond");
    const cx = 600;
    const cy = 350;
    s.texts.length = 0;
    renderer.drawRing(cx, cy, r, 0.9, seed, 0);
    return { texts: s.texts.map((g) => g.text), cw: s.renderer.cellWidth };
  }

  test("no ring draws a bracket, slash, backslash or dash glyph, over many radii, seeds and alphas", () => {
    const seen = new Set<string>();
    for (const seed of [0.04, 0.27, 0.51, 0.78, 0.93]) {
      for (let r = 20; r <= 140; r += 15) {
        const s = stage(1200, 700, "natural");
        const renderer = s.renderer as unknown as {
          drawRing(x: number, y: number, r: number, alpha: number, seed: number, age: number): void;
        };
        for (const alpha of [0.1, 0.5, 0.9]) {
          s.texts.length = 0;
          renderer.drawRing(600, 350, r, alpha, seed, 0.5);
          for (const g of s.texts) seen.add(g.text);
        }
      }
    }
    for (const glyph of seen) {
      expect(FORBIDDEN_RING).not.toContain(glyph);
      expect(RING_GLYPHS.has(glyph)).toBe(true);
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  test("an open-sea ring leaves at least 25% of its samples empty", () => {
    const r = 60;
    const { texts, cw } = ringGlyphs("ocean", r, 0.37);
    const samples = Math.max(8, Math.round((2 * Math.PI * r) / cw));
    expect(texts.length).toBeGreaterThan(0);
    expect(texts.length).toBeLessThanOrEqual(0.75 * samples);
  });

  test("the still pond's rings keep most of their arc, with fewer gaps than the open sea", () => {
    const r = 60;
    const ocean = ringGlyphs("ocean", r, 0.37);
    const pond = ringGlyphs("pond", r, 0.37);
    expect(pond.texts.length).toBeGreaterThan(ocean.texts.length);
    expect(pond.texts.length).toBeGreaterThanOrEqual(
      0.7 * Math.max(8, Math.round((2 * Math.PI * r) / pond.cw)),
    );
  });
});
