"use client";

import { z } from "zod";

import { Badge } from "@repo/core/components/badge";
import {
  ZodDataTable,
  type ZodDataTableColumns,
} from "@repo/core/components/zod-data-table/ZodDataTable";

const userSchema = z.object({
  name: z.string().meta({ title: "Full name" }),
  email: z.email(),
  active: z.boolean(),
  profile: z.object({ role: z.string() }),
});

type User = z.output<typeof userSchema>;

const users: User[] = [
  {
    name: "Ada Lovelace",
    email: "ada@example.com",
    active: true,
    profile: { role: "Engineer" },
  },
  {
    name: "Grace Hopper",
    email: "grace@example.com",
    active: false,
    profile: { role: "Researcher" },
  },
  {
    name: "Margaret Hamilton",
    email: "margaret@example.com",
    active: true,
    profile: { role: "Lead" },
  },
];

const customColumns = {
  email: {
    header: "Contact",
    cell: ({ value }) => (
      <a className="underline-offset-4 hover:underline" href={`mailto:${value}`}>
        {value}
      </a>
    ),
  },
  active: {
    header: "Status",
    cell: ({ value }) => (
      <Badge variant={value ? "default" : "secondary"}>{value ? "Active" : "Inactive"}</Badge>
    ),
  },
  profile: { hidden: true },
} satisfies ZodDataTableColumns<User>;

export function BasicZodDataTableDemo() {
  return <ZodDataTable schema={userSchema} data={users} />;
}

export function CustomZodDataTableDemo() {
  return <ZodDataTable schema={userSchema} data={users} columns={customColumns} />;
}

export function EmptyZodDataTableDemo() {
  return <ZodDataTable schema={userSchema} data={[]} emptyMessage="No users found." />;
}
