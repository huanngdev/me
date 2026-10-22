import { describe, expect, test } from "bun:test";

import { rosterFromGroups } from "../creatures/roster";
import { createRng } from "../math";
import { World } from "../world";

describe("humpback size", () => {
  test("in the 700×394 demo, a humpback with two bottlenose is at least 215 px long, over three seeds", () => {
    // The real demo roster through rosterFromGroups, so the ±8% size jitter is in play.
    for (const seed of [1, 2, 3]) {
      const { entries } = rosterFromGroups(
        [{ species: "humpback" }, { species: "bottlenose", count: 2 }],
        "stylized",
        createRng(seed),
      );
      const world = new World({ roster: entries, seed, fishCount: 0 });
      world.resize(700, 394, 10, 14.5);
      const humpback = world.creatures.find((c) => c.species === "humpback");
      expect(humpback).toBeDefined();
      if (!humpback) return;
      expect(humpback.length).toBeGreaterThanOrEqual(215);
    }
  });

  test("a sharks-only roster keeps the old base length (0.44 of the short side)", () => {
    const world = new World({
      roster: [{ species: "classic", rel: 1, depth: 1 }],
      seed: 7,
      fishCount: 0,
    });
    world.resize(700, 394, 10, 14.5);
    expect(world.creatures[0].length).toBeCloseTo(0.44 * 394, 6);
  });
});
