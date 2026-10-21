import type { CreatureSpecies } from "./types";

/** How a species swims while cruising: pod, pointer and turning limits. Species without an entry use DEFAULT_BEHAVIOUR. */
export interface Behaviour {
  /** Drifts after the pointer when it hovers nearby (koi come up to people at the pond edge). */
  followsPointer: boolean;
  /** Keeps company with its own species: cohesion and alignment toward pod mates. */
  pod?: boolean;
  /** Most bend per spine joint (radians) in follow-the-leader; default DEFAULT_MAX_BEND. */
  maxBend?: number;
  /** Smallest turning radius in body lengths while cruising; default DEFAULT_TURN_RADIUS. */
  turnRadius?: number;
}

/** Default most bend per spine joint (radians). A wide joint limit with a gentle arc keeps bodies from curling into a C. */
export const DEFAULT_MAX_BEND = 0.1;
/** Default smallest turning radius in body lengths. Wider than the classic shark agility, so turns are arcs, not pivots. */
export const DEFAULT_TURN_RADIUS = 0.6;
/** Turning radius (body lengths) for an animal whose snout is past the canvas edge: it turns back at the old classic agility. */
export const EDGE_TURN_RADIUS = 0.22;

export const DEFAULT_BEHAVIOUR: Behaviour = {
  followsPointer: false,
};

export const BEHAVIOURS: Partial<Record<CreatureSpecies, Behaviour>> = {
  koi: {
    followsPointer: true,
    maxBend: 0.09,
    turnRadius: 0.5,
  },
  // Dolphins and whales travel in pods.
  bottlenose: { ...DEFAULT_BEHAVIOUR, pod: true },
  orca: { ...DEFAULT_BEHAVIOUR, pod: true },
};

/** How a species swims. Species without an entry use DEFAULT_BEHAVIOUR. */
export function behaviourOf(species: CreatureSpecies): Behaviour {
  return BEHAVIOURS[species] ?? DEFAULT_BEHAVIOUR;
}
