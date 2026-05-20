import React, { useId } from "react";

import { cn } from "../lib/utils";

interface DotPatternProps extends React.SVGProps<SVGSVGElement> {
  gap?: number;
  radius?: number;
}

export function DotPattern({ className, gap = 16, radius = 1, ...props }: DotPatternProps) {
  const id = useId();

  return (
    <svg
      aria-hidden="true"
      className={cn(
        "text-muted-foreground/50 pointer-events-none absolute inset-0 z-10 h-full w-full",
        className,
      )}
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <defs>
        <pattern
          id={id}
          width={gap}
          height={gap}
          patternUnits="userSpaceOnUse"
          patternContentUnits="userSpaceOnUse"
        >
          <circle cx={gap / 2} cy={gap / 2} r={radius} fill="currentColor" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}
