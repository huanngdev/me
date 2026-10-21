import { describe, expect, test } from "bun:test";

import type { RosterEntry } from "../creatures/roster";
import type { OceanColors } from "../creatures/types";
import { AsciiRenderer, drawOrder } from "../renderer";
import { type Creature, type Fish, SPINE_NODES, World } from "../world";

const W = 1200;
const H = 700;
const L = 300;
const CX = W / 2;
const CY = H / 2;
const CW = 10;
const CH = 14.5;

type Call = { kind: "rect" | "text"; x: number; y: number; text: string };

/** Renderer internals the tests read: per-cell body flags, shade and shadow. */
type Internals = {
  cols: number;
  bodyFlag: Uint8Array;
  bodyShade: Float32Array;
  bodyShadow: Uint8Array;
};
const internals = (r: AsciiRenderer) => r as unknown as Internals;

const shark: RosterEntry[] = [{ species: "classic", rel: 1, depth: 1 }];
const koi: RosterEntry[] = [{ species: "koi", rel: 1, depth: 1, coat: "kohaku" }];

/**
 * Renders one animal laid out horizontally (snout right, tail left, across the centre line), after
 * `mutate` has run on the world. Returns the draw calls, the renderer, and the world.
 */
function stage(
  roster: RosterEntry[],
  mutate?: (world: World) => void,
  colors: OceanColors = "theme",
  baitFish: number | "auto" | false = false,
) {
  const realDocument = globalThis.document;
  const calls: Call[] = [];
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
    fillRect(x: number, y: number) {
      calls.push({ kind: "rect", x, y, text: "" });
    },
    fillText(text: string, x: number, y: number) {
      calls.push({ kind: "text", x, y, text });
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
    renderer.resize(W, H, 1);
    renderer.setColors(colors);

    const world = new World({ roster, baitFish, seed: 1 });
    world.resize(W, H, renderer.cellWidth, renderer.cellHeight);
    const sh = world.creatures[0];
    if (sh) {
      sh.length = L;
      sh.heading = 0;
      sh.speed = 40;
      sh.turn = 0;
      const seg = L / (SPINE_NODES - 1);
      for (let k = 0; k < SPINE_NODES; k++) {
        sh.nodes[k * 2] = CX + L / 2 - k * seg;
        sh.nodes[k * 2 + 1] = CY;
      }
    }
    mutate?.(world);
    renderer.render(world, 1 / 60);
    return { calls, renderer, world, sh };
  } finally {
    Reflect.set(globalThis, "document", realDocument);
  }
}

/** Body cells of the last render: column, row and flag, read from the renderer's buffers. */
function bodyCells(renderer: AsciiRenderer) {
  const { cols, bodyFlag, bodyShade } = internals(renderer);
  const cells: { c: number; r: number; flag: number; shade: number }[] = [];
  for (let i = 0; i < bodyFlag.length; i++) {
    if (!bodyFlag[i]) continue;
    cells.push({
      c: i % cols,
      r: Math.floor(i / cols),
      flag: bodyFlag[i],
      shade: bodyShade[i],
    });
  }
  return cells;
}

const xExtent = (cells: { c: number }[]) => {
  const cols = cells.map((k) => k.c);
  return Math.max(...cols) - Math.min(...cols);
};

const snoutCol = Math.floor((CX + L / 2) / CW);

describe("poses: zero guard", () => {
  test("poses set to exactly 0 render the same calls as an untouched creature", () => {
    const untouched = stage(shark).calls;
    const zeroed = stage(shark, (world) => {
      const sh = world.creatures[0];
      sh.height = 0;
      sh.pitch = 0;
      sh.roll = 0;
      sh.gape = 0;
      sh.slap = 0;
    }).calls;
    expect(zeroed).toEqual(untouched);
  });

  test("a koi at rest renders the same calls as the same koi with zeroed poses", () => {
    const untouched = stage(koi, undefined, "natural").calls;
    const zeroed = stage(
      koi,
      (world) => {
        Object.assign(world.creatures[0], { height: 0, pitch: 0, roll: 0, gape: 0, slap: 0 });
      },
      "natural",
    ).calls;
    expect(zeroed).toEqual(untouched);
  });
});

