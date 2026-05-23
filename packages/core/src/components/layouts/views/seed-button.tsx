"use client";

import { RotateCcwIcon, SproutIcon } from "lucide-react";

import { cn } from "../../../lib/utils";

export function SeedButton({
  seeded,
  onSeed,
  onReset,
}: {
  seeded: boolean;
  onSeed: () => void;
  onReset: () => void;
}) {
  const Icon = seeded ? RotateCcwIcon : SproutIcon;
  return (
    <button
      type="button"
      onClick={seeded ? onReset : onSeed}
      className={cn(
        "border-border text-muted-foreground hover:bg-muted hover:text-foreground inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-xs transition-colors",
      )}
    >
      <Icon className="size-3.5" />
      {seeded ? "Reset" : "Seed"}
    </button>
  );
}
