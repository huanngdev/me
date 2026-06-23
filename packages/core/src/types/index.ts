// World Cup 2026 domain types.
// Source data is openfootball/worldcup.json (public domain); it is fetched and
// normalized app-side (apps/web/src/lib/worldcup) into the shapes below, which
// both the data layer and the presentational components in core depend on.

export type WcStage =
  | "group"
  | "round-of-32"
  | "round-of-16"
  | "quarter-final"
  | "semi-final"
  | "third-place"
  | "final";

export type WcMatchStatus = "upcoming" | "live" | "finished";

export interface WcGoal {
  /** Scorer's name. */
  name: string;
  /** Minute label exactly as recorded, e.g. "67" or "90+4". */
  minute: string;
  /** Goal scored from a penalty. */
  penalty: boolean;
  /** Own goal — `name` is an opposition player; the goal counts for this side. */
  owngoal: boolean;
}

export interface WcSide {
  /** Team name, or a bracket slot code ("2A", "W101") when the team is undecided. */
  name: string;
  /** True when `name` is a slot code rather than a qualified team. */
  placeholder: boolean;
  /** Full-time goals; null when the match has not been played. */
  score: number | null;
  /** Goals scored for this side, in order; empty until the match is played. */
  goals: WcGoal[];
}

export interface WcMatch {
  id: string;
  /** Original openfootball round label ("Matchday 1" … "Final"). */
  round: string;
  stage: WcStage;
  /** "Group A" … "Group L" for the group stage, otherwise null. */
  group: string | null;
  /** ISO 8601 UTC instant, or null if the kickoff time could not be parsed. */
  kickoff: string | null;
  /** Venue-local calendar date, "YYYY-MM-DD". */
  date: string;
  venue: string | null;
  status: WcMatchStatus;
  /** Elapsed minutes while `status` is "live", from the live provider; otherwise null. */
  minute: number | null;
  /** Half-time goals [home, away], or null when unknown / not yet reached. */
  halftime: [number, number] | null;
  /** Main match referee, from the live provider; null when unknown. */
  referee: string | null;
  home: WcSide;
  away: WcSide;
}

export interface WcStanding {
  team: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
}

export interface WcGroupTable {
  /** "Group A" … "Group L". */
  group: string;
  /** Sorted by points, then goal difference, then goals for, then name. */
  standings: WcStanding[];
}

export interface WcScheduleDay {
  /** "YYYY-MM-DD". */
  date: string;
  /** Sorted by kickoff. */
  matches: WcMatch[];
}

export interface WorldCupData {
  name: string;
  groups: WcGroupTable[];
  schedule: WcScheduleDay[];
  /** False when the upstream fetch failed — components render an empty state. */
  available: boolean;
}
