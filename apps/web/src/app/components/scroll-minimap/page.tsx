import { readFileSync } from "node:fs";
import path from "node:path";

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

import { readLlmsDocument } from "@/lib/read-llms-document";

import { ConversationMinimapDemo } from "./demo";

const LLM_TEXT = readLlmsDocument("components", "scroll-minimap");

const REPO_ROOT = process.cwd().endsWith("apps/web")
  ? path.resolve(process.cwd(), "../..")
  : process.cwd();
const SCROLL_MINIMAP_SOURCE = readFileSync(
  path.join(REPO_ROOT, "packages/core/src/components/scroll-minimap.tsx"),
  "utf8",
);

const TOC: TOCItemType[] = [
  { title: "Demo", url: "#demo", depth: 2 },
  { title: "Install", url: "#install", depth: 2 },
  { title: "Usage", url: "#usage", depth: 2 },
  { title: "Props", url: "#props", depth: 2 },
  { title: "Types", url: "#types", depth: 2 },
];

export const metadata: Metadata = {
  title: "Scroll Minimap",
  description: "A compact scrollspy navigator for long documents, chats, and timelines.",
  alternates: { canonical: "/components/scroll-minimap" },
};

const USAGE_CODE = `"use client";

import { useRef } from "react";
import { ScrollMinimap } from "@/components/scroll-minimap";

const items = [
  { label: "First message", href: "#message-1", description: "You" },
  { label: "First response", href: "#message-2", description: "Assistant" },
  { label: "Follow-up", href: "#message-3", description: "You" },
] as const;

export function Conversation() {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  return (
    <div className="grid h-96 grid-cols-[1fr_3rem]">
      <div ref={scrollContainerRef} className="overflow-y-auto">
        <article id="message-1">First message</article>
        <article id="message-2">First response</article>
        <article id="message-3">Follow-up</article>
      </div>
      <ScrollMinimap
        items={items}
        direction="right"
        scrollContainerRef={scrollContainerRef}
        ariaLabel="Conversation messages"
      />
    </div>
  );
}`;

const TYPES_CODE = `type ScrollMinimapItem = {
  label: React.ReactNode;
  href: \`#\${string}\`;
  depth?: number;
  description?: React.ReactNode;
};

type ScrollMinimapProps = {
  items: ScrollMinimapItem[];
  direction?: "left" | "right";
  className?: string;
  ariaLabel?: string;
  scrollContainerRef?: React.RefObject<HTMLElement | null>;
  onNavigate?: (item: ScrollMinimapItem) => void;
  onItemEnter?: (item: ScrollMinimapItem) => void;
};`;

const PROPS = [
  {
    name: "items",
    type: "ScrollMinimapItem[]",
    default: "—",
    description: "Anchor targets and preview content rendered as minimap markers.",
  },
  {
    name: "direction",
    type: '"left" | "right"',
    default: '"left"',
    description: "Side where the minimap sits; marker growth and previews mirror automatically.",
  },
  {
    name: "className",
    type: "string",
    default: "—",
    description: "Classes applied to the navigation root.",
  },
  {
    name: "ariaLabel",
    type: "string",
    default: '"Section navigation"',
    description: "Accessible name for the navigation landmark.",
  },
  {
    name: "scrollContainerRef",
    type: "RefObject<HTMLElement | null>",
    default: "window",
    description: "Scrollable element to observe and navigate within.",
  },
  {
    name: "onNavigate",
    type: "(item) => void",
    default: "—",
    description: "Called after a marker is selected.",
  },
  {
    name: "onItemEnter",
    type: "(item) => void",
    default: "—",
    description: "Called when a marker receives hover or keyboard focus.",
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
    <section id={id} className="px-4 py-8 sm:px-6 lg:px-8">
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
    <>
      <div
        aria-label="Section navigation"
        className="pointer-events-none fixed top-1/2 left-4 z-30 hidden -translate-y-1/2 xl:block"
      >
        <div className="pointer-events-auto">
          <TOCMinimap items={TOC} />
        </div>
      </div>

      <PageHeader
        title="Scroll Minimap"
        description="A compact scrollspy navigator for long documents, chats, and timelines."
      />

      <article className="mx-auto flex w-full max-w-4xl flex-1 flex-col border-x">
        <Section id="demo">
          <ComponentDemo llm={LLM_TEXT} code={USAGE_CODE} previewClassName="max-w-2xl">
            <ConversationMinimapDemo />
          </ComponentDemo>
        </Section>
        <Separator />

        <Section
          id="install"
          title="Install"
          description="Add the component manually in two steps."
        >
          <div className="space-y-8">
            <Step
              index={1}
              title="Add the shadcn primitive"
              description="Installs the hover card used for marker previews."
            >
              <TerminalBlock command="bunx --bun shadcn@latest add hover-card" />
            </Step>
            <Step
              index={2}
              title="Copy the source"
              description="Save as components/scroll-minimap.tsx."
            >
              <CodeBlock code={SCROLL_MINIMAP_SOURCE} language="tsx" />
            </Step>
          </div>
        </Section>
        <Separator />

        <Section
          id="usage"
          title="Usage"
          description="Pass hash targets and optionally scope tracking to a scrollable container."
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
      </article>
    </>
  );
}
