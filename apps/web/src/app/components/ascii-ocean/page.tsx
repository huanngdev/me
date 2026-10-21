import { readFileSync } from "node:fs";
import path from "node:path";

import type { Metadata } from "next";
import type { ReactNode } from "react";

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

import { AsciiOceanDemo } from "./demo";
import { DOCS } from "@/content/component-docs/ascii-ocean";

const SOURCE_FILES = readSourceFiles([
  "packages/core/src/components/ascii-ocean/math.ts",
  "packages/core/src/components/ascii-ocean/palette.ts",
  "packages/core/src/components/ascii-ocean/species.ts",
  "packages/core/src/components/ascii-ocean/creatures/types.ts",
  "packages/core/src/components/ascii-ocean/creatures/paint.ts",
  "packages/core/src/components/ascii-ocean/creatures/sharks.ts",
  "packages/core/src/components/ascii-ocean/creatures/koi.ts",
  "packages/core/src/components/ascii-ocean/creatures/bottlenose.ts",
  "packages/core/src/components/ascii-ocean/creatures/orca.ts",
  "packages/core/src/components/ascii-ocean/creatures/humpback.ts",
  "packages/core/src/components/ascii-ocean/creatures/index.ts",
  "packages/core/src/components/ascii-ocean/creatures/roster.ts",
  "packages/core/src/components/ascii-ocean/creatures/behaviour.ts",
  "packages/core/src/components/ascii-ocean/creatures/actions.ts",
  "packages/core/src/components/ascii-ocean/world.ts",
  "packages/core/src/components/ascii-ocean/effects.ts",
  "packages/core/src/components/ascii-ocean/pond.ts",
  "packages/core/src/components/ascii-ocean/sea.ts",
  "packages/core/src/components/ascii-ocean/renderer.ts",
  "packages/core/src/components/ascii-ocean/engine.ts",
  "packages/core/src/components/ascii-ocean/ascii-ocean.tsx",
]);

const REPO_ROOT = process.cwd().endsWith("apps/web")
  ? path.resolve(process.cwd(), "../..")
  : process.cwd();
const ENGINE_DIR = "packages/core/src/components/ascii-ocean";
const ENGINE_FILES = [
  "math.ts",
  "palette.ts",
  "species.ts",
  "creatures/types.ts",
  "creatures/paint.ts",
  "creatures/sharks.ts",
  "creatures/koi.ts",
  "creatures/bottlenose.ts",
  "creatures/orca.ts",
  "creatures/humpback.ts",
  "creatures/index.ts",
  "creatures/roster.ts",
  "creatures/behaviour.ts",
  "creatures/actions.ts",
  "world.ts",
  "effects.ts",
  "pond.ts",
  "sea.ts",
  "renderer.ts",
  "engine.ts",
  "ascii-ocean.tsx",
] as const;
const SOURCES = ENGINE_FILES.map((file) => ({
  file,
  code: readFileSync(path.join(REPO_ROOT, ENGINE_DIR, file), "utf8"),
  language: file.endsWith(".tsx") ? "tsx" : "ts",
}));

const DESCRIPTION =
  "A canvas ocean with sharks, koi, dolphins, orcas and humpbacks. Click to feed them; each species has its own feeding moves.";

export const metadata: Metadata = {
  title: "ASCII Ocean",
  description: DESCRIPTION,
  alternates: { canonical: "/components/ascii-ocean" },
  openGraph: {
    title: "ASCII Ocean",
    description: DESCRIPTION,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "ASCII Ocean",
    description: DESCRIPTION,
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

export default function AsciiOceanPage() {
  return (
    <ComponentPreviewFrame
      name="ascii-ocean"
      files={SOURCE_FILES}
      previewClassName="max-w-3xl"
      docs={<Docs />}
    >
      <AsciiOceanDemo />
    </ComponentPreviewFrame>
  );
}

function Docs() {
  return (
    <>
      <header className="pb-2">
        <h1 className="text-2xl font-semibold tracking-tight">ASCII Ocean</h1>
        <p className="text-muted-foreground mt-1 text-sm">{DESCRIPTION}</p>
      </header>

      <Section
        id="install"
        title="Install"
        description="Install with one shadcn command, or add the files by hand. The canvas reads its font-family for glyphs, so give it a monospace font. No npm dependencies to install."
      >
        <RegistryInstall name="ascii-ocean" />
        <details className="group">
          <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-sm font-medium">
            Manual installation
          </summary>
          <div className="mt-6">
            <div className="space-y-8">
              {SOURCES.map((source, position) => (
                <Step
                  key={source.file}
                  index={position + 1}
                  title={`Copy ${source.file}`}
                  description={`Save as components/ascii-ocean/${source.file}.`}
                >
                  <CodeBlock code={source.code} language={source.language} />
                </Step>
              ))}
            </div>
          </div>
        </details>
      </Section>
      <Separator />

      <Section
        id="usage"
        title="Usage"
        description="Pass a roster of sharks. Give the canvas a size through className."
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
      <Separator />

      <Section id="credits" title="Credits">
        <p className="text-muted-foreground text-sm">
          Simulation ported from{" "}
          <a
            href="https://github.com/stackedlol/ascii-sharks"
            className="underline underline-offset-4"
          >
            stackedlol/ascii-sharks
          </a>
          .
        </p>
      </Section>
    </>
  );
}
