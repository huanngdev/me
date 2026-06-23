import { PageHeader } from "@repo/core/components/layouts/page-header";
import { StripedSeparator } from "@repo/core/components/layouts/striped-separator";
import { GroupStandings } from "@repo/core/components/layouts/world-cup/group-standings";
import { ScheduleCalendar } from "@repo/core/components/layouts/world-cup/schedule-calendar";
import { WorldCupToc } from "@repo/core/components/layouts/world-cup/world-cup-toc";
import { Reveal } from "@repo/core/components/reveal";

import { getWorldCup } from "../../lib/worldcup";

// Static backbone via openfootball/worldcup.json, revalidated every 10 minutes (ISR) so
// new results and the current date stay fresh during the tournament.
export const revalidate = 600;

function formatDate(date: string, withYear: boolean): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
}

export default async function WorldCupPage() {
  const data = await getWorldCup();
  const matches = data.schedule.flatMap((d) => d.matches);
  const played = matches.filter((m) => m.status === "finished").length;

  // Tournament window derived from the schedule itself, so it always matches the data.
  const days = data.schedule;
  const tournamentWindow =
    days.length > 0
      ? `${formatDate(days[0].date, false)} – ${formatDate(days[days.length - 1].date, true)}`
      : null;

  const today = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <>
      <WorldCupToc />
      <PageHeader title="World Cup 2026" />

      <section>
        <div className="mx-auto w-full max-w-4xl border-x px-4 py-5 sm:px-6 lg:px-8">
          <p className="text-sm">
            FIFA World Cup 2026 · Canada, Mexico &amp; USA
            {tournamentWindow ? ` · ${tournamentWindow}` : ""}
          </p>
          {data.available && matches.length > 0 && (
            <p className="text-muted-foreground mt-1 font-mono text-xs tabular-nums">
              {today} · {played} / {matches.length} matches played
            </p>
          )}
        </div>
      </section>

      <StripedSeparator height="h-12" />
      <Reveal>
        <ScheduleCalendar matches={matches} groups={data.groups} />
      </Reveal>

      <StripedSeparator height="h-12" />
      <Reveal>
        <GroupStandings groups={data.groups} />
      </Reveal>
    </>
  );
}
