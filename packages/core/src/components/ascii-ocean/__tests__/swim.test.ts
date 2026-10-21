import { describe, expect, test } from "bun:test";

import { CREATURE_IDS } from "../creatures";
import { behaviourOf, DEFAULT_TURN_RADIUS, EDGE_TURN_RADIUS } from "../creatures/behaviour";
import { type RosterEntry, rosterFromGroups } from "../creatures/roster";
import type { CreatureSpecies } from "../creatures/types";
import { angleDiff, createRng } from "../math";
import { type Creature, SPINE_NODES, World } from "../world";

const DT = 1 / 60;
const W = 1200;
const H = 700;
const SECONDS = 120;
const SEEDS = [1, 2, 3];
const FISH = 20;
const STEPS = Math.round(SECONDS / DT);

/** The animal's cruise speed, as stepCreatures sets it (the top of its speed range). */
const cruiseOf = (L: number) => 30 + L * 0.04;
/** Heading turn cap per second in stepCreatures: agility is at most 0.8, and at most speed / (L · turnRadius). */
const TURN_CAP = 0.8;
/** The koi pond bob eases at DIVE_RATE per second, toward a target between 0 and 1. */
const DIVE_RATE = 5;

/** Snout-to-tail polyline length of a creature's spine. */
function spineLength(sh: Creature) {
  let total = 0;
  for (let k = 1; k < SPINE_NODES; k++) {
    total += Math.hypot(
      sh.nodes[k * 2] - sh.nodes[(k - 1) * 2],
      sh.nodes[k * 2 + 1] - sh.nodes[(k - 1) * 2 + 1],
    );
  }
  return total;
}

/** Shortest signed turn from `a` to `b`, in radians. */
const turnBetween = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

type Run = {
  finite: boolean;
  /** Worst spine-length drift from each animal's own length at 1 s, as a fraction. */
  spineDrift: number;
  /** Worst step (px) minus its bound, and worst turn (rad) minus its bound; both must be 0 or less. */
  worstStepExcess: number;
  worstTurnExcess: number;
  onStage: number;
  worstWindowDisplacement: number;
  worstDiveStep: number;
  diveStepBound: number;
};

/**
 * Runs one species for 120 s and records what the stability tests check. Koi run in the pond scene; every
 * other species in the ocean. Each run is 3 of the species plus 20 bait fish.
 */
