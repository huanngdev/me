import type { ComponentProps } from "react";

import { cn } from "../../lib/utils";
import { StripedPattern } from "../striped-pattern";

interface StripedSeparatorProps extends ComponentProps<"div"> {
  /**
   * Height of the separator strip. Pass any Tailwind height utility.
   * @defaultValue "h-8"
   */
  height?: string;
  /** Tailwind class controlling the stripe color (uses currentColor). */
  stripeClassName?: string;
  /**
   * Direction of the diagonal lines.
   * @defaultValue "left"
   */
  direction?: "left" | "right";
}

export function StripedSeparator({
  className,
  height = "h-8",
  stripeClassName = "",
  direction = "left",
  ...props
}: StripedSeparatorProps) {
  return (
    <div className={cn("w-full", height, className)} {...props}>
      <div className="border-border relative mx-auto h-full border border-y">
        <StripedPattern direction={direction} className={stripeClassName} />
        <div className="mx-auto h-full w-full max-w-4xl border-x"></div>
      </div>
    </div>
  );
}
