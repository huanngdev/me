import { describe, expect, test } from "bun:test";

import { ACTIONS } from "../creatures/actions";
import { type ActionId, behaviourOf } from "../creatures/behaviour";
import { CREATURE_IDS } from "../creatures";
import { ORCA } from "../creatures/orca";
import { type RosterEntry, rosterFromGroups } from "../creatures/roster";
import type { CreatureSpecies } from "../creatures/types";
import { createRng, smoothstep } from "../math";
import { type Creature, SPINE_NODES, World } from "../world";

const DT = 1 / 60;
const W = 1200;
const H = 700;

/** Pose easing rates, as world.ts sets them. Each pose eases at p += (target − p) · min(1, dt · rate). */
const RATE = { height: 3, pitch: 2.2, roll: 1.6, gape: 5, slap: 4, dive: 5, emerge: 5 } as const;
/**
 * The widest span of each pose's targets across the actions: pitch −0.7 … 1, slap ±1.2, roll ±0.75, height and
 * gape and dive 0 … 1, emerge 0 … 2. A pose is always between its target and its last value, so one step moves it
 * at most rate · dt · span · 1.05 (the 5% is slack for the float steps).
 */
const SPAN = { height: 1, pitch: 1.7, roll: 1.5, gape: 1, slap: 2.4, dive: 1, emerge: 2 } as const;

/** Stands a creature with its snout at (x, y), its spine trailing straight back along `heading`. */
function place(sh: Creature, x: number, y: number, heading: number) {
  const seg = sh.length / (SPINE_NODES - 1);
  for (let n = 0; n < SPINE_NODES; n++) {
    sh.nodes[n * 2] = x - Math.cos(heading) * seg * n;
    sh.nodes[n * 2 + 1] = y - Math.sin(heading) * seg * n;
  }
  sh.heading = heading;
}

/** A world holding `roster` on a 1200×700 canvas, with `bait` bait fish (none by default). */
function worldOf(roster: RosterEntry[], bait = 0) {
  const world = new World({ roster, seed: 7, fishCount: bait });
  world.resize(W, H, 10, 14.5);
  return world;
}

/** Packs the world's bait fish into a still cluster of radius `spread` around (x, y). */
function gather(world: World, x: number, y: number, spread: number) {
  const n = world.fish.length;
  world.fish.forEach((f, k) => {
    const r = spread * Math.sqrt((k + 0.5) / n);
    f.x = x + Math.cos(k * 2.4) * r;
    f.y = y + Math.sin(k * 2.4) * r;
    f.vx = 0;
    f.vy = 0;
  });
}

describe("smooth: every action eases its poses", () => {
  test("no pose moves more than rate · dt · 1.05 · span in one step, for every action of every species", () => {
    // [species, action, is a show]: a food action gets food; a show or the fluke sounding starts with none.
    const pairs: [CreatureSpecies, string, boolean][] = [];
    for (const species of CREATURE_IDS) {
      for (const { id } of behaviourOf(species).actions) pairs.push([species, id, false]);
    }
    // Every action in actions.ts is reachable from some species: as a food action, a show, or a fluke sounding.
    const shows = (species: CreatureSpecies) => (behaviourOf(species).shows ?? []).map((s) => s.id);
    const reached = new Set([
      ...pairs.map(([, id]) => id),
      ...CREATURE_IDS.flatMap((species) => shows(species)),
      "soundDive",
    ]);
    expect([...reached].sort()).toEqual(Object.keys(ACTIONS).sort());
    for (const species of CREATURE_IDS)
      for (const id of shows(species)) pairs.push([species, id, true]);
    pairs.push(["humpback", "soundDive", true]);

    const bound = Object.fromEntries(
      Object.keys(RATE).map((k) => [
        k,
        RATE[k as keyof typeof RATE] * DT * 1.05 * SPAN[k as keyof typeof SPAN],
      ]),
    ) as Record<keyof typeof RATE, number>;
    // The largest step each pose took in any action; a pose that never moves would pass the bound vacuously.
    const moved: Record<string, number> = {};
    for (const [species, id, show] of pairs) {
      // Bait fish packed around the food, so the feeding actions engage (carousel needs a ball of bait).
      const world = worldOf([{ species, rel: 1, depth: 1 }], 20);
      const sh = world.creatures[0];
      place(sh, W / 2, H / 2, 0);
      const fx = W / 2 + sh.length * 0.5;
      gather(world, fx, H / 2, 60);
      if (show) {
        // Shows and the fluke sounding start with no food.
        world.startShow(sh, id as ActionId);
      } else {
        world.offerFood(fx, H / 2);
        sh.actionId = id as typeof sh.actionId;
      }
      world.events.length = 0;
      const prev = { ...poseOf(sh) };
      const steps = Math.round(((ACTIONS[id as keyof typeof ACTIONS].seconds ?? 6) + 1) / DT);
      for (let i = 0; i < steps; i++) {
        world.step(DT);
        const now = poseOf(sh);
        for (const k of Object.keys(RATE) as (keyof typeof RATE)[]) {
          // A finished jump snaps emerge from back under (~2) to 0, which renders the same, so it is no jump in pose.
          const snapped = k === "emerge" && prev[k] > 1.9 && now[k] === 0;
          const d = snapped ? 0 : Math.abs(now[k] - prev[k]);
          moved[k] = Math.max(moved[k] ?? 0, d);
          expect(d).toBeLessThanOrEqual(bound[k] + 1e-12);
          prev[k] = now[k];
        }
      }
    }
    // Every pose moved in at least one action, so the bound above was tested on real motion.
    for (const k of Object.keys(RATE)) expect(moved[k] ?? 0).toBeGreaterThan(0);
  });
});