function stabilityRun(species: CreatureSpecies, seed: number): Run {
  const scene = species === "koi" ? "pond" : "ocean";
  const { entries } = rosterFromGroups([{ species, count: 3 }], "stylized", createRng(seed));
  const world = new World({ roster: entries, seed, fishCount: FISH, scene });
  world.resize(W, H, 10, 14.5);

  const n = world.creatures.length;
  const prevSnout = new Float64Array(n * 2);
  const prevHeading = new Float64Array(n);
  const prevSpeed = new Float64Array(n);
  const prevDive = new Float64Array(n);
  const snoutHistory: Float64Array[] = world.creatures.map(() => new Float64Array(STEPS * 2 + 2));
  const radius = behaviourOf(species).turnRadius ?? DEFAULT_TURN_RADIUS;
  const maxCruise = Math.max(...world.creatures.map((sh) => cruiseOf(sh.length)));
  const run: Run = {
    finite: true,
    spineDrift: 0,
    worstStepExcess: -Infinity,
    worstTurnExcess: -Infinity,
    onStage: 0,
    worstWindowDisplacement: Infinity,
    worstDiveStep: 0,
    diveStepBound: DIVE_RATE * DT + 1e-9,
  };
  const spineAt1s = new Float64Array(n);
  let stageSamples = 0;

  for (let step = 1; step <= STEPS; step++) {
    world.creatures.forEach((sh, i) => {
      prevSnout[i * 2] = sh.nodes[0];
      prevSnout[i * 2 + 1] = sh.nodes[1];
      prevHeading[i] = sh.heading;
      prevSpeed[i] = sh.speed;
      prevDive[i] = sh.dive;
    });
    world.step(DT);

    world.creatures.forEach((sh, i) => {
      const L = sh.length;
      // Finite everywhere.
      for (let k = 0; k < sh.nodes.length; k++)
        if (!Number.isFinite(sh.nodes[k])) run.finite = false;
      if (!Number.isFinite(sh.heading) || !Number.isFinite(sh.speed)) run.finite = false;

      // Spine: the polyline length, from the moment the world is one second old.
      const spine = spineLength(sh);
      if (step === 60) spineAt1s[i] = spine;
      if (step >= 60) run.spineDrift = Math.max(run.spineDrift, Math.abs(spine / spineAt1s[i] - 1));

      // No snapping: the snout's step, and the heading's turn, against their limits.
      const moved = Math.hypot(sh.nodes[0] - prevSnout[i * 2], sh.nodes[1] - prevSnout[i * 2 + 1]);
      const stepBound = 1.6 * maxCruise * DT + 0.5;
      run.worstStepExcess = Math.max(run.worstStepExcess, moved - stepBound);

      const turned = Math.abs(turnBetween(prevHeading[i], sh.heading));
      // Past the canvas edge the turning radius drops to EDGE_TURN_RADIUS, so the bound follows the snout's position before the step.
      const startOver = Math.max(
        -prevSnout[i * 2],
        prevSnout[i * 2] - W,
        -prevSnout[i * 2 + 1],
        prevSnout[i * 2 + 1] - H,
      );
      const turnRadius = startOver > 0 ? EDGE_TURN_RADIUS : radius;
      const turnBound = Math.min(TURN_CAP, prevSpeed[i] / (L * turnRadius)) * DT + 1e-9;
      run.worstTurnExcess = Math.max(run.worstTurnExcess, turned - turnBound);

      // Stays on stage: the snout within the canvas plus one body length.
      const hx = sh.nodes[0];
      const hy = sh.nodes[1];
      stageSamples++;
      if (hx >= -L && hx <= W + L && hy >= -L && hy <= H + L) run.onStage++;

      // Never stalls: record the snout for the 2 s window check.
      snoutHistory[i][step * 2] = hx;
      snoutHistory[i][step * 2 + 1] = hy;

      // The dive bob eases at DIVE_RATE toward a target in [0, 1]: its step is bounded the same way as a pose.
      run.worstDiveStep = Math.max(run.worstDiveStep, Math.abs(sh.dive - prevDive[i]));
    });
  }
  run.onStage = run.onStage / stageSamples;

  // Stalls: the snout's displacement over every 2 s window.
  const window = Math.round(2 / DT);
  world.creatures.forEach((_, i) => {
    const h = snoutHistory[i];
    for (let step = window + 1; step <= STEPS; step += 1) {
      const dx = h[step * 2] - h[(step - window) * 2];
      const dy = h[step * 2 + 1] - h[(step - window) * 2 + 1];
      run.worstWindowDisplacement = Math.min(run.worstWindowDisplacement, Math.hypot(dx, dy));
    }
  });

  return run;
}

describe("swimming stability: every species, three seeds, 120 s", () => {
  for (const species of CREATURE_IDS) {
    for (const seed of SEEDS) {
      test(`${species} seed ${seed}: finite, spine kept, no snapping, on stage, never stalls`, () => {
        const run = stabilityRun(species, seed);
        expect(run.finite).toBe(true);
        // Spine integrity: the segments are set to exact lengths each step, so the polyline stays at its length.
        expect(run.spineDrift).toBeLessThanOrEqual(0.03);
        // No snapping: the snout's step, and the heading's turn, within their limits.
        expect(run.worstStepExcess).toBeLessThanOrEqual(0);
        expect(run.worstTurnExcess).toBeLessThanOrEqual(1e-9);
        // Stays on stage: 90% of the time, the snout is within the canvas plus one body length.
        expect(run.onStage).toBeGreaterThanOrEqual(0.9);
        // Never stalls: every 2 s window moves the snout.
        expect(run.worstWindowDisplacement).toBeGreaterThan(0);
        // Each pose-like state eases in bounded steps.
        expect(run.worstDiveStep).toBeLessThanOrEqual(run.diveStepBound);
      });
    }
  }
});

