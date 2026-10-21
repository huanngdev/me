import type { ComponentDocs } from "./types";

export const DOCS: ComponentDocs = {
  keywords: ["github", "contributions", "heatmap", "activity", "calendar", "three.js", "graph"],
  usage: `"use client";

import { GitHubContributions3D } from "@/components/github-contributions-3d";

const contributions = [
  { date: "2026-01-04", count: 0, level: 0 },
  { date: "2026-01-05", count: 3, level: 2 },
  { date: "2026-01-06", count: 8, level: 4 },
] as const;

export function Example() {
  return (
    <GitHubContributions3D
      data={[...contributions]}
      name="shadcn"
      variant="night-rainbow"
    />
  );
}`,
  examples: [],
  props: [
    {
      name: "name",
      type: "string",
      default: "—",
      description: "The account name shown beside the contribution date range.",
    },
    {
      name: "data",
      type: "ContributionDay[]",
      default: "—",
      description: "Daily contribution records in chronological or unsorted order.",
    },
    {
      name: "variant",
      type: "ContributionVariant",
      default: '"green"',
      description: "The palette and canvas surface used by the block graph.",
    },
    {
      name: "className",
      type: "string",
      default: "—",
      description: "Classes applied to the canvas container.",
    },
  ],
  types: `type ContributionDay = {
  date: string;
  count: number;
  level: 0 | 1 | 2 | 3 | 4;
};

type ContributionVariant =
  | "green"
  | "season"
  | "night-view"
  | "night-green"
  | "night-rainbow"
  | "gitblock";

type GitHubContributions3DProps = {
  data: ContributionDay[];
  name: string;
  variant?: ContributionVariant;
  className?: string;
};`,
  notes: [],
};
