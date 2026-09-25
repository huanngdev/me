"use client";

import { useState } from "react";
import { useReducedMotion } from "framer-motion";
import {
  ArrowUpRight,
  BookmarkIcon,
  BookOpenText,
  ChevronDown,
  PanelsTopLeft,
  Sparkles,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import { BOOKMARKS, BOOKMARK_TAGS, type BookmarkEntry } from "../../constants";
import { cn } from "../../lib/utils";
import { Button } from "../button";
import { StaggerList, StaggerListItem } from "../reveal";
import { SectionHeading } from "./section-heading";
import { useBookmarkFilter, type BookmarkFilter } from "./use-bookmark-filter";

const VISIBLE_COUNT = 5;
const BOOKMARK_TAG_ICONS: Record<BookmarkFilter, LucideIcon> = {
  all: BookmarkIcon,
  ui: PanelsTopLeft,
  ai: Sparkles,
  articles: BookOpenText,
  tools: Wrench,
};

type BookmarkFilterButtonProps = {
  active: boolean;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
};

function BookmarkFilterButton({ active, icon: Icon, label, onClick }: BookmarkFilterButtonProps) {
  return (
    <Button
      type="button"
      variant={active ? "secondary" : "outline"}
      size="default"
      aria-pressed={active}
      onClick={onClick}
    >
      <Icon className="opacity-50" aria-hidden="true" />
      {label}
    </Button>
  );
}

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
      {/* eslint-disable-next-line @next/next/no-img-element -- Small favicons are not worth remote image configuration. */}
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
  const [expandedFor, setExpandedFor] = useState<BookmarkFilter | null>(null);
  const reduceMotion = useReducedMotion();
  const { activeTag, setActiveTag } = useBookmarkFilter();

  const filteredItems =
    activeTag === "all" ? items : items.filter((bookmark) => bookmark.tags.includes(activeTag));
  const canExpand = filteredItems.length > VISIBLE_COUNT;
  const expanded = expandedFor === activeTag;
  const visibleItems = expanded ? filteredItems : filteredItems.slice(0, VISIBLE_COUNT);

  return (
    <section id="bookmarks">
      <div className="mx-auto w-full max-w-4xl border-x">
        <SectionHeading title="Bookmarks" count={filteredItems.length} />

        {items.length === 0 ? (
          <p className="text-muted-foreground px-4 py-6 text-sm italic sm:px-6 sm:py-8 lg:px-8">
            No bookmarks yet.
          </p>
        ) : (
          <>
            <div className="space-y-2 border-b px-4 py-3 sm:px-6 sm:py-4 lg:px-8">
              <p className="text-muted-foreground font-mono text-[11px]">Browse by tag</p>
              <div
                className="flex flex-wrap gap-1.5"
                role="group"
                aria-label="Filter bookmarks by tag"
              >
                <BookmarkFilterButton
                  active={activeTag === "all"}
                  icon={BOOKMARK_TAG_ICONS.all}
                  label="All"
                  onClick={() => {
                    setExpandedFor(null);
                    setActiveTag("all");
                  }}
                />
                {BOOKMARK_TAGS.map((tag) => (
                  <BookmarkFilterButton
                    key={tag.value}
                    active={activeTag === tag.value}
                    icon={BOOKMARK_TAG_ICONS[tag.value]}
                    label={tag.label}
                    onClick={() => {
                      setExpandedFor(null);
                      setActiveTag(tag.value);
                    }}
                  />
                ))}
              </div>
            </div>

            {filteredItems.length === 0 ? (
              <p className="text-muted-foreground px-4 py-6 text-sm italic sm:px-6 sm:py-8 lg:px-8">
                No bookmarks with this tag.
              </p>
            ) : (
              <>
                <StaggerList className="grid sm:grid-cols-2" layout={!reduceMotion}>
                  {visibleItems.map((bookmark, index) => (
                    <StaggerListItem
                      key={bookmark.url}
                      layout={!reduceMotion}
                      className={cn("border-b", index % 2 === 0 && "sm:border-r")}
                    >
                      <a
                        href={bookmark.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        aria-label={`Visit ${bookmark.title}`}
                        className="group hover:bg-muted/30 flex h-full min-h-40 flex-col justify-between gap-5 px-4 py-4 transition-colors duration-200 sm:px-5 sm:py-5 lg:px-6"
                      >
                        <div className="flex min-w-0 items-start justify-between gap-3">
                          <div className="flex min-w-0 items-start gap-3">
                            <div className="transition-transform duration-200 ease-out group-hover:scale-105 motion-reduce:transition-none">
                              <FaviconBadge source={bookmark.source} title={bookmark.title} />
                            </div>
                            <div className="min-w-0">
                              <h3 className="line-clamp-2 text-sm font-semibold tracking-tight transition-transform duration-200 ease-out group-hover:translate-x-0.5 motion-reduce:transition-none sm:text-base">
                                {bookmark.title}
                              </h3>
                              <p className="text-muted-foreground mt-1 truncate font-mono text-[11px]">
                                {bookmark.source}
                              </p>
                            </div>
                          </div>

                          <span className="border-border flex size-8 shrink-0 items-center justify-center rounded-full border transition-transform duration-200 ease-out group-hover:translate-x-0.5 group-hover:-translate-y-0.5 motion-reduce:transition-none">
                            <ArrowUpRight className="size-4" aria-hidden="true" />
                          </span>
                        </div>

                        <div className="flex flex-wrap items-end justify-between gap-3">
                          <ul
                            className="flex flex-wrap gap-1.5"
                            aria-label={`${bookmark.title} tags`}
                          >
                            {bookmark.tags.map((tagValue) => {
                              const tag = BOOKMARK_TAGS.find((item) => item.value === tagValue);
                              if (!tag) return null;
                              const Icon = BOOKMARK_TAG_ICONS[tag.value];

                              return (
                                <li
                                  key={tag.value}
                                  className="bg-muted/50 text-muted-foreground inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 font-mono text-[10px]"
                                >
                                  <Icon className="size-3 opacity-50" aria-hidden="true" />
                                  {tag.label}
                                </li>
                              );
                            })}
                          </ul>

                          <time
                            dateTime={bookmark.date}
                            className="text-muted-foreground font-mono text-[11px] tabular-nums"
                          >
                            {formatBookmarkDate(bookmark.date)}
                          </time>
                        </div>
                      </a>
                    </StaggerListItem>
                  ))}
                </StaggerList>

                {canExpand && (
                  <button
                    type="button"
                    onClick={() => setExpandedFor(expanded ? null : activeTag)}
                    aria-expanded={expanded}
                    className="text-muted-foreground hover:bg-muted/30 hover:text-foreground flex min-h-11 w-full items-center justify-center gap-2 px-4 py-3 font-mono text-xs transition-colors duration-200"
                  >
                    {expanded ? "Show less" : `Show ${filteredItems.length - VISIBLE_COUNT} more`}
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
          </>
        )}
      </div>
    </section>
  );
}
