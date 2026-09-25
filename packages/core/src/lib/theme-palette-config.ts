export const THEME_PALETTES = [
  {
    value: "mono",
    label: "Mono",
    surface: "oklch(1 0 0)",
    accent: "oklch(0.205 0 0)",
  },
  {
    value: "violet",
    label: "Violet",
    surface: "oklch(0.99 0.006 300)",
    accent: "oklch(0.5 0.22 292)",
  },
  {
    value: "ocean",
    label: "Ocean",
    surface: "oklch(0.99 0.006 230)",
    accent: "oklch(0.52 0.16 240)",
  },
  {
    value: "forest",
    label: "Forest",
    surface: "oklch(0.99 0.007 150)",
    accent: "oklch(0.5 0.13 155)",
  },
] as const;

export type ThemePalette = (typeof THEME_PALETTES)[number]["value"];

export const DEFAULT_THEME_PALETTE: ThemePalette = "mono";
export const THEME_PALETTE_STORAGE_KEY = "theme-palette";
export const THEME_PALETTE_ATTRIBUTE = "data-palette";

export function isThemePalette(value: string | null | undefined): value is ThemePalette {
  return THEME_PALETTES.some((palette) => palette.value === value);
}

export function getThemePaletteScript(): string {
  return `(function(){try{var p=localStorage.getItem(${JSON.stringify(
    THEME_PALETTE_STORAGE_KEY,
  )});document.documentElement.setAttribute(${JSON.stringify(
    THEME_PALETTE_ATTRIBUTE,
  )},p||${JSON.stringify(DEFAULT_THEME_PALETTE)})}catch(e){document.documentElement.setAttribute(${JSON.stringify(
    THEME_PALETTE_ATTRIBUTE,
  )},${JSON.stringify(DEFAULT_THEME_PALETTE)})}})();`;
}
