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
export const TEXT_COLOR_TOKENS = [
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

export type TextColorToken = (typeof TEXT_COLOR_TOKENS)[number];

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
  { type: KEYS.color, values: TEXT_COLOR_TOKENS },
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

  return typeof value === "string" && values.some((allowed) => allowed === value);
}

export function isTextColorToken(value: unknown): value is TextColorToken {
  return typeof value === "string" && TEXT_COLOR_TOKENS.some((token) => token === value);
}
