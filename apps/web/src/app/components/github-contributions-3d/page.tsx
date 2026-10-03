import { readFileSync } from "node:fs";
import path from "node:path";

import type { Metadata } from "next";
import type { ReactNode } from "react";

import { CodeBlock } from "@repo/core/components/code-block";
import { ComponentDemo } from "@repo/core/components/component-demo";
import type { ContributionDay } from "@repo/core/components/github-contributions-3d";
import { PageHeader } from "@repo/core/components/layouts/page-header";
import { Separator } from "@repo/core/components/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/core/components/table";
import { TerminalBlock } from "@repo/core/components/terminal-block";
import { TOCMinimap, type TOCItemType } from "@repo/core/components/toc-minimap";
import { getCachedContributions } from "@repo/core/functions";

import { readLlmsDocument } from "@/lib/read-llms-document";

import { GitHubContributions3DDemo } from "./demo";

const LLM_TEXT = readLlmsDocument("components", "github-contributions-3d");

const REPO_ROOT = process.cwd().endsWith("apps/web")
  ? path.resolve(process.cwd(), "../..")
  : process.cwd();
const SOURCE = readFileSync(
  path.join(REPO_ROOT, "packages/core/src/components/github-contributions-3d.tsx"),
  "utf8",
);
const UTILS_SOURCE = readFileSync(
  path.join(REPO_ROOT, "packages/core/src/components/github-contributions-3d.utils.ts"),
  "utf8",
);

const TOC: TOCItemType[] = [
  { title: "Demo", url: "#demo", depth: 2 },
  { title: "Install", url: "#install", depth: 2 },
  { title: "Usage", url: "#usage", depth: 2 },
  { title: "Props", url: "#props", depth: 2 },
  { title: "Types", url: "#types", depth: 2 },
];

export const metadata: Metadata = {
  title: "GitHub Contributions 3D",
  description: "Render a GitHub contribution calendar as an interactive 3D block graph.",
  alternates: { canonical: "/components/github-contributions-3d" },
  openGraph: {
    title: "GitHub Contributions 3D",
    description: "Render a GitHub contribution calendar as an interactive 3D block graph.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "GitHub Contributions 3D",
    description: "Render a GitHub contribution calendar as an interactive 3D block graph.",
  },
};

const USAGE_CODE = `"use client";

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
}`;

const TYPES_CODE = `type ContributionDay = {
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
};`;

const PROPS = [
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
];

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title?: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="scroll-mt-24 p-4 sm:p-6" id={id}>
      {title && <h2 className="text-lg font-medium">{title}</h2>}
      {description && <p className="text-muted-foreground mt-1 text-sm">{description}</p>}
      <div className={title ? "mt-4" : undefined}>{children}</div>
    </section>
  );
}

const isContributionLevel = (level: number): level is ContributionDay["level"] =>
  level === 0 || level === 1 || level === 2 || level === 3 || level === 4;

export default async function GitHubContributions3DPage() {
  const initialData = (await getCachedContributions("shadcn")).flatMap((day) =>
    isContributionLevel(day.level) ? [{ ...day, level: day.level }] : [],
  );

  return (
    <>
      <div
        aria-label="Section navigation"
        className="pointer-events-none fixed top-1/2 left-4 z-30 hidden -translate-y-1/2 xl:block"
      >
        <div className="pointer-events-auto">
          <TOCMinimap items={TOC} />
        </div>
      </div>

      <PageHeader
        title="GitHub Contributions 3D"
        description="Turn a contribution calendar into an interactive 3D block graph."
      />

      <article className="mx-auto flex w-full max-w-4xl flex-1 flex-col border-x">
        <Section id="demo">
          <ComponentDemo llm={LLM_TEXT} code={USAGE_CODE} previewClassName="max-w-4xl">
            <GitHubContributions3DDemo initialData={initialData} />
          </ComponentDemo>
        </Section>
        <Separator />

        <Section
          id="install"
          title="Install"
          description="Install the renderer, then copy the component."
        >
          <div className="space-y-6">
            <TerminalBlock command="bun add three @react-three/fiber @react-three/drei" />
            <div className="space-y-2">
              <p className="text-muted-foreground text-sm">
                Save as <code>components/github-contributions-3d.utils.ts</code>.
              </p>
              <CodeBlock code={UTILS_SOURCE} language="ts" />
            </div>
            <div className="space-y-2">
              <p className="text-muted-foreground text-sm">
                Save as <code>components/github-contributions-3d.tsx</code>.
              </p>
              <CodeBlock code={SOURCE} language="tsx" />
            </div>
          </div>
        </Section>
        <Separator />

        <Section
          id="usage"
          title="Usage"
          description="Fetch data outside the component and pass it as props."
        >
          <CodeBlock code={USAGE_CODE} language="tsx" />
        </Section>
        <Separator />

        <Section id="props" title="Props">
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Prop</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Default</TableHead>
                  <TableHead>Description</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {PROPS.map((prop) => (
                  <TableRow key={prop.name}>
                    <TableCell className="font-mono text-xs">{prop.name}</TableCell>
                    <TableCell className="text-muted-foreground font-mono text-xs whitespace-nowrap">
                      {prop.type}
                    </TableCell>
                    <TableCell className="text-muted-foreground font-mono text-xs">
                      {prop.default}
                    </TableCell>
                    <TableCell className="min-w-56 text-sm">{prop.description}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Section>
        <Separator />

        <Section id="types" title="Types">
          <CodeBlock code={TYPES_CODE} language="ts" />
        </Section>
      </article>
    </>
  );
}
