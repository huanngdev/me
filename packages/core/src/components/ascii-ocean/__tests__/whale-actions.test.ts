import { describe, expect, test } from "bun:test";

import type { ActionId } from "../creatures/behaviour";
import type { RosterEntry } from "../creatures/roster";
import type { CreatureSpecies } from "../creatures/types";
import { type Creature, type Fish, SPINE_NODES, World } from "../world";

const DT = 1 / 60;
const W = 1200;
const H = 700;
const SEED = 11;

/** `n` roster slots of one species, all rel 1 and depth 1. */
const pod = (species: CreatureSpecies, n: number): RosterEntry[] =>
  Array.from({ length: n }, () => ({ species, rel: 1, depth: 1 }));

/** A world holding `roster` and `bait` bait fish (none by default), on a 1200×700 canvas. */
function worldOf(roster: RosterEntry[], bait = 0) {
  const world = new World({ roster, seed: SEED, fishCount: bait });
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

/** The bait still in the school: alive and never eaten (eaten fish respawn at the edge, so they are left out). */
const schoolOf = (world: World): Fish[] => world.fish.filter((f) => f.alive && f.respawnAt === 0);

/** Centroid of a list of fish. */
function centroidOf(fish: Fish[]) {
  let x = 0;
  let y = 0;
  for (const f of fish) {
    x += f.x;
    y += f.y;
  }
  return { x: x / fish.length, y: y / fish.length };
}

/** Mean distance of the fish from their centroid. */
function spreadOf(fish: Fish[]) {
  const c = centroidOf(fish);
  let sum = 0;
  for (const f of fish) sum += Math.hypot(f.x - c.x, f.y - c.y);
  return sum / fish.length;
}

/** Drops food `dist` px ahead of the creature, then forces the action under test. The offer's own splash is cleared. */
function offerAndForce(world: World, sh: Creature, dist: number, action: ActionId) {
  const x = sh.nodes[0] + Math.cos(sh.heading) * dist;
  const y = sh.nodes[1] + Math.sin(sh.heading) * dist;
  world.offerFood(x, y);
  sh.actionId = action;
  world.events.length = 0;
}

describe("orca and humpback signature feeding", () => {
  test("carousel: four orcas herd the ball, roll, bubble, whip in turn, and eat the stunned fish", () => {
    // Herding: the 20 fish are placed in a 60 px cluster and the pod circles them, so their spread shrinks by 25%+.
    // Roll: at least three orcas' bellies roll past 0.5 (the belly threshold). Bubbles: over 10 events. Whips: at least two orcas slap past 0.8.
    // Stunned: over 3 at once at some step, and at least 3 eaten. The slap never exceeds the ±1.2 clamp.
    const world = worldOf(pod("orca", 4), 20);
    const orcas = world.creatures;
    const L = orcas[0].length;
    const CX = 600;
    const CY = 350;
    gather(world, CX, CY, 60);
    // Four orcas a length out, a quarter turn apart, each heading round the ball.
    orcas.forEach((sh, i) => {
      const a = (i * Math.PI) / 2;
      place(sh, CX + Math.cos(a) * L, CY + Math.sin(a) * L, a + Math.PI / 2);
    });
    world.offerFood(CX, CY);
    for (const sh of orcas) sh.actionId = "carousel";

    const start = spreadOf(schoolOf(world));
    let minSpread = start;
    let maxStunned = 0;
    let eaten = 0;
    let bubbles = 0;
    let maxSlap = 0;
    let finite = true;
    const rolled = new Set<number>();
    const whipped = new Set<number>();
    for (let i = 0; i < Math.round(12 / DT); i++) {
      world.step(DT);
      const school = schoolOf(world);
      if (school.length >= 10) minSpread = Math.min(minSpread, spreadOf(school));
      maxStunned = Math.max(maxStunned, world.fish.filter((f) => f.alive && f.stun > 0).length);
      for (const e of world.events) {
        if (e.kind === "eat") eaten++;
        if (e.kind === "bubble") bubbles++;
      }
      world.events.length = 0;
      for (const sh of orcas) {
        // The slow flash rolls each orca past the belly threshold (0.5) once or twice in 12 s. It used to
        // flip past 0.6 every 1.4 s; a roll of 0.75 at the flash's peak is less than 0.6 for much of each lobe.
        if (Math.abs(sh.roll) > 0.5) rolled.add(sh.id);
        if (Math.abs(sh.slap) > 0.8) whipped.add(sh.id);
        maxSlap = Math.max(maxSlap, Math.abs(sh.slap));
        for (const v of sh.nodes) if (!Number.isFinite(v)) finite = false;
      }
    }
    expect(minSpread).toBeLessThan(0.75 * start);
    // An orca only circles until its own strike (3.5–7 s), and the slow flash has one lobe about every 7 s, so one
    // orca can strike before its lobe comes round. Three of four is the new bar (it was four, with the old sine).
    expect(rolled.size).toBeGreaterThanOrEqual(3);
    expect(bubbles).toBeGreaterThan(10);
    expect(whipped.size).toBeGreaterThanOrEqual(2);
    expect(maxStunned).toBeGreaterThan(3);
    expect(eaten).toBeGreaterThanOrEqual(3);
    expect(maxSlap).toBeLessThanOrEqual(1.2 + 1e-9);
    expect(finite).toBe(true);
  });

  test("spyhop: pitches up to vertical and lifts its head out, both at the same step", () => {
    // A solo orca with food 0.5·L ahead. Pitch above 0.9 and height above 0.6 together, in the upright phase.
    const world = worldOf(pod("orca", 1));
    const sh = world.creatures[0];
    offerAndForce(world, sh, 0.5 * sh.length, "spyhop");
    let engaged = false;
    let upright = false;
    for (let i = 0; i < Math.round(4 / DT); i++) {
      world.step(DT);
      world.events.length = 0;
      if (sh.state === "action") engaged = true;
      if (sh.pitch > 0.9 && sh.height > 0.6) upright = true;
    }
    expect(engaged).toBe(true);
    expect(upright).toBe(true);
  });

  test("bubbleNet: a ring of bubbles and a dive, then a lunge with the mouth open that eats the bunched bait", () => {
    // Phase 1 (t < 6): more than 25 bubbles, placed on a ring. The spread is their standard deviation from the
    // school centroid, which should stay below 0.5·L. The dive reaches above 0.5. Phase 2 (6–8.6 s): height and
    // gape both above 0.9 at one step, and at least 5 fish are eaten in the lunge.
    const world = worldOf(pod("humpback", 1), 20);
    const hb = world.creatures[0];
    const L = hb.length;
    const CX = 600;
    const CY = 350;
    gather(world, CX, CY, 60);
    // Starts 1.5·L from the school centre, heading tangentially, so the approach runs first and then engages.
    place(hb, CX + 1.5 * L, CY, Math.PI / 2);
    world.offerFood(CX, CY);
    hb.actionId = "bubbleNet";

    const ring: number[] = [];
    let bubbles = 0;
    let maxDive = 0;
    let lunged = false;
    let eatenInLunge = 0;
    for (let i = 0; i < Math.round(14 / DT); i++) {
      world.step(DT);
      const t = hb.state === "action" ? world.time - hb.actionStart : -1;
      const school = schoolOf(world);
      const c = school.length > 0 ? centroidOf(school) : null;
      for (const e of world.events) {
        if (e.kind === "bubble") {
          bubbles++;
          if (c && t >= 0 && t < 6) ring.push(Math.hypot(e.x - c.x, e.y - c.y));
        }
        if (e.kind === "eat" && t >= 6 && t < 8.6) eatenInLunge++;
      }
      world.events.length = 0;
      if (t >= 0 && t < 6) maxDive = Math.max(maxDive, hb.dive);
      if (t >= 6 && t < 8.6 && hb.height > 0.9 && hb.gape > 0.9) lunged = true;
    }
    const mean = ring.reduce((a, b) => a + b, 0) / ring.length;
    const sd = Math.sqrt(ring.reduce((a, d) => a + (d - mean) ** 2, 0) / ring.length);
    expect(bubbles).toBeGreaterThan(25);
    expect(sd).toBeLessThan(0.5 * L);
    expect(maxDive).toBeGreaterThan(0.5);
    expect(lunged).toBe(true);
    expect(eatenInLunge).toBeGreaterThanOrEqual(5);
  });

  test("lunge: the throat opens to gape past 0.9 and takes the food it passes", () => {
    // A solo humpback with food 1.3·L ahead: the approach runs first, then the lunge engages at 1.0·L.
    const world = worldOf(pod("humpback", 1));
    const hb = world.creatures[0];
    offerAndForce(world, hb, 1.3 * hb.length, "lunge");
    let engaged = false;
    let maxGape = 0;
    let eaten = 0;
    for (let i = 0; i < Math.round(5 / DT); i++) {
      world.step(DT);
      if (hb.state === "action") engaged = true;
      for (const e of world.events) if (e.kind === "eat") eaten++;
      world.events.length = 0;
      maxGape = Math.max(maxGape, hb.gape);
    }
    expect(engaged).toBe(true);
    expect(maxGape).toBeGreaterThan(0.9);
    expect(eaten).toBeGreaterThanOrEqual(1);
  });

  test("blowAndFluke: blows at the surface, then raises its flukes and dives", () => {
    // A solo humpback with food 1.2·L ahead. The blow comes first; after it, pitch below −0.5 and dive above 0.8.
    const world = worldOf(pod("humpback", 1));
    const hb = world.creatures[0];
    offerAndForce(world, hb, 1.2 * hb.length, "blowAndFluke");
    let blown = false;
    let fluked = false;
    for (let i = 0; i < Math.round(6 / DT); i++) {
      world.step(DT);
      for (const e of world.events) if (e.kind === "blow") blown = true;
      world.events.length = 0;
      if (blown && hb.pitch < -0.5 && hb.dive > 0.8) fluked = true;
    }
    expect(blown).toBe(true);
    expect(fluked).toBe(true);
  });
});
