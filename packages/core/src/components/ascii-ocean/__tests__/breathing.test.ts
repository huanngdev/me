import { describe, expect, test } from "bun:test";

import { CREATURES } from "../creatures";
import type { RosterEntry } from "../creatures/roster";
import { TAXA } from "../creatures/taxa";
import type { CreatureSpecies } from "../creatures/types";
import {
  advanceBreath,
  BLOW_INTERVAL,
  type BreathProfile,
  BREATH_PROFILES,
  DRIFT_AMP,
  DRIFT_PERIOD,
  MAX_DIVE_RATE,
  RISE_MIN,
  startBreath,
} from "../creatures/vertical";
import { type Creature, SPINE_NODES, World, type WorldEvent } from "../world";

const DT = 1 / 60;
const W = 1200;
const H = 700;
const SEED = 11;
const MAMMALS: CreatureSpecies[] = ["bottlenose", "orca", "humpback"];
const ALL_SPECIES = Object.keys(CREATURES) as CreatureSpecies[];

/** A world holding `roster` in the ocean, with no bait fish, so only the animals' vertical fields move. */
function oceanWorld(roster: RosterEntry[], seed = SEED, scene: "ocean" | "pond" = "ocean") {
  const world = new World({ roster, seed, baitFish: false, scene });
  world.resize(W, H, 10, 14.5);
  return world;
}

/** Steps `seconds` of sim time, calling `visit` after each step. */
function run(world: World, seconds: number, visit: (step: number) => void) {
  const steps = Math.round(seconds / DT);
  for (let s = 0; s < steps; s++) {
    world.step(DT);
    visit(s);
  }
}

describe("breathing: which animals breathe", () => {
  test("only mammals breathe: a breath exists exactly for the mammal species, and the taxon says so", () => {
    for (const species of ALL_SPECIES) {
      const world = oceanWorld([{ species, rel: 1, depth: 1 }]);
      const sh = world.creatures[0];
      const mammal = TAXA[CREATURES[species].taxon].breathes;
      expect(sh.breath !== null).toBe(mammal);
      expect(CREATURES[species].taxon === "mammal").toBe(mammal);
    }
  });

  test("every mammal species has a breathing profile", () => {
    for (const species of MAMMALS) expect(BREATH_PROFILES[species]).toBeDefined();
  });

  test("pond koi, pond mammals and fish in the pond have no breathing and no drift", () => {
    const world = oceanWorld(
      [
        { species: "koi", rel: 1, depth: 1, coat: "kohaku" },
        { species: "humpback", rel: 0.6, depth: 0.6 },
      ],
      SEED,
      "pond",
    );
    run(world, 60, () => {});
    for (const sh of world.creatures) {
      expect(sh.breath).toBeNull();
      expect(sh.drift).toBeNull();
      expect(sh.depthOffset).toBe(0);
    }
  });
});

describe("breathing: schedule", () => {
  const roster: RosterEntry[] = [
    { species: "humpback", rel: 1, depth: 1 },
    { species: "orca", rel: 0.8, depth: 0.8 },
    { species: "bottlenose", rel: 0.6, depth: 0.6 },
  ];

  /** Every step's (phase, dive) for each creature, plus each blow event's point and kind. */
  function trace(seed: number) {
    const world = oceanWorld(roster, seed);
    const rows: string[] = [];
    run(world, 120, () => {
      for (const sh of world.creatures) {
        rows.push(`${sh.breath?.phase}:${sh.dive.toFixed(9)}`);
      }
      for (const e of world.events) rows.push(eventKey(e));
      world.events.length = 0;
    });
    return rows.join("|");
  }

  test("the same seed gives the same schedule and blows", () => {
    expect(trace(5)).toBe(trace(5));
  });

  test("a different seed gives a different schedule", () => {
    expect(trace(5)).not.toBe(trace(6));
  });

  test("each phase lasts within its range (the first dive starts part way through, so it is skipped)", () => {
    const world = oceanWorld(roster);
    // Per animal: the phase it is in, when it entered it, and how many phases it has finished since the start.
    const current = new Map<Creature, { phase: string; t: number; changes: number }>();
    const durations: { phase: string; species: string; d: number }[] = [];
    run(world, 400, () => {
      for (const sh of world.creatures) {
        if (!sh.breath) continue;
        const prev = current.get(sh);
        if (!prev) {
          current.set(sh, { phase: sh.breath.phase, t: world.time, changes: 0 });
        } else if (prev.phase !== sh.breath.phase) {
          // The first phase was already under way when the sim started, so its length is not measured.
          if (prev.changes > 0)
            durations.push({ phase: prev.phase, species: sh.species, d: world.time - prev.t });
          current.set(sh, { phase: sh.breath.phase, t: world.time, changes: prev.changes + 1 });
        }
      }
    });
    expect(durations.length).toBeGreaterThan(10);
    for (const { phase, species, d } of durations) {
      const p = BREATH_PROFILES[species as CreatureSpecies];
      if (!p) continue;
      if (phase === "dive") expect(d).toBeGreaterThanOrEqual(p.dive[0] - 2 * DT);
      if (phase === "dive") expect(d).toBeLessThanOrEqual(p.dive[1] + 2 * DT);
      if (phase === "surface") expect(d).toBeGreaterThanOrEqual(p.surface[0] - 2 * DT);
      if (phase === "surface") expect(d).toBeLessThanOrEqual(p.surface[1] + 2 * DT);
      if (phase === "rise" || phase === "sink") expect(d).toBeGreaterThanOrEqual(RISE_MIN - 2 * DT);
    }
  });
});

