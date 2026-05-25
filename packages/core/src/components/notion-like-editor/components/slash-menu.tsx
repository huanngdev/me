"use client";

import { Bold, Heading1, Heading2, List } from "lucide-react";

import type { BlockType } from "../types";

export function SlashMenu({
  open,
  position,
  onSelect,
}: {
  open: boolean;
  position: { top: number; left: number };
  onSelect: (type: BlockType) => void;
}) {
  if (!open) return null;

  const items: { type: BlockType; label: string; icon: React.ReactNode }[] = [
    { type: "paragraph", label: "Text", icon: <Bold className="size-4" /> },
    { type: "heading1", label: "Heading 1", icon: <Heading1 className="size-4" /> },
    { type: "heading2", label: "Heading 2", icon: <Heading2 className="size-4" /> },
    { type: "bullet-list", label: "Bullet list", icon: <List className="size-4" /> },
  ];

  return (
    <div
      className="bg-popover fixed z-50 w-48 rounded-lg border p-1 shadow-md"
      style={{ top: position.top, left: position.left }}
    >
      {items.map((item) => (
        <button
          key={item.type}
          type="button"
          className="hover:bg-accent flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm"
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect(item.type);
          }}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </div>
  );
}