describe("poses: shape", () => {
  test("gape widens the head: more body cells in the front quarter", () => {
    const frontCells = (gape: number) =>
      bodyCells(stage(koi, (world) => (world.creatures[0].gape = gape)).renderer).filter(
        (k) => k.c >= snoutCol - (L * 0.25) / CW && k.c <= snoutCol,
      ).length;
    expect(frontCells(1)).toBeGreaterThan(frontCells(0));
  });

  test("gape darkens the mouth only when open", () => {
    const eyesFront = (gape: number) =>
      bodyCells(stage(koi, (world) => (world.creatures[0].gape = gape)).renderer).filter(
        (k) => k.flag === 5 && k.c >= snoutCol - 3 && k.c <= snoutCol,
      ).length;
    expect(eyesFront(1)).toBeGreaterThan(eyesFront(0));
  });

  test("height 1 makes the shark bigger and throws its shadow further", () => {
    const shape = (height: number) => {
      const { renderer } = stage(shark, (world) => (world.creatures[0].height = height));
      const cells = bodyCells(renderer);
      const shadowCols = [...internals(renderer).bodyShadow.entries()]
        .filter(([, on]) => on)
        .map(([i]) => i % internals(renderer).cols);
      const bodyMax = Math.max(...cells.map((k) => k.c));
      return { count: cells.length, reach: Math.max(...shadowCols) - bodyMax };
    };
    const flat = shape(0);
    const up = shape(1);
    expect(up.count).toBeGreaterThan(flat.count);
    expect(up.reach).toBeGreaterThan(flat.reach);
  });

  test("pitch 0.9 foreshortens a horizontal body, but keeps at least 70% of its length", () => {
    // The foreshortening floor is now 70% (it was 25%, which stood a body on end). One cell of slack for rounding.
    const flat = xExtent(bodyCells(stage(shark).renderer));
    const nosed = xExtent(
      bodyCells(stage(shark, (world) => (world.creatures[0].pitch = 0.9)).renderer),
    );
    expect(nosed).toBeLessThan(flat);
    expect(nosed).toBeGreaterThanOrEqual(flat * 0.7 - 1);
  });

  test("pitch 1 keeps the render spine at 70% or more of its rest span, with no cell slack", () => {
    // Measured on the spine itself, so there is no cell rounding: the snout-to-tail distance after posePoints.
    type SpineInternals = {
      spine: Float32Array;
      posePoints(sh: Creature, L: number): void;
    };
    const spanAt = (pitch: number) => {
      const { renderer, sh } = stage(shark, (world) => {
        world.creatures[0].pitch = pitch;
      });
      const r = renderer as unknown as SpineInternals;
      r.spine.set(sh.nodes.subarray(0, r.spine.length));
      r.posePoints(sh, sh.length);
      const last = (SPINE_NODES - 1) * 2;
      return Math.hypot(r.spine[last] - r.spine[0], r.spine[last + 1] - r.spine[1]);
    };
    const rest = spanAt(0);
    expect(rest).toBeGreaterThan(0);
    expect(spanAt(1)).toBeGreaterThanOrEqual(0.7 * rest);
  });

  test("roll 1 makes the body narrower", () => {
    const flat = bodyCells(stage(shark).renderer).length;
    const rolled = bodyCells(
      stage(shark, (world) => (world.creatures[0].roll = 1)).renderer,
    ).length;
    expect(rolled).toBeLessThan(flat * 0.8);
  });

  test("roll 1 gives the shark a pale belly: every body cell is at least 0.82 shade", () => {
    // 0.85 before the ±0.03 flicker on each cell.
    const cells = bodyCells(stage(shark, (world) => (world.creatures[0].roll = 1)).renderer);
    const body = cells.filter((k) => k.flag === 1);
    expect(body.length).toBeGreaterThan(0);
    expect(Math.min(...body.map((k) => k.shade))).toBeGreaterThanOrEqual(0.82);
  });

  test("slap 1 swings the tail sideways by more than 0.1 L", () => {
    const tailY = (slap: number) => {
      const cells = bodyCells(stage(shark, (world) => (world.creatures[0].slap = slap)).renderer);
      const tail = cells.filter((k) => k.c * CW < CX - L * 0.3);
      return tail.reduce((sum, k) => sum + k.r * CH, 0) / tail.length;
    };
    expect(Math.abs(tailY(1) - tailY(0))).toBeGreaterThan(L * 0.1);
  });
});