describe("breathing: smooth depth", () => {
  test("the depth change per 1/60 s step is bounded: at most MAX_DIVE_RATE / 60 for every mammal", () => {
    const world = oceanWorld([
      { species: "humpback", rel: 1, depth: 1 },
      { species: "orca", rel: 0.8, depth: 0.8 },
      { species: "bottlenose", rel: 0.6, depth: 0.6 },
    ]);
    const prev = world.creatures.map((sh) => sh.dive);
    let worst = 0;
    let rises = 0;
    run(world, 300, () => {
      world.creatures.forEach((sh, i) => {
        worst = Math.max(worst, Math.abs(sh.dive - prev[i]));
        prev[i] = sh.dive;
        if (sh.breath?.phase === "rise") rises++;
      });
    });
    // The bound: smoothstep's peak slope is 1.5, over a rise of at least 1.5 s, so |Δdive| ≤ 1.5·dt/1.5 = dt.
    expect(MAX_DIVE_RATE * DT).toBeCloseTo(DT, 12);
    expect(worst).toBeLessThanOrEqual(MAX_DIVE_RATE * DT + 1e-9);
    expect(rises).toBeGreaterThan(0);
  });

  test("every animal reaches the surface within one full cycle from any start", () => {
    const world = oceanWorld([
      { species: "humpback", rel: 1, depth: 1 },
      { species: "orca", rel: 0.8, depth: 0.8 },
      { species: "bottlenose", rel: 0.6, depth: 0.6 },
    ]);
    const firstSurface = new Array<number>(world.creatures.length).fill(-1);
    run(world, 90, () => {
      world.creatures.forEach((sh, i) => {
        if (firstSurface[i] < 0 && sh.dive === 0) firstSurface[i] = world.time;
      });
    });
    world.creatures.forEach((sh, i) => {
      const p = BREATH_PROFILES[sh.species];
      if (!p) throw new Error(`no profile for ${sh.species}`);
      // One cycle from the start is the longest dive plus the rise.
      const cycle = p.dive[1] + RISE_MIN + 1;
      expect(firstSurface[i]).toBeGreaterThan(0);
      expect(firstSurface[i]).toBeLessThanOrEqual(cycle);
    });
  });
});

