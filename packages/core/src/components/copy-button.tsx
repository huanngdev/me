"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";

import { Button } from "./button";
import { cn } from "../lib/utils";

type CopyButtonProps = Omit<React.ComponentProps<typeof Button>, "onClick" | "children"> & {
  text: string;
  onCopy?: (text: string) => void;
};

export function CopyButton({
  text,
  onCopy,
  className,
  variant = "ghost",
  size = "icon",
  "aria-label": ariaLabel = "Copy to clipboard",
  ...props
}: CopyButtonProps) {
  const [copied, setCopied] = React.useState(false);
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const handleClick = async () => {
    if (copied) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      onCopy?.(text);
      timeoutRef.current = setTimeout(() => setCopied(false), 1000);
    } catch {
      // clipboard write failed; leave state as-is
    }
  };

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      onClick={handleClick}
      disabled={copied}
      aria-label={copied ? "Copied" : ariaLabel}
      data-copied={copied || undefined}
      className={cn("relative disabled:opacity-100", className)}
      {...props}
    >
      <Copy
        className={cn(
          "transition-all duration-200",
          copied ? "scale-0 opacity-0" : "scale-100 opacity-100",
        )}
      />
      <Check
        className={cn(
          "absolute transition-all duration-200",
          copied ? "scale-100 opacity-100" : "scale-0 opacity-0",
        )}
      />
    </Button>
  );
}
