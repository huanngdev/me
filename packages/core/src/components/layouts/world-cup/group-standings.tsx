import type { WcGroupTable } from "../../../types";
import { cn } from "../../../lib/utils";
import { TeamFlag } from "./team-flag";

const fmtGd = (gd: number) => (gd > 0 ? `+${gd}` : String(gd));

function GroupCard({ group, standings }: WcGroupTable) {
  const label = group.replace(/^Group\s+/, "");
  return (
    <div className="bg-background py-4">
      <h3 className="text-muted-foreground mb-3 px-4 font-mono text-xs font-medium tracking-wider uppercase sm:px-5">
        Group {label}
      </h3>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="text-muted-foreground text-[11px] tracking-wide uppercase">
            <th className="w-4 pb-1 pl-4 text-left font-medium sm:pl-5" aria-label="Position" />
            <th className="pb-1 text-left font-medium">Team</th>
            <th className="w-6 pb-1 text-right font-medium">P</th>
            <th className="w-6 pb-1 text-right font-medium">W</th>
            <th className="w-6 pb-1 text-right font-medium">D</th>
            <th className="w-6 pb-1 text-right font-medium">L</th>
            <th className="w-8 pb-1 text-right font-medium">GD</th>
            <th className="w-8 pr-4 pb-1 text-right font-medium sm:pr-5">Pts</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((s, i) => (
            <tr
              key={s.team}
              className={cn("border-border/60 border-t", i < 2 && "bg-emerald-500/10")}
            >
              <td className="text-muted-foreground py-1.5 pr-2 pl-4 text-left font-mono text-xs sm:pl-5">
                {i + 1}
              </td>
              <td className="py-1.5 pr-2">
                <span className="flex min-w-0 items-center gap-2">
                  <TeamFlag name={s.team} className="h-3.5 w-5" />
                  <span className="truncate font-medium">{s.team}</span>
                </span>
              </td>
              <td className="py-1.5 text-right font-mono text-xs tabular-nums">{s.played}</td>
              <td className="text-muted-foreground py-1.5 text-right font-mono text-xs tabular-nums">
                {s.won}
              </td>
              <td className="text-muted-foreground py-1.5 text-right font-mono text-xs tabular-nums">
                {s.drawn}
              </td>
              <td className="text-muted-foreground py-1.5 text-right font-mono text-xs tabular-nums">
                {s.lost}
              </td>
              <td className="text-muted-foreground py-1.5 text-right font-mono text-xs tabular-nums">
                {fmtGd(s.gd)}
              </td>
              <td className="py-1.5 pr-4 text-right font-mono text-xs font-semibold tabular-nums sm:pr-5">
                {s.points}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function GroupStandings({ groups }: { groups: WcGroupTable[] }) {
  return (
    <section id="groups">
      <div className="mx-auto w-full max-w-[1600px] border-x">
        <div className="flex items-baseline justify-between border-b px-4 py-4 sm:px-6 sm:py-5 lg:px-8">
          <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">Groups</h2>
          <span className="text-muted-foreground text-xs">Top 2 advance</span>
        </div>

        {groups.length === 0 ? (
          <p className="text-muted-foreground px-4 py-8 text-sm italic sm:px-6 lg:px-8">
            Group tables are not available right now.
          </p>
        ) : (
          <div className="bg-border grid grid-cols-1 gap-px sm:grid-cols-2 xl:grid-cols-3">
            {groups.map((g) => (
              <GroupCard key={g.group} {...g} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
