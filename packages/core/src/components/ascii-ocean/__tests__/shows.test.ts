import { describe, expect, test } from "bun:test";

import { type ActionId, BEHAVIOURS } from "../creatures/behaviour";
import type { RosterEntry } from "../creatures/roster";
import type { CreatureSpecies } from "../creatures/types";
import { Effects } from "../effects";
import { type OceanPalette, AsciiRenderer } from "../renderer";
import { type Creature, SPINE_NODES, World } from "../world";

const DT = 1 / 60;
const W = 1200;
const H = 700;
const SEED = 11;

const DARK_PAGE: OceanPalette = {
  background: [10, 10, 10],
  foreground: [230, 238, 255],
  mode: "dark",
};

/**
 * `n` roster slots of one species. Bottlenose at 0.6 scale, as the pod tests have it: at full size a dolphin is
 * 44% of this canvas, so its look-ahead never clears the edges and it could hardly show.
 */
const pod = (species: CreatureSpecies, n: number): RosterEntry[] => {
  const rel = species === "bottlenose" ? 0.6 : 1;
  return Array.from({ length: n }, () => ({ species, rel, depth: rel }));
};

/** A world holding `roster` on a 1200×700 canvas, with no bait fish. */
function worldOf(roster: RosterEntry[], seed = SEED) {
  const world = new World({ roster, seed, baitFish: false });
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

/**
 * Runs `seconds` and records every time a creature enters an action: `starts[id]` lists the clock times that
 * action began, keyed by its id, with the creature's species and id alongside.
 */
function recordStarts(world: World, seconds: number) {
  const starts: { t: number; id: ActionId; sh: number }[] = [];
  const prev = new Map<number, string>();
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    world.step(DT);
    for (const sh of world.creatures) {
      const key = `${sh.state}/${sh.actionId}`;
      if (sh.state === "action" && prev.get(sh.id) !== key && sh.actionId) {
        starts.push({ t: world.time, id: sh.actionId, sh: sh.id });
      }
      prev.set(sh.id, key);
    }
    world.events.length = 0;
  }
  return starts;
}

/** A fake canvas context that records nothing; the renderer runs against it. */
function fakeCanvas() {
  const ctx = {
    font: "",
    textAlign: "",
    textBaseline: "",
    strokeStyle: "",
    lineWidth: 0,
    fillStyle: "",
    fillRect() {},
    fillText() {},
    drawImage() {},
    setTransform() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    clearRect() {},
    getImageData() {
      return null;
    },
  };
  return { width: 0, height: 0, getContext: () => ctx };
}

/** Renders one frame of `world` on a fake canvas, and returns the renderer. */
function renderOf(world: World, colors: "natural" | "theme" = "theme") {
  const realDocument = globalThis.document;
  Reflect.set(globalThis, "document", { createElement: () => fakeCanvas() });
  try {
    const renderer = new AsciiRenderer(fakeCanvas() as unknown as HTMLCanvasElement);
    renderer.setFontFamily("monospace");
    renderer.setPalette(DARK_PAGE);
    renderer.setColors(colors);
    renderer.resize(W, H, 1);
    renderer.render(world, DT);
    return renderer;
  } finally {
    Reflect.set(globalThis, "document", realDocument);
  }
}

/** Covered body cells of the last frame, read off the renderer's body buffer. */
function bodyCells(renderer: AsciiRenderer) {
  const flags = (renderer as unknown as { bodyFlag: Uint8Array }).bodyFlag;
  let n = 0;
  for (let i = 0; i < flags.length; i++) if (flags[i] !== 0) n++;
  return n;
}

