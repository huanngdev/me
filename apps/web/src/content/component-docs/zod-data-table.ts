import type { ComponentDocs } from "./types";

export const DOCS: ComponentDocs = {
  keywords: ["table", "data table", "zod", "schema", "typed", "grid"],
  usage: `"use client";

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
}`,
  examples: [
    {
      title: "Validate at the boundary",
      description:
        "The table uses the schema to define columns and infer types. Parse untrusted API or form data before rendering so validation does not repeat on every render.",
      code: `const result = z.array(userSchema).safeParse(untrustedData);

if (!result.success) {
  // Handle the validation error at the data boundary.
  return;
}

<ZodDataTable schema={userSchema} data={result.data} />;`,
      language: "tsx",
    },
    {
      title: "Custom columns",
      description: "Override only the fields that need different content or visibility.",
      code: `"use client";

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
}`,
    },
    {
      title: "Zod metadata",
      description: "Use a field title for labels without adding a column override.",
      code: `const userSchema = z.object({
  firstName: z.string().meta({ title: "First name" }),
  lastName: z.string().meta({ title: "Last name" }),
  createdAt: z.date().meta({ title: "Created" }),
});`,
      language: "ts",
    },
    {
      title: "Empty state",
      description: "Keep the generated headers visible while explaining that no rows matched.",
      code: `<ZodDataTable
  schema={userSchema}
  data={[]}
  emptyMessage="No users found."
/>`,
    },
  ],
  props: [
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
  ],
  types: `type ZodDataTableColumnContext<TRow, TKey extends keyof TRow & string> = {
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
};`,
  notes: [],
};
