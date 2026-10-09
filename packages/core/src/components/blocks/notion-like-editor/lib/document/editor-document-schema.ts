import { KEYS } from "platejs";

import { formatBlockLabel } from "./editor-document";
import {
  BOOKMARK_DESCRIPTION_MAX,
  BOOKMARK_KEY,
  BOOKMARK_SITE_NAME_MAX,
  BOOKMARK_TITLE_MAX,
  isBookmarkFetchedAt,
  isStoredBookmarkText,
  normalizeBookmarkImageUrl,
  storedBookmarkUrl,
} from "../features/editor-bookmark-url";
import { sanitizeLinkUrl } from "../features/editor-link-url";
import { checkMentionNode } from "../features/editor-mention-node";
import { checkTableGrid, type TableGridIssue } from "../features/editor-table-grid";

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
  /**
   * When set, children[0] must be one of these types. The first entry is the
   * default label. Later children still use childTypes.
   */
  firstChildTypes?: readonly string[];
  /** Attrs childTypes allows that are still illegal on children[0]. */
  firstChildForbiddenAttrs?: readonly string[];
  /** How many times this type may nest, counting the outermost node. */
  maxNesting?: number;
  /** At most this many element children. */
  maxChildren?: number;
  /**
   * Which plain paragraph children getBlockType reports as this container.
   * Absent means every plain paragraph child. "first" means only children[0].
   */
  reportParent?: "all" | "first";
  /**
   * getBlockType name for a label of this type. A label type absent from the
   * map reports the container when reportParent is "first".
   */
  reportedFirstChild?: Readonly<Record<string, string>>;
  /**
   * A void stores exactly one empty text leaf and no marks.
   * It is not a container, so childTypes stays absent.
   */
  isVoid?: true;
  /** When false, text under this element cannot store marks. */
  marks?: false;
  /** A disallowed value of these attrs is removed and reported as a repair. */
  repairAttrs?: readonly string[];
  /** getBlockType reports the container that allows this element, not the element. */
  reportContainer?: true;
  /**
   * Structural issues the attribute lists cannot express, such as a table grid.
   * The validator reports them. It does not repair the document.
   */
  validateChildren?: (node: Record<string, unknown>, path: number[]) => readonly TableGridIssue[];
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

// Lucide keys. Absence means lightbulb. Unreleased, so a stored emoji is unsupported and is not migrated.
export const CALLOUT_ICONS = [
  "lightbulb",
  "info",
  "circle-check",
  "triangle-alert",
  "ban",
  "pin",
  "notebook-pen",
  "flame",
  "circle-help",
  "star",
  "target",
  "message-circle",
] as const;

export type CalloutIcon = (typeof CALLOUT_ICONS)[number];

export const CALLOUT_DEFAULT_ICON: CalloutIcon = "lightbulb";

// Stored languages. Absence means plaintext, so plaintext is not a stored value.
export const CODE_LANGS = [
  "typescript",
  "tsx",
  "javascript",
  "jsx",
  "json",
  "html",
  "css",
  "bash",
  "python",
  "go",
  "rust",
  "sql",
  "markdown",
  "yaml",
  "diff",
] as const;

export type CodeLang = (typeof CODE_LANGS)[number];

// A simple table, not a database. 50×20 is the stored cap shared by validate, normalize, and paste.
export const TABLE_MAX_ROWS = 50;
export const TABLE_MAX_COLUMNS = 20;

export const CODE_LANG_LABELS = {
  plaintext: "Plain text",
  typescript: "TypeScript",
  tsx: "TSX",
  javascript: "JavaScript",
  jsx: "JSX",
  json: "JSON",
  html: "HTML",
  css: "CSS",
  bash: "Bash",
  python: "Python",
  go: "Go",
  rust: "Rust",
  sql: "SQL",
  markdown: "Markdown",
  yaml: "YAML",
  diff: "Diff",
} as const satisfies Record<CodeLang | "plaintext", string>;

// Paste and insert class tokens. Stored names that are not listed here stay themselves.
export const CODE_LANG_ALIASES = {
  ts: "typescript",
  js: "javascript",
  sh: "bash",
  shell: "bash",
  py: "python",
  yml: "yaml",
  xml: "html",
  html: "html",
} as const satisfies Record<string, CodeLang>;

function aliasCodeLang(token: string): CodeLang | undefined {
  for (const [alias, lang] of Object.entries(CODE_LANG_ALIASES)) {
    if (alias === token) {
      return lang;
    }
  }

  return undefined;
}