describe("poses: draw order", () => {
  test("with no height the order is the array order", () => {
    const world = new World({
      roster: [
        { species: "classic", rel: 0.7, depth: 0.7 },
        { species: "classic", rel: 0.84, depth: 0.84 },
        { species: "classic", rel: 1, depth: 1 },
      ],
      baitFish: false,
      seed: 1,
    });
    world.resize(W, H, CW, CH);
    const out = new Int16Array(world.creatures.length);
    drawOrder(world.creatures, out);
    expect([...out]).toEqual([0, 1, 2]);
  });

  test("a shark with height 1 is drawn last", () => {
    const world = new World({
      roster: [
        { species: "classic", rel: 0.7, depth: 0.7 },
        { species: "classic", rel: 0.84, depth: 0.84 },
        { species: "classic", rel: 1, depth: 1 },
      ],
      baitFish: false,
      seed: 1,
    });
    world.resize(W, H, CW, CH);
    world.creatures[0].height = 1;
    const out = new Int16Array(world.creatures.length);
    drawOrder(world.creatures, out);
    expect(out[out.length - 1]).toBe(0);
  });
});

describe("poses: easing", () => {
  test("a pose with no target returns to exactly 0 within 3 s", () => {
    // Height eases at 3/s now (was 6/s), so from 1 it takes about 2.3 s to fall under the 1e-3 snap-to-zero.
    const world = new World({ roster: koi, baitFish: false, seed: 2 });
    world.resize(W, H, CW, CH);
    const sh = world.creatures[0];
    sh.gape = 1;
    sh.height = 1;
    sh.slap = -1;
    for (let i = 0; i < 3 * 60; i++) world.step(1 / 60);
    expect(sh.gape).toBe(0);
    expect(sh.height).toBe(0);
    expect(sh.slap).toBe(0);
  });
});

describe("poses: stunned fish", () => {
  type Internal = {
    rebuildHash(): void;
    findPrey(sh: Creature): Fish | null;
    stunFish(x: number, y: number, radius: number, seconds: number): number;
    actx: object;
  };
  const internal = (w: World) => w as unknown as Internal;

  test("stunFish stuns the fish in range, which slow down and recover", () => {
    const world = new World({ seed: 3, baitFish: "auto" });
    world.resize(W, H, CW, CH);
    const f = world.fish.find((x) => x.alive && x.vx !== 0 && x.vy !== 0) ?? world.fish[0];
    const before = Math.hypot(f.vx, f.vy);
    const count = internal(world).stunFish(f.x, f.y, 40, 2);
    expect(count).toBeGreaterThanOrEqual(1);
    expect(f.stun).toBe(2);

    for (let i = 0; i < 30; i++) world.step(1 / 60);
    expect(Math.hypot(f.vx, f.vy)).toBeLessThan(before * 0.5);

    for (let i = 0; i < 2.5 * 60; i++) world.step(1 / 60);
    expect(f.stun).toBe(0);
  });

  test("findPrey picks a stunned fish over a nearer unstunned one in the same bucket", () => {
    const world = new World({ roster: shark, fishCount: 2, seed: 4 });
    world.resize(W, H, CW, CH);
    const sh = world.creatures[0];
    sh.nodes[0] = 600;
    sh.nodes[1] = 350;
    sh.heading = 0;
    // Both fish sit in one hash bucket, in front of the snout, so their crowding is equal.
    const [near, far] = world.fish;
    for (const f of world.fish) f.alive = false;
    near.alive = true;
    far.alive = true;
    near.x = 660;
    near.y = 350;
    far.x = 690;
    far.y = 350;
    near.stun = 0;
    far.stun = 5;
    internal(world).rebuildHash();
    expect(internal(world).findPrey(sh)).toBe(far);

    far.stun = 0;
    expect(internal(world).findPrey(sh)).toBe(near);
  });

  test("a stunned fish is drawn with a ~ glyph", () => {
    const { calls } = stage(
      [],
      (world) => {
        for (const f of world.fish) f.alive = false;
        const fish = world.fish[0];
        fish.alive = true;
        fish.x = 300;
        fish.y = 300;
        fish.stun = 5;
      },
      "theme",
      "auto",
    );
    expect(calls.filter((c) => c.text === "~").length).toBe(1);
  });

  test("the ActionContext is one object, reused across steps", () => {
    const world = new World({ roster: koi, baitFish: false, seed: 5 });
    world.resize(W, H, CW, CH);
    const before = internal(world).actx;
    for (let i = 0; i < 100; i++) world.step(1 / 60);
    expect(internal(world).actx).toBe(before);
  });
});
