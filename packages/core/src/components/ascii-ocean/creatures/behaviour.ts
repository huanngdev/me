import type { CreatureSpecies } from "./types";

/** How a species swims while cruising: pod, pointer and turning limits. Species without an entry use DEFAULT_BEHAVIOUR. */
export interface Behaviour {
  /** Drifts after the pointer when it hovers nearby (koi come up to people at the pond edge). */
  followsPointer: boolean;
  /** Keeps company with its own species: cohesion and alignment toward pod mates. */
  pod?: boolean;
  /** Most bend per spine joint (radians) in follow-the-leader; default 0.16. */
  maxBend?: number;
  /** Smallest turning radius in body lengths while cruising; default 0.22 (the classic shark agility). */
  turnRadius?: number;
}

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
