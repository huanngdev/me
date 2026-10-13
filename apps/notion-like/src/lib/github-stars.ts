import { SITE } from "./site";

const compactNumber = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export function formatCount(value: number): string {
  return compactNumber.format(value).replace("K", "k");
}

// Returns null on any failure (network, rate limit, unexpected body) so the
// header renders without a count instead of breaking the page or the build.
export async function getGitHubStars(): Promise<number | null> {
  try {
    const headers: Record<string, string> = { Accept: "application/vnd.github+json" };
    const token = process.env.GITHUB_TOKEN;
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`https://api.github.com/repos/${SITE.repoSlug}`, {
      headers,
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      return null;
    }

    const data: unknown = await response.json();
    if (typeof data !== "object" || data === null || !("stargazers_count" in data)) {
      return null;
    }

    const stars = data.stargazers_count;
    return typeof stars === "number" && Number.isFinite(stars) ? stars : null;
  } catch {
    return null;
  }
}
