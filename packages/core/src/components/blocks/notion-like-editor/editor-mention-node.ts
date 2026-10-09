import { KEYS, nanoid, type Descendant, type TElement, type TText } from "platejs";

import { formatBlockLabel } from "./editor-document";
import type { Repair } from "./editor-document-ids";
import type { TableGridIssue } from "./editor-table-grid";
import type { EditorValue } from "./editor-value";

// Plate's mention node stores `value` (display text) and `key` (item id).
// @platejs/mention 53.0.0 BaseMentionPlugin-uPSCCRSr.js insert.mention, lines 32-38.
// This document stores label for Plate's value and entityId for Plate's key.
// entityType is not a Plate field. Identity is entityType + entityId, never the label.
export const MENTION_ENTITY_TYPE = "person";
export const MENTION_ENTITY_ID_MAX = 128;
export const MENTION_LABEL_MAX = 120;

export type MentionEntityType = typeof MENTION_ENTITY_TYPE;

export type MentionEntity = {
  entityType: MentionEntityType;
  entityId: string;
  label: string;
  email?: string;
};

export type MentionProvider = {
  search: (query: string, signal: AbortSignal) => Promise<MentionEntity[]>;
  resolve?: (
    entityType: string,
    entityId: string,
    signal: AbortSignal,
  ) => Promise<MentionEntity | null>;
};

function hasControlChar(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) {
      return true;
    }
  }

  return false;
}

export function isStoredMentionEntityId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MENTION_ENTITY_ID_MAX &&
    !hasControlChar(value)
  );
}

export function isStoredMentionLabel(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MENTION_LABEL_MAX &&
    !hasControlChar(value)
  );
}

export function isStoredMention(node: Record<string, unknown>): boolean {
  return (
    node.entityType === MENTION_ENTITY_TYPE &&
    isStoredMentionEntityId(node.entityId) &&
    isStoredMentionLabel(node.label)
  );
}

export function sanitizeMentionLabel(value: string): string | undefined {
  let next = "";
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) {
      continue;
    }

    next += value.charAt(index);
  }

  const trimmed = next.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  if (trimmed.length > MENTION_LABEL_MAX) {
    return trimmed.slice(0, MENTION_LABEL_MAX);
  }

  return trimmed;
}

export function checkMentionNode(
  node: Record<string, unknown>,
  path: number[],
): readonly TableGridIssue[] {
  if (isStoredMention(node)) {
    return [];
  }

  return [
    {
      path,
      message: `${formatBlockLabel(path)} has an unsupported mention. Restore from a backup or remove the block.`,
    },
  ];
}

export function allocateMentionId(seen?: Set<string>): string {
  let id = nanoid(10);
  let suffix = 1;
  while (id.length === 0 || seen?.has(id) === true) {
    id = `${nanoid(10)}-${suffix}`;
    suffix += 1;
  }

  seen?.add(id);
  return id;
}

function isElementNode(node: unknown): node is TElement {
  return (
    typeof node === "object" &&
    node !== null &&
    "type" in node &&
    typeof node.type === "string" &&
    "children" in node &&
    Array.isArray(node.children)
  );
}

function isTextNode(node: Descendant): node is TText {
  return "text" in node && typeof node.text === "string" && !("children" in node);
}

function childText(node: Record<string, unknown>): string {
  if (!Array.isArray(node.children)) {
    return "";
  }

  let text = "";
  for (const child of node.children) {
    if (
      typeof child === "object" &&
      child !== null &&
      "text" in child &&
      typeof child.text === "string"
    ) {
      text += child.text;
    }
  }

  return text;
}

export function mentionInputPlainText(node: Record<string, unknown>, pendingQuery = ""): string {
  const trigger = typeof node.trigger === "string" && node.trigger.length > 0 ? node.trigger : "@";
  const queryFromNode = typeof node.query === "string" ? node.query : "";
  const fromChildren = childText(node);
  let typed = pendingQuery;
  if (queryFromNode.length > 0) {
    typed = queryFromNode;
  } else if (fromChildren.length > 0) {
    typed = fromChildren;
  }

  if (typed.length === 0) {
    return trigger;
  }

  if (typed.startsWith(trigger)) {
    return typed;
  }

  return `${trigger}${typed}`;
}

function mentionInputRepair(path: number[]): Repair {
  return {
    path,
    message: `${formatBlockLabel(path)} had a mention input. It was turned into plain text.`,
  };
}

function pushText(children: Descendant[], text: string): void {
  const last = children[children.length - 1];
  if (last !== undefined && isTextNode(last)) {
    children[children.length - 1] = { ...last, text: last.text + text };
    return;
  }

  children.push({ text });
}

function repairBlock(
  node: TElement,
  path: number[],
  repairs: Repair[],
  pendingQuery: string,
): TElement {
  if (node.type === KEYS.mentionInput) {
    repairs.push(mentionInputRepair(path));
    return {
      type: KEYS.p,
      children: [{ text: mentionInputPlainText(node, pendingQuery) }],
    };
  }

  if (!Array.isArray(node.children)) {
    return node;
  }

  let changed = false;
  const children: Descendant[] = [];
  for (let index = 0; index < node.children.length; index += 1) {
    const child = node.children[index];
    if (child === undefined) {
      continue;
    }

    if (isElementNode(child) && child.type === KEYS.mentionInput) {
      changed = true;
      repairs.push(mentionInputRepair([...path, index]));
      pushText(children, mentionInputPlainText(child, pendingQuery));
      continue;
    }

    if (isElementNode(child)) {
      const repaired = repairBlock(child, [...path, index], repairs, pendingQuery);
      if (repaired !== child) {
        changed = true;
      }

      children.push(repaired);
      continue;
    }

    children.push(child);
  }

  if (!changed) {
    return node;
  }

  return { ...node, children };
}

export function repairMentionInputs(
  content: EditorValue,
  pendingQuery = "",
): { content: EditorValue; repairs: Repair[] } {
  const repairs: Repair[] = [];
  let changed = false;
  const next = content.map((node, index) => {
    const repaired = repairBlock(node, [index], repairs, pendingQuery);
    if (repaired !== node) {
      changed = true;
    }

    return repaired;
  });

  if (!changed) {
    return { content, repairs };
  }

  return { content: next, repairs };
}
