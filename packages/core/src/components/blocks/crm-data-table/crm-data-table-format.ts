import type { CrmOnlinePresence } from "./types";

export const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

export const ONLINE_TONE: Record<CrmOnlinePresence, string> = {
  Active: "bg-emerald-500",
  Idle: "bg-amber-500",
  Offline: "bg-muted-foreground",
};

export function dicebearAvatar(seed: string, size = 24): string {
  return `https://api.dicebear.com/10.x/blobs/svg?seed=${encodeURIComponent(seed)}&size=${size}`;
}
