import { Button } from "@repo/core/components/button";

import { getGitHubStars, formatCount } from "@/lib/github-stars";
import { SITE } from "@/lib/site";

import { GitHubMark } from "./github-mark";

export async function GitHubLink() {
  const stars = await getGitHubStars();
  const label =
    stars === null
      ? "GitHub repository"
      : `GitHub repository, ${stars} ${stars === 1 ? "star" : "stars"}`;

  return (
    <Button asChild variant="outline" className="px-2 min-[400px]:px-2.5">
      <a href={SITE.repoUrl} target="_blank" rel="noopener noreferrer" aria-label={label}>
        <GitHubMark className="size-4" />
        {stars === null ? null : (
          <span className="hidden tabular-nums min-[400px]:inline">{formatCount(stars)}</span>
        )}
      </a>
    </Button>
  );
}
