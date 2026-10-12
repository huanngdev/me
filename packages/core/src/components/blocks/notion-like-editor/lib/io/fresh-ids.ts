import { nanoid } from "platejs";

import type { EditorValue } from "../document/editor-value";

type RecordNode = Record<string, unknown>;

function isRecord(value: unknown): value is RecordNode {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Every element id is replaced. A synced reference then points at the new id
// of the block that owned the old target id.
export function assignFreshIds(value: EditorValue): EditorValue {
  const map = new Map<string, string>();

  const nextId = (current: unknown): string => {
    const fresh = nanoid();
    if (typeof current === "string" && current.length > 0 && !map.has(current)) {
      map.set(current, fresh);
    }

    return fresh;
  };

  const walk = (node: unknown): unknown => {
    if (!isRecord(node)) {
      return node;
    }

    const copy: RecordNode = { ...node };
    if ("type" in copy) {
      copy.id = nextId(copy.id);
    }

    if (Array.isArray(copy.children)) {
      copy.children = copy.children.map((child) => walk(child));
    }

    return copy;
  };

  const copied = value.map((node) => walk(node)) as EditorValue;

  const remap = (node: unknown): void => {
    if (!isRecord(node)) {
      return;
    }

    if (typeof node.targetBlockId === "string") {
      const mapped = map.get(node.targetBlockId);
      if (mapped !== undefined) {
        node.targetBlockId = mapped;
      }
    }

    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        remap(child);
      }
    }
  };

  for (const node of copied) {
    remap(node);
  }

  return copied;
}
