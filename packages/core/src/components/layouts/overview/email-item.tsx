"use client";

import { MailIcon } from "lucide-react";

import { CopyButton } from "../../copy-button";
import { IntroItem, IntroItemContent, IntroItemIcon, IntroItemLink } from "./intro-item";

type EmailItemProps = {
  email: string;
};

export function EmailItem({ email }: EmailItemProps) {
  return (
    <IntroItem className="group">
      <IntroItemIcon>
        <MailIcon />
      </IntroItemIcon>

      <IntroItemContent className="flex">
        <IntroItemLink href={`mailto:${email}`}>{email}</IntroItemLink>
      </IntroItemContent>

      <div className="-translate-x-3 opacity-0 transition-opacity ease-out group-hover:opacity-100">
        <CopyButton
          className="text-muted-foreground size-5 rounded-md border-none [&_svg:not([class*='size-'])]:size-3.5"
          variant="ghost"
          text={email}
        />
      </div>
    </IntroItem>
  );
}
