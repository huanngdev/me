import { describe, expect, test } from "bun:test";

import type { RosterEntry } from "../creatures/roster";
import type { CreatureSpecies } from "../creatures/types";
import { type Creature, SPINE_NODES, World } from "../world";

const W = 1200;
const H = 700;
const SEED = 11;

/** `n` roster slots of one species. Bottlenose at 0.6 scale, as the shows tests have it. */
const group = (species: CreatureSpecies, n: number): RosterEntry[] => {
  const rel = species === "bottlenose" ? 0.6 : 1;
  return Array.from({ length: n }, () => ({ species, rel, depth: rel }));
};

/** A world holding `roster` on a 1200×700 canvas, with no bait fish. */
function worldOf(roster: RosterEntry[], seed = SEED) {
  const world = new World({ roster, seed, baitFish: false });
  world.resize(W, H, 10, 14.5);
  return world;
}

/** Puts a creature's snout at (x, y), its spine trailing straight back along `heading`, cruising. */
function place(sh: Creature, x: number, y: number, heading: number) {
  const seg = sh.length / (SPINE_NODES - 1);
  for (let n = 0; n < SPINE_NODES; n++) {
    sh.nodes[n * 2] = x - Math.cos(heading) * seg * n;
    sh.nodes[n * 2 + 1] = y - Math.sin(heading) * seg * n;
  }
  sh.heading = heading;
  sh.state = "cruise";
}

describe("play jump: the button's jump", () => {
  test("three bottlenose cruising mid-canvas: playRandomJump starts one leap and returns its seconds", () => {
    const world = worldOf(group("bottlenose", 3));
    world.creatures.forEach((sh, i) => place(sh, W / 2 + (i - 1) * 0.8 * sh.length, H / 2, 0));
    const seconds = world.playRandomJump();
    expect(seconds).toBeGreaterThan(0);
    const acting = world.creatures.filter((sh) => sh.state === "action");
    expect(acting).toHaveLength(1);
    expect(acting[0].actionId).toBe("leap");
  });

  test("a shark cruising mid-canvas: playRandomJump starts its breach", () => {
    const world = worldOf(group("classic", 1));
    const [sh] = world.creatures;
    place(sh, W / 2, H / 2, 0);
    expect(world.hasJumpers()).toBe(true);
    expect(world.playRandomJump()).toBeGreaterThan(0);
    expect(sh.actionId).toBe("breach");
  });

  test("no one clear to jump: a dolphin at the edge gives 0, though the roster can jump", () => {
    const world = worldOf(group("bottlenose", 1));
    const [sh] = world.creatures;
    place(sh, W - 0.1 * sh.length, H / 2, 0);
    expect(world.hasJumpers()).toBe(true);
    expect(world.playRandomJump()).toBe(0);
    expect(sh.state).toBe("cruise");
  });

  test("koi only: hasJumpers is false, and playRandomJump returns 0", () => {
    const world = worldOf(group("koi", 5));
    expect(world.hasJumpers()).toBe(false);
    expect(world.playRandomJump()).toBe(0);
  });

  test("the world rng is not called: playRandomJump draws only from Math.random", () => {
    const world = worldOf(group("bottlenose", 3));
    world.creatures.forEach((sh, i) => place(sh, W / 2 + (i - 1) * 0.8 * sh.length, H / 2, 0));
    const rng = Reflect.get(world, "rng") as () => number;
    let calls = 0;
    Reflect.set(world, "rng", () => {
      calls++;
      return rng();
    });
    world.playRandomJump();
    expect(calls).toBe(0);
  });
});
