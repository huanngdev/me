import { BadgeCheck } from "lucide-react";

import { IDENTITY } from "../../constants";
import { Avatar, AvatarFallback, AvatarImage } from "../avatar";
import { StripedPattern } from "../striped-pattern";
import { CopyButton } from "../copy-button";
import { TypingAnimation } from "../typing-animation";

const ROLE_WORDS = [
  "Fullstack Engineer",
  "Frontend Engineer",
  "Backend Engineer",
  "Blockchain Engineer",
  "Build fast",
  "Ship fast",
  "Bug free",
  "Pixel perfect",
  "Type safe",
];

export function ProfileSection() {
  return (
    <section id="profile">
      <div className="mx-auto flex max-w-4xl border-x">
        <div className="border-border relative size-28 shrink-0 overflow-hidden border-r sm:size-44">
          <StripedPattern className="bg-muted-foreground/5 -z-10 rounded-full" />
          <Avatar className="relative size-full bg-transparent">
            <AvatarImage
              src="/images/avatar-nft-monkey.svg"
              alt={IDENTITY.displayName}
              className="scale-100 object-cover object-bottom"
            />
            <AvatarFallback className="bg-zinc-100 text-base font-medium">
              {IDENTITY.displayName
                .split(" ")
                .map((part) => part[0])
                .slice(0, 2)
                .join("")}
            </AvatarFallback>
          </Avatar>
        </div>

        <div className="flex flex-1 flex-col">
          <div className="border-border">
            <div className="flex items-center justify-start gap-2 px-4 py-2">
              <h1 className="-translate-y-px text-2xl font-semibold tracking-tight sm:text-3xl">
                {IDENTITY.displayName}
              </h1>
              <BadgeCheck
                className="text-background size-4 sm:size-5"
                aria-label="Verified"
                fill="blue"
              />
              <CopyButton text={IDENTITY.displayName} className="ml-2" />
            </div>

            <div className="text-muted-foreground border-y px-4 py-2 text-left text-sm">
              <TypingAnimation words={ROLE_WORDS} loop className="leading-none tracking-normal" />
            </div>
            <p className="text-muted-foreground hidden px-4 py-2 text-sm italic sm:block sm:text-sm">
              {IDENTITY.description}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
