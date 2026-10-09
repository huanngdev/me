import {
  KEYS,
  createSlatePlugin,
  isHtmlBlockElement,
  nanoid,
  type Descendant,
  type SlateEditor,
  type TElement,
  type TText,
} from "platejs";

import type { Repair } from "../document/editor-document-ids";
import {
  allowedChildTypes,
  allowsFirstChild,
  containerContentType,
  elementAllowsMarks,
  allowedElementAttrs,
  firstChildForbiddenAttrs,
  firstChildType,
  firstChildTypes,
  isAllowedElementAttrValue,
  isAllowedMark,
  isAllowedMarkValue,
  isStoredEquationExpression,
  SYNCED_REF_KEY,
  isStoredSyncedTargetId,
  isVoidElementType,
  maxNesting,
  unsatisfiedDependentAttrs,
} from "../document/editor-document-schema";
import {
  clearUnsafePastedLinkRepairs,
  noteUnsafePastedLink,
  sanitizeLinkUrl,
  unsafePastedLinkRepairs,
} from "../features/editor-link-url";
import {
  MENTION_ENTITY_TYPE,
  allocateMentionId,
  isStoredMention,
  mentionInputPlainText,
  sanitizeMentionLabel,
} from "../features/editor-mention-node";
import { capPastedTable, repairTableGrid } from "../features/editor-table";
import { TABLE_MAX_COLUMN_WIDTH, TABLE_MIN_COLUMN_WIDTH } from "../features/editor-table-grid";
import {
  BOOKMARK_KEY,
  BOOKMARK_PASTE_DROPPED,
  bookmarkElement,
  storedBookmark,
} from "../features/editor-bookmark-url";
import type { EditorValue } from "../document/editor-value";
import { pasteRepairsOf, setPasteRepairs } from "./editor-paste-repairs";

export const MEDIA_NOT_SUPPORTED = "Files and media are not supported yet.";

export { pasteRepairsOf, setPasteRepairs };

export type PasteSanitizeOptions = {
  isInline?: (node: Record<string, unknown>) => boolean;
  seenIds?: Set<string>;
  /** Truncation and other paste repairs. The same list is what the editor reports. */
  repairs?: Repair[];
};

let activePasteRepairs: Repair[] | undefined;

// The table override sanitizes the fragment again. A repair from the first pass
// is gone on the second, so those repairs are kept until the outer insert finishes.
let pendingImageRepairs: Repair[] = [];
let pendingMentionInputRepairs: Repair[] = [];

function rememberImageRepair(repair: Repair): void {
  activePasteRepairs?.push(repair);
  pendingImageRepairs.push(repair);
}

function clearPendingImageRepairs(): void {
  pendingImageRepairs = [];
}

function clearPendingMentionInputRepairs(): void {
  pendingMentionInputRepairs = [];
}

type IsInline = (node: Record<string, unknown>) => boolean;

type Nesting = ReadonlyMap<string, number>;

const emptyNesting: Nesting = new Map();

type PasteChild =
  | { kind: "text"; node: TText }
  | { kind: "inline"; node: TElement }
  | { kind: "block"; node: TElement };

// Plate sorts plugins high-priority first, then tries HTML deserializers in reverse.
// 1000 runs after the default priority of 100, so a later heading or list plugin matches first.
const PASTE_FALLBACK_PRIORITY = 1000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTextNode(node: Record<string, unknown>): boolean {
  return typeof node.text === "string" && !Array.isArray(node.children);
}

function isElementNode(node: Record<string, unknown>): node is TElement {
  return typeof node.type === "string" && Array.isArray(node.children);
}

function sanitizeText(node: Record<string, unknown>, allowMarks: boolean): TText {
  const text = typeof node.text === "string" ? node.text : "";
  if (!allowMarks) {
    return { text };
  }

  const next: TText = { text };

  for (const key of Object.keys(node)) {
    if (key === "text" || !isAllowedMark(key) || !isAllowedMarkValue(key, node[key])) {
      continue;
    }

    next[key] = node[key];
  }

  return next;
}