describe("pointer", () => {
  test("a koi beside the pointer drifts toward it: the distance shrinks by more than 40%", () => {
    const koi: RosterEntry[] = [{ species: "koi", rel: 1, depth: 1, coat: "kohaku" }];
    const world = new World({ seed: 4, scene: "pond", baitFish: false, roster: koi });
    world.resize(W, H, 10, 14.5);
    const sh = world.creatures[0];
    world.pointer.active = true;
    const at = {
      x: sh.nodes[0] + Math.cos(sh.heading) * 150,
      y: sh.nodes[1] + Math.sin(sh.heading) * 150,
    };
    world.pointer.x = at.x;
    world.pointer.y = at.y;
    const d0 = Math.hypot(sh.nodes[0] - world.pointer.x, sh.nodes[1] - world.pointer.y);
    for (let i = 0; i < Math.round(4 / DT); i++) world.step(DT);
    const d1 = Math.hypot(sh.nodes[0] - world.pointer.x, sh.nodes[1] - world.pointer.y);
    expect(d1).toBeLessThan(d0 * 0.6);
  });

  test("sharks ignore the pointer: a shark's path is identical with the pointer on it and off", () => {
    const run = (pointer: boolean) => {
      const world = new World({ seed: 5, baitFish: false });
      world.resize(W, H, 10, 14.5);
      const sh = world.creatures[0];
      if (pointer) {
        world.pointer.active = true;
        world.pointer.x = sh.nodes[0] + Math.cos(sh.heading) * 150;
        world.pointer.y = sh.nodes[1] + Math.sin(sh.heading) * 150;
      }
      for (let i = 0; i < Math.round(4 / DT); i++) world.step(DT);
      return [sh.nodes[0], sh.nodes[1]];
    };
    expect(run(true)).toEqual(run(false));
  });
});

/*
 * R21d: calmer, steadier swimming. Bend is the sum of |joint angle| along the spine; overlap is the share of frames in
 * which two animals that are not pod mates have a node within 0.5 · (halfWidth A + halfWidth B), with halfWidth ≈ 0.1 L.
 * Each measure runs 60 s at 1200×700 and 700×394 over three seeds. Baselines before R21d (p90 bend 2.88 per shark, 1.62 koi;
 * overlap 0.277 / 0.152 Open ocean, 0.142 / 0.256 Shark gallery) are noted in the comments. The bounds lock what R21d reached.
 */
const METRIC_SECONDS = 60;
const METRIC_STEPS = Math.round(METRIC_SECONDS / DT);
const METRIC_SEEDS = [1, 2, 3];
const METRIC_SIZES: [number, number][] = [
  [1200, 700],
  [700, 394],
];

/** Sum of |angleDiff| across the spine's joints, in radians. */
function spineBend(sh: Creature) {
  let prev = 0;
  let total = 0;
  for (let k = 1; k < SPINE_NODES; k++) {
    const a = Math.atan2(
      sh.nodes[k * 2 + 1] - sh.nodes[(k - 1) * 2 + 1],
      sh.nodes[k * 2] - sh.nodes[(k - 1) * 2],
    );
    if (k > 1) total += Math.abs(angleDiff(prev, a));
    prev = a;
  }
  return total;
}

