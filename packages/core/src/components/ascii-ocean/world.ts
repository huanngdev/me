// Ported from https://github.com/stackedlol/ascii-sharks (used with the author's permission).
/**
 * Artificial-life sim for the hero: bait fish schools and the animals that swim among them.
 *
 * Fish: Reynolds boids (separation / alignment / cohesion) in Couzin-style
 * zones, with a blind spot behind each fish. Alarm spreads from fish to fish
 * through the school (a "wave of agitation"), so a whole school bolts even
 * when only its edge can see a predator. Fleeing fish break sideways around
 * the predator's path, which gives the fountain effect seen in real bait balls.
 * A fish that swims off the canvas is replaced by a new school from an edge.
 *
 * Animals: Reynolds steering (wander + pod cohesion + patrol) on a
 * follow-the-leader spine. They only swim; nothing hunts or feeds.
 */
import { angleDiff, clamp, createRng, current, rand, randInt, type Rng, TAU } from "./math";
import {
  behaviourOf,
  DEFAULT_MAX_BEND,
  DEFAULT_TURN_RADIUS,
  EDGE_TURN_RADIUS,
} from "./creatures/behaviour";
import { CREATURES } from "./creatures";
import { rosterFromSharks, type RosterEntry } from "./creatures/roster";
import type { CreatureSpecies, OceanScene } from "./creatures/types";
import { pickSpecies, SPECIES } from "./species";

export const SPINE_NODES = 20;

/** How fast the koi pond bob eases toward its target: d += (target − d) · min(1, dt · rate). */
const DIVE_RATE = 5;
/** Heading error gain (per second) while cruising: turn rate = gain · error, capped by the turning circle. */
const TURN_GAIN = 1.8;
/** Time constant (s) of the low-pass filter on an animal's steering direction, so terms don't flip the target each frame. */
const STEER_TAU = 0.4;
/** Pod mates keep less personal space than strangers: their separation weight is scaled by this. */
const POD_SEPARATION = 0.15;
/** How strongly a pod member turns to its pod's mean heading. */
const POD_ALIGN = 2.5;
/** Separation push strength, and its range in body lengths (sum of the two animals), between animals. */
const SEPARATION_K = 20;
const SEPARATION_RANGE = 0.9;

export type SharkKind =
  "classic" | "hammerhead" | "zebra" | "tiger" | "greathammer" | "mako" | "thresher" | "nurse";

/** Which sharks to put in the water; size is relative to the biggest. */
export type SharkSpec = { kind: SharkKind; size: number };

// The landing hero: four of the same shark at different depths.
const DEFAULT_SHARKS: SharkSpec[] = [
  { kind: "classic", size: 1 },
  { kind: "classic", size: 0.7 },
  { kind: "classic", size: 0.84 },
  { kind: "classic", size: 0.77 },
];

/** Constructor options for World: roster, seed, and population overrides. */
export type WorldOptions = {
  roster?: RosterEntry[];
  /** Same seed, same world. Omit for a different ocean each time. */
  seed?: number;
  /** Fish population: a multiple of the area-based default, "auto", or false for none. */
  baitFish?: number | "auto" | false;
  /** Exact fish count; overrides baitFish. */
  fishCount?: number;
  /** Ocean has bait fish; pond has koi and no fish by default. Default "ocean". */
  scene?: OceanScene;
};

export interface Fish {
  x: number;
  y: number;
  vx: number;
  vy: number;
  species: number;
  /** 0 calm → 1 panicking. Spreads to neighbours. */
  alarm: number;
  alive: boolean;
  respawnAt: number;
  /** Tail-beat phase. */
  phase: number;
  /** Smoothed angular velocity (rad/s); hard turns flash silver. */
  turn: number;
  /** 0.55 far → 1 near. */
  depth: number;
  /** Rotation sense shared by a school when it mills into a bait ball. */
  millDir: 1 | -1;
}

