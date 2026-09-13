/* eslint-disable no-console */
import { Suspense } from "react";

import { GitHubContributions, GitHubContributionsFallback } from "../../github-contributions";
import { getCachedContributions } from "../../../lib/get-cached-contributions";
import { getCachedGitHubStats } from "../../../lib/get-cached-github-stats";
import { GitHubStats, GitHubStatsFallback } from "./github-stats";
import { TechStack } from "./tech-stack";
import { Separator } from "../../separator";
import { cn } from "../../../lib/utils";

const GITHUB_USERNAME = "huanngdev";
// Fetch company account contributions and merge them into the same graph.
const GITHUB_COMPANY_USERNAME = "huandevformo";
const GITHUB_ACCOUNTS = [GITHUB_USERNAME, GITHUB_COMPANY_USERNAME];
const GITHUB_PROFILE_URL = "https://github.com/huanngdev";

export function CodingSection() {
  console.info(
    `[github] Coding section requested; data loaders run on the server and cache results for 24 hours ${JSON.stringify(
      {
        usernames: GITHUB_ACCOUNTS,
      },
    )}`,
  );
  const contributions = getCachedContributions(GITHUB_ACCOUNTS);
  const stats = getCachedGitHubStats(GITHUB_USERNAME);

  return (
    <section id="coding">
      <div className="mx-auto w-full max-w-4xl border-x">
        <h2 className="sr-only">Coding</h2>

        <div className="p-6">
          <Suspense fallback={<GitHubContributionsFallback />}>
            <GitHubContributions
              contributions={contributions}
              usernames={GITHUB_ACCOUNTS}
              githubProfileUrl={GITHUB_PROFILE_URL}
              className={cn(
                // Nullframe contribution theme
                '**:data-[level="0"]:bg-[#ebedf0] dark:**:data-[level="0"]:bg-[#1c1c1c]',
                '**:data-[level="1"]:bg-[#d2f4dc] dark:**:data-[level="1"]:bg-[#1e3526]',
                '**:data-[level="2"]:bg-[#9be9a8] dark:**:data-[level="2"]:bg-[#2c5639]',
                '**:data-[level="3"]:bg-[#40c463] dark:**:data-[level="3"]:bg-[#3f8a50]',
                '**:data-[level="4"]:bg-[#30a14e] dark:**:data-[level="4"]:bg-[#62c878]',
              )}
            />
          </Suspense>
        </div>

        <div className="border-t">
          <Suspense fallback={<GitHubStatsFallback />}>
            <GitHubStats stats={stats} />
          </Suspense>
        </div>
      </div>
      <Separator />
      <div className="mx-auto w-full max-w-4xl border-x">
        <TechStack />
      </div>
    </section>
  );
}
