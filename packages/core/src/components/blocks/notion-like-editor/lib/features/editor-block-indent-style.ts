import { KEYS } from "platejs";

import { LIST_INDENTS, type ListIndent } from "../document/editor-document-schema";

// Kept free of editor and command imports: the static renderer imports this module.
// Plain indent is the native `indent` attr. A list paragraph reads it as list depth.
export const BLOCK_INDENT_TYPES: readonly string[] = [
  KEYS.p,
  KEYS.h1,
  KEYS.h2,
  KEYS.h3,
  KEYS.blockquote,
];

export const BLOCK_INDENT_MAX = 6;

const BLOCK_INDENT_STEP_PX = 24;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isListParagraph(node: unknown): boolean {
  return isRecord(node) && node.type === KEYS.p && typeof node.listStyleType === "string";
}

// A list item without a stored indent is depth 1.
export function listIndentOf(node: unknown): number {
  if (!isRecord(node) || !("indent" in node)) {
    return 1;
  }

  return typeof node.indent === "number" ? node.indent : 1;
}

function isListIndent(value: unknown): value is ListIndent {
  return LIST_INDENTS.some((level) => level === value);
}

// 0 when absent or invalid. An invalid stored value renders nothing and counts as unset.
export function blockIndentOf(node: unknown): number {
  const value: unknown = isRecord(node) ? node.indent : undefined;
  return isListIndent(value) ? value : 0;
}

// Plain blocks only. A list paragraph keeps the step the list markup draws.
export function blockIndentNodeProps() {
  return {
    transformProps: ({
      element,
      props,
    }: {
      element?: unknown;
      props: Record<string, unknown>;
    }): Record<string, unknown> => {
      const indent = blockIndentOf(element);
      if (indent === 0 || isListParagraph(element)) {
        return props;
      }

      const style: Record<string, unknown> = { ...(isRecord(props.style) ? props.style : {}) };
      style.marginInlineStart = `${indent * BLOCK_INDENT_STEP_PX}px`;
      return { ...props, "data-block-indent": String(indent), style };
    },
  };
}

// Plate's IndentPlugin injects margin-left on any paragraph that has indent. Plain blocks
// get their own margin here, so that injection is limited to list paragraphs.
export function listIndentInjects({ nodeProps }: { nodeProps: { element?: unknown } }): boolean {
  return isListParagraph(nodeProps.element);
}
