import { clamp, smoothstep } from "../math";
import type { Creature, Morsel, WorldEvent } from "../world";
import type { ActionId } from "./behaviour";

/** Steering a creature gets from its action this step; w = 0 means none. */
export interface Aim {
  /** Unit direction toward the target. */
  dx: number;
  dy: number;
  /** Weight of the steering against the creature's own momentum. */
  w: number;
  /** Speed as a multiple of cruise. */
  speed: number;
  /** 0 far → 1 close to the target, for the turn and the wake. */
  closing: number;
  hunting: boolean;
}

/** Pose targets an action writes; the world eases each creature's pose toward them. */
export interface PoseTargets {
  height: number;
  pitch: number;
  roll: number;
  gape: number;
  slap: number;
  /** Sinking under the surface, 0–1: the body reads as deeper (dimmer, bluer). */
  dive: number;
  /** Head-first surface crossing, 0 under → 1 out → 2 under again (see Creature.emerge). */
  emerge: number;
}

export interface ActionContext {
  readonly time: number;
  readonly dt: number;
  readonly L: number;
  readonly sh: Creature;
  /** Seconds since the action engaged (see `engageRange`); 0 before. */
  readonly t: number;
  /** Nearest live morsel of the creature's food group, and the snout's distance to it. */
  readonly target: Morsel | null;
  readonly dist: number;
  /** World size in px, for `requires` checks such as keeping a leap on screen. */
  readonly width: number;
  readonly height: number;
  /** Write this step's steering: direction (unit), weight, speed multiple of cruise, hunting flag. */
  readonly aim: Aim;
  /** Write pose targets; the world eases the creature's pose toward them. Reset to 0 every step before step() runs. */
  readonly pose: PoseTargets;
  /** Eat every live morsel of the group, and every stunned bait fish, within `radius` of the snout; returns how many. */
  eatNear(radius: number): number;
  /** Pull live morsels of the group within `radius` toward the snout at `speed` px/s (suction). */
  pullMorsels(radius: number, speed: number): void;
  /** Stun bait fish within `radius` of (x, y) for `seconds`; returns how many. */
  stunFish(x: number, y: number, radius: number, seconds: number): number;
  /** Herd live bait fish within `radius` of (x, y) this step: pull them in at `inward` px/s² and swirl them at `swirl` px/s². */
  herd(x: number, y: number, radius: number, inward: number, swirl: number): void;
  /** Eat every live bait fish within `radius` of the snout, stunned or not; returns how many. */
  eatFishNear(radius: number): number;
  /** Creatures of this species (this one included) with snouts within `radius` of the snout. */
  packNear(radius: number): number;
  /** Centroid of live bait fish within `radius` of (x, y), written into `out`; returns the count (0 = none). */
  schoolNear(
    x: number,
    y: number,
    radius: number,
    out: { x: number; y: number },
    stunnedOnly?: boolean,
  ): number;
  emit(kind: WorldEvent["kind"], x: number, y: number, size?: number): void;
}

export interface ActionDef {
  /** Snout distance to the target at which the action engages; 0 = on the first bite (as today). */
  engageRange: (L: number) => number;
  /** Seconds the action lasts once engaged. */
  seconds: number;
  /** Optional precondition checked when the action is picked; false falls back to approachAndBite. */
  requires?: (ctx: ActionContext) => boolean;
  /** Distance the engagement check uses, when it is not the snout's distance to the nearest morsel. */
  engageDistance?: (ctx: ActionContext) => number;
  /** Approach speed before engagement, as a multiple of cruise. Default 2.2, or 1.7 for koi. */
  approachSpeed?: number;
  /** Runs every step from engagement until `seconds` pass or it returns true (done). Before engagement the world runs the default approach. */
  step(ctx: ActionContext): boolean | void;
}

/** Steers at the target: a unit direction, with weight and turn closing as the snout nears it. */
function steerAt(ctx: ActionContext, speed: number) {
  const { aim, L, dist } = ctx;
  const m = ctx.target;
  if (!m) return;
  const hx = ctx.sh.nodes[0];
  const hy = ctx.sh.nodes[1];
  const closing = clamp(1 - dist / (L * 0.9), 0, 1);
  aim.dx = (m.x - hx) / dist;
  aim.dy = (m.y - hy) / dist;
  aim.w = 3 + 2 * closing;
  aim.hunting = true;
  aim.closing = closing;
  aim.speed = speed;
}

/** Bite radius shared by every action: close enough to take a morsel. */
const biteRange = (L: number) => L * 0.06 + 10;

/**
 * Whether the action engages this step: the engagement distance is within engageRange, or, for
 * engageRange 0, within a bite (the first bite engages).
 */
export function engaged(def: ActionDef, ctx: ActionContext): boolean {
  const range = def.engageRange(ctx.L);
  const reach = range > 0 ? range : biteRange(ctx.L);
  const dist = def.engageDistance ? def.engageDistance(ctx) : ctx.dist;
  return dist <= reach;
}

/** The default approach, before engagement: steer at the nearest morsel at the action's approach speed. */
export function approachSteer(def: ActionDef, ctx: ActionContext) {
  steerAt(ctx, def.approachSpeed ?? (ctx.sh.species === "koi" ? 1.7 : 2.2));
}

/** Strike radius for the lunges, bursts and sweeps: a little wider than the bite. */
const strikeRange = (L: number) => L * 0.07 + 10;

/** Scratch for schoolNear, so the whip allocates nothing. */
const school = { x: 0, y: 0 };

