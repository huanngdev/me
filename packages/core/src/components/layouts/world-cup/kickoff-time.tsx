"use client";

import { useSyncExternalStore } from "react";

// Returns false on the server / first paint, true once hydrated on the client.
// useSyncExternalStore keeps hydration consistent without a setState-in-effect.
const noop = () => () => {};
function useHydrated() {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}

// Renders a match kickoff in the visitor's local timezone.
// SSR (and no-JS) shows a deterministic UTC value; after hydration it swaps to local time.
// suppressHydrationWarning covers the intentional server→client text difference.
export function KickoffTime({ iso, className }: { iso: string | null; className?: string }) {
  const hydrated = useHydrated();

  if (!iso) return <span className={className}>TBD</span>;

  const date = new Date(iso);
  const display = hydrated
    ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : `${date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} UTC`;

  return (
    <time dateTime={iso} className={className} suppressHydrationWarning>
      {display}
    </time>
  );
}