function classifyPasteChild(
  child: unknown,
  isInline: IsInline,
  allowMarks = true,
): PasteChild | undefined {
  if (typeof child === "string") {
    return { kind: "text", node: { text: child } };
  }

  if (!isRecord(child)) {
    return undefined;
  }

  if (isTextNode(child)) {
    return { kind: "text", node: sanitizeText(child, allowMarks) };
  }

  if (!isElementNode(child)) {
    return undefined;
  }

  if (isInline(child)) {
    return { kind: "inline", node: child };
  }

  return { kind: "block", node: child };
}

function takeId(node: Record<string, unknown>, seen: Set<string>): string | undefined {
  if (typeof node.id !== "string" || node.id.length === 0 || seen.has(node.id)) {
    return undefined;
  }

  seen.add(node.id);
  return node.id;
}

function integerSpan(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && /^-?[0-9]+$/.test(value)) {
    return Number(value);
  }

  return undefined;
}

function copyCellSpans(node: Record<string, unknown>, props: TElement): void {
  if (props.type !== "td" && props.type !== "th") {
    return;
  }

  const attributes = isRecord(node.attributes) ? node.attributes : undefined;
  const colSpan = integerSpan(node.colSpan) ?? integerSpan(attributes?.colspan);
  const rowSpan = integerSpan(node.rowSpan) ?? integerSpan(attributes?.rowspan);
  if (colSpan !== undefined) {
    props.colSpan = colSpan;
  }

  if (rowSpan !== undefined) {
    props.rowSpan = rowSpan;
  }
}

function copyAllowedAttrs(node: Record<string, unknown>, props: TElement): void {
  const allowed = allowedElementAttrs(props.type);
  if (allowed === undefined) {
    return;
  }

  for (const key of allowed) {
    if (
      key === "id" ||
      key === "colSpan" ||
      key === "rowSpan" ||
      !(key in node) ||
      !isAllowedElementAttrValue(props.type, key, node[key])
    ) {
      continue;
    }

    props[key] = node[key];
  }

  copyCellSpans(node, props);

  for (const dependent of unsatisfiedDependentAttrs(props.type, props)) {
    Reflect.deleteProperty(props, dependent);
  }
}

function elementNode(type: string, children: Descendant[], id: string | undefined): TElement {
  const props: TElement = { type, children };
  if (id !== undefined) {
    props.id = id;
  }

  return props;
}

function isDroppedMediaType(type: string): boolean {
  return (
    type === KEYS.img ||
    type === KEYS.video ||
    type === KEYS.audio ||
    type === KEYS.file ||
    type === KEYS.mediaEmbed ||
    type === "pdf" ||
    type === "unsupported_media"
  );
}

function noteDroppedMedia(): void {
  rememberImageRepair({ path: [], message: MEDIA_NOT_SUPPORTED });
}

function pastedBookmark(node: TElement, seen: Set<string>): TElement[] {
  void seen;
  const stored = storedBookmark(node);
  if (stored === undefined) {
    rememberImageRepair({ path: [], message: BOOKMARK_PASTE_DROPPED });
    return [];
  }

  return [bookmarkElement(stored, nanoid())];
}

function hasContent(nodes: readonly Descendant[]): boolean {
  for (const node of nodes) {
    if ("children" in node) {
      return true;
    }

    if (typeof node.text === "string" && node.text.length > 0) {
      return true;
    }
  }

  return false;
}

function paragraph(children: Descendant[], id?: string): TElement {
  return elementNode("p", children.length > 0 ? children : [{ text: "" }], id);
}

function collectIds(value: unknown, seen: Set<string>): void {
  if (!isRecord(value)) {
    return;
  }

  if (typeof value.id === "string" && value.id.length > 0) {
    seen.add(value.id);
  }

  if (!Array.isArray(value.children)) {
    return;
  }

  for (const child of value.children) {
    collectIds(child, seen);
  }
}

function stripForbiddenAttrs(node: TElement, forbidden: readonly string[]): TElement {
  if (forbidden.length === 0 || forbidden.every((key) => !(key in node))) {
    return node;
  }

  const next: TElement = { ...node, children: node.children };
  for (const key of forbidden) {
    Reflect.deleteProperty(next, key);
  }

  for (const dependent of unsatisfiedDependentAttrs(next.type, next)) {
    Reflect.deleteProperty(next, dependent);
  }

  return next;
}