/** Tail sweep from 0 through the top of the arc (slap 1), then on to -0.3: sin(WHIP_SWING) = -0.3, monotonic after the peak. */
const WHIP_SWING = Math.PI + Math.asin(0.3);

/**
 * Slap pose of a whip that swings over `dur` seconds at `amp` (the swing's own overdrive). After `dur` it is held
 * at the swing's end, then eased back to rest over 0.4 s, so the fluke never drops from a slap to rest in one step.
 */
function whipSlap(u: number, dur: number, amp: number) {
  const swing = amp * Math.sin(Math.min(1, u / dur) * WHIP_SWING);
  return clamp(swing * (1 - smoothstep(dur, dur + 0.4, u)), -1.2, 1.2);
}

/** Points the snout at (px, py): unit direction, weight, speed multiple of cruise, and closing from the target. */
function aimAt(ctx: ActionContext, px: number, py: number, w: number, speed: number) {
  const { aim, L, dist, sh } = ctx;
  const dx = px - sh.nodes[0];
  const dy = py - sh.nodes[1];
  const d = Math.hypot(dx, dy) || 1;
  aim.dx = dx / d;
  aim.dy = dy / d;
  aim.w = w;
  aim.speed = speed;
  aim.hunting = true;
  aim.closing = clamp(1 - dist / (L * 0.9), 0, 1);
}

/** Head sweep: the bearing to the target swings ±0.55 rad at 1.3 Hz, like a hammerhead scanning with its head. */
function aimSweep(ctx: ActionContext, speed: number) {
  const m = ctx.target;
  if (!m) return;
  const hx = ctx.sh.nodes[0];
  const hy = ctx.sh.nodes[1];
  const a = Math.atan2(m.y - hy, m.x - hx) + 0.55 * Math.sin(ctx.t * Math.PI * 2 * 1.3);
  aimAt(ctx, hx + Math.cos(a), hy + Math.sin(a), 3, speed);
}

/** True on the one step where the action's clock first reaches `at`: lets an action do something once, with no state. */
function crossed(ctx: ActionContext, at: number) {
  return ctx.t >= at && ctx.t - ctx.dt < at;
}

/** Steers at the target, or straight ahead of the snout once the food is gone, so the aim is never NaN. */
function steerGoal(ctx: ActionContext, w: number, speed: number) {
  const m = ctx.target;
  const hx = ctx.sh.nodes[0];
  const hy = ctx.sh.nodes[1];
  if (m) aimAt(ctx, m.x, m.y, w, speed);
  else
    aimAt(
      ctx,
      hx + Math.cos(ctx.sh.heading) * ctx.L,
      hy + Math.sin(ctx.sh.heading) * ctx.L,
      w,
      speed,
    );
}

/** Where a school-centred action works: written into `herdAt`. */
const herdAt = { x: 0, y: 0 };

/**
 * Writes the centre a school-centred action works on into `herdAt`, and returns the bait count it came from.
 * Live bait near the food comes first, then stunned bait near the snout, then the snout itself (count 0).
 */
function locateSchool(ctx: ActionContext, radius: number): number {
  const m = ctx.target;
  if (m) {
    const n = ctx.schoolNear(m.x, m.y, radius, herdAt);
    if (n > 0) return n;
  }
  const hx = ctx.sh.nodes[0];
  const hy = ctx.sh.nodes[1];
  const n = ctx.schoolNear(hx, hy, radius, herdAt, true);
  if (n > 0) return n;
  herdAt.x = hx;
  herdAt.y = hy;
  return 0;
}

/** Distance from the snout to the school centre an action engages on; with no school near the food, to the food. */
function schoolDistance(ctx: ActionContext, radius: number): number {
  const m = ctx.target;
  if (!m || ctx.schoolNear(m.x, m.y, radius, herdAt) === 0) return ctx.dist;
  return Math.hypot(herdAt.x - ctx.sh.nodes[0], herdAt.y - ctx.sh.nodes[1]);
}

/** A pose's value at each of its (time, value) knots. Between two knots it blends with smoothstep, so it is flat at every knot. */
type Knot = readonly [number, number];
function track(t: number, knots: readonly Knot[]): number {
  let i = 1;
  while (i < knots.length - 1 && t >= knots[i][0]) i++;
  const [t0, v0] = knots[i - 1];
  const [t1, v1] = knots[i];
  return v0 + (v1 - v0) * smoothstep(t0, t1, t);
}

/**
 * A jump's timeline, in seconds from its start. The phases are: dip (0 to `rush`), rush up (`rush` to `up`),
 * airborne (`up` to `down`), sink (`down` to `sink`), surface (`sink` to `breath`), then the blow at `breath`.
 */
interface JumpPlan {
  rush: number;
  up: number;
  down: number;
  sink: number;
  breath: number;
  seconds: number;
  /** Speed multiple for the rush up, as a multiple of cruise. */
  rushSpeed: number;
  /** Whether the jump rolls onto its side in the air and crashes back (breachRoll). */
  roll: boolean;
  /** Pitch knots across the whole jump, eased with `track`. */
  pitch: readonly Knot[];
}

/** Bottlenose leap: a short jump, out and back in. */
const LEAP_JUMP: JumpPlan = {
  rush: 0.7,
  up: 1.3,
  down: 3,
  sink: 3.7,
  breath: 4.7,
  seconds: 4.9,
  rushSpeed: 3,
  roll: false,
  pitch: [
    [0, 0],
    [0.7, -0.4],
    [1.3, 0],
    [2.15, 0.6],
    [3, -0.6],
    [3.7, -0.3],
    [4.7, 0],
    [4.9, 0],
  ],
};

