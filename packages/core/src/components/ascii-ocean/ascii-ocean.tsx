"use client";

import { useEffect, useRef } from "react";

import { cn } from "../../lib/utils";
import { OceanEngine } from "./engine";
import type { SharkSpec } from "./world";

export type { SharkKind, SharkSpec } from "./world";

export type AsciiOceanProps = {
  sharks?: SharkSpec[];
  className?: string;
};

/**
 * Glyphs come from the canvas's font-family, so give the canvas (or a parent) a monospace font.
 * Colours come from the canvas's `background-color` and `color`, and follow the site theme live;
 * override them with classes to theme it differently.
 * The roster is fixed for the life of the canvas; change `key` to swap it.
 */
export function AsciiOcean({ sharks, className }: AsciiOceanProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = new OceanEngine(canvas, sharks);
    return () => engine.destroy();
    // The roster is read once per canvas; a new array identity must not restart the simulation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={cn("bg-background text-foreground block size-full font-mono", className)}
    />
  );
}
