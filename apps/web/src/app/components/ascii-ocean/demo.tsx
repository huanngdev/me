"use client";

import { useState } from "react";

import { AsciiOcean, type SharkSpec } from "@repo/core/components/ascii-ocean/ascii-ocean";
import { Label } from "@repo/core/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/core/components/select";

const PRESETS = {
  classic: {
    label: "Classic",
    sharks: [
      { kind: "classic", size: 1 },
      { kind: "classic", size: 0.7 },
      { kind: "classic", size: 0.84 },
      { kind: "classic", size: 0.77 },
    ],
  },
  hammerheads: {
    label: "Hammerheads",
    sharks: [
      { kind: "hammerhead", size: 1 },
      { kind: "greathammer", size: 0.85 },
    ],
  },
  mixed: {
    label: "Mixed",
    sharks: [
      { kind: "thresher", size: 1 },
      { kind: "tiger", size: 0.9 },
      { kind: "mako", size: 0.8 },
      { kind: "nurse", size: 0.7 },
    ],
  },
} satisfies Record<string, { label: string; sharks: SharkSpec[] }>;

type PresetId = keyof typeof PRESETS;

const PRESET_IDS: PresetId[] = ["classic", "hammerheads", "mixed"];

function isPresetId(value: string): value is PresetId {
  return value in PRESETS;
}

export function AsciiOceanDemo() {
  const [preset, setPreset] = useState<PresetId>("classic");

  const handlePresetChange = (value: string) => {
    if (!isPresetId(value)) return;
    setPreset(value);
  };

  return (
    <div className="w-full space-y-4">
      <div className="max-w-xs min-w-0 space-y-2">
        <Label htmlFor="ascii-ocean-sharks">Sharks</Label>
        <Select value={preset} onValueChange={handlePresetChange}>
          <SelectTrigger className="h-11 w-full sm:h-8" id="ascii-ocean-sharks">
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
        sharks={PRESETS[preset].sharks}
        className="aspect-video w-full overflow-hidden rounded-lg"
      />

      <p className="text-muted-foreground text-xs">
        Move the pointer to scatter fish. Click to splash.
      </p>
    </div>
  );
}
