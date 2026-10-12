import { EDITOR_ELEMENT_RULES, EDITOR_MARK_RULES } from "../lib/document/editor-document-schema";
import type { EditorValue } from "../lib/document/editor-value";

type Node = Record<string, unknown> & { children?: Node[]; id?: string; type?: string };

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sortValue(item));
  }

  if (typeof value !== "object" || value === null) {
    return value;
  }

  const record = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) {
    sorted[key] = sortValue(record[key]);
  }

  return sorted;
}

// Ids are renamed in document order, then synced targets follow that rename.
export function comparableDocument(value: EditorValue): unknown {
  const map = new Map<string, string>();
  let next = 0;
  const walk = (node: unknown): unknown => {
    if (typeof node !== "object" || node === null) {
      return node;
    }

    if (Array.isArray(node)) {
      return node.map((item) => walk(item));
    }

    const copy = { ...(node as Node) };
    if (typeof copy.id === "string") {
      const id = `id-${String(next)}`;
      next += 1;
      map.set(copy.id, id);
      copy.id = id;
    }

    if (Array.isArray(copy.children)) {
      copy.children = copy.children.map((child) => walk(child)) as Node[];
    }

    return copy;
  };

  const cloned = walk(value) as Node[];
  const remap = (node: unknown): void => {
    if (typeof node !== "object" || node === null) {
      return;
    }

    if (Array.isArray(node)) {
      for (const child of node) {
        remap(child);
      }
      return;
    }

    const record = node as Node;
    if (typeof record.targetBlockId === "string") {
      const mapped = map.get(record.targetBlockId);
      if (mapped !== undefined) {
        record.targetBlockId = mapped;
      }
    }

    if (Array.isArray(record.children)) {
      for (const child of record.children) {
        remap(child);
      }
    }
  };
  remap(cloned);
  return sortValue(cloned);
}

export function plainBlocks(value: EditorValue): string[] {
  const lines: string[] = [];
  const textOf = (node: Node): string => {
    if (typeof node.text === "string") {
      return node.text;
    }

    if (node.type === "mention" && typeof node.label === "string") {
      return `@${node.label}`;
    }

    return (node.children ?? []).map((child) => textOf(child)).join("");
  };

  for (const block of value as unknown as Node[]) {
    if (block.type === "toc") {
      continue;
    }

    lines.push(textOf(block));
  }

  return lines;
}

export function missingSchemaCoverage(value: EditorValue): string[] {
  const seenTypes = new Set<string>();
  const seenAttrs = new Map<string, Set<string>>();
  const seenMarks = new Set<string>();
  const visit = (node: unknown): void => {
    if (typeof node !== "object" || node === null) {
      return;
    }

    if (Array.isArray(node)) {
      for (const child of node) {
        visit(child);
      }
      return;
    }

    const record = node as Node;
    if (typeof record.type === "string") {
      seenTypes.add(record.type);
      const attrs = seenAttrs.get(record.type) ?? new Set<string>();
      for (const key of Object.keys(record)) {
        if (key !== "type" && key !== "children" && key !== "id") {
          attrs.add(key);
        }
      }
      seenAttrs.set(record.type, attrs);
    }

    if (typeof record.text === "string") {
      for (const rule of EDITOR_MARK_RULES) {
        if (rule.type in record) {
          seenMarks.add(rule.type);
        }
      }
    }

    if (Array.isArray(record.children)) {
      for (const child of record.children) {
        visit(child);
      }
    }
  };
  visit(value);

  const missing: string[] = [];
  for (const rule of EDITOR_ELEMENT_RULES) {
    if (!seenTypes.has(rule.type)) {
      missing.push(`type ${rule.type}`);
    }

    for (const attr of rule.attrs) {
      if (attr === "id") {
        continue;
      }

      if (!seenAttrs.get(rule.type)?.has(attr)) {
        missing.push(`${rule.type}.${attr}`);
      }
    }
  }

  for (const rule of EDITOR_MARK_RULES) {
    if (!seenMarks.has(rule.type)) {
      missing.push(`mark ${rule.type}`);
    }
  }

  return missing;
}

export function freezeDeep(value: unknown): void {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return;
  }

  Object.freeze(value);
  for (const child of Object.values(value)) {
    freezeDeep(child);
  }
}
