import { describe, expect, test } from "bun:test";

import {
  MAX_CREATURES,
  MAX_PER_GROUP,
  rosterFromGroups,
  rosterFromSharks,
} from "../creatures/roster";
import type { CreatureSpecies } from "../creatures/types";
import { World } from "../world";

const half = () => 0.5;

describe("rosterFromSharks", () => {
  test("keeps size as length and depth", () => {
    const entries = rosterFromSharks([
      { kind: "classic", size: 1 },
      { kind: "nurse", size: 0.7 },
    ]);
    expect(entries).toEqual([
      { species: "classic", rel: 1, depth: 1 },
      { species: "nurse", rel: 0.7, depth: 0.7 },
    ]);
  });
});

describe("rosterFromGroups", () => {
  test("stylized scale compresses the size ratio", () => {
    const { entries, warnings } = rosterFromGroups(
      [{ species: "classic" }, { species: "nurse" }],
      "stylized",
      half,
    );
    expect(warnings).toEqual([]);
    expect(entries[0].rel).toBeCloseTo(1, 10);
    expect(entries[1].rel).toBeCloseTo((2.8 / 5) ** 0.45, 10);
    expect(entries[0].depth).toBeCloseTo(1, 10);
  });

  test("true scale keeps the real length ratio", () => {
    const { entries } = rosterFromGroups(
      [{ species: "classic" }, { species: "nurse" }],
      "true",
      half,
    );
    expect(entries[1].rel).toBeCloseTo(0.56, 10);
  });

  test("empty groups give no entries and no warnings", () => {
    expect(rosterFromGroups([], "stylized", half)).toEqual({ entries: [], warnings: [] });
  });

  test("count above the per-group cap is clamped with a warning", () => {
    const { entries, warnings } = rosterFromGroups(
      [{ species: "classic", count: 20 }],
      "stylized",
      half,
    );
    expect(entries.length).toBe(MAX_PER_GROUP);
    expect(warnings.length).toBe(1);
  });

  test("a non-finite or zero count becomes 1 with a warning", () => {
    for (const count of [Number.NaN, Number.POSITIVE_INFINITY, 0]) {
      const { entries, warnings } = rosterFromGroups(
        [{ species: "classic", count }],
        "stylized",
        half,
      );
      expect(entries.length).toBe(1);
      expect(warnings.length).toBe(1);
    }
  });

  test("an unknown species is skipped with a warning and no rng call", () => {
    let calls = 0;
    const counting = () => {
      calls++;
      return 0.5;
    };
    const { entries, warnings } = rosterFromGroups(
      [{ species: "kraken" as CreatureSpecies }, { species: "classic" }],
      "stylized",
      counting,
    );
    expect(entries.map((e) => e.species)).toEqual(["classic"]);
    expect(warnings).toEqual(['unknown species "kraken"; skipped']);
    expect(calls).toBe(1);
  });

  test("the total is clamped to MAX_CREATURES with a warning", () => {
    const { entries, warnings } = rosterFromGroups(
      [
        { species: "classic", count: 12 },
        { species: "mako", count: 12 },
        { species: "nurse", count: 12 },
      ],
      "stylized",
      half,
    );
    expect(entries.length).toBe(MAX_CREATURES);
    const perSpecies = (name: string) => entries.filter((e) => e.species === name).length;
    expect(perSpecies("classic")).toBe(12);
    expect(perSpecies("mako")).toBe(4);
    expect(perSpecies("nurse")).toBe(0);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.some((w) => w.includes("16"))).toBe(true);
  });

  test("depth is 1 for the largest animal and the rel ratio for the rest", () => {
    const { entries } = rosterFromGroups(
      [{ species: "classic" }, { species: "nurse" }],
      "stylized",
      half,
    );
    expect(entries[0].depth).toBeCloseTo(1, 10);
    expect(entries[1].depth).toBeCloseTo(entries[1].rel, 10);
  });

  test("a fractional count is floored with a warning", () => {
    const { entries, warnings } = rosterFromGroups(
      [{ species: "classic", count: 2.7 }],
      "stylized",
      half,
    );
    expect(entries.length).toBe(2);
    expect(warnings.length).toBe(1);
  });

  test("a non-positive size becomes 1 with a warning", () => {
    const { entries, warnings } = rosterFromGroups(
      [{ species: "classic", size: -1 }],
      "stylized",
      half,
    );
    expect(entries[0].rel).toBeCloseTo(1, 10);
    expect(warnings.length).toBe(1);
  });

  test("calls the rng once per animal, in order", () => {
    let calls = 0;
    const counting = () => {
      calls++;
      return 0.5;
    };
    const { entries } = rosterFromGroups(
      [
        { species: "classic", count: 3 },
        { species: "nurse", count: 2 },
      ],
      "stylized",
      counting,
    );
    expect(calls).toBe(5);
    expect(entries.map((e) => e.species)).toEqual([
      "classic",
      "classic",
      "classic",
      "nurse",
      "nurse",
    ]);
  });
});

