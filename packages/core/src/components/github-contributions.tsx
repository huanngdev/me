/* eslint-disable no-console */
"use client";

import { format, formatISO, parseISO, startOfWeek } from "date-fns";
import { useReducedMotion } from "motion/react";
import { use, useEffect, useMemo, useRef, useState } from "react";

import { Spinner } from "./spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";
import { cn } from "../lib/utils";
import type { Activity } from "./contribution-graph";

const DAYS = 7;
const GAP = 3;
const MIN_CELL = 8;

type Week = Array<Activity | undefined>;

function groupByWeek(data: Activity[]): Week[] {
  const weeks = new Map<string, Week>();

  for (const activity of [...data].sort((a, b) => a.date.localeCompare(b.date))) {
    const date = parseISO(activity.date);
    const key = formatISO(startOfWeek(date), { representation: "date" });
    const week = weeks.get(key) ?? new Array<Activity | undefined>(DAYS).fill(undefined);

    week[date.getDay()] = activity;
    weeks.set(key, week);
  }

  return [...weeks.values()];
}

export function GitHubContributions({
  contributions,
  usernames,
  githubProfileUrl,
  className,
}: {
  contributions: Promise<Activity[]>;
  usernames: string[];
  githubProfileUrl: string;
  className?: string;
}) {
  const data = use(contributions);
  const motionOff = useReducedMotion() ?? false;
  const gridRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ weeks: 0, cell: 0 });
  const weeks = useMemo(() => groupByWeek(data), [data]);

  useEffect(() => {
    console.info("[github:contributions:client] Rendering received data", {
      days: data.length,
      weeks: weeks.length,
    });

    if (data.length === 0) {
      console.warn("[github:contributions:client] No contribution days received; hiding graph");
    }
  }, [data.length, weeks.length]);

  useEffect(() => {
    const element = gridRef.current;
    if (!element) return;

    const observer = new ResizeObserver(() => {
      const visibleWeeks = Math.min(
        weeks.length,
        Math.max(8, Math.floor((element.clientWidth + GAP) / (MIN_CELL + GAP))),
      );
      const cell = Math.max(
        MIN_CELL,
        Math.floor((element.clientWidth - (visibleWeeks - 1) * GAP) / visibleWeeks),
      );

      setDims((current) =>
        current.weeks === visibleWeeks && current.cell === cell
          ? current
          : { weeks: visibleWeeks, cell },
      );
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, [weeks.length]);

  useEffect(() => {
    if (motionOff) return;

    const element = gridRef.current;
    if (!element) return;

    const interval = window.setInterval(() => {
      if (document.hidden) return;

      const cells = element.querySelectorAll<HTMLElement>(
        '[data-level="2"], [data-level="3"], [data-level="4"]',
      );
      const cell = cells[Math.floor(Math.random() * cells.length)];
      if (!cell) return;

      cell.classList.add("contribution-glimmer");
      window.setTimeout(() => cell.classList.remove("contribution-glimmer"), 420);
    }, 650);

    return () => window.clearInterval(interval);
  }, [motionOff]);

  if (data.length === 0) return null;

  const shownWeeks = dims.weeks ? weeks.slice(-dims.weeks) : [];
  const totalContributions = data.reduce((total, activity) => total + activity.count, 0);
  const bestDay = Math.max(...data.map((activity) => activity.count));

  return (
    <div className={cn("mx-auto flex w-full flex-col", className)}>
      <div className="flex items-center justify-between font-mono text-[11px] leading-[1.5] tracking-[0.08em] text-[#999] uppercase">
        <a
          className="transition-colors hover:text-[#bbb]"
          href={githubProfileUrl}
          target="_blank"
          rel="noopener"
        >
          Contributions · {usernames.join(" + ")}
        </a>
        <span>{totalContributions.toLocaleString("en-US")} / yr</span>
      </div>

      <div
        aria-label="GitHub Contributions"
        className="mt-3 mb-2.5 grid min-h-20 w-full content-center justify-center overflow-hidden"
        ref={gridRef}
        role="img"
        style={
          dims.weeks
            ? {
                gridTemplateColumns: `repeat(${dims.weeks}, ${dims.cell}px)`,
                gridAutoRows: `${dims.cell}px`,
                height: `${DAYS * dims.cell + (DAYS - 1) * GAP}px`,
                gap: `${GAP}px`,
              }
            : undefined
        }
      >
        {shownWeeks.flatMap((week, weekIndex) =>
          week.map((activity, dayIndex) => {
            const cell = (
              <i
                key={activity?.date ?? `${weekIndex}-${dayIndex}`}
                aria-hidden={!activity}
                className="contribution-cell block rounded-[2px] not-italic"
                data-level={activity?.level ?? 0}
                style={{
                  gridColumn: weekIndex + 1,
                  gridRow: dayIndex + 1,
                  borderRadius: dims.cell
                    ? `${Math.max(2, Math.round(dims.cell / 4))}px`
                    : undefined,
                  animationDelay: motionOff
                    ? undefined
                    : `${0.3 + (weekIndex + dayIndex) * 0.018}s`,
                }}
              />
            );

            if (!activity) {
              return cell;
            }

            return (
              <Tooltip key={activity.date}>
                <TooltipTrigger asChild>{cell}</TooltipTrigger>
                <TooltipContent className="font-sans">
                  <p>
                    {activity.count} contribution{activity.count === 1 ? "" : "s"} on{" "}
                    {format(parseISO(activity.date), "dd.MM.yyyy")}
                  </p>
                </TooltipContent>
              </Tooltip>
            );
          }),
        )}
      </div>

      <div className="flex items-center justify-between font-mono text-[11px] leading-[1.5] tracking-[0.08em] text-[#999] uppercase">
        <span>{dims.weeks || weeks.length} weeks</span>
        <span>Best {bestDay.toLocaleString("en-US")} / day</span>
      </div>
    </div>
  );
}

export function GitHubContributionsFallback() {
  return (
    <div className="flex h-40.5 w-full items-center justify-center">
      <Spinner className="text-muted-foreground" />
    </div>
  );
}
