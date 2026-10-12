import { ElementApi, KEYS, NodeApi, type Descendant, type TElement } from "platejs";

export const TOC_DEPTHS = [1, 2, 3] as const;
export type TocDepth = (typeof TOC_DEPTHS)[number];
export const TOC_DEFAULT_DEPTH: TocDepth = 3;
export const TOC_EMPTY_PLACEHOLDER = "Add headings to build a table of contents.";
export const TOC_UNTITLED = "Untitled";

export type TocEntry = {
  id: string;
  depth: TocDepth;
  title: string;
  path: number[];
};

export function isTocDepth(value: unknown): value is TocDepth {
  return value === 1 || value === 2 || value === 3;
}

export function storedTocDepth(node: TElement): TocDepth {
  return isTocDepth(node.maxDepth) ? node.maxDepth : TOC_DEFAULT_DEPTH;
}

export function headingPlainText(node: TElement): string {
  return NodeApi.string(node).replace(/\s+/g, " ").trim();
}

function headingDepth(type: string): TocDepth | undefined {
  if (type === KEYS.h1) return 1;
  if (type === KEYS.h2) return 2;
  if (type === KEYS.h3) return 3;
  return undefined;
}

export function tocEntriesFromValue(value: readonly Descendant[], maxDepth: TocDepth): TocEntry[] {
  const entries: TocEntry[] = [];
  const visit = (node: Descendant, path: number[]): void => {
    if (!ElementApi.isElement(node) || typeof node.type !== "string") {
      return;
    }
    const depth = headingDepth(node.type);
    if (
      depth !== undefined &&
      depth <= maxDepth &&
      typeof node.id === "string" &&
      node.id.length > 0
    ) {
      entries.push({
        id: node.id,
        depth,
        title: headingPlainText(node),
        path: [...path],
      });
    }
    node.children.forEach((child, index) => {
      visit(child, path.concat(index));
    });
  };
  value.forEach((node, index) => {
    visit(node, [index]);
  });
  return entries;
}

export function shallowestDepth(entries: readonly { depth: TocDepth }[]): TocDepth {
  let shallowest: TocDepth = TOC_DEFAULT_DEPTH;
  for (const entry of entries) {
    if (entry.depth < shallowest) {
      shallowest = entry.depth;
    }
  }
  return shallowest;
}
