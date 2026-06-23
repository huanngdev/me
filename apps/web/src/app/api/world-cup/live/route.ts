import { NextResponse } from "next/server";

// Live overlay for the World Cup calendar. The static page is built from the
// openfootball backbone; this route adds near-live in-play scores/minutes from
// football-data.org (free tier, World Cup is included, 10 req/min). The token stays
// server-side — the browser only ever calls this route. With no token, or on any
// upstream failure, it returns an empty overlay and the page simply shows the backbone.
//
// Get a free token at https://www.football-data.org/client/register and set
// FOOTBALL_DATA_TOKEN in the environment.

const FD_URL = "https://api.football-data.org/v4/competitions/WC/matches";

interface FdTeam {
  name: string | null;
}
interface FdScoreLine {
  home: number | null;
  away: number | null;
}
interface FdReferee {
  name: string | null;
  type?: string | null;
}
interface FdMatch {
  status: string;
  minute: number | null;
  injuryTime: number | null;
  homeTeam: FdTeam;
  awayTeam: FdTeam;
  score: { fullTime: FdScoreLine; halfTime?: FdScoreLine };
  referees?: FdReferee[];
}

export interface LiveMatch {
  home: string;
  away: string;
  status: "live" | "finished";
  home_score: number | null;
  away_score: number | null;
  ht_home: number | null;
  ht_away: number | null;
  minute: number | null;
  referee: string | null;
}

const empty = () => NextResponse.json({ matches: [] as LiveMatch[] });

export async function GET() {
  const token = process.env.FOOTBALL_DATA_TOKEN;
  if (!token) return empty();

  try {
    const res = await fetch(FD_URL, {
      headers: { "X-Auth-Token": token },
      // Share one upstream call per 30s across all visitors — well under 10 req/min.
      next: { revalidate: 30 },
    });
    if (!res.ok) return empty();

    const data = (await res.json()) as { matches?: FdMatch[] };
    const matches: LiveMatch[] = [];

    for (const m of data.matches ?? []) {
      const home = m.homeTeam?.name;
      const away = m.awayTeam?.name;
      if (!home || !away) continue;

      const inPlay = m.status === "IN_PLAY" || m.status === "PAUSED";
      const done = m.status === "FINISHED" || m.status === "AWARDED";
      if (!inPlay && !done) continue; // only matches with something to overlay

      const ref = m.referees?.find((r) => r.type === "REFEREE") ?? m.referees?.[0];

      matches.push({
        home,
        away,
        status: inPlay ? "live" : "finished",
        home_score: m.score?.fullTime?.home ?? null,
        away_score: m.score?.fullTime?.away ?? null,
        ht_home: m.score?.halfTime?.home ?? null,
        ht_away: m.score?.halfTime?.away ?? null,
        minute: inPlay ? (m.minute ?? null) : null,
        referee: ref?.name ?? null,
      });
    }

    return NextResponse.json(
      { matches },
      { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" } },
    );
  } catch {
    return empty();
  }
}
