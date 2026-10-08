import { KEYS } from "platejs";

import { formatBlockLabel } from "./editor-document";
import { checkTableGrid, type TableGridIssue } from "./editor-table-grid";

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

// Display width in px. Absence means the image fits its container.
export const IMAGE_MIN_WIDTH = 64;
export const IMAGE_MAX_WIDTH = 1600;
export const IMAGE_ALT_MAX = 1000;
// Center is the default and is never stored. Paragraph align still includes center.
export const IMAGE_ALIGNS = ["left", "right"] as const;

export type ImageAlign = (typeof IMAGE_ALIGNS)[number];

function hasUnsafePathChar(value: string): boolean {
  if (value.includes("\\")) {
    return true;
  }

  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) <= 0x1f) {
      return true;
    }
  }

  return false;
}

export function isSafeImageUrl(value: string): boolean {
  if (value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\")) {
    return !hasUnsafePathChar(value);
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  return url.protocol === "https:";
}

function positivePixel(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function captionIssues(caption: unknown, path: number[]): TableGridIssue[] {
  if (!Array.isArray(caption) || caption.length === 0) {
    return [
      {
        path,
        message: `${formatBlockLabel(path)} has an unsupported caption. Restore from a backup or remove the caption.`,
      },
    ];
  }

  for (const item of caption) {
    if (typeof item !== "object" || item === null || Array.isArray(item) || !("text" in item)) {
      return [
        {
          path,
          message: `${formatBlockLabel(path)} has an unsupported caption. Restore from a backup or remove the caption.`,
        },
      ];
    }

    if (typeof item.text !== "string" || "children" in item) {
      return [
        {
          path,
          message: `${formatBlockLabel(path)} has an unsupported caption. Restore from a backup or remove the caption.`,
        },
      ];
    }

    for (const key of Object.keys(item)) {
      if (key === "text") {
        continue;
      }

      const mark: unknown = Reflect.get(item, key);
      if (!isAllowedMark(key) || !isAllowedMarkValue(key, mark)) {
        return [
          {
            path,
            message: `${formatBlockLabel(path)} has an unsupported caption. Restore from a backup or remove the caption.`,
          },
        ];
      }
    }
  }

  return [];
}

// A sourceless image is an upload that has not finished. It loads as ok.
export function checkImageNode(
  node: Record<string, unknown>,
  path: number[],
): readonly TableGridIssue[] {
  const issues = [...mediaSourceIssues(node, path), ...naturalSizeIssues(node, path)];

  if ("alt" in node && (typeof node.alt !== "string" || node.alt.length > IMAGE_ALT_MAX)) {
    issues.push({
      path,
      message: `${formatBlockLabel(path)} has an unsupported alt. Restore from a backup or remove the attribute.`,
    });
  }

  if ("caption" in node) {
    issues.push(...captionIssues(node.caption, path));
  }

  return issues;
}

export const VIDEO_MIN_WIDTH = 160;
export const VIDEO_MAX_WIDTH = 1600;
export const VIDEO_MIME_TYPES = ["video/mp4", "video/webm", "video/ogg"] as const;
export const VIDEO_ALIGNS = IMAGE_ALIGNS;

export type VideoMimeType = (typeof VIDEO_MIME_TYPES)[number];

// A sourceless video is an upload that has not finished. It loads as ok.
// Playback position, paused, muted, and volume are not document fields.
export function checkVideoNode(
  node: Record<string, unknown>,
  path: number[],
): readonly TableGridIssue[] {
  const issues = [...mediaSourceIssues(node, path), ...naturalSizeIssues(node, path)];

  if ("durationMs" in node && !positivePixel(node.durationMs)) {
    issues.push({
      path,
      message: `${formatBlockLabel(path)} has an unsupported duration. Restore from a backup or remove the attribute.`,
    });
  }

  issues.push(...posterIssues(node, path));

  if ("caption" in node) {
    issues.push(...captionIssues(node.caption, path));
  }

  return issues;
}

function mediaSourceIssues(node: Record<string, unknown>, path: number[]): TableGridIssue[] {
  const issues: TableGridIssue[] = [];
  const hasAsset = "assetId" in node;
  const hasUrl = "url" in node;

  if (hasAsset && hasUrl) {
    issues.push({
      path,
      message: `${formatBlockLabel(path)} has both assetId and url. Restore from a backup or keep one source.`,
    });
  }

  if (hasAsset && (typeof node.assetId !== "string" || node.assetId.length === 0)) {
    issues.push({
      path,
      message: `${formatBlockLabel(path)} has an unsupported assetId. Restore from a backup or remove the attribute.`,
    });
  }

  if (hasUrl && (typeof node.url !== "string" || !isSafeImageUrl(node.url))) {
    const scheme =
      typeof node.url === "string" && (node.url.startsWith("blob:") || node.url.startsWith("data:"))
        ? node.url.slice(0, node.url.indexOf(":") + 1)
        : undefined;
    const detail = scheme === undefined ? "an unsupported url" : `a url that starts with ${scheme}`;
    issues.push({
      path,
      message: `${formatBlockLabel(path)} has ${detail}. Restore from a backup or replace that file.`,
    });
  }

  return issues;
}

function naturalSizeIssues(node: Record<string, unknown>, path: number[]): TableGridIssue[] {
  const hasWidth = "naturalWidth" in node;
  const hasHeight = "naturalHeight" in node;
  if (
    hasWidth !== hasHeight ||
    (hasWidth && !positivePixel(node.naturalWidth)) ||
    (hasHeight && !positivePixel(node.naturalHeight))
  ) {
    return [
      {
        path,
        message: `${formatBlockLabel(path)} has an unsupported natural size. Restore from a backup or remove the attribute.`,
      },
    ];
  }

  return [];
}

function posterIssues(node: Record<string, unknown>, path: number[]): TableGridIssue[] {
  const issues: TableGridIssue[] = [];
  const hasAsset = "posterAssetId" in node;
  const hasUrl = "posterUrl" in node;

  if (hasAsset && hasUrl) {
    issues.push({
      path,
      message: `${formatBlockLabel(path)} has both posterAssetId and posterUrl. Restore from a backup or keep one poster.`,
    });
  }

  if (hasAsset && (typeof node.posterAssetId !== "string" || node.posterAssetId.length === 0)) {
    issues.push({
      path,
      message: `${formatBlockLabel(path)} has an unsupported posterAssetId. Restore from a backup or remove the attribute.`,
    });
  }

  if (hasUrl && (typeof node.posterUrl !== "string" || !isSafeImageUrl(node.posterUrl))) {
    const scheme =
      typeof node.posterUrl === "string" &&
      (node.posterUrl.startsWith("blob:") || node.posterUrl.startsWith("data:"))
        ? node.posterUrl.slice(0, node.posterUrl.indexOf(":") + 1)
        : undefined;
    const detail =
      scheme === undefined
        ? "an unsupported poster url"
        : `a poster url that starts with ${scheme}`;
    issues.push({
      path,
      message: `${formatBlockLabel(path)} has ${detail}. Restore from a backup or replace that file.`,
    });
  }

  return issues;
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
  // Plate's image node (KEYS.img). The source is assetId or url, never both, and
  // neither while an upload is still in plugin state. Center align is not stored.
  // Caption is Plate's plain text shape: [{ text }]. Marks on that text follow the allowlist.
  {
    type: KEYS.img,
    attrs: [
      "id",
      "assetId",
      "url",
      "naturalWidth",
      "naturalHeight",
      "width",
      "align",
      "alt",
      "caption",
    ],
    isVoid: true,
    attrValues: { align: IMAGE_ALIGNS },
    attrRanges: { width: { min: IMAGE_MIN_WIDTH, max: IMAGE_MAX_WIDTH } },
    validateChildren: (node, path) => checkImageNode(node, path),
  },
  // Plate's video node is BaseVideoPlugin (@platejs/media): key KEYS.video, which is
  // "video", void, and dangerouslyAllowAttributes width and height. The url field is
  // the same element url insertImage writes. Caption is Plate's [{ text }] shape,
  // written by setNodes in @platejs/caption. currentTime, paused, muted, and volume
  // are playback state and are not attributes.
  {
    type: KEYS.video,
    attrs: [
      "id",
      "assetId",
      "url",
      "mimeType",
      "naturalWidth",
      "naturalHeight",
      "durationMs",
      "width",
      "align",
      "caption",
      "posterAssetId",
      "posterUrl",
    ],
    isVoid: true,
    attrValues: { align: VIDEO_ALIGNS, mimeType: VIDEO_MIME_TYPES },
    attrRanges: { width: { min: VIDEO_MIN_WIDTH, max: VIDEO_MAX_WIDTH } },
    validateChildren: (node, path) => checkVideoNode(node, path),
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
      KEYS.img,
      KEYS.video,
      KEYS.codeBlock,
      KEYS.table,
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
