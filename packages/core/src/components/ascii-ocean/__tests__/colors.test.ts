import { describe, expect, test } from "bun:test";

import { CREATURE_IDS, CREATURES } from "../creatures";
import { oklchToRgb, rgbToOklabL } from "../math";
import { AsciiRenderer, type OceanPalette } from "../renderer";
import { World } from "../world";

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

const round2 = (v: number) => Math.round(v * 100) / 100;

/** WCAG relative luminance ratio between two sRGB byte triples. */
function contrast(a: [number, number, number], b: [number, number, number]) {
  const lum = (c: [number, number, number]) => {
    const [r, g, bl] = c.map((v) => {
      const x = v / 255;
      return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const la = lum(a);
  const lb = lum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Body fill as drawCreatures computes it for a level, tint and dim in natural mode. */
function bodyFill(level: number, tint: [number, number, number]): [number, number, number] {
  const [tr, tg, tb] = tint;
  return [
    Math.min(255, Math.round(level * tr)),
    Math.min(255, Math.round(level * tg)),
    Math.min(255, Math.round(level * tb + 4)),
  ];
}

const LIGHT_BG = oklchToRgb(1, 0, 0);
const DARK_BG = oklchToRgb(0.145, 0, 0);

describe("oklchToRgb", () => {
  test("converts the sRGB red primary", () => {
    const [r, g, b] = oklchToRgb(0.6279554, 0.2576833, 29.2338851);
    expect(Math.abs(r - 255)).toBeLessThanOrEqual(1);
    expect(Math.abs(g - 0)).toBeLessThanOrEqual(1);
    expect(Math.abs(b - 0)).toBeLessThanOrEqual(1);
  });

  test("converts the sRGB blue primary", () => {
    const [r, g, b] = oklchToRgb(0.4520138, 0.3132144, 264.052);
    expect(Math.abs(r - 0)).toBeLessThanOrEqual(1);
    expect(Math.abs(g - 0)).toBeLessThanOrEqual(1);
    expect(Math.abs(b - 255)).toBeLessThanOrEqual(1);
  });

  test("white and black", () => {
    expect(oklchToRgb(1, 0, 0)).toEqual([255, 255, 255]);
    expect(oklchToRgb(0, 0, 0)).toEqual([0, 0, 0]);
  });
});

describe("shark contrast in natural mode", () => {
  for (const id of CREATURE_IDS) {
    const tint = CREATURES[id].shape.tint;
    test(`${id}: near body fill reads on light and dark pages`, () => {
      const near = bodyFill(46 + 0.5 * 160, tint);
      const ratioLight = contrast(near, LIGHT_BG);
      const ratioDark = contrast(near, DARK_BG);
      if (ratioLight < 3 || ratioDark < 3) {
        console.warn(
          `[colors] ${id} near fill ratio light=${ratioLight.toFixed(2)} dark=${ratioDark.toFixed(2)}`,
        );
      }
      expect(ratioLight).toBeGreaterThanOrEqual(3);
      expect(ratioDark).toBeGreaterThanOrEqual(3);
    });

    test(`${id}: far body fill reads on light and dark pages`, () => {
      const dim = 0.7;
      const far = bodyFill((46 + 0.5 * 160) * dim, tint);
      const ratioLight = contrast(far, LIGHT_BG);
      const ratioDark = contrast(far, DARK_BG);
      if (ratioLight < 2 || ratioDark < 2) {
        console.warn(
          `[colors] ${id} far fill ratio light=${ratioLight.toFixed(2)} dark=${ratioDark.toFixed(2)}`,
        );
      }
      expect(ratioLight).toBeGreaterThanOrEqual(2);
      expect(ratioDark).toBeGreaterThanOrEqual(2);
    });
  }
});

describe("renderer colour modes", () => {
  const LIGHT_PALETTE: OceanPalette = {
    background: [255, 255, 255],
    foreground: [20, 20, 20],
    mode: "light",
  };

  /** Renders one frame and returns its draw-call hash plus the rgb fills it used. */
  function renderFrame(colors: "theme" | "natural") {
    const realDocument = globalThis.document;
    let hash = FNV_OFFSET;
    let fillStyle = "";
    const rectFills: string[] = [];

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
        hash = fnv(hash, `rect ${round2(x)},${round2(y)},${round2(w)},${round2(h)} ${fillStyle};`);
        if (typeof fillStyle === "string" && fillStyle.startsWith("rgb("))
          rectFills.push(fillStyle);
      },
      fillText(text: string, x: number, y: number) {
        hash = fnv(hash, `text ${text},${round2(x)},${round2(y)} ${fillStyle};`);
      },
      drawImage(_image: unknown, x: number, y: number) {
        hash = fnv(hash, `image ${round2(x)},${round2(y)};`);
      },
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
      renderer.setColors(colors);
      renderer.resize(1200, 700, 1);
      renderer.setPalette(LIGHT_PALETTE);

      const world = new World({ seed: 42 });
      world.resize(1200, 700, renderer.cellWidth, renderer.cellHeight);
      for (let step = 0; step < 100; step++) world.step(1 / 60);
      renderer.render(world, 1 / 60);
    } finally {
      Reflect.set(globalThis, "document", realDocument);
    }
    return { hash, rectFills };
  }

  test("theme and natural modes draw different frames on a light page", () => {
    expect(renderFrame("theme").hash).not.toBe(renderFrame("natural").hash);
  });

  test("natural mode paints dark bodies on a light page", () => {
    const { rectFills } = renderFrame("natural");
    const dark = rectFills.some((style) => {
      const [r, g, b] = style.slice(4, -1).split(",").map(Number);
      return r < 128 && g < 128 && b < 128;
    });
    expect(dark).toBe(true);
  });
});

describe("rgbToOklabL", () => {
  test("white is 1 and black is 0", () => {
    expect(rgbToOklabL(255, 255, 255)).toBeCloseTo(1, 4);
    expect(rgbToOklabL(0, 0, 0)).toBeCloseTo(0, 4);
  });

  test("round trips with oklchToRgb within 0.01", () => {
    for (const [l, c, h] of [
      [0.6, 0.1, 35],
      [0.8, 0.15, 85],
      [0.22, 0.01, 260],
      [0.95, 0.015, 90],
      [0.5, 0.05, 240],
    ] as const) {
      const [r, g, b] = oklchToRgb(l, c, h);
      expect(Math.abs(rgbToOklabL(r, g, b) - l)).toBeLessThan(0.01);
    }
  });
});