function withFirstChild(type: string, blocks: TElement[]): TElement[] {
  const labels = firstChildTypes(type);
  const expected = firstChildType(type);
  if (labels === undefined || expected === undefined) {
    return blocks;
  }

  const first = blocks[0];
  if (first === undefined || !allowsFirstChild(type, first.type)) {
    return [elementNode(expected, [{ text: "" }], undefined), ...blocks];
  }

  const stripped = stripForbiddenAttrs(first, firstChildForbiddenAttrs(type));
  if (stripped === first) {
    return blocks;
  }

  return [stripped, ...blocks.slice(1)];
}

function disallowedVoid(node: TElement, parentType: string): boolean {
  if (!isVoidElementType(node.type)) {
    return false;
  }

  const childTypes = allowedChildTypes(parentType);
  return childTypes !== undefined && !childTypes.some((type) => type === node.type);
}

function placeInParent(
  node: TElement,
  parentType: string,
  isInline: IsInline,
  seen: Set<string>,
  nesting: Nesting = emptyNesting,
  asLabel = false,
): TElement[] {
  if (isDroppedMediaType(node.type)) {
    return expandBlock(node, isInline, seen, nesting);
  }

  // A void is never retyped. A container that cannot hold it splits around the void.
  if (isVoidElementType(node.type)) {
    return expandBlock(node, isInline, seen, nesting);
  }

  const parentTypes = allowedChildTypes(parentType) ?? [];
  if (
    parentTypes.some((type) => type === node.type) ||
    (asLabel && allowsFirstChild(parentType, node.type))
  ) {
    return expandBlock(node, isInline, seen, nesting);
  }

  if (allowedChildTypes(node.type) !== undefined) {
    const placed: TElement[] = [];
    for (const piece of containerPieces(node, isInline, seen, nesting)) {
      if (isVoidElementType(piece.type)) {
        placed.push(piece);
        continue;
      }

      for (const child of piece.children) {
        if (isElementNode(child)) {
          placed.push(...placeInParent(child, parentType, isInline, seen, nesting));
        }
      }
    }

    return placed;
  }

  const target = containerContentType(parentType);
  if (target === undefined) {
    return expandBlock(node, isInline, seen, nesting);
  }

  // The new type may allow marks. Strip first when the node being retyped does not.
  return expandBlock({ ...plainTextElement(node), type: target }, isInline, seen, nesting);
}

function plainTextElement(node: TElement): TElement {
  if (elementAllowsMarks(node.type)) {
    return node;
  }

  let changed = false;
  const children = node.children.map((child) => {
    if (!isRecord(child) || typeof child.text !== "string" || "children" in child) {
      return child;
    }

    if (Object.keys(child).length === 1) {
      return child;
    }

    changed = true;
    return { text: child.text };
  });

  return changed ? { ...node, children } : node;
}

// One container, or several pieces when a disallowed void splits it:
// quote(a), hr, quote(b). An empty piece on either side is not emitted.
function liftedChildren(
  children: readonly unknown[],
  isInline: IsInline,
  seen: Set<string>,
  nesting: Nesting,
): TElement[] {
  const pieces: TElement[] = [];
  let inlines: Descendant[] = [];

  const flush = (): void => {
    if (inlines.length === 0) {
      return;
    }

    pieces.push(paragraph(inlines));
    inlines = [];
  };

  for (const child of children) {
    const classified = classifyPasteChild(child, isInline);
    if (classified === undefined) {
      continue;
    }

    if (classified.kind === "text") {
      inlines.push(classified.node);
      continue;
    }

    if (classified.kind === "inline") {
      inlines.push(...inlineNodes(classified.node, isInline, seen));
      continue;
    }

    flush();
    pieces.push(...expandBlock(classified.node, isInline, seen, nesting));
  }

  flush();
  return pieces;
}

