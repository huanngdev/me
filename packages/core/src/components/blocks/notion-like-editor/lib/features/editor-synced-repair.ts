import { ElementApi, KEYS, type Descendant, type TElement } from "platejs";

import { formatBlockLabel } from "../document/editor-document";
import type { Repair } from "../document/editor-document-ids";
import { SYNCED_REF_KEY, isStoredSyncedTargetId } from "../document/editor-document-schema";
import type { EditorValue } from "../document/editor-value";

export type SyncedTargetStatus = "live" | "missing" | "invalid";

function isElement(node: Descendant): node is TElement {
  return ElementApi.isElement(node);
}

function containsSyncedRef(node: TElement): boolean {
  for (const child of node.children) {
    if (!isElement(child)) {
      continue;
    }
    if (child.type === SYNCED_REF_KEY || containsSyncedRef(child)) {
      return true;
    }
  }

  return false;
}

function indexElements(value: readonly Descendant[]): Map<string, TElement> {
  const index = new Map<string, TElement>();
  const visit = (node: Descendant): void => {
    if (!isElement(node)) {
      return;
    }
    if (typeof node.id === "string" && node.id.length > 0 && !index.has(node.id)) {
      index.set(node.id, node);
    }
    node.children.forEach(visit);
  };
  value.forEach(visit);
  return index;
}

export function syncedTargetStatus(
  target: TElement | undefined,
  targetId: string,
): SyncedTargetStatus {
  if (!isStoredSyncedTargetId(targetId)) {
    return "invalid";
  }
  if (!target) {
    return "missing";
  }
  if (
    target.type === SYNCED_REF_KEY ||
    target.type === KEYS.toc ||
    target.type === KEYS.columnGroup ||
    containsSyncedRef(target)
  ) {
    return "invalid";
  }
  return "live";
}

export function syncedRefRepairs(value: EditorValue): Repair[] {
  const index = indexElements(value);
  const repairs: Repair[] = [];
  const visit = (node: Descendant, path: number[]): void => {
    if (!isElement(node)) {
      return;
    }
    if (node.type === SYNCED_REF_KEY) {
      const targetId = typeof node.targetBlockId === "string" ? node.targetBlockId : "";
      if (isStoredSyncedTargetId(targetId)) {
        const status = syncedTargetStatus(index.get(targetId), targetId);
        if (status === "invalid") {
          repairs.push({
            path,
            message: `${formatBlockLabel(path)} points at a block that cannot be synced. The reference is kept.`,
          });
        }
      }
    }
    node.children.forEach((child, childIndex) => {
      visit(child, [...path, childIndex]);
    });
  };
  value.forEach((node, nodeIndex) => {
    visit(node, [nodeIndex]);
  });
  return repairs;
}
