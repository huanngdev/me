import { KEYS } from "platejs";

export type IntegerAttrRange = {
  readonly min: number;
  readonly max: number;
};

export type AttrRequirement = {
  attr: string;
  /** When set, the required attribute must be one of these values. */
  values?: readonly (string | number)[];
};

export type EditorElementRule = {
  type: string;
  attrs: readonly string[];
  attrValues?: Readonly<Record<string, readonly (string | number | boolean)[]>>;
  /** Inclusive integer range. Literal lists cannot express one. */
  attrRanges?: Readonly<Record<string, IntegerAttrRange>>;
  /** A dependent attribute is stored only when `attr` is present, allowed, and in `values`. */
  attrRequires?: Readonly<Record<string, AttrRequirement>>;
  /**
   * Absent: children are inline text, which is every block except containers.
   * Present: every child is an element of one of these types.
   */
  childTypes?: readonly string[];
  /** When set, children[0] must be this type. Later children still use childTypes. */
  firstChildType?: string;
  /** Attrs childTypes allows that are still illegal on children[0]. */
  firstChildForbiddenAttrs?: readonly string[];
  /** How many times this type may nest, counting the outermost node. */
  maxNesting?: number;
  /**
   * Which plain paragraph children getBlockType reports as this container.
   * Absent means every plain paragraph child. "first" means only children[0].
   */
  reportParent?: "all" | "first";
  /**
   * A void stores exactly one empty text leaf and no marks.
   * It is not a container, so childTypes stays absent.
   */
  isVoid?: true;
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

// Flat list depth. Plate stores this on the paragraph as `indent`, not as a nested list node.
export const LIST_INDENTS = [1, 2, 3, 4, 5, 6] as const;

export type ListIndent = (typeof LIST_INDENTS)[number];

// Stored list styles. Marker cycles (circle, lower-alpha, …) are rendering only.
export const LIST_STYLES = ["disc", "decimal", "todo"] as const;

export type ListStyle = (typeof LIST_STYLES)[number];

// Plate does not cap list numbers. 9999 is four digits, enough for a document list,
// and past that the value is rejected instead of stored.
export const LIST_NUMBER_RANGE = { min: 1, max: 9999 } as const satisfies IntegerAttrRange;

// Stored tones. Absence means default, so default is not a stored value.
export const CALLOUT_TONES = ["info", "success", "warning", "danger"] as const;

export type CalloutTone = (typeof CALLOUT_TONES)[number];

// Preset icons. Absence means 💡. An emoji outside this list is not stored.
export const CALLOUT_ICONS = [
  "💡",
  "ℹ️",
  "✅",
  "⚠️",
  "🚫",
  "📌",
  "📝",
  "🔥",
  "❓",
  "⭐",
  "🎯",
  "💬",
] as const;

export type CalloutIcon = (typeof CALLOUT_ICONS)[number];

export const CALLOUT_DEFAULT_ICON: CalloutIcon = "💡";

const headingElementRule = {
  attrs: ["id", "align"],
  attrValues: { align: TEXT_ALIGNS },
} as const;

export const EDITOR_ELEMENT_RULES = [
  {
    type: "p",
    attrs: [
      "id",
      "align",
      "lineHeight",
      "indent",
      "listStyleType",
      "listStart",
      "listRestart",
      "listRestartPolite",
      "checked",
    ],
    attrValues: {
      align: TEXT_ALIGNS,
      lineHeight: LINE_HEIGHTS,
      indent: LIST_INDENTS,
      listStyleType: LIST_STYLES,
      checked: [true, false],
    },
    attrRanges: {
      listStart: LIST_NUMBER_RANGE,
      listRestart: LIST_NUMBER_RANGE,
      listRestartPolite: LIST_NUMBER_RANGE,
    },
    // Standalone block indent is a later task. Indent is kept only with a list style.
    // Numbering attrs are kept only on decimal items. checked is kept only on todo items.
    // Plate deletes listStart on disc and leaves listRestart, so a disc item would not
    // round-trip those attrs.
    attrRequires: {
      indent: { attr: "listStyleType" },
      listStart: { attr: "listStyleType", values: ["decimal"] },
      listRestart: { attr: "listStyleType", values: ["decimal"] },
      listRestartPolite: { attr: "listStyleType", values: ["decimal"] },
      checked: { attr: "listStyleType", values: ["todo"] },
    },
  },
  // Headings do not take lineHeight. Their leading is fixed by the heading component.
  { type: "h1", ...headingElementRule },
  { type: "h2", ...headingElementRule },
  { type: "h3", ...headingElementRule },
  // Alignment and line height stay on the child paragraphs. A quote stores only its id.
  {
    type: KEYS.blockquote,
    attrs: ["id"],
    childTypes: [KEYS.p],
  },
  // A divider is a void. It stores only its id, never align, line height, or list attrs.
  {
    type: KEYS.hr,
    attrs: ["id"],
    isVoid: true,
  },
  // Plate's callout attrs are icon and variant. Paragraphs keep their own attrs,
  // so a list inside a callout stays a list. backgroundColor is not stored.
  {
    type: KEYS.callout,
    attrs: ["id", "icon", "variant"],
    attrValues: {
      icon: CALLOUT_ICONS,
      variant: CALLOUT_TONES,
    },
    childTypes: [KEYS.p],
  },
  // Own container, not @platejs/toggle: its flat indent model collides with indent → listStyleType.
  // No shortcut. The "> " trigger is DEV-126.
  {
    type: KEYS.toggle,
    attrs: ["id"],
    childTypes: [KEYS.p, KEYS.toggle, KEYS.blockquote, KEYS.callout, KEYS.hr],
    firstChildType: KEYS.p,
    firstChildForbiddenAttrs: ["listStyleType", "indent", "checked"],
    maxNesting: 3,
    reportParent: "first",
  },
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

const elementAttrValues = ruleMaps<readonly (string | number | boolean)[]>((rule) =>
  "attrValues" in rule ? rule.attrValues : undefined,
);

const elementAttrRanges = ruleMaps<IntegerAttrRange>((rule) =>
  "attrRanges" in rule ? rule.attrRanges : undefined,
);

const elementAttrRequires = ruleMaps<AttrRequirement>((rule) =>
  "attrRequires" in rule ? rule.attrRequires : undefined,
);

const elementChildTypes = new Map<string, readonly string[]>(
  EDITOR_ELEMENT_RULES.flatMap((rule) =>
    "childTypes" in rule && rule.childTypes !== undefined ? [[rule.type, rule.childTypes]] : [],
  ),
);

const elementFirstChildType = new Map<string, string>(
  EDITOR_ELEMENT_RULES.flatMap((rule) =>
    "firstChildType" in rule && rule.firstChildType !== undefined
      ? [[rule.type, rule.firstChildType]]
      : [],
  ),
);

const elementFirstChildForbiddenAttrs = new Map<string, readonly string[]>(
  EDITOR_ELEMENT_RULES.flatMap((rule) =>
    "firstChildForbiddenAttrs" in rule && rule.firstChildForbiddenAttrs !== undefined
      ? [[rule.type, rule.firstChildForbiddenAttrs]]
      : [],
  ),
);

const elementMaxNesting = new Map<string, number>(
  EDITOR_ELEMENT_RULES.flatMap((rule) =>
    "maxNesting" in rule && rule.maxNesting !== undefined ? [[rule.type, rule.maxNesting]] : [],
  ),
);

const elementReportParent = new Map<string, "all" | "first">(
  EDITOR_ELEMENT_RULES.flatMap((rule) =>
    "reportParent" in rule && rule.reportParent !== undefined
      ? [[rule.type, rule.reportParent]]
      : [],
  ),
);

const noForbiddenAttrs: readonly string[] = [];

const voidElementTypes = new Set<string>(
  EDITOR_ELEMENT_RULES.flatMap((rule) => ("isVoid" in rule && rule.isVoid ? [rule.type] : [])),
);

export function allowedChildTypes(type: string): readonly string[] | undefined {
  return elementChildTypes.get(type);
}

export function firstChildType(type: string): string | undefined {
  return elementFirstChildType.get(type);
}

export function firstChildForbiddenAttrs(type: string): readonly string[] {
  return elementFirstChildForbiddenAttrs.get(type) ?? noForbiddenAttrs;
}

export function maxNesting(type: string): number | undefined {
  return elementMaxNesting.get(type);
}

export function reportsParentFromFirstChild(type: string): boolean {
  return elementReportParent.get(type) === "first";
}

export function isVoidElementType(type: string): boolean {
  return voidElementTypes.has(type);
}

// The child type a container stores text in. That type is not itself a container.
export function containerContentType(type: string): string | undefined {
  const childTypes = allowedChildTypes(type);
  return childTypes?.find((childType) => allowedChildTypes(childType) === undefined);
}

function ruleMaps<T>(
  pick: (rule: (typeof EDITOR_ELEMENT_RULES)[number]) => Readonly<Record<string, T>> | undefined,
): ReadonlyMap<string, ReadonlyMap<string, T>> {
  const maps = new Map<string, ReadonlyMap<string, T>>();
  for (const rule of EDITOR_ELEMENT_RULES) {
    maps.set(rule.type, declaredMap(pick(rule)));
  }

  return maps;
}

function declaredMap<T>(declared: Readonly<Record<string, T>> | undefined): ReadonlyMap<string, T> {
  const map = new Map<string, T>();
  if (declared === undefined) {
    return map;
  }

  for (const [key, value] of Object.entries(declared)) {
    map.set(key, value);
  }

  return map;
}

export function isWithinAttrRange(value: unknown, range: IntegerAttrRange): boolean {
  return (
    typeof value === "number" && Number.isInteger(value) && value >= range.min && value <= range.max
  );
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

export function requiredAttr(type: string, dependent: string): string | undefined {
  return elementAttrRequires.get(type)?.get(dependent)?.attr;
}

// Dependent keys that are present while the attribute they require is missing or not allowed.
export function unsatisfiedDependentAttrs(type: string, node: Record<string, unknown>): string[] {
  const requires = elementAttrRequires.get(type);
  if (requires === undefined) {
    return [];
  }

  const unsatisfied: string[] = [];
  for (const [dependent, requirement] of requires) {
    if (!(dependent in node)) {
      continue;
    }

    const required = requirement.attr;
    if (!(required in node) || !isAllowedElementAttrValue(type, required, node[required])) {
      unsatisfied.push(dependent);
      continue;
    }

    const allowedValues = "values" in requirement ? requirement.values : undefined;
    if (
      allowedValues !== undefined &&
      !allowedValues.some((allowed) => allowed === node[required])
    ) {
      unsatisfied.push(dependent);
    }
  }

  return unsatisfied;
}

export function allowedElementAttrValues(
  type: string,
  attr: string,
): readonly (string | number | boolean)[] | undefined {
  return elementAttrValues.get(type)?.get(attr);
}

export function isAllowedElementAttrValue(type: string, attr: string, value: unknown): boolean {
  const values = allowedElementAttrValues(type, attr);
  if (values !== undefined && !isAllowedValue(value, values)) {
    return false;
  }

  const range = elementAttrRanges.get(type)?.get(attr);
  if (range !== undefined && !isWithinAttrRange(value, range)) {
    return false;
  }

  return true;
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

export function isAllowedValue<T extends string | number | boolean>(
  value: unknown,
  values: readonly T[],
): value is T {
  return (
    (typeof value === "string" || typeof value === "number" || typeof value === "boolean") &&
    values.some((allowed) => allowed === value)
  );
}

export function isPaletteToken(value: unknown): value is PaletteToken {
  return isAllowedValue(value, PALETTE_TOKENS);
}