function containerPieces(
  node: TElement,
  isInline: IsInline,
  seen: Set<string>,
  nesting: Nesting = emptyNesting,
): TElement[] {
  const limit = maxNesting(node.type);
  const depth = (nesting.get(node.type) ?? 0) + 1;
  const nextNesting = new Map(nesting);
  if (limit !== undefined) {
    nextNesting.set(node.type, depth);
  }

  if (limit !== undefined && depth > limit) {
    return liftedChildren(node.children, isInline, seen, nextNesting);
  }

  const contentType = containerContentType(node.type);
  const contentAllowsMarks = contentType === undefined || elementAllowsMarks(contentType);
  const pieces: TElement[] = [];
  let blocks: TElement[] = [];
  let inlines: Descendant[] = [];
  let usedId = false;

  const flushInlines = (): void => {
    if (inlines.length === 0 || contentType === undefined) {
      inlines = [];
      return;
    }

    blocks.push(elementNode(contentType, inlines, undefined));
    inlines = [];
  };

  const flushContainer = (): void => {
    flushInlines();
    if (blocks.length === 0) {
      return;
    }

    const id = usedId ? undefined : takeId(node, seen);
    usedId = true;
    const props = elementNode(node.type, withFirstChild(node.type, blocks), id);
    copyAllowedAttrs(node, props);
    pieces.push(props);
    blocks = [];
  };

  for (const child of node.children) {
    const classified = classifyPasteChild(child, isInline, contentAllowsMarks);
    if (classified === undefined) {
      continue;
    }

    if (classified.kind === "text") {
      inlines.push(classified.node);
      continue;
    }

    if (classified.kind === "inline") {
      inlines.push(...inlineNodes(classified.node, isInline, seen, contentAllowsMarks));
      continue;
    }

    flushInlines();
    for (const part of placeInParent(
      classified.node,
      node.type,
      isInline,
      seen,
      nextNesting,
      blocks.length === 0,
    )) {
      if (disallowedVoid(part, node.type)) {
        flushContainer();
        pieces.push(part);
        continue;
      }

      blocks.push(part);
    }
  }

  flushContainer();

  if (pieces.length > 0) {
    return finishTable(node, pieces);
  }

  const props = elementNode(
    node.type,
    withFirstChild(node.type, [elementNode(contentType ?? "p", [{ text: "" }], undefined)]),
    takeId(node, seen),
  );
  copyAllowedAttrs(node, props);
  return finishTable(node, [props]);
}

type HtmlWidthPlan = {
  widths: (number | null)[] | undefined;
  repairs: Repair[];
};

let htmlWidthPlans: HtmlWidthPlan[] = [];
// The table override sanitizes, then PasteFallback sanitizes the same fragment.
// The first pass consumes the width plan. These repairs are merged back so the
// second pass does not replace the report with an empty list.
let pendingWidthRepairs: Repair[] = [];

function widthRepair(raw: string): Repair {
  const message = raw.endsWith("%")
    ? `A column width of ${raw} was dropped. The column stays automatic.`
    : `A column width of ${raw} was dropped. Only widths from ${TABLE_MIN_COLUMN_WIDTH}px to ${TABLE_MAX_COLUMN_WIDTH}px are kept.`;
  return { path: [], message };
}

function parsedPixelWidth(raw: string): { px: number } | { drop: string } {
  const value = raw.trim();
  const percent = /^(\d+(?:\.\d+)?)%$/.exec(value);
  if (percent) {
    return { drop: value };
  }

  const pixels = /^(\d+(?:\.\d+)?)(?:px)?$/.exec(value);
  const token = pixels?.[1];
  if (token === undefined) {
    return { drop: value.length > 0 ? value : raw };
  }

  const px = Number(token);
  if (!Number.isInteger(px) || px < TABLE_MIN_COLUMN_WIDTH || px > TABLE_MAX_COLUMN_WIDTH) {
    return { drop: value.endsWith("%") ? value : `${px}px` };
  }

  return { px };
}

function elementWidth(element: Element): string | null {
  const style = element.getAttribute("style");
  if (style !== null) {
    const match = /(?:^|;)\s*width\s*:\s*([^;]+)/i.exec(style);
    const declared = match?.[1]?.trim();
    if (declared) {
      return declared;
    }
  }

  const width = element.getAttribute("width");
  return width === null || width.trim().length === 0 ? null : width.trim();
}

