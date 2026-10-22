import type { Rng } from "../math";
import type { SharkSpec } from "../world";
import { CREATURES } from "./index";
import type { CreatureDef, CreatureGroup, CreatureSpecies, OceanScale } from "./types";

/** One animal to place in the water. `coat` names its colour scheme, for species that have coats. */
export type RosterEntry = { species: CreatureSpecies; rel: number; depth: number; coat?: string };

/** Most animals of one species a single group may place. */
export const MAX_PER_GROUP = 12;
/** Most animals in the whole roster. */
export const MAX_CREATURES = 16;
/** Exponent that compresses real length ratios; `stylized` softens them, `true` keeps them. */
export const SCALE_EXPONENT: Record<OceanScale, number> = { stylized: 0.45, true: 1 };

const JITTER = 0.16;

/**
 * Turns a group's variety into a coat for the species. A string is the coat (or the default when it is
 * unknown); an array is returned as the names to pick from, one per animal; no variety gives the default.
 */
function resolveCoat(
  species: CreatureSpecies,
  def: CreatureDef,
  variety: string | string[] | undefined,
  warnings: string[],
): string | string[] | undefined {
  const coats = def.coats;
  if (!coats) return undefined;
  const fallback = def.defaultCoat;
  if (typeof variety === "string") {
    if (Object.hasOwn(coats, variety)) return variety;
    warnings.push(`${species} variety "${variety}" is unknown; using ${fallback ?? "no coat"}`);
    return fallback;
  }
  if (Array.isArray(variety)) {
    const known: string[] = [];
    for (const name of variety) {
      if (Object.hasOwn(coats, name)) known.push(name);
      else warnings.push(`${species} variety "${name}" is unknown; skipped`);
    }
    if (known.length > 0) return known;
    return fallback === undefined ? undefined : [fallback];
  }
  return fallback;
}

/** Legacy `sharks` prop: length = base × size, depth = size. No randomness. */
export function rosterFromSharks(sharks: SharkSpec[]): RosterEntry[] {
  return sharks.map((s) => ({ species: s.kind, rel: s.size, depth: s.size }));
}

/**
 * `creatures` prop. rel = (realLength / largest realLength in the roster)^exponent × size × jitter,
 * jitter = 1 + (rng() − 0.5) × 0.16 (±8%). depth = rel / largest rel (so the biggest is nearest).
 * Counts are clamped to 1–MAX_PER_GROUP and the total to MAX_CREATURES; returns the warnings it raised.
 */
export function rosterFromGroups(
  groups: CreatureGroup[],
  scale: OceanScale,
  rng: Rng,
): { entries: RosterEntry[]; warnings: string[] } {
  const warnings: string[] = [];
  // Pass 1: settle counts, sizes and coats, so the largest animal is known before any rng call.
  const planned: { species: CreatureSpecies; size: number; coat?: string | string[] }[] = [];
  let total = 0;

  for (const group of groups) {
    const { species } = group;
    if (!Object.hasOwn(CREATURES, species)) {
      warnings.push(`unknown species "${species}"; skipped`);
      continue;
    }
    let count = group.count ?? 1;
    if (!Number.isFinite(count)) {
      warnings.push(`${species} count ${count} is not finite; using 1`);
      count = 1;
    } else if (!Number.isInteger(count)) {
      const floored = Math.floor(count);
      warnings.push(`${species} count ${count} is not an integer; using ${floored}`);
      count = floored;
    }
    if (count < 1) {
      warnings.push(`${species} count below 1; using 1`);
      count = 1;
    }
    if (count > MAX_PER_GROUP) {
      warnings.push(`${species} count ${count} exceeds ${MAX_PER_GROUP}; using ${MAX_PER_GROUP}`);
      count = MAX_PER_GROUP;
    }
    const room = MAX_CREATURES - total;
    if (count > room) {
      warnings.push(`${species} count ${count} exceeds the ${MAX_CREATURES} total; using ${room}`);
      count = room;
    }

    let size = group.size ?? 1;
    if (!Number.isFinite(size) || size <= 0) {
      warnings.push(`${species} size ${size} must be a positive number; using 1`);
      size = 1;
    }

    const coat = resolveCoat(species, CREATURES[species], group.variety, warnings);
    for (let i = 0; i < count; i++) planned.push({ species, size, coat });
    total += count;
  }

  if (planned.length === 0) return { entries: [], warnings };

  const exponent = SCALE_EXPONENT[scale];
  const largest = Math.max(...planned.map((p) => CREATURES[p.species].realLength));

  // Pass 2: one rng call per animal, in roster order. A coat list takes a second call after the jitter.
  const entries: RosterEntry[] = planned.map((p) => {
    const jitter = 1 + (rng() - 0.5) * JITTER;
    const rel = (CREATURES[p.species].realLength / largest) ** exponent * p.size * jitter;
    const coat = Array.isArray(p.coat) ? p.coat[Math.floor(rng() * p.coat.length)] : p.coat;
    return { species: p.species, rel, depth: rel, coat };
  });

  const nearest = Math.max(...entries.map((e) => e.rel));
  for (const e of entries) e.depth = e.rel / nearest;

  return { entries, warnings };
}
