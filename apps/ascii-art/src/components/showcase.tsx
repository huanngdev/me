"use client";

import {
  AsciiOcean,
  type CreatureGroup,
  type OceanScene,
} from "@repo/core/components/ascii-ocean/ascii-ocean";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/core/components/select";

import { GLASS_ITEM, GLASS_PILL, GLASS_POPUP } from "@/lib/glass";

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

/** One of the showcase scene presets. */
export type PresetId = keyof typeof PRESETS;

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

/** The scene picker for the header row. */
export function ScenePicker({
  value,
  onChange,
}: {
  value: PresetId;
  onChange: (value: PresetId) => void;
}) {
  return (
    <Select value={value} onValueChange={(v) => isPresetId(v) && onChange(v)}>
      <SelectTrigger
        className={`${GLASS_PILL} w-36 px-3 data-[size=default]:h-10 sm:w-48 sm:px-4`}
        aria-label="Scene"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent className={GLASS_POPUP}>
        {PRESET_IDS.map((id) => (
          <SelectItem key={id} value={id} className={GLASS_ITEM}>
            {PRESETS[id].label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** The preset's ocean as a full-screen background. Changing the preset remounts it. */
export function ShowcaseOcean({ preset }: { preset: PresetId }) {
  return (
    <>
      <AsciiOcean
        key={preset}
        creatures={PRESETS[preset].creatures}
        scene={PRESETS[preset].scene}
        className="fixed inset-0"
      />
      <p className="text-muted-foreground pointer-events-none fixed right-4 bottom-4 text-xs">
        Every animal is drawn with text characters. Click the water to make a splash.
      </p>
    </>
  );
}
