"use client";

import { useSyncExternalStore } from "react";

import {
  DEFAULT_THEME_PALETTE,
  isThemePalette,
  THEME_PALETTE_ATTRIBUTE,
  THEME_PALETTE_STORAGE_KEY,
  type ThemePalette,
} from "./theme-palette-config";

export {
  DEFAULT_THEME_PALETTE,
  getThemePaletteScript,
  isThemePalette,
  THEME_PALETTE_ATTRIBUTE,
  THEME_PALETTE_STORAGE_KEY,
  THEME_PALETTES,
  type ThemePalette,
} from "./theme-palette-config";

const listeners = new Set<() => void>();
let currentPalette: ThemePalette = DEFAULT_THEME_PALETTE;

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getThemePalette(): ThemePalette {
  return currentPalette;
}

function getServerThemePalette(): ThemePalette {
  return DEFAULT_THEME_PALETTE;
}

export function setThemePalette(palette: ThemePalette): void {
  currentPalette = palette;

  if (typeof document !== "undefined") {
    document.documentElement.setAttribute(THEME_PALETTE_ATTRIBUTE, palette);
  }

  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(THEME_PALETTE_STORAGE_KEY, palette);
    } catch {
      // localStorage can throw in private mode; the attribute still applies for the session.
    }
  }

  emit();
}

export function syncThemePaletteFromDom(): void {
  if (typeof document === "undefined") return;

  const attribute = document.documentElement.getAttribute(THEME_PALETTE_ATTRIBUTE);
  if (!isThemePalette(attribute) || attribute === currentPalette) return;

  currentPalette = attribute;
  emit();
}

export function useThemePalette() {
  const palette = useSyncExternalStore(subscribe, getThemePalette, getServerThemePalette);

  return { palette, setPalette: setThemePalette };
}
