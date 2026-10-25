import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import type { OceanColors } from "../creatures/types";
import type { RosterEntry } from "../creatures/roster";
import { PondSurface } from "../pond";
import { AsciiRenderer, type OceanPalette } from "../renderer";
import { SPINE_NODES, World } from "../world";

const W = 1200;
const H = 700;
const DT = 1 / 60;

const DARK_PAGE: OceanPalette = {
  background: [10, 10, 10],
  foreground: [230, 238, 255],
  mode: "dark",
};

const CAUSTIC_STYLE = "rgba(170,225,255,";
const koi: RosterEntry[] = [{ species: "koi", rel: 1, depth: 1, coat: "kohaku" }];

type Rect = { x: number; y: number; w: number; h: number; style: string };
type Glyph = { text: string; x: number; y: number; style: string };

/** A renderer on a fake canvas that logs every fillRect and fillText with its style, sized to a world. */
function stage(scene: "pond" | "ocean", colors: OceanColors = "natural", page = DARK_PAGE) {
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
    renderer.setPalette(page);
    renderer.setColors(colors);
    renderer.setSurface(true);
    renderer.resize(W, H, 1);
    const world = new World({ seed: 9, scene, baitFish: false, roster: koi });
    world.resize(W, H, renderer.cellWidth, renderer.cellHeight);
    return { renderer, world, rects, texts };
  } finally {
    Reflect.set(globalThis, "document", realDocument);
  }
}

function pondOf(renderer: AsciiRenderer) {
  return Reflect.get(renderer, "pond") as PondSurface;
}

/** The pad body and rim fill styles, for matching a pad's paint. */
function padStyles(p: PondSurface) {
  return [
    Reflect.get(p, "bodyInnerStyle") as string,
    Reflect.get(p, "bodyMidStyle") as string,
    Reflect.get(p, "bodyOuterStyle") as string,
    Reflect.get(p, "rimStyle") as string,
  ];
}

/** The layout a size gives, as plain numbers for comparison. */
function layoutOf(width: number, height: number, bodyL: number) {
  const p = new PondSurface();
  p.layout(width, height, bodyL);
  const n = p.padCount;
  return {
    n,
    x: Array.from(p.padX.slice(0, n)),
    y: Array.from(p.padY.slice(0, n)),
    r: Array.from(p.padR.slice(0, n)),
  };
}

/** Renders one frame with the koi placed so its mid-spine runs through the largest pad's centre. */
function koiOverLargestPad(dive: number, speed: number) {
  const s = stage("pond");
  s.renderer.render(s.world, DT);
  const pond = pondOf(s.renderer);
  let best = 0;
  for (let i = 1; i < pond.padCount; i++) if (pond.padR[i] > pond.padR[best]) best = i;
  const cx = pond.padX[best];
  const cy = pond.padY[best];
  const rad = pond.padR[best];
  const theta = pond.padRot[best] + pond.padNotch[best] + Math.PI;
  const ux = Math.cos(theta);
  const uy = Math.sin(theta);
  // Park the koi along that line through the pad centre, so its body covers the probe cell.
  const sh = s.world.creatures[0];
  const L = sh.length;
  for (let k = 0; k < SPINE_NODES; k++) {
    const along = L / 2 - (k * L) / (SPINE_NODES - 1);
    sh.nodes[k * 2] = cx + along * ux;
    sh.nodes[k * 2 + 1] = cy + along * uy;
  }
  sh.heading = theta;
  sh.speed = speed;
  sh.dive = dive;
  s.world.creatures.length = 1;
  s.world.pointer.active = false;
  s.rects.length = 0;
  s.texts.length = 0;
  pond.padVx[best] = 0;
  pond.padVy[best] = 0;
  s.renderer.render(s.world, DT);
  // The probe: half a radius out from the centre, on the side opposite the notch.
  const qx = cx + 0.5 * rad * ux;
  const qy = cy + 0.5 * rad * uy;
  const cw = s.renderer.cellWidth;
  const ch = s.renderer.cellHeight;
  const col = Math.floor(qx / cw);
  const row = Math.floor(qy / ch);
  const px = (col + 0.5) * cw;
  const py = (row + 0.5) * ch;
  const covering = s.rects.filter(
    (r) => px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h,
  );
  return {
    s,
    pond,
    best,
    probeIdx: row * Math.ceil(W / cw) + col,
    covering,
    vx: pond.padVx[best],
    vy: pond.padVy[best],
  };
}

