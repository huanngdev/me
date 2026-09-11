"use client";

import { ArrowLeft } from "lucide-react";

import { cn } from "../lib/utils";
import { Button } from "./button";

export type FixedBackButtonPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export type FixedBackButtonProps = {
  position?: FixedBackButtonPosition;
  label?: string;
  className?: string;
};

const POSITION_CLASS_NAMES: Record<FixedBackButtonPosition, string> = {
  "top-left": "top-4 left-4",
  "top-right": "top-4 right-4",
  "bottom-left": "bottom-4 left-4",
  "bottom-right": "right-4 bottom-4",
};

export function FixedBackButton({
  position = "top-left",
  label = "Go back",
  className,
}: FixedBackButtonProps) {
  const buttonClassName = cn("fixed z-10 rounded-full", POSITION_CLASS_NAMES[position], className);

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className={buttonClassName}
      aria-label={label}
      onClick={() => window.history.back()}
    >
      <ArrowLeft aria-hidden />
    </Button>
  );
}
