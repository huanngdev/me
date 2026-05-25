import { siGithub } from "simple-icons";

import { REPO_URL } from "../../constants";
import { Button } from "../button";
import { StripedPattern } from "../striped-pattern";
import { ThemeToggle } from "../theme-toggle";
import { CommandPalette } from "./command-palette";
import { DownloadMenu } from "./download-menu";
import { NavMenu } from "./nav-menu";

export function Header() {
  return (
    <header className="bg-background sticky top-1 z-40 w-full border-y backdrop-blur">
      <div className="relative h-14">
        <StripedPattern className="-z-10" />
        <div className="bg-background relative mx-auto flex h-full w-full max-w-4xl items-center justify-between border-x px-4 sm:px-4 lg:px-4">
          <NavMenu />
          <div className="flex h-full items-center gap-2">
            <CommandPalette />
            <DownloadMenu />
            <Button asChild variant="outline" size="icon" aria-label="View source on GitHub">
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
              </a>
            </Button>
            <ThemeToggle />
          </div>
        </div>
      </div>
    </header>
  );
}