describe("shows: when they happen", () => {
  test("determinism: the same roster and seed start the same leaps and breaches", () => {
    // Three bottlenose and a humpback, no clicks, two minutes at 60 fps. Shows read positions, which the seed's
    // wander moves, so only the same seed is expected to repeat them.
    const roster: RosterEntry[] = [
      ...pod("bottlenose", 3),
      { species: "humpback", rel: 1, depth: 1 },
    ];
    const a = recordStarts(worldOf(roster, 5), 120).filter(
      (s) => s.id === "leap" || s.id === "breachRoll",
    );
    const b = recordStarts(worldOf(roster, 5), 120).filter(
      (s) => s.id === "leap" || s.id === "breachRoll",
    );
    expect(a.length).toBeGreaterThan(0);
    expect(a.map((s) => [s.sh, s.id, s.t])).toEqual(b.map((s) => [s.sh, s.id, s.t]));
  });

  test("frequency: in 180 s each bottlenose leaps 3–14 times, and each humpback breaches 1–4 times", () => {
    // With a humpback in the roster the pod's positions shift, so the floor is 3 leaps, not 4.
    const roster: RosterEntry[] = [
      ...pod("bottlenose", 3),
      { species: "humpback", rel: 1, depth: 1 },
    ];
    const starts = recordStarts(worldOf(roster), 180);
    for (const sh of [1, 2, 3]) {
      const leaps = starts.filter((s) => s.sh === sh && s.id === "leap").length;
      expect(leaps).toBeGreaterThanOrEqual(3);
      expect(leaps).toBeLessThanOrEqual(14);
    }
    const breaches = starts.filter((s) => s.id === "breachRoll").length;
    expect(breaches).toBeGreaterThanOrEqual(1);
    expect(breaches).toBeLessThanOrEqual(4);
  });

  test("humpback breath series: at least 6 blows in series of 3–4, 4.5–7.5 s apart inside a series, 25 s or more between series", () => {
    // Breaches only (the fluke is part of the series): a breach can land between two breaths and stretch that gap.
    const beh = BEHAVIOURS.humpback;
    const shows = beh?.shows;
    if (beh) beh.shows = undefined;
    const world = worldOf(pod("humpback", 1));
    const blows: number[] = [];
    try {
      for (let i = 0; i < Math.round(180 / DT); i++) {
        world.step(DT);
        for (const e of world.events) if (e.kind === "blow") blows.push(world.time);
        world.events.length = 0;
      }
    } finally {
      if (beh) beh.shows = shows;
    }
    expect(blows.length).toBeGreaterThanOrEqual(6);
    // A gap of at most 7.5 s is inside a series; anything longer starts a new one after the dive.
    const series: number[][] = [];
    for (const t of blows) {
      const cur = series[series.length - 1];
      if (cur && t - cur[cur.length - 1] <= 7.5) cur.push(t);
      else series.push([t]);
    }
    for (const s of series.slice(0, -1)) {
      expect(s.length).toBeGreaterThanOrEqual(3);
      expect(s.length).toBeLessThanOrEqual(4);
    }
    for (let k = 1; k < series.length; k++) {
      expect(series[k][0] - series[k - 1][series[k - 1].length - 1]).toBeGreaterThanOrEqual(25);
    }
    for (const s of series) {
      for (let k = 1; k < s.length; k++) {
        expect(s[k] - s[k - 1]).toBeGreaterThanOrEqual(4.5);
        expect(s[k] - s[k - 1]).toBeLessThanOrEqual(7.5);
      }
    }
  });

  test("pod echo: when a pod member leaps, a mate leaps within 1.5 s", () => {
    // Three bottlenose abreast at mid-canvas, heading along +x, on a canvas with room for the leap and 2·L of water
    // ahead. The leader's show is forced, so the echo is what is tested.
    const world = new World({ roster: pod("bottlenose", 3), seed: SEED, baitFish: false });
    world.resize(2400, 1400, 10, 14.5);
    const L = world.creatures[0].length;
    world.creatures.forEach((sh, i) => place(sh, 500, 700 + (i - 1) * 0.8 * L, 0));
    const leader = world.creatures[1];
    const t0 = world.time;
    expect(world.startShow(leader, "leap")).toBeGreaterThan(0);
    const starts = recordStarts(world, 5).filter((s) => s.id === "leap");
    // A mate (any creature but the leader) starts its leap within 1.5 s of the leader's.
    const mate = starts.find((s) => s.sh !== leader.id && s.t - t0 <= 1.5);
    expect(mate).toBeDefined();
  });

  test("edge safety: a dolphin 0.5·L from the right edge, heading right, holds off until it turns away", () => {
    const world = worldOf([{ species: "bottlenose", rel: 1, depth: 1 }]);
    const sh = world.creatures[0];
    const L = sh.length;
    place(sh, W - 0.5 * L, 350, 0);
    // The food-less leap is not allowed while the snout is this close to the edge.
    expect(world.showable(sh)).toBe(false);
    expect(world.startShow(sh, "leap")).toBe(0);
    const starts: number[] = [];
    let turnedAt = -1;
    for (let i = 0; i < Math.round(30 / DT); i++) {
      world.step(DT);
      // Turned away from the right edge once it heads left (its heading has a negative x component).
      if (turnedAt < 0 && Math.cos(sh.heading) < 0) turnedAt = world.time;
      if (sh.state === "action" && sh.actionId === "leap" && starts.length === 0)
        starts.push(world.time);
      world.events.length = 0;
    }
    expect(turnedAt).toBeGreaterThan(0);
    // No show starts while it still faces the edge; any that starts is after it has turned.
    expect(starts.every((t) => t >= turnedAt)).toBe(true);
  });

  test("no food needed: a three-bottlenose pod leaps at least once in 60 s with no feeding", () => {
    const world = worldOf(pod("bottlenose", 3));
    const starts = recordStarts(world, 60).filter((s) => s.id === "leap");
    expect(starts.length).toBeGreaterThanOrEqual(1);
  });
});

