import type {
  WcGoal,
  WcGroupTable,
  WcMatch,
  WcScheduleDay,
  WcSide,
  WcStage,
  WcStanding,
  WorldCupData,
} from "@repo/core/types";

import { fetchRawWorldCup, type RawGoal, type RawMatch } from "./source";

const STAGE_BY_ROUND: Record<string, WcStage> = {
  "Round of 32": "round-of-32",
  "Round of 16": "round-of-16",
  "Quarter-final": "quarter-final",
  "Semi-final": "semi-final",
  "Match for third place": "third-place",
  Final: "final",
};

// "Matchday N" rounds are the group stage; everything else is a knockout round.
function roundToStage(round: string): WcStage {
  return STAGE_BY_ROUND[round] ?? "group";
}

const pad = (n: number) => String(n).padStart(2, "0");

// "13:00 UTC-6" + "2026-06-11" → ISO 8601 UTC instant, or null if unparseable.
// The dataset gives venue-local time with a whole-hour UTC offset (-4 … -7 for NA hosts).
function parseKickoff(date: string, time: string): string | null {
  const m = /^(\d{1,2}):(\d{2})\s*UTC([+-]\d{1,2})$/.exec(time.trim());
  if (!m) return null;
  const [, hh, mm, off] = m;
  const offHours = Number(off);
  const sign = offHours < 0 ? "-" : "+";
  const iso = `${date}T${pad(Number(hh))}:${mm}:00${sign}${pad(Math.abs(offHours))}:00`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// Knockout slots arrive as codes until the team is decided: "2A", "3A/B/C/D/F", "W101", "L98".
const isPlaceholder = (name: string) => /^(\d|[WL]\d)/.test(name.trim());

const normalizeGoals = (goals: RawGoal[] | undefined): WcGoal[] =>
  (goals ?? []).map((g) => ({
    name: g.name,
    minute: String(g.minute),
    penalty: g.penalty === true,
    owngoal: g.owngoal === true,
  }));

function normalizeMatch(raw: RawMatch, i: number): WcMatch {
  const ft = raw.score?.ft;
  const homeScore = ft && ft.length === 2 ? ft[0] : null;
  const awayScore = ft && ft.length === 2 ? ft[1] : null;
  const finished = homeScore !== null && awayScore !== null;

  const ht = raw.score?.ht;
  const halftime: [number, number] | null = ht && ht.length === 2 ? [ht[0], ht[1]] : null;

  const side = (name: string, score: number | null, goals: WcGoal[]): WcSide => ({
    name,
    placeholder: isPlaceholder(name),
    score,
    goals,
  });

  return {
    id: raw.num != null ? `m${raw.num}` : `g${i}`,
    round: raw.round,
    stage: roundToStage(raw.round),
    group: raw.group ?? null,
    kickoff: parseKickoff(raw.date, raw.time),
    date: raw.date,
    venue: raw.ground ?? null,
    status: finished ? "finished" : "upcoming",
    minute: null,
    halftime,
    referee: null,
    home: side(raw.team1, homeScore, normalizeGoals(raw.goals1)),
    away: side(raw.team2, awayScore, normalizeGoals(raw.goals2)),
  };
}

const emptyStanding = (team: string): WcStanding => ({
  team,
  played: 0,
  won: 0,
  drawn: 0,
  lost: 0,
  gf: 0,
  ga: 0,
  gd: 0,
  points: 0,
});

// Compute group tables from played group-stage results (3 pts win, 1 draw).
// Tie-break: points → goal difference → goals for → name. Head-to-head is not applied.
function computeGroups(matches: WcMatch[]): WcGroupTable[] {
  const groups = new Map<string, Map<string, WcStanding>>();

  for (const m of matches) {
    if (m.stage !== "group" || !m.group) continue;

    let table = groups.get(m.group);
    if (!table) {
      table = new Map();
      groups.set(m.group, table);
    }
    if (!table.has(m.home.name)) table.set(m.home.name, emptyStanding(m.home.name));
    if (!table.has(m.away.name)) table.set(m.away.name, emptyStanding(m.away.name));

    if (m.status !== "finished" || m.home.score === null || m.away.score === null) continue;

    const h = table.get(m.home.name)!;
    const a = table.get(m.away.name)!;
    h.played++;
    a.played++;
    h.gf += m.home.score;
    h.ga += m.away.score;
    a.gf += m.away.score;
    a.ga += m.home.score;

    if (m.home.score > m.away.score) {
      h.won++;
      a.lost++;
      h.points += 3;
    } else if (m.home.score < m.away.score) {
      a.won++;
      h.lost++;
      a.points += 3;
    } else {
      h.drawn++;
      a.drawn++;
      h.points++;
      a.points++;
    }
  }

  const tables: WcGroupTable[] = [];
  for (const [group, teamMap] of groups) {
    const standings = [...teamMap.values()];
    for (const s of standings) s.gd = s.gf - s.ga;
    standings.sort(
      (x, y) => y.points - x.points || y.gd - x.gd || y.gf - x.gf || x.team.localeCompare(y.team),
    );
    tables.push({ group, standings });
  }
  tables.sort((a, b) => a.group.localeCompare(b.group));
  return tables;
}

// Group matches by calendar date into a chronological timeline.
function buildSchedule(matches: WcMatch[]): WcScheduleDay[] {
  const byDate = new Map<string, WcMatch[]>();
  for (const m of matches) {
    const arr = byDate.get(m.date);
    if (arr) arr.push(m);
    else byDate.set(m.date, [m]);
  }
  return [...byDate.entries()]
    .map(([date, dayMatches]) => ({
      date,
      matches: dayMatches.sort((a, b) => (a.kickoff ?? "").localeCompare(b.kickoff ?? "")),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function getWorldCup(): Promise<WorldCupData> {
  const raw = await fetchRawWorldCup();
  if (!raw) {
    return { name: "World Cup 2026", groups: [], schedule: [], available: false };
  }
  const matches = raw.matches.map(normalizeMatch);
  return {
    name: raw.name,
    groups: computeGroups(matches),
    schedule: buildSchedule(matches),
    available: true,
  };
}
