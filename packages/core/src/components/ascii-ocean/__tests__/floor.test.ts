import { describe, expect, test } from "bun:test";

import { rgbToOklabL } from "../math";
import type { OceanColors, OceanScene } from "../creatures/types";
import { attenuate, AsciiRenderer, type OceanPalette } from "../renderer";

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

type Op = {
  op: "rect" | "text" | "stroke";
  style: string;
  text?: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
};

/** A fake 2D context that logs each draw with the fillStyle (or strokeStyle) in force. */
function fakeContext(log: Op[]) {
  let fillStyle = "";
  let strokeStyle = "";
  return {
    font: "",
    textAlign: "",
    textBaseline: "",
    lineWidth: 0,
    get fillStyle() {
      return fillStyle;
    },
    set fillStyle(value: string) {
      fillStyle = value;
    },
    get strokeStyle() {
      return strokeStyle;
    },
    set strokeStyle(value: string) {
      strokeStyle = value;
    },
    fillRect(x: number, y: number, w: number, h: number) {
      log.push({ op: "rect", style: fillStyle, x, y, w, h });
    },
    fillText(text: string, x: number, y: number) {
      log.push({ op: "text", style: fillStyle, text, x, y });
    },
    stroke() {
      log.push({ op: "stroke", style: strokeStyle });
    },
    drawImage() {},
    setTransform() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    clearRect() {},
  };
}

/** A renderer whose background canvas logs its own draws, sized to W × H. */
function stage(scene: OceanScene, colors: OceanColors, page: OceanPalette, seed = 0) {
  const bgLog: Op[] = [];
  const bgCtx = fakeContext(bgLog);
  const mainCtx = fakeContext([]);
  const realDocument = globalThis.document;
  Reflect.set(globalThis, "document", {
    createElement: () => ({ width: 0, height: 0, getContext: () => bgCtx }),
  });
  try {
    const canvas = { width: 0, height: 0, getContext: () => mainCtx };
    const renderer = new AsciiRenderer(canvas as unknown as HTMLCanvasElement);
    renderer.setFontFamily("monospace");
    renderer.setPalette(page);
    renderer.setColors(colors);
    renderer.setScene(scene, seed);
    renderer.resize(W, H, 1);
    return { bgLog };
  } finally {
    Reflect.set(globalThis, "document", realDocument);
  }
}

/** The rgba components of a floor style, e.g. "rgba(10,20,30,0.100)". */
function parseRgba(style: string): [number, number, number, number] {
  const [r, g, b, a] = style.slice(5, -1).split(",").map(Number);
  return [r, g, b, a];
}

describe("seabed floor", () => {
  test("theme mode: the background is the flat fill and the grid, nothing else", () => {
    const { bgLog } = stage("ocean", "theme", DARK_PAGE);
    expect(bgLog.map((o) => o.op)).toEqual(["rect", "stroke"]);
    expect(bgLog[0]).toMatchObject({ x: 0, y: 0, w: W, h: H, style: "rgb(10,10,10)" });
  });

  test("natural ocean: more than 50 floor glyphs, the same for the same seed, different for another", () => {
    const first = stage("ocean", "natural", DARK_PAGE, 42).bgLog;
    const glyphs = first.filter((o) => o.op === "text");
    expect(glyphs.length).toBeGreaterThan(50);

    const again = stage("ocean", "natural", DARK_PAGE, 42).bgLog;
    expect(JSON.stringify(again)).toBe(JSON.stringify(first));

    const other = stage("ocean", "natural", DARK_PAGE, 43).bgLog;
    expect(JSON.stringify(other)).not.toBe(JSON.stringify(first));
  });

  test("natural pond: pebbles are drawn, and there are no ripple glyphs", () => {
    const { bgLog } = stage("pond", "natural", DARK_PAGE, 42);
    const texts = bgLog.filter((o) => o.op === "text").map((o) => o.text);
    expect(texts.some((t) => t === "o" || t === "0" || t === "°")).toBe(true);
    // Ripples alternate '~' and '-'; the pond draws only '~~' leaf pairs, so no lone '-' and tildes come in pairs.
    expect(texts.includes("-")).toBe(false);
    const tildes = bgLog.filter((o) => o.op === "text" && o.text === "~");
    expect(tildes.length % 2).toBe(0);
    expect(new Set(tildes.map((o) => o.style)).size).toBe(1);
  });

  test("every floor fill is lower-contrast than a creature's skin, on dark and white pages", () => {
    for (const [page, limit] of [
      [DARK_PAGE, 0.18],
      [WHITE_PAGE, 0.2],
    ] as const) {
      const bg = page.background;
      const bgL = rgbToOklabL(...bg);
      for (const scene of ["ocean", "pond"] as const) {
        const { bgLog } = stage(scene, "natural", page, 42);
        const floor = bgLog.filter((o) => o.style.startsWith("rgba("));
        expect(floor.length).toBeGreaterThan(0);
        for (const o of floor) {
          // The fill at its alpha, composited over the page: what the eye sees.
          const [r, g, b, a] = parseRgba(o.style);
          const seen: [number, number, number] = [
            bg[0] + (r - bg[0]) * a,
            bg[1] + (g - bg[1]) * a,
            bg[2] + (b - bg[2]) * a,
          ];
          expect(Math.abs(rgbToOklabL(...seen) - bgL)).toBeLessThanOrEqual(limit);
        }
      }
    }
  });

  test("pond water: a white input at depth 0 comes out green over blue; the ocean stays blue", () => {
    const [, pondG, pondB] = attenuate([255, 255, 255], [10, 10, 10], 0, "pond");
    expect(pondG).toBeGreaterThanOrEqual(pondB);
    const [, oceanG, oceanB] = attenuate([255, 255, 255], [10, 10, 10], 0, "ocean");
    expect(oceanB).toBeGreaterThan(oceanG);
    // The ocean default is the same as passing "ocean" explicitly.
    expect(attenuate([200, 120, 60], [10, 10, 10], 0)).toEqual(
      attenuate([200, 120, 60], [10, 10, 10], 0, "ocean"),
    );
  });
});
