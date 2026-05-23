"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { SproutIcon } from "lucide-react";

import { cn } from "../../../lib/utils";

export function SeedButton({ action }: { action: () => Promise<{ inserted: number }> }) {
  const [pending, start] = useTransition();
  const router = useRouter();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await action();
          router.refresh();
        })
      }
      className={cn(
        "border-border text-muted-foreground hover:bg-muted hover:text-foreground inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-xs transition-colors",
        pending && "opacity-50",
      )}
    >
      <SproutIcon className="size-3.5" />
      {pending ? "Seeding…" : "Seed"}
    </button>
  );
}
