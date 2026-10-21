// Ported from https://github.com/stackedlol/ascii-sharks (used with the author's permission).
/**
 * Artificial-life sim for the hero: tiny fish schools and the sharks that hunt them.
 *
 * Fish: Reynolds boids (separation / alignment / cohesion) in Couzin-style
 * zones, with a blind spot behind each fish. Alarm spreads from fish to fish
 * through the school (a "wave of agitation"), so a whole school bolts even
 * when only its edge can see the shark. Fleeing fish break sideways around the
 * shark's path, which gives the fountain effect seen in real bait balls.
 *
 * Sharks: Reynolds steering (wander + pursuit + separation) on a
 * follow-the-leader spine. Hunger builds over time and drops when they eat.
 * They prefer fish in sparse spots, since dense schools confuse predators,
 * so stragglers get picked off. Eaten fish come back later as new schools
 * swimming in from the edges, which keeps the population steady.
 */
import { angleDiff, clamp, createRng, current, rand, randInt, type Rng, TAU } from "./math";
import { type ActionId, behaviourOf, type Behaviour } from "./creatures/behaviour";
import {
  ACTIONS,
  approachSteer,
  engaged,
  type Aim,
  type ActionContext,
  type PoseTargets,
} from "./creatures/actions";
import { CREATURE_IDS, CREATURES } from "./creatures";
import { rosterFromSharks, type RosterEntry } from "./creatures/roster";
import type { CreatureSpecies, OceanScene } from "./creatures/types";
import { pickSpecies, SPECIES } from "./species";

export const SPINE_NODES = 20;
/** The spine node nearest 12% of the length from the snout: where a cetacean's blowhole sits. */
const BLOWHOLE_NODE = Math.round(0.12 * (SPINE_NODES - 1));

/** Most food groups in the water at once; a seventh offering is only a ripple. */
const FOOD_GROUPS = 6;
/** Morsels in the pool, shared by all food groups. */
const MORSELS = 48;
/**
 * How fast each pose eases toward its target: p += (target − p) · min(1, dt · rate). Slow enough that no pose
 * snaps; a body rolls, pitches and lifts over a fraction of a second, and a mouth can still open quickly.
 */
const POSE_RATE = {
  height: 3,
  pitch: 2.2,
  roll: 1.6,
  gape: 5,
  slap: 4,
  dive: 5,
} as const;

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
  /** Ocean has bait fish that nibble food; pond food is pellets that dissolve. Default "ocean". */
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
  /** Seconds left stunned: drifts, can't steer, and is an easy meal. */
  stun: number;
}

/** A single piece of food in the water: a bait scrap in the ocean, a pellet in a pond. */
export interface Morsel {
  x: number;
  y: number;
  vx: number;
  vy: number;
  alive: boolean;
  age: number;
  life: number;
  /** 0 fresh → 1 sunk away (ocean) or dissolved (pond). */
  fade: number;
  group: number;
}

/** One offering: the morsels dropped by a single click. */
export interface FoodGroup {
  id: number;
  x: number;
  y: number;
  alive: boolean;
  born: number;
}

/** A creature's food state: cruise, or answering a group of food. */
export type CreatureState = "cruise" | "notice" | "approach" | "action" | "recover";

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
  hunger: number;
  wander: number;
  orbitDir: 1 | -1;
  orbitRadius: number;
  target: Fish | null;
  retargetAt: number;
  /** 0 far / dim → 1 near / bright. */
  depth: number;
  /** Named coat from the species' `coats`, for species that have them. */
  coat?: string;
  /** Food state machine; see stepForaging(). */
  state: CreatureState;
  stateUntil: number;
  /** Food group being answered, or -1 for none. */
  foodGroup: number;
  actionId: ActionId | null;
  actionStart: number;
  /** Clock mark an action sets for its own phases (a whip's start, a slow peck's next bite); -1 until set. Reset on engagement. */
  actionMark: number;
  cooldownUntil: number;
  /** Body poses, eased toward the action's targets. All 0 at rest; see the renderer's pose block. */
  height: number;
  pitch: number;
  roll: number;
  gape: number;
  slap: number;
  /** Sinking under the surface, 0–1 (cetaceans after a breath). */
  dive: number;
  /**
   * 0 under water, 1 fully out, 2 back under; the surface line runs from the snout (s = 0) to the tail as it rises
   * and again as it falls. Set by a jump (see actions.ts); 0 for everything else.
   */
  emerge: number;
  /** Cetaceans: when the next breath is due, and until when it lasts (Infinity for the rest). */
  nextBreath: number;
  breathUntil: number;
  /** Breath series (orca, humpback): blows still to take in this series, and when the dive after it ends. */
  blowsLeft: number;
  diveUntil: number;
  /** When the next show (Behaviour.shows) is due to be tried. */
  nextShow: number;
  /** Porpoising: the next show is a leap. Set by a food-less leap that chains; cleared when used. */
  chain: boolean;
}

/** Mutable view of ActionContext: the world fills one shared object each step. */
type MutableContext = { -readonly [K in keyof ActionContext]: ActionContext[K] };

export interface WorldEvent {
  kind: "eat" | "splash" | "ripple" | "blow" | "bubble";
  x: number;
  y: number;
  /** Body length in px of the animal behind the event, when there is one. */
  size?: number;
}

/** Most herd zones one step can hold: a pod of four orcas or humpbacks each adds one. */
const HERD_ZONES = 4;

const FISH_SEPARATION_K = 420;
const FISH_ALIGN_K = 1.4;
const FISH_COHESION_K = 1;
const FISH_FLEE_K = 1100;
const BLIND_COS = -0.6; // ~127° either side of the heading is visible

/** Inward steer from an edge `depth` px inside it: 0 at half a length in, 2 at the edge and beyond. */
function edgePush(depth: number, L: number) {
  const margin = 0.5 * L;
  return 2 * clamp((margin - depth) / margin, 0, 1);
}

/** Blows in a series, from the id and the clock: a whole number from blows[0] to blows[1]. */
function seriesBlows(id: number, [lo, hi]: [number, number], time: number) {
  return lo + Math.floor(((id * 4.9 + time * 0.17) % 1) * (hi - lo + 1));
}

/** Seconds between two blows of a series, from the id and the clock. */
function seriesGap(id: number, [lo, hi]: [number, number], time: number) {
  return lo + ((id * 3.7 + time * 0.31) % 1) * (hi - lo);
}

