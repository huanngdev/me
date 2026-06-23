"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { type ReactNode, useEffect, useState, useSyncExternalStore } from "react";

import type { WcGoal, WcGroupTable, WcMatch, WcSide, WcStage } from "../../../types";
import { cn } from "../../../lib/utils";
import { Button } from "../../button";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "../../drawer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../tabs";
import { KickoffTime } from "./kickoff-time";
import { TeamFlag, teamAbbr, flagSrc } from "./team-flag";

// A match block spans both halves plus the interval: 45 + 15 + 45 = 105 minutes.
const MATCH_MIN = 105;
// Pixels per hour on the time axis; block height derives from this.
const HOUR_PX = 56;
// Left time-gutter width (px), holding the hour labels.
const GUTTER = 44;

const STAGE_LABEL: Record<WcStage, string> = {
  group: "Group stage",
  "round-of-32": "Round of 32",
  "round-of-16": "Round of 16",
  "quarter-final": "Quarter-final",
  "semi-final": "Semi-final",
  "third-place": "Third place",
  final: "Final",
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Returns false on the server / first paint, true once hydrated — same pattern as
// KickoffTime. The grid is laid out in UTC on the server (deterministic, no hydration
// mismatch) and re-laid out in the visitor's local timezone once hydrated.
const noop = () => () => {};
function useHydrated() {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}

// True at the `xl` breakpoint and up, where the detail panel docks to the right of the
// grid; below it the same panel opens in a bottom drawer. Server/first paint reports
// false, so SSR renders the drawer markup (inert until opened) — no hydration mismatch.
const WIDE = "(min-width: 1280px)";
const subscribeWide = (cb: () => void) => {
  const mql = window.matchMedia(WIDE);
  mql.addEventListener("change", cb);
  return () => mql.removeEventListener("change", cb);
};
function useIsWide() {
  return useSyncExternalStore(
    subscribeWide,
    () => window.matchMedia(WIDE).matches,
    () => false,
  );
}

// --- Calendar-day arithmetic (Howard Hinnant's days-from-civil), kept timezone-free
// so the same code groups matches whether the parts came from UTC or local getters.
function daysFromCivil(y: number, m: number, d: number): number {
  const yy = m <= 2 ? y - 1 : y;
  const era = Math.floor((yy >= 0 ? yy : yy - 399) / 400);
  const yoe = yy - era * 400;
  const doy = Math.floor((153 * (m > 2 ? m - 3 : m + 9) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

function civilFromDays(z: number): { y: number; m: number; d: number } {
  const zz = z + 719468;
  const era = Math.floor((zz >= 0 ? zz : zz - 146096) / 146097);
  const doe = zz - era * 146097;
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365,
  );
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  return { y: m <= 2 ? y + 1 : y, m, d };
}

// 0 = Sunday … 6 = Saturday (1970-01-01 was a Thursday → day 0 maps to 4).
const weekdayOf = (dayNum: number) => ((dayNum % 7) + 4 + 7) % 7;
// Monday that starts the week containing `dayNum`.
const mondayOf = (dayNum: number) => dayNum - ((weekdayOf(dayNum) + 6) % 7);

// Kickoffs are ≥3h apart on the World Cup schedule except for the final round of each
// group, where two matches start at the exact same time. So instead of squeezing
// overlaps into half-width columns, matches that share a start time are grouped into one
// full-width slot and stacked — every match keeps the normal column width.
interface Slot {
  min: number; // position on the axis (minutes from the day-cut)
  clock: number; // real minutes-from-midnight of the kickoff
  matches: WcMatch[]; // 1, or 2+ when kickoffs are simultaneous
}

interface CalDay {
  dayNum: number;
  civil: { y: number; m: number; d: number };
  weekday: number; // Monday-indexed position 0..6
  slots: Slot[];
}
interface CalWeek {
  start: number;
  startCivil: { y: number; m: number; d: number };
  endCivil: { y: number; m: number; d: number };
  days: CalDay[];
}
interface CalView {
  weeks: CalWeek[];
  startMin: number; // window start in axis (day-cut–relative) minutes
  endMin: number;
  dayCut: number; // real clock minute the day/axis begins at
  labelByEnd: boolean; // true when slates are dated by their morning, not their evening
  tbd: WcMatch[];
  today: number | null; // actual local calendar day, for the date highlight
  nowDay: number | null; // logical match-day that "now" belongs to (for the now-line)
  nowShift: number | null; // axis position of "now", or null pre-hydration
}

function buildView(matches: WcMatch[], local: boolean): CalView | null {
  const raw: { match: WcMatch; dayNum: number; clock: number }[] = [];
  const tbd: WcMatch[] = [];

  for (const match of matches) {
    if (!match.kickoff) {
      tbd.push(match);
      continue;
    }
    const dt = new Date(match.kickoff);
    const y = local ? dt.getFullYear() : dt.getUTCFullYear();
    const mo = (local ? dt.getMonth() : dt.getUTCMonth()) + 1;
    const d = local ? dt.getDate() : dt.getUTCDate();
    const h = local ? dt.getHours() : dt.getUTCHours();
    const mi = local ? dt.getMinutes() : dt.getUTCMinutes();
    raw.push({ match, dayNum: daysFromCivil(y, mo, d), clock: h * 60 + mi });
  }

  if (raw.length === 0) return null;

  // Put the day boundary in the largest gap between kickoffs (mod 24h), floored to the
  // hour. This keeps an evening's slate together — including matches that spill past
  // local midnight — and keeps the time axis compact in every timezone.
  const starts = [...new Set(raw.map((r) => r.clock))].sort((a, b) => a - b);
  let cut = starts[0];
  let widest = -1;
  for (let i = 0; i < starts.length; i++) {
    const next = i + 1 < starts.length ? starts[i + 1] : starts[0] + 1440;
    const gap = next - starts[i];
    if (gap > widest) {
      widest = gap;
      cut = i + 1 < starts.length ? starts[i + 1] : starts[0];
    }
  }
  const dayCut = Math.floor(cut / 60) * 60;

  // First pass: axis positions + window (independent of how slates are dated).
  let minPos = Infinity;
  let maxEnd = -Infinity;
  for (const r of raw) {
    const min = (r.clock - dayCut + 1440) % 1440;
    minPos = Math.min(minPos, min);
    maxEnd = Math.max(maxEnd, min + MATCH_MIN);
  }
  const startMin = Math.floor(minPos / 60) * 60;
  const endMin = Math.ceil(maxEnd / 60) * 60;

  // Where the calendar date rolls over within the window. When most of the window lies
  // *after* that roll-over (e.g. far-east timezones, where a night's matches are mostly
  // next-morning), date each slate by that later day so a 00:30 kickoff sits under its
  // own calendar date — not the evening before. Otherwise (e.g. the Americas) keep the
  // slate on the evening it began.
  const midnightPos = (1440 - dayCut) % 1440;
  const labelByEnd = midnightPos > 0 && midnightPos * 2 < endMin;
  const logicalOf = (dayNum: number, clock: number) =>
    labelByEnd ? dayNum + (clock >= dayCut ? 1 : 0) : dayNum - (clock < dayCut ? 1 : 0);

  let minDay = Infinity;
  let maxDay = -Infinity;
  // logical match-day → (axis position → matches sharing that kickoff)
  const byDay = new Map<number, Map<number, WcMatch[]>>();

  for (const r of raw) {
    const min = (r.clock - dayCut + 1440) % 1440;
    const logical = logicalOf(r.dayNum, r.clock);
    minDay = Math.min(minDay, logical);
    maxDay = Math.max(maxDay, logical);
    let slotMap = byDay.get(logical);
    if (!slotMap) {
      slotMap = new Map();
      byDay.set(logical, slotMap);
    }
    const arr = slotMap.get(min);
    if (arr) arr.push(r.match);
    else slotMap.set(min, [r.match]);
  }

  const slotsFor = (dayNum: number): Slot[] => {
    const slotMap = byDay.get(dayNum);
    if (!slotMap) return [];
    return [...slotMap.entries()]
      .map(([min, matches]) => ({ min, clock: (min + dayCut) % 1440, matches }))
      .sort((a, b) => a.min - b.min);
  };

  const weeks: CalWeek[] = [];
  for (let ws = mondayOf(minDay); ws <= mondayOf(maxDay); ws += 7) {
    const days: CalDay[] = [];
    for (let i = 0; i < 7; i++) {
      const dayNum = ws + i;
      days.push({ dayNum, civil: civilFromDays(dayNum), weekday: i, slots: slotsFor(dayNum) });
    }
    weeks.push({ start: ws, startCivil: civilFromDays(ws), endCivil: civilFromDays(ws + 6), days });
  }

  // `today` is the real calendar date (what the date highlight tracks); `nowDay` is the
  // logical match-day that the current instant belongs to (what the now-line sits in).
  // They differ only in the post-midnight tail of an evening's slate.
  let today: number | null = null;
  let nowDay: number | null = null;
  let nowShift: number | null = null;
  if (local) {
    const now = new Date();
    const nowClock = now.getHours() * 60 + now.getMinutes();
    today = daysFromCivil(now.getFullYear(), now.getMonth() + 1, now.getDate());
    nowDay = logicalOf(today, nowClock);
    nowShift = (nowClock - dayCut + 1440) % 1440;
  }

  return { weeks, startMin, endMin, dayCut, labelByEnd, tbd, today, nowDay, nowShift };
}

const pad2 = (n: number) => String(n).padStart(2, "0");
const fmtHour = (min: number) => `${pad2(Math.floor(min / 60) % 24)}:00`;
const fmtClock = (min: number) => `${pad2(Math.floor(min / 60))}:${pad2(min % 60)}`;

function weekLabel(w: CalWeek): string {
  const s = w.startCivil;
  const e = w.endCivil;
  const left = `${MONTHS[s.m - 1]} ${s.d}`;
  const right = s.m === e.m ? `${e.d}` : `${MONTHS[e.m - 1]} ${e.d}`;
  return `${left} – ${right}`;
}

// One match inside a slot card: the type on top, then "home  score  away" with each team
// shown as flag-over-name. A finished match with a winner shows the winner's flag bleeding
// in from that side and fading to transparent — no colour tint.
function MatchRow({
  match,
  selected,
  onSelect,
}: {
  match: WcMatch;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const finished = match.status === "finished";
  const live = match.status === "live";
  const hs = match.home.score ?? 0;
  const as = match.away.score ?? 0;
  const homeWon = finished && hs > as;
  const awayWon = finished && as > hs;
  const winnerName = homeWon ? match.home.name : awayWon ? match.away.name : null;
  const winnerFlag = winnerName ? flagSrc(winnerName) : null;

  const type = match.group ?? STAGE_LABEL[match.stage];
  const title = `${type} · ${match.home.name} ${finished || live ? `${hs} - ${as}` : "v"} ${match.away.name}${match.venue ? ` · ${match.venue}` : ""}`;

  const teamCol = (side: WcSide, won: boolean) => (
    <div className="flex min-w-0 flex-col items-center gap-1">
      <TeamFlag name={side.name} className="h-4 w-6" />
      <span
        className={cn(
          "max-w-full truncate text-[11px]",
          won && "font-semibold",
          side.placeholder && "text-muted-foreground",
        )}
      >
        {teamAbbr(side.name)}
      </span>
    </div>
  );

  return (
    <button
      type="button"
      title={title}
      aria-pressed={selected}
      onClick={() => onSelect(match.id)}
      className={cn(
        "focus-visible:ring-ring relative flex-1 cursor-pointer overflow-hidden px-2 py-1.5 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset",
        selected ? "bg-primary/10" : "hover:bg-muted/60",
      )}
    >
      {winnerFlag && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={winnerFlag}
          alt=""
          aria-hidden
          className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-20"
          style={{
            maskImage: `linear-gradient(to ${homeWon ? "right" : "left"}, #000, transparent 72%)`,
            WebkitMaskImage: `linear-gradient(to ${homeWon ? "right" : "left"}, #000, transparent 72%)`,
          }}
        />
      )}
      <div className="relative z-10 flex h-full flex-col justify-center gap-1">
        <div className="text-muted-foreground truncate text-center text-[10px] font-medium tracking-wide uppercase">
          {type}
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1">
          {teamCol(match.home, homeWon)}
          <div className="flex shrink-0 flex-col items-center px-1">
            <span className="font-mono text-sm tabular-nums">
              {finished || live ? (
                `${hs} - ${as}`
              ) : (
                <span className="text-muted-foreground text-xs">v</span>
              )}
            </span>
            {live && (
              <span className="mt-0.5 flex items-center gap-1 text-[10px] font-medium text-red-500">
                <span className="h-1.5 w-1.5 rounded-full bg-red-500 motion-safe:animate-pulse" />
                {match.minute != null ? `${match.minute}'` : "LIVE"}
              </span>
            )}
          </div>
          {teamCol(match.away, awayWon)}
        </div>
      </div>
    </button>
  );
}

// A positioned slot card: the shared kickoff time on top, then one match — or, for
// simultaneous kickoffs, two matches in the same card split by a divider line.
function SlotCard({
  slot,
  timeLabel,
  top,
  single,
  selectedId,
  onSelect,
}: {
  slot: Slot;
  timeLabel: string;
  top: number;
  single: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const reduceMotion = useReducedMotion();
  const durH = (MATCH_MIN / 60) * HOUR_PX;
  const hasLive = slot.matches.some((m) => m.status === "live");
  const hasSelected = slot.matches.some((m) => m.id === selectedId);
  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 4 }}
      animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      // Cards higher on the axis fade in fractionally sooner, giving the slate a quick
      // top-to-bottom cascade as each week mounts.
      transition={{
        duration: 0.3,
        ease: [0.22, 1, 0.36, 1],
        delay: reduceMotion ? 0 : Math.min(top / 2400, 0.35),
      }}
      className={cn(
        "bg-card absolute right-0.5 left-0.5 flex flex-col overflow-hidden rounded-[4px] border leading-tight",
        hasLive
          ? "border-red-500/60 ring-1 ring-red-500/50"
          : hasSelected
            ? "border-primary/60 ring-primary/40 ring-1"
            : "border-border/70",
      )}
      style={{ top, ...(single ? { height: durH } : { minHeight: durH }) }}
    >
      <div className="text-muted-foreground border-b px-2 py-0.5 text-center font-mono text-[10px] tabular-nums">
        {timeLabel}
      </div>
      <div className="divide-border/70 flex flex-1 flex-col divide-y">
        {slot.matches.map((m) => (
          <MatchRow key={m.id} match={m} selected={m.id === selectedId} onSelect={onSelect} />
        ))}
      </div>
    </motion.div>
  );
}

function WeekGrid({
  week,
  view,
  selectedId,
  onSelect,
}: {
  week: CalWeek;
  view: CalView;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const { startMin, endMin } = view;
  const bodyHeight = ((endMin - startMin) / 60) * HOUR_PX;
  const hours: number[] = [];
  for (let h = startMin; h <= endMin; h += 60) hours.push(h);
  const toTop = (min: number) => ((min - startMin) / 60) * HOUR_PX;

  // No scroll container: the flex children carry min-w-0 so the grid shrinks to fit at any
  // width (flexbox's default min-width:auto would otherwise spill a few px), and the seven
  // columns size with minmax(0,1fr). Dropping overflow-x:auto also stops it forcing
  // overflow-y:auto, which previously turned the bottom hour label into a phantom scrollbar.
  return (
    <div className="min-w-0">
      {/* Day headers */}
      <div className="flex border-b">
        <div className="shrink-0" style={{ width: GUTTER }} />
        <div className="grid min-w-0 flex-1 grid-cols-7">
          {week.days.map((day) => {
            const isToday = day.dayNum === view.today;
            return (
              <div
                key={day.dayNum}
                className={cn(
                  "border-border/40 border-l px-1 py-1.5 text-center",
                  isToday && "bg-emerald-500/15",
                )}
              >
                <div
                  className={cn(
                    "text-[10px] tracking-wide uppercase",
                    isToday
                      ? "font-medium text-emerald-700 dark:text-emerald-400"
                      : "text-muted-foreground",
                  )}
                >
                  {WEEKDAYS[day.weekday]}
                </div>
                <div className="mt-0.5 flex justify-center">
                  <span
                    className={cn(
                      "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 font-mono text-xs tabular-nums",
                      isToday && "bg-emerald-600 font-semibold text-white",
                    )}
                  >
                    {day.civil.d}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Time grid body */}
      <div className="flex">
        <div className="relative shrink-0" style={{ width: GUTTER, height: bodyHeight }}>
          {hours.map((h) => (
            <div
              key={h}
              className={cn(
                "text-muted-foreground absolute right-1.5 font-mono text-[10px] tabular-nums",
                // Sit just above each hour line (the label's bottom rests on the line),
                // so the last label never pokes below the grid. The first label hangs
                // below its top line instead, so it isn't clipped above the grid.
                h === startMin ? "translate-y-0" : "-translate-y-full",
              )}
              style={{ top: toTop(h) }}
            >
              {fmtHour(view.dayCut + h)}
            </div>
          ))}
        </div>

        <div className="relative min-w-0 flex-1" style={{ height: bodyHeight }}>
          {/* Hour gridlines across all days; the midnight roll-over is emphasized. */}
          {hours.map((h) => {
            const midnight = (view.dayCut + h) % 1440 === 0;
            return (
              <div
                key={h}
                className={cn(
                  "absolute right-0 left-0 border-t",
                  midnight ? "border-foreground/25 border-dashed" : "border-border/40",
                )}
                style={{ top: toTop(h) }}
              />
            );
          })}

          {/* Day columns + match slots */}
          <div className="absolute inset-0 grid grid-cols-7">
            {week.days.map((day) => {
              const isToday = day.dayNum === view.today;
              const showNow =
                day.dayNum === view.nowDay &&
                view.nowShift !== null &&
                view.nowShift >= startMin &&
                view.nowShift <= endMin;
              return (
                <div
                  key={day.dayNum}
                  className={cn(
                    "border-border/40 relative border-l",
                    isToday && "bg-emerald-500/10",
                  )}
                >
                  {showNow && (
                    <div
                      className="absolute right-0 left-0 z-10 border-t border-red-500/70"
                      style={{ top: toTop(view.nowShift!) }}
                    >
                      <span className="absolute -top-[3px] -left-[3px] h-1.5 w-1.5 rounded-full bg-red-500" />
                    </div>
                  )}
                  {day.slots.map((slot) => {
                    // When a slot's real calendar date differs from its column's date,
                    // prefix the time with the slot's own weekday so it's unambiguous —
                    // e.g. the lone evening opener sitting under a morning-dated column.
                    const dayOffset = view.labelByEnd
                      ? slot.clock >= view.dayCut
                        ? -1
                        : 0
                      : slot.clock < view.dayCut
                        ? 1
                        : 0;
                    const timeLabel =
                      (dayOffset !== 0 ? `${WEEKDAYS[(day.weekday + dayOffset + 7) % 7]} ` : "") +
                      fmtClock(slot.clock);
                    return (
                      <SlotCard
                        key={slot.min}
                        slot={slot}
                        timeLabel={timeLabel}
                        top={toTop(slot.min)}
                        single={slot.matches.length === 1}
                        selectedId={selectedId}
                        onSelect={onSelect}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Live overlay. The page renders the openfootball backbone; this polls the
// /api/world-cup/live route (football-data.org behind it) and overlays in-play scores,
// matched by team pair. Names are normalized so the two providers' spellings line up.
interface LiveMatch {
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

const TEAM_ALIAS: Record<string, string> = {
  czechia: "czechrepublic",
  turkiye: "turkey",
  unitedstates: "usa",
  unitedstatesofamerica: "usa",
  korearepublic: "southkorea",
  republicofkorea: "southkorea",
  cotedivoire: "ivorycoast",
  congodr: "drcongo",
  democraticrepublicofthecongo: "drcongo",
  caboverde: "capeverde",
  capeverdeislands: "capeverde", // football-data spelling vs openfootball "Cape Verde"
  bosniaherzegovina: "bosniaandherzegovina", // football-data "-" vs openfootball "&"
  iriran: "iran",
  islamicrepublicofiran: "iran",
};

function teamKey(name: string): string {
  const n = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "");
  return TEAM_ALIAS[n] ?? n;
}
const pairKey = (a: string, b: string) => [teamKey(a), teamKey(b)].sort().join("|");

// Polls the live route and overlays in-play scores/minutes onto the backbone matches.
// Returns matches unchanged when there is no live data (no token, off-season, or fetch
// failure) — the page degrades to the backbone.
//
// Cadence is adaptive and deliberately frugal: every 30s while a match is in play (the
// upstream route caches 30s, so faster would just be wasted), backing off to every 3 min
// when nothing is live. Polling pauses entirely while the browser tab is hidden, and fires
// once immediately when it is refocused — so a backgrounded page makes no requests.
function useLiveOverlay(matches: WcMatch[]): WcMatch[] {
  const [overlay, setOverlay] = useState<Record<string, LiveMatch>>({});

  const times = matches
    .map((m) => (m.kickoff ? new Date(m.kickoff).getTime() : NaN))
    .filter((t) => !Number.isNaN(t));
  const count = times.length;
  const first = count ? Math.min(...times) : 0;
  const last = count ? Math.max(...times) : 0;

  useEffect(() => {
    const DAY = 86_400_000;
    const now = Date.now();
    if (!count || now < first - DAY || now > last + DAY) return; // outside the tournament

    const LIVE_MS = 30_000;
    const IDLE_MS = 180_000;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const run = async () => {
      if (!active || document.hidden) return; // paused; visibilitychange resumes it
      let hasLive = false;
      try {
        const res = await fetch("/api/world-cup/live");
        if (res.ok) {
          const data = (await res.json()) as { matches?: LiveMatch[] };
          if (!active) return;
          const next: Record<string, LiveMatch> = {};
          for (const m of data.matches ?? []) next[pairKey(m.home, m.away)] = m;
          hasLive = (data.matches ?? []).some((m) => m.status === "live");
          setOverlay(next);
        }
      } catch {
        /* keep the last overlay */
      }
      if (!active) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void run(), hasLive ? LIVE_MS : IDLE_MS);
    };

    const onVisibility = () => {
      if (!document.hidden) void run(); // refetch right away when the tab is refocused
    };
    document.addEventListener("visibilitychange", onVisibility);
    void run();

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [count, first, last]);

  if (Object.keys(overlay).length === 0) return matches;
  return matches.map((m) => {
    const info = overlay[pairKey(m.home.name, m.away.name)];
    if (!info) return m;
    const halftime: [number, number] | null =
      info.ht_home != null && info.ht_away != null ? [info.ht_home, info.ht_away] : m.halftime;
    return {
      ...m,
      status: info.status,
      minute: info.minute,
      halftime,
      referee: info.referee ?? m.referee,
      home: { ...m.home, score: info.home_score ?? m.home.score },
      away: { ...m.away, score: info.away_score ?? m.away.score },
    };
  });
}

// --- Match detail panel. Shows everything we hold for one match: scoreboard, half-time,
// goalscorers (from the openfootball backbone, with penalty / own-goal flags), and the
// date / kickoff / venue. Docked to the right of the grid on wide screens, or opened in a
// bottom drawer on narrow ones.
const WD_SUN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatMatchDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return date;
  const wd = weekdayOf(daysFromCivil(y, m, d));
  return `${WD_SUN[wd]} ${MONTHS[m - 1]} ${d}, ${y}`;
}

function MetaRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <dt className="text-muted-foreground shrink-0">{label}</dt>
      <dd className="min-w-0 text-right">{value}</dd>
    </div>
  );
}

// "67" → 67, "90+4" → 90.04, so stoppage-time goals sort after the regular minute.
function parseMinute(min: string): number {
  const [base, extra] = min.split("+");
  return (Number(base) || 0) + (extra ? (Number(extra) || 0) / 100 : 0);
}

// One goal on its team's side of the timeline (home left-aligned, away mirrored right).
function EventRow({ goal, side }: { goal: WcGoal; side: "home" | "away" }) {
  const marks = [goal.penalty ? "P" : null, goal.owngoal ? "OG" : null].filter(Boolean).join(", ");
  const line = (
    <span
      className={cn(
        "inline-flex min-w-0 items-center gap-1.5",
        side === "away" && "flex-row-reverse",
      )}
    >
      <span className="bg-foreground/60 size-1.5 shrink-0 rounded-full" />
      <span className="text-muted-foreground shrink-0 font-mono tabular-nums">
        {goal.minute}&apos;
      </span>
      <span className="truncate">
        {goal.name}
        {marks && <span className="text-muted-foreground"> ({marks})</span>}
      </span>
    </span>
  );
  return (
    <li className="grid grid-cols-2 gap-2">
      <span className="flex min-w-0">{side === "home" && line}</span>
      <span className="flex min-w-0 justify-end">{side === "away" && line}</span>
    </li>
  );
}

function HtDivider({ ht }: { ht: [number, number] | null }) {
  return (
    <li className="text-muted-foreground flex items-center gap-2 py-0.5 text-[10px] tracking-wide uppercase">
      <span className="bg-border h-px flex-1" />
      <span className="font-mono tabular-nums">Half-time{ht ? ` ${ht[0]}–${ht[1]}` : ""}</span>
      <span className="bg-border h-px flex-1" />
    </li>
  );
}

// Goal timeline for both teams, merged and sorted by minute, with a half-time divider
// dropped in at the break.
function MatchEvents({ match }: { match: WcMatch }) {
  const events = [
    ...match.home.goals.map((g) => ({ g, side: "home" as const })),
    ...match.away.goals.map((g) => ({ g, side: "away" as const })),
  ].sort((a, b) => parseMinute(a.g.minute) - parseMinute(b.g.minute));

  if (events.length === 0) {
    return (
      <p className="text-muted-foreground py-6 text-center text-xs">
        {match.status === "upcoming" ? "Not started yet." : "No goals."}
      </p>
    );
  }

  const rows: ReactNode[] = [];
  let htShown = false;
  events.forEach((e, i) => {
    if (!htShown && parseMinute(e.g.minute) >= 46) {
      rows.push(<HtDivider key="ht" ht={match.halftime} />);
      htShown = true;
    }
    rows.push(<EventRow key={i} goal={e.g} side={e.side} />);
  });
  if (!htShown && match.halftime) rows.push(<HtDivider key="ht" ht={match.halftime} />);

  return <ol className="space-y-2 text-xs">{rows}</ol>;
}

// Compact group table for the Standings tab, with the match's two teams emphasised.
function MiniStandings({ table, teams }: { table: WcGroupTable; teams: string[] }) {
  return (
    <table className="w-full border-collapse text-xs">
      <thead>
        <tr className="text-muted-foreground text-[10px] tracking-wide uppercase">
          <th className="w-4 py-1 pr-1 text-left font-medium" aria-label="Position" />
          <th className="py-1 text-left font-medium">Team</th>
          <th className="w-6 py-1 text-right font-medium">P</th>
          <th className="w-8 py-1 text-right font-medium">GD</th>
          <th className="w-8 py-1 text-right font-medium">Pts</th>
        </tr>
      </thead>
      <tbody>
        {table.standings.map((s, i) => {
          const here = teams.includes(s.team);
          return (
            <tr
              key={s.team}
              className={cn(
                "border-border/60 border-t",
                i < 2 && "bg-emerald-500/10",
                here && "bg-primary/10",
              )}
            >
              <td className="text-muted-foreground py-1 pr-1 font-mono text-[11px]">{i + 1}</td>
              <td className="py-1">
                <span className="flex min-w-0 items-center gap-1.5">
                  <TeamFlag name={s.team} className="h-3 w-4" />
                  <span className={cn("truncate", here && "font-semibold")}>{s.team}</span>
                </span>
              </td>
              <td className="py-1 text-right font-mono tabular-nums">{s.played}</td>
              <td className="py-1 text-right font-mono tabular-nums">
                {s.gd > 0 ? `+${s.gd}` : s.gd}
              </td>
              <td className="py-1 text-right font-mono font-semibold tabular-nums">{s.points}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function MatchDetail({
  match,
  groups,
  onClose,
}: {
  match: WcMatch | null;
  groups: WcGroupTable[];
  onClose?: () => void;
}) {
  const reduceMotion = useReducedMotion();

  if (!match) {
    return (
      <div className="text-muted-foreground flex h-full min-h-40 flex-col items-center justify-center px-6 py-10 text-center text-sm">
        <p>Select a match to see the score, scorers, half-time, standings and kickoff.</p>
      </div>
    );
  }

  const finished = match.status === "finished";
  const live = match.status === "live";
  const played = finished || live;
  const hs = match.home.score ?? 0;
  const as = match.away.score ?? 0;
  const homeWon = finished && hs > as;
  const awayWon = finished && as > hs;
  const type = match.group ?? STAGE_LABEL[match.stage];
  const table = match.group ? (groups.find((g) => g.group === match.group) ?? null) : null;

  const status = live ? (
    <span className="inline-flex items-center gap-1.5 text-red-500">
      <span className="size-1.5 rounded-full bg-red-500 motion-safe:animate-pulse" />
      {match.minute != null ? `Live · ${match.minute}'` : "Live"}
    </span>
  ) : finished ? (
    <span className="text-muted-foreground">Full time</span>
  ) : (
    <span className="text-muted-foreground">Upcoming</span>
  );

  const teamBlock = (side: WcSide, won: boolean) => (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-2 text-center">
      <TeamFlag name={side.name} className="h-8 w-12" />
      <span
        className={cn(
          "text-sm leading-tight",
          won && "font-semibold",
          side.placeholder && "text-muted-foreground",
        )}
      >
        {side.name}
      </span>
    </div>
  );

  return (
    <motion.div
      key={match.id}
      initial={reduceMotion ? false : { opacity: 0, y: 6 }}
      animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col gap-4"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-muted-foreground font-mono text-[11px] tracking-wide uppercase">
            {type}
          </p>
          <p className="mt-1 text-xs font-medium">{status}</p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close details"
            className="text-muted-foreground hover:text-foreground -mt-1 -mr-1 shrink-0 rounded p-1"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="bg-muted/40 flex items-center gap-2 rounded-lg border p-4">
        {teamBlock(match.home, homeWon)}
        <div className="flex shrink-0 flex-col items-center px-1">
          <span className="font-mono text-2xl font-semibold tabular-nums">
            {played ? `${hs} - ${as}` : <span className="text-muted-foreground text-lg">v</span>}
          </span>
          {match.halftime && (
            <span className="text-muted-foreground mt-1 font-mono text-[10px] tracking-wide uppercase tabular-nums">
              HT {match.halftime[0]}–{match.halftime[1]}
            </span>
          )}
        </div>
        {teamBlock(match.away, awayWon)}
      </div>

      <Tabs defaultValue="summary" className="gap-3">
        <TabsList variant="line" className="h-auto w-full justify-start gap-4 p-0">
          <TabsTrigger value="summary" className="flex-none px-0">
            Summary
          </TabsTrigger>
          {table && (
            <TabsTrigger value="standings" className="flex-none px-0">
              Standings
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="summary" className="flex flex-col gap-4">
          <MatchEvents match={match} />
          <dl className="divide-border/60 divide-y border-t text-xs">
            <MetaRow label="Date" value={formatMatchDate(match.date)} />
            <MetaRow label="Kickoff" value={<KickoffTime iso={match.kickoff} />} />
            {match.venue && <MetaRow label="Venue" value={match.venue} />}
            {match.referee && <MetaRow label="Referee" value={match.referee} />}
            <MetaRow label="Round" value={match.round} />
          </dl>
        </TabsContent>

        {table && (
          <TabsContent value="standings">
            <p className="text-muted-foreground mb-2 font-mono text-[10px] tracking-wide uppercase">
              {match.group} · top 2 advance
            </p>
            <MiniStandings table={table} teams={[match.home.name, match.away.name]} />
          </TabsContent>
        )}
      </Tabs>
    </motion.div>
  );
}

// A compact banner of the matches in play right now, shown above the grid so the live
// fixtures are visible from any week. Each chip selects the match (opening the detail).
function LiveStrip({
  matches,
  selectedId,
  onSelect,
}: {
  matches: WcMatch[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const live = matches.filter((m) => m.status === "live");
  if (live.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-2.5 sm:px-6 lg:px-8">
      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-red-500 uppercase">
        <span className="h-1.5 w-1.5 rounded-full bg-red-500 motion-safe:animate-pulse" />
        Live now
      </span>
      <div className="flex flex-wrap gap-1.5">
        {live.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => onSelect(m.id)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
              m.id === selectedId
                ? "border-primary/60 bg-primary/10"
                : "border-border hover:bg-muted/60",
            )}
          >
            <TeamFlag name={m.home.name} className="h-3 w-4" />
            <span className="font-medium tabular-nums">
              {teamAbbr(m.home.name)} {m.home.score ?? 0}–{m.away.score ?? 0}{" "}
              {teamAbbr(m.away.name)}
            </span>
            <TeamFlag name={m.away.name} className="h-3 w-4" />
            {m.minute != null && (
              <span className="text-muted-foreground font-mono">{m.minute}&apos;</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

// Default detail when nothing is picked: the soonest upcoming match, or the most recent
// once they have all kicked off. (A live match takes priority over this in the caller.)
// Reads the clock itself — a plain helper, so it stays out of the component's render purity.
function pickDefaultMatch(matches: WcMatch[]): WcMatch | null {
  const now = Date.now();
  const timed = matches
    .filter((m) => m.kickoff)
    .map((m) => ({ m, t: new Date(m.kickoff as string).getTime() }))
    .filter((x) => !Number.isNaN(x.t));
  if (timed.length === 0) return null;
  const upcoming = timed.filter((x) => x.t >= now).sort((a, b) => a.t - b.t);
  if (upcoming.length) return upcoming[0].m;
  return timed.sort((a, b) => b.t - a.t)[0].m;
}

export function ScheduleCalendar({
  matches,
  groups,
}: {
  matches: WcMatch[];
  groups: WcGroupTable[];
}) {
  const hydrated = useHydrated();
  const liveMatches = useLiveOverlay(matches);
  const view = buildView(liveMatches, hydrated);
  const weeks = view?.weeks ?? [];

  // Null until the user navigates. Before that the calendar opens on the current week
  // (known only once hydrated reveals the local date), otherwise on the first week —
  // a pure derivation, so no set-state-in-effect and no SSR/client mismatch.
  const [selected, setSelected] = useState<number | null>(null);

  // Index of the week containing "today", or -1 when today is outside the tournament.
  const todayIndex =
    view && view.today !== null
      ? weeks.findIndex((w) => view.today! >= w.start && view.today! <= w.start + 6)
      : -1;

  const lastIndex = Math.max(0, weeks.length - 1);
  const safeIndex = Math.min(
    Math.max(0, selected ?? (todayIndex >= 0 ? todayIndex : 0)),
    lastIndex,
  );
  const week = weeks[safeIndex];

  // Match-detail selection, independent of the week navigation above. The docked panel
  // (xl and up) shows the picked match, falling back to whatever is in play; on narrower
  // screens an explicit pick opens the same panel in a bottom drawer.
  const isWide = useIsWide();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedMatch =
    selectedId != null ? (liveMatches.find((m) => m.id === selectedId) ?? null) : null;
  const liveMatch = liveMatches.find((m) => m.status === "live") ?? null;
  // Default the panel to the live match, else the next/most-recent one. The time-based
  // pick is deferred until hydration so it never differs between server and client render.
  const defaultMatch = liveMatch ?? (hydrated ? pickDefaultMatch(liveMatches) : null);
  const panelMatch = selectedMatch ?? defaultMatch;

  return (
    <section id="schedule">
      <div className="mx-auto w-full max-w-[1600px] border-x">
        <div className="flex items-baseline justify-between border-b px-4 py-4 sm:px-6 sm:py-5 lg:px-8">
          <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">Schedule</h2>
          <span className="text-muted-foreground text-xs">Times in your timezone</span>
        </div>

        <LiveStrip matches={liveMatches} selectedId={selectedId} onSelect={setSelectedId} />

        {!view ? (
          <p className="text-muted-foreground px-4 py-8 text-sm italic sm:px-6 lg:px-8">
            The schedule is not available right now.
          </p>
        ) : (
          <>
            {/* Week navigation */}
            <div className="flex items-center justify-between gap-2 border-b px-4 py-2.5 sm:px-6 lg:px-8">
              <div className="flex min-w-0 items-baseline gap-2">
                <span className="truncate text-sm font-medium">{weekLabel(week)}</span>
                <span className="text-muted-foreground shrink-0 font-mono text-xs tabular-nums">
                  {safeIndex + 1}/{weeks.length}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {todayIndex >= 0 && (
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => setSelected(todayIndex)}
                    disabled={safeIndex === todayIndex}
                  >
                    Today
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="icon-xs"
                  aria-label="Previous week"
                  onClick={() => setSelected(Math.max(0, safeIndex - 1))}
                  disabled={safeIndex === 0}
                >
                  <ChevronLeft />
                </Button>
                <Button
                  variant="outline"
                  size="icon-xs"
                  aria-label="Next week"
                  onClick={() => setSelected(Math.min(lastIndex, safeIndex + 1))}
                  disabled={safeIndex === lastIndex}
                >
                  <ChevronRight />
                </Button>
              </div>
            </div>

            <p className="text-muted-foreground border-b px-4 py-2.5 text-[11px] sm:px-6 lg:px-8">
              Blocks span 105′ (45 + 15 + 45). Finished matches are tinted with the winner&apos;s
              colour. Tap a match for details.
            </p>
            <div className="xl:flex xl:items-stretch xl:divide-x">
              <div className="min-w-0 xl:flex-1">
                <div className="px-2 py-3 sm:px-3 lg:px-4">
                  <WeekGrid
                    week={week}
                    view={view}
                    selectedId={selectedId}
                    onSelect={setSelectedId}
                  />
                </div>

                {view.tbd.length > 0 && (
                  <div className="border-t px-4 py-4 sm:px-6 lg:px-8">
                    <h3 className="text-muted-foreground mb-2 font-mono text-[11px] tracking-wide uppercase">
                      Time to be confirmed
                    </h3>
                    <ul className="text-muted-foreground space-y-1 text-xs">
                      {view.tbd.map((m) => (
                        <li key={m.id} className="truncate">
                          {STAGE_LABEL[m.stage]} · {m.home.name} v {m.away.name}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Docked detail panel — xl and up. */}
              <aside className="hidden w-84 shrink-0 xl:block">
                <div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto p-4">
                  <MatchDetail
                    match={panelMatch}
                    groups={groups}
                    onClose={selectedMatch ? () => setSelectedId(null) : undefined}
                  />
                </div>
              </aside>
            </div>
          </>
        )}
      </div>

      {/* Narrow screens: the same detail opens in a bottom drawer. */}
      <Drawer
        open={selectedMatch != null && !isWide}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      >
        <DrawerContent>
          <DrawerTitle className="sr-only">Match details</DrawerTitle>
          <DrawerDescription className="sr-only">
            Score, scorers and details for the selected match.
          </DrawerDescription>
          <div className="overflow-y-auto px-4 pt-2 pb-8">
            <MatchDetail match={selectedMatch} groups={groups} />
          </div>
        </DrawerContent>
      </Drawer>
    </section>
  );
}