function directColumns(table: Element): Element[] {
  const columns: Element[] = [];
  for (const child of table.children) {
    if (child.tagName === "COL") {
      columns.push(child);
      continue;
    }

    if (child.tagName !== "COLGROUP") {
      continue;
    }

    for (const column of child.children) {
      if (column.tagName === "COL") {
        columns.push(column);
      }
    }
  }

  return columns;
}

function widthsFromElements(elements: readonly Element[], spans: readonly number[]): HtmlWidthPlan {
  const widths: (number | null)[] = [];
  const repairs: Repair[] = [];
  let column = 0;
  for (let index = 0; index < elements.length; index += 1) {
    const element = elements[index];
    const span = spans[index] ?? 1;
    if (!element) {
      continue;
    }

    const raw = elementWidth(element);
    const parsed = raw === null ? undefined : parsedPixelWidth(raw);
    if (parsed && "px" in parsed) {
      widths[column] = parsed.px;
    } else {
      if (parsed && "drop" in parsed) {
        repairs.push(widthRepair(parsed.drop));
      }
      widths[column] = null;
    }

    for (let offset = 1; offset < span; offset += 1) {
      widths[column + offset] = null;
    }
    column += span;
  }

  const explicit = widths.some((width) => typeof width === "number");
  return { widths: explicit ? widths : undefined, repairs };
}

function positiveSpan(element: Element): number {
  const raw = element.getAttribute("colspan");
  if (raw === null || !/^[0-9]+$/.test(raw)) {
    return 1;
  }

  const parsed = Number(raw);
  return parsed > 1 ? parsed : 1;
}

// A bare `<col>` is invalid until a parser wraps it in `<colgroup>`. happy-dom
// leaves that column as the table's previous sibling, so the width would be lost.
function adoptedColumns(table: Element): Element[] {
  const gathered: Element[] = [];
  let sibling = table.previousElementSibling;
  while (sibling && (sibling.tagName === "COL" || sibling.tagName === "COLGROUP")) {
    gathered.push(sibling);
    sibling = sibling.previousElementSibling;
  }

  gathered.reverse();
  const columns: Element[] = [];
  for (const element of gathered) {
    if (element.tagName === "COL") {
      columns.push(element);
      continue;
    }

    for (const column of element.children) {
      if (column.tagName === "COL") {
        columns.push(column);
      }
    }
  }

  return columns;
}

function widthsFromHtmlTable(table: Element): HtmlWidthPlan {
  const nested = directColumns(table);
  const columns = nested.length > 0 ? nested : adoptedColumns(table);
  if (columns.length > 0) {
    return widthsFromElements(
      columns,
      columns.map(() => 1),
    );
  }

  const row = table.querySelector("tr");
  const cells =
    row === null
      ? []
      : Array.from(row.children).filter(
          (child) => child.tagName === "TD" || child.tagName === "TH",
        );
  return widthsFromElements(
    cells,
    cells.map((cell) => positiveSpan(cell)),
  );
}

export function rememberHtmlTableWidths(html: string): void {
  const document = new DOMParser().parseFromString(html, "text/html");
  pendingWidthRepairs = [];
  htmlWidthPlans = Array.from(document.querySelectorAll("table")).map((table) =>
    widthsFromHtmlTable(table),
  );
}

export function clearHtmlTableWidths(): void {
  htmlWidthPlans = [];
  pendingWidthRepairs = [];
}

function applyRememberedWidths(table: TElement, repairs: Repair[] | undefined): TElement {
  const plan = htmlWidthPlans.shift();
  if (plan === undefined) {
    return table;
  }

  pendingWidthRepairs.push(...plan.repairs);
  if (repairs !== undefined) {
    repairs.push(...plan.repairs);
  }

  if (plan.widths === undefined) {
    return table;
  }

  return { ...table, colSizes: plan.widths };
}