describe("pond plants: layout", () => {
  test("the same size gives the same layout; a different size gives a different one", () => {
    expect(layoutOf(W, H, 120)).toEqual(layoutOf(W, H, 120));
    expect(layoutOf(W, H, 120).x).not.toEqual(layoutOf(W + 40, H, 120).x);
  });

  test("no two pads overlap, and every pad sits inside the canvas margin", () => {
    for (const [w, h] of [
      [W, H],
      [800, 500],
      [1500, 900],
    ]) {
      const L = 120;
      const { n, x, y, r } = layoutOf(w, h, L);
      expect(n).toBeGreaterThan(0);
      for (let i = 0; i < n; i++) {
        expect(x[i] - 0.5 * r[i]).toBeGreaterThanOrEqual(-1e-9);
        expect(x[i] + 0.5 * r[i]).toBeLessThanOrEqual(w + 1e-9);
        expect(y[i] - 0.5 * r[i]).toBeGreaterThanOrEqual(-1e-9);
        expect(y[i] + 0.5 * r[i]).toBeLessThanOrEqual(h + 1e-9);
        for (let j = i + 1; j < n; j++) {
          expect(Math.hypot(x[i] - x[j], y[i] - y[j])).toBeGreaterThanOrEqual(r[i] + r[j] - 1e-9);
        }
      }
    }
  });

  test("the pad count is in 6 to 14, and each radius is 0.12 to 0.22 koi lengths", () => {
    for (const [w, h] of [
      [W, H],
      [800, 500],
      [2400, 1400],
    ]) {
      const L = 120;
      const { n, r } = layoutOf(w, h, L);
      expect(n).toBeGreaterThanOrEqual(6);
      expect(n).toBeLessThanOrEqual(14);
      for (let i = 0; i < n; i++) {
        expect(r[i]).toBeGreaterThanOrEqual(0.12 * L - 1e-9);
        expect(r[i]).toBeLessThanOrEqual(0.22 * L + 1e-9);
      }
    }
  });

  test("pads cover at most 8% of the canvas, even when the koi is big", () => {
    for (const [w, h, L] of [
      [W, H, 120],
      [400, 300, 300],
      [300, 200, 200],
    ]) {
      const { r } = layoutOf(w, h, L);
      let area = 0;
      for (const rr of r) area += Math.PI * rr * rr;
      expect(area).toBeLessThanOrEqual(0.08 * w * h + 1e-6);
    }
  });
});

describe("pond plants: motion", () => {
  test("after 600 steps of 1/60 s, every pad is still inside the canvas", () => {
    const p = new PondSurface();
    p.layout(W, H, 120);
    for (let k = 0; k < 600; k++) p.step(DT, k * DT);
    for (let i = 0; i < p.padCount; i++) {
      const m = 0.5 * p.padR[i];
      expect(p.padX[i] - m).toBeGreaterThanOrEqual(-1e-9);
      expect(p.padX[i] + m).toBeLessThanOrEqual(W + 1e-9);
      expect(p.padY[i] - m).toBeGreaterThanOrEqual(-1e-9);
      expect(p.padY[i] + m).toBeLessThanOrEqual(H + 1e-9);
    }
  });

  test("a push moves a pad away from the push point", () => {
    const p = new PondSurface();
    p.layout(W, H, 120);
    const x0 = p.padX[0];
    const y0 = p.padY[0];
    const px = x0 - 0.5 * p.padR[0];
    const before = x0 - px;
    p.push(px, y0, 0);
    p.step(DT, 0);
    const after = Math.hypot(p.padX[0] - px, p.padY[0] - y0);
    expect(after).toBeGreaterThan(before);
  });

  test("ripple pushes are capped at 40 px/s, like the koi wake", () => {
    const p = new PondSurface();
    p.layout(W, H, 120);
    const x0 = p.padX[0];
    const y0 = p.padY[0];
    // Five pushes at one spot would add 70 px/s without the cap.
    for (let k = 0; k < 5; k++) p.push(x0 - 0.5 * p.padR[0], y0, 0);
    expect(Math.hypot(p.padVx[0], p.padVy[0])).toBeLessThanOrEqual(40 + 1e-9);
  });
});

