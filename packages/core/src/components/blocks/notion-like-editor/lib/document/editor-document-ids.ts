import { formatBlockLabel } from "./editor-document";
import type { EditorValue } from "./editor-value";

type EditorBlock = EditorValue[number];
type EditorChild = EditorBlock["children"][number];

export type Repair = {
  path: number[];
  message: string;
};

function isBlock(node: EditorChild): node is EditorBlock {
  return "children" in node && Array.isArray(node.children);
}

function elementId(node: EditorBlock): string | undefined {
  if (typeof node.id !== "string" || node.id.length === 0) {
    return undefined;
  }

  return node.id;
}

function collectReservedIds(node: EditorBlock, reserved: Set<string>): void {
  const id = elementId(node);
  if (id !== undefined) {
    reserved.add(id);
  }

  for (const child of node.children) {
    if (isBlock(child)) {
      collectReservedIds(child, reserved);
    }
  }
}

function allocateId(createId: () => string, seen: Set<string>, reserved: Set<string>): string {
  const base = createId();
  let unique = base;
  let suffix = 1;

  // Ids already in the document are reserved before this walk, so a generated
  // id cannot take one that a later block still owns.
  while (unique.length === 0 || seen.has(unique) || reserved.has(unique)) {
    unique = `${base}-${suffix}`;
    suffix += 1;
  }

  seen.add(unique);
  return unique;
}

function resolveId(
  currentId: string | undefined,
  path: number[],
  seen: Set<string>,
  reserved: Set<string>,
  createId: () => string,
): { id: string; repair: Repair | undefined } {
  if (currentId !== undefined && !seen.has(currentId)) {
    seen.add(currentId);
    return { id: currentId, repair: undefined };
  }

  return {
    id: allocateId(createId, seen, reserved),
    repair: {
      path,
      message:
        currentId === undefined
          ? `${formatBlockLabel(path)} has no id. A new id was assigned.`
          : `${formatBlockLabel(path)} reused an id. A new id was assigned so each block stays unique.`,
    },
  };
}

function normalizeElement(
  node: EditorBlock,
  path: number[],
  seen: Set<string>,
  reserved: Set<string>,
  createId: () => string,
  repairs: Repair[],
): EditorBlock {
  const resolved = resolveId(elementId(node), path, seen, reserved, createId);
  if (resolved.repair) {
    repairs.push(resolved.repair);
  }

  let childrenChanged = false;
  const children = node.children.map((child, index) => {
    if (!isBlock(child)) {
      return child;
    }

    const next = normalizeElement(child, [...path, index], seen, reserved, createId, repairs);
    if (next !== child) {
      childrenChanged = true;
    }

    return next;
  });

  if (!resolved.repair && !childrenChanged) {
    return node;
  }

  return {
    ...node,
    id: resolved.id,
    children,
  };
}

export function normalizeBlockIds(
  content: EditorValue,
  createId: () => string,
): { content: EditorValue; repairs: Repair[] } {
  const seen = new Set<string>();
  const reserved = new Set<string>();
  const repairs: Repair[] = [];
  for (const node of content) {
    collectReservedIds(node, reserved);
  }

  let changed = false;
  const next = content.map((node, index) => {
    const normalized = normalizeElement(node, [index], seen, reserved, createId, repairs);
    if (normalized !== node) {
      changed = true;
    }

    return normalized;
  });

  return {
    content: changed ? next : content,
    repairs,
  };
}