describe("shows: the movement", () => {
  test("jump sequence: dip, splashes as the body breaks and re-enters the surface, sink, surfacing, then a blow", () => {
    const world = worldOf(pod("bottlenose", 1));
    const sh = world.creatures[0];
    place(sh, 0.3 * W, H / 2, 0);
    expect(world.startShow(sh, "leap")).toBeGreaterThan(0);
    const t0 = world.time;
    let dipDive = 0;
    let sinkDive = 0;
    const splashes: number[] = [];
    let blowAt = -1;
    let diveAtBlow = 1;
    for (let i = 0; i < Math.round(6 / DT); i++) {
      world.step(DT);
      const t = world.time - t0;
      if (t < 0.7) dipDive = Math.max(dipDive, sh.dive);
      // The leap's sink is 3.4 to 3.7 s (down 3.0 s, sink 3.7 s), where the dive holds at 1 before it surfaces.
      if (t >= 3.4 && t < 3.7) sinkDive = Math.max(sinkDive, sh.dive);
      for (const e of world.events) {
        if (e.kind === "splash") splashes.push(t);
        if (e.kind === "blow" && blowAt < 0) {
          blowAt = t;
          diveAtBlow = sh.dive;
        }
      }
      world.events.length = 0;
    }
    expect(dipDive).toBeGreaterThan(0.8);
    // Snout out, snout back in, tail under: in that order, and the blow comes after the last one.
    expect(splashes.length).toBe(3);
    expect(splashes[0]).toBeLessThan(splashes[1]);
    expect(splashes[1]).toBeLessThan(splashes[2]);
    expect(sinkDive).toBeGreaterThan(0.8);
    // The dive's target reaches 0 at the breath (4.7 s); the eased pose (rate 5/s) trails it by a fifth of a second.
    expect(diveAtBlow).toBeLessThan(0.2);
    expect(blowAt).toBeGreaterThan(splashes[2]);
  });

  test("breachRoll: the roll peaks above 0.7, and the landing crash is a splash", () => {
    const world = worldOf(pod("orca", 1));
    const sh = world.creatures[0];
    place(sh, 0.2 * W, H / 2, 0);
    expect(world.startShow(sh, "breachRoll")).toBeGreaterThan(0);
    let maxRoll = 0;
    let crash = 0;
    let maxH = 0;
    for (let i = 0; i < Math.round(8 / DT); i++) {
      world.step(DT);
      maxRoll = Math.max(maxRoll, Math.abs(sh.roll));
      maxH = Math.max(maxH, sh.height);
      for (const e of world.events) if (e.kind === "splash" && e.size !== undefined) crash++;
      world.events.length = 0;
    }
    expect(maxRoll).toBeGreaterThan(0.7);
    expect(maxH).toBeGreaterThan(0.6);
    expect(crash).toBe(1);
  });

  test("soundDive: the humpback's flukes slap above 0.4, and it ends its dive at 0.9 or more", () => {
    const world = worldOf(pod("humpback", 1));
    const sh = world.creatures[0];
    place(sh, 0.2 * W, H / 2, 0);
    expect(world.startShow(sh, "soundDive")).toBeGreaterThan(0);
    let maxSlap = 0;
    let endDive = 0;
    for (let i = 0; i < Math.round(6 / DT); i++) {
      world.step(DT);
      maxSlap = Math.max(maxSlap, sh.slap);
      if (sh.state !== "action") break;
      endDive = sh.dive;
      world.events.length = 0;
    }
    expect(maxSlap).toBeGreaterThan(0.4);
    expect(endDive).toBeGreaterThanOrEqual(0.9);
  });
});

