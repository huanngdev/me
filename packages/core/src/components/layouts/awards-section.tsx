import { TrophyIcon } from "lucide-react";

import { AWARDS } from "../../constants";
import { cn } from "../../lib/utils";

function isPodium(result: string): boolean {
  const r = result.toLowerCase();
  return (
    r.includes("top") ||
    r.includes("winner") ||
    r.includes("1st") ||
    r.includes("2nd") ||
    r.includes("3rd")
  );
}

function formatAwardDate(value: string): string {
  // Accepts "2026", "2026-04-17", "2026-02"
  const parts = value.split("-").map(Number);
  if (parts.length === 1) return String(parts[0]);
  const [y, m, d] = parts;
  const date = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  return date.toLocaleDateString("en-US", {
    month: "short",
    ...(d ? { day: "numeric" } : {}),
    year: "numeric",
    timeZone: "UTC",
  });
}

export function AwardsSection() {
  return (
    <section id="awards">
      <div className="mx-auto w-full max-w-4xl border-x">
        <h2 className="border-b px-4 py-4 text-xl font-semibold tracking-tight sm:px-6 sm:py-5 sm:text-2xl lg:px-8">
          Awards & hackathons
        </h2>

        <ul className="divide-y">
          {AWARDS.map((award) => {
            const podium = isPodium(award.result);
            return (
              <li
                key={`${award.event}-${award.date}`}
                className="px-4 py-4 sm:px-6 sm:py-5 lg:px-8"
              >
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-md border",
                      podium
                        ? "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                        : "border-border bg-muted/30 text-muted-foreground",
                    )}
                  >
                    <TrophyIcon className="size-4" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <h3 className="text-sm font-semibold tracking-tight sm:text-base">
                        {award.event}
                      </h3>
                      <span
                        className={cn(
                          "text-xs",
                          podium
                            ? "font-medium text-amber-600 dark:text-amber-400"
                            : "text-muted-foreground",
                        )}
                      >
                        {award.result}
                      </span>
                    </div>
                    <p className="text-muted-foreground mt-0.5 text-sm">{award.project}</p>
                    <p className="text-muted-foreground mt-1 font-mono text-xs">
                      {formatAwardDate(award.date)}
                    </p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
