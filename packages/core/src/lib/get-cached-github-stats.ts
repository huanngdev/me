/* eslint-disable no-console */
"use server";

import { unstable_cache } from "next/cache";

export type GitHubStatsData = {
  commits: number;
  repos: number;
  stars: number;
  followers: number;
};

const EMPTY: GitHubStatsData = { commits: 0, repos: 0, stars: 0, followers: 0 };

const QUERY = `
  query ($username: String!) {
    user(login: $username) {
      followers { totalCount }
      repositories(
        first: 100
        privacy: PUBLIC
        ownerAffiliations: OWNER
        isFork: false
      ) {
        totalCount
        nodes { stargazerCount }
      }
      contributionsCollection {
        totalCommitContributions
      }
    }
  }
`;

type GraphQLResponse = {
  data?: {
    user?: {
      followers: { totalCount: number };
      repositories: {
        totalCount: number;
        nodes: { stargazerCount: number }[];
      };
      contributionsCollection: { totalCommitContributions: number };
    };
  };
};

export const getCachedGitHubStats = unstable_cache(
  async (username: string): Promise<GitHubStatsData> => {
    const token = process.env.GITHUB_TOKEN;
    if (!token) return EMPTY;

    const res = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: QUERY, variables: { username } }),
    });

    if (!res.ok) return EMPTY;

    const json = (await res.json()) as GraphQLResponse;
    console.log("GitHub API response status:", json);
    const user = json.data?.user;
    if (!user) return EMPTY;

    return {
      commits: user.contributionsCollection.totalCommitContributions,
      repos: user.repositories.totalCount,
      stars: user.repositories.nodes.reduce((sum, r) => sum + r.stargazerCount, 0),
      followers: user.followers.totalCount,
    };
  },
  ["github-stats"],
  { revalidate: 86400 },
);