/** Orca and humpback breach: a long rolling jump, landing on its side with a crash. */
const BREACH_ROLL_JUMP: JumpPlan = {
  rush: 1.0,
  up: 1.9,
  down: 4.2,
  sink: 5.3,
  breath: 6.5,
  seconds: 6.7,
  rushSpeed: 2.6,
  roll: true,
  pitch: [
    [0, 0],
    [1.0, -0.4],
    [1.9, 0],
    [3.05, 0.6],
    [4.2, -0.6],
    [5.3, -0.3],
    [6.5, 0],
    [6.7, 0],
  ],
};

/**
 * How far the body is out of the water, 0 under → 1 out → 2 under again. Each end is a smoothstep, so the
 * head-first crossing runs over the whole rise (up − 0.35 to up + 0.5) and fall (down − 0.35 to down + 0.5).
 */
function emergeOf(p: JumpPlan, t: number) {
  return smoothstep(p.up - 0.35, p.up + 0.5, t) + smoothstep(p.down - 0.35, p.down + 0.5, t);
}

/** True on the step where the emerge value first reaches `v`, from last step's `prev` to this step's `now`. */
function reachedEmerge(prev: number, now: number, v: number) {
  return prev < v && now >= v;
}

/**
 * Runs one jump (plan `p`): dip, rush up, break out, airborne arc, re-enter, sink, surface and blow. Every pose
 * is a continuous function of the clock. Food eaten in the air is taken, so the food-driven leap still eats.
 */
function jump(ctx: ActionContext, p: JumpPlan): boolean {
  const { L, sh, t } = ctx;
  // Airborne: the height is a half sine over the arc, zero at both ends.
  const air = clamp((t - p.up) / (p.down - p.up), 0, 1);
  ctx.pose.height = Math.sin(Math.PI * air);
  // Dips under at the start and sinks after landing; it rises to the surface in between.
  ctx.pose.dive =
    smoothstep(0, 0.3, t) * (1 - smoothstep(p.rush, p.up, t)) +
    smoothstep(p.down, p.down + 0.4, t) * (1 - smoothstep(p.sink, p.breath, t));
  ctx.pose.pitch = track(t, p.pitch);
  const emerge = emergeOf(p, t);
  const prevEmerge = emergeOf(p, t - ctx.dt);
  ctx.pose.emerge = emerge;
  if (p.roll) {
    // Twists onto its side in the air, then rolls back as it sinks.
    ctx.pose.roll = 0.9 * smoothstep(0.2, 0.8, air) * (1 - smoothstep(p.down, p.sink, t));
  }
  // Dip, rush, airborne, then sink and surface: the speed steers the snout to the food, or ahead of it.
  const speed = t < p.rush ? 1 : t < p.up ? p.rushSpeed : t < p.down ? 2 : 1.6;
  steerGoal(ctx, 3, speed);
  if (t >= p.up && t < p.down) {
    // Takes what lies under the arc at any point in the air.
    ctx.eatNear(0.4 * L);
  }
  // Splashes and ripples follow the surface line: the snout breaks out and goes back in, the tail clears and goes under.
  const tail = sh.nodes.length - 2;
  if (reachedEmerge(prevEmerge, emerge, 0.05)) ctx.emit("splash", sh.nodes[0], sh.nodes[1]);
  if (reachedEmerge(prevEmerge, emerge, 0.95))
    ctx.emit("ripple", sh.nodes[tail], sh.nodes[tail + 1], 0.5 * L);
  if (reachedEmerge(prevEmerge, emerge, 1.05)) ctx.emit("splash", sh.nodes[0], sh.nodes[1]);
  if (reachedEmerge(prevEmerge, emerge, 1.95))
    ctx.emit("splash", sh.nodes[tail], sh.nodes[tail + 1]);
  if (p.roll && reachedEmerge(prevEmerge, emerge, 1.5)) {
    // The crash: a big splash where the mid-spine comes down.
    // The mid-spine node: half the coordinates in (the spine has an even count of x and y).
    const mid = sh.nodes.length >> 1;
    ctx.emit("splash", sh.nodes[mid], sh.nodes[mid + 1], 1.6 * L);
  }
  // Takes a breath after the jump, at the blowhole (spine node 2, as blowAndFluke).
  if (crossed(ctx, p.breath)) ctx.emit("blow", sh.nodes[4], sh.nodes[5], L);
  return t >= p.seconds;
}

