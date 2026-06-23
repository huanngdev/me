// Raw openfootball/worldcup.json shapes + fetch. Public-domain dataset, no API key.
// https://github.com/openfootball/worldcup.json

export const OPENFOOTBALL_URL =
  "https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json";

export interface RawGoal {
  name: string;
  /** Minute as recorded — a number or a stoppage string like "90+4". */
  minute: number | string;
  penalty?: boolean;
  owngoal?: boolean;
}

export interface RawMatch {
  round: string;
  num?: number;
  date: string;
  time: string;
  team1: string;
  team2: string;
  group?: string;
  ground?: string;
  score?: { ft?: [number, number]; ht?: [number, number] };
  /** Goals counting for team1 / team2 respectively (own goals flagged inline). */
  goals1?: RawGoal[];
  goals2?: RawGoal[];
}

export interface RawWorldCup {
  name: string;
  matches: RawMatch[];
}

// openfootball commits new results through the day during the tournament, so revalidate
// every 10 minutes (ISR) to pick them up promptly instead of caching for a full day.
/** Fetch the dataset and revalidate every 10 minutes (ISR). Returns null on failure. */
export async function fetchRawWorldCup(): Promise<RawWorldCup | null> {
  try {
    const res = await fetch(OPENFOOTBALL_URL, { next: { revalidate: 600 } });
    if (!res.ok) return null;
    return (await res.json()) as RawWorldCup;
  } catch {
    return null;
  }
}
