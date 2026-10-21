import type { ComponentDocs } from "./types";

export const DOCS: ComponentDocs = {
  keywords: ["scroll", "minimap", "navigation", "table of contents", "sidebar", "scrollspy"],
  usage: `"use client";

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
}`,
  examples: [],
  props: [
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
  ],
  types: `type ScrollMinimapItem = {
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
};`,
  notes: [],
};
