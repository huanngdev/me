"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@repo/core/components/button";
import { Input } from "@repo/core/components/input";
import { Label } from "@repo/core/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/core/components/select";
import { TileTreemap, type TileTreemapItem } from "@repo/core/components/tile-treemap";

type Preset = {
  label: string;
  items: TileTreemapItem[];
};

const PRESETS = {
  languages: {
    label: "Languages",
    items: [
      { label: "TypeScript", value: 42 },
      { label: "JavaScript", value: 23 },
      { label: "Python", value: 14 },
      { label: "Rust", value: 9 },
      { label: "Go", value: 7 },
      { label: "CSS", value: 5 },
    ],
  },
  browsers: {
    label: "Browsers",
    items: [
      { label: "Chrome", value: 65 },
      { label: "Safari", value: 18 },
      { label: "Edge", value: 9 },
      { label: "Firefox", value: 5 },
      { label: "Opera", value: 3 },
    ],
  },
  budget: {
    label: "Budget",
    items: [
      { label: "Engineering", value: 45 },
      { label: "Design", value: 20 },
      { label: "Marketing", value: 18 },
      { label: "Operations", value: 12 },
      { label: "Research", value: 5 },
    ],
  },
} satisfies Record<string, Preset>;

type PresetId = keyof typeof PRESETS;

const PRESET_IDS: PresetId[] = ["languages", "browsers", "budget"];

function isPresetId(value: string): value is PresetId {
  return value in PRESETS;
}

const cloneItems = (items: TileTreemapItem[]) => items.map((item) => ({ ...item }));

export function TileTreemapDemo() {
  const [preset, setPreset] = useState<PresetId>("languages");
  const [items, setItems] = useState<TileTreemapItem[]>(() => cloneItems(PRESETS.languages.items));

  const handlePresetChange = (value: string) => {
    if (!isPresetId(value)) return;
    setPreset(value);
    setItems(cloneItems(PRESETS[value].items));
  };

  const updateItem = (index: number, patch: Partial<TileTreemapItem>) => {
    setItems((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)),
    );
  };

  const addItem = () => {
    setItems((current) => [...current, { label: `Item ${current.length + 1}`, value: 10 }]);
  };

  const removeItem = (index: number) => {
    setItems((current) => current.filter((_, itemIndex) => itemIndex !== index));
  };

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1 space-y-2">
          <Label htmlFor="treemap-preset">Dataset</Label>
          <Select value={preset} onValueChange={handlePresetChange}>
            <SelectTrigger className="h-11 w-full sm:h-8" id="treemap-preset">
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
        <Button className="h-11 sm:h-8" onClick={addItem} type="button" variant="outline">
          <Plus />
          Add item
        </Button>
      </div>

      <TileTreemap data={items} />

      <div className="space-y-2">
        <p className="text-muted-foreground text-xs">
          Edit labels and values to reshape the tiles.
        </p>
        {items.map((item, index) => (
          <div key={index} className="flex items-center gap-2">
            <Input
              aria-label={`Label ${index + 1}`}
              className="h-11 min-w-0 flex-1 sm:h-8"
              onChange={(event) => updateItem(index, { label: event.target.value })}
              value={item.label}
            />
            <Input
              aria-label={`Value ${index + 1}`}
              className="h-11 w-24 shrink-0 sm:h-8"
              min={0}
              onChange={(event) => updateItem(index, { value: Number(event.target.value) })}
              type="number"
              value={item.value}
            />
            <Button
              aria-label={`Remove ${item.label}`}
              className="size-11 shrink-0 sm:size-8"
              onClick={() => removeItem(index)}
              size="icon"
              type="button"
              variant="ghost"
            >
              <Trash2 />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
