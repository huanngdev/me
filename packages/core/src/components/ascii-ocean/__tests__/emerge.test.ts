import { describe, expect, test } from "bun:test";

import { ACTIONS } from "../creatures/actions";
import type { RosterEntry } from "../creatures/roster";
import type { CreatureSpecies } from "../creatures/types";
import { emergedAt } from "../renderer";
import { type Creature, SPINE_NODES, World } from "../world";

const DT = 1 / 60;
const W = 1200;
const H = 700;
const SEED = 11;

/** `n` roster slots of one species, as the shows tests have them. */
const pod = (species: CreatureSpecies, n: number): RosterEntry[] => {
  const rel = species === "bottlenose" ? 0.6 : 1;
  return Array.from({ length: n }, () => ({ species, rel, depth: rel }));
};

/** A world holding `roster` on a 1200×700 canvas, with no bait fish. */
function worldOf(roster: RosterEntry[]) {
  const world = new World({ roster, seed: SEED, baitFish: false });
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

/** Runs one forced show of the creature, `seconds` plus a second of recovery, and calls `each` after every step. */
function runShow(id: "leap" | "breachRoll", each: (world: World, sh: Creature) => void): World {
  const world = worldOf(pod(id === "leap" ? "bottlenose" : "orca", 1));
  const sh = world.creatures[0];
  place(sh, 0.3 * W, H / 2, 0);
  expect(world.startShow(sh, id)).toBeGreaterThan(0);
  const steps = Math.round((ACTIONS[id].seconds + 1) / DT);
  for (let i = 0; i < steps; i++) {
    world.step(DT);
    each(world, sh);
    world.events.length = 0;
  }
  return world;
}

describe("emerge: the head comes out first and goes back in first", () => {
  test("rising: a step where the head is out while the tail is still under", () => {
    let best = -Infinity;
    runShow("leap", (_, sh) => {
      best = Math.max(best, emergedAt(sh.emerge, 0) - emergedAt(sh.emerge, 1));
    });
    expect(best).toBeGreaterThanOrEqual(0.6);
  });

  test("falling: a step where the tail is out while the head is back under", () => {
    let best = -Infinity;
    runShow("leap", (_, sh) => {
      best = Math.max(best, emergedAt(sh.emerge, 1) - emergedAt(sh.emerge, 0));
    });
    expect(best).toBeGreaterThanOrEqual(0.6);
  });

  test("airborne time: a leap is above 0.05 of its height for at least 1.6 s", () => {
    let airborne = 0;
    runShow("leap", (_, sh) => {
      if (sh.height > 0.05) airborne += DT;
    });
    expect(airborne).toBeGreaterThanOrEqual(1.6);
  });

  test("airborne time: a breachRoll is above 0.05 of its height for at least 2.2 s", () => {
    let airborne = 0;
    runShow("breachRoll", (_, sh) => {
      if (sh.height > 0.05) airborne += DT;
    });
    expect(airborne).toBeGreaterThanOrEqual(2.2);
  });

  test("order: snout out, tail clears, snout back in, tail under", () => {
    // Each surface event as [kind, is it at the snout]: the snout is the nearer end of the body to the event.
    const seen: [string, boolean][] = [];
    const world = worldOf(pod("bottlenose", 1));
    const sh = world.creatures[0];
    place(sh, 0.3 * W, H / 2, 0);
    expect(world.startShow(sh, "leap")).toBeGreaterThan(0);
    const steps = Math.round((ACTIONS.leap.seconds + 1) / DT);
    for (let i = 0; i < steps; i++) {
      world.step(DT);
      const n = sh.nodes.length;
      for (const e of world.events) {
        if (e.kind !== "splash" && e.kind !== "ripple") continue;
        const toSnout = Math.hypot(e.x - sh.nodes[0], e.y - sh.nodes[1]);
        const toTail = Math.hypot(e.x - sh.nodes[n - 2], e.y - sh.nodes[n - 1]);
        seen.push([e.kind, toSnout < toTail]);
      }
      world.events.length = 0;
    }
    expect(seen).toEqual([
      ["splash", true],
      ["ripple", false],
      ["splash", true],
      ["splash", false],
    ]);
  });
});
