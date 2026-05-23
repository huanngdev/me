"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

let fired = false;

export function RecordView({ action }: { action: () => Promise<{ counted: boolean }> }) {
  const router = useRouter();

  useEffect(() => {
    if (fired) return;
    fired = true;
    action()
      .then((result) => {
        if (result.counted) router.refresh();
      })
      .catch(() => {
        fired = false;
      });
  }, [action, router]);

  return null;
}
