import { describe, expect, test } from "bun:test";

import { Effects } from "../effects";
import { AsciiRenderer, type OceanPalette } from "../renderer";
import type { OceanColors } from "../creatures/types";
import { World } from "../world";

const W = 1200;
const H = 700;
const DT = 1 / 60;

const DARK_PAGE: OceanPalette = {
  background: [10, 10, 10],
  foreground: [230, 238, 255],
  mode: "dark",
};

// Fill style of the caustic tint (dark page).
const CAUSTIC_STYLE = "rgba(170,225,255,";

type Text = { text: string; style: string; x: number; y: number };

/** A renderer on a fake canvas that logs every fillText call, with its world. */
function scene(colors: OceanColors, surface = true, seed = 42) {
  const realDocument = globalThis.document;
  const texts: Text[] = [];
  const rects: string[] = [];
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
    fillRect() {
      rects.push(fillStyle);
    },
    fillText(text: string, x: number, y: number) {
      texts.push({ text, style: fillStyle, x, y });
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
    renderer.setPalette(DARK_PAGE);
    renderer.setColors(colors);
    renderer.setSurface(surface);
    renderer.resize(W, H, 1);
    const world = new World({ seed });
    world.resize(W, H, renderer.cellWidth, renderer.cellHeight);
    return { renderer, world, texts, rects };
  } finally {
    Reflect.set(globalThis, "document", realDocument);
  }
}

/** Live rings and particles in the renderer's effect pools (the wake dots share the ring colour, so glyph styles can't tell them apart). */
function liveEffects(renderer: AsciiRenderer) {
  const fx = Reflect.get(renderer, "effects") as Effects;
  let n = 0;
  fx.forEachRing(() => n++);
  fx.forEachParticle(() => n++);
  return n;
}

describe("Effects pool", () => {
  test("1000 spray calls never exceed 400 live particles, and the oldest are replaced", () => {
    const fx = new Effects();
    // A sentinel first, so it is the oldest particle in the pool.
    fx.spray(-5000, -5000, 1, 10, 1);
    for (let k = 0; k < 1000; k++) fx.spray(100 + k, 100, 1, 10, k + 2);
    let live = 0;
    let sentinel = 0;
    fx.forEachParticle((x) => {
      live++;
      if (x === -5000) sentinel++;
    });
    expect(live).toBe(400);
    expect(sentinel).toBe(0);
  });

  test("after 2.5 s every particle and ring is dead", () => {
    const fx = new Effects();
    fx.spray(10, 10, 26, 60, 3);
    fx.blow(50, 50, 80, 4);
    fx.bubble(70, 70, 1.2, 5);
    fx.ring(0, 0, 120, 90, 1);
    for (let k = 0; k < 150; k++) fx.step(DT);
    let live = 0;
    fx.forEachParticle(() => live++);
    fx.forEachRing(() => live++);
    expect(live).toBe(0);
  });

  test("no allocation: the typed arrays keep their identity through use", () => {
    const fx = new Effects();
    const arrays = () =>
      Object.values(fx).filter((v): v is ArrayBufferView => ArrayBuffer.isView(v));
    const before = arrays();
    for (let k = 0; k < 2000; k++) {
      fx.spray(k, k, 4, 30, k);
      if (k % 5 === 0) fx.blow(k, k, 40, k);
      if (k % 7 === 0) fx.ring(k, k, 50, 20, 0.5);
      fx.step(DT);
      fx.forEachParticle(() => {});
      fx.forEachRing(() => {});
    }
    const after = arrays();
    expect(after.length).toBe(before.length);
    for (let k = 0; k < before.length; k++) expect(after[k]).toBe(before[k]);
  });

  test("the same event sequence gives the same particles in two instances", () => {
    const run = () => {
      const fx = new Effects();
      const out: number[] = [];
      for (let k = 0; k < 50; k++) {
        fx.spray(k * 3, k * 2, 6, 40, k * 17);
        fx.blow(k, 9, 30, k * 5);
        fx.bubble(k, k, 1.2, k * 3);
        fx.step(DT);
        fx.forEachParticle((x, y, kind, age) => out.push(x, y, kind, age));
      }
      return out;
    };
    expect(run()).toEqual(run());
  });

  test("blow mist: round(radius / 6) particles, from 8 to 28, that spread out to about the given radius", () => {
    const fx = new Effects();
    fx.blow(0, 0, 60, 9);
    let count = 0;
    let maxR = 0;
    fx.forEachParticle((x, y) => {
      count++;
      maxR = Math.max(maxR, Math.hypot(x, y));
    });
    // The count was 14 for every blow. It now scales with the plume's radius: 60 px gives 10.
    expect(count).toBe(10);
    for (let k = 0; k < 60; k++) fx.step(DT);
    let farthest = 0;
    fx.forEachParticle((x, y) => {
      farthest = Math.max(farthest, Math.hypot(x, y));
    });
    expect(farthest).toBeGreaterThan(maxR);
    expect(farthest).toBeGreaterThan(30);
  });
});

