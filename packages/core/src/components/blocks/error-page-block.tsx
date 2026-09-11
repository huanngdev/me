import type { LucideIcon } from "lucide-react";
import Link from "next/link";

import { FixedBackButton, type FixedBackButtonProps } from "../fixed-back-button";
import { Button } from "../button";
import { cn } from "../../lib/utils";

export type ErrorPageBlockAction = {
  label: string;
  href: string;
  icon?: LucideIcon;
  appearance?: "solid" | "outline";
};

export type ErrorPageBlockProps = {
  code: string | number;
  message: string;
  description: string;
  actions: readonly ErrorPageBlockAction[];
  backButton?: FixedBackButtonProps | false;
  className?: string;
};

export function ErrorPageBlock({
  code,
  message,
  description,
  actions,
  backButton,
  className,
}: ErrorPageBlockProps) {
  return (
    <section
      className={cn(
        "bg-background @container flex min-h-svh w-full items-center justify-center px-4 py-12 text-center",
        className,
      )}
    >
      {backButton !== false && <FixedBackButton {...backButton} />}
      <div className="flex max-w-2xl flex-col items-center gap-5">
        <p className="text-muted-foreground/80 font-mono text-8xl leading-none font-bold tracking-tighter @sm:text-9xl">
          {code}
        </p>
        <h1 className="text-xl font-semibold tracking-tight @sm:text-2xl">{message}</h1>
        <p className="text-muted-foreground max-w-lg text-base leading-relaxed">{description}</p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {actions.map((action) => {
            const Icon = action.icon;

            return (
              <Button
                key={`${action.label}-${action.href}`}
                asChild
                variant={action.appearance === "outline" ? "outline" : "default"}
              >
                <Link href={action.href}>
                  {Icon && <Icon data-icon="inline-start" aria-hidden />}
                  {action.label}
                </Link>
              </Button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