export interface Creature {
  id: number;
  species: CreatureSpecies;
  length: number;
  /** Spine positions, snout first: [x0, y0, x1, y1, ...]. */
  nodes: Float32Array;
  heading: number;
  speed: number;
  /** Tail-beat phase; drives the body wave in the renderer. */
  phase: number;
  /** Smoothed angular velocity (rad/s); the body banks its fins into turns. */
  turn: number;
  wander: number;
  orbitDir: 1 | -1;
  orbitRadius: number;
  /** 0 far / dim → 1 near / bright. */
  depth: number;
  /** Named coat from the species' `coats`, for species that have them. */
  coat?: string;
  /** Sinking under the surface, 0–1: pond koi bob between the surface and mid-water. 0 for everything else. */
  dive: number;
  /** Low-passed steering direction (unit-ish vector, x and y): the target the heading turns toward. */
  steerX: number;
  steerY: number;
}

export interface WorldEvent {
  kind: "splash";
  x: number;
  y: number;
}

const FISH_SEPARATION_K = 420;
const FISH_ALIGN_K = 1.4;
const FISH_COHESION_K = 1;
const FISH_FLEE_K = 1100;
const BLIND_COS = -0.6; // ~127° either side of the heading is visible
/** Fish beyond this many px outside the canvas have left it and are replaced by respawn(). */
const FISH_EXIT = 60;

/** Inward steer from an edge `depth` px inside it: 0 at half a length in, 2 at the edge and beyond. */
function edgePush(depth: number, L: number) {
  const margin = 0.5 * L;
  return 2 * clamp((margin - depth) / margin, 0, 1);
}

/** One eased step of the koi pond bob, snapped to exactly 0 when it is back at rest there. */
function easeDive(d: number, target: number, dt: number) {
  const v = d + (target - d) * Math.min(1, dt * DIVE_RATE);
  return target === 0 && Math.abs(v) < 1e-3 ? 0 : v;
}

export class World {
  width = 0;
  height = 0;
  time = 0;
  fish: Fish[] = [];
  creatures: Creature[] = [];
  events: WorldEvent[] = [];
  pointer = { x: 0, y: 0, active: false };
  scene: OceanScene;

  /** Fish neighbourhood radius; the spatial hash bucket size matches it. */
  private perception = 60;
  /** Per-species personal space in px (x, y). */
  private sepX: number[] = [];
  private sepY: number[] = [];
  private foreignSep = 40;
  private bucketCols = 0;
  private bucketRows = 0;
  private bucketHead = new Int32Array(0);
  private bucketNext = new Int32Array(0);
  private lastSpawn = 0;
  private tmp = { x: 0, y: 0 };
  private rng: Rng;
  private roster: RosterEntry[];
  private fishCount?: number;
  private baitFish: number | "auto" | false;

  /**
   * fishCount overrides the area-based population (the sidebar wants a single small school).
   * seed makes every random choice repeatable; omit it for a different ocean each time.
   */
  constructor(options: WorldOptions = {}) {
    this.roster = options.roster ?? rosterFromSharks(DEFAULT_SHARKS);
    this.fishCount = options.fishCount;
    this.baitFish = options.baitFish ?? "auto";
    this.rng = options.seed === undefined ? Math.random : createRng(options.seed);
    this.scene = options.scene ?? "ocean";
  }

  resize(width: number, height: number, cellW: number, cellH: number) {
    const first = this.width === 0;
    this.width = width;
    this.height = height;
    // Spacing is set in grid cells so every fish lands in its own cell.
    this.sepX = SPECIES.map((sp) => sp.spacing[0] * cellW);
    this.sepY = SPECIES.map((sp) => sp.spacing[1] * cellH);
    this.perception = Math.max(cellH * 3, cellW * 5.5);
    this.foreignSep = cellW * 3;

    if (first || (this.fish.length === 0 && this.creatures.length === 0)) {
      this.seed();
      return;
    }
    for (const f of this.fish) {
      f.x = clamp(f.x, 0, width);
      f.y = clamp(f.y, 0, height);
    }
  }