export function codeLangFromToken(token: string): CodeLang | null {
  const normalized = token.trim().toLowerCase();
  if (normalized.length === 0 || normalized === "plaintext") {
    return null;
  }

  const alias = aliasCodeLang(normalized);
  if (alias !== undefined) {
    return alias;
  }

  const stored = CODE_LANGS.find((lang) => lang === normalized);
  return stored ?? null;
}

const headingElementRule = {
  attrs: ["id", "align"],
  attrValues: { align: TEXT_ALIGNS },
} as const;

export const EQUATION_EXPRESSION_MAX = 4000;

// Length is UTF-16 code units. Tab and newline are the only allowed controls.
export function isStoredEquationExpression(value: unknown): value is string {
  if (typeof value !== "string" || value.length > EQUATION_EXPRESSION_MAX) {
    return false;
  }

  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code === 0x09 || code === 0x0a) {
      continue;
    }
    if (code <= 0x1f || code === 0x7f) {
      return false;
    }
  }

  return true;
}

export function checkEquationNode(
  node: Record<string, unknown>,
  path: number[],
): readonly TableGridIssue[] {
  if ("texExpression" in node && isStoredEquationExpression(node.texExpression)) {
    return [];
  }

  return [
    {
      path,
      message: `${formatBlockLabel(path)} has an unsupported texExpression. Restore from a backup or remove the block.`,
    },
  ];
}

export const SYNCED_REF_KEY = "synced_ref";

export const SYNCED_TARGET_ID_MAX = 200;

// A target id is a stable block id. It is not a copy of the target.
export function isStoredSyncedTargetId(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > SYNCED_TARGET_ID_MAX) {
    return false;
  }

  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) {
      return false;
    }
  }

  return true;
}

export function checkSyncedRefNode(
  node: Record<string, unknown>,
  path: number[],
): readonly TableGridIssue[] {
  if ("targetBlockId" in node && isStoredSyncedTargetId(node.targetBlockId)) {
    return [];
  }

  return [
    {
      path,
      message: `${formatBlockLabel(path)} has an unsupported targetBlockId. Restore from a backup or remove the block.`,
    },
  ];
}

export function checkBookmarkNode(
  node: Record<string, unknown>,
  path: number[],
): readonly TableGridIssue[] {
  const issues: TableGridIssue[] = [];
  if (storedBookmarkUrl(node.url) === undefined) {
    issues.push({
      path,
      message: `${formatBlockLabel(path)} has an unsupported url. Restore from a backup or remove the block.`,
    });
  }

  bookmarkTextIssue(issues, node, path, "title", BOOKMARK_TITLE_MAX);
  bookmarkTextIssue(issues, node, path, "description", BOOKMARK_DESCRIPTION_MAX);
  bookmarkTextIssue(issues, node, path, "siteName", BOOKMARK_SITE_NAME_MAX);

  if ("imageUrl" in node) {
    const imageUrl = node.imageUrl;
    if (typeof imageUrl !== "string" || normalizeBookmarkImageUrl(imageUrl) !== imageUrl) {
      issues.push({
        path,
        message: `${formatBlockLabel(path)} has an unsupported imageUrl. Restore from a backup or remove the attribute.`,
      });
    }
  }

  if ("fetchedAt" in node && !isBookmarkFetchedAt(node.fetchedAt)) {
    issues.push({
      path,
      message: `${formatBlockLabel(path)} has an unsupported fetchedAt. Restore from a backup or remove the attribute.`,
    });
  }

  return issues;
}

