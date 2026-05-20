"use client";

import { BookMarkedIcon, GitCommitVerticalIcon, StarIcon, UsersIcon } from "lucide-react";
import { use } from "react";

import type { GitHubStatsData } from "../../../lib/get-cached-github-stats";

const NUM = new Intl.NumberFormat("en");

const FIELDS = [
  { key: "commits", label: "Commits", Icon: GitCommitVerticalIcon },
  { key: "repos", label: "Repos", Icon: BookMarkedIcon },
  { key: "stars", label: "Stars", Icon: StarIcon },
  { key: "followers", label: "Followers", Icon: UsersIcon },
] as const satisfies ReadonlyArray<{
  key: keyof GitHubStatsData;
  label: string;
  Icon: typeof StarIcon;
}>;

export function GitHubStats({ stats }: { stats: Promise<GitHubStatsData> }) {
  const data = use(stats);
  return (
    <dl className="divide-border flex divide-x">
      {FIELDS.map(({ key, label, Icon }) => (
        <div key={label} className="flex flex-1 flex-col items-start gap-1 px-3 py-2 font-mono">
          <dt className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <Icon className="size-3.5" />
            {label}
          </dt>
          <dd className="text-base font-medium tracking-tight tabular-nums">
            {NUM.format(data[key])}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function GitHubStatsFallback() {
  return (
    <dl className="divide-border flex divide-x">
      {FIELDS.map(({ label, Icon }) => (
        <div key={label} className="flex flex-1 flex-col items-start gap-1 px-3 py-2 font-mono">
          <dt className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <Icon className="size-3.5" />
            {label}
          </dt>
          <dd className="text-muted-foreground text-base font-medium tabular-nums">—</dd>
        </div>
      ))}
    </dl>
  );
}
