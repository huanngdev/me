import type { Metadata } from "next";

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

import { BasicZodDataTableDemo, CustomZodDataTableDemo, EmptyZodDataTableDemo } from "./demo";
import { DOCS } from "@/content/component-docs/zod-data-table";

const SOURCE_FILES = readSourceFiles([
  "packages/core/src/components/zod-data-table/zod-data-table.tsx",
]);

const DESCRIPTION = "Generate a typed TanStack table from a Zod object schema and row data.";

export const metadata: Metadata = {
  title: "Zod Data Table",
  description: DESCRIPTION,
  alternates: { canonical: "/components/zod-data-table" },
  openGraph: {
    title: "Zod Data Table",
    description: DESCRIPTION,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Zod Data Table",
    description: DESCRIPTION,
  },
};

const INSTALL_TARGET = "shadcn@latest add https://www.huanngdev.site/r/zod-data-table.json";

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
    <section id={id} className="scroll-mt-24 py-8">
      {title && <h2 className="text-lg font-semibold tracking-tight">{title}</h2>}
      {description && <p className="text-muted-foreground mt-1 text-sm">{description}</p>}
      <div className={title ? "mt-4" : undefined}>{children}</div>
    </section>
  );
}

export default function ZodDataTablePage() {
  return (
    <ComponentPreviewFrame
      name="zod-data-table"
      files={SOURCE_FILES}
      previewClassName="max-w-3xl"
      docs={<Docs />}
    >
      <BasicZodDataTableDemo />
    </ComponentPreviewFrame>
  );
}

function Docs() {
  return (
    <>
      <header className="pb-2">
        <h1 className="text-2xl font-semibold tracking-tight">Zod Data Table</h1>
        <p className="text-muted-foreground mt-1 text-sm">{DESCRIPTION}</p>
      </header>

      <Section
        id="install"
        title="Install"
        description="Install with one shadcn command, or add the files by hand."
      >
        <RegistryInstall name="zod-data-table" />
        <details className="group">
          <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-sm font-medium">
            Manual installation
          </summary>
          <div className="mt-6">
            <CliCommand execute={INSTALL_TARGET} />
          </div>
        </details>
      </Section>
      <Separator />

      <Section
        id="usage"
        title="Usage"
        description="Pass a Zod object schema and rows inferred from its output type."
      >
        <div className="space-y-6">
          <CodeBlock code={DOCS.usage} language="tsx" />
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Validate at the boundary</h3>
            <p className="text-muted-foreground text-sm leading-relaxed">
              The table uses the schema to define columns and infer types. Parse untrusted API or
              form data before rendering so validation does not repeat on every render.
            </p>
            <CodeBlock code={DOCS.examples[0]!.code} language="tsx" />
          </div>
        </div>
      </Section>
      <Separator />

      <Section
        id="custom-columns"
        title="Custom columns"
        description="Override only the fields that need different content or visibility."
      >
        <ComponentDemo code={DOCS.examples[1]!.code} previewClassName="max-w-3xl">
          <CustomZodDataTableDemo />
        </ComponentDemo>
      </Section>
      <Separator />

      <Section
        id="metadata"
        title="Zod metadata"
        description="Use a field title for labels without adding a column override."
      >
        <div className="space-y-3">
          <CodeBlock code={DOCS.examples[2]!.code} language="ts" />
          <p className="text-muted-foreground text-sm leading-relaxed">
            Header priority is the column override, then the field metadata title, then a humanized
            field key. Put <code className="font-mono text-xs">.meta()</code> last when composing a
            field so the metadata belongs to the final schema instance.
          </p>
        </div>
      </Section>
      <Separator />

      <Section
        id="empty-state"
        title="Empty state"
        description="Keep the generated headers visible while explaining that no rows matched."
      >
        <ComponentDemo code={DOCS.examples[3]!.code} previewClassName="max-w-3xl">
          <EmptyZodDataTableDemo />
        </ComponentDemo>
      </Section>
      <Separator />

      <Section id="props" title="Props">
        <div className="overflow-hidden rounded-lg border">
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
              {DOCS.props.map((prop) => (
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
        <CodeBlock code={DOCS.types} language="ts" />
      </Section>
    </>
  );
}
