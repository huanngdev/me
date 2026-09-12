import { TrophyIcon } from "lucide-react";

import { AWARDS } from "../../constants";
import { cn } from "../../lib/utils";
import { StaggerList, StaggerListItem } from "../reveal";
import { SectionHeading } from "./section-heading";

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
        <SectionHeading title="Awards & hackathons" count={AWARDS.length} />

        <StaggerList>
          {AWARDS.map((award, index) => {
            const podium = isPodium(award.result);
            return (
              <StaggerListItem
                key={`${award.event}-${award.date}`}
                className={cn(
                  "grid grid-cols-[3.5rem_1.5rem_1fr] gap-x-3 px-4 py-5 sm:grid-cols-[7rem_1.75rem_1fr] sm:px-6 lg:px-8",
                  index < AWARDS.length - 1 && "border-b",
                )}
              >
                <time
                  dateTime={award.date}
                  className="text-muted-foreground pt-1 font-mono text-[11px] tabular-nums sm:text-xs"
                >
                  {formatAwardDate(award.date)}
                </time>

                <div className="relative flex justify-center self-stretch">
                  <span
                    className={cn(
                      "bg-background relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full border",
                      podium
                        ? "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                        : "border-border bg-muted/30 text-muted-foreground",
                    )}
                  >
                    <TrophyIcon className="size-3.5" aria-hidden="true" />
                  </span>
                  {index < AWARDS.length - 1 && (
                    <span
                      className="bg-border absolute top-7 -bottom-5 left-1/2 w-px origin-top -translate-x-1/2 motion-safe:animate-[timeline-grow_300ms_ease-out_both]"
                      aria-hidden="true"
                    />
                  )}
                </div>

                <div className="min-w-0 pb-1">
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
                  <p className="text-muted-foreground mt-1 text-sm">
                    Project <span className="text-foreground font-medium">{award.project}</span>
                  </p>
                </div>
              </StaggerListItem>
            );
          })}
        </StaggerList>
      </div>
    </section>
  );
}
