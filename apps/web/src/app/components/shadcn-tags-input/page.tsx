import type { Metadata } from "next";
import { ExternalLink } from "lucide-react";

import { CliCommand } from "@repo/core/components/cli-command/cli-command";
import { CodeBlock } from "@repo/core/components/code-block";
import { ComponentDemo } from "@repo/core/components/component-demo";
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

import registry from "../../../../public/r/shadcn-tags-input.json";
import { BasicDemo, ConstrainedDemo, ZodDemo } from "./demo";
import { DOCS } from "@/content/component-docs/shadcn-tags-input";

const SOURCE_FILES = readSourceFiles([
  "packages/core/src/components/shadcn-tags-input/tags-input.tsx",
]);

const REPO_URL =
  "https://github.com/huanngdev/me/blob/main/packages/core/src/components/shadcn-tags-input/tags-input.tsx";

export const metadata: Metadata = {
  title: "Tags Input",
  description: "A composable tags input built on shadcn primitives.",
  alternates: { canonical: "/components/shadcn-tags-input" },
};

const DEPS_PACKAGES = "lucide-react";
const SHADCN_TARGET = "shadcn@latest add badge";

const TAGS_INPUT_SOURCE = registry.files[0]!.content;

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

export default function TagsInputComponentPage() {
  return (
    <ComponentPreviewFrame
      name="shadcn-tags-input"
      files={SOURCE_FILES}
      previewClassName="max-w-sm"
      docs={<Docs />}
    >
      <BasicDemo />
    </ComponentPreviewFrame>
  );
}

function Docs() {
  return (
    <>
      <header className="pb-2">
        <h1 className="text-2xl font-semibold tracking-tight">Tags Input</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          A composable tags input with keyboard controls, validation, and form support.
        </p>
      </header>

      <Section
        id="install"
        title="Install"
        description="Install with one shadcn command, or add the files by hand."
      >
        <RegistryInstall name="shadcn-tags-input" />
        <details className="group">
          <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-sm font-medium">
            Manual installation
          </summary>
          <div className="mt-6">
            <div className="space-y-8">
              <Step
                index={1}
                title="Install dependencies"
                description="Runtime libraries the component needs."
              >
                <CliCommand install={DEPS_PACKAGES} />
              </Step>
              <Step
                index={2}
                title="Add shadcn primitives"
                description="Pulls in the badge component used by tags."
              >
                <CliCommand execute={SHADCN_TARGET} />
              </Step>
              <Step
                index={3}
                title="Copy the source"
                description="Drop into components/shadcn-tags-input/tags-input.tsx."
              >
                <CodeBlock code={TAGS_INPUT_SOURCE} language="tsx" />
              </Step>
              <Step
                index={4}
                title="Browse the repo"
                description="Latest source, history, and issues live on GitHub."
              >
                <a
                  href={REPO_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="border-border hover:bg-muted inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors"
                >
                  <span className="font-mono text-xs">huanngdev/me</span>
                  <ExternalLink className="size-3.5" />
                </a>
              </Step>
            </div>
          </div>
        </details>
      </Section>
      <Separator />

      <Section
        id="usage"
        title="Usage"
        description="Render with a controlled value and onChange handler."
      >
        <CodeBlock code={DOCS.usage} />
      </Section>
      <Separator />

      <Section
        id="hook"
        title="useTagsInput hook"
        description="Use the hook directly if you need state without rendering the component."
      >
        <CodeBlock code={DOCS.examples[0]!.code} />
      </Section>
      <Separator />

      <Section
        id="constrained"
        title="With constraints"
        description="Limit tag count, length, and surface validation errors inline."
      >
        <ComponentDemo code={DOCS.examples[1]!.code} previewClassName="max-w-sm">
          <ConstrainedDemo />
        </ComponentDemo>
      </Section>
      <Separator />

      <Section
        id="zod"
        title="Zod validation"
        description="Validate the final array with a Zod schema on submit."
      >
        <div className="space-y-4">
          <ComponentDemo code={DOCS.examples[2]!.code} previewClassName="max-w-sm">
            <ZodDemo />
          </ComponentDemo>
          <p className="text-muted-foreground text-sm leading-relaxed">
            The component itself enforces per-tag constraints at entry time (length, duplicates, max
            count). Use Zod to validate the <em>final</em> array shape on submit — e.g. require at
            least N tags, or constrain values against an enum. Pass{" "}
            <code className="font-mono text-xs">aria-invalid</code> when the schema rejects to apply
            the destructive ring.
          </p>
        </div>
      </Section>
      <Separator />

      <Section id="props" title="Props">
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[180px]">Prop</TableHead>
                <TableHead className="w-[220px]">Type</TableHead>
                <TableHead className="w-[120px]">Default</TableHead>
                <TableHead>Description</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {DOCS.props.map((p) => (
                <TableRow key={p.name}>
                  <TableCell className="font-mono text-xs">{p.name}</TableCell>
                  <TableCell className="text-muted-foreground font-mono text-xs">
                    {p.type}
                  </TableCell>
                  <TableCell className="text-muted-foreground font-mono text-xs">
                    {p.default}
                  </TableCell>
                  <TableCell className="text-sm">{p.description}</TableCell>
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
