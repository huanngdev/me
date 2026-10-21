import { readFileSync } from "node:fs";
import path from "node:path";

import type { Metadata } from "next";

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

import { ConversationMinimapDemo } from "./demo";
import { DOCS } from "@/content/component-docs/scroll-minimap";

const SOURCE_FILES = readSourceFiles(["packages/core/src/components/scroll-minimap.tsx"]);

const REPO_ROOT = process.cwd().endsWith("apps/web")
  ? path.resolve(process.cwd(), "../..")
  : process.cwd();
const SCROLL_MINIMAP_SOURCE = readFileSync(
  path.join(REPO_ROOT, "packages/core/src/components/scroll-minimap.tsx"),
  "utf8",
);

export const metadata: Metadata = {
  title: "Scroll Minimap",
  description: "A compact scrollspy navigator for long documents, chats, and timelines.",
  alternates: { canonical: "/components/scroll-minimap" },
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
  children: React.ReactNode;
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
  children: React.ReactNode;
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

export default function ScrollMinimapPage() {
  return (
    <ComponentPreviewFrame
      name="scroll-minimap"
      files={SOURCE_FILES}
      previewClassName="max-w-2xl"
      docs={<Docs />}
    >
      <ConversationMinimapDemo />
    </ComponentPreviewFrame>
  );
}

function Docs() {
  return (
    <>
      <header className="pb-2">
        <h1 className="text-2xl font-semibold tracking-tight">Scroll Minimap</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          A compact scrollspy navigator for long documents, chats, and timelines.
        </p>
      </header>

      <Section
        id="install"
        title="Install"
        description="Install with one shadcn command, or add the files by hand."
      >
        <RegistryInstall name="scroll-minimap" />
        <details className="group">
          <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-sm font-medium">
            Manual installation
          </summary>
          <div className="mt-6">
            <div className="space-y-8">
              <Step
                index={1}
                title="Add the shadcn primitive"
                description="Installs the hover card used for marker previews."
              >
                <CliCommand execute="shadcn@latest add hover-card" />
              </Step>
              <Step
                index={2}
                title="Copy the source"
                description="Save as components/scroll-minimap/scroll-minimap.tsx."
              >
                <CodeBlock code={SCROLL_MINIMAP_SOURCE} language="tsx" />
              </Step>
            </div>
          </div>
        </details>
      </Section>
      <Separator />

      <Section
        id="usage"
        title="Usage"
        description="Pass hash targets and optionally scope tracking to a scrollable container."
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