/** The six eased poses of a creature, read off as numbers. */
function poseOf(sh: Creature) {
  return {
    height: sh.height,
    pitch: sh.pitch,
    roll: sh.roll,
    gape: sh.gape,
    slap: sh.slap,
    dive: sh.dive,
    emerge: sh.emerge,
  };
}

describe("smooth: orca belly", () => {
  test("the carousel rolls each orca past 0.5 at most 4 times in 10 s", () => {
    const roster: RosterEntry[] = Array.from({ length: 4 }, () => ({
      species: "orca",
      rel: 1,
      depth: 1,
    }));
    const world = worldOf(roster);
    const orcas = world.creatures;
    const L = orcas[0].length;
    const cx = W / 2;
    const cy = H / 2;
    // Four orcas a length out, a quarter turn apart, each heading round the ball.
    orcas.forEach((sh, i) => {
      const a = (i * Math.PI) / 2;
      place(sh, cx + Math.cos(a) * L, cy + Math.sin(a) * L, a + Math.PI / 2);
    });
    world.offerFood(cx, cy);
    for (const sh of orcas) sh.actionId = "carousel";
    const crossings = new Map<number, number>();
    const above = new Map<number, boolean>();
    for (let i = 0; i < Math.round(10 / DT); i++) {
      world.step(DT);
      for (const sh of orcas) {
        const now = sh.roll > 0.5;
        if (above.has(sh.id) && above.get(sh.id) !== now) {
          crossings.set(sh.id, (crossings.get(sh.id) ?? 0) + 1);
        }
        above.set(sh.id, now);
      }
    }
    for (const n of crossings.values()) expect(n).toBeLessThanOrEqual(4);
  });

  test("the white belly grows monotonically while the roll goes 0 → 1", () => {
    // The belly amount is the renderer's smoothstep of |roll| across 0.3 … 0.8.
    const coat = ORCA.coats!.orca;
    const whiteFraction = (bellyAmount: number) => {
      let body = 0;
      let white = 0;
      for (let si = 1; si < 100; si++) {
        for (let ai = 0; ai <= 20; ai++) {
          const region = coat.paint!({
            s: si / 100,
            v: 0,
            L: 1,
            across: ai / 20,
            flag: 1,
            id: 1,
            belly: bellyAmount > 0.5,
            bellyAmount,
          });
          body++;
          if (region === 1) white++;
        }
      }
      return white / body;
    };
    let prev = -1;
    for (let roll = 0; roll <= 1.0001; roll += 0.02) {
      const f = whiteFraction(smoothstep(0.3, 0.8, roll));
      expect(f).toBeGreaterThanOrEqual(prev);
      prev = f;
    }
    expect(prev).toBeGreaterThan(0.5);
  });
});

describe("smooth: humpback size", () => {
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
