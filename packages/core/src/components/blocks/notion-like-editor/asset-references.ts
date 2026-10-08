import { ElementApi, type SlateEditor } from "platejs";

import type { AssetStore } from "./editor-assets";
import type { EditorValue } from "./editor-value";

const DEFAULT_GRACE_MS = 24 * 60 * 60 * 1000;

export function collectAssetIds(content: EditorValue): Set<string> {
  const ids = new Set<string>();
  walk(content, ids);
  return ids;
}

export function applyUploadToBlock(
  editor: SlateEditor,
  blockId: string,
  props: Record<string, unknown>,
): boolean {
  const entry = editor.api.node({
    at: [],
    id: blockId,
    match: (node) => ElementApi.isElement(node),
  });
  if (!entry) {
    return false;
  }

  const [, path] = entry;
  // A finished upload is not a user edit. Saving it would make undo remove the user's last change.
  editor.tf.withoutSaving(() => {
    editor.tf.setNodes(props, { at: path });
  });
  return true;
}

export async function cleanupUnreferencedAssets(
  store: AssetStore,
  referenced: Set<string>,
  options: { now: number; graceMs?: number },
): Promise<string[]> {
  const graceMs = options.graceMs ?? DEFAULT_GRACE_MS;
  const deleted: string[] = [];

  for (const record of await store.list()) {
    if (referenced.has(record.id)) {
      continue;
    }

    const created = Date.parse(record.createdAt);
    if (Number.isNaN(created) || options.now - created <= graceMs) {
      continue;
    }

    await store.delete(record.id);
    deleted.push(record.id);
  }

  return deleted;
}

function walk(node: unknown, ids: Set<string>): void {
  if (Array.isArray(node)) {
    for (const child of node) {
      walk(child, ids);
    }
    return;
  }

  if (typeof node !== "object" || node === null) {
    return;
  }

  if ("assetId" in node && typeof node.assetId === "string") {
    ids.add(node.assetId);
  }

  if ("posterAssetId" in node && typeof node.posterAssetId === "string") {
    ids.add(node.posterAssetId);
  }

  if ("children" in node) {
    walk(node.children, ids);
  }
}
