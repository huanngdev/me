import "server-only";

const ON_VERCEL = process.env.VERCEL === "1";

export function getClientIp(h: Headers): string {
  if (!ON_VERCEL) {
    return h.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";
  }
  const xff = h.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return h.get("x-real-ip") || "0.0.0.0";
}
