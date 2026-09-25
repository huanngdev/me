"use client";

import { Palette } from "lucide-react";

import { clickSoftSound } from "../lib/click-soft";
import { playSound } from "../lib/sound-engine";
import { isThemePalette, THEME_PALETTES, useThemePalette } from "../lib/theme-palette";
import { Button } from "./button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "./dropdown-menu";

export function PaletteToggle() {
  const { palette, setPalette } = useThemePalette();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" aria-label="Change color palette">
          <Palette className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        <DropdownMenuLabel>Theme palette</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={palette}
          onValueChange={(value) => {
            if (!isThemePalette(value)) return;
            void playSound(clickSoftSound.dataUri, { volume: 0.5 }).catch(() => {});
            setPalette(value);
          }}
        >
          {THEME_PALETTES.map((item) => (
            <DropdownMenuRadioItem key={item.value} value={item.value}>
              <span
                aria-hidden="true"
                className="border-border flex size-4 items-center justify-center rounded-full border"
                style={{ backgroundColor: item.surface }}
              >
                <span className="size-2 rounded-full" style={{ backgroundColor: item.accent }} />
              </span>
              {item.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
