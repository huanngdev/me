import { KEYS } from "platejs";

export type EditorElementRule = {
  type: string;
  attrs: readonly string[];
};

export type EditorMarkRule = {
  type: string;
  values?: readonly string[];
};

// Proposed Notion-like palette. The stored mark is the token name, not a CSS color.
export const PALETTE_TOKENS = [
  "gray",
  "brown",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
  "pink",
  "red",
] as const;

export type PaletteToken = (typeof PALETTE_TOKENS)[number];

export const TEXT_COLOR_TOKENS = PALETTE_TOKENS;
export type TextColorToken = PaletteToken;

export const HIGHLIGHT_TOKENS = PALETTE_TOKENS;
export type HighlightToken = PaletteToken;

// Proposed sizes. The stored mark is the CSS length; clearing it inherits the paragraph size.
export const FONT_SIZES = ["12px", "14px", "16px", "18px", "24px", "32px"] as const;

export type FontSize = (typeof FONT_SIZES)[number];

// Proposed families. The stored mark is the token; clearing it inherits the page font.
export const FONT_FAMILIES = ["sans", "serif", "mono"] as const;

export type FontFamily = (typeof FONT_FAMILIES)[number];

export const EDITOR_ELEMENT_RULES = [
  { type: "p", attrs: ["id"] },
] as const satisfies readonly EditorElementRule[];

export const EDITOR_MARK_RULES: readonly EditorMarkRule[] = [
  { type: KEYS.bold },
  { type: KEYS.italic },
  { type: KEYS.underline },
  { type: KEYS.strikethrough },
  { type: KEYS.code },
  { type: KEYS.sup },
  { type: KEYS.sub },
  { type: KEYS.color, values: PALETTE_TOKENS },
  { type: KEYS.backgroundColor, values: PALETTE_TOKENS },
  { type: KEYS.fontSize, values: FONT_SIZES },
  { type: KEYS.fontFamily, values: FONT_FAMILIES },
];

const elementAttrs = new Map<string, ReadonlySet<string>>(
  EDITOR_ELEMENT_RULES.map((rule) => [rule.type, new Set<string>(rule.attrs)]),
);

const allowedMarks = new Set<string>(EDITOR_MARK_RULES.map((rule) => rule.type));

const markValues = new Map<string, readonly string[]>(
  EDITOR_MARK_RULES.flatMap((rule) =>
    rule.values === undefined ? [] : [[rule.type, rule.values]],
  ),
);

export function allowedElementAttrs(type: string): ReadonlySet<string> | undefined {
  return elementAttrs.get(type);
}

export function isAllowedMark(mark: string): boolean {
  return allowedMarks.has(mark);
}

export function allowedMarkValues(mark: string): readonly string[] | undefined {
  return markValues.get(mark);
}

export function isAllowedMarkValue(mark: string, value: unknown): boolean {
  const values = allowedMarkValues(mark);
  if (values === undefined) {
    return true;
  }

  return isAllowedValue(value, values);
}

export function isAllowedValue<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === "string" && values.some((allowed) => allowed === value);
}

export function isPaletteToken(value: unknown): value is PaletteToken {
  return isAllowedValue(value, PALETTE_TOKENS);
}
