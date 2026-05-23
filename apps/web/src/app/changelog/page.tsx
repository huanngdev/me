import { ArrowLeft, GitCommitVertical } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@repo/core/components/button";
import { Footer } from "@repo/core/components/layouts/footer";
import { CHANGELOG } from "@repo/core/constants";
import { Separator } from "@repo/core/components/separator";

export const metadata: Metadata = {
  title: "Changelog",
  description: "Big shipping milestones for this portfolio — newest first.",
  alternates: { canonical: "/changelog" },
  openGraph: {
    title: "Changelog",
    description: "Big shipping milestones for this portfolio — newest first.",
    type: "article",
  },
};

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
      <article className="mx-auto flex min-h-[calc(100dvh-3.75rem)] max-w-4xl flex-col border-x">
        <div className="border-b px-4 py-3 sm:px-6 lg:px-8">
          <Button asChild variant="ghost" size="sm">
            <Link href="/">
              <ArrowLeft className="size-4" />
              Back
            </Link>
          </Button>
        </div>

        <header className="px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Changelog</h1>
        </header>
        <Separator />

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
      <Footer />
    </>
  );
}
