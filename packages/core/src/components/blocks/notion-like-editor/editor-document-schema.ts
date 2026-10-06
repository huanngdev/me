import { KEYS } from "platejs";

export type EditorElementRule = {
  type: string;
  attrs: readonly string[];
  attrValues?: Readonly<Record<string, readonly (string | number)[]>>;
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

// Stored on the block. Plate's default "start" is absence of the attribute, not a value.
export const TEXT_ALIGNS = ["left", "center", "right", "justify"] as const;

export type TextAlign = (typeof TEXT_ALIGNS)[number];

// Proposed line heights. The stored attribute is the unitless number; clearing it inherits leading-relaxed.
export const LINE_HEIGHTS = [1, 1.25, 1.5, 1.75, 2] as const;

export type LineHeight = (typeof LINE_HEIGHTS)[number];

const headingElementRule = {
  attrs: ["id", "align"],
  attrValues: { align: TEXT_ALIGNS },
} as const;

export const EDITOR_ELEMENT_RULES = [
  {
    type: "p",
    attrs: ["id", "align", "lineHeight"],
    attrValues: { align: TEXT_ALIGNS, lineHeight: LINE_HEIGHTS },
  },
  // Headings do not take lineHeight. Their leading is fixed by the heading component.
  { type: "h1", ...headingElementRule },
  { type: "h2", ...headingElementRule },
  { type: "h3", ...headingElementRule },
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

export const CLEARABLE_MARK_KEYS: readonly string[] = EDITOR_MARK_RULES.map((rule) => rule.type);

const elementAttrs = new Map<string, ReadonlySet<string>>(
  EDITOR_ELEMENT_RULES.map((rule) => [rule.type, new Set<string>(rule.attrs)]),
);

const elementAttrValues = new Map<string, ReadonlyMap<string, readonly (string | number)[]>>(
  EDITOR_ELEMENT_RULES.map((rule) => [rule.type, attrValueMap(rule.attrValues)]),
);

function attrValueMap(
  declared: Readonly<Record<string, readonly (string | number)[]>> | undefined,
): ReadonlyMap<string, readonly (string | number)[]> {
  const values = new Map<string, readonly (string | number)[]>();
  if (declared === undefined) {
    return values;
  }

  for (const [attr, allowed] of Object.entries(declared)) {
    values.set(attr, allowed);
  }

  return values;
}

const allowedMarks = new Set<string>(CLEARABLE_MARK_KEYS);

const markValues = new Map<string, readonly string[]>(
  EDITOR_MARK_RULES.flatMap((rule) =>
    rule.values === undefined ? [] : [[rule.type, rule.values]],
  ),
);

export function allowedElementAttrs(type: string): ReadonlySet<string> | undefined {
  return elementAttrs.get(type);
}

export function allowedElementAttrValues(
  type: string,
  attr: string,
): readonly (string | number)[] | undefined {
  return elementAttrValues.get(type)?.get(attr);
}

export function isAllowedElementAttrValue(type: string, attr: string, value: unknown): boolean {
  const values = allowedElementAttrValues(type, attr);
  if (values === undefined) {
    return true;
  }

  return isAllowedValue(value, values);
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

export function isAllowedValue<T extends string | number>(
  value: unknown,
  values: readonly T[],
): value is T {
  return (
    (typeof value === "string" || typeof value === "number") &&
    values.some((allowed) => allowed === value)
  );
}

export function isPaletteToken(value: unknown): value is PaletteToken {
  return isAllowedValue(value, PALETTE_TOKENS);
}
