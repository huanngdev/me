import { describe, expect, test } from "bun:test";

import { rosterFromGroups } from "../creatures/roster";
import type { CreatureSpecies } from "../creatures/types";
import { createRng } from "../math";
import { World } from "../world";

const DT = 1 / 60;
const W = 1200;
const H = 700;

const SPECIES: CreatureSpecies[] = [
  "classic",
  "hammerhead",
  "greathammer",
  "tiger",
  "mako",
  "thresher",
  "nurse",
  "zebra",
  "koi",
  "bottlenose",
  "orca",
  "humpback",
];

/** Seconds from the offering until the first eat, or Infinity if nothing eats within `seconds`. */
function firstEat(world: World, seconds: number): number {
  for (let i = 1; i <= Math.round(seconds / DT); i++) {
    world.step(DT);
    const eaten = world.events.some((e) => e.kind === "eat");
    world.events.length = 0;
    if (eaten) return i * DT;
  }
  return Infinity;
}

/** A lone animal, food dropped 1.5·L from its snout toward the canvas centre: seconds to the first eat. */
function loneEat(species: CreatureSpecies, seed: number): number {
  const scene = species === "koi" ? "pond" : "ocean";
  const depth = species === "koi" ? 1 : 0.5;
  const world = new World({ seed, scene, baitFish: false, roster: [{ species, rel: 1, depth }] });
  world.resize(W, H, 10, 14.5);
  for (let i = 0; i < 60; i++) world.step(DT);
  world.events.length = 0;
  const sh = world.creatures[0];
  const bx = W / 2 - sh.nodes[0];
  const by = H / 2 - sh.nodes[1];
  const b = Math.hypot(bx, by) || 1;
  const reach = Math.min(1.5 * sh.length, b);
  world.offerFood(sh.nodes[0] + (bx / b) * reach, sh.nodes[1] + (by / b) * reach);
  return firstEat(world, 12);
}

/** Seven koi in a pond, food at the centre after 3 s: seconds to the first eat. */
function koiPondEat(seed: number): number {
  const { entries } = rosterFromGroups([{ species: "koi", count: 7 }], "stylized", createRng(seed));
  const world = new World({ seed, roster: entries, scene: "pond" });
  world.resize(1200, 675, 10, 14.5);
  for (let i = 0; i < 180; i++) world.step(DT);
  world.events.length = 0;
  world.offerFood(600, 337.5);
  return firstEat(world, 10);
}

describe("every species reaches the food", () => {
  for (const species of SPECIES) {
    test(`${species} eats within 12 s on at least 2 of 3 seeds`, () => {
      const eaten = [1, 2, 3].filter((seed) => Number.isFinite(loneEat(species, seed))).length;
      expect(eaten).toBeGreaterThanOrEqual(2);
    });
  }

  test("seven koi in a pond: at least one eats within 10 s on 7 of 8 seeds", () => {
    const eaten = Array.from({ length: 8 }, (_, k) => koiPondEat(k + 1)).filter((t) =>
      Number.isFinite(t),
    ).length;
    expect(eaten).toBeGreaterThanOrEqual(7);
  });
});
