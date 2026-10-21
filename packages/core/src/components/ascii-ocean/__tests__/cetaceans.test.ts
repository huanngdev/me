import { describe, expect, test } from "bun:test";

import type { RosterEntry } from "../creatures/roster";
import type { CreatureSpecies } from "../creatures/types";
import { AsciiRenderer, type OceanPalette } from "../renderer";
import { type Creature, SPINE_NODES, World } from "../world";

const DT = 1 / 60;
const W = 1200;
const H = 700;
const SEED = 11;

const DARK_PAGE: OceanPalette = {
  background: [10, 10, 10],
  foreground: [230, 238, 255],
  mode: "dark",
};

/** Shortest signed turn from `a` to `b`, in radians. */
const turnBetween = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

/** A world holding `roster`, sized W×H, with no bait fish unless `bait` is set. */
function worldOf(roster: RosterEntry[], bait = false, seed = SEED) {
  const world = new World({ roster, seed, baitFish: bait ? "auto" : false });
  world.resize(W, H, 10, 14.5);
  return world;
}

/** Puts a creature's snout at (x, y), its spine trailing straight back along `heading`. */
function place(sh: Creature, x: number, y: number, heading: number) {
  const seg = sh.length / (SPINE_NODES - 1);
  for (let n = 0; n < SPINE_NODES; n++) {
    sh.nodes[n * 2] = x - Math.cos(heading) * seg * n;
    sh.nodes[n * 2 + 1] = y - Math.sin(heading) * seg * n;
  }
  sh.heading = heading;
}

describe("cetaceans: pods, edges and dive", () => {
  test("pods: three bottlenose seeded 3·L apart swim together", () => {
    // Bottlenose at 0.6 scale, so the triangle of 3·L sides fits on the canvas.
    const roster: RosterEntry[] = [0, 1, 2].map(() => ({
      species: "bottlenose",
      rel: 0.6,
      depth: 0.6,
    }));
    const pod = worldOf(roster);
    const L = pod.creatures[0].length;
    const side = 3 * L;
    const spots = [
      [W / 2 - side / 2, 200],
      [W / 2 + side / 2, 200],
      [W / 2, 200 + side * 0.866],
    ];
    spots.forEach(([x, y], i) => place(pod.creatures[i], x, y, 0));
    // Cruise for 40 s. A single instant is a poor measure (a pod mid-turn spreads its headings for a moment), so the
    // pod is sampled twice a second from 10 s on: its median heading spread and its median mean distance.
    const spreads: number[] = [];
    const dists: number[] = [];
    for (let i = 0; i < Math.round(40 / DT); i++) {
      pod.step(DT);
      if (i < Math.round(10 / DT) || i % 30 !== 0) continue;
      const cs = pod.creatures;
      let sum = 0;
      let maxTurn = 0;
      for (let a = 0; a < 3; a++) {
        for (let b = a + 1; b < 3; b++) {
          sum += Math.hypot(cs[a].nodes[0] - cs[b].nodes[0], cs[a].nodes[1] - cs[b].nodes[1]);
          maxTurn = Math.max(maxTurn, Math.abs(turnBetween(cs[a].heading, cs[b].heading)));
        }
      }
      spreads.push(maxTurn);
      dists.push(sum / 3);
    }
    expect(median(dists)).toBeLessThan(2 * L);
    // R21d measured 0.44–0.48 rad over seeds 1, 2, 3 and 7 (it was 0.8–1.5 rad before R21d).
    expect(median(spreads)).toBeLessThan(0.7);
  });

  test("pods: orcas placed at the bottom edge heading out do not stay off the canvas for long", () => {
    const world = worldOf(
      [0, 1, 2].map(() => ({ species: "orca" as CreatureSpecies, rel: 1, depth: 1 })),
    );
    const L = world.creatures[0].length;
    // Spaced just past the 0.8·L pod separation, so the pod's own spacing does not push them sideways.
    world.creatures.forEach((sh, i) => place(sh, W / 2 + (i - 1) * 0.85 * L, H - 30, Math.PI / 2));
    const streak = [0, 0, 0];
    let longest = 0;
    for (let i = 0; i < Math.round(60 / DT); i++) {
      world.step(DT);
      world.creatures.forEach((sh, k) => {
        const [hx, hy] = [sh.nodes[0], sh.nodes[1]];
        const outside = Math.max(-hx, hx - W, -hy, hy - H, 0);
        streak[k] = outside > 0.3 * L ? streak[k] + DT : 0;
        longest = Math.max(longest, streak[k]);
      });
    }
    expect(longest).toBeLessThanOrEqual(3);
  });

  test("dive: a diving bottlenose renders bluer and fainter than one at the surface", () => {
    const roster: RosterEntry[] = [{ species: "bottlenose", rel: 1, depth: 0.9 }];
    const frame = (dive: number) => {
      const world = worldOf(roster);
      world.creatures[0].dive = dive;
      const rects = renderRects(world);
      return rects;
    };
    const surface = frame(0);
    const diving = frame(1);
    // Same world and seed, so the only rects that differ are the body's: compare those.
    expect(surface.length).toBe(diving.length);
    const bg: number[] = [];
    const dv: number[] = [];
    for (let i = 0; i < surface.length; i++) {
      if (surface[i] === diving[i]) continue;
      bg.push(redOverBlue(surface[i]));
      dv.push(redOverBlue(diving[i]));
    }
    expect(bg.length).toBeGreaterThan(0);
    expect(median(dv)).toBeLessThan(median(bg));
  });
});

function renderRects(world: World): string[] {
  const realDocument = globalThis.document;
  const styles: string[] = [];
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
      styles.push(fillStyle);
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
    renderer.setColors("natural");
    renderer.resize(W, H, 1);
    renderer.render(world, DT);
  } finally {
    Reflect.set(globalThis, "document", realDocument);
  }
  return styles;
}

/** R/B of a "rgb(...)" or "rgba(...)" fill style. */
function redOverBlue(style: string) {
  const [r, , b] = style.match(/[\d.]+/g)!.map(Number);
  return r / Math.max(1, b);
}

function median(values: number[]) {
  const sorted = [...values].sort((x, y) => x - y);
  return sorted[sorted.length >> 1];
}
