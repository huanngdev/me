"use client";

import { useRef } from "react";
import { z } from "zod";

import { Badge } from "@repo/core/components/badge";
import { ScrollMinimap, type ScrollMinimapItem } from "@repo/core/components/scroll-minimap";
import {
  ZodDataTable,
  type ZodDataTableColumns,
} from "@repo/core/components/zod-data-table/zod-data-table";

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
  {
    name: "Katherine Johnson",
    email: "katherine@example.com",
    active: true,
    profile: { role: "Analyst" },
  },
];

const previewColumns = {
  email: {
    header: "Contact",
    cell: ({ value }) => <span>{value}</span>,
  },
  active: {
    header: "Status",
    cell: ({ value }) => (
      <Badge variant={value ? "default" : "secondary"}>{value ? "Active" : "Inactive"}</Badge>
    ),
  },
  profile: { hidden: true },
} satisfies ZodDataTableColumns<User>;

export function ZodDataTablePreview() {
  return <ZodDataTable schema={userSchema} data={users} columns={previewColumns} />;
}

const MINIMAP_MESSAGES = [
  {
    id: "preview-minimap-message-1",
    role: "You",
    text: "Can you help me plan a small product launch?",
  },
  {
    id: "preview-minimap-message-2",
    role: "Assistant",
    text: "Start with the audience, the promise, and one measurable launch goal.",
  },
  {
    id: "preview-minimap-message-3",
    role: "You",
    text: "The audience is independent developers building their first paid tool.",
  },
  {
    id: "preview-minimap-message-4",
    role: "Assistant",
    text: "Then lead with the outcome: ship a focused launch without a large following.",
  },
] as const;

const MINIMAP_ITEMS: ScrollMinimapItem[] = MINIMAP_MESSAGES.map((message) => ({
  label: message.text,
  href: `#${message.id}`,
  description: message.role,
}));

export function ScrollMinimapPreview() {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  return (
    <div className="bg-background grid h-full w-full grid-cols-[minmax(0,1fr)_3rem] overflow-hidden rounded-lg border">
      <div ref={scrollContainerRef} className="overflow-hidden px-4 py-6 sm:px-6">
        <div className="space-y-8">
          {MINIMAP_MESSAGES.map((message) => (
            <article key={message.id} id={message.id} className="scroll-mt-6 space-y-2">
              <p className="text-muted-foreground font-mono text-[11px] tracking-wide uppercase">
                {message.role}
              </p>
              <p className="text-sm leading-6">{message.text}</p>
            </article>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-center border-l">
        <ScrollMinimap
          items={MINIMAP_ITEMS}
          direction="right"
          scrollContainerRef={scrollContainerRef}
          ariaLabel="Conversation messages"
        />
      </div>
    </div>
  );
}
