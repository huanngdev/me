import { describe, expect, test } from "bun:test";

import type { OceanColors } from "../creatures/types";
import type { RosterEntry } from "../creatures/roster";
import { Effects } from "../effects";
import { AsciiRenderer, type OceanPalette } from "../renderer";
import { type Creature, World, type WorldEvent } from "../world";

const W = 1200;
const H = 700;
const DT = 1 / 60;

const DARK_PAGE: OceanPalette = {
  background: [10, 10, 10],
  foreground: [230, 238, 255],
  mode: "dark",
};

type Glyph = { text: string; x: number; y: number };

type RingCall = {
  x: number;
  y: number;
  speed: number;
  maxR: number;
  strength: number;
  delay: number;
};

/** A renderer with the surface on (natural colours by default), on a fake canvas that logs every glyph, sized to the world. */
function stage(world: World, colors: OceanColors = "natural") {
  const realDocument = globalThis.document;
  const texts: Glyph[] = [];
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
    fillRect() {},
    fillText(text: string, x: number, y: number) {
      texts.push({ text, x, y });
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
    renderer.setSurface(true);
    renderer.resize(W, H, 1);
    world.resize(W, H, renderer.cellWidth, renderer.cellHeight);
    return { renderer, world, texts };
  } finally {
    Reflect.set(globalThis, "document", realDocument);
  }
}

/** Wraps the renderer's effect pool so every ring and spray call is logged. */
function spy(renderer: AsciiRenderer) {
  const fx = Reflect.get(renderer, "effects") as Effects;
  const rings: RingCall[] = [];
  let sprays = 0;
  const ring = fx.ring.bind(fx);
  fx.ring = (x: number, y: number, speed: number, maxR: number, strength: number, delay = 0) => {
    rings.push({ x, y, speed, maxR, strength, delay });
    ring(x, y, speed, maxR, strength, delay);
  };
  const spray = fx.spray.bind(fx);
  fx.spray = (x: number, y: number, n: number, reach: number, seed: number) => {
    sprays++;
    spray(x, y, n, reach, seed);
  };
  return { rings, sprays: () => sprays };
}

const koi: RosterEntry[] = [{ species: "koi", rel: 1, depth: 1, coat: "kohaku" }];

/** A point `dist` px ahead of a creature's snout, along its heading. */
function inFront(sh: Creature, dist: number) {
  return {
    x: sh.nodes[0] + Math.cos(sh.heading) * dist,
    y: sh.nodes[1] + Math.sin(sh.heading) * dist,
  };
}

function eatAt(x: number, y: number, size: number): WorldEvent {
  return { kind: "eat", x, y, size };
}

describe("bite ripples", () => {
  test("a koi eating a pellet in a pond starts exactly 2 rings, growing outward, and no spray", () => {
    const world = new World({ seed: 9, scene: "pond", baitFish: false, roster: koi });
    const s = stage(world);
    const calls = spy(s.renderer);
    const at = inFront(world.creatures[0], 60);
    world.offerFood(at.x, at.y);

    // Step until a bite lands, and keep the rings the frame that bite was drawn with.
    let biteRings: RingCall[] | null = null;
    for (let k = 0; k < 600 && !biteRings; k++) {
      world.step(DT);
      const before = calls.rings.length;
      const bit = world.events.some((e) => e.kind === "eat");
      s.renderer.render(world, DT);
      if (bit) biteRings = calls.rings.slice(before);
    }

    expect(biteRings).not.toBeNull();
    const rings = biteRings ?? [];
    // R20: a bite's set is two rings (was three), each on a 0.8 s life.
    expect(rings.length).toBe(2);
    expect(rings[0].maxR).toBeLessThan(rings[1].maxR);
    expect(calls.sprays()).toBe(0);
  });

  test("20 eat events in one frame start at most 2 sets, so at most 4 rings", () => {
    const world = new World({ seed: 3, baitFish: false });
    const same = stage(world);
    const sameCalls = spy(same.renderer);
    for (let k = 0; k < 20; k++) world.events.push(eatAt(600, 350, 40));
    same.renderer.render(world, DT);
    // They all sit on one spot, so only the first starts a set (two rings).
    expect(sameCalls.rings.length).toBe(2);

    const spread = new World({ seed: 3, baitFish: false });
    const apart = stage(spread);
    const apartCalls = spy(apart.renderer);
    for (let k = 0; k < 20; k++) spread.events.push(eatAt(100 + k * 60, 300, 40));
    apart.renderer.render(spread, DT);
    expect(apartCalls.rings.length).toBe(4);
  });

  test("a ripple with a size is a ring set and two bubbles, with no spray", () => {
    const world = new World({ seed: 3, baitFish: false });
    const s = stage(world);
    const calls = spy(s.renderer);
    world.events.push({ kind: "ripple", x: 500, y: 300, size: 60 });
    s.renderer.render(world, DT);
    expect(calls.rings.length).toBe(2);
    expect(calls.sprays()).toBe(0);
  });
});

describe("delayed rings", () => {
  test("a delayed ring is not visited by forEachRing until its delay has passed, then grows from the rest of the step", () => {
    const fx = new Effects();
    fx.ring(100, 100, 50, 30, 1, 0.5);
    const radii: number[] = [];
    const visit = () => {
      radii.length = 0;
      fx.forEachRing((_x, _y, r) => radii.push(r));
      return radii.length;
    };
    fx.step(0.2);
    expect(visit()).toBe(0);
    fx.step(0.2);
    expect(visit()).toBe(0);
    // 0.6 s in: the wait ended at 0.5 s, so 0.1 s of growth at 50 px/s.
    fx.step(0.2);
    expect(visit()).toBe(1);
    expect(radii[0]).toBeCloseTo(5, 3);
  });
});

describe("ring glyphs", () => {
  test("theme colours keep the circle: slashes lower-right lean one way, backslashes lower-left the other", () => {
    // R20: only theme colours and surface-off keep the plain circle; natural water draws the broken ring.
    const world = new World({ seed: 1, baitFish: false, roster: [] });
    const s = stage(world, "theme");
    const fx = Reflect.get(s.renderer, "effects") as Effects;
    const cx = 600;
    const cy = 350;
    // A fast ring, so its radius is about 60 px when drawn.
    fx.ring(cx, cy, 3600, 1000, 1);
    s.renderer.render(world, DT);

    const band = (pick: (t: Glyph) => boolean) =>
      s.texts.filter((t) => {
        const d = Math.hypot(t.x - cx, t.y - cy);
        return d > 45 && d < 75 && pick(t);
      });
    const lowerRight = band((t) => t.x > cx && t.y > cy).map((t) => t.text);
    const lowerLeft = band((t) => t.x < cx && t.y > cy).map((t) => t.text);
    const top = band((t) => Math.abs(t.x - cx) < 8 && t.y < cy).map((t) => t.text);

    expect(lowerRight).toContain("/");
    expect(lowerRight).not.toContain("\\");
    expect(lowerLeft).toContain("\\");
    expect(lowerLeft).not.toContain("/");
    expect(top).toContain("-");
  });
});