  seed() {
    const { width: W, height: H } = this;
    const minSide = Math.min(W, H);
    // A roster with a whale in it (realLength 7 or more, orca and humpback) lets the biggest animal be big.
    const whales = this.roster.some((e) => CREATURES[e.species].realLength >= 7);
    const baseLength = whales ? clamp(minSide * 0.6, 200, 520) : clamp(minSide * 0.44, 170, 430);
    const count = this.roster.length;

    this.creatures = [];
    for (let i = 0; i < count; i++) {
      const entry = this.roster[i];
      const length = baseLength * entry.rel;
      const orbitRadius = minSide * rand(this.rng, 0.28, 0.4);
      const a = (i / count) * TAU + rand(this.rng, -0.4, 0.4);
      const orbitDir: 1 | -1 = i % 2 === 0 ? 1 : -1;
      const x = W / 2 + Math.cos(a) * orbitRadius * (W / minSide) * 0.9;
      const y = H / 2 + Math.sin(a) * orbitRadius;
      const heading = a + (orbitDir * Math.PI) / 2;
      const nodes = new Float32Array(SPINE_NODES * 2);
      const seg = length / (SPINE_NODES - 1);
      for (let n = 0; n < SPINE_NODES; n++) {
        nodes[n * 2] = x - Math.cos(heading) * seg * n;
        nodes[n * 2 + 1] = y - Math.sin(heading) * seg * n;
      }
      this.creatures.push({
        id: i + 1,
        species: entry.species,
        length,
        nodes,
        heading,
        speed: 30,
        phase: rand(this.rng, 0, TAU),
        turn: 0,
        wander: 0,
        orbitDir,
        orbitRadius,
        depth: entry.depth,
        coat: entry.coat,
        dive: 0,
        steerX: Math.cos(heading),
        steerY: Math.sin(heading),
      });
    }
    // Smaller (farther) animals draw first so the big one swims over them.
    this.creatures.sort((a, b) => a.length - b.length);

    const total = this.fishTotal(W, H);
    this.fish = [];
    while (this.fish.length < total) {
      const species = pickSpecies(this.rng);
      const sp = SPECIES[species];
      const size = Math.min(
        randInt(this.rng, sp.schoolSize[0], sp.schoolSize[1]),
        total - this.fish.length,
      );
      const millDir: 1 | -1 = this.rng() < 0.5 ? 1 : -1;
      const cx = rand(this.rng, W * 0.06, W * 0.94);
      const cy = rand(this.rng, H * 0.08, H * 0.92);
      // Mostly level headings: fish cruise sideways far more than up or down.
      const dir = (this.rng() < 0.5 ? 0 : Math.PI) + rand(this.rng, -0.5, 0.5);
      for (let k = 0; k < size; k++) {
        this.fish.push({
          x: cx + rand(this.rng, -1, 1) * this.sepX[species] * Math.sqrt(size),
          y: cy + rand(this.rng, -1, 1) * this.sepY[species] * Math.sqrt(size) * 0.6,
          vx: Math.cos(dir) * sp.cruise,
          vy: Math.sin(dir) * sp.cruise,
          species,
          alarm: 0,
          alive: true,
          respawnAt: 0,
          phase: rand(this.rng, 0, TAU),
          turn: 0,
          depth: rand(this.rng, 0.55, 1),
          millDir,
        });
      }
    }
    this.bucketNext = new Int32Array(this.fish.length);
  }

  private fishTotal(W: number, H: number): number {
    if (this.fishCount !== undefined) return this.fishCount;
    if (this.baitFish === false) return 0;
    if (this.baitFish === "auto") return clamp(Math.round((W * H) / 4400), 85, 340);
    return clamp(Math.round(((W * H) / 4400) * this.baitFish), 0, 600);
  }

  splash(x: number, y: number) {
    this.events.push({ kind: "splash", x, y });
    const r = 240;
    for (const f of this.fish) {
      if (!f.alive) continue;
      const dx = f.x - x;
      const dy = f.y - y;
      const d = Math.hypot(dx, dy);
      if (d > r || d < 1e-3) continue;
      // Flash expansion: everybody nearby bolts straight out.
      const k = (1 - d / r) * 260;
      f.vx += (dx / d) * k;
      f.vy += (dy / d) * k;
      f.alarm = 1;
    }
  }

  step(dt: number) {
    this.time += dt;
    this.rebuildHash();
    this.stepFish(dt);
    this.stepCreatures(dt);
    this.respawn();
  }