describe("rosterFromGroups varieties", () => {
  test("a variety string sets every animal's coat", () => {
    const { entries, warnings } = rosterFromGroups(
      [{ species: "koi", count: 2, variety: "sanke" }],
      "stylized",
      half,
    );
    expect(warnings).toEqual([]);
    expect(entries.map((e) => e.coat)).toEqual(["sanke", "sanke"]);
  });

  test("no variety gives the species' default coat with no extra rng call", () => {
    let calls = 0;
    const counting = () => {
      calls++;
      return 0.5;
    };
    const { entries } = rosterFromGroups([{ species: "koi" }], "stylized", counting);
    expect(entries[0].coat).toBe("kohaku");
    expect(calls).toBe(1);
  });

  test("a variety list picks one per animal, with a second rng call after each jitter", () => {
    const sequence = [0.1, 0.9, 0.1, 0.1];
    let calls = 0;
    const scripted = () => sequence[calls++];
    const { entries } = rosterFromGroups(
      [{ species: "koi", count: 2, variety: ["kohaku", "asagi"] }],
      "stylized",
      scripted,
    );
    expect(calls).toBe(4);
    // Animal 1 picks floor(0.9 × 2) = asagi; animal 2 picks floor(0.1 × 2) = kohaku.
    expect(entries.map((e) => e.coat)).toEqual(["asagi", "kohaku"]);
  });

  test("an unknown variety warns and uses the default coat", () => {
    const { entries, warnings } = rosterFromGroups(
      [{ species: "koi", variety: "gold" }],
      "stylized",
      half,
    );
    expect(entries[0].coat).toBe("kohaku");
    expect(warnings).toEqual(['koi variety "gold" is unknown; using kohaku']);
  });

  test("unknown names in a list are skipped with a warning", () => {
    const { entries, warnings } = rosterFromGroups(
      [{ species: "koi", variety: ["sumi", "tancho"] }],
      "stylized",
      half,
    );
    expect(entries[0].coat).toBe("tancho");
    expect(warnings).toEqual(['koi variety "sumi" is unknown; skipped']);
  });

  test("a shark asked for a variety it lacks falls back to its own coat, with one warning and one rng call", () => {
    // Every shark now has a natural coat, so the fallback is the shark's default rather than no coat.
    let calls = 0;
    const counting = () => {
      calls++;
      return 0.5;
    };
    const { entries, warnings } = rosterFromGroups(
      [{ species: "classic", variety: "kohaku" }],
      "stylized",
      counting,
    );
    expect(entries[0].coat).toBe("classic");
    expect(warnings).toEqual(['classic variety "kohaku" is unknown; using classic']);
    expect(calls).toBe(1);
  });
});

describe("World with a roster", () => {
  test("baitFish false has no fish and survives resizes without reseeding", () => {
    const world = new World({ baitFish: false });
    world.resize(1200, 700, 10, 14.5);
    expect(world.fish.length).toBe(0);
    expect(world.creatures.length).toBeGreaterThan(0);

    const ids = world.creatures.map((c) => c.id);
    const lengths = world.creatures.map((c) => c.length);
    for (let i = 0; i < 300; i++) world.step(1 / 60);
    world.resize(900, 600, 8, 12);

    expect(world.fish.length).toBe(0);
    expect(world.creatures.map((c) => c.id)).toEqual(ids);
    expect(world.creatures.map((c) => c.length)).toEqual(lengths);
  });

  test("fishCount overrides baitFish", () => {
    const world = new World({ fishCount: 10, baitFish: false });
    world.resize(1200, 700, 10, 14.5);
    expect(world.fish.length).toBe(10);
  });

  test("baitFish clamps to 0 and 600", () => {
    const none = new World({ baitFish: 0 });
    none.resize(1200, 700, 10, 14.5);
    expect(none.fish.length).toBe(0);

    const many = new World({ baitFish: 100 });
    many.resize(1200, 700, 10, 14.5);
    expect(many.fish.length).toBe(600);
  });

  test("baitFish 2 gives about twice the auto count", () => {
    const auto = new World({ seed: 1 });
    auto.resize(1200, 700, 10, 14.5);
    const doubled = new World({ seed: 1, baitFish: 2 });
    doubled.resize(1200, 700, 10, 14.5);
    expect(Math.abs(doubled.fish.length - 2 * auto.fish.length)).toBeLessThanOrEqual(2);
  });
});
