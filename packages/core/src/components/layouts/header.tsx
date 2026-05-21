import Link from "next/link";
import { siGithub } from "simple-icons";

import { REPO_URL } from "../../constants";
import { Button } from "../button";
import { StripedPattern } from "../striped-pattern";
import { ThemeToggle } from "../theme-toggle";
import { DownloadMenu } from "./download-menu";
import { ExternalLink } from "lucide-react";

const NAV_ITEMS = [
  { href: "/#projects", label: "Projects" },
  { href: "/#components", label: "Components" },
  { href: "/#blog", label: "Blog" },
] as const;

export function Header() {
  return (
    <header className="bg-background sticky top-1 z-40 w-full border-y backdrop-blur">
      <div className="relative h-14">
        <StripedPattern className="-z-10" />
        <div className="bg-background relative mx-auto flex h-full max-w-4xl items-center justify-end border-x px-4 sm:px-6 lg:px-8">
          {/* <Link href="/" className="font-mono font-normal tracking-tight">
            {IDENTITY.displayName}
          </Link> */}
          <div className="flex h-full items-center gap-2 border-l sm:pl-6 lg:pl-8">
            <Button asChild variant="outline" aria-label="View source on GitHub">
              <a href={REPO_URL} target="_blank" rel="noreferrer noopener">
                <svg
                  role="img"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="currentColor"
                  className="size-4"
                >
                  <title>{siGithub.title}</title>
                  <path d={siGithub.path} />
                </svg>
                Repo
                <ExternalLink className="ml-1 size-4" />
              </a>
            </Button>
            <DownloadMenu />
            <ThemeToggle />
          </div>
        </div>
      </div>
    </header>
  );
}
