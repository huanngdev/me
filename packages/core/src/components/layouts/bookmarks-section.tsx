"use client";

import { useState } from "react";
import { useReducedMotion } from "framer-motion";
import { ArrowUpRight, BookmarkIcon, ChevronDown } from "lucide-react";

import { BOOKMARKS, type BookmarkEntry } from "../../constants";
import { cn } from "../../lib/utils";
import { StaggerList, StaggerListItem } from "../reveal";
import { SectionHeading } from "./section-heading";

const VISIBLE_COUNT = 4;

function formatBookmarkDate(value: string): string {
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  return date.toLocaleDateString("en-US", {
    month: "short",
    ...(d ? { day: "numeric" } : {}),
    year: "numeric",
    timeZone: "UTC",
  });
}

function FaviconBadge({ source, title }: { source: string; title: string }) {
  return (
    <div className="bg-muted/30 relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md">
      <BookmarkIcon className="text-muted-foreground absolute size-4" aria-hidden="true" />
      {/* eslint-disable-next-line @next/next/no-img-element -- 20px favicon, not worth next/image remote config */}
      <img
        src={`https://www.google.com/s2/favicons?domain=${source}&sz=128`}
        alt=""
        aria-hidden="true"
        loading="lazy"
        width={20}
        height={20}
        className="relative size-5"
      />
      <span className="sr-only">{title}</span>
    </div>
  );
}

export function BookmarksSection() {
  const items: ReadonlyArray<BookmarkEntry> = BOOKMARKS;
  const [expanded, setExpanded] = useState(false);
  const reduceMotion = useReducedMotion();
  const canExpand = items.length > VISIBLE_COUNT;
  const visibleItems = expanded ? items : items.slice(0, VISIBLE_COUNT);

  return (
    <section id="bookmarks">
      <div className="mx-auto w-full max-w-4xl border-x">
        <SectionHeading title="Bookmarks" count={items.length} />

        {items.length === 0 ? (
          <p className="text-muted-foreground px-4 py-6 text-sm italic sm:px-6 sm:py-8 lg:px-8">
            No bookmarks yet.
          </p>
        ) : (
          <>
            <StaggerList layout={!reduceMotion}>
              {visibleItems.map((bookmark, index) => (
                <StaggerListItem key={bookmark.url} layout={!reduceMotion} className="border-b">
                  <a
                    href={bookmark.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    aria-label={`Visit ${bookmark.title}`}
                    className="group hover:bg-muted/30 grid min-h-20 grid-cols-[1.75rem_2.5rem_1fr_auto] items-center gap-3 px-4 py-3 transition-colors duration-200 sm:grid-cols-[2rem_2.5rem_1fr_auto_auto] sm:px-6 sm:py-4 lg:px-8"
                  >
                    <span className="text-muted-foreground font-mono text-[11px] tabular-nums">
                      {String(index + 1).padStart(2, "0")}
                    </span>

                    <div className="transition-transform duration-200 ease-out group-hover:scale-105 motion-reduce:transition-none">
                      <FaviconBadge source={bookmark.source} title={bookmark.title} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-sm font-semibold tracking-tight transition-transform duration-200 ease-out group-hover:translate-x-0.5 motion-reduce:transition-none sm:text-base">
                        {bookmark.title}
                      </h3>
                      <p className="text-muted-foreground mt-0.5 truncate font-mono text-[11px]">
                        {bookmark.source}
                      </p>
                    </div>

                    <time
                      dateTime={bookmark.date}
                      className="text-muted-foreground hidden font-mono text-[11px] tabular-nums sm:block"
                    >
                      {formatBookmarkDate(bookmark.date)}
                    </time>

                    <span className="border-border flex size-8 items-center justify-center rounded-full border transition-transform duration-200 ease-out group-hover:translate-x-0.5 group-hover:-translate-y-0.5 motion-reduce:transition-none">
                      <ArrowUpRight className="size-4" aria-hidden="true" />
                    </span>
                  </a>
                </StaggerListItem>
              ))}
            </StaggerList>

            {canExpand && (
              <button
                type="button"
                onClick={() => setExpanded((value) => !value)}
                aria-expanded={expanded}
                className="text-muted-foreground hover:bg-muted/30 hover:text-foreground flex w-full items-center justify-center gap-2 px-4 py-3 font-mono text-xs transition-colors duration-200"
              >
                {expanded ? "Show less" : `Show ${items.length - VISIBLE_COUNT} more`}
                <ChevronDown
                  className={cn(
                    "size-3.5 transition-transform duration-200 ease-out motion-reduce:transition-none",
                    expanded && "rotate-180",
                  )}
                  aria-hidden="true"
                />
              </button>
            )}
          </>
        )}
      </div>
    </section>
  );
}
