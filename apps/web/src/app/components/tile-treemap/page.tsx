import { readFileSync } from "node:fs";
import path from "node:path";

import type { Metadata } from "next";
import type { ReactNode } from "react";

import { CliCommand } from "@repo/core/components/cli-command/cli-command";
import { CodeBlock } from "@repo/core/components/code-block";
import { ComponentPreviewFrame } from "@repo/core/components/layouts/component-preview-frame";
import { Separator } from "@repo/core/components/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/core/components/table";

import { readSourceFiles } from "@/lib/read-source-files";
import { RegistryInstall } from "@/components/registry-install";

import { TileTreemapDemo } from "./demo";
import { DOCS } from "@/content/component-docs/tile-treemap";

const SOURCE_FILES = readSourceFiles([
  "packages/core/src/components/tile-treemap.utils.ts",
  "packages/core/src/components/tile-treemap.tsx",
]);

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
    <section id={id} className="py-8">
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
    <ComponentPreviewFrame
      name="tile-treemap"
      files={SOURCE_FILES}
      previewClassName="max-w-3xl"
      docs={<Docs />}
    >
      <TileTreemapDemo />
    </ComponentPreviewFrame>
  );
}

function Docs() {
  return (
    <>
      <header className="pb-2">
        <h1 className="text-2xl font-semibold tracking-tight">Tile Treemap</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Divide a single box into proportionally sized, color-coded tiles.
        </p>
      </header>

      <Section
        id="install"
        title="Install"
        description="Install with one shadcn command, or add the files by hand."
      >
        <RegistryInstall name="tile-treemap" />
        <details className="group">
          <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-sm font-medium">
            Manual installation
          </summary>
          <div className="mt-6">
            <div className="space-y-8">
              <Step
                index={1}
                title="Add the chart tokens"
                description="Eight categorical colors that adapt to light and dark mode."
              >
                <CodeBlock code={DOCS.examples[0]!.code} language="css" />
              </Step>
              <Step
                index={2}
                title="Install framer-motion"
                description="Powers the tile entrance and hover motion."
              >
                <CliCommand install="framer-motion" />
              </Step>
              <Step
                index={3}
                title="Copy the layout utilities"
                description="Save as components/tile-treemap/tile-treemap.utils.ts."
              >
                <CodeBlock code={UTILS_SOURCE} language="ts" />
              </Step>
              <Step
                index={4}
                title="Copy the component"
                description="Save as components/tile-treemap/tile-treemap.tsx."
              >
                <CodeBlock code={TREEMAP_SOURCE} language="tsx" />
              </Step>
            </div>
          </div>
        </details>
      </Section>
      <Separator />

      <Section
        id="usage"
        title="Usage"
        description="Pass values and the component computes each share and tile area."
      >
        <CodeBlock code={DOCS.usage} language="tsx" />
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
              {DOCS.props.map((prop) => (
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
        <CodeBlock code={DOCS.types} language="ts" />
      </Section>
    </>
  );
}