describe("shows: the airborne body and the blow", () => {
  test("airborne scale: a bottlenose at height 1 covers at least 1.6 times the cells it covers at height 0", () => {
    const at = (height: number) => {
      const world = worldOf([{ species: "bottlenose", rel: 1, depth: 1 }]);
      const sh = world.creatures[0];
      place(sh, 0.4 * W, H / 2, 0);
      sh.height = height;
      return bodyCells(renderOf(world));
    };
    const rest = at(0);
    const up = at(1);
    expect(rest).toBeGreaterThan(0);
    expect(up).toBeGreaterThanOrEqual(1.6 * rest);
  });

  test("a breath (height 0.3) does not scale the body", () => {
    const at = (height: number) => {
      const world = worldOf([{ species: "bottlenose", rel: 1, depth: 1 }]);
      const sh = world.creatures[0];
      place(sh, 0.4 * W, H / 2, 0);
      sh.height = height;
      return bodyCells(renderOf(world));
    };
    expect(at(0.3)).toBe(at(0));
  });

  test("blow plume: a humpback's blow spawns more mist than a bottlenose's, and the mist leans downwind", () => {
    const mistOf = (species: CreatureSpecies) => {
      const world = worldOf([{ species, rel: 1, depth: 1 }]);
      const sh = world.creatures[0];
      place(sh, 0.5 * W, H / 2, 0);
      world.events.push({ kind: "blow", x: 0.5 * W, y: H / 2, size: sh.length });
      const renderer = renderOf(world);
      const fx = (renderer as unknown as { effects: Effects }).effects;
      const xs: number[] = [];
      fx.forEachParticle((x) => xs.push(x));
      return { count: xs.length, mean: xs.reduce((a, b) => a + b, 0) / xs.length, fx };
    };
    const whale = mistOf("humpback");
    const dolphin = mistOf("bottlenose");
    expect(whale.count).toBeGreaterThan(dolphin.count);

    // Drift: a plume made on its own, read a second on: its mean x moves in +x.
    const fx = new Effects();
    fx.blow(0, 0, 80, 3);
    const before: number[] = [];
    fx.forEachParticle((x) => before.push(x));
    for (let k = 0; k < 60; k++) fx.step(DT);
    const after: number[] = [];
    fx.forEachParticle((x) => after.push(x));
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(mean(after) - mean(before)).toBeGreaterThan(0);
  });
});
