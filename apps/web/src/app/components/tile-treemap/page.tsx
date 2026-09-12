import { readFileSync } from "node:fs";
import path from "node:path";

import type { Metadata } from "next";
import type { ReactNode } from "react";

import { CodeBlock } from "@repo/core/components/code-block";
import { ComponentDemo } from "@repo/core/components/component-demo";
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

import { TileTreemapDemo } from "./demo";

const REPO_ROOT = process.cwd().endsWith("apps/web")
  ? path.resolve(process.cwd(), "../..")
  : process.cwd();
const UTILS_SOURCE = readFileSync(
  path.join(REPO_ROOT, "packages/core/src/components/tile-treemap.utils.ts"),
  "utf8",
);
const TREEMAP_SOURCE = readFileSync(
  path.join(REPO_ROOT, "packages/core/src/components/tile-treemap.tsx"),
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
  title: "Tile Treemap",
  description: "Divide a single box into proportionally sized, color-coded tiles.",
  alternates: { canonical: "/components/tile-treemap" },
  openGraph: {
    title: "Tile Treemap",
    description: "Divide a single box into proportionally sized, color-coded tiles.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Tile Treemap",
    description: "Divide a single box into proportionally sized, color-coded tiles.",
  },
};

const USAGE_CODE = `"use client";

import { TileTreemap } from "@/components/tile-treemap";

const data = [
  { label: "TypeScript", value: 42 },
  { label: "JavaScript", value: 23 },
  { label: "Python", value: 14 },
  { label: "Rust", value: 9 },
];

export function Example() {
  return <TileTreemap data={data} />;
}`;

const TOKENS_CODE = `:root {
  --chart-1: oklch(0.5 0.19 292);
  --chart-2: oklch(0.53 0.11 195);
  --chart-3: oklch(0.55 0.13 75);
  --chart-4: oklch(0.51 0.16 255);
  --chart-5: oklch(0.53 0.18 20);
  --chart-6: oklch(0.54 0.14 150);
  --chart-7: oklch(0.52 0.14 230);
  --chart-8: oklch(0.55 0.15 45);
}

.dark {
  --chart-1: oklch(0.66 0.17 292);
  --chart-2: oklch(0.7 0.1 195);
  --chart-3: oklch(0.75 0.12 75);
  --chart-4: oklch(0.67 0.14 255);
  --chart-5: oklch(0.68 0.16 20);
  --chart-6: oklch(0.71 0.13 150);
  --chart-7: oklch(0.69 0.13 230);
  --chart-8: oklch(0.73 0.14 45);
}`;

const TYPES_CODE = `type TileTreemapItem = {
  label: string;
  value: number;
  color?: string;
};

type TileTreemapProps = {
  data: TileTreemapItem[];
  height?: number;
  className?: string;
  valueFormatter?: (value: number, percentage: number) => string;
  hoverScale?: number;
};`;

const PROPS = [
  {
    name: "data",
    type: "TileTreemapItem[]",
    default: "—",
    description: "Items to lay out. Each tile area is proportional to its value.",
  },
  {
    name: "height",
    type: "number",
    default: "16:10",
    description: "Fixed pixel height. Falls back to a 16:10 aspect ratio when omitted.",
  },
  {
    name: "className",
    type: "string",
    default: "—",
    description: "Classes applied to the treemap container.",
  },
  {
    name: "valueFormatter",
    type: "(value, percentage) => string",
    default: "—",
    description: "Formats the value shown inside each tile.",
  },
  {
    name: "hoverScale",
    type: "number",
    default: "1.04",
    description: "Scale applied to a tile on hover or keyboard focus.",
  },
] as const;

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
    <section id={id} className="px-4 py-8 sm:px-6 lg:px-8">
      {title && <h2 className="text-lg font-semibold tracking-tight">{title}</h2>}
      {description && <p className="text-muted-foreground mt-1 text-sm">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Step({
  index,
  title,
  description,
  children,
}: {
  index: number;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="relative pl-9">
      <span className="bg-muted text-muted-foreground absolute top-0 left-0 inline-flex size-6 items-center justify-center rounded-md border font-mono text-xs">
        {index}
      </span>
      <h3 className="text-sm font-medium">{title}</h3>
      {description && <p className="text-muted-foreground mt-1 text-sm">{description}</p>}
      <div className="mt-3">{children}</div>
    </div>
  );
}

export default function TileTreemapPage() {
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
        title="Tile Treemap"
        description="Divide a single box into proportionally sized, color-coded tiles."
      />

      <article className="mx-auto flex w-full max-w-4xl flex-1 flex-col border-x">
        <Section id="demo">
          <ComponentDemo code={USAGE_CODE} previewClassName="max-w-3xl">
            <TileTreemapDemo />
          </ComponentDemo>
        </Section>
        <Separator />

        <Section
          id="install"
          title="Install"
          description="Add the color tokens and the motion dependency, then copy the source."
        >
          <div className="space-y-8">
            <Step
              index={1}
              title="Add the chart tokens"
              description="Eight categorical colors that adapt to light and dark mode."
            >
              <CodeBlock code={TOKENS_CODE} language="css" />
            </Step>
            <Step
              index={2}
              title="Install framer-motion"
              description="Powers the tile entrance and hover motion."
            >
              <TerminalBlock command="bun add framer-motion" />
            </Step>
            <Step
              index={3}
              title="Copy the layout utilities"
              description="Save as components/tile-treemap.utils.ts."
            >
              <CodeBlock code={UTILS_SOURCE} language="ts" />
            </Step>
            <Step
              index={4}
              title="Copy the component"
              description="Save as components/tile-treemap.tsx."
            >
              <CodeBlock code={TREEMAP_SOURCE} language="tsx" />
            </Step>
          </div>
        </Section>
        <Separator />

        <Section
          id="usage"
          title="Usage"
          description="Pass values and the component computes each share and tile area."
        >
          <CodeBlock code={USAGE_CODE} language="tsx" />
        </Section>
        <Separator />

        <Section id="props" title="Props">
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[170px]">Prop</TableHead>
                  <TableHead className="w-[240px]">Type</TableHead>
                  <TableHead className="w-[130px]">Default</TableHead>
                  <TableHead>Description</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {PROPS.map((prop) => (
                  <TableRow key={prop.name}>
                    <TableCell className="font-mono text-xs">{prop.name}</TableCell>
                    <TableCell className="text-muted-foreground font-mono text-xs">
                      {prop.type}
                    </TableCell>
                    <TableCell className="text-muted-foreground font-mono text-xs">
                      {prop.default}
                    </TableCell>
                    <TableCell className="text-sm">{prop.description}</TableCell>
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