export const ACTIONS: Record<ActionId, ActionDef> = {
  approachAndBite: {
    engageRange: () => 0,
    seconds: 3,
    step(ctx) {
      if (!ctx.target) return true;
      const bite = biteRange(ctx.L);
      if (ctx.dist <= bite) {
        ctx.eatNear(bite);
        return;
      }
      // Rushes at the food, then slows to the bite speed inside 1.2 body lengths.
      const rush = ctx.sh.species === "koi" ? 1.7 : 2.2;
      steerAt(ctx, ctx.dist > 1.2 * ctx.L ? rush : 1.2);
    },
  },
  surfaceSlurp: {
    // Engages three lengths out, so the koi slows and opens its mouth over the pellets before the first bite.
    engageRange: (L) => 3 * L,
    seconds: 9,
    step(ctx) {
      if (!ctx.target) return true;
      const { L, dist, sh } = ctx;
      // Mouth open as it nears the pellets, closing on each bite.
      // The mouth opens across the last 0.4·L of the approach, rather than in one step at 1.2·L.
      ctx.pose.gape = smoothstep(1.6 * L, 1.2 * L, dist);
      // A koi circles the pellets at about 0.22·L in radius, too wide to bite on the way past, so the slurp reaches
      // wider than a bite.
      const bite = L * 0.2 + 10;
      if (dist <= bite) {
        // Each bite breaks the surface.
        if (ctx.eatNear(bite) > 0) ctx.emit("ripple", sh.nodes[0], sh.nodes[1], L);
        return;
      }
      // Koi glide in, easing off over the last body length and slowing right down over the pellets.
      const far = sh.species === "koi" ? 1.7 : 1.6;
      const speed = 0.6 + (far - 0.6) * clamp((dist - 0.3 * L) / (0.9 * L), 0, 1);
      steerAt(ctx, speed);
    },
  },
  // Great white: circles its prey at arm's length, sizing it up, then turns in and strikes.
  circleThenLunge: {
    engageRange: (L) => 1.6 * L,
    seconds: 6,
    step(ctx) {
      const m = ctx.target;
      if (!m) return true;
      const { L, dist, sh, t } = ctx;
      if (t < 2.6) {
        // Orbit at 0.7·L: tangent to the bearing from the prey, pulled back toward that radius.
        const rx = (sh.nodes[0] - m.x) / (dist || 1);
        const ry = (sh.nodes[1] - m.y) / (dist || 1);
        const pull = clamp((0.7 * L - dist) / L, -1, 1);
        const tx = (-ry * sh.orbitDir + rx * pull) * L;
        const ty = (rx * sh.orbitDir + ry * pull) * L;
        aimAt(ctx, sh.nodes[0] + tx, sh.nodes[1] + ty, 3, 1.5);
        return;
      }
      // Strike: straight at the prey, mouth opening as it closes in. The bite runs until the food is gone.
      aimAt(ctx, m.x, m.y, 5, 2.6);
      // The mouth comes open over the first 0.4 s of the strike, rather than stepping from closed to open.
      ctx.pose.gape = clamp(1 - dist / (0.8 * L), 0, 1) * smoothstep(2.6, 3.0, t);
      ctx.eatNear(strikeRange(L));
    },
  },
  // Great white and mako: rockets up from below, clears the surface, and falls back with a splash.
  breach: {
    engageRange: (L) => 0.8 * L,
    seconds: 3,
    requires(ctx) {
      // The whole leap has to fit on screen, so the target stays at least half a length from each edge.
      const m = ctx.target;
      const edge = 0.5 * ctx.L;
      return (
        m !== null && m.x > edge && m.x < ctx.width - edge && m.y > edge && m.y < ctx.height - edge
      );
    },
    step(ctx) {
      // Once the food is eaten the target is null; the breach still lands.
      const m = ctx.target;
      const { L, sh, t } = ctx;
      // The poses blend across the phases, so none of them steps at 0.8 s or 1.9 s. The nose tips up as it runs in,
      // the body lifts clear of the water with the mouth open, and both ease back down as it falls.
      const lift = smoothstep(0.5, 1.1, t) * (1 - smoothstep(1.9, 2.4, t));
      ctx.pose.height = lift;
      ctx.pose.gape = 0.8 * lift;
      ctx.pose.pitch = (0.5 + 0.3 * smoothstep(0.7, 1.0, t)) * (1 - smoothstep(1.9, 2.6, t));
      if (t < 0.8) {
        // Run up from below.
        if (m) aimAt(ctx, m.x, m.y, 3, 2.2);
        return;
      }
      if (t < 1.9) {
        // Airborne: it takes what lies under the arc.
        if (m) aimAt(ctx, m.x, m.y, 3, 2.2);
        // Takes what lies under the arc at any point in the air.
        ctx.eatNear(L * 0.5);
        return;
      }
      // Falls back: one splash where the snout lands.
      if (crossed(ctx, 1.9)) ctx.emit("splash", sh.nodes[0], sh.nodes[1]);
      return t >= 2.6;
    },
  },
  // Scalloped hammerhead: sweeps its wide head across the food like a metal detector, then bites.
  scanSweep: {
    engageRange: (L) => 1.2 * L,
    seconds: 7,
    step(ctx) {
      const m = ctx.target;
      if (!m) return true;
      if (ctx.t < 1.8) {
        aimSweep(ctx, 1);
        return;
      }
      aimAt(ctx, m.x, m.y, 3, 1.6);
      if (ctx.dist <= strikeRange(ctx.L)) ctx.eatNear(strikeRange(ctx.L));
    },
  },
  // Great hammerhead: sweeps, then drives its head down onto the food and pins it before taking it.
  scanAndPin: {
    engageRange: (L) => 1.2 * L,
    seconds: 7,
    step(ctx) {
      const m = ctx.target;
      if (!m) return true;
      const { L, dist, t } = ctx;
      if (t < 1.2) {
        aimSweep(ctx, 1);
        return;
      }
      if (t < 4.6) {
        // Close in; once the head is on the food it slows, pitches down and draws in the loose pieces.
        const pin = dist <= 0.15 * L;
        aimAt(ctx, m.x, m.y, 3, pin ? 0.15 : 2.2);
        // The head pitches down over the last 0.15·L of the approach, not in one step at the pin.
        ctx.pose.pitch = -0.35 * smoothstep(0.3 * L, 0.15 * L, dist);
        if (pin) ctx.pullMorsels(0.3 * L, 40);
        return;
      }
      ctx.eatNear(0.35 * L);
      return true;
    },
  },
  // Tiger shark: unhurried and indiscriminate, it takes every scrap in the water, one after another.
  gulpAll: {
    engageRange: () => 0,
    seconds: 6,
    step(ctx) {
      const m = ctx.target;
      if (!m) return true;
      const { L, dist } = ctx;
      ctx.pose.gape = 0.6 * smoothstep(0.7 * L, 0.5 * L, dist);
      aimAt(ctx, m.x, m.y, 3, 1.1);
      ctx.eatNear(biteRange(L));
    },
  },
  // Mako: the fastest shark in the sea. Bursts at full tilt and turns sharply to snatch its prey.
  burst: {
    engageRange: (L) => 2 * L,
    seconds: 6,
    step(ctx) {
      const m = ctx.target;
      if (!m) return true;
      // Full burst until the food is 0.6·L off, then eases down to 1.6× so its turn can bring the snout onto the food.
      const near = clamp((ctx.dist - 0.3 * ctx.L) / (0.3 * ctx.L), 0, 1);
      aimAt(ctx, m.x, m.y, 6, 1.6 + 1.6 * near);
      ctx.aim.closing = 1;
      ctx.eatNear(strikeRange(ctx.L));
    },
  },
  // Thresher: swims past a bait ball and whips its long upper tail lobe through it, stunning fish in the arc
  // (Oliver et al. 2013). Then it doubles back and eats what is left.
  tailWhip: {
    engageRange: (L) => 1.4 * L,
    seconds: 12,
    requires(ctx) {
      const m = ctx.target;
      return m !== null && ctx.schoolNear(m.x, m.y, 1.5 * ctx.L, school) >= 4;
    },
    // Engages on the distance to the school's centre; with no school in reach, to the food.
    engageDistance(ctx) {
      const m = ctx.target;
      if (!m || ctx.schoolNear(m.x, m.y, 1.5 * ctx.L, school) === 0) return ctx.dist;
      return Math.hypot(school.x - ctx.sh.nodes[0], school.y - ctx.sh.nodes[1]);
    },
    step(ctx) {
      const m = ctx.target;
      const { L, sh, time } = ctx;
      const hx = sh.nodes[0];
      const hy = sh.nodes[1];
      // Before the whip there is nothing to aim at; after it, the food can be gone and the snout is the aim.
      if (!m && sh.actionMark < 0) return true;
      const mx = m ? m.x : hx;
      const my = m ? m.y : hy;
      const n = m ? ctx.schoolNear(m.x, m.y, 0.6 * L, school) : 0;
      const cx = n > 0 ? school.x : mx;
      const cy = n > 0 ? school.y : my;
      // The tail tip is the last spine node.
      const tail = sh.nodes.length - 2;
      // Aim point 0.3·L to the side of the school's centre and just beyond it, so the snout swims past.
      const cd = Math.hypot(cx - hx, cy - hy) || 1;
      const ux = (cx - hx) / cd;
      const uy = (cy - hy) / cd;
      const side = 0.3 * L * sh.orbitDir;
      const px = cx + ux * 0.3 * L - uy * side;
      const py = cy + uy * 0.3 * L + ux * side;
      if (sh.actionMark < 0) {
        // Still swimming in: whip once the snout has passed the school's centre.
        aimAt(ctx, px, py, 3, 1.4);
        const past = Math.cos(sh.heading) * (cx - hx) + Math.sin(sh.heading) * (cy - hy) < 0;
        if (!past) return;
        sh.actionMark = time;
      }
      const u = time - sh.actionMark;
      // Overdriven ×1.2 (target capped at ±1.2): the eased pose lags the 0.5 s swing, so the tail reaches ~0.88 of its peak.
      ctx.pose.slap = whipSlap(u, 0.5, 1.2);
      if (u < 0.5) {
        // The pectorals snap in and the shark stalls its approach as the tail comes over (Oliver et al. 2013).
        aimAt(ctx, px, py, 3, 0.5);
        // At the top of the swing the tail tip stuns the fish in its arc.
        const peak = (0.5 * (Math.PI / 2)) / WHIP_SWING;
        if (u >= peak && u - ctx.dt < peak) {
          const tx = sh.nodes[tail];
          const ty = sh.nodes[tail + 1];
          // Oliver et al. 2013: the slap stuns or kills; dazed sardines stay put long enough for the turn back.
          ctx.stunFish(tx, ty, 0.45 * L, 8);
          ctx.emit("splash", tx, ty);
        }
        return;
      }
      // Circles back for the dazed fish it left behind if there are any, otherwise for the food.
      if (ctx.schoolNear(hx, hy, 2.5 * L, school, true) > 0) {
        aimAt(ctx, school.x, school.y, 4, 1.8);
      } else {
        aimAt(ctx, mx, my, 3, 1.2);
      }
      ctx.eatNear(biteRange(L));
    },
  },
  // Nurse shark: nearly motionless, it opens its mouth and hoovers the food in with suction.
  suction: {
    engageRange: (L) => 1.0 * L,
    seconds: 8,
    approachSpeed: 1,
    step(ctx) {
      const m = ctx.target;
      if (!m) return true;
      const { L, sh, t } = ctx;
      // Brakes hard while still moving faster than 0.35 cruise (cruise as world.ts sets it), then holds at 0.2.
      const cruise = 30 + L * 0.04;
      aimAt(ctx, m.x, m.y, 2, sh.speed > 0.35 * cruise ? 0.1 : 0.2);
      ctx.pullMorsels(0.9 * L, 60);
      // The gape pulses in from closed, so it does not open with a step at the start.
      ctx.pose.gape = (0.5 + 0.5 * Math.sin(t * 8)) * smoothstep(0, 0.5, t);
      ctx.eatNear(L * 0.08 + 8);
    },
  },
  // Zebra shark: a slow bottom feeder that noses along and takes one morsel at a time, pausing after each.
  slowPeck: {
    engageRange: () => 0,
    seconds: 6,
    step(ctx) {
      const m = ctx.target;
      if (!m) return true;
      const { L, dist, sh, time } = ctx;
      // actionMark is the time the next bite is allowed (-1 before the first bite).
      const resting = sh.actionMark >= 0 && time < sh.actionMark;
      aimAt(ctx, m.x, m.y, 3, resting ? 0.3 : 0.8);
      if (!resting && dist <= biteRange(L) && ctx.eatNear(biteRange(L)) > 0) {
        sh.actionMark = time + 0.6;
      }
    },
  },
  // Bottlenose dolphin: leaps clear of the water, around food or on its own (a show). See jump().
  leap: {
    engageRange: (L) => 0.8 * L,
    seconds: LEAP_JUMP.seconds,
    requires(ctx) {
      // The leap has to stay on screen, so the target keeps at least 0.8·L from each edge (the leap runs further than it did).
      const m = ctx.target;
      const edge = 0.8 * ctx.L;
      return (
        m !== null && m.x > edge && m.x < ctx.width - edge && m.y > edge && m.y < ctx.height - edge
      );
    },
    step(ctx) {
      const done = jump(ctx, LEAP_JUMP);
      // A leap with no food can porpoise: an even-parity one chains into another leap a second after it lands.
      if (done && ctx.sh.foodGroup < 0 && (ctx.sh.id + Math.floor(ctx.sh.actionStart)) % 2 === 0) {
        ctx.sh.chain = true;
        ctx.sh.nextShow = ctx.time + 1;
      }
      return done;
    },
  },
  // Orca and humpback: breaches with a roll, landing on its side or back with a huge splash. Only ever a show.
  breachRoll: {
    engageRange: () => 0,
    seconds: BREACH_ROLL_JUMP.seconds,
    step: (ctx) => jump(ctx, BREACH_ROLL_JUMP),
  },
  // Humpback sounding dive: raises its flukes clear of the water and slips under them. Only ever a show.
  soundDive: {
    engageRange: () => 0,
    seconds: 5,
    step(ctx) {
      const { sh, t } = ctx;
      // A small lift as the flukes come up, eased back to rest by the time they rise (no step at t = 1).
      ctx.pose.height = 0.2 * (1 - smoothstep(0.8, 1.2, t));
      // Pitches the head down while the flukes are up, then levels off as the fluke swings clear.
      ctx.pose.pitch = -0.8 * smoothstep(0.7, 1.3, t) * (1 - smoothstep(3.6, 4.4, t));
      ctx.pose.dive = smoothstep(1, 3.5, t);
      // The flukes rise and slip under: a slap that lifts and falls back to 0 at 1 s and at 4 s.
      ctx.pose.slap = 0.6 * Math.sin(Math.PI * clamp((t - 1) / 3, 0, 1));
      steerGoal(ctx, 3, 0.6);
      // The fluke print: a bubble at the tail as the flukes go under.
      if (crossed(ctx, 3.6)) {
        const tail = sh.nodes.length - 2;
        ctx.emit("bubble", sh.nodes[tail], sh.nodes[tail + 1]);
      }
      return t >= 4.5;
    },
  },
  // Bottlenose dolphin: swims into a bait ball and slaps its fluke through it, stunning the fish, then mops them up.
  fishWhack: {
    engageRange: (L) => 1.2 * L,
    seconds: 5,
    requires(ctx) {
      const m = ctx.target;
      return m !== null && ctx.schoolNear(m.x, m.y, 1.5 * ctx.L, school) >= 3;
    },
    step(ctx) {
      const m = ctx.target;
      const { L, sh, time } = ctx;
      const hx = sh.nodes[0];
      const hy = sh.nodes[1];
      // Before the whip there is nothing to aim at; after it, the food can be gone and the snout is the aim.
      if (!m && sh.actionMark < 0) return true;
      const mx = m ? m.x : hx;
      const my = m ? m.y : hy;
      const n = m ? ctx.schoolNear(m.x, m.y, 1.5 * L, school) : 0;
      const cx = n > 0 ? school.x : mx;
      const cy = n > 0 ? school.y : my;
      if (sh.actionMark < 0) {
        // Approach the school's centre, and whip once the snout is within 0.5·L of it.
        aimAt(ctx, cx, cy, 3, 1.6);
        if (Math.hypot(cx - hx, cy - hy) > 0.5 * L) return;
        sh.actionMark = time;
      }
      const u = time - sh.actionMark;
      ctx.pose.slap = whipSlap(u, 0.4, 1.5);
      if (u < 0.4) {
        // The body stalls as the fluke comes over, then slaps sideways through the school (same swing as the thresher).
        aimAt(ctx, cx, cy, 3, 0.5);
        // At the top of the swing the fluke tip stuns the fish in its arc, and a splash marks where they are flung.
        const peak = (0.4 * (Math.PI / 2)) / WHIP_SWING;
        if (u >= peak && u - ctx.dt < peak) {
          const tail = sh.nodes.length - 2;
          const tx = sh.nodes[tail];
          const ty = sh.nodes[tail + 1];
          // The tail's outward direction, so the splash lands 0.6·L past the tip.
          const ex = tx - sh.nodes[tail - 2];
          const ey = ty - sh.nodes[tail - 1];
          const ed = Math.hypot(ex, ey) || 1;
          ctx.stunFish(tx, ty, 0.35 * L, 6);
          ctx.emit("splash", tx + (ex / ed) * 0.6 * L, ty + (ey / ed) * 0.6 * L);
        }
        return;
      }
      // Turns back for the stunned fish if there are any, otherwise for the food, and takes what it passes.
      if (ctx.schoolNear(hx, hy, 2.5 * L, school, true) > 0) {
        aimAt(ctx, school.x, school.y, 3, 1.6);
      } else {
        aimAt(ctx, mx, my, 3, 1.6);
      }
      ctx.eatNear(biteRange(L));
    },
  },
  // Orca carousel: the pod circles a bait ball, flashing white bellies and blowing bubbles to tighten it. Then each
  // orca in turn slaps the ball with its fluke, stunning fish, and eats the stunned ones one at a time.
  carousel: {
    engageRange: (L) => 2 * L,
    seconds: 10,
    requires(ctx) {
      const m = ctx.target;
      return (
        m !== null &&
        ctx.packNear(3 * ctx.L) >= 3 &&
        ctx.schoolNear(m.x, m.y, 2 * ctx.L, herdAt) >= 6
      );
    },
    engageDistance: (ctx) => schoolDistance(ctx, 2 * ctx.L),
    step(ctx) {
      const { L, sh, t, time, dt } = ctx;
      const hx = sh.nodes[0];
      const hy = sh.nodes[1];
      const n = locateSchool(ctx, 2 * L);
      // Each orca strikes at its own turn, so it needs bait to strike at. With none left before then, the carousel ends.
      const strikeAt = 3.5 + (sh.id % 4) * 1.2;
      if (n === 0 && t < strikeAt) return true;
      const cx = herdAt.x;
      const cy = herdAt.y;
      ctx.herd(cx, cy, 1.6 * L, 60, 40);
      // A bubble at the snout every 0.35 s, staggered by id: the bubbles tighten the ball.
      const beat = (time + sh.id * 0.05) / 0.35;
      if (Math.floor(beat) !== Math.floor(beat - dt / 0.35)) ctx.emit("bubble", hx, hy);
      if (sh.actionMark < 0 && t >= strikeAt) {
        // Cuts in toward the centre; the whip starts once the snout is within 0.6·L of it, or after 1.5 s of
        // cutting in (a big orca turns wide and may never get closer).
        aimAt(ctx, cx, cy, 3, 1.6);
        if (Math.hypot(cx - hx, cy - hy) > 0.6 * L && t < strikeAt + 1.5) return;
        sh.actionMark = time;
      }
      if (sh.actionMark >= 0) {
        const u = time - sh.actionMark;
        ctx.pose.slap = whipSlap(u, 0.5, 1.5);
        if (u < 0.5) {
          // The pectorals snap in and the orca stalls as the fluke comes over (the same swing as the thresher's).
          aimAt(ctx, cx, cy, 3, 0.5);
          // At the top of the swing the fluke comes down on the ball: the fish in it are stunned, and the splash
          // rises at the fluke tip. The stun is centred on the ball, not the tip, because the turn that brings the
          // fluke over the ball is too wide to model on this spine.
          const peak = (0.5 * (Math.PI / 2)) / WHIP_SWING;
          if (u >= peak && u - dt < peak) {
            const tail = sh.nodes.length - 2;
            ctx.stunFish(cx, cy, 0.5 * L, 6);
            ctx.emit("splash", sh.nodes[tail], sh.nodes[tail + 1]);
          }
          return;
        }
        if (u < 3) {
          // Turns toward the stunned fish (the centre stays put when none are stunned) and takes them one at a time.
          ctx.schoolNear(cx, cy, 2 * L, herdAt, true);
          aimAt(ctx, herdAt.x, herdAt.y, 3, 1.2);
          ctx.eatFishNear(L * 0.15 + 10);
          return;
        }
      }
      // Circling: the whole pod goes the same way round the ball at 0.9·L, the belly rolling to flash.
      const dir = sh.foodGroup % 2 ? 1 : -1;
      const a = Math.atan2(hy - cy, hx - cx) + dir * 0.5;
      aimAt(ctx, cx + Math.cos(a) * 0.9 * L, cy + Math.sin(a) * 0.9 * L, 3, 1.2);
      // A slow roll onto one side about every 7 s, then back: a gentle belly flash, never a flip. The flash is a
      // narrow lobe of a slow sine, so each orca rolls on its own beat (sh.id), and the roll eases in and out.
      const flash = Math.max(0, Math.sin(t * 0.9 + sh.id * 1.7)) ** 3;
      ctx.pose.roll = 0.75 * smoothstep(0, 1, flash);
    },
  },
  // Orca spyhop: rises vertically with its head out of the water to look around, then drops back and bites.
  spyhop: {
    engageRange: (L) => 1.0 * L,
    seconds: 3.4,
    step(ctx) {
      const { L, t } = ctx;
      // The head rises over the first second and sinks back over the last 0.6 s of the hold, so the pitch never steps.
      const up = smoothstep(0.4, 1.0, t) * (1 - smoothstep(2.4, 3.0, t));
      ctx.pose.pitch = up;
      ctx.pose.height = 0.7 * up;
      if (t < 0.4) {
        steerGoal(ctx, 3, 0.15);
        return;
      }
      if (t < 2.4) {
        // Head raised: the snout lifts clear of the water while the body stays in view.
        steerGoal(ctx, 3, 0.15);
        return;
      }
      const bite = biteRange(L);
      if (ctx.dist <= bite) ctx.eatNear(bite);
      else steerAt(ctx, 1.6);
    },
  },
  // Humpback bubble net: circles beneath the bait, blowing a spiral wall of bubbles that tightens, then lunges up
  // through the middle with its mouth open. Not every feed uses the net, so it is one of several moves.
  bubbleNet: {
    engageRange: (L) => 1.1 * L,
    seconds: 10,
    requires(ctx) {
      const m = ctx.target;
      return m !== null && ctx.schoolNear(m.x, m.y, 2 * ctx.L, herdAt) >= 6;
    },
    engageDistance: (ctx) => schoolDistance(ctx, 2 * ctx.L),
    step(ctx) {
      const { L, sh, t, time } = ctx;
      const hx = sh.nodes[0];
      const hy = sh.nodes[1];
      const n = locateSchool(ctx, 2 * L);
      // Before the lunge there must be bait for the net to hold; with none left the action ends.
      if (n === 0 && t < 6) return true;
      const cx = herdAt.x;
      const cy = herdAt.y;
      // The poses blend between the net and the lunge: it sinks as it spirals, then rises through the middle at 6 s
      // and eases back down as it falls away, so no pose steps at either edge.
      const rise = smoothstep(6, 6.8, t) * (1 - smoothstep(8.6, 9.2, t));
      ctx.pose.height = rise;
      ctx.pose.pitch = 0.6 * rise;
      ctx.pose.gape = rise;
      ctx.pose.dive = 0.6 * smoothstep(0, 1, t) * (1 - rise);
      if (t < 6) {
        // Spiral below the bait: the radius shrinks linearly from 1.0·L to 0.45·L over 6 s, in the creature's own
        // orbit direction, with a radial pull toward that radius. A humpback turns wide, so it swims the net fast
        // (2.4× cruise); slower, it can't hold the spiral and the lunge starts too far out to reach the bait.
        const r = (1.0 - 0.55 * (t / 6)) * L;
        const dc = Math.hypot(hx - cx, hy - cy) || 1;
        const rx = (hx - cx) / dc;
        const ry = (hy - cy) / dc;
        const pull = clamp(((r - dc) / L) * 2, -1.5, 1.5);
        const tx = (-ry * sh.orbitDir + rx * pull) * L;
        const ty = (rx * sh.orbitDir + ry * pull) * L;
        aimAt(ctx, hx + tx, hy + ty, 3, 2.4);
        // The net bunches the bait inside the spiral as it tightens.
        ctx.herd(cx, cy, r, 70, 15);
        // A bubble every 0.12 s where the snout is. The bubbles stay where they are released, so they form the wall.
        if (time >= sh.actionMark) {
          ctx.emit("bubble", hx, hy);
          sh.actionMark = time + 0.12;
        }
        return;
      }
      if (t < 8.6) {
        // Lunges up through the middle of the net, mouth open, taking what is in it on the way through.
        aimAt(ctx, cx, cy, 4, 3);
        // The net still holds the bait while the open mouth comes through, and the inrush of water draws the
        // nearest fish into it.
        ctx.herd(cx, cy, 0.6 * L, 70, 0);
        if (sh.gape > 0.6) {
          ctx.herd(hx, hy, 0.8 * L, 140, 0);
          ctx.eatFishNear(0.5 * L);
          ctx.eatNear(0.5 * L);
        }
        if (crossed(ctx, 8.4)) ctx.emit("splash", hx, hy);
        return;
      }
      // Everything eases back to rest while it falls away.
      return t >= 9.4;
    },
  },
  // Humpback lunge feeding: a fast charge at the bait with the throat pleats ballooning as the mouth opens.
  lunge: {
    engageRange: (L) => 1.0 * L,
    seconds: 4,
    step(ctx) {
      const { L, dist } = ctx;
      steerGoal(ctx, 3, 1.8);
      // The throat opens as the bait comes within a length, not in one step at L.
      ctx.pose.gape = smoothstep(1.1 * L, 0.9 * L, dist);
      if (ctx.pose.gape > 0.6) {
        ctx.eatFishNear(0.45 * L);
        ctx.eatNear(0.45 * L);
      }
    },
  },
  // Humpback blow and fluke: blows at the surface, then raises its flukes and dives, and comes back up for bait.
  blowAndFluke: {
    engageRange: (L) => 1.4 * L,
    seconds: 6,
    step(ctx) {
      const { L, sh, t, time } = ctx;
      // Once, on engagement: the blowhole is spine node 2 (world.ts BLOWHOLE_NODE).
      if (sh.actionMark < 0) {
        sh.actionMark = time;
        ctx.emit("blow", sh.nodes[4], sh.nodes[5], L);
      }
      // The head drops and the body sinks over 0.6 s from t = 1.6, and eases back up as it comes under at 3.6 s.
      const sink = smoothstep(1.6, 2.2, t) * (1 - smoothstep(3.6, 4.2, t));
      ctx.pose.pitch = -0.7 * sink;
      ctx.pose.dive = sink;
      if (t >= 3.6) {
        // Back under: approaches and bites for the rest of the time.
        if (ctx.dist <= biteRange(L)) ctx.eatNear(biteRange(L));
        else steerAt(ctx, 1.6);
        return;
      }
      steerGoal(ctx, 3, 0.6);
      // The blow height eases in after the blow, and out as the body sinks.
      ctx.pose.height = 0.3 * smoothstep(0.3, 0.9, t) * (1 - smoothstep(1.6, 2.2, t));
      if (t < 1.6) return;
      // Flukes up: the fluke lifts once as the body sinks, and swings back to rest by 3.6 s.
      if (t < 3.6) ctx.pose.slap = 0.4 * Math.sin((Math.PI * (t - 1.6)) / 2);
    },
  },
};
