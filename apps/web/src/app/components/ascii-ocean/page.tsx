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

import { readLlmsDocument } from "@/lib/read-llms-document";
import { readSourceFiles } from "@/lib/read-source-files";
import { RegistryInstall } from "@/components/registry-install";

import { AsciiOceanDemo } from "./demo";

const LLM_TEXT = readLlmsDocument("components", "ascii-ocean");

const SOURCE_FILES = readSourceFiles([
  "packages/core/src/components/ascii-ocean/math.ts",
  "packages/core/src/components/ascii-ocean/species.ts",
  "packages/core/src/components/ascii-ocean/world.ts",
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
  "species.ts",
  "world.ts",
  "renderer.ts",
  "engine.ts",
  "ascii-ocean.tsx",
] as const;
const SOURCES = ENGINE_FILES.map((file) => ({
  file,
  code: readFileSync(path.join(REPO_ROOT, ENGINE_DIR, file), "utf8"),
  language: file.endsWith(".tsx") ? "tsx" : "ts",
}));

const DESCRIPTION = "A canvas ASCII ocean where sharks hunt schools of fish.";

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

const USAGE_CODE = `import { AsciiOcean } from "@/components/ascii-ocean/ascii-ocean";

export function Example() {
  return (
    <AsciiOcean
      sharks={[
        { kind: "hammerhead", size: 1 },
        { kind: "greathammer", size: 0.85 },
      ]}
      className="aspect-video w-full rounded-lg"
    />
  );
}`;

const TYPES_CODE = `export type SharkKind = "classic" | "hammerhead" | "zebra" | "tiger" | "greathammer" | "mako" | "thresher" | "nurse";

export type SharkSpec = { kind: SharkKind; size: number };

export type AsciiOceanProps = {
  sharks?: SharkSpec[];
  className?: string;
};`;

const PROPS = [
  {
    name: "sharks",
    type: "SharkSpec[]",
    default: "4 classic sharks",
    description:
      "Sharks in the water. Size is relative to the biggest. Fixed for the life of the canvas; change `key` to swap the roster.",
  },
  {
    name: "className",
    type: "string",
    default: "—",
    description: "Classes for the canvas. Give it a size; the canvas fills it.",
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
      llmText={LLM_TEXT}
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
