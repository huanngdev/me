import { describe, expect, test } from "bun:test";

import type { OceanColors } from "../creatures/types";
import type { RosterEntry } from "../creatures/roster";
import { OCEAN, POND, type WaterTone } from "../habitats";
import { AsciiRenderer, type OceanPalette } from "../renderer";
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
type Gradient = { stops: [number, string][] };

/** A fake canvas context that logs fills and the gradients built on it. */
function fakeCtx(rects: Rect[], gradients: Gradient[]) {
  let fillStyle: unknown = "";
  const make = (): Gradient & { addColorStop(o: number, c: string): void } => {
    const g: Gradient & { addColorStop(o: number, c: string): void } = {
      stops: [],
      addColorStop(o, c) {
        g.stops.push([o, c]);
      },
    };
    gradients.push(g);
    return g;
  };
  return {
    font: "",
    textAlign: "",
    textBaseline: "",
    strokeStyle: "",
    lineWidth: 0,
    get fillStyle() {
      return fillStyle;
    },
    set fillStyle(value: unknown) {
      fillStyle = value;
    },
    fillRect(x: number, y: number, w: number, h: number) {
      rects.push({ x, y, w, h, style: typeof fillStyle === "string" ? fillStyle : "gradient" });
    },
    fillText() {},
    drawImage() {},
    setTransform() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    clearRect() {},
    createLinearGradient: make,
    createRadialGradient: make,
    getImageData() {
      return null;
    },
  };
}

/** A renderer on a fake canvas, with its background painted for the page, colours and scene. */
function build(colors: OceanColors, page: OceanPalette, scene: "ocean" | "pond") {
  const realDocument = globalThis.document;
  const rects: Rect[] = [];
  const gradients: Gradient[] = [];
  const ctx = fakeCtx(rects, gradients);
  const fakeCanvas = () => ({ width: 0, height: 0, getContext: () => ctx });
  Reflect.set(globalThis, "document", { createElement: () => fakeCanvas() });
  try {
    const renderer = new AsciiRenderer(fakeCanvas() as unknown as HTMLCanvasElement);
    renderer.setFontFamily("monospace");
    renderer.setPalette(page);
    renderer.setColors(colors);
    renderer.setScene(scene, 1);
    renderer.resize(W, H, 1);
    return { renderer, rects, gradients };
  } finally {
    Reflect.set(globalThis, "document", realDocument);
  }
}

/** Mixes a page colour toward a water colour by the habitat's fill strength. */
function over(page: number[], water: number[], t: number) {
  return page.map((p, i) => Math.round(p + (water[i] - p) * t));
}

const css = (c: number[]) => `rgb(${c.join(",")})`;

/** The first rgb fill of the background: the page colour under everything else. */
function firstFill(rects: Rect[]) {
  return rects.find((r) => r.w === W)?.style;
}

describe("water fill", () => {
  for (const [habitat, scene] of [
    [OCEAN, "ocean"],
    [POND, "pond"],
  ] as const) {
    for (const [page, mode] of [
      [DARK_PAGE, "dark"],
      [WHITE_PAGE, "light"],
    ] as const) {
      test(`${scene} on a ${mode} page: gradient runs from the surface colour (top) to the deep colour (bottom)`, () => {
        const { gradients } = build("natural", page, scene);
        const tone: WaterTone = habitat.water[mode];
        const fill = habitat.fill[mode];
        const surface = css(over(page.background, tone.surface, fill));
        const deep = css(over(page.background, tone.deep, fill));
        // The first linear gradient is the vertical water; the rest are the light patch.
        const down = gradients[0];
        expect(down.stops[0]).toEqual([0, surface]);
        expect(down.stops[down.stops.length - 1]).toEqual([1, deep]);
        // Deep is darker than the surface on either page.
        const sum = (s: string) =>
          s
            .slice(4, -1)
            .split(",")
            .map(Number)
            .reduce((a, b) => a + b, 0);
        expect(sum(deep)).toBeLessThan(sum(surface));
      });
    }
  }

  test("pond and ocean fill with different colours", () => {
    const ocean = build("natural", DARK_PAGE, "ocean").gradients[0].stops;
    const pond = build("natural", DARK_PAGE, "pond").gradients[0].stops;
    expect(ocean[0][1]).not.toBe(pond[0][1]);
  });

  test("a light patch sits over the top centre and fades at its edge", () => {
    const { gradients } = build("natural", DARK_PAGE, "ocean");
    const patch = gradients[1];
    expect(patch.stops[0][1]).toMatch(/^rgba\(/);
    expect(patch.stops[1][1]).toMatch(/,0\)$/);
  });

  test("theme mode keeps the flat page background: no water gradient, the page colour fills", () => {
    for (const page of [DARK_PAGE, WHITE_PAGE]) {
      const { rects, gradients } = build("theme", page, "ocean");
      expect(gradients.length).toBe(0);
      expect(firstFill(rects)).toBe(css(page.background));
    }
  });

  test("natural mode paints the water over the page, under the floor", () => {
    const { rects, gradients } = build("natural", DARK_PAGE, "ocean");
    expect(gradients.length).toBeGreaterThan(0);
    // The page fill comes first, then the water (a gradient) covers the full page.
    expect(firstFill(rects)).toBe(css(DARK_PAGE.background));
    expect(rects.some((r) => r.w === W && r.style === "gradient")).toBe(true);
  });
});