describe("breathing: blows", () => {
  test("blows fire only at or after a surfacing, and every surfacing blows", () => {
    const world = oceanWorld([
      { species: "humpback", rel: 1, depth: 1 },
      { species: "orca", rel: 0.8, depth: 0.8 },
      { species: "bottlenose", rel: 0.6, depth: 0.6 },
    ]);
    const prevPhase = world.creatures.map((sh) => sh.breath?.phase);
    let surfacings = 0;
    let blows = 0;
    run(world, 300, () => {
      let stepSurfacings = 0;
      // A blow can land on the step an animal leaves the surface, so "at the surface" includes last step.
      const atSurface = world.creatures.some(
        (sh, i) => sh.breath?.phase === "surface" || prevPhase[i] === "surface",
      );
      world.creatures.forEach((sh, i) => {
        if (sh.breath?.phase === "surface" && prevPhase[i] !== "surface") stepSurfacings++;
        prevPhase[i] = sh.breath?.phase;
      });
      const stepBlows = world.events.filter((e) => e.kind === "blow").length;
      if (stepBlows > 0) expect(atSurface).toBe(true);
      surfacings += stepSurfacings;
      blows += stepBlows;
      world.events.length = 0;
    });
    expect(surfacings).toBeGreaterThanOrEqual(3);
    expect(blows).toBeGreaterThanOrEqual(surfacings);
  });

  test("the spray repeats about every 0.9 s while the animal stays at the surface", () => {
    const b = startBreath(BREATH_PROFILES.humpback as BreathProfile, 3);
    const stays: { blows: number; length: number }[] = [];
    let inStay = false;
    let blows = 0;
    let length = 0;
    for (let i = 0; i < 60 * 600; i++) {
      const n = advanceBreath(b, DT);
      if (!inStay && b.phase === "surface") {
        inStay = true;
        blows = 0;
        length = b.duration;
      }
      if (inStay) blows += n;
      if (inStay && b.phase !== "surface") {
        stays.push({ blows, length });
        inStay = false;
      }
    }
    expect(stays.length).toBeGreaterThanOrEqual(3);
    for (const { blows: count, length: len } of stays) {
      // One on arrival, then one every BLOW_INTERVAL, up to the end of the stay.
      expect(count).toBe(Math.floor(len / BLOW_INTERVAL) + 1);
    }
  });

  test("the blow comes from the blowhole: a point on the spine at 0.14 of the body from the snout", () => {
    const world = oceanWorld([{ species: "humpback", rel: 1, depth: 1 }]);
    const sh = world.creatures[0];
    let checked = 0;
    run(world, 120, () => {
      const blow = world.events.find(
        (e): e is Extract<WorldEvent, { kind: "blow" }> => e.kind === "blow",
      );
      world.events.length = 0;
      if (!blow) return;
      // 0.14 × (SPINE_NODES − 1) = 2.66: two thirds of the way from node 2 to node 3.
      const at = 0.14 * (SPINE_NODES - 1);
      const i = Math.floor(at);
      const t = at - i;
      const ex = sh.nodes[2 * i] + (sh.nodes[2 * i + 2] - sh.nodes[2 * i]) * t;
      const ey = sh.nodes[2 * i + 1] + (sh.nodes[2 * i + 3] - sh.nodes[2 * i + 1]) * t;
      expect(Math.hypot(blow.x - ex, blow.y - ey)).toBeLessThan(1e-3);
      checked++;
    });
    expect(checked).toBeGreaterThan(0);
  });

  test("humpback blows are bigger and longer-lived than the orca and bottlenose blows", () => {
    const hump = BREATH_PROFILES.humpback?.blow;
    const orca = BREATH_PROFILES.orca?.blow;
    const bottlenose = BREATH_PROFILES.bottlenose?.blow;
    if (!hump || !orca || !bottlenose) throw new Error("missing blow profile");
    expect(hump.drops).toBeGreaterThan(orca.drops);
    expect(hump.reach).toBeGreaterThan(orca.reach);
    expect(hump.life).toBeGreaterThan(orca.life);
    expect(orca.life).toBeCloseTo(bottlenose.life, 10);
    // Droplets live life × (1 … 1.67) s, so the midpoint is about 1.2 s for the humpback and 0.6 s for the others.
    expect(hump.life * (4 / 3)).toBeCloseTo(1.2, 10);
    expect(orca.life * (4 / 3)).toBeCloseTo(0.6, 10);
  });
});

describe("drift: fish", () => {
  test("a fish's depth offset stays within the band and moves smoothly", () => {
    const world = oceanWorld([
      { species: "classic", rel: 1, depth: 1 },
      { species: "tiger", rel: 0.8, depth: 0.8 },
      { species: "koi", rel: 0.7, depth: 0.7, coat: "kohaku" },
    ]);
    const fish = world.creatures.filter((sh) => sh.drift !== null);
    expect(fish.length).toBe(3);
    const prev = fish.map((sh) => sh.depthOffset);
    const stepBound = (DRIFT_AMP * 2 * Math.PI * DT) / DRIFT_PERIOD[0] + 1e-9;
    let worstStep = 0;
    let lo = Infinity;
    let hi = -Infinity;
    run(world, 120, () => {
      fish.forEach((sh, i) => {
        const o = sh.depthOffset;
        expect(Math.abs(o)).toBeLessThanOrEqual(DRIFT_AMP + 1e-12);
        worstStep = Math.max(worstStep, Math.abs(o - prev[i]));
        prev[i] = o;
        lo = Math.min(lo, o);
        hi = Math.max(hi, o);
      });
    });
    expect(worstStep).toBeLessThanOrEqual(stepBound);
    // Over two minutes the drift swings most of its range, so colour does visibly change.
    expect(hi - lo).toBeGreaterThan(DRIFT_AMP);
  });

  test("the drift is the same for the same seed", () => {
    const roster: RosterEntry[] = [{ species: "classic", rel: 1, depth: 1 }];
    const a = oceanWorld(roster, 3);
    const b = oceanWorld(roster, 3);
    run(a, 30, () => {});
    run(b, 30, () => {});
    expect(a.creatures[0].depthOffset).toBe(b.creatures[0].depthOffset);
  });
});

/** A short string for one blow or splash event, so a trace can compare them. */
function eventKey(e: WorldEvent) {
  return e.kind === "blow" ? `blow@${e.x.toFixed(6)},${e.y.toFixed(6)}` : `splash@${e.x},${e.y}`;
}
