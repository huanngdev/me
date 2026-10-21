import type { ActionId } from "../creatures/behaviour";
import { describe, expect, test } from "bun:test";

import type { OceanColors, CreatureSpecies } from "../creatures/types";
import type { RosterEntry } from "../creatures/roster";
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

// The cyan wake dot style: the last dot colour class, at full alpha or any alpha.
const WAKE_STYLE = "rgba(110,230,255,";

/** A renderer on a fake canvas that logs the fill style of every fillRect. */
function stage(colors: OceanColors, roster: RosterEntry[]) {
  const realDocument = globalThis.document;
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
    fillText() {},
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
    renderer.setSurface(true);
    renderer.resize(W, H, 1);
    const world = new World({ seed: 42, roster, baitFish: false });
    world.resize(W, H, renderer.cellWidth, renderer.cellHeight);
    return { renderer, world, rects };
  } finally {
    Reflect.set(globalThis, "document", realDocument);
  }
}

/** The energy field of a renderer, read the way the other tests do. */
function energyOf(renderer: AsciiRenderer) {
  return Reflect.get(renderer, "energy") as Float32Array;
}

/**
 * Lets one animal cruise alone for a moment, drops food up to 1.5 body lengths from its snout toward the canvas centre, and
 * returns its top speed and top tail-beat rate over the next 1.5 s, each relative to cruise.
 */
function rushOf(
  species: CreatureSpecies,
  depth: number,
  scene: "ocean" | "pond",
  forced?: ActionId,
) {
  const world = new World({
    seed: 5,
    scene,
    baitFish: false,
    roster: [{ species, rel: 1, depth }],
  });
  world.resize(W, H, 10, 14.5);
  for (let i = 0; i < 60; i++) world.step(DT);
  const sh = world.creatures[0];
  const L = sh.length;
  const cruise = 30 + L * 0.04;
  // Food on the line from the snout toward the middle of the canvas, so it always lands on screen.
  const bx = W / 2 - sh.nodes[0];
  const by = H / 2 - sh.nodes[1];
  const b = Math.hypot(bx, by) || 1;
  const reach = Math.min(1.5 * L, b);
  const headX = sh.nodes[0] + (bx / b) * reach;
  const headY = sh.nodes[1] + (by / b) * reach;
  expect(world.offerFood(headX, headY)).toBe(true);
  if (forced) sh.actionId = forced;

  let topSpeed = 0;
  let topRate = 0;
  for (let i = 0; i < Math.round(1.5 / DT); i++) {
    const before = sh.phase;
    world.step(DT);
    topSpeed = Math.max(topSpeed, sh.speed);
    topRate = Math.max(topRate, (sh.phase - before) / DT);
  }
  return {
    speed: topSpeed / cruise,
    rate: topRate / (2 + cruise / 24),
  };
}

describe("rushing to food", () => {
  test("a bottlenose rushes: speed at least 1.8x cruise, tail beat at least 1.8x", () => {
    const r = rushOf("bottlenose", 0.5, "ocean");
    expect(r.speed).toBeGreaterThanOrEqual(1.8);
    expect(r.rate).toBeGreaterThanOrEqual(1.8);
  });

  test("a classic shark rushes: speed at least 1.8x cruise, tail beat at least 1.8x", () => {
    // The plain bite: circleThenLunge circles slowly on purpose before its strike.
    const r = rushOf("classic", 0.5, "ocean", "approachAndBite");
    expect(r.speed).toBeGreaterThanOrEqual(1.8);
    expect(r.rate).toBeGreaterThanOrEqual(1.8);
  });

  test("a koi rushes: speed at least 1.4x cruise, tail beat at least 1.8x", () => {
    const r = rushOf("koi", 1, "pond");
    expect(r.speed).toBeGreaterThanOrEqual(1.4);
    expect(r.rate).toBeGreaterThanOrEqual(1.8);
  });
});

describe("energy trails by colour mode", () => {
  test("natural: no energy field, and no cyan wake dots, over 120 frames with 3 sharks", () => {
    const s = stage("natural", [
      { species: "classic", rel: 1, depth: 0.5 },
      { species: "classic", rel: 1, depth: 0.5 },
      { species: "classic", rel: 1, depth: 0.5 },
    ]);
    let wakeDots = 0;
    for (let k = 0; k < 120; k++) {
      s.world.step(DT);
      s.rects.length = 0;
      s.renderer.render(s.world, DT);
      wakeDots += s.rects.filter((style) => style.startsWith(WAKE_STYLE)).length;
    }
    expect(wakeDots).toBe(0);
    expect(energyOf(s.renderer).every((v) => v === 0)).toBe(true);
  });

  test("theme: the wake still deposits behind a shark", () => {
    const s = stage("theme", [{ species: "classic", rel: 1, depth: 0.5 }]);
    for (let k = 0; k < 60; k++) {
      s.world.step(DT);
      s.renderer.render(s.world, DT);
    }
    const r = s.renderer as unknown as { cw: number; ch: number; cols: number; rows: number };
    const energy = energyOf(s.renderer);
    const tail = s.world.creatures[0].nodes;
    const x = tail[(SPINE_NODES - 1) * 2];
    const y = tail[(SPINE_NODES - 1) * 2 + 1];
    const c0 = Math.floor(x / r.cw);
    const r0 = Math.floor(y / r.ch);
    let sum = 0;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const c = c0 + dc;
        const row = r0 + dr;
        if (c < 0 || row < 0 || c >= r.cols || row >= r.rows) continue;
        sum += energy[row * r.cols + c];
      }
    }
    expect(sum).toBeGreaterThan(0);
  });
});