describe("surface effects in the renderer", () => {
  test("theme idle: no ring or particle glyphs in 300 frames", () => {
    const s = scene("theme");
    for (let k = 0; k < 300; k++) {
      s.world.step(DT);
      s.texts.length = 0;
      s.renderer.render(s.world, DT);
      expect(liveEffects(s.renderer)).toBe(0);
    }
  });

  test("splash in theme: ring glyphs appear within 0.3 s and are gone after 1.5 s", () => {
    const s = scene("theme");
    for (let k = 0; k < 60; k++) s.world.step(DT);
    s.world.splash(600, 350);
    const ringGlyphs = () => {
      s.texts.length = 0;
      s.renderer.render(s.world, DT);
      return liveEffects(s.renderer);
    };
    let appeared = 0;
    for (let k = 0; k < 18; k++) {
      s.world.step(DT);
      appeared = Math.max(appeared, ringGlyphs());
    }
    expect(appeared).toBeGreaterThan(0);
    let late = 0;
    for (let k = 18; k < 90; k++) {
      s.world.step(DT);
      late = ringGlyphs();
    }
    expect(late).toBe(0);
  });

  test("natural surface: caustic cells tinted on an idle frame, none with the surface off", () => {
    const on = scene("natural", true);
    const off = scene("natural", false);
    for (let k = 0; k < 60; k++) {
      on.world.step(DT);
      off.world.step(DT);
    }
    on.rects.length = 0;
    on.renderer.render(on.world, DT);
    off.rects.length = 0;
    off.renderer.render(off.world, DT);
    const tinted = (rects: string[]) => rects.filter((s) => s.startsWith(CAUSTIC_STYLE)).length;
    expect(tinted(on.rects)).toBeGreaterThan(0);
    expect(tinted(off.rects)).toBe(0);
  });

  test("perf: natural with the surface stays within 1.35x natural without it", () => {
    const frames = 300;
    const on = scene("natural", true);
    const off = scene("natural", false);
    const cost = { on: 0, off: 0 };
    // Alternate the two frame by frame, after a warm-up, so JIT and GC drift hit both alike.
    for (let k = -30; k < frames; k++) {
      for (const [mode, s] of [
        ["on", on],
        ["off", off],
      ] as const) {
        s.world.step(DT);
        s.texts.length = 0;
        const start = performance.now();
        s.renderer.render(s.world, DT);
        if (k >= 0) cost[mode] += performance.now() - start;
      }
    }
    const onMean = cost.on / frames;
    const offMean = cost.off / frames;
    console.warn(
      `ascii-ocean surface render mean (fake ctx, ${frames} frames, 1200x700): on ${onMean.toFixed(3)} ms, off ${offMean.toFixed(3)} ms, ratio ${(onMean / offMean).toFixed(2)}`,
    );
    expect(onMean).toBeLessThanOrEqual(offMean * 1.35);
  });
});
