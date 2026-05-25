import { Suspense } from "react";

import { GitHubContributions, GitHubContributionsFallback } from "../../github-contributions";
import { getCachedContributions } from "../../../lib/get-cached-contributions";
import { getCachedGitHubStats } from "../../../lib/get-cached-github-stats";
import { GitHubStats, GitHubStatsFallback } from "./github-stats";
import { TechStack } from "./tech-stack";
import { Separator } from "../../separator";
import { cn } from "../../../lib/utils";

const GITHUB_USERNAME = "huanngdev";
const GITHUB_PROFILE_URL = "https://github.com/huanngdev";

export function CodingSection() {
  const contributions = getCachedContributions(GITHUB_USERNAME);
  const stats = getCachedGitHubStats(GITHUB_USERNAME);

  return (
    <section id="coding">
      <div className="mx-auto w-full max-w-4xl border-x">
        <h2 className="sr-only">Coding</h2>

        <div className="px-4 py-6 sm:px-2 sm:py-4">
          <Suspense fallback={<GitHubContributionsFallback />}>
            <GitHubContributions
              contributions={contributions}
              githubProfileUrl={GITHUB_PROFILE_URL}
              className={cn(
                // GitHub Default Theme
                '**:data-[level="0"]:fill-[#eff2f5] dark:**:data-[level="0"]:fill-[#151b23]',
                '**:data-[level="1"]:fill-[#aceebb] dark:**:data-[level="1"]:fill-[#033a16]',
                '**:data-[level="2"]:fill-[#4ac26b] dark:**:data-[level="2"]:fill-[#196c2e]',
                '**:data-[level="3"]:fill-[#2da44e] dark:**:data-[level="3"]:fill-[#2ea043]',
                '**:data-[level="4"]:fill-[#116329] dark:**:data-[level="4"]:fill-[#56d364]',
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
        <div className="px-4 py-4 sm:px-6 sm:py-5 lg:px-8">
          <TechStack />
        </div>
      </div>
    </section>
  );
}
