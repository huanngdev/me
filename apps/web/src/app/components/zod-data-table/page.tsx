import type { Metadata } from "next";

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

import { BasicZodDataTableDemo, CustomZodDataTableDemo, EmptyZodDataTableDemo } from "./demo";

const TOC: TOCItemType[] = [
  { title: "Demo", url: "#demo", depth: 2 },
  { title: "Install", url: "#install", depth: 2 },
  { title: "Usage", url: "#usage", depth: 2 },
  { title: "Custom columns", url: "#custom-columns", depth: 2 },
  { title: "Zod metadata", url: "#metadata", depth: 2 },
  { title: "Empty state", url: "#empty-state", depth: 2 },
  { title: "Props", url: "#props", depth: 2 },
  { title: "Types", url: "#types", depth: 2 },
];

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

const INSTALL_COMMAND =
  "bunx --bun shadcn@latest add https://www.huanngdev.site/r/zod-data-table.json";

const BASIC_USAGE_CODE = `"use client";

import { z } from "zod";
import { ZodDataTable } from "@/components/zod-data-table/zod-data-table";

const userSchema = z.object({
  name: z.string().meta({ title: "Full name" }),
  email: z.email(),
  active: z.boolean(),
  profile: z.object({ role: z.string() }),
});

const users: Array<z.output<typeof userSchema>> = [
  {
    name: "Ada Lovelace",
    email: "ada@example.com",
    active: true,
    profile: { role: "Engineer" },
  },
];

export function UsersTable() {
  return <ZodDataTable schema={userSchema} data={users} />;
}`;

const CUSTOM_COLUMNS_CODE = `"use client";

import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import {
  ZodDataTable,
  type ZodDataTableColumns,
} from "@/components/zod-data-table/zod-data-table";

const userSchema = z.object({
  name: z.string(),
  email: z.email(),
  active: z.boolean(),
  profile: z.object({ role: z.string() }),
});

type User = z.output<typeof userSchema>;

const columns = {
  email: {
    header: "Contact",
    cell: ({ value }) => <a href={\`mailto:\${value}\`}>{value}</a>,
  },
  active: {
    header: "Status",
    cell: ({ value }) => (
      <Badge variant={value ? "default" : "secondary"}>
        {value ? "Active" : "Inactive"}
      </Badge>
    ),
  },
  profile: { hidden: true },
} satisfies ZodDataTableColumns<User>;

export function UsersTable({ users }: { users: User[] }) {
  return <ZodDataTable schema={userSchema} data={users} columns={columns} />;
}`;

const VALIDATION_CODE = `const result = z.array(userSchema).safeParse(untrustedData);

if (!result.success) {
  // Handle the validation error at the data boundary.
  return;
}

<ZodDataTable schema={userSchema} data={result.data} />;`;

const METADATA_CODE = `const userSchema = z.object({
  firstName: z.string().meta({ title: "First name" }),
  lastName: z.string().meta({ title: "Last name" }),
  createdAt: z.date().meta({ title: "Created" }),
});`;

const EMPTY_STATE_CODE = `<ZodDataTable
  schema={userSchema}
  data={[]}
  emptyMessage="No users found."
/>`;

const TYPES_CODE = `type ZodDataTableColumnContext<TRow, TKey extends keyof TRow & string> = {
  value: TRow[TKey];
  row: TRow;
  rowIndex: number;
};

type ZodDataTableColumn<TRow, TKey extends keyof TRow & string> = {
  header?: React.ReactNode;
  hidden?: boolean;
  cell?: (context: ZodDataTableColumnContext<TRow, TKey>) => React.ReactNode;
};

type ZodDataTableColumns<TRow> = {
  [TKey in keyof TRow & string]?: ZodDataTableColumn<TRow, TKey>;
};

type ZodDataTableProps<TSchema extends z.ZodObject> = {
  schema: TSchema;
  data: Array<z.output<TSchema>>;
  columns?: ZodDataTableColumns<z.output<TSchema>>;
  emptyMessage?: string;
  className?: string;
};`;

const PROPS = [
  {
    name: "schema",
    type: "TSchema extends z.ZodObject",
    default: "—",
    description: "Object schema whose top-level fields define the columns and row type.",
  },
  {
    name: "data",
    type: "Array<z.output<TSchema>>",
    default: "—",
    description: "Already-validated rows. The component does not parse them again.",
  },
  {
    name: "columns",
    type: "ZodDataTableColumns<Row>",
    default: "—",
    description: "Typed overrides for headers, cell rendering, and field visibility.",
  },
  {
    name: "emptyMessage",
    type: "string",
    default: '"No results."',
    description: "Message rendered when the data array is empty.",
  },
  {
    name: "className",
    type: "string",
    default: "—",
    description: "Classes applied to the bordered table container.",
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
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 px-4 py-8 sm:px-6 lg:px-8">
      {title && <h2 className="text-lg font-semibold tracking-tight">{title}</h2>}
      {description && <p className="text-muted-foreground mt-1 text-sm">{description}</p>}
      <div className={title ? "mt-4" : undefined}>{children}</div>
    </section>
  );
}

export default function ZodDataTablePage() {
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

      <PageHeader title="Zod Data Table" description={DESCRIPTION} />

      <article className="mx-auto flex w-full max-w-4xl flex-1 flex-col border-x">
        <Section id="demo">
          <ComponentDemo code={BASIC_USAGE_CODE} previewClassName="max-w-3xl">
            <BasicZodDataTableDemo />
          </ComponentDemo>
        </Section>
        <Separator />

        <Section
          id="install"
          title="Install"
          description="Install the component, its table primitive, and runtime dependencies."
        >
          <TerminalBlock command={INSTALL_COMMAND} />
        </Section>
        <Separator />

        <Section
          id="usage"
          title="Usage"
          description="Pass a Zod object schema and rows inferred from its output type."
        >
          <div className="space-y-6">
            <CodeBlock code={BASIC_USAGE_CODE} language="tsx" />
            <div className="space-y-2">
              <h3 className="text-sm font-medium">Validate at the boundary</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                The table uses the schema to define columns and infer types. Parse untrusted API or
                form data before rendering so validation does not repeat on every render.
              </p>
              <CodeBlock code={VALIDATION_CODE} language="tsx" />
            </div>
          </div>
        </Section>
        <Separator />

        <Section
          id="custom-columns"
          title="Custom columns"
          description="Override only the fields that need different content or visibility."
        >
          <ComponentDemo code={CUSTOM_COLUMNS_CODE} previewClassName="max-w-3xl">
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
            <CodeBlock code={METADATA_CODE} language="ts" />
            <p className="text-muted-foreground text-sm leading-relaxed">
              Header priority is the column override, then the field metadata title, then a
              humanized field key. Put <code className="font-mono text-xs">.meta()</code> last when
              composing a field so the metadata belongs to the final schema instance.
            </p>
          </div>
        </Section>
        <Separator />

        <Section
          id="empty-state"
          title="Empty state"
          description="Keep the generated headers visible while explaining that no rows matched."
        >
          <ComponentDemo code={EMPTY_STATE_CODE} previewClassName="max-w-3xl">
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
