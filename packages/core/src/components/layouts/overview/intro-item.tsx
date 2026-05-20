import type { ComponentProps } from "react";

import { cn } from "../../../lib/utils";

export function IntroItem({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex items-center gap-4 font-mono text-sm", className)} {...props} />;
}

export function IntroItemIcon({ className, ...props }: ComponentProps<"div">) {
  return (
    <div className={cn("flex size-4 shrink-0 items-center justify-center", className)} {...props} />
  );
}

export function IntroItemContent({ className, ...props }: ComponentProps<"p">) {
  return <p className={cn("text-balance", className)} {...props} />;
}

export function IntroItemLink({ className, ...props }: ComponentProps<"a">) {
  return (
    <a
      className={cn("hover:text-primary underline-offset-4 hover:underline", className)}
      target="_blank"
      rel="noopener"
      {...props}
    />
  );
}
