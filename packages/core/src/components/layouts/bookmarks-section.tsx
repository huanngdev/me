import { ArrowUpRight, BookmarkIcon } from "lucide-react";

import { BOOKMARKS, type BookmarkEntry } from "../../constants";
import { cn } from "../../lib/utils";

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
  const lastRowStart = items.length - (items.length % 2 || 2);

  return (
    <section id="bookmarks">
      <div className="mx-auto w-full max-w-4xl border-x">
        <h2 className="border-b px-4 py-4 text-xl font-semibold tracking-tight sm:px-6 sm:py-5 sm:text-2xl lg:px-8">
          Bookmarks
        </h2>

        {items.length === 0 ? (
          <p className="text-muted-foreground px-4 py-6 text-sm italic sm:px-6 sm:py-8 lg:px-8">
            No bookmarks yet.
          </p>
        ) : (
          <ul className="grid grid-cols-2">
            {items.map((bookmark, i) => (
              <li
                key={bookmark.url}
                className={cn(i < lastRowStart && "border-b", i % 2 !== 1 && "border-r")}
              >
                <a
                  href={bookmark.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  aria-label={`Visit ${bookmark.title}`}
                  className="group hover:bg-muted/40 flex h-full items-start gap-3 p-4 transition-colors"
                >
                  <FaviconBadge source={bookmark.source} title={bookmark.title} />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-2">
                      <h3 className="flex-1 text-sm font-semibold tracking-tight sm:text-base">
                        {bookmark.title}
                      </h3>
                      <ArrowUpRight
                        className="text-muted-foreground mt-1 size-4 shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                        aria-hidden="true"
                      />
                    </div>
                    <p className="text-muted-foreground mt-0.5 text-sm">{bookmark.source}</p>
                    <p className="text-muted-foreground mt-1 font-mono text-xs">
                      {formatBookmarkDate(bookmark.date)}
                    </p>
                  </div>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
