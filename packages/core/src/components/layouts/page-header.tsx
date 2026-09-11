import type { ReactNode } from "react";

import { cn } from "../../lib/utils";
import { StripedPattern } from "../striped-pattern";
import { BackButton } from "./back-button";

interface PageHeaderProps {
  title: ReactNode;
  description?: string;
  actions?: ReactNode;
  backHref?: string;
  /** Max-width utility for the content column. Defaults to `max-w-4xl`; the World Cup
   *  page widens it so the header lines up with the wider schedule. */
  maxWidthClassName?: string;
}

export function PageHeader({
  title,
  description,
  actions,
  backHref,
  maxWidthClassName = "max-w-4xl",
}: PageHeaderProps) {
  return (
    <>
      <div className="relative w-full border-b">
        <div
          className={cn(
            "bg-background relative mx-auto flex w-full items-center gap-2 border-x px-4 py-3 sm:px-6 lg:px-8",
            maxWidthClassName,
          )}
        >
          <BackButton href={backHref} />
          {actions}
        </div>
      </div>

      <div className="relative w-full border-b">
        <StripedPattern className="-z-10" />
        <header
          className={cn(
            "bg-background relative mx-auto flex w-full items-center justify-between gap-4 border-x px-4 py-6 sm:px-6 sm:py-4 lg:px-8",
            maxWidthClassName,
          )}
        >
          <h1 className="flex shrink-0 items-center gap-2 text-2xl font-semibold tracking-tight">
            {title}
          </h1>
          {description && (
            <p className="text-muted-foreground min-w-0 truncate text-right text-sm">
              {description}
            </p>
          )}
        </header>
      </div>
    </>
  );
}