  private rebuildHash() {
    const size = this.perception;
    const pad = 2;
    this.bucketCols = Math.ceil(this.width / size) + pad * 2;
    this.bucketRows = Math.ceil(this.height / size) + pad * 2;
    const n = this.bucketCols * this.bucketRows;
    if (this.bucketHead.length !== n) {
      this.bucketHead = new Int32Array(n);
    }
    this.bucketHead.fill(-1);
    if (this.bucketNext.length !== this.fish.length) {
      this.bucketNext = new Int32Array(this.fish.length);
    }
    for (let i = 0; i < this.fish.length; i++) {
      const f = this.fish[i];
      if (!f.alive) continue;
      const b = this.bucketOf(f.x, f.y);
      this.bucketNext[i] = this.bucketHead[b];
      this.bucketHead[b] = i;
    }
  }

  private bucketOf(x: number, y: number) {
    const size = this.perception;
    const c = clamp(Math.floor(x / size) + 2, 0, this.bucketCols - 1);
    const r = clamp(Math.floor(y / size) + 2, 0, this.bucketRows - 1);
    return r * this.bucketCols + c;
  }

  private stepFish(dt: number) {
    const { fish, creatures, pointer, width: W, height: H, time } = this;
    const R = this.perception;
    const R2 = R * R;
    const foreignSep = this.foreignSep;
    const size = this.perception;
    const cols = this.bucketCols;
    const rows = this.bucketRows;
    const head = this.bucketHead;
    const next = this.bucketNext;
    const cur = this.tmp;
    const calmDecay = Math.exp(-dt * 0.7);
    const contagion = Math.min(1, dt * 6);

    for (let i = 0; i < fish.length; i++) {
      const f = fish[i];
      if (!f.alive) continue;
      const sp = SPECIES[f.species];
      // Alarmed fish want more room: the school flashes apart around a
      // predator and closes back up once the threat fades.
      const spread = 1 + 1.8 * f.alarm;
      const sepX = this.sepX[f.species] * spread;
      const sepY = this.sepY[f.species] * spread;

      const speed = Math.hypot(f.vx, f.vy) || 1;
      const hx = f.vx / speed;
      const hy = f.vy / speed;

      let ax = 0;
      let ay = 0;
      let sx = 0;
      let sy = 0;
      let avx = 0;
      let avy = 0;
      let cx = 0;
      let cy = 0;
      let n = 0;
      let neighbourAlarm = 0;

      const bc = clamp(Math.floor(f.x / size) + 2, 0, cols - 1);
      const br = clamp(Math.floor(f.y / size) + 2, 0, rows - 1);
      for (let r = Math.max(0, br - 1); r <= Math.min(rows - 1, br + 1); r++) {
        for (let c = Math.max(0, bc - 1); c <= Math.min(cols - 1, bc + 1); c++) {
          let j = head[r * cols + c];
          while (j !== -1) {
            if (j !== i) {
              const o = fish[j];
              const dx = o.x - f.x;
              const dy = o.y - f.y;
              const d2 = dx * dx + dy * dy;
              if (d2 < R2 && d2 > 1e-6) {
                const d = Math.sqrt(d2);
                // Blind zone directly behind the fish.
                if ((dx * hx + dy * hy) / d > BLIND_COS) {
                  // Elliptical personal space: wide along x, tight along y.
                  const qx = dx / sepX;
                  const qy = dy / sepY;
                  const q2 = qx * qx + qy * qy;
                  if (q2 < 1) {
                    const q = Math.sqrt(q2) || 1e-3;
                    const k = (1 - q) / q;
                    sx -= qx * k;
                    sy -= qy * k;
                  }
                  if (o.species === f.species) {
                    avx += o.vx;
                    avy += o.vy;
                    cx += dx;
                    cy += dy;
                    n++;
                  } else if (d < foreignSep) {
                    // Different species keep their own schools.
                    const k = ((1 - d / foreignSep) / d) * 0.6;
                    sx -= dx * k;
                    sy -= dy * k;
                  }
                  if (o.alarm > neighbourAlarm) neighbourAlarm = o.alarm;
                }
              }
            }
            j = next[j];
          }
        }
      }

      ax += sx * FISH_SEPARATION_K;
      ay += sy * FISH_SEPARATION_K;
      if (n > 0) {
        const alignK = FISH_ALIGN_K * sp.align;
        const cohesionK = FISH_COHESION_K * sp.cohesion * (1 - 0.8 * f.alarm);
        ax += (avx / n - f.vx) * alignK + (cx / n) * cohesionK;
        ay += (avy / n - f.vy) * alignK + (cy / n) * cohesionK;
        if (sp.mill > 0) {
          // Circle the local centre: the school spins into a bait ball.
          const cl = Math.hypot(cx, cy) || 1;
          ax += (-cy / cl) * f.millDir * sp.mill * (1 - f.alarm);
          ay += (cx / cl) * f.millDir * sp.mill * (1 - f.alarm);
        }
      }

      // Predators. Distance is measured to the nearest point along the front
      // half of the animal, so fish also give the flanks a wide berth.
      let fear = 0;
      for (const sh of creatures) {
        const fearR = sh.length * 0.6 + 60;
        let best = Infinity;
        let bx = 0;
        let by = 0;
        for (let k = 0; k <= 12; k += 3) {
          const nx = sh.nodes[k * 2];
          const ny = sh.nodes[k * 2 + 1];
          const d2 = (f.x - nx) ** 2 + (f.y - ny) ** 2;
          if (d2 < best) {
            best = d2;
            bx = nx;
            by = ny;
          }
        }
        const d = Math.sqrt(best);
        if (d >= fearR || d < 1e-3) continue;
        let w = 1 - d / fearR;
        w *= w;
        const awayX = (f.x - bx) / d;
        const awayY = (f.y - by) / d;
        // Fountain effect: break to whichever side of the animal's path you're on.
        const shx = Math.cos(sh.heading);
        const shy = Math.sin(sh.heading);
        const side = shx * (f.y - sh.nodes[1]) - shy * (f.x - sh.nodes[0]) >= 0 ? 1 : -1;
        ax += (awayX * 0.7 - shy * side * 0.9) * FISH_FLEE_K * w;
        ay += (awayY * 0.7 + shx * side * 0.9) * FISH_FLEE_K * w;
        fear = Math.max(fear, Math.sqrt(w));
      }

      if (pointer.active) {
        const pr = 130;
        const dx = f.x - pointer.x;
        const dy = f.y - pointer.y;
        const d = Math.hypot(dx, dy);
        if (d < pr && d > 1e-3) {
          const w = (1 - d / pr) ** 2;
          ax += (dx / d) * FISH_FLEE_K * w;
          ay += (dy / d) * FISH_FLEE_K * w;
          fear = Math.max(fear, Math.sqrt(w) * 0.8);
        }
      }

      // Alarm: direct threat sets it, neighbours pass it along (slightly
      // weaker each hop), and it fades on its own.
      let alarm = Math.max(f.alarm * calmDecay, fear);
      const relayed = neighbourAlarm * 0.86;
      if (relayed > alarm) alarm += (relayed - alarm) * contagion;
      f.alarm = alarm;

      // Soft walls.
      const m = 36;
      if (f.x < m) ax += (m - f.x) * 7;
      else if (f.x > W - m) ax -= (f.x - (W - m)) * 7;
      if (f.y < m) ay += (m - f.y) * 7;
      else if (f.y > H - m) ay -= (f.y - (H - m)) * 7;

      // Ambient current and a little individual restlessness.
      current(f.x, f.y, time, cur);
      ax += cur.x * 0.5 + (this.rng() - 0.5) * sp.jitter;
      ay += cur.y * 0.5 + (this.rng() - 0.5) * sp.jitter;
      // Swim level, except when bolting from danger.
      ay -= f.vy * sp.verticalDrag * (1 - 0.7 * f.alarm);

      // Relax toward a preferred speed that rises with panic.
      const preferred = sp.cruise * (1 + 1.3 * f.alarm);
      ax += (preferred - speed) * hx * 1.6;
      ay += (preferred - speed) * hy * 1.6;

      const before = Math.atan2(f.vy, f.vx);
      f.vx += ax * dt;
      f.vy += ay * dt;
      const maxSpeed = sp.maxSpeed * (1 + 1.8 * f.alarm);
      const s = Math.hypot(f.vx, f.vy);
      if (s > maxSpeed) {
        f.vx *= maxSpeed / s;
        f.vy *= maxSpeed / s;
      } else if (s < sp.minSpeed && s > 1e-3) {
        f.vx *= sp.minSpeed / s;
        f.vy *= sp.minSpeed / s;
      }
      f.turn += (angleDiff(before, Math.atan2(f.vy, f.vx)) / dt - f.turn) * Math.min(1, dt * 8);
      f.phase += dt * (7 + Math.hypot(f.vx, f.vy) * 0.12);
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      // Past the canvas and a margin: the fish is gone, and respawn() sends a new school in from an edge.
      if (f.x < -FISH_EXIT || f.x > W + FISH_EXIT || f.y < -FISH_EXIT || f.y > H + FISH_EXIT) {
        f.alive = false;
        f.respawnAt = time;
      }
    }
  }

