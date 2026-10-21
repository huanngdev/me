import { describe, expect, test } from "bun:test";

import type { RosterEntry } from "../creatures/roster";
import { type Creature, World, type WorldEvent } from "../world";

const DT = 1 / 60;

/** Steps the world for `seconds`, collecting every event it raised. */
function run(world: World, seconds: number) {
  const seen: WorldEvent[] = [];
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i++) {
    world.step(DT);
    for (const e of world.events) seen.push(e);
    world.events.length = 0;
  }
  return seen;
}

/** A point `dist` px ahead of a creature's snout, along its heading. */
function inFront(sh: Creature, dist: number) {
  return {
    x: sh.nodes[0] + Math.cos(sh.heading) * dist,
    y: sh.nodes[1] + Math.sin(sh.heading) * dist,
  };
}

const koi = (count: number): RosterEntry[] =>
  Array.from({ length: count }, () => ({ species: "koi", rel: 1, depth: 1, coat: "kohaku" }));

describe("ascii-ocean feeding", () => {
  test("a pond with no clicks stays calm: no morsels, every creature cruising", () => {
    const world = new World({ seed: 3, scene: "pond", baitFish: false });
    world.resize(1200, 700, 10, 14.5);
    const states = new Set<string>();
    for (let i = 0; i < 600; i++) {
      world.step(DT);
      for (const m of world.morsels) expect(m.alive).toBe(false);
      for (const sh of world.creatures) states.add(sh.state);
    }
    expect([...states]).toEqual(["cruise"]);
  });

  test("a shark answers food dropped in front of it, and eats", () => {
    const world = new World({ seed: 5 });
    world.resize(1200, 700, 10, 14.5);
    const sh = world.creatures[0];
    const at = inFront(sh, 100);
    expect(world.offerFood(at.x, at.y)).toBe(true);

    const states = new Set<string>();
    let eaten = 0;
    for (let i = 0; i < Math.round(8 / DT); i++) {
      world.step(DT);
      states.add(sh.state);
      for (const e of world.events) if (e.kind === "eat") eaten++;
      world.events.length = 0;
    }
    expect(eaten).toBeGreaterThanOrEqual(1);
    expect(states.has("approach")).toBe(true);
  });

  test("a group whose last morsel is eaten is spent, so its food slot frees up", () => {
    const world = new World({ seed: 5 });
    world.resize(1200, 700, 10, 14.5);
    const at = inFront(world.creatures[0], 100);
    expect(world.offerFood(at.x, at.y)).toBe(true);
    // State override: eat every morsel the way eatNear does (alive = false, group untouched).
    for (const m of world.morsels) m.alive = false;
    world.step(DT);
    for (const g of world.food) expect(g.alive).toBe(false);
  });

  test("with nobody in range, the nearest shark glances at food and goes back to cruising", () => {
    const world = new World({ seed: 5 });
    world.resize(4000, 300, 10, 14.5);
    const at = { x: 50, y: 50 };
    let nearest = world.creatures[0];
    for (const sh of world.creatures) {
      if (
        Math.hypot(sh.nodes[0] - at.x, sh.nodes[1] - at.y) <
        Math.hypot(nearest.nodes[0] - at.x, nearest.nodes[1] - at.y)
      )
        nearest = sh;
    }
    // Far outside the sense range (0.9 of the 300 px short side), so the glance is all there is.
    expect(Math.hypot(nearest.nodes[0] - at.x, nearest.nodes[1] - at.y)).toBeGreaterThan(270);

    world.offerFood(at.x, at.y);
    world.step(DT);
    expect(nearest.state).toBe("notice");
    run(world, 1.5);
    expect(nearest.state).toBe("cruise");
  });

  test("koi gather at a pond offering: at least two pellets eaten, with ripples", () => {
    const world = new World({ seed: 9, scene: "pond", baitFish: false, roster: koi(3) });
    world.resize(1200, 700, 10, 14.5);
    const first = world.creatures[0];
    const at = inFront(first, 60);
    world.offerFood(at.x, at.y);

    const seen = run(world, 10);
    const eaten = seen.filter((e) => e.kind === "eat").length;
    const ripples = seen.filter((e) => e.kind === "ripple").length;
    expect(eaten).toBeGreaterThanOrEqual(2);
    expect(ripples).toBeGreaterThanOrEqual(1);
  });

  test("ten offers in a row: six groups at most, morsels in the pool, and the seventh returns false", () => {
    const world = new World({ seed: 11 });
    world.resize(1200, 700, 10, 14.5);
    const results: boolean[] = [];
    for (let i = 0; i < 10; i++) results.push(world.offerFood(100 + i * 60, 300));

    expect(results[6]).toBe(false);
    expect(results.slice(6).every((r) => r === false)).toBe(true);
    expect(world.food.filter((g) => g.alive).length).toBeLessThanOrEqual(6);
    expect(world.morsels.filter((m) => m.alive).length).toBeLessThanOrEqual(48);
  });

  test("a shark that just responded ignores a second offer a second later", () => {
    const world = new World({ seed: 5 });
    world.resize(1200, 700, 10, 14.5);
    const sh = world.creatures[0];
    const first = inFront(sh, 100);
    world.offerFood(first.x, first.y);
    const cooldown = sh.cooldownUntil;
    expect(cooldown).toBeGreaterThan(world.time);

    run(world, 1);
    // Free it up so only the cooldown can keep it from answering.
    sh.state = "cruise";
    sh.foodGroup = -1;
    sh.actionId = null;
    const second = inFront(sh, 100);
    world.offerFood(second.x, second.y);
    expect(sh.cooldownUntil).toBe(cooldown);
    expect(sh.foodGroup).toBe(-1);
  });

  test("a koi beside the pointer drifts toward it: the distance shrinks by more than 40%", () => {
    const world = new World({ seed: 4, scene: "pond", baitFish: false, roster: koi(1) });
    world.resize(1200, 700, 10, 14.5);
    const sh = world.creatures[0];
    world.pointer.active = true;
    const place = () => {
      const at = inFront(sh, 150);
      world.pointer.x = at.x;
      world.pointer.y = at.y;
    };
    place();
    const d0 = Math.hypot(sh.nodes[0] - world.pointer.x, sh.nodes[1] - world.pointer.y);
    run(world, 4);
    const d1 = Math.hypot(sh.nodes[0] - world.pointer.x, sh.nodes[1] - world.pointer.y);
    expect(d1).toBeLessThan(d0 * 0.6);
  });

  test("sharks ignore the pointer: they don't follow it", () => {
    const world = new World({ seed: 5 });
    world.resize(1200, 700, 10, 14.5);
    const sh = world.creatures[0];
    world.pointer.active = true;
    const at = inFront(sh, 150);
    world.pointer.x = at.x;
    world.pointer.y = at.y;
    const d0 = Math.hypot(sh.nodes[0] - at.x, sh.nodes[1] - at.y);
    run(world, 4);
    const d1 = Math.hypot(sh.nodes[0] - world.pointer.x, sh.nodes[1] - world.pointer.y);
    expect(d1).toBeGreaterThan(d0 * 0.6);
  });

  test("the food pools never grow: 100 offers and steps keep 48 morsels and 6 groups", () => {
    const world = new World({ seed: 13, scene: "pond", baitFish: false, roster: koi(3) });
    world.resize(1200, 700, 10, 14.5);
    for (let i = 0; i < 100; i++) {
      world.offerFood(200 + (i % 10) * 90, 200 + (i % 7) * 60);
      run(world, 0.2);
    }
    expect(world.morsels.length).toBe(48);
    expect(world.food.length).toBe(6);
  });
});