function percentile(values: number[], p: number) {
  const sorted = Float64Array.from(values).sort();
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

/** p50 and p90 of spine bend over every creature-frame, for three animals of one species. */
function bendPercentiles(species: CreatureSpecies, W: number, H: number) {
  const samples: number[] = [];
  for (const seed of METRIC_SEEDS) {
    const scene = species === "koi" ? "pond" : "ocean";
    const { entries } = rosterFromGroups(
      [{ species, count: 3 }],
      "stylized",
      createRng(seed ^ 0x9e3779b9),
    );
    const world = new World({ roster: entries, seed, scene, baitFish: false });
    world.resize(W, H, 10, 14.5);
    for (let step = 0; step < METRIC_STEPS; step++) {
      world.step(DT);
      for (const sh of world.creatures) samples.push(spineBend(sh));
    }
  }
  return { p50: percentile(samples, 0.5), p90: percentile(samples, 0.9) };
}

/** Share of frames in which any two animals (not pod mates) have a node within 0.5 · (0.1 L + 0.1 L'). */
function overlapShare(
  groups: { species: CreatureSpecies; count?: number }[],
  scene: "ocean" | "pond",
  W: number,
  H: number,
) {
  let hit = 0;
  let frames = 0;
  for (const seed of METRIC_SEEDS) {
    const { entries } = rosterFromGroups(groups, "stylized", createRng(seed ^ 0x9e3779b9));
    const world = new World({ roster: entries, seed, scene, baitFish: false });
    world.resize(W, H, 10, 14.5);
    for (let step = 0; step < METRIC_STEPS; step++) {
      world.step(DT);
      frames++;
      const cs = world.creatures;
      let overlapping = false;
      for (let i = 0; i < cs.length && !overlapping; i++) {
        for (let j = i + 1; j < cs.length && !overlapping; j++) {
          const a = cs[i];
          const b = cs[j];
          if (a.species === b.species && behaviourOf(a.species).pod) continue;
          const reach = 0.5 * (0.1 * a.length + 0.1 * b.length);
          for (let p = 0; p < SPINE_NODES && !overlapping; p++) {
            for (let q = 0; q < SPINE_NODES; q++) {
              const dx = a.nodes[p * 2] - b.nodes[q * 2];
              const dy = a.nodes[p * 2 + 1] - b.nodes[q * 2 + 1];
              if (dx * dx + dy * dy < reach * reach) {
                overlapping = true;
                break;
              }
            }
          }
        }
      }
      if (overlapping) hit++;
    }
  }
  return hit / frames;
}

describe("R21d: steadier swimming", () => {
  for (const species of CREATURE_IDS) {
    test(`${species}: spine bend p90 stays under its regression bound`, () => {
      // Reached: sharks and cetaceans ~1.80 (the joint cap), koi ~1.62. Bounds sit about 5% above what was reached.
      const bound = species === "koi" ? 1.7 : 1.9;
      for (const [W, H] of METRIC_SIZES) {
        const { p90 } = bendPercentiles(species, W, H);
        expect(p90).toBeLessThanOrEqual(bound);
      }
    });
  }

  test("Open ocean roster: overlap stays under its regression bound", () => {
    const groups = [
      { species: "classic" as const, count: 2 },
      { species: "hammerhead" as const },
      { species: "bottlenose" as const, count: 3 },
      { species: "orca" as const },
    ];
    // Baseline before R21d: 0.277 at 1200×700, 0.152 at 700×394. Reached: 0.196 and 0.112.
    expect(overlapShare(groups, "ocean", 1200, 700)).toBeLessThanOrEqual(0.21);
    expect(overlapShare(groups, "ocean", 700, 394)).toBeLessThanOrEqual(0.12);
  });

  test("Shark gallery roster: overlap stays under its regression bound", () => {
    const groups = [
      "classic",
      "hammerhead",
      "greathammer",
      "tiger",
      "mako",
      "thresher",
      "nurse",
      "zebra",
    ].map((species) => ({ species: species as CreatureSpecies }));
    // Baseline before R21d: 0.142 at 1200×700, 0.256 at 700×394. Reached: 0.195 and 0.110 (eight sharks on the
    // wide canvas touch a little more often; on the demo-sized canvas, overlap more than halves).
    expect(overlapShare(groups, "ocean", 1200, 700)).toBeLessThanOrEqual(0.21);
    expect(overlapShare(groups, "ocean", 700, 394)).toBeLessThanOrEqual(0.12);
  });
});
