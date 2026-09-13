/* eslint-disable no-console */
import { unstable_cache } from "next/cache";

import type { Activity } from "../components/contribution-graph";

type GitHubContributionsResponse = {
  contributions: Activity[];
};

async function fetchContributions(username: string): Promise<Activity[]> {
  const baseUrl =
    process.env.GITHUB_CONTRIBUTIONS_API_URL || "https://github-contributions-api.jogruber.de";
  const url = `${baseUrl}/v4/${username}?y=last`;
  const startedAt = Date.now();

  console.info(`[github:contributions] Fetching ${JSON.stringify({ username, url })}`);

  let res: Response;
  try {
    res = await fetch(url);
  } catch (error) {
    console.error(
      `[github:contributions] Network error ${JSON.stringify({
        username,
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? { name: error.name, message: error.message } : error,
      })}`,
    );
    throw error;
  }

  console.info(
    `[github:contributions] Response received ${JSON.stringify({
      username,
      status: res.status,
      statusText: res.statusText,
      durationMs: Date.now() - startedAt,
    })}`,
  );

  if (!res.ok) {
    const body = (await res.text()).slice(0, 500);
    console.error(
      `[github:contributions] Request failed ${JSON.stringify({
        username,
        status: res.status,
        body,
      })}`,
    );
    throw new Error(`GitHub contributions request failed with status ${res.status}`);
  }

  const data = (await res.json()) as GitHubContributionsResponse;
  if (!Array.isArray(data.contributions)) {
    console.error(
      `[github:contributions] Unexpected response shape ${JSON.stringify({
        username,
        keys: Object.keys(data),
      })}`,
    );
    throw new Error("GitHub contributions response did not include a contributions array");
  }

  console.info(
    `[github:contributions] Data ready ${JSON.stringify({
      username,
      days: data.contributions.length,
      firstDate: data.contributions.at(0)?.date,
      lastDate: data.contributions.at(-1)?.date,
      total: data.contributions.reduce((sum, activity) => sum + activity.count, 0),
    })}`,
  );

  return data.contributions;
}

function assignLevels(activities: Activity[]): Activity[] {
  const nonZeroCounts = activities
    .filter((activity) => activity.count > 0)
    .map((activity) => activity.count)
    .sort((a, b) => a - b);

  const [q1, q2, q3] = [0.25, 0.5, 0.75].map(
    (percentile) => nonZeroCounts[Math.floor(percentile * nonZeroCounts.length)] ?? 0,
  );

  return activities.map((activity) => {
    if (activity.count === 0) return { ...activity, level: 0 };

    const level =
      activity.count <= q1 ? 1 : activity.count <= q2 ? 2 : activity.count <= q3 ? 3 : 4;

    return { ...activity, level };
  });
}

function mergeContributions(datasets: Activity[][]): Activity[] {
  const byDate = new Map<string, Activity>();

  for (const activities of datasets) {
    for (const activity of activities) {
      const existing = byDate.get(activity.date);
      if (existing) {
        existing.count += activity.count;
      } else {
        byDate.set(activity.date, { ...activity });
      }
    }
  }

  const merged = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  return assignLevels(merged);
}

export const getCachedContributions = unstable_cache(
  async (usernames: string | string[]): Promise<Activity[]> => {
    const accounts = Array.isArray(usernames) ? usernames : [usernames];

    // Fetch the company account alongside the personal account in parallel, so the
    // total latency is the slowest single request instead of the sum of both.
    const datasets = await Promise.all(accounts.map((username) => fetchContributions(username)));

    const merged = mergeContributions(datasets);

    console.info(
      `[github:contributions] Merged accounts ${JSON.stringify({
        accounts,
        days: merged.length,
        total: merged.reduce((sum, activity) => sum + activity.count, 0),
      })}`,
    );

    return merged;
  },
  ["github-contributions"],
  { revalidate: 86400 }, // Cache for 1 day (86400 seconds)
);
