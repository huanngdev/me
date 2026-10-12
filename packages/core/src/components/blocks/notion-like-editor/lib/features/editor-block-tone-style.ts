import { KEYS } from "platejs";

import { isPaletteToken, type PaletteToken } from "../document/editor-document-schema";

// Kept free of editor and command imports: the static renderer imports this module.
export type BlockToneKind = "text" | "background";

export const TONE_ATTR = {
  text: "textTone",
  background: "backgroundTone",
} as const satisfies Record<BlockToneKind, string>;

// Cells own their colour. Callout, toggle and code block own theirs, so they are not listed.
export const BLOCK_TONE_TYPES: readonly string[] = [
  KEYS.p,
  KEYS.h1,
  KEYS.h2,
  KEYS.h3,
  KEYS.blockquote,
];

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function storedTone(node: unknown, kind: BlockToneKind): PaletteToken | null {
  const value: unknown = isRecord(node) ? node[TONE_ATTR[kind]] : undefined;
  return isPaletteToken(value) ? value : null;
}

// One injector for editor and static. A block tone is a block attr, so it cannot reuse the leaf
// token helper, which replaces style and reads one key. Text and background both go on the block.
export function blockToneNodeProps() {
  return {
    transformProps: ({
      element,
      props,
    }: {
      element?: unknown;
      props: Record<string, unknown>;
    }): Record<string, unknown> => {
      const textTone = storedTone(element, "text");
      const backgroundTone = storedTone(element, "background");
      if (textTone === null && backgroundTone === null) {
        return props;
      }

      const style: Record<string, unknown> = { ...(isRecord(props.style) ? props.style : {}) };
      const data: Record<string, string> = {};
      if (textTone !== null) {
        style.color = `var(--editor-text-${textTone})`;
        data["data-block-text-tone"] = textTone;
      }

      if (backgroundTone !== null) {
        // The outline tints the block without changing its box. box-shadow is reserved for selection.
        style.backgroundColor = `var(--editor-bg-${backgroundTone})`;
        style.borderRadius = "4px";
        style.outline = `4px solid var(--editor-bg-${backgroundTone})`;
        data["data-block-background-tone"] = backgroundTone;
      }

      return { ...props, ...data, style };
    },
  };
}