function finishTable(node: TElement, pieces: TElement[]): TElement[] {
  if (node.type !== "table") {
    return pieces;
  }

  return pieces.map((piece) => {
    if (piece.type !== "table") {
      return piece;
    }

    const capped = capPastedTable(piece, activePasteRepairs);
    const sized = applyRememberedWidths(capped, activePasteRepairs);
    return repairTableGrid(sized, activePasteRepairs);
  });
}

function noteMentionInputPaste(): void {
  const repair: Repair = {
    path: [],
    message: "A mention input was turned into plain text.",
  };
  activePasteRepairs?.push(repair);
  pendingMentionInputRepairs.push(repair);
}

function pastedMentionNodes(node: TElement, seen: Set<string>): Descendant[] {
  if (!isRecord(node) || !isStoredMention(node)) {
    const label = typeof node.label === "string" ? sanitizeMentionLabel(node.label) : undefined;
    return label === undefined ? [] : [{ text: label }];
  }

  const mention = elementNode(KEYS.mention, [{ text: "" }], allocateMentionId(seen));
  mention.entityType = MENTION_ENTITY_TYPE;
  mention.entityId = node.entityId;
  mention.label = node.label;
  return [mention];
}

function expandBlock(
  node: TElement,
  isInline: IsInline,
  seen: Set<string>,
  nesting: Nesting = emptyNesting,
): TElement[] {
  if (isDroppedMediaType(node.type)) {
    noteDroppedMedia();
    return [];
  }

  if (node.type === KEYS.mentionInput) {
    noteMentionInputPaste();
    const text = isRecord(node) ? mentionInputPlainText(node) : "@";
    return [paragraph([{ text }])];
  }

  if (node.type === KEYS.mention) {
    const nodes = pastedMentionNodes(node, seen);
    return [paragraph(nodes.length > 0 ? nodes : [{ text: "" }])];
  }

  if (isVoidElementType(node.type) && allowedElementAttrs(node.type) !== undefined) {
    if (node.type === BOOKMARK_KEY) {
      return pastedBookmark(node, seen);
    }

    if (node.type === KEYS.toc) {
      const toc = elementNode(KEYS.toc, [{ text: "" }], takeId(node, seen));
      copyAllowedAttrs(node, toc);
      return [toc];
    }

    if (node.type === KEYS.equation) {
      const equation = elementNode(KEYS.equation, [{ text: "" }], takeId(node, seen));
      equation.texExpression = isStoredEquationExpression(node.texExpression)
        ? node.texExpression
        : "";
      return [equation];
    }

    if (node.type === SYNCED_REF_KEY) {
      const synced = elementNode(SYNCED_REF_KEY, [{ text: "" }], takeId(node, seen));
      if (isStoredSyncedTargetId(node.targetBlockId)) {
        synced.targetBlockId = node.targetBlockId;
      }
      return [synced];
    }

    return [elementNode(node.type, [{ text: "" }], takeId(node, seen))];
  }

  if (allowedChildTypes(node.type) !== undefined) {
    return containerPieces(node, isInline, seen, nesting);
  }

  const allowed = allowedElementAttrs(node.type) !== undefined;
  const allowMarks = elementAllowsMarks(node.type);
  const paragraphs: TElement[] = [];
  let inlines: Descendant[] = [];
  let usedOwnId = false;
  let sawDroppedMedia = false;

  const flush = (): void => {
    if (inlines.length === 0) {
      return;
    }

    if (allowed) {
      const id = usedOwnId ? undefined : takeId(node, seen);
      usedOwnId = true;
      const props = elementNode(node.type, inlines, id);
      copyAllowedAttrs(node, props);
      paragraphs.push(props);
    } else {
      paragraphs.push(paragraph(inlines));
    }

    inlines = [];
  };

  for (const child of node.children) {
    if (isRecord(child) && typeof child.type === "string" && isDroppedMediaType(child.type)) {
      noteDroppedMedia();
      sawDroppedMedia = true;
      continue;
    }

    const classified = classifyPasteChild(child, isInline, allowMarks);
    if (classified === undefined) {
      continue;
    }

    if (classified.kind === "text") {
      inlines.push(classified.node);
      continue;
    }

    if (classified.kind === "inline") {
      inlines.push(...inlineNodes(classified.node, isInline, seen, allowMarks));
      continue;
    }

    flush();
    paragraphs.push(...expandBlock(classified.node, isInline, seen, nesting));
  }

  if (sawDroppedMedia && paragraphs.length === 0 && !hasContent(inlines)) {
    return [];
  }

  flush();

  if (paragraphs.length > 0) {
    return paragraphs;
  }

  if (allowed) {
    const props = elementNode(node.type, [{ text: "" }], takeId(node, seen));
    copyAllowedAttrs(node, props);
    return [props];
  }

  return [paragraph([])];
}