function bookmarkTextIssue(
  issues: TableGridIssue[],
  node: Record<string, unknown>,
  path: number[],
  key: string,
  limit: number,
): void {
  if (!(key in node) || isStoredBookmarkText(node[key], limit)) {
    return;
  }

  issues.push({
    path,
    message: `${formatBlockLabel(path)} has an unsupported ${key}. Restore from a backup or remove the attribute.`,
  });
}

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
  // Custom void. Plate has no bookmark plugin. The url is the link. The other
  // fields are a sanitized preview cache and can be missing without losing it.
  {
    type: BOOKMARK_KEY,
    attrs: ["id", "url", "title", "description", "siteName", "imageUrl", "fetchedAt"],
    isVoid: true,
    validateChildren: (node, path) => checkBookmarkNode(node, path),
  },
  // Plate's toc node (@platejs/toc 53.0.0, key "toc") is a void. The outline is
  // derived on render. maxDepth is 1, 2, or 3, and absence means 3.
  {
    type: KEYS.toc,
    attrs: ["id", "maxDepth"],
    attrValues: { maxDepth: [1, 2, 3] },
    isVoid: true,
  },
  // @platejs/math 53.3.12 BaseEquationPlugin: key KEYS.equation ("equation"),
  // void, and texExpression is the only stored expression. Rendered HTML is
  // derived. html, rendered, and displayMode are not attributes.
  {
    type: KEYS.equation,
    attrs: ["id", "texExpression"],
    isVoid: true,
    validateChildren: (node, path) => checkEquationNode(node, path),
  },
  // Same-document reference. The target is stored once. targetBlockId is that
  // block's id. A copy of the target content is not an attribute.
  {
    type: SYNCED_REF_KEY,
    attrs: ["id", "targetBlockId"],
    isVoid: true,
    validateChildren: (node, path) => checkSyncedRefNode(node, path),
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
    childTypes: [
      KEYS.p,
      KEYS.toggle,
      KEYS.blockquote,
      KEYS.callout,
      KEYS.hr,
      BOOKMARK_KEY,
      KEYS.codeBlock,
      KEYS.table,
      KEYS.toc,
      KEYS.equation,
      SYNCED_REF_KEY,
    ],
    firstChildTypes: [KEYS.p, KEYS.h1, KEYS.h2, KEYS.h3],
    firstChildForbiddenAttrs: ["listStyleType", "indent", "checked"],
    maxNesting: 3,
    reportParent: "first",
    reportedFirstChild: {
      [KEYS.h1]: "toggle-h1",
      [KEYS.h2]: "toggle-h2",
      [KEYS.h3]: "toggle-h3",
    },
  },
  // Plate's code block. lang is absent for plaintext. Tokens are decorations, not children.
  // The ``` trigger is DEV-126, so this block has no markdown rule.
  {
    type: KEYS.codeBlock,
    attrs: ["id", "lang"],
    attrValues: { lang: CODE_LANGS },
    repairAttrs: ["lang"],
    childTypes: [KEYS.codeLine],
  },
  {
    type: KEYS.codeLine,
    attrs: ["id"],
    marks: false,
    reportContainer: true,
  },
  // Plate's table > tr > td|th > p. colSizes is one width per grid column.
  // null in that array is an automatic column. Absence of the array means every
  // column is automatic. Spans are Plate's colSpan and rowSpan. Absence means 1.
  // A table is not a list, indent, align, or line-height target. Paragraphs inside cells are.
  {
    type: KEYS.table,
    attrs: ["id", "colSizes"],
    childTypes: [KEYS.tr],
    maxChildren: TABLE_MAX_ROWS,
    maxNesting: 1,
    validateChildren: (node, path) =>
      checkTableGrid(node, path, { maxRows: TABLE_MAX_ROWS, maxColumns: TABLE_MAX_COLUMNS }).issues,
  },
  {
    type: KEYS.tr,
    attrs: ["id"],
    childTypes: [KEYS.td, KEYS.th],
    maxChildren: TABLE_MAX_COLUMNS,
  },
  {
    type: KEYS.td,
    attrs: ["id", "colSpan", "rowSpan"],
    childTypes: [KEYS.p],
  },
  {
    type: KEYS.th,
    attrs: ["id", "colSpan", "rowSpan"],
    childTypes: [KEYS.p],
  },
  // Plate column_group (@platejs/layout 53.0.0). Two or three columns, top-level only.
  // A one-column group is unwrapped before this rule runs. Width lives on each column.
  {
    type: KEYS.columnGroup,
    attrs: ["id"],
    childTypes: [KEYS.column],
    maxChildren: 3,
    maxNesting: 1,
  },
  // width is the percent string Plate stores ("50%", "33.33%"). No allowlist: a bad
  // value is rewritten by the column repair, and an unknown attribute still fails closed.
  {
    type: KEYS.column,
    attrs: ["id", "width"],
    childTypes: [
      KEYS.p,
      KEYS.h1,
      KEYS.h2,
      KEYS.h3,
      KEYS.blockquote,
      KEYS.callout,
      KEYS.toggle,
      KEYS.hr,
      KEYS.codeBlock,
      BOOKMARK_KEY,
      KEYS.table,
      KEYS.toc,
      KEYS.equation,
      SYNCED_REF_KEY,
    ],
  },
  // Inline link. target and rel are chosen at render and are not stored.
  {
    type: KEYS.link,
    attrs: ["id", "url"],
    repairAttrs: ["url"],
  },
  // Inline mention. Plate stores value (display text) and key (item id).
  // This document stores label, entityId, and entityType. value and key are not attributes.
  {
    type: KEYS.mention,
    attrs: ["id", "entityType", "entityId", "label"],
    isVoid: true,
    validateChildren: (node, path) => checkMentionNode(node, path),
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

const elementFirstChildTypes = new Map<string, readonly string[]>(
  EDITOR_ELEMENT_RULES.flatMap((rule) =>
    "firstChildTypes" in rule && rule.firstChildTypes !== undefined
      ? [[rule.type, rule.firstChildTypes]]
      : [],
  ),
);

const elementReportedFirstChild = new Map<string, Readonly<Record<string, string>>>(
  EDITOR_ELEMENT_RULES.flatMap((rule) =>
    "reportedFirstChild" in rule && rule.reportedFirstChild !== undefined
      ? [[rule.type, rule.reportedFirstChild]]
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

const elementMaxChildren = new Map<string, number>(
  EDITOR_ELEMENT_RULES.flatMap((rule) =>
    "maxChildren" in rule && rule.maxChildren !== undefined ? [[rule.type, rule.maxChildren]] : [],
  ),
);

const elementChildValidators = new Map<
  string,
  (node: Record<string, unknown>, path: number[]) => readonly TableGridIssue[]
>(
  EDITOR_ELEMENT_RULES.flatMap((rule) =>
    "validateChildren" in rule && rule.validateChildren !== undefined
      ? [[rule.type, rule.validateChildren]]
      : [],
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

const elementsWithoutMarks = new Set<string>(
  EDITOR_ELEMENT_RULES.flatMap((rule) =>
    "marks" in rule && rule.marks === false ? [rule.type] : [],
  ),
);

const elementRepairAttrs = new Map<string, readonly string[]>(
  EDITOR_ELEMENT_RULES.flatMap((rule) =>
    "repairAttrs" in rule && rule.repairAttrs !== undefined ? [[rule.type, rule.repairAttrs]] : [],
  ),
);

const containerReportingElements = new Set<string>(
  EDITOR_ELEMENT_RULES.flatMap((rule) =>
    "reportContainer" in rule && rule.reportContainer ? [rule.type] : [],
  ),
);

export function allowedChildTypes(type: string): readonly string[] | undefined {
  return elementChildTypes.get(type);
}

export function firstChildTypes(type: string): readonly string[] | undefined {
  return elementFirstChildTypes.get(type);
}

/** The default label type. Existing callers use this when a label must be inserted. */
export function firstChildType(type: string): string | undefined {
  return firstChildTypes(type)?.[0];
}

export function allowsFirstChild(parentType: string, childType: string): boolean {
  const labels = firstChildTypes(parentType);
  return labels !== undefined && labels.some((type) => type === childType);
}

export function reportedFirstChild(parentType: string, childType: string): string | undefined {
  return elementReportedFirstChild.get(parentType)?.[childType];
}

export function reportedFirstChildNames(parentType: string): readonly string[] {
  const reported = elementReportedFirstChild.get(parentType);
  return reported === undefined ? [] : Object.values(reported);
}

export function firstChildForbiddenAttrs(type: string): readonly string[] {
  return elementFirstChildForbiddenAttrs.get(type) ?? noForbiddenAttrs;
}

export function maxNesting(type: string): number | undefined {
  return elementMaxNesting.get(type);
}

export function maxChildren(type: string): number | undefined {
  return elementMaxChildren.get(type);
}

export function elementChildIssues(
  type: string,
  node: Record<string, unknown>,
  path: number[],
): readonly TableGridIssue[] {
  const validate = elementChildValidators.get(type);
  return validate === undefined ? [] : validate(node, path);
}

export function reportsParentFromFirstChild(type: string): boolean {
  return elementReportParent.get(type) === "first";
}

export function isVoidElementType(type: string): boolean {
  return voidElementTypes.has(type);
}

export function elementAllowsMarks(type: string): boolean {
  return !elementsWithoutMarks.has(type);
}

export function repairAttrKeys(type: string): readonly string[] {
  return elementRepairAttrs.get(type) ?? noForbiddenAttrs;
}

export function reportsContainer(type: string): boolean {
  return containerReportingElements.has(type);
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
  if (type === KEYS.link && attr === "url") {
    return typeof value === "string" && sanitizeLinkUrl(value) === value;
  }

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
