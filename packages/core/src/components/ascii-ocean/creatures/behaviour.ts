import type { CreatureSpecies } from "./types";

export type ActionId =
  | "approachAndBite"
  | "surfaceSlurp"
  | "circleThenLunge"
  | "breach"
  | "scanSweep"
  | "scanAndPin"
  | "gulpAll"
  | "burst"
  | "tailWhip"
  | "suction"
  | "slowPeck"
  | "leap"
  | "fishWhack"
  | "carousel"
  | "spyhop"
  | "bubbleNet"
  | "lunge"
  | "blowAndFluke"
  | "breachRoll"
  | "soundDive";

export interface Behaviour {
  /** How far it notices food, as a fraction of the world's shorter side. Sharks smell it from far away. */
  senseRange: number;
  /** At most this many of the species answer one offering (koi crowd in). */
  maxResponders: number;
  /** Seconds before it answers food again: [min, max]. */
  cooldown: [number, number];
  /** Weighted actions; later rounds add signature moves with `requires`. */
  actions: { id: ActionId; weight: number }[];
  /** Hunts the bait fish like the sharks do. Koi and humpbacks don't. */
  huntsFish: boolean;
  /** Drifts after the pointer when it hovers nearby (koi learn people mean food). */
  followsPointer: boolean;
  /** Breathes at the surface every [min, max] seconds (cetaceans); absent for fish and sharks. */
  breathes?: [number, number];
  /**
   * Breathes in series instead of singly (orca, humpback): a run of blows `gap` seconds apart, then a
   * dive of `dive` seconds with no breath. `fluke` raises the flukes into a sounding dive before it.
   * Each count and time comes from the creature's id and the clock, not rng.
   */
  breathSeries?: {
    blows: [number, number];
    gap: [number, number];
    dive: [number, number];
    fluke: boolean;
  };
  /**
   * Food-less shows it puts on by itself while cruising, as "every [min, max] seconds" (see world.ts stepShows).
   * Each is an action started with no food: a leap or a breach. Absent for species with no shows.
   */
  shows?: { id: ActionId; every: [number, number] }[];
  /** Keeps company with its own species in cruise: cohesion and alignment toward pod mates. */
  pod?: boolean;
  /** Most bend per spine joint (radians) in follow-the-leader; default 0.16. */
  maxBend?: number;
  /** Smallest turning radius in body lengths while cruising (not hunting or going for food); default 0.22 (the classic shark agility). */
  turnRadius?: number;
}

export const DEFAULT_BEHAVIOUR: Behaviour = {
  senseRange: 0.9,
  maxResponders: 2,
  cooldown: [6, 10],
  actions: [{ id: "approachAndBite", weight: 1 }],
  huntsFish: true,
  followsPointer: false,
};

export const BEHAVIOURS: Partial<Record<CreatureSpecies, Behaviour>> = {
  koi: {
    // Koi hear pellets land anywhere in a garden pond.
    senseRange: 0.85,
    maxResponders: 5,
    cooldown: [2, 4],
    actions: [{ id: "surfaceSlurp", weight: 1 }],
    huntsFish: false,
    followsPointer: true,
    maxBend: 0.09,
    turnRadius: 0.5,
  },
  // Dolphins and whales: bottlenose travel in pods and leap or whack bait fish; orcas hunt in pods.
  bottlenose: {
    ...DEFAULT_BEHAVIOUR,
    senseRange: 0.7,
    maxResponders: 3,
    cooldown: [4, 7],
    actions: [
      { id: "approachAndBite", weight: 0.4 },
      { id: "leap", weight: 0.35 },
      { id: "fishWhack", weight: 0.25 },
    ],
    breathes: [8, 14],
    pod: true,
    shows: [{ id: "leap", every: [18, 32] }],
  },
  orca: {
    ...DEFAULT_BEHAVIOUR,
    senseRange: 0.75,
    maxResponders: 4,
    cooldown: [6, 10],
    actions: [
      { id: "carousel", weight: 0.6 },
      { id: "approachAndBite", weight: 0.25 },
      { id: "spyhop", weight: 0.15 },
    ],
    breathes: [12, 20],
    breathSeries: { blows: [3, 5], gap: [4, 6], dive: [15, 25], fluke: false },
    pod: true,
    shows: [{ id: "breachRoll", every: [45, 75] }],
  },
  // Humpbacks feed on krill, not fish, and answer food one at a time.
  humpback: {
    ...DEFAULT_BEHAVIOUR,
    senseRange: 0.7,
    maxResponders: 1,
    cooldown: [10, 15],
    huntsFish: false,
    actions: [
      { id: "bubbleNet", weight: 0.6 },
      { id: "lunge", weight: 0.25 },
      { id: "blowAndFluke", weight: 0.15 },
    ],
    breathes: [18, 30],
    breathSeries: { blows: [3, 4], gap: [5, 7], dive: [25, 40], fluke: true },
    shows: [{ id: "breachRoll", every: [55, 95] }],
  },
  // Signature feeding moves, one or two per shark (docs/ascii-ocean-species.md §8.3).
  classic: {
    ...DEFAULT_BEHAVIOUR,
    actions: [
      { id: "circleThenLunge", weight: 0.75 },
      { id: "breach", weight: 0.25 },
    ],
  },
  hammerhead: { ...DEFAULT_BEHAVIOUR, actions: [{ id: "scanSweep", weight: 1 }] },
  greathammer: { ...DEFAULT_BEHAVIOUR, actions: [{ id: "scanAndPin", weight: 1 }] },
  tiger: { ...DEFAULT_BEHAVIOUR, actions: [{ id: "gulpAll", weight: 1 }] },
  mako: {
    ...DEFAULT_BEHAVIOUR,
    actions: [
      { id: "burst", weight: 0.7 },
      { id: "breach", weight: 0.3 },
    ],
  },
  thresher: {
    ...DEFAULT_BEHAVIOUR,
    actions: [
      { id: "tailWhip", weight: 0.8 },
      { id: "approachAndBite", weight: 0.2 },
    ],
  },
  nurse: { ...DEFAULT_BEHAVIOUR, actions: [{ id: "suction", weight: 1 }] },
  zebra: { ...DEFAULT_BEHAVIOUR, actions: [{ id: "slowPeck", weight: 1 }] },
};

/** How a species behaves around food and the pointer. Species without an entry use DEFAULT_BEHAVIOUR. */
export function behaviourOf(species: CreatureSpecies): Behaviour {
  return BEHAVIOURS[species] ?? DEFAULT_BEHAVIOUR;
}
