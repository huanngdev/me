"use client";

import { useEffect, useRef, useState } from "react";
import { Play } from "lucide-react";

import {
  AsciiOcean,
  type AsciiOceanHandle,
  type CreatureGroup,
  type CreatureSpecies,
  type OceanScene,
} from "@repo/core/components/ascii-ocean/ascii-ocean";
import { Button } from "@repo/core/components/button";
import { Label } from "@repo/core/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/core/components/select";

const PRESETS = {
  "open-ocean": {
    label: "Open ocean",
    scene: "ocean",
    creatures: [
      { species: "classic", count: 2 },
      { species: "hammerhead" },
      { species: "bottlenose", count: 3 },
      { species: "orca" },
    ],
  },
  "orca-pod": {
    label: "Orca pod",
    scene: "ocean",
    creatures: [{ species: "orca", count: 4 }],
  },
  "humpback-feeding": {
    label: "Humpback feeding",
    scene: "ocean",
    creatures: [{ species: "humpback" }, { species: "bottlenose", count: 2 }],
  },
  "koi-pond": {
    label: "Koi pond",
    scene: "pond",
    creatures: [
      {
        species: "koi",
        count: 7,
        variety: ["kohaku", "sanke", "showa", "tancho", "ogon", "asagi"],
      },
    ],
  },
  "shark-gallery": {
    label: "Shark gallery",
    scene: "ocean",
    creatures: [
      { species: "classic" },
      { species: "hammerhead" },
      { species: "greathammer" },
      { species: "tiger" },
      { species: "mako" },
      { species: "thresher" },
      { species: "nurse" },
      { species: "zebra" },
    ],
  },
} satisfies Record<string, { label: string; scene?: OceanScene; creatures: CreatureGroup[] }>;

type PresetId = keyof typeof PRESETS;

const PRESET_IDS: PresetId[] = [
  "open-ocean",
  "orca-pod",
  "humpback-feeding",
  "koi-pond",
  "shark-gallery",
];

function isPresetId(value: string): value is PresetId {
  return value in PRESETS;
}

/** Species with a jump: bottlenose leap; orca, humpback, classic and mako breach. */
const JUMP_SPECIES: ReadonlySet<CreatureSpecies> = new Set<CreatureSpecies>([
  "bottlenose",
  "orca",
  "humpback",
  "classic",
  "mako",
]);

function hasJumpSpecies(creatures: CreatureGroup[]): boolean {
  return creatures.some((g) => JUMP_SPECIES.has(g.species));
}

export function AsciiOceanDemo() {
  const [preset, setPreset] = useState<PresetId>("open-ocean");
  const [jumping, setJumping] = useState(false);
  const [hint, setHint] = useState(false);
  const jumpRef = useRef<AsciiOceanHandle>(null);
  const endTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const hintTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const clearTimers = () => {
    clearTimeout(endTimer.current);
    clearTimeout(hintTimer.current);
  };

  useEffect(() => () => clearTimers(), []);

  const handlePresetChange = (value: string) => {
    if (!isPresetId(value)) return;
    clearTimers();
    setJumping(false);
    setHint(false);
    setPreset(value);
  };

  // Most animals are near an edge or busy at any moment, so retry for a few seconds before giving up.
  const handlePlay = (tries = 12) => {
    const seconds = jumpRef.current?.playJump() ?? 0;
    clearTimeout(endTimer.current);
    if (seconds > 0) {
      setHint(false);
      setJumping(true);
      endTimer.current = setTimeout(() => setJumping(false), seconds * 1000);
      return;
    }
    if (tries > 0) {
      setJumping(true);
      endTimer.current = setTimeout(() => handlePlay(tries - 1), 250);
      return;
    }
    setJumping(false);
    setHint(true);
    clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setHint(false), 2000);
  };

  const canJump = hasJumpSpecies(PRESETS[preset].creatures);

  return (
    <div className="w-full space-y-4">
      <div className="max-w-xs min-w-0 space-y-2">
        <Label htmlFor="ascii-ocean-scene">Scene</Label>
        <div className="flex gap-2">
          <Select value={preset} onValueChange={handlePresetChange}>
            <SelectTrigger className="h-11 min-w-0 flex-1 sm:h-8" id="ascii-ocean-scene">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRESET_IDS.map((id) => (
                <SelectItem key={id} value={id}>
                  {PRESETS[id].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {canJump && (
            <Button
              className="h-11 sm:h-8"
              disabled={jumping}
              onClick={() => handlePlay()}
              size="sm"
              type="button"
              variant="outline"
            >
              <Play />
              {jumping ? "Playing…" : "Play jump"}
            </Button>
          )}
        </div>
        <p aria-live="polite" className="text-muted-foreground min-h-4 text-xs">
          {hint ? "No one is clear to jump yet. Try again in a moment." : ""}
        </p>
      </div>

      <AsciiOcean
        key={preset}
        ref={jumpRef}
        creatures={PRESETS[preset].creatures}
        scene={PRESETS[preset].scene}
        className="aspect-video w-full overflow-hidden rounded-lg"
      />

      <p className="text-muted-foreground text-xs">
        Click the water to drop food. Nearby animals come to eat, each in its own way.
      </p>
    </div>
  );
}