describe("pond plants: scene", () => {
  test("a pond render issues no caustic fillRects; the ocean render does", () => {
    const pond = stage("pond");
    const ocean = stage("ocean");
    for (let k = 0; k < 60; k++) {
      pond.world.step(DT);
      ocean.world.step(DT);
    }
    pond.rects.length = 0;
    pond.renderer.render(pond.world, DT);
    ocean.rects.length = 0;
    ocean.renderer.render(ocean.world, DT);
    const tinted = (rects: Rect[]) => rects.filter((r) => r.style.startsWith(CAUSTIC_STYLE)).length;
    expect(tinted(pond.rects)).toBe(0);
    expect(tinted(ocean.rects)).toBeGreaterThan(0);
  });

  test("plants draw only in the natural, surface-on pond", () => {
    const natural = stage("pond", "natural");
    natural.renderer.render(natural.world, DT);
    const leaf = padStyles(pondOf(natural.renderer));
    expect(natural.rects.some((r) => leaf.includes(r.style))).toBe(true);

    const theme = stage("pond", "theme");
    theme.renderer.render(theme.world, DT);
    expect(theme.rects.some((r) => leaf.includes(r.style))).toBe(false);
    expect(theme.texts.some((t) => leaf.includes(t.style))).toBe(false);
  });

  test("a deep koi (dive 0.8) is hidden by the pad, and does not push it", () => {
    const deep = koiOverLargestPad(0.8, 60);
    const body = padStyles(deep.pond);
    expect(deep.covering.some((r) => !body.includes(r.style))).toBe(true);
    expect(body.includes(deep.covering[deep.covering.length - 1].style)).toBe(true);
    expect(deep.vx).toBe(0);
    expect(deep.vy).toBe(0);
  });

  test("a shallow koi (dive 0) is drawn on top of the pad, and pushes it", () => {
    const shallow = koiOverLargestPad(0, 60);
    const body = padStyles(shallow.pond);
    // The pad leaves the koi's cells alone: no pad paint at the probe.
    expect(shallow.covering.some((r) => body.includes(r.style))).toBe(false);
    expect(shallow.covering.length).toBeGreaterThan(0);
    expect(Math.hypot(shallow.vx, shallow.vy)).toBeGreaterThan(0);
  });

  test("water lilies use only white or pink petals", () => {
    const s = stage("pond");
    s.renderer.render(s.world, DT);
    const pond = pondOf(s.renderer);
    const petals = [
      Reflect.get(pond, "whiteStyle") as string,
      Reflect.get(pond, "pinkStyle") as string,
    ];
    const stars = s.texts.filter((t) => t.text === "*");
    expect(stars.length).toBeGreaterThan(0);
    for (const t of stars) expect(petals.includes(t.style)).toBe(true);
  });

  test("every pad without a lily draws its centre as o; a lily pad's centre is covered by the lily", () => {
    const s = stage("pond");
    s.renderer.render(s.world, DT);
    const pond = pondOf(s.renderer);
    const cw = s.renderer.cellWidth;
    const ch = s.renderer.cellHeight;
    for (let i = 0; i < pond.padCount; i++) {
      const gx = Math.floor(pond.padX[i] / cw) * cw + cw / 2;
      const gy = Math.floor(pond.padY[i] / ch) * ch + ch / 2 + 1;
      const here = s.texts.filter((t) => t.x === gx && t.y === gy);
      expect(here.length).toBeGreaterThan(0);
      if (!pond.padFlower[i]) expect(here[here.length - 1].text).toBe("o");
    }
  });

  test("a pad with a radius of 4 cells or more shows at least 7 vein cells", () => {
    const s = stage("pond");
    s.renderer.render(s.world, DT);
    const pond = pondOf(s.renderer);
    const cw = s.renderer.cellWidth;
    const veins = Reflect.get(pond, "veinStyle") as string;
    const big: number[] = [];
    for (let i = 0; i < pond.padCount; i++) if (pond.padR[i] >= 4 * cw) big.push(i);
    expect(big.length).toBeGreaterThan(0);
    for (const i of big) {
      const n = s.texts.filter(
        (t) =>
          t.style === veins &&
          "-|/\\".includes(t.text) &&
          Math.hypot(t.x - pond.padX[i], t.y - pond.padY[i]) < pond.padR[i],
      ).length;
      expect(n).toBeGreaterThanOrEqual(7);
    }
  });
});

describe("pond plants: no allocation", () => {
  test("the plant code creates no arrays per call (structural check on pond.ts)", () => {
    const src = readFileSync(new URL("../pond.ts", import.meta.url), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    for (const pattern of [
      /\[\s*\]/,
      /new Array/,
      /\.map\(/,
      /\.filter\(/,
      /\.slice\(/,
      /\.concat\(/,
      /\.push\(/,
      /\.\.\./,
      /=>/,
    ]) {
      expect(src).not.toMatch(pattern);
    }
  });
});
