"use client";

import { useEffect, useRef } from "react";

import { createPaletteReader } from "@/components/ascii-ocean/palette";
import type {
  CreatureSpecies,
  OceanColors,
  OceanScene,
} from "@/components/ascii-ocean/creatures/types";
import { AsciiRenderer } from "@/components/ascii-ocean/renderer";
import { World, type WorldEvent } from "@/components/ascii-ocean/world";

export type TheatreProps = {
  species: CreatureSpecies[];
  colors: OceanColors;
  /** The water: open sea or koi pond. */
  scene: OceanScene;
  /** Bait fish in the water. */
  fish: boolean;
  seed: number;
};

/** One logged world event, stamped with the world clock. */
export type OceanLogEntry = { t: number; kind: WorldEvent["kind"]; x: number; y: number };

declare global {
  interface Window {
    __oceanWorld?: World;
    __oceanLog?: OceanLogEntry[];
  }
}

/** Event log cap; the oldest entries drop first. */
const LOG_CAP = 2000;
/** Full-viewport ASCII Ocean with the chosen species swimming. Development only. */
export function Theatre({ species, colors, scene, fish, seed }: TheatreProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const world = new World({
      roster: species.map((s) => ({ species: s, rel: 1, depth: 1 })),
      seed,
      scene,
      baitFish: fish ? "auto" : false,
    });
    const renderer = new AsciiRenderer(canvas);
    renderer.setColors(colors);
    // Same scene and seed as the world above.
    renderer.setScene(scene, seed ?? 0);
    renderer.setFontFamily(getComputedStyle(canvas).fontFamily);
    renderer.setPalette(createPaletteReader()(canvas));
    window.__oceanWorld = world;
    window.__oceanLog = [];

    // The renderer draws (and clears world.events) only once sized, so the loop waits for the first resize.
    let sized = false;
    // Same resize as the specimen: layout size, capped device pixel ratio.
    const resize = () => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (width < 1 || height < 1) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      renderer.resize(width, height, dpr);
      world.resize(width, height, renderer.cellWidth, renderer.cellHeight);
      sized = true;
    };

    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (!sized) {
        raf = requestAnimationFrame(frame);
        return;
      }
      world.step(dt);
      // The renderer clears world.events once it has drawn them, so log them first.
      const log = window.__oceanLog ?? [];
      for (const e of world.events) log.push({ t: world.time, kind: e.kind, x: e.x, y: e.y });
      if (log.length > LOG_CAP) log.splice(0, log.length - LOG_CAP);
      renderer.render(world, dt);
      raf = requestAnimationFrame(frame);
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      delete window.__oceanWorld;
      delete window.__oceanLog;
    };
  }, [species, colors, scene, fish, seed]);

  return (
    <div className="relative min-h-[70vh] flex-1">
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="bg-background text-foreground absolute inset-0 block size-full font-mono"
      />
    </div>
  );
}
