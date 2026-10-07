import {
  createSlatePlugin,
  isHtmlBlockElement,
  type Descendant,
  type TElement,
  type TText,
} from "platejs";

import {
  allowedChildTypes,
  allowsFirstChild,
  containerContentType,
  allowedElementAttrs,
  firstChildForbiddenAttrs,
  firstChildType,
  firstChildTypes,
  isAllowedElementAttrValue,
  isAllowedMark,
  isAllowedMarkValue,
  isVoidElementType,
  maxNesting,
  unsatisfiedDependentAttrs,
} from "./editor-document-schema";
import type { EditorValue } from "./editor-value";

export type PasteSanitizeOptions = {
  isInline?: (node: Record<string, unknown>) => boolean;
  seenIds?: Set<string>;
};

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

function sanitizeText(node: Record<string, unknown>): TText {
  const text = typeof node.text === "string" ? node.text : "";
  const next: TText = { text };

  for (const key of Object.keys(node)) {
    if (key === "text" || !isAllowedMark(key) || !isAllowedMarkValue(key, node[key])) {
      continue;
    }

    next[key] = node[key];
  }

  return next;
}

function classifyPasteChild(child: unknown, isInline: IsInline): PasteChild | undefined {
  if (typeof child === "string") {
    return { kind: "text", node: { text: child } };
  }

  if (!isRecord(child)) {
    return undefined;
  }

  if (isTextNode(child)) {
    return { kind: "text", node: sanitizeText(child) };
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

function copyAllowedAttrs(node: Record<string, unknown>, props: TElement): void {
  const allowed = allowedElementAttrs(props.type);
  if (allowed === undefined) {
    return;
  }

  for (const key of allowed) {
    if (key === "id" || !(key in node) || !isAllowedElementAttrValue(props.type, key, node[key])) {
      continue;
    }

    props[key] = node[key];
  }

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

  return expandBlock({ ...node, type: target }, isInline, seen, nesting);
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
    return pieces;
  }

  const props = elementNode(
    node.type,
    withFirstChild(node.type, [elementNode(contentType ?? "p", [{ text: "" }], undefined)]),
    takeId(node, seen),
  );
  copyAllowedAttrs(node, props);
  return [props];
}

function expandBlock(
  node: TElement,
  isInline: IsInline,
  seen: Set<string>,
  nesting: Nesting = emptyNesting,
): TElement[] {
  if (isVoidElementType(node.type) && allowedElementAttrs(node.type) !== undefined) {
    return [elementNode(node.type, [{ text: "" }], takeId(node, seen))];
  }

  if (allowedChildTypes(node.type) !== undefined) {
    return containerPieces(node, isInline, seen, nesting);
  }

  const allowed = allowedElementAttrs(node.type) !== undefined;
  const paragraphs: TElement[] = [];
  let inlines: Descendant[] = [];
  let usedOwnId = false;

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
    paragraphs.push(...expandBlock(classified.node, isInline, seen, nesting));
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

function inlineNodes(node: TElement, isInline: IsInline, seen: Set<string>): Descendant[] {
  if (allowedElementAttrs(node.type) === undefined) {
    return unwrapInline(node.children, isInline, seen);
  }

  const children: Descendant[] = [];
  for (const child of node.children) {
    const classified = classifyPasteChild(child, isInline);
    if (classified === undefined || classified.kind === "block") {
      continue;
    }

    if (classified.kind === "text") {
      children.push(classified.node);
      continue;
    }

    children.push(...inlineNodes(classified.node, isInline, seen));
  }

  const props = elementNode(
    node.type,
    children.length > 0 ? children : [{ text: "" }],
    takeId(node, seen),
  );
  copyAllowedAttrs(node, props);
  return [props];
}

function unwrapInline(children: unknown[], isInline: IsInline, seen: Set<string>): Descendant[] {
  const nodes: Descendant[] = [];
  for (const child of children) {
    const classified = classifyPasteChild(child, isInline);
    if (classified === undefined || classified.kind === "block") {
      continue;
    }

    if (classified.kind === "text") {
      nodes.push(classified.node);
      continue;
    }

    nodes.push(...inlineNodes(classified.node, isInline, seen));
  }

  return nodes;
}

export function sanitizePastedFragment(
  fragment: readonly unknown[],
  options?: PasteSanitizeOptions,
): EditorValue {
  const seen = options?.seenIds ?? new Set<string>();
  const isInline = options?.isInline ?? (() => false);
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

  return paragraphs;
}

function collectEditorIds(value: readonly unknown[]): Set<string> {
  const seen = new Set<string>();
  for (const node of value) {
    collectIds(node, seen);
  }

  return seen;
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
      insertFragment(
        sanitizePastedFragment(fragment, {
          isInline: (node) => isElementNode(node) && editor.api.isInline(node),
          seenIds: collectEditorIds(editor.children),
        }),
        options,
      );
    },
  },
}));