describe("depth colour", () => {
  const humpback: RosterEntry[] = [{ species: "humpback", rel: 1, depth: 0.5 }];
  const koi: RosterEntry[] = [{ species: "koi", rel: 1, depth: 0.5, coat: "kohaku" }];

  /** Mean rgb of the body fills for a creature set to this depth, dive and page, after a few steps. */
  function meanBody(roster: RosterEntry[], page: OceanPalette, depth: number, dive: number) {
    const { renderer, rects } = build("natural", page, roster === koi ? "pond" : "ocean");
    const world = new World({ seed: 42, roster });
    world.resize(W, H, renderer.cellWidth, renderer.cellHeight);
    for (let k = 0; k < 60; k++) world.step(1 / 60);
    for (const sh of world.creatures) {
      sh.depth = depth;
      sh.dive = dive;
      sh.depthOffset = 0;
    }
    rects.length = 0;
    renderer.render(world, 1 / 60);
    const w = renderer.cellWidth - 1;
    const bodies = rects.filter((r) => r.w === w && r.style.startsWith("rgb("));
    expect(bodies.length).toBeGreaterThan(0);
    const sums = [0, 0, 0];
    for (const r of bodies) {
      const [R, G, B] = r.style.slice(4, -1).split(",").map(Number);
      sums[0] += R;
      sums[1] += G;
      sums[2] += B;
    }
    return sums.map((s) => s / bodies.length);
  }

  for (const page of [DARK_PAGE, WHITE_PAGE]) {
    const name = page.mode;
    test(`${name} page: a humpback at the bottom of its dive is dimmer and bluer than at the surface`, () => {
      const surface = meanBody(humpback, page, 1, 0);
      const deep = meanBody(humpback, page, 0.1, 1);
      const lum = (c: number[]) => c[0] + c[1] + c[2];
      // Bluer: blue's share of the body rises with depth.
      expect(deep[2] / lum(deep)).toBeGreaterThan(surface[2] / lum(surface));
      // The body fades toward the deep water colour: closer to it than at the surface.
      const target = OCEAN.water[page.mode].deep;
      const dist = (c: number[]) =>
        Math.hypot(c[0] - target[0], c[1] - target[1], c[2] - target[2]);
      expect(dist(deep)).toBeLessThan(dist(surface));
      // On a dark page the deep body is also dimmer (light fades into the water).
      if (page.mode === "dark") expect(lum(deep)).toBeLessThan(lum(surface));
    });

    test(`${name} page: a koi deep in the pond is tinted green, not red`, () => {
      const surface = meanBody(koi, page, 1, 0);
      const deep = meanBody(koi, page, 0.1, 0);
      // The red share drops with depth, the green share rises.
      expect(deep[0] / Math.max(1, deep[1])).toBeLessThan(surface[0] / Math.max(1, surface[1]));
    });
  }
});