function inlineNodes(
  node: TElement,
  isInline: IsInline,
  seen: Set<string>,
  allowMarks = true,
): Descendant[] {
  if (isDroppedMediaType(node.type)) {
    noteDroppedMedia();
    return [];
  }

  if (node.type === KEYS.mentionInput) {
    noteMentionInputPaste();
    const text = isRecord(node) ? mentionInputPlainText(node) : "@";
    return text.length > 0 ? [{ text }] : [];
  }

  if (node.type === KEYS.mention) {
    if (!allowMarks) {
      const label = typeof node.label === "string" ? sanitizeMentionLabel(node.label) : undefined;
      return label === undefined ? [] : [{ text: label }];
    }

    return pastedMentionNodes(node, seen);
  }

  if (node.type === KEYS.link) {
    const url = typeof node.url === "string" ? node.url : "";
    const safe = sanitizeLinkUrl(url);
    if (!allowMarks || safe === undefined) {
      if (safe === undefined && url.length > 0) {
        noteUnsafePastedLink();
      }

      return unwrapInline(node.children, isInline, seen, allowMarks);
    }
  }

  if (allowedElementAttrs(node.type) === undefined) {
    return unwrapInline(node.children, isInline, seen, allowMarks);
  }

  const children: Descendant[] = [];
  for (const child of node.children) {
    const classified = classifyPasteChild(child, isInline, allowMarks);
    if (classified === undefined || classified.kind === "block") {
      continue;
    }

    if (classified.kind === "text") {
      children.push(classified.node);
      continue;
    }

    children.push(...inlineNodes(classified.node, isInline, seen, allowMarks));
  }

  const props = elementNode(
    node.type,
    children.length > 0 ? children : [{ text: "" }],
    takeId(node, seen),
  );
  copyAllowedAttrs(node, props);
  return [props];
}

function unwrapInline(
  children: unknown[],
  isInline: IsInline,
  seen: Set<string>,
  allowMarks = true,
): Descendant[] {
  const nodes: Descendant[] = [];
  for (const child of children) {
    const classified = classifyPasteChild(child, isInline, allowMarks);
    if (classified === undefined || classified.kind === "block") {
      continue;
    }

    if (classified.kind === "text") {
      nodes.push(classified.node);
      continue;
    }

    nodes.push(...inlineNodes(classified.node, isInline, seen, allowMarks));
  }

  return nodes;
}

export function sanitizePastedFragment(
  fragment: readonly unknown[],
  options?: PasteSanitizeOptions,
): EditorValue {
  const seen = options?.seenIds ?? new Set<string>();
  const isInline = options?.isInline ?? (() => false);
  const previousRepairs = activePasteRepairs;
  activePasteRepairs = options?.repairs;
  const paragraphs: EditorValue = [];
  let inlines: Descendant[] = [];

  const flush = (): void => {
    if (!hasContent(inlines)) {
      inlines = [];
      return;
    }

    paragraphs.push(paragraph(inlines));
    inlines = [];
  };

  for (const node of fragment) {
    const classified = classifyPasteChild(node, isInline);
    if (classified === undefined) {
      continue;
    }

    if (classified.kind === "text") {
      inlines.push(classified.node);
      continue;
    }

    if (classified.kind === "inline") {
      inlines.push(...inlineNodes(classified.node, isInline, seen));
      continue;
    }

    flush();
    paragraphs.push(...expandBlock(classified.node, isInline, seen));
  }

  flush();

  activePasteRepairs = previousRepairs;
  htmlWidthPlans = [];
  return paragraphs;
}