/** Seconds a series' dive lasts, from the id and the clock. */
function seriesDive(id: number, [lo, hi]: [number, number], time: number) {
  return lo + ((id * 4.1 + time * 0.07) % 1) * (hi - lo);
}

/** One eased pose step: p → target at rate k, snapped to exactly 0 when at rest there. */
function easePose(p: number, target: number, k: number) {
  const v = p + (target - p) * k;
  return target === 0 && Math.abs(v) < 1e-3 ? 0 : v;
}

/** The food-less shows that jump clear of the water. Sharks jump with `breach`, from their action list instead. */
export const JUMP_SHOWS: ReadonlySet<ActionId> = new Set<ActionId>(["leap", "breachRoll"]);

export class World {
  width = 0;
  height = 0;
  time = 0;
  fish: Fish[] = [];
  creatures: Creature[] = [];
  events: WorldEvent[] = [];
  pointer = { x: 0, y: 0, active: false };
  scene: OceanScene;
  /** Preallocated food pools: nothing is allocated once the world is built. */
  morsels: Morsel[];
  food: FoodGroup[];

  /** Fish neighbourhood radius; the spatial hash bucket size matches it. */
  private perception = 60;
  /** Per-species personal space in px (x, y). */
  private sepX: number[] = [];
  private sepY: number[] = [];
  private foreignSep = 40;
  private bucketCols = 0;
  private bucketRows = 0;
  private bucketHead = new Int32Array(0);
  private bucketCount = new Uint16Array(0);
  private bucketNext = new Int32Array(0);
  private lastSpawn = 0;
  private tmp = { x: 0, y: 0 };
  private rng: Rng;
  private roster: RosterEntry[];
  private fishCount?: number;
  private baitFish: number | "auto" | false;
  /** Cell size in px, set by resize(); morsels scatter in cells. */
  private cellW = 0;
  private cellH = 0;
  /** True while any morsel is alive; the fish and food steps skip their work otherwise. */
  private feeding = false;
  /** Steering a creature gets from its food state this step; w = 0 means none. */
  private aim: Aim = { dx: 0, dy: 0, w: 0, speed: 0, closing: 0, hunting: false };
  /** Pose targets the current creature's action writes this step; reset before every step. */
  private poseTarget: PoseTargets = {
    height: 0,
    pitch: 0,
    roll: 0,
    gape: 0,
    slap: 0,
    dive: 0,
    emerge: 0,
  };
  /**
   * The one ActionContext every action reads. Filled per creature in stepForaging, so no step allocates.
   * `sh` is a placeholder until the first creature is stepped; no action runs before that.
   */
  private actx: MutableContext = {
    time: 0,
    dt: 0,
    L: 0,
    sh: null as unknown as Creature,
    t: 0,
    target: null,
    dist: 0,
    width: 0,
    height: 0,
    aim: this.aim,
    pose: this.poseTarget,
    eatNear: (radius) => this.eatNear(radius),
    pullMorsels: (radius, speed) => this.pullMorsels(radius, speed),
    stunFish: (x, y, radius, seconds) => this.stunFish(x, y, radius, seconds),
    schoolNear: (x, y, radius, out, stunnedOnly) => this.schoolNear(x, y, radius, out, stunnedOnly),
    herd: (x, y, radius, inward, swirl) => this.herd(x, y, radius, inward, swirl),
    eatFishNear: (radius) => this.eatFishNear(radius),
    packNear: (radius) => this.packNear(radius),
    emit: (kind, x, y, size) => {
      this.events.push({ kind, x, y, size });
    },
  };
  /** Scratch for responder selection: creature indices sorted by distance, and their distances. */
  private order: Int32Array;
  private dist: Float64Array;
  /** Scratch: creature indices of this offering's pod responders. */
  private leads: Int32Array;
  /** Scratch: responders taken per species this offering. */
  private taken = new Int32Array(CREATURE_IDS.length);
  /** Herd zones actions add this step: [x, y, radius, inward, swirl] per zone. stepFish reads and clears them. */
  private herdZones = new Float64Array(HERD_ZONES * 5);
  private herdCount = 0;

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
    this.morsels = Array.from({ length: MORSELS }, () => ({
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      alive: false,
      age: 0,
      life: 0,
      fade: 0,
      group: -1,
    }));
    this.food = Array.from({ length: FOOD_GROUPS }, (_, id) => ({
      id,
      x: 0,
      y: 0,
      alive: false,
      born: 0,
    }));
    this.order = new Int32Array(this.roster.length);
    this.dist = new Float64Array(this.roster.length);
    this.leads = new Int32Array(this.roster.length);
  }

  resize(width: number, height: number, cellW: number, cellH: number) {
    const first = this.width === 0;
    this.width = width;
    this.height = height;
    this.actx.width = width;
    this.actx.height = height;
    this.cellW = cellW;
    this.cellH = cellH;
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
      // Breath timers are spread by id, so cetaceans breathe out of step without any rng.
      const beh = behaviourOf(entry.species);
      const breath = beh.breathes;
      const series = beh.breathSeries;
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
        hunger: rand(this.rng, 0.25, 0.75),
        wander: 0,
        orbitDir,
        orbitRadius,
        target: null,
        retargetAt: 0,
        depth: entry.depth,
        coat: entry.coat,
        state: "cruise",
        stateUntil: 0,
        foodGroup: -1,
        actionId: null,
        actionStart: 0,
        actionMark: -1,
        cooldownUntil: 0,
        height: 0,
        pitch: 0,
        roll: 0,
        gape: 0,
        slap: 0,
        dive: 0,
        emerge: 0,
        nextBreath: breath
          ? breath[0] + (((i + 1) * 7.31) % 1) * (breath[1] - breath[0])
          : Infinity,
        breathUntil: -Infinity,
        blowsLeft: series ? seriesBlows(i + 1, series.blows, 0) : 0,
        diveUntil: -Infinity,
        nextShow: 8 + (((i + 1) * 3.17) % 1) * 10,
        chain: false,
      });
    }
    // Smaller (farther) sharks draw first so the big one swims over them.
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
          stun: 0,
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
    this.stepFood(dt);
    this.stepFish(dt);
    this.stepCreatures(dt);
    this.respawn();
  }

  /**
   * Drops food at (x, y). Creatures that are cruising and near enough answer it.
   * Returns false, with only a ripple, when six offerings are already in the water.
   */
  offerFood(x: number, y: number): boolean {
    let group: FoodGroup | undefined;
    for (const g of this.food) {
      if (!g.alive) {
        group = g;
        break;
      }
    }
    if (!group) {
      this.events.push({ kind: "splash", x, y });
      return false;
    }

    const ocean = this.scene === "ocean";
    const want = ocean ? randInt(this.rng, 3, 6) : randInt(this.rng, 4, 8);
    let placed = 0;
    for (const m of this.morsels) {
      if (placed === want) break;
      if (m.alive) continue;
      m.alive = true;
      m.group = group.id;
      m.x = x + rand(this.rng, -1.5, 1.5) * this.cellW;
      m.y = y + rand(this.rng, -1.5, 1.5) * this.cellH;
      m.vx = 0;
      m.vy = 0;
      m.age = 0;
      m.life = ocean ? rand(this.rng, 8, 11) : rand(this.rng, 12, 15);
      m.fade = 0;
      placed++;
    }
    if (placed === 0) {
      this.events.push({ kind: "splash", x, y });
      return false;
    }

    group.alive = true;
    group.x = x;
    group.y = y;
    group.born = this.time;
    if (ocean) this.splash(x, y);
    this.recruit(group);
    return true;
  }

  /**
   * Picks who answers an offering: cruising creatures within their sense range, nearest first, up to
   * their species' cap. Each one notices, then approaches. If nobody qualifies, the nearest cruiser
   * glances at the food and goes straight back to cruising.
   */
  private recruit(group: FoodGroup) {
    const { x, y } = group;
    const { creatures, time } = this;
    const minSide = Math.min(this.width, this.height);

    let n = 0;
    for (let i = 0; i < creatures.length; i++) {
      const sh = creatures[i];
      if (sh.state !== "cruise" || time < sh.cooldownUntil) continue;
      const d = Math.hypot(sh.nodes[0] - x, sh.nodes[1] - y);
      if (d > behaviourOf(sh.species).senseRange * minSide) continue;
      // Insertion sort by distance into the preallocated index array.
      let k = n++;
      while (k > 0 && this.dist[this.order[k - 1]] > d) {
        this.order[k] = this.order[k - 1];
        k--;
      }
      this.order[k] = i;
      this.dist[i] = d;
    }

    this.taken.fill(0);
    let responders = 0;
    let leads = 0;
    for (let k = 0; k < n; k++) {
      const sh = creatures[this.order[k]];
      const beh = behaviourOf(sh.species);
      const si = CREATURE_IDS.indexOf(sh.species);
      if (this.taken[si] >= beh.maxResponders) continue;
      this.taken[si]++;
      responders++;
      this.answer(sh, group, beh);
      if (beh.pod) this.leads[leads++] = this.order[k];
    }

    // Pod response: a pod responder pulls its cruising mates within 3·L into the same food. They all go for the bite.
    for (let k = 0; k < leads; k++) {
      const lead = creatures[this.leads[k]];
      const beh = behaviourOf(lead.species);
      const si = CREATURE_IDS.indexOf(lead.species);
      for (const mate of creatures) {
        if (this.taken[si] >= beh.maxResponders) break;
        if (mate === lead || mate.species !== lead.species || mate.state !== "cruise") continue;
        if (time < mate.cooldownUntil) continue;
        const d = Math.hypot(mate.nodes[0] - lead.nodes[0], mate.nodes[1] - lead.nodes[1]);
        if (d > 3 * lead.length) continue;
        this.taken[si]++;
        responders++;
        this.answer(mate, group, beh, "approachAndBite");
      }
    }

    if (responders > 0) return;
    let nearest: Creature | null = null;
    let best = Infinity;
    for (const sh of creatures) {
      if (sh.state !== "cruise") continue;
      const d = Math.hypot(sh.nodes[0] - x, sh.nodes[1] - y);
      if (d < best) {
        best = d;
        nearest = sh;
      }
    }
    if (nearest) {
      nearest.state = "notice";
      nearest.stateUntil = time + 1.2;
      nearest.foodGroup = group.id;
      nearest.actionId = null;
    }
  }

  /**
   * One creature takes the offering: pick its action by weight (one rng call), or use `forced` with no roll,
   * then start its cooldown (one rng call).
   */
  private answer(sh: Creature, group: FoodGroup, beh: Behaviour, forced?: ActionId) {
    let picked: ActionId = forced ?? beh.actions[beh.actions.length - 1].id;
    if (!forced) {
      let total = 0;
      for (const a of beh.actions) total += a.weight;
      let roll = this.rng() * total;
      for (const a of beh.actions) {
        roll -= a.weight;
        if (roll < 0) {
          picked = a.id;
          break;
        }
      }
    }
    // A signature move whose precondition fails falls back to the plain bite. No rng here.
    const def = ACTIONS[picked];
    if (def.requires) {
      const ctx = this.actx;
      const m = this.nearestMorsel(group.id, sh.nodes[0], sh.nodes[1]);
      ctx.time = this.time;
      ctx.sh = sh;
      ctx.L = sh.length;
      ctx.t = 0;
      ctx.target = m;
      ctx.dist = m ? Math.hypot(m.x - sh.nodes[0], m.y - sh.nodes[1]) : Infinity;
      if (!def.requires(ctx)) picked = "approachAndBite";
    }
    sh.state = "notice";
    sh.stateUntil = this.time + 0.35;
    sh.foodGroup = group.id;
    sh.actionId = picked;
    sh.cooldownUntil = this.time + rand(this.rng, beh.cooldown[0], beh.cooldown[1]);
  }

  /** Morsels drift with the current, sink (ocean) or dissolve at the end (pond), and die when their life runs out. */
  private stepFood(dt: number) {
    let live = false;
    for (const m of this.morsels) {
      if (m.alive) {
        live = true;
        break;
      }
    }
    this.feeding = live;
    if (!live) {
      // The last morsel can be eaten outside this loop; with none left, every group is spent.
      for (const g of this.food) g.alive = false;
      return;
    }

    const ocean = this.scene === "ocean";
    const drift = ocean ? 0.25 : 0.12;
    const cur = this.tmp;
    for (const m of this.morsels) {
      if (!m.alive) continue;
      m.age += dt;
      if (m.age >= m.life) {
        m.alive = false;
        continue;
      }
      current(m.x, m.y, this.time, cur);
      m.vx = cur.x * drift;
      // Seen from above, sinking shows as fading (see `fade`), not as moving down the screen.
      m.vy = cur.y * drift;
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      m.fade = ocean ? m.age / m.life : clamp((m.age - (m.life - 1.5)) / 1.5, 0, 1);
    }
    // A group is spent once none of its morsels is left.
    for (const g of this.food) {
      if (!g.alive) continue;
      let any = false;
      for (const m of this.morsels) {
        if (m.alive && m.group === g.id) {
          any = true;
          break;
        }
      }
      if (!any) g.alive = false;
    }
  }

  private rebuildHash() {
    const size = this.perception;
    const pad = 2;
    this.bucketCols = Math.ceil(this.width / size) + pad * 2;
    this.bucketRows = Math.ceil(this.height / size) + pad * 2;
    const n = this.bucketCols * this.bucketRows;
    if (this.bucketHead.length !== n) {
      this.bucketHead = new Int32Array(n);
      this.bucketCount = new Uint16Array(n);
    }
    this.bucketHead.fill(-1);
    this.bucketCount.fill(0);
    if (this.bucketNext.length !== this.fish.length) {
      this.bucketNext = new Int32Array(this.fish.length);
    }
    for (let i = 0; i < this.fish.length; i++) {
      const f = this.fish[i];
      if (!f.alive) continue;
      const b = this.bucketOf(f.x, f.y);
      this.bucketNext[i] = this.bucketHead[b];
      this.bucketHead[b] = i;
      this.bucketCount[b]++;
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
    // Bait fish nibble at food that has been lying in the ocean for a bit.
    const nibble = this.feeding && this.scene === "ocean";
    const morsels = this.morsels;
    const herdZones = this.herdZones;
    const herdCount = this.herdCount;

    for (let i = 0; i < fish.length; i++) {
      const f = fish[i];
      if (!f.alive) continue;
      if (f.stun > 0) {
        // Stunned: no steering and no alarm; it slows to a drift.
        f.stun = Math.max(0, f.stun - dt);
        const damp = 1 - Math.min(1, dt * 3);
        f.vx *= damp;
        f.vy *= damp;
        f.alarm = 0;
        f.x = clamp(f.x + f.vx * dt, -60, W + 60);
        f.y = clamp(f.y + f.vy * dt, -60, H + 60);
        continue;
      }
      const sp = SPECIES[f.species];
      // Alarmed fish want more room: the school flashes apart around a
      // shark and closes back up once the threat fades.
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
      let herded = false;

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
      // half of the shark, so fish also give the flanks a wide berth.
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
        // Fountain effect: break to whichever side of the shark's path you're on.
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

      if (nibble && f.alarm < 0.3) {
        for (const m of morsels) {
          if (!m.alive || m.age <= 2) continue;
          const dx = m.x - f.x;
          const dy = m.y - f.y;
          const d = Math.hypot(dx, dy);
          if (d >= 160 || d < 1e-3) continue;
          const k = 260 * (1 - d / 160);
          ax += (dx / d) * k;
          ay += (dy / d) * k;
        }
      }

      // Herd zones from this step's actions: pulled in toward the centre and swirled round it.
      for (let z = 0; z < herdCount; z++) {
        const o = z * 5;
        const hdx = herdZones[o] - f.x;
        const hdy = herdZones[o + 1] - f.y;
        const hd = Math.hypot(hdx, hdy);
        if (hd >= herdZones[o + 2] || hd < 1e-3) continue;
        ax += (hdx / hd) * herdZones[o + 3] - (hdy / hd) * herdZones[o + 4];
        ay += (hdy / hd) * herdZones[o + 3] + (hdx / hd) * herdZones[o + 4];
        herded = true;
      }

      // Alarm: direct threat sets it, neighbours pass it along (slightly
      // weaker each hop), and it fades on its own.
      let alarm = Math.max(f.alarm * calmDecay, fear);
      if (herded && alarm < 0.5) alarm = 0.5;
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
      f.x = clamp(f.x + f.vx * dt, -60, W + 60);
      f.y = clamp(f.y + f.vy * dt, -60, H + 60);
    }
    // The zones were for this step only; the next actions write fresh ones.
    this.herdCount = 0;
  }

  /** ActionContext.herd: queues a herd zone for stepFish. Zones past HERD_ZONES are dropped. */
  private herd(x: number, y: number, radius: number, inward: number, swirl: number) {
    if (this.herdCount >= HERD_ZONES) return;
    const o = this.herdCount * 5;
    this.herdZones[o] = x;
    this.herdZones[o + 1] = y;
    this.herdZones[o + 2] = radius;
    this.herdZones[o + 3] = inward;
    this.herdZones[o + 4] = swirl;
    this.herdCount++;
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

      sh.hunger = Math.min(1, sh.hunger + dt * 0.03);

      // Momentum.
      let dx = Math.cos(sh.heading);
      let dy = Math.sin(sh.heading);

      // Wander: a slowly drifting offset on a circle ahead of the snout.
      sh.wander = clamp(sh.wander + (this.rng() - 0.5) * dt * 3.2, -1.1, 1.1);
      dx += Math.cos(sh.heading + sh.wander) * 0.45;
      dy += Math.sin(sh.heading + sh.wander) * 0.45;

      // Food first: the state machine may take this creature off hunting for a while.
      const beh = behaviourOf(sh.species);
      this.stepForaging(sh, L, dt);
      if (beh.breathes) this.stepBreath(sh, beh.breathes, beh.breathSeries);
      if (beh.shows && sh.state === "cruise") this.stepShows(sh, beh.shows);
      this.easePoses(sh, dt);
      const aim = this.aim;

      // Pod: a cruising cetacean keeps its mates close and swims abreast of them at their mean speed.
      let podSpeed = -1;
      // A pod member with mates in reach drops the orbit patrol and follows its pod instead.
      let podded = false;
      if (beh.pod && sh.state === "cruise") {
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
            dx += Math.cos(mh) * 0.6;
            dy += Math.sin(mh) * 0.6;
          }
          // Edge steer: the patrol is gone while podded, so a pod drifting off the canvas turns back here.
          // Inward push from 0 at half a length inside the edge to weight 2 at the edge and beyond.
          dx += edgePush(hx, L) - edgePush(W - hx, L);
          dy += edgePush(hy, L) - edgePush(H - hy, L);
          podSpeed = speedSum / (mates + 1);
          podded = true;
        }
      }

      // Hunt. Animals busy with food, and species that don't hunt fish, never chase fish.
      if (aim.w > 0 || !beh.huntsFish) {
        sh.target = null;
      } else if (time >= sh.retargetAt) {
        sh.target = this.findPrey(sh);
        sh.retargetAt = time + 0.45;
      }
      const t = sh.target;
      let hunting = false;
      let closing = 0;
      let followed = false;
      if (aim.w > 0) {
        dx += aim.dx * aim.w;
        dy += aim.dy * aim.w;
        hunting = aim.hunting;
        closing = aim.closing;
      } else if (t && t.alive && sh.hunger > 0.3) {
        // Pursuit: aim at where the fish is about to be.
        const tx = t.x + t.vx * 0.35 - hx;
        const ty = t.y + t.vy * 0.35 - hy;
        const d = Math.hypot(tx, ty) || 1;
        const w = 1.4 + 2.6 * sh.hunger;
        dx += (tx / d) * w;
        dy += (ty / d) * w;
        hunting = true;
        closing = clamp(1 - d / (L * 0.9), 0, 1);
      } else if (!podded && this.scene === "pond") {
        // Pond: koi meander over the whole pond toward a slow Lissajous point of their own (no rng, so no hash moves).
        const gx = cxW + 0.36 * W * Math.sin(time * 0.071 + sh.id * 1.7) - hx;
        const gy = cyW + 0.34 * H * Math.sin(time * 0.053 + sh.id * 2.3) - hy;
        const g = Math.hypot(gx, gy) || 1;
        dx += (gx / g) * 0.55;
        dy += (gy / g) * 0.55;
      } else if (!podded) {
        // Patrol: a lazy circuit around the headline.
        const rx = (hx - cxW) / (W / minSide);
        const ry = hy - cyW;
        const r = Math.hypot(rx, ry) || 1;
        const radius = sh.orbitRadius * (1 + 0.15 * Math.sin(time * 0.05 + sh.id));
        const radial = clamp((radius - r) / radius, -1, 1);
        dx += ((-ry / r) * sh.orbitDir + (rx / r) * radial * 0.9) * 0.55;
        dy += ((rx / r) * sh.orbitDir + (ry / r) * radial * 0.9) * 0.55;
      }

      // Pointer follow: species that follow it hover about 0.35 L short of a nearby pointer, begging.
      const px = this.pointer.x - hx;
      const py = this.pointer.y - hy;
      const pd = Math.hypot(px, py);
      if (
        beh.followsPointer &&
        this.pointer.active &&
        aim.w === 0 &&
        sh.state === "cruise" &&
        pd < minSide * 0.5 &&
        pd > 1e-3
      ) {
        const k = pd - 0.35 * L;
        const sgn = k >= 0 ? 1 : -1;
        dx += (px / pd) * sgn * 1.2;
        dy += (py / pd) * sgn * 1.2;
        followed = true;
      }

      // Give other sharks room.
      for (const other of creatures) {
        if (other === sh) continue;
        for (let k = 0; k < SPINE_NODES; k += 4) {
          const ox = hx - other.nodes[k * 2];
          const oy = hy - other.nodes[k * 2 + 1];
          const d = Math.hypot(ox, oy);
          const range = (L + other.length) * 0.45;
          if (d < range && d > 1e-3) {
            const w = (1 - d / range) * 3;
            dx += (ox / d) * w;
            dy += (oy / d) * w;
          }
        }
      }

      // Keep the headline mostly clear: a soft elliptical no-swim zone. A pond has no headline.
      const ex = (hx - cxW) / (W * 0.3);
      const ey = (hy - cyW) / (H * 0.16);
      const e2 = ex * ex + ey * ey;
      if (e2 < 1 && this.scene !== "pond") {
        const e = Math.sqrt(e2) || 1e-3;
        const w = (1 - e) * (hunting ? 1 : 2.5);
        dx += (ex / e) * w;
        dy += (ey / e) * w;
      }

      // Turn back once the snout leaves the frame, so bodies dip off-screen
      // now and then but the sharks never wander away for good.
      const over = Math.max(-hx, hx - W, -hy, hy - H);
      if (over > -L * 0.05) {
        const w = clamp((over + L * 0.05) / (L * 0.35), 0, 1) * 3.5;
        const toX = cxW - hx;
        const toY = cyW - hy;
        const d = Math.hypot(toX, toY) || 1;
        dx += (toX / d) * w;
        dy += (toY / d) * w;
      }

      const desired = Math.atan2(dy, dx);
      // Sharks can't pivot on the spot: the turning circle grows with speed.
      // A species turning radius applies to cruising only; going for food, every animal turns as tight as a shark.
      const radius = hunting || sh.state !== "cruise" ? 0.22 : (beh.turnRadius ?? 0.22);
      const agility = Math.min(hunting ? 1.7 + closing : 0.8, sh.speed / (L * radius));
      const maxTurn = agility * dt;
      const turned = clamp(angleDiff(sh.heading, desired), -maxTurn, maxTurn);
      sh.heading += turned;
      sh.turn += (turned / dt - sh.turn) * Math.min(1, dt * 3);

      const cruise = 30 + L * 0.04;
      let targetSpeed = hunting ? cruise * (1.45 + closing * 1.5) : cruise;
      if (podSpeed >= 0 && !hunting) targetSpeed = podSpeed;
      if (aim.w > 0) targetSpeed = cruise * aim.speed;
      else if (followed) targetSpeed = cruise * 0.7;
      // Surfacing to breathe slows a cetacean down, except in the middle of an action.
      if (sh.state !== "action" && time < sh.breathUntil) targetSpeed *= 0.8;
      // Going for food, the speed picks up at once, and the tail beats harder the faster it goes.
      const foodRush = sh.state === "approach" || sh.state === "action";
      sh.speed += (targetSpeed - sh.speed) * Math.min(1, dt * (foodRush ? 2.4 : 1.1));
      // Tail beat multiplier: 1 at cruise, up to 2.7 at 2.2× cruise.
      const beat = foodRush ? 1 + 1.4 * clamp(sh.speed / cruise - 1, 0, 1.2) : 1;
      sh.phase += dt * (2 + sh.speed / 24) * beat;

      nodes[0] += Math.cos(sh.heading) * sh.speed * dt;
      nodes[1] += Math.sin(sh.heading) * sh.speed * dt;

      // Follow-the-leader spine, with a stiffness limit per joint so the
      // body bends into a C at most and never folds back on itself.
      const seg = L / (SPINE_NODES - 1);
      const maxBend = beh.maxBend ?? 0.16;
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

      // Feed.
      if (sh.hunger > 0.15) {
        const mouthR = L * 0.05 + 8;
        const mx = nodes[0];
        const my = nodes[1];
        for (const f of this.fish) {
          if (!f.alive) continue;
          if ((f.x - mx) ** 2 + (f.y - my) ** 2 < mouthR * mouthR) {
            f.alive = false;
            f.respawnAt = time + rand(this.rng, 3, 8);
            sh.hunger = Math.max(0, sh.hunger - 0.16);
            this.events.push({ kind: "eat", x: f.x, y: f.y, size: L });
          }
        }
      }
    }
  }

  /**
   * Advances a creature's food state (cruise → notice → approach → action → recover → cruise) and leaves
   * this step's steering in `this.aim`. Cruising creatures are left alone. No rng is used here.
   */
  private stepForaging(sh: Creature, L: number, dt: number) {
    const aim = this.aim;
    aim.w = 0;
    aim.speed = 0;
    aim.hunting = false;
    aim.closing = 0;
    const pose = this.poseTarget;
    pose.height = 0;
    pose.pitch = 0;
    pose.roll = 0;
    pose.gape = 0;
    pose.slap = 0;
    pose.dive = 0;
    pose.emerge = 0;
    if (sh.state === "cruise") {
      // Pond koi cruising bob between the surface and mid-water. Set here, because this step's reset
      // clears the pose targets before easePoses; no rng, and the ocean is untouched.
      if (this.scene === "pond" && sh.species === "koi") {
        pose.dive = clamp(0.35 + 0.45 * Math.sin(this.time * 0.09 + sh.id * 1.9), 0, 1);
      }
      return;
    }

    const { time } = this;
    const group = sh.foodGroup >= 0 ? this.food[sh.foodGroup] : undefined;
    if (sh.state === "recover") {
      if (time >= sh.stateUntil) this.calm(sh);
      return;
    }
    // An engaged action plays out even once its food is gone (a leap still lands); before that, no food ends it.
    const engagedAction = sh.state === "action";
    if (!engagedAction && (!group || !group.alive)) {
      this.recover(sh);
      return;
    }

    if (sh.state === "notice" && group) {
      if (time < sh.stateUntil) {
        const hx = sh.nodes[0];
        const hy = sh.nodes[1];
        const d = Math.hypot(group.x - hx, group.y - hy) || 1;
        aim.dx = (group.x - hx) / d;
        aim.dy = (group.y - hy) / d;
        aim.w = 2.5;
        aim.speed = 1;
      } else if (sh.actionId === null) {
        // The glance at food was all there was to it.
        this.calm(sh);
      } else {
        sh.state = "approach";
      }
      return;
    }

    // Approach: the default steering at the nearest morsel, until the action's engagement check passes.
    // Action: the action's step runs every step until it returns true or its time is up.
    if (sh.state === "action" && time >= sh.stateUntil) {
      this.recover(sh);
      return;
    }
    const hx = sh.nodes[0];
    const hy = sh.nodes[1];
    const m = group && group.alive ? this.nearestMorsel(group.id, hx, hy) : null;
    if (!m && !engagedAction) {
      this.recover(sh);
      return;
    }
    const def = ACTIONS[sh.actionId ?? "approachAndBite"];
    const ctx = this.actx;
    ctx.time = time;
    ctx.dt = dt;
    ctx.L = L;
    ctx.sh = sh;
    ctx.target = m;
    ctx.dist = m ? Math.hypot(m.x - hx, m.y - hy) : Infinity;
    if (sh.state === "approach" && m) {
      if (!engaged(def, ctx)) {
        approachSteer(def, ctx);
        return;
      }
      this.engage(sh);
    }
    ctx.t = time - sh.actionStart;
    if (def.step(ctx) === true) this.recover(sh);
  }

  /** Eases each pose toward this step's target at its own rate; snaps to exactly 0 once it is back at rest. */
  private easePoses(sh: Creature, dt: number) {
    const tg = this.poseTarget;
    sh.height = easePose(sh.height, tg.height, Math.min(1, dt * POSE_RATE.height));
    sh.pitch = easePose(sh.pitch, tg.pitch, Math.min(1, dt * POSE_RATE.pitch));
    sh.roll = easePose(sh.roll, tg.roll, Math.min(1, dt * POSE_RATE.roll));
    sh.gape = easePose(sh.gape, tg.gape, Math.min(1, dt * POSE_RATE.gape));
    sh.slap = easePose(sh.slap, tg.slap, Math.min(1, dt * POSE_RATE.slap));
    sh.dive = easePose(sh.dive, tg.dive, Math.min(1, dt * POSE_RATE.dive));
    // Back under at 2 looks the same as under at 0, so a finished jump drops straight to 0 rather than easing back
    // through the falling range (which would sweep the surface line along the body again).
    if (tg.emerge === 0 && sh.emerge > 1.9) sh.emerge = 0;
    else sh.emerge = easePose(sh.emerge, tg.emerge, Math.min(1, dt * POSE_RATE.dive));
  }

  /**
   * Cetacean breathing. A single breather (bottlenose) surfaces on its timer, blows and sinks back. A series breather
   * (orca, humpback) blows a run of breaths, then dives for a while with no breath; a humpback raises its flukes
   * into a sounding dive first. Timers come from the id and the clock, so no rng is used. Writes the height and dive
   * pose targets; the speed drop is in stepCreatures. A breath due mid-action waits half a second.
   */
  private stepBreath(
    sh: Creature,
    [min, max]: [number, number],
    series: Behaviour["breathSeries"],
  ) {
    const { time } = this;
    if (time >= sh.nextBreath) {
      if (sh.state === "action") {
        sh.nextBreath = time + 0.5;
      } else if (!series) {
        this.blow(sh);
        sh.nextBreath = time + min + ((sh.id * 7.31 + time * 0.37) % 1) * (max - min);
      } else if (sh.blowsLeft > 0) {
        this.blow(sh);
        sh.blowsLeft--;
        if (sh.blowsLeft > 0) {
          sh.nextBreath = time + seriesGap(sh.id, series.gap, time);
        } else {
          // The last blow: the dive runs from the end of its breath pose.
          sh.diveUntil = time + seriesDive(sh.id, series.dive, time);
          sh.nextBreath = sh.breathUntil;
        }
      } else if (time < sh.diveUntil) {
        // Sounding: a humpback raises its flukes once the breath pose is over. A fluke that cannot start yet waits a second.
        if (!series.fluke || this.startShow(sh, "soundDive") > 0) sh.nextBreath = sh.diveUntil;
        else sh.nextBreath = time + 1;
      } else {
        // The dive is over: a new series.
        sh.blowsLeft = seriesBlows(sh.id, series.blows, time);
        sh.nextBreath = time + 0.5;
      }
    }
    if (sh.state === "action") return;
    if (time < sh.breathUntil) {
      this.poseTarget.height = 0.3;
    } else if (time < sh.breathUntil + 2 || (series && time < sh.diveUntil)) {
      // Sinks back under the surface after the breath, and stays under for the whole dive.
      this.poseTarget.dive = 1;
    }
  }

  /** One breath: a blow at the blowhole, sized by the animal (the renderer makes the plume from it). */
  private blow(sh: Creature) {
    sh.breathUntil = this.time + 1.4;
    const i = BLOWHOLE_NODE * 2;
    this.events.push({ kind: "blow", x: sh.nodes[i], y: sh.nodes[i + 1], size: sh.length });
  }

  /**
   * Starts a food-less action on `sh`: a show from its species' `shows` list, or a humpback's fluke sounding. The
   * dev theatre and the component's playShow use it too. Returns the action's seconds, or 0 when it cannot start:
   * the species does not do that action, it is not cruising, or it is too close to an edge (see showable).
   */
  startShow(sh: Creature, id: ActionId): number {
    const beh = behaviourOf(sh.species);
    const listed =
      beh.shows?.some((s) => s.id === id) === true ||
      (id === "soundDive" && beh.breathSeries?.fluke === true) ||
      (id === "breach" && beh.actions.some((a) => a.id === "breach"));
    if (!listed || !this.showable(sh)) return 0;
    sh.state = "action";
    sh.actionId = id;
    sh.foodGroup = -1;
    this.engage(sh);
    // Any leap that starts (a scheduled show or a forced one) echoes through a pod that is near it.
    if (id === "leap" && beh.pod) this.echoLeap(sh);
    return ACTIONS[id].seconds;
  }

  /**
   * Whether `sh` can put on a show now: its species has shows (or a shark's breach), it is cruising, and it is clear of the edges. The
   * snout keeps `edge` from each side (1.2 body lengths, or a quarter of the short side for a body longer than that),
   * and the point 1.5 body lengths straight ahead (at most 0.35 of the short side) keeps 0.6 body lengths (at most
   * 0.12 of the short side) inside the canvas.
   */
  showable(sh: Creature): boolean {
    const beh = behaviourOf(sh.species);
    const canShow = beh.shows !== undefined || beh.actions.some((a) => a.id === "breach");
    if (!canShow || sh.state !== "cruise") return false;
    const { width: W, height: H } = this;
    const L = sh.length;
    const edge = Math.min(1.2 * L, 0.25 * Math.min(W, H));
    const hx = sh.nodes[0];
    const hy = sh.nodes[1];
    if (hx < edge || hx > W - edge || hy < edge || hy > H - edge) return false;
    // A whale can be longer than the canvas is tall, so the look-ahead and its margin are capped the same way.
    const minSide = Math.min(W, H);
    const ahead = Math.min(1.5 * L, 0.35 * minSide);
    const ax = hx + Math.cos(sh.heading) * ahead;
    const ay = hy + Math.sin(sh.heading) * ahead;
    const m = Math.min(0.6 * L, 0.12 * minSide);
    return ax >= m && ax <= W - m && ay >= m && ay <= H - m;
  }

  /** The jump a creature can put on, or null: its first jump show (leap, breachRoll), or a shark's breach. */
  private jumpFor(sh: Creature): ActionId | null {
    const beh = behaviourOf(sh.species);
    const show = beh.shows?.find((s) => JUMP_SHOWS.has(s.id));
    if (show) return show.id;
    return beh.actions.some((a) => a.id === "breach") ? "breach" : null;
  }

  /** Whether the roster has any animal that can jump at all, ignoring the current state. */
  hasJumpers(): boolean {
    return this.creatures.some((sh) => this.jumpFor(sh) !== null);
  }

  /**
   * A user's "play jump": picks one of the jumpers that can jump now (see showable) and starts its jump. Uses
   * Math.random, not the world rng, so it does not shift seeded sequences. Returns the jump's seconds, or 0 when
   * no one is clear to jump.
   */
  playRandomJump(): number {
    const options: { sh: Creature; id: ActionId }[] = [];
    for (const sh of this.creatures) {
      const id = this.jumpFor(sh);
      if (id !== null && this.showable(sh)) options.push({ sh, id });
    }
    if (options.length === 0) return 0;
    const pick = options[Math.floor(Math.random() * options.length)];
    return this.startShow(pick.sh, pick.id);
  }

  /**
   * Puts on the creature's own shows (Behaviour.shows) on timers drawn from its id and the clock; no rng. A show
   * waits while the creature is breathing or diving, and is retried a second later when it cannot start. A chained
   * creature (porpoising) takes a leap next. A leap starts a pod echo: its pod mates leap a beat apart.
   */
  private stepShows(sh: Creature, shows: NonNullable<Behaviour["shows"]>) {
    const { time } = this;
    if (time < sh.nextShow) return;
    let pick = Math.floor(((sh.id * 5.3 + time * 0.21) % 1) * shows.length);
    if (sh.chain) {
      const leap = shows.findIndex((s) => s.id === "leap");
      if (leap >= 0) pick = leap;
    }
    const show = shows[pick];
    if (time < sh.breathUntil || time < sh.diveUntil || this.startShow(sh, show.id) === 0) {
      sh.nextShow = time + 1;
      return;
    }
    sh.chain = false;
    const [min, max] = show.every;
    sh.nextShow = time + min + ((sh.id * 3.17 + time * 0.53) % 1) * (max - min);
  }

  /**
   * Pod echo: after a pod member leaps, up to three pod mates within 3 body lengths that are cruising and free
   * (not breathing or diving) get their next show a beat apart. Their edges are checked again when the timer fires.
   */
  private echoLeap(sh: Creature) {
    const { time } = this;
    let k = 0;
    for (const mate of this.creatures) {
      if (k >= 3) break;
      if (mate === sh || mate.species !== sh.species || mate.state !== "cruise") continue;
      if (time < mate.breathUntil || time < mate.diveUntil) continue;
      if (Math.hypot(mate.nodes[0] - sh.nodes[0], mate.nodes[1] - sh.nodes[1]) > 3 * sh.length)
        continue;
      k++;
      mate.nextShow = time + 0.25 + 0.3 * k;
    }
  }

  private nearestMorsel(group: number, x: number, y: number): Morsel | null {
    let best: Morsel | null = null;
    let bestD = Infinity;
    for (const m of this.morsels) {
      if (!m.alive || m.group !== group) continue;
      const d = Math.hypot(m.x - x, m.y - y);
      if (d < bestD) {
        bestD = d;
        best = m;
      }
    }
    return best;
  }

  /** Moves an approaching creature into its action: it has engaged, and the action's clock starts. */
  private engage(sh: Creature) {
    sh.state = "action";
    sh.actionStart = this.time;
    sh.actionMark = -1;
    sh.stateUntil = this.time + ACTIONS[sh.actionId ?? "approachAndBite"].seconds;
  }

  /** ActionContext.eatNear: eats every live morsel of the creature's group, and every stunned bait fish, within `radius` of the snout. */
  private eatNear(radius: number): number {
    const sh = this.actx.sh;
    const hx = sh.nodes[0];
    const hy = sh.nodes[1];
    let n = 0;
    for (const m of this.morsels) {
      if (!m.alive || m.group !== sh.foodGroup) continue;
      if (Math.hypot(m.x - hx, m.y - hy) > radius) continue;
      m.alive = false;
      sh.hunger = Math.max(0, sh.hunger - 0.1);
      this.events.push({ kind: "eat", x: m.x, y: m.y, size: sh.length });
      n++;
    }
    // Stunned bait fish drift helplessly, so the snout takes them too.
    for (const f of this.fish) {
      if (!f.alive || f.stun <= 0 || Math.hypot(f.x - hx, f.y - hy) > radius) continue;
      f.alive = false;
      f.respawnAt = this.time + rand(this.rng, 3, 8);
      sh.hunger = Math.max(0, sh.hunger - 0.16);
      this.events.push({ kind: "eat", x: f.x, y: f.y, size: sh.length });
      n++;
    }
    // The first bite engages an approaching creature.
    if (n > 0 && sh.state === "approach") this.engage(sh);
    return n;
  }

  /** ActionContext.eatFishNear: eats every live bait fish within `radius` of the snout, stunned or not. */
  private eatFishNear(radius: number): number {
    const sh = this.actx.sh;
    const hx = sh.nodes[0];
    const hy = sh.nodes[1];
    let n = 0;
    for (const f of this.fish) {
      if (!f.alive || Math.hypot(f.x - hx, f.y - hy) > radius) continue;
      f.alive = false;
      f.respawnAt = this.time + rand(this.rng, 3, 8);
      sh.hunger = Math.max(0, sh.hunger - 0.16);
      this.events.push({ kind: "eat", x: f.x, y: f.y, size: sh.length });
      n++;
    }
    return n;
  }

  /** ActionContext.packNear: creatures of the same species (this one included) with snouts within `radius`. */
  private packNear(radius: number): number {
    const sh = this.actx.sh;
    let n = 0;
    for (const other of this.creatures) {
      if (other.species !== sh.species) continue;
      if (Math.hypot(other.nodes[0] - sh.nodes[0], other.nodes[1] - sh.nodes[1]) <= radius) n++;
    }
    return n;
  }

  /** ActionContext.pullMorsels: live morsels of the group within `radius` slide toward the snout. */
  private pullMorsels(radius: number, speed: number) {
    const sh = this.actx.sh;
    const hx = sh.nodes[0];
    const hy = sh.nodes[1];
    for (const m of this.morsels) {
      if (!m.alive || m.group !== sh.foodGroup) continue;
      const dx = hx - m.x;
      const dy = hy - m.y;
      const d = Math.hypot(dx, dy);
      if (d > radius || d < 1e-3) continue;
      const step = Math.min(speed * this.actx.dt, d);
      m.x += (dx / d) * step;
      m.y += (dy / d) * step;
    }
  }

  /** ActionContext.stunFish: live bait fish within `radius` of (x, y) stun for `seconds`. */
  private stunFish(x: number, y: number, radius: number, seconds: number): number {
    let n = 0;
    for (const f of this.fish) {
      if (!f.alive || Math.hypot(f.x - x, f.y - y) > radius) continue;
      f.stun = Math.max(f.stun, seconds);
      n++;
    }
    return n;
  }

  /** ActionContext.schoolNear: centroid of live bait fish within `radius` of (x, y), into `out` if any. */
  private schoolNear(
    x: number,
    y: number,
    radius: number,
    out: { x: number; y: number },
    stunnedOnly = false,
  ): number {
    let n = 0;
    let sx = 0;
    let sy = 0;
    for (const f of this.fish) {
      if (!f.alive || (stunnedOnly && f.stun <= 0) || Math.hypot(f.x - x, f.y - y) > radius)
        continue;
      sx += f.x;
      sy += f.y;
      n++;
    }
    if (n > 0) {
      out.x = sx / n;
      out.y = sy / n;
    }
    return n;
  }

  private recover(sh: Creature) {
    sh.state = "recover";
    sh.stateUntil = this.time + 1.5;
    sh.foodGroup = -1;
    sh.actionId = null;
  }

  private calm(sh: Creature) {
    sh.state = "cruise";
    sh.foodGroup = -1;
    sh.actionId = null;
  }

  /**
   * Pick prey in the shark's forward cone, preferring close fish in sparse
   * buckets (stragglers) over fish buried in a dense school.
   */
  private findPrey(sh: Creature): Fish | null {
    const range = sh.length * 0.9 + 160;
    const hx = sh.nodes[0];
    const hy = sh.nodes[1];
    const fx = Math.cos(sh.heading);
    const fy = Math.sin(sh.heading);
    let best: Fish | null = null;
    let bestScore = Infinity;
    let currentScore = Infinity;

    for (const f of this.fish) {
      if (!f.alive) continue;
      const dx = f.x - hx;
      const dy = f.y - hy;
      const d = Math.hypot(dx, dy);
      if (d > range || d < 1e-3) continue;
      const cos = (dx * fx + dy * fy) / d;
      if (cos < 0.2) continue;
      const crowd = this.bucketCount[this.bucketOf(f.x, f.y)];
      // Stunned fish drift helplessly, so predators pick them over the rest.
      const score = d * (1 + (1 - cos) * 0.8) * (1 + crowd * 0.07) * (f.stun > 0 ? 0.3 : 1);
      if (score < bestScore) {
        bestScore = score;
        best = f;
      }
      if (f === sh.target) currentScore = score;
    }
    // Stick with the current target unless something is clearly better.
    if (sh.target && currentScore < bestScore * 1.3) return sh.target;
    return best;
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
      f.stun = 0;
      f.turn = 0;
      f.millDir = millDir;
      f.x = x + rand(this.rng, -1, 1) * this.perception;
      f.y = y + rand(this.rng, -1, 1) * this.perception;
      f.vx = Math.cos(inward) * sp.cruise * 1.4;
      f.vy = Math.sin(inward) * sp.cruise * 1.4;
    }
  }
}
