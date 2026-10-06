import {
  createSlatePlugin,
  isHtmlBlockElement,
  type Descendant,
  type TElement,
  type TText,
} from "platejs";

import {
  allowedElementAttrs,
  isAllowedElementAttrValue,
  isAllowedMark,
  isAllowedMarkValue,
  unsatisfiedDependentAttrs,
} from "./editor-document-schema";
import type { EditorValue } from "./editor-value";

export type PasteSanitizeOptions = {
  isInline?: (node: Record<string, unknown>) => boolean;
  seenIds?: Set<string>;
};

type IsInline = (node: Record<string, unknown>) => boolean;

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

function expandBlock(node: TElement, isInline: IsInline, seen: Set<string>): TElement[] {
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
    paragraphs.push(...expandBlock(classified.node, isInline, seen));
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
