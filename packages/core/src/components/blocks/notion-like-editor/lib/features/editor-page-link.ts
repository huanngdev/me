import type { TElement } from "platejs";

import { formatBlockLabel } from "../document/editor-document";
import type { Repair } from "../document/editor-document-ids";
import type { EditorValue } from "../document/editor-value";
import { truncateUnits } from "./editor-find";
import { hasControlChar, isStoredMentionEntityId } from "./editor-mention-node";
import type { TableGridIssue } from "./editor-table-grid";

export const PAGE_LINK_KEY = "page_link";
export const PAGE_LINK_KINDS = ["link", "child"] as const;
export const PAGE_LINK_TITLE_MAX = 200;
export const PAGE_LINK_ICON_MAX = 8;
export const PAGE_LINK_UNTITLED = "Untitled";

export const PAGE_LINK_PASTE_DROPPED = "A page link was removed because its page id is not valid.";
export const PAGE_LINK_TITLE_CLEANED = "A page link title was cleaned to fit the editor.";

export type PageLinkKind = (typeof PAGE_LINK_KINDS)[number];

export type PageEntity = {
  pageId: string;
  title: string;
  icon?: string;
};

export type PageResolution =
  { status: "ok"; page: PageEntity } | { status: "missing" } | { status: "denied" };

export type PageProvider = {
  search: (query: string, signal: AbortSignal) => Promise<PageEntity[]>;
  resolve: (pageId: string, signal: AbortSignal) => Promise<PageResolution>;
};

export type PageOpenRequest = { pageId: string; kind: PageLinkKind };

export type PageLinkHost = {
  provider: PageProvider | null;
  onOpenPage: ((request: PageOpenRequest) => void) | null;
};

export type PageLinkStatus = "loading" | "ok" | "fallback" | "missing" | "denied" | "unavailable";

export type PageLinkFields = {
  pageId: string;
  title: string;
  kind: PageLinkKind;
};

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

// A page id follows the mention entity id rule: 1..128 characters, no control characters.
export function isStoredPageId(value: unknown): value is string {
  return isStoredMentionEntityId(value);
}

export function isStoredPageLinkTitle(value: unknown): value is string {
  return typeof value === "string" && value.length <= PAGE_LINK_TITLE_MAX && !hasControlChar(value);
}

export function cleanPageLinkTitle(value: string): string {
  let stripped = "";
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) {
      continue;
    }

    stripped += value.charAt(index);
  }

  return truncateUnits(stripped, PAGE_LINK_TITLE_MAX);
}

export function pageLinkDisplayTitle(title: string): string {
  return title.trim().length === 0 ? PAGE_LINK_UNTITLED : title;
}

function isPageLinkKind(value: unknown): value is PageLinkKind {
  return value === "link" || value === "child";
}

export function storedPageLinkKind(value: unknown): PageLinkKind {
  return value === "child" ? "child" : "link";
}

// One grapheme of at most PAGE_LINK_ICON_MAX units, with no control characters.
function sanitizePageIcon(value: unknown): string | undefined {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > PAGE_LINK_ICON_MAX ||
    hasControlChar(value)
  ) {
    return undefined;
  }

  return Array.from(graphemes.segment(value)).length === 1 ? value : undefined;
}

// Provider values are untrusted. The title is cleaned, and the icon is kept only when it is one grapheme.
export function sanitizePageEntity(entity: PageEntity): PageEntity {
  const icon = sanitizePageIcon(entity.icon);
  return {
    pageId: entity.pageId,
    title: cleanPageLinkTitle(entity.title),
    icon,
  };
}

export function pageLinkNode(
  pageId: string,
  title: string,
  kind: PageLinkKind = "link",
  id?: string,
): TElement {
  const node: TElement = {
    type: PAGE_LINK_KEY,
    pageId,
    title: cleanPageLinkTitle(title),
    kind,
    children: [{ text: "" }],
  };
  if (id !== undefined) {
    node.id = id;
  }

  return node;
}

// The fields a copied page link keeps. A missing pageId drops the block. Title and kind are cleaned.
export function storedPageLink(node: Record<string, unknown>): PageLinkFields | undefined {
  if (!isStoredPageId(node.pageId)) {
    return undefined;
  }

  return {
    pageId: node.pageId,
    title: typeof node.title === "string" ? cleanPageLinkTitle(node.title) : "",
    kind: storedPageLinkKind(node.kind),
  };
}

// An invalid pageId is not repaired. The document is unsupported, as a bookmark with a bad url is.
export function checkPageLinkNode(
  node: Record<string, unknown>,
  path: number[],
): readonly TableGridIssue[] {
  if (isStoredPageId(node.pageId)) {
    return [];
  }

  return [
    {
      path,
      message: `${formatBlockLabel(path)} has an unsupported pageId. Restore from a backup or remove the block.`,
    },
  ];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// The input is raw until the validator has walked it, so every level is checked before it is read.
function repairPageLinkFields(
  node: Record<string, unknown>,
  path: number[],
  repairs: Repair[],
): Record<string, unknown> {
  let next = node;
  if (!isStoredPageLinkTitle(node.title)) {
    next = {
      ...next,
      title: typeof node.title === "string" ? cleanPageLinkTitle(node.title) : "",
    };
    repairs.push({
      path,
      message: `${formatBlockLabel(path)} has an unsupported title. The fallback title was cleaned.`,
    });
  }

  if (!isPageLinkKind(node.kind)) {
    next = { ...next, kind: "link" };
    repairs.push({
      path,
      message: `${formatBlockLabel(path)} has an unsupported kind. The page link was set to a link.`,
    });
  }

  return next;
}

function repairPageLinkNode(node: unknown, path: number[], repairs: Repair[]): unknown {
  if (!isRecord(node)) {
    return node;
  }

  const before = repairs.length;
  let next = node.type === PAGE_LINK_KEY ? repairPageLinkFields(node, path, repairs) : node;

  let childChanged = false;
  if (Array.isArray(node.children)) {
    const children = node.children.map((child: unknown, index: number) => {
      const repaired = repairPageLinkNode(child, [...path, index], repairs);
      if (repaired !== child) {
        childChanged = true;
      }

      return repaired;
    });
    if (childChanged) {
      next = { ...next, children };
    }
  }

  return repairs.length === before && !childChanged ? node : next;
}

// Title and kind are repaired and reported. A bad pageId is left for the validator to reject.
export function repairPageLinkContent(content: EditorValue): {
  content: EditorValue;
  repairs: Repair[];
} {
  const repairs: Repair[] = [];
  let changed = false;
  const next = content.map((node, index) => {
    const repaired = repairPageLinkNode(node, [index], repairs);
    if (repaired !== node) {
      changed = true;
    }

    return repaired;
  });
  if (!changed) {
    return { content, repairs };
  }

  return { content: next as EditorValue, repairs };
}
