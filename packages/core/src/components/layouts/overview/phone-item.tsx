"use client";

import { PhoneIcon } from "lucide-react";

import { CopyButton } from "../../copy-button";
import { IntroItem, IntroItemContent, IntroItemIcon, IntroItemLink } from "./intro-item";

type PhoneItemProps = {
  phoneNumber: string;
};

function formatPhone(raw: string) {
  const match = raw.match(/^(\+\d{1,3})(\d{3})(\d{3})(\d{3,4})$/);
  if (!match) return raw;
  const [, cc, a, b, c] = match;
  return `${cc} ${a} ${b} ${c}`;
}

export function PhoneItem({ phoneNumber }: PhoneItemProps) {
  const formatted = formatPhone(phoneNumber);

  return (
    <IntroItem className="group">
      <IntroItemIcon>
        <PhoneIcon />
      </IntroItemIcon>

      <IntroItemContent className="flex">
        <IntroItemLink href={`tel:${phoneNumber}`}>{formatted}</IntroItemLink>
      </IntroItemContent>

      <div className="-translate-x-3 opacity-0 transition-opacity ease-out group-hover:opacity-100">
        <CopyButton
          className="text-muted-foreground size-5 rounded-md border-none [&_svg:not([class*='size-'])]:size-3.5"
          variant="ghost"
          text={phoneNumber}
        />
      </div>
    </IntroItem>
  );
}