  private stepCreatures(dt: number) {
    const { creatures, width: W, height: H, time } = this;
    const minSide = Math.min(W, H);
    const cxW = W / 2;
    const cyW = H / 2;

    for (const sh of creatures) {
      const L = sh.length;
      const nodes = sh.nodes;
      const hx = nodes[0];
      const hy = nodes[1];
      const beh = behaviourOf(sh.species);

      // Pond koi bob between the surface and mid-water. No rng, so the ocean and every other animal are untouched.
      if (this.scene === "pond" && sh.species === "koi") {
        const target = clamp(0.35 + 0.45 * Math.sin(time * 0.09 + sh.id * 1.9), 0, 1);
        sh.dive = easeDive(sh.dive, target, dt);
      }

      // Momentum.
      let dx = Math.cos(sh.heading);
      let dy = Math.sin(sh.heading);
      // Edge pulls (pod edge steer and the off-stage return) are added after the low-pass, so they act at full strength.
      let backX = 0;
      let backY = 0;

      // Wander: a slowly drifting offset on a circle ahead of the snout.
      sh.wander = clamp(sh.wander + (this.rng() - 0.5) * dt * 3.2, -1.1, 1.1);
      dx += Math.cos(sh.heading + sh.wander) * 0.45;
      dy += Math.sin(sh.heading + sh.wander) * 0.45;

      // Pod: a cetacean keeps its mates close and swims abreast of them at their mean speed.
      let podSpeed = -1;
      // A pod member with mates in reach drops the orbit patrol and follows its pod instead.
      let podded = false;
      if (beh.pod) {
        let mates = 0;
        let px2 = 0;
        let py2 = 0;
        let headX = 0;
        let headY = 0;
        let speedSum = sh.speed;
        for (const mate of creatures) {
          if (mate === sh || mate.species !== sh.species) continue;
          const ox = mate.nodes[0] - hx;
          const oy = mate.nodes[1] - hy;
          const d = Math.hypot(ox, oy);
          if (d > 3 * L || d < 1e-3) continue;
          mates++;
          px2 += mate.nodes[0];
          py2 += mate.nodes[1];
          headX += Math.cos(mate.heading);
          headY += Math.sin(mate.heading);
          speedSum += mate.speed;
          // Keep a body length of water between pod members.
          if (d < 0.8 * L) {
            const w = 1.5 * (1 - d / (0.8 * L));
            dx -= (ox / d) * w;
            dy -= (oy / d) * w;
          }
        }
        if (mates > 0) {
          const cx = px2 / mates - hx;
          const cy = py2 / mates - hy;
          const cd = Math.hypot(cx, cy) || 1;
          const wc = 0.5 * Math.min(1, mates / 2);
          dx += (cx / cd) * wc;
          dy += (cy / cd) * wc;
          // Swim the way the pod swims; a pod split evenly between two headings has no mean heading to follow.
          if (Math.hypot(headX, headY) >= 1e-6) {
            const mh = Math.atan2(headY, headX);
            dx += Math.cos(mh) * POD_ALIGN;
            dy += Math.sin(mh) * POD_ALIGN;
          }
          // Edge steer: the patrol is gone while podded, so a pod drifting off the canvas turns back here.
          // Inward push from 0 at half a length inside the edge to weight 2 at the edge and beyond.
          backX += edgePush(hx, L) - edgePush(W - hx, L);
          backY += edgePush(hy, L) - edgePush(H - hy, L);
          podSpeed = speedSum / (mates + 1);
          podded = true;
        }
      }

      // Cruise: a pond koi meanders the whole pond toward a slow Lissajous point of its own (no rng, so no hash moves);
      // everything else that is not in a pod patrols a lazy circuit around the headline.
      if (!podded) {
        if (this.scene === "pond") {
          const gx = cxW + 0.36 * W * Math.sin(time * 0.071 + sh.id * 1.7) - hx;
          const gy = cyW + 0.34 * H * Math.sin(time * 0.053 + sh.id * 2.3) - hy;
          const g = Math.hypot(gx, gy) || 1;
          dx += (gx / g) * 0.55;
          dy += (gy / g) * 0.55;
        } else {
          const rx = (hx - cxW) / (W / minSide);
          const ry = hy - cyW;
          const r = Math.hypot(rx, ry) || 1;
          const radius = sh.orbitRadius * (1 + 0.15 * Math.sin(time * 0.05 + sh.id));
          const radial = clamp((radius - r) / radius, -1, 1);
          dx += ((-ry / r) * sh.orbitDir + (rx / r) * radial * 0.9) * 0.55;
          dy += ((rx / r) * sh.orbitDir + (ry / r) * radial * 0.9) * 0.55;
        }
      }

      // Pointer follow: species that follow it hover about 0.35 L short of a nearby pointer, begging.
      const px = this.pointer.x - hx;
      const py = this.pointer.y - hy;
      const pd = Math.hypot(px, py);
      let followed = false;
      if (beh.followsPointer && this.pointer.active && pd < minSide * 0.5 && pd > 1e-3) {
        const k = pd - 0.35 * L;
        const sgn = k >= 0 ? 1 : -1;
        dx += (px / pd) * sgn * 1.2;
        dy += (py / pd) * sgn * 1.2;
        followed = true;
      }

      // Give other animals room. Three probes, the snout and points half a body ahead and behind it, are checked against every other
      // second node. Pod mates swim close on purpose, so they get less room; pond koi that sit at different depths may pass under each other.
      const aheadX = hx + Math.cos(sh.heading) * 0.5 * L;
      const aheadY = hy + Math.sin(sh.heading) * 0.5 * L;
      const midX = hx - Math.cos(sh.heading) * 0.5 * L;
      const midY = hy - Math.sin(sh.heading) * 0.5 * L;
      for (const other of creatures) {
        if (other === sh) continue;
        let scale = other.species === sh.species && beh.pod ? POD_SEPARATION : 1;
        if (sh.species === "koi" && other.species === "koi") {
          scale *= 1 - 0.7 * clamp(Math.abs(sh.dive - other.dive) / 0.5, 0, 1);
        }
        const range = (L + other.length) * SEPARATION_RANGE;
        // One push per neighbour, from its closest probe–node pair, so a big body alongside is no stronger than a
        // small one and the edge return still wins.
        let best = range;
        let bx = 0;
        let by = 0;
        for (let p = 0; p < 3; p++) {
          const qx = p === 0 ? hx : p === 1 ? aheadX : midX;
          const qy = p === 0 ? hy : p === 1 ? aheadY : midY;
          for (let k = 0; k < SPINE_NODES; k += 2) {
            const ox = qx - other.nodes[k * 2];
            const oy = qy - other.nodes[k * 2 + 1];
            const d = Math.hypot(ox, oy);
            if (d < best && d > 1e-3) {
              best = d;
              bx = ox / d;
              by = oy / d;
            }
          }
        }
        if (best < range) {
          const w = (1 - best / range) * SEPARATION_K * scale;
          dx += bx * w;
          dy += by * w;
        }
      }

      // Keep the headline mostly clear: a soft elliptical no-swim zone. A pond has no headline.
      const ex = (hx - cxW) / (W * 0.3);
      const ey = (hy - cyW) / (H * 0.16);
      const e2 = ex * ex + ey * ey;
      if (e2 < 1 && this.scene !== "pond") {
        const e = Math.sqrt(e2) || 1e-3;
        const w = (1 - e) * 2.5;
        dx += (ex / e) * w;
        dy += (ey / e) * w;
      }

      // Turn back once the snout leaves the frame, so bodies dip off-screen
      // now and then but the animals never wander away for good.
      const over = Math.max(-hx, hx - W, -hy, hy - H);
      if (over > -L * 0.05) {
        const w = clamp((over + L * 0.05) / (L * 0.35), 0, 1) * 6;
        const toX = cxW - hx;
        const toY = cyW - hy;
        const d = Math.hypot(toX, toY) || 1;
        backX += (toX / d) * w;
        backY += (toY / d) * w;
      }

      // Low-pass the summed steering, so the target direction drifts instead of jumping with each term.
      const smooth = Math.min(1, dt / STEER_TAU);
      sh.steerX += (dx - sh.steerX) * smooth;
      sh.steerY += (dy - sh.steerY) * smooth;
      const desired = Math.atan2(sh.steerY + backY, sh.steerX + backX);
      // Animals can't pivot on the spot: the turning circle grows with speed. The turn is proportional to the heading error,
      // so small errors give gentle arcs and only large ones reach the cap.
      const radius = over > 0 ? EDGE_TURN_RADIUS : (beh.turnRadius ?? DEFAULT_TURN_RADIUS);
      const agility = Math.min(0.8, sh.speed / (L * radius));
      const maxTurn = agility * dt;
      // A target nearly behind flips between "left" and "right" with every small wobble, so the animal would dither
      // instead of turning round: past ~150° it keeps going the way it is already turning.
      let error = angleDiff(sh.heading, desired);
      if (Math.abs(error) > 2.6 && error * sh.turn < 0) error -= Math.sign(error) * TAU;
      const turned = clamp(error * TURN_GAIN * dt, -maxTurn, maxTurn);
      sh.heading += turned;
      sh.turn += (turned / dt - sh.turn) * Math.min(1, dt * 3);

      const cruise = 30 + L * 0.04;
      let targetSpeed = cruise;
      if (podSpeed >= 0) targetSpeed = podSpeed;
      if (followed) targetSpeed = cruise * 0.7;
      sh.speed += (targetSpeed - sh.speed) * Math.min(1, dt * 1.1);
      sh.phase += dt * (2 + sh.speed / 24);

      nodes[0] += Math.cos(sh.heading) * sh.speed * dt;
      nodes[1] += Math.sin(sh.heading) * sh.speed * dt;

      // Follow-the-leader spine, with a stiffness limit per joint so the
      // body bends into a C at most and never folds back on itself.
      const seg = L / (SPINE_NODES - 1);
      const maxBend = beh.maxBend ?? DEFAULT_MAX_BEND;
      let prevAngle = sh.heading + Math.PI;
      for (let k = 1; k < SPINE_NODES; k++) {
        const px = nodes[(k - 1) * 2];
        const py = nodes[(k - 1) * 2 + 1];
        let angle = Math.atan2(nodes[k * 2 + 1] - py, nodes[k * 2] - px);
        angle = prevAngle + clamp(angleDiff(prevAngle, angle), -maxBend, maxBend);
        nodes[k * 2] = px + Math.cos(angle) * seg;
        nodes[k * 2 + 1] = py + Math.sin(angle) * seg;
        prevAngle = angle;
      }
    }
  }

