import { GitCommitVertical } from "lucide-react";

import { PageHeader } from "@repo/core/components/layouts/page-header";
import { CHANGELOG } from "@repo/core/constants";

function formatDate(value: string): string {
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default function ChangelogPage() {
  return (
    <>
      <PageHeader title="Changelog" />
      <article className="mx-auto flex w-full max-w-4xl flex-1 flex-col border-x">
        <ol className="divide-y">
          {CHANGELOG.map((entry) => (
            <li key={entry.date} className="px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
              <time dateTime={entry.date} className="text-muted-foreground font-mono text-xs">
                {formatDate(entry.date)}
              </time>

              <ul className="relative mt-4">
                {entry.changes.map((change, i) => (
                  <li key={i} className="relative flex items-center gap-3 pb-4 last:pb-0">
                    <GitCommitVertical
                      className="text-muted-foreground bg-background relative z-10 size-5 shrink-0"
                      aria-hidden="true"
                    />
                    <p className="text-muted-foreground pt-0.5 text-sm leading-relaxed sm:text-base">
                      {change}
                    </p>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </article>
    </>
  );
}
