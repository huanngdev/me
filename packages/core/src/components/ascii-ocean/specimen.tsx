"use client";

import { useEffect, useRef } from "react";

import { cn } from "../../lib/utils";
import { createPaletteReader } from "./palette";
import { AsciiRenderer } from "./renderer";
import type { CreatureSpecies, OceanColors } from "./creatures/types";
import { SPINE_NODES, World } from "./world";

export type SpecimenProps = {
  species: CreatureSpecies;
  /** Coat for species that have them (koi varieties). Default: the species' default coat. */
  coat?: string;
  colors?: OceanColors;
  swim?: boolean;
  className?: string;
};

/**
 * One animal in place, for the species sheet. The body is posed straight across the canvas
 * (snout right, heading 0) and never moves; with `swim` it only undulates, like AsciiOcean's animals.
 */
export function Specimen({
  species,
  coat,
  colors = "natural",
  swim = false,
  className,
}: SpecimenProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const world = new World({
      roster: [{ species, rel: 1, depth: 1, coat }],
      baitFish: false,
      seed: 1,
    });
    const renderer = new AsciiRenderer(canvas);
    renderer.setColors(colors);
    // Same scene and seed as the world above.
    renderer.setScene("ocean", 1);
    renderer.setFontFamily(getComputedStyle(canvas).fontFamily);
    renderer.setPalette(createPaletteReader()(canvas));
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    const pose = () => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const cx = width / 2;
      const cy = height / 2;
      // Fit the animal to the cell: the body runs about 60% of the width, but never taller than the cell.
      const L = Math.min(width * 0.6, height * 1.25);
      for (const sh of world.creatures) {
        sh.length = L;
        const seg = L / (SPINE_NODES - 1);
        sh.heading = 0;
        sh.speed = 40;
        sh.turn = 0;
        for (let k = 0; k < SPINE_NODES; k++) {
          sh.nodes[k * 2] = cx + L / 2 - k * seg;
          sh.nodes[k * 2 + 1] = cy;
        }
      }
    };

    // Same resize as OceanEngine: layout size, capped device pixel ratio.
    const resize = () => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (width < 1 || height < 1) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      renderer.resize(width, height, dpr);
      world.resize(width, height, renderer.cellWidth, renderer.cellHeight);
      pose();
      if (reducedMotion.matches) renderer.render(world, 1 / 60);
    };

    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (swim) {
        // Tail-beat clock at the speed the pose is set to (40), without moving the body.
        for (const sh of world.creatures) sh.phase += dt * (2 + 40 / 24);
      }
      renderer.render(world, dt);
      raf = requestAnimationFrame(frame);
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    if (!reducedMotion.matches) raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
    };
  }, [species, coat, colors, swim]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={cn("bg-background text-foreground block size-full font-mono", className)}
    />
  );
}
