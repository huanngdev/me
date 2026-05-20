import type { CSSProperties } from "react";
import { ExternalLink } from "lucide-react";
import { siDiscord, siFacebook, siGithub, siTelegram, siX } from "simple-icons";

import { SOCIAL_LINKS, type SocialPlatform } from "../../constants";
import { cn } from "../../lib/utils";

// LinkedIn was removed from simple-icons (and lucide) on brand request — inline the path.
const LINKEDIN_PATH =
  "M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z";

// Brand path + canonical brand color. `darkColor` is the override for dark mode when
// the brand's primary color is essentially black and would disappear on a dark background.
const BRANDS: Record<SocialPlatform, { path: string; color: string; darkColor?: string }> = {
  github: { path: siGithub.path, color: "#181717", darkColor: "#ffffff" },
  linkedin: { path: LINKEDIN_PATH, color: "#0A66C2" },
  x: { path: siX.path, color: "#000000", darkColor: "#ffffff" },
  telegram: { path: siTelegram.path, color: "#26A5E4" },
  discord: { path: siDiscord.path, color: "#5865F2" },
  facebook: { path: siFacebook.path, color: "#1877F2" },
};

function PlatformIcon({ platform, className }: { platform: SocialPlatform; className?: string }) {
  const b = BRANDS[platform];
  const style = {
    "--brand": b.color,
    "--brand-dark": b.darkColor ?? b.color,
  } as CSSProperties;
  return (
    <svg
      role="img"
      viewBox="0 0 24 24"
      fill="currentColor"
      style={style}
      className={cn("text-(--brand) dark:text-(--brand-dark)", className)}
      aria-hidden="true"
    >
      <path d={b.path} />
    </svg>
  );
}

export function SocialLinksSection() {
  const lastRowStart = SOCIAL_LINKS.length - (SOCIAL_LINKS.length % 3 || 3);
  return (
    <section>
      <div className="mx-auto max-w-4xl border-x">
        <h2 className="sr-only">Links</h2>
        <ul className="grid grid-cols-3">
          {SOCIAL_LINKS.map((link, i) => (
            <li
              key={link.platform}
              className={cn(i < lastRowStart && "border-b", i % 3 !== 2 && "border-r")}
            >
              <a
                href={link.url}
                target="_blank"
                rel="noopener"
                className="group hover:bg-muted/40 flex h-12 items-center gap-3 px-4 transition-colors"
              >
                <PlatformIcon platform={link.platform} className="size-5 shrink-0" />
                <span className="flex-1 truncate text-sm">
                  <span className="font-medium">{link.label}</span>
                  <span className="text-muted-foreground"> {link.handle}</span>
                </span>
                <ExternalLink className="text-muted-foreground size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