  private respawn() {
    const { time, width: W, height: H } = this;
    const due: Fish[] = [];
    for (const f of this.fish) if (!f.alive && f.respawnAt <= time) due.push(f);
    if (due.length === 0) return;
    if (due.length < 6 && time - this.lastSpawn < 9) return;
    this.lastSpawn = time;

    // A new school swims in from a random edge.
    const side = randInt(this.rng, 0, 3);
    const along = rand(this.rng, 0.15, 0.85);
    const x = side === 0 ? -20 : side === 1 ? W + 20 : along * W;
    const y = side === 2 ? -20 : side === 3 ? H + 20 : along * H;
    const inward = Math.atan2(H / 2 - y, W / 2 - x) + rand(this.rng, -0.5, 0.5);
    const species = pickSpecies(this.rng);
    const sp = SPECIES[species];
    const millDir: 1 | -1 = this.rng() < 0.5 ? 1 : -1;
    for (const f of due.slice(0, sp.schoolSize[1])) {
      f.alive = true;
      f.species = species;
      f.alarm = 0;
      f.turn = 0;
      f.millDir = millDir;
      f.x = x + rand(this.rng, -1, 1) * this.perception;
      f.y = y + rand(this.rng, -1, 1) * this.perception;
      f.vx = Math.cos(inward) * sp.cruise * 1.4;
      f.vy = Math.sin(inward) * sp.cruise * 1.4;
    }
  }
}
