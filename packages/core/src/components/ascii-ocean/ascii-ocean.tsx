"use client";

import { type Ref, useEffect, useImperativeHandle, useRef } from "react";

import { cn } from "../../lib/utils";
import { createRng } from "./math";
import { OceanEngine } from "./engine";
import { type RosterEntry, rosterFromGroups, rosterFromSharks } from "./creatures/roster";
import type {
  CreatureGroup,
  OceanColors,
  OceanInteraction,
  OceanScale,
  OceanScene,
} from "./creatures/types";
import type { SharkSpec } from "./world";

export type {
  CreatureSpecies,
  CreatureGroup,
  KoiVariety,
  OceanColors,
  OceanInteraction,
  OceanScale,
  OceanScene,
} from "./creatures/types";
export type { SharkKind, SharkSpec } from "./world";

export type AsciiOceanHandle = {
  /** Makes a random animal that can jump do its jump; returns how long it lasts in seconds, or 0 when none can jump right now. */
  playJump(): number;
  /** Whether the roster has any animal that can jump at all. */
  hasJumpers(): boolean;
};

export type AsciiOceanProps = {
  /** Imperative handle: `playJump()` triggers a random jump, `hasJumpers()` says whether any animal can jump. */
  ref?: Ref<AsciiOceanHandle>;
  /** Animals to put in the water, each with an optional count and size. */
  creatures?: CreatureGroup[];
  /** @deprecated Use `creatures`. Still supported. */
  sharks?: SharkSpec[];
  /** "pond" turns bait fish off unless `baitFish` says otherwise. Default "ocean". */
  scene?: OceanScene;
  /** Bait fish population: a multiple of the area default, "auto", or false for none. */
  baitFish?: number | "auto" | false;
  /** "true" keeps real length ratios between species; "stylized" compresses them. Default "stylized". */
  scale?: OceanScale;
  /** What a press does: "feed" drops food and nearby animals swim over to eat, each in its own way; "splash" flashes the water; "none" ignores presses. Default "feed". */
  interaction?: OceanInteraction;
  /** "natural" paints animals in their real colours on any theme; "theme" keeps them greyscale and inverts them on light backgrounds. Default "natural". */
  colors?: OceanColors;
  /** Sea surface (swell, sun glitter, wind streaks) and wakes (natural colours only). Turn off for a calmer background. Default true. */
  surface?: boolean;
  /** Same seed, same scene: positions and choices repeat exactly. Omit for a different ocean each mount. */
  seed?: number;
  className?: string;
};

/**
 * Glyphs come from the canvas's font-family, so give the canvas (or a parent) a monospace font.
 * Colours come from the canvas's `background-color` and `color`, and follow the site theme live;
 * override them with classes to theme it differently.
 * The props are read once per canvas; change `key` to swap the roster or scene.
 */
export function AsciiOcean({
  ref,
  creatures,
  sharks,
  scene = "ocean",
  baitFish,
  scale = "stylized",
  interaction = "feed",
  colors = "natural",
  surface = true,
  seed,
  className,
}: AsciiOceanProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<OceanEngine | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      playJump: () => engineRef.current?.playRandomJump() ?? 0,
      hasJumpers: () => engineRef.current?.hasJumpers() ?? false,
    }),
    [],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let roster: RosterEntry[] | undefined;
    if (creatures) {
      // Separate stream from the world's, so the sim's sequence is the same with or without jitter.
      const rng = seed === undefined ? Math.random : createRng(seed ^ 0x9e3779b9);
      const built = rosterFromGroups(creatures, scale, rng);
      roster = built.entries;
      for (const w of built.warnings) console.warn("[AsciiOcean] " + w);
    } else if (sharks) {
      roster = rosterFromSharks(sharks);
    }
    const engine = new OceanEngine(canvas, {
      roster,
      seed,
      scene,
      baitFish: baitFish ?? (scene === "pond" ? false : "auto"),
      interaction,
      colors,
      surface,
    });
    engineRef.current = engine;
    return () => {
      engineRef.current = null;
      engine.destroy();
    };
    // The props and seed are read once per canvas; a new array identity must not restart the simulation.
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
