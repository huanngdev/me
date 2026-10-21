"use client";

import {
  AsciiOcean,
  type CreatureGroup,
  type OceanScene,
} from "@repo/core/components/ascii-ocean/ascii-ocean";
import { Label } from "@repo/core/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/core/components/select";
import { useState } from "react";

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
  "humpback-pod": {
    label: "Humpbacks and dolphins",
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
  "humpback-pod",
  "koi-pond",
  "shark-gallery",
];

function isPresetId(value: string): value is PresetId {
  return value in PRESETS;
}

export function AsciiOceanDemo() {
  const [preset, setPreset] = useState<PresetId>("open-ocean");

  const handlePresetChange = (value: string) => {
    if (!isPresetId(value)) return;
    setPreset(value);
  };

  return (
    <div className="w-full space-y-4">
      <div className="max-w-xs min-w-0 space-y-2">
        <Label htmlFor="ascii-ocean-scene">Scene</Label>
        <Select value={preset} onValueChange={handlePresetChange}>
          <SelectTrigger className="h-11 w-full min-w-0 sm:h-8" id="ascii-ocean-scene">
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
      </div>

      <AsciiOcean
        key={preset}
        creatures={PRESETS[preset].creatures}
        scene={PRESETS[preset].scene}
        className="aspect-video w-full overflow-hidden rounded-lg"
      />

      <p className="text-muted-foreground text-xs">
        Every animal is drawn with text characters. Pick a scene to see different species. Click the
        water to make a splash.
      </p>
    </div>
  );
}