function collectEditorIds(value: readonly unknown[]): Set<string> {
  const seen = new Set<string>();
  for (const node of value) {
    collectIds(node, seen);
  }

  return seen;
}

export function preparePastedFragment(
  editor: SlateEditor,
  fragment: readonly unknown[],
): EditorValue {
  const repairs: Repair[] = [];
  const value = sanitizePastedFragment(fragment, {
    isInline: (node) => isElementNode(node) && editor.api.isInline(node),
    seenIds: collectEditorIds(editor.children),
    repairs,
  });
  for (const repair of pendingWidthRepairs) {
    if (!repairs.some((item) => item.message === repair.message)) {
      repairs.push(repair);
    }
  }
  for (const repair of pendingImageRepairs) {
    if (!repairs.some((item) => item.message === repair.message)) {
      repairs.push(repair);
    }
  }
  for (const repair of pendingMentionInputRepairs) {
    if (!repairs.some((item) => item.message === repair.message)) {
      repairs.push(repair);
    }
  }
  for (const repair of unsafePastedLinkRepairs()) {
    if (!repairs.some((item) => item.message === repair.message)) {
      repairs.push(repair);
    }
  }
  setPasteRepairs(editor, repairs);
  return value;
}

export const PasteFallbackPlugin = createSlatePlugin({
  key: "pasteFallback",
  priority: PASTE_FALLBACK_PRIORITY,
  parsers: {
    html: {
      deserializer: {
        isElement: true,
        rules: [{ validNodeName: "*" }],
        parse: () => ({ type: "p" }),
        query: ({ element }) => isHtmlBlockElement(element),
      },
    },
  },
}).overrideEditor(({ editor, tf: { insertFragment } }) => ({
  transforms: {
    insertFragment(fragment, options) {
      // TablePlugin inserts a one-table fragment before this fallback, so the
      // table override sanitizes that path too. This still covers every other fragment.
      // Repairs are remembered across the table override's second sanitize.
      try {
        insertFragment(preparePastedFragment(editor, fragment), options);
      } finally {
        clearPendingImageRepairs();
        clearPendingMentionInputRepairs();
        clearUnsafePastedLinkRepairs();
      }
    },
  },
}));

function transferFileCount(data: DataTransfer): number {
  const files = Reflect.get(data, "files");
  if (typeof files !== "object" || files === null) {
    return 0;
  }

  const length = Reflect.get(files, "length");
  return typeof length === "number" && Number.isFinite(length) ? length : 0;
}

type MediaDropEvent = {
  preventDefault: () => void;
  dataTransfer: DataTransfer | null;
};

export function rejectDroppedFiles(editor: SlateEditor, event: MediaDropEvent): boolean {
  const data = event.dataTransfer;
  if (data === null || transferFileCount(data) === 0) {
    return false;
  }

  event.preventDefault();
  setPasteRepairs(editor, [{ path: [], message: MEDIA_NOT_SUPPORTED }]);
  return true;
}

// Registered after the paste-url plugin so a file list is rejected before a
// link, a table, or a code block reads the same clipboard.
export const unsupportedMediaPlugin = createSlatePlugin({
  key: "unsupportedMedia",
  parsers: {
    html: {
      deserializer: {
        isElement: true,
        rules: [
          { validNodeName: "IMG" },
          { validNodeName: "VIDEO" },
          { validNodeName: "AUDIO" },
          { validNodeName: "IFRAME" },
        ],
        parse: () => ({ type: "unsupported_media", children: [{ text: "" }] }),
      },
    },
  },
}).overrideEditor(({ editor, tf: { insertData } }) => ({
  transforms: {
    insertData(data: DataTransfer) {
      if (transferFileCount(data) > 0) {
        setPasteRepairs(editor, [{ path: [], message: MEDIA_NOT_SUPPORTED }]);
        return;
      }

      insertData(data);
    },
  },
  handlers: {
    onDrop: ({ event }: { event: MediaDropEvent }) => {
      if (rejectDroppedFiles(editor, event)) {
        return true;
      }
    },
  },
}));
