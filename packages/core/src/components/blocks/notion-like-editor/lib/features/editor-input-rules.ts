import { LIST_NUMBER_RANGE } from "../document/editor-document-schema";
import type { BlockMenuKind } from "./editor-block-menu";

type BlockInputTrigger =
  { kind: BlockMenuKind; restart?: number; checked?: boolean } | { kind: "divider" };

const BULLET_TRIGGERS = new Set(["- ", "* ", "+ "]);

const TODO_TRIGGERS: Record<string, boolean> = {
  "[] ": false,
  "[ ] ": false,
  "[x] ": true,
  "[X] ": true,
};

const HEADING_TRIGGERS: Record<string, BlockMenuKind> = {
  "# ": "h1",
  "## ": "h2",
  "### ": "h3",
};

// The text before the caret is the whole trigger. Text after the caret is kept.
export function matchBlockInputTrigger(before: string): BlockInputTrigger | null {
  const heading = HEADING_TRIGGERS[before];
  if (heading !== undefined) {
    return { kind: heading };
  }

  if (BULLET_TRIGGERS.has(before)) {
    return { kind: "bulleted" };
  }

  if (Object.hasOwn(TODO_TRIGGERS, before)) {
    return { kind: "todo", checked: TODO_TRIGGERS[before] };
  }

  if (before === "> ") {
    return { kind: "quote" };
  }

  if (before === "```") {
    return { kind: "code" };
  }

  if (before === "---") {
    return { kind: "divider" };
  }

  const numbered = /^(\d{1,4})[.)] $/.exec(before);
  if (numbered?.[1] === undefined) {
    return null;
  }

  const value = Number(numbered[1]);
  if (!Number.isInteger(value) || value < LIST_NUMBER_RANGE.min || value > LIST_NUMBER_RANGE.max) {
    return null;
  }

  return { kind: "numbered", restart: value === LIST_NUMBER_RANGE.min ? undefined : value };
}

export type InlineInputMark = "bold" | "italic" | "strikethrough" | "code";

type InlineInputMatch = {
  mark: InlineInputMark;
  openStart: number;
  openEnd: number;
  closeStart: number;
  closeEnd: number;
};

const INLINE_RULES: readonly { mark: InlineInputMark; token: string }[] = [
  { mark: "bold", token: "**" },
  { mark: "strikethrough", token: "~~" },
  { mark: "code", token: "`" },
  { mark: "italic", token: "*" },
  { mark: "italic", token: "_" },
];

function isOpeningBoundary(before: string, index: number): boolean {
  if (index === 0) {
    return true;
  }

  const previous = before.charAt(index - 1);
  return /[\s([{"'“‘«]/.test(previous);
}

function delimiterGlued(token: string, before: string, index: number): boolean {
  if (index === 0) {
    return false;
  }

  return before.charAt(index - 1) === token;
}

// `text` is non-empty and does not start or end with whitespace.
function innerTextOk(text: string): boolean {
  if (text.length === 0 || text !== text.trim()) {
    return false;
  }

  return !/^\s|\s$/.test(text);
}

export function matchInlineInputTrigger(
  before: string,
  charAfter: string | undefined,
): InlineInputMatch | null {
  for (const rule of INLINE_RULES) {
    if (!before.endsWith(rule.token)) {
      continue;
    }

    if (rule.token === "_" && charAfter !== undefined && /[\p{L}\p{N}_]/u.test(charAfter)) {
      continue;
    }

    const closeStart = before.length - rule.token.length;
    const body = before.slice(0, closeStart);
    let from = body.length;
    while (from > 0) {
      const openStart = body.lastIndexOf(rule.token, from - 1);
      if (openStart < 0) {
        break;
      }

      const inner = body.slice(openStart + rule.token.length);
      if (
        delimiterGlued(rule.token, body, openStart) ||
        (rule.token.length === 1 && body.charAt(openStart + 1) === rule.token) ||
        !isOpeningBoundary(before, openStart) ||
        !innerTextOk(inner)
      ) {
        from = openStart;
        continue;
      }

      return {
        mark: rule.mark,
        openStart,
        openEnd: openStart + rule.token.length,
        closeStart,
        closeEnd: before.length,
      };
    }
  }

  return null;
}
