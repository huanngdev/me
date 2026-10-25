import { clamp, hash3, smoothstep, TAU } from "../math";
import type { CreatureSpecies } from "./types";

/** The blow a surfacing animal makes: droplets, their reach in px, and the life of each droplet in seconds. */
export type Blow = { drops: number; reach: number; life: number };

/** Breathing timings for one mammal, in seconds. Compressed from the research (docs/ascii-ocean-anatomy.md) so the screen shows a cycle. */
export interface BreathProfile {
  /** Seconds under water at cruising depth; each cycle draws uniformly from this range. */
  dive: [number, number];
  /** Seconds at the surface, blowing. */
  surface: [number, number];
  blow: Blow;
}

/**
 * One breathing cycle: dive (at cruising depth) → rise → surface (blows) → sink → dive.
 * `dive` on the creature follows the phase: 1 while diving, eased to 0 at the surface, and back to 1.
 */
export type BreathPhase = "dive" | "rise" | "surface" | "sink";

/**
 * A mammal's breathing state. `seed` fixes its schedule: each phase's length is hashed from the seed and
 * the cycle number, so the same seed gives the same surfacings and no rng is spent per frame.
 */
export interface Breath {
  profile: BreathProfile;
  seed: number;
  /** Counts dives: the first dive is cycle 0. */
  cycle: number;
  phase: BreathPhase;
  /** Seconds spent in the current phase. */
  elapsed: number;
  /** Length of the current phase in seconds. */
  duration: number;
  /** Blows already emitted in the current surface phase; counts the blow on arrival and the repeats. */
  blows: number;
}

/** A fish's slow depth drift: a sine around its base depth with this period (s) and phase (rad). */
export interface Drift {
  period: number;
  phase: number;
}

/** Seconds between blows while an animal stays at the surface, so the spray stays up through the stay. */
export const BLOW_INTERVAL = 0.9;

/** Where the blow comes out, as a fraction of the body length from the snout, on the centre line. */
export const BLOWHOLE_S = 0.14;
/** Rise and sink take at least this long, so depth never changes faster than MAX_DIVE_RATE. */
export const RISE_MIN = 1.5;
/** Sinking back down takes at least this long. */
export const SINK_MIN = 2;
/**
 * The steepest change in `dive` per second: smoothstep's peak slope is 1.5 per transition, and the
 * transition takes at least RISE_MIN. At 60 Hz that is at most 1/60 per step.
 */
export const MAX_DIVE_RATE = 1.5 / RISE_MIN;
/** Fish drift: how far their depth moves either side of the base depth. */
export const DRIFT_AMP = 0.15;
/** Fish drift period range in seconds. */
export const DRIFT_PERIOD: readonly [number, number] = [20, 40];

/**
 * Breathing per mammal. Dive ranges are the research's routine intervals compressed for the screen:
 * bottlenose ~55 s wild dives, orca 26–29 s median respiratory interval, humpback 1–5 min feeding dives.
 * Surface stays are the blow interval; humpback blows are tall and bushy (3–5 m), the small ones about 1 m.
 */
export const BREATH_PROFILES: Partial<Record<CreatureSpecies, BreathProfile>> = {
  bottlenose: { dive: [12, 20], surface: [2, 4], blow: { drops: 14, reach: 28, life: 0.45 } },
  orca: { dive: [15, 25], surface: [2, 4], blow: { drops: 14, reach: 28, life: 0.45 } },
  humpback: { dive: [25, 40], surface: [4, 6], blow: { drops: 48, reach: 80, life: 0.9 } },
};

/** Seconds a phase lasts in cycle `cycle`. Each phase has its own hash lane, so the four draws are independent. */
function phaseDuration(profile: BreathProfile, phase: BreathPhase, seed: number, cycle: number) {
  const h = (lane: number) => hash3(seed, cycle, lane);
  switch (phase) {
    case "dive":
      return profile.dive[0] + (profile.dive[1] - profile.dive[0]) * h(1);
    case "rise":
      return RISE_MIN + h(2);
    case "surface":
      return profile.surface[0] + (profile.surface[1] - profile.surface[0]) * h(3);
    case "sink":
      return SINK_MIN + 1.5 * h(4);
  }
}

/** A new breath, starting cycle 0 in a dive partway through its first dive, so a pod does not surface in step. */
export function startBreath(profile: BreathProfile, seed: number): Breath {
  const duration = phaseDuration(profile, "dive", seed, 0);
  return {
    profile,
    seed,
    cycle: 0,
    phase: "dive",
    elapsed: hash3(seed, 0, 5) * duration,
    duration,
    blows: 0,
  };
}

/** Blows due by `upTo` seconds into a surface phase (one on arrival, then every BLOW_INTERVAL), less those already emitted. */
function countBlows(b: Breath, upTo: number): number {
  const due = Math.floor(upTo / BLOW_INTERVAL) + 1;
  const n = due - b.blows;
  b.blows = due;
  return n;
}

/**
 * Advances the breath by dt seconds through as many phases as it spans. Returns how many blows fire during
 * this step: one when the animal reaches the surface, then one every BLOW_INTERVAL while it stays there.
 * No rng is drawn, so the blows follow from the timers alone.
 */
export function advanceBreath(b: Breath, dt: number): number {
  let blows = 0;
  b.elapsed += dt;
  while (b.elapsed >= b.duration) {
    b.elapsed -= b.duration;
    let next: BreathPhase;
    switch (b.phase) {
      case "dive":
        next = "rise";
        break;
      case "rise":
        next = "surface";
        b.blows = 0;
        break;
      case "surface":
        // Blows up to the end of the stay, so none are lost when the step crosses into the sink.
        blows += countBlows(b, b.duration);
        next = "sink";
        break;
      case "sink":
        next = "dive";
        b.cycle++;
        break;
    }
    b.phase = next;
    b.duration = phaseDuration(b.profile, next, b.seed, b.cycle);
  }
  if (b.phase === "surface") blows += countBlows(b, b.elapsed);
  return blows;
}

/**
 * The creature's `dive` for this breath, 0 at the surface to 1 at cruising depth, eased with smoothstep
 * through rise and sink. Each phase starts and ends where the previous one left off, so there is no snap.
 */
export function diveDepth(b: Breath): number {
  const p = b.duration > 0 ? clamp(b.elapsed / b.duration, 0, 1) : 1;
  switch (b.phase) {
    case "dive":
      return 1;
    case "rise":
      return 1 - smoothstep(0, 1, p);
    case "surface":
      return 0;
    case "sink":
      return smoothstep(0, 1, p);
  }
}

/** A fish's depth offset from its base depth at time `time`: a sine within ±DRIFT_AMP. Smooth, so no snap. */
export function driftOffset(d: Drift, time: number): number {
  return DRIFT_AMP * Math.sin((TAU * time) / d.period + d.phase);
}
