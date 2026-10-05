import { describe, expect, test } from "bun:test";
import { createSlateEditor, type SlateEditor } from "platejs";

import { applyUploadToBlock, cleanupUnreferencedAssets, collectAssetIds } from "./asset-references";
import type { AssetRecord, AssetStore } from "./editor-assets";
import { EDITOR_PLUGINS } from "./editor-plugins";
import type { EditorValue } from "./editor-value";

function createEditor(value: EditorValue): SlateEditor {
  return createSlateEditor({
    // Plate splices a passed NodeId plugin out of this array. Copy it so other tests keep EDITOR_PLUGINS.
    plugins: [...EDITOR_PLUGINS],
    value,
  });
}

function nodeProp(editor: SlateEditor, id: string, key: string): unknown {
  const entry = editor.api.node({ at: [], id });
  const node = entry?.[0];
  if (typeof node !== "object" || node === null || !(key in node)) {
    return undefined;
  }

  return node[key];
}

function documentText(editor: SlateEditor): string {
  const parts: string[] = [];
  for (const block of editor.children) {
    for (const child of block.children) {
      if ("text" in child && typeof child.text === "string") {
        parts.push(child.text);
      }
    }
  }
  return parts.join("");
}

function memoryStore(records: AssetRecord[]): AssetStore {
  const saved = new Map(records.map((record) => [record.id, record]));
  return {
    async put() {
      throw new Error("unused");
    },
    async get() {
      return null;
    },
    async delete(id) {
      saved.delete(id);
    },
    async list() {
      return [...saved.values()];
    },
  };
}

function record(id: string, createdAt: string): AssetRecord {
  return {
    id,
    kind: "image",
    name: `${id}.png`,
    mimeType: "image/png",
    byteSize: 8,
    createdAt,
  };
}

describe("asset references", () => {
  test("collects nested asset ids once", () => {
    const content = [
      {
        type: "p",
        id: "intro",
        children: [{ text: "Hello" }],
      },
      {
        type: "p",
        id: "figure",
        assetId: "asset-a",
        children: [
          { text: "" },
          {
            type: "p",
            id: "nested",
            assetId: "asset-b",
            children: [{ text: "caption", assetId: "asset-a" }],
          },
        ],
      },
    ] satisfies EditorValue;

    expect(collectAssetIds(content)).toEqual(new Set(["asset-a", "asset-b"]));
  });

  test("duplicated and reordered blocks keep their own asset ids", () => {
    const first = {
      type: "p",
      id: "block-1",
      assetId: "asset-a",
      children: [{ text: "one" }],
    };
    const second = {
      type: "p",
      id: "block-2",
      assetId: "asset-b",
      children: [{ text: "two" }],
    };
    const copy = {
      type: "p",
      id: "block-3",
      assetId: "asset-a",
      children: [{ text: "one" }],
    };
    const content = [second, copy, first] satisfies EditorValue;

    expect(content[0]?.assetId).toBe("asset-b");
    expect(content[1]?.assetId).toBe("asset-a");
    expect(content[2]?.assetId).toBe("asset-a");
    expect(collectAssetIds(content)).toEqual(new Set(["asset-a", "asset-b"]));
  });

  test("patches the matching block without adding an undo step", () => {
    const editor = createEditor([
      { type: "p", id: "block-1", children: [{ text: "Hello" }] },
      { type: "p", id: "block-2", children: [{ text: "Other" }] },
    ]);
    editor.tf.select({
      anchor: { path: [0, 0], offset: 5 },
      focus: { path: [0, 0], offset: 5 },
    });
    editor.tf.insertText("!");
    const undos = editor.history.undos.length;

    expect(applyUploadToBlock(editor, "block-1", { assetId: "asset-1" })).toBe(true);
    expect(nodeProp(editor, "block-1", "assetId")).toBe("asset-1");
    expect(nodeProp(editor, "block-2", "assetId")).toBeUndefined();
    expect(editor.history.undos.length).toBe(undos);

    editor.tf.undo();
    expect(documentText(editor)).toBe("HelloOther");
    expect(nodeProp(editor, "block-1", "assetId")).toBe("asset-1");
  });

  test("does nothing when the block was deleted", () => {
    const editor = createEditor([
      { type: "p", id: "keep", children: [{ text: "Stay" }] },
      { type: "p", id: "gone", children: [{ text: "Leave" }] },
    ]);
    editor.tf.removeNodes({ at: [1] });
    const before = JSON.stringify(editor.children);

    expect(applyUploadToBlock(editor, "gone", { assetId: "asset-1" })).toBe(false);
    expect(JSON.stringify(editor.children)).toBe(before);
  });

  test("does nothing after the block insertion is undone", () => {
    const editor = createEditor([{ type: "p", id: "keep", children: [{ text: "Stay" }] }]);
    editor.tf.insertNodes({ type: "p", id: "fresh", children: [{ text: "New" }] }, { at: [1] });
    expect(nodeProp(editor, "fresh", "id")).toBe("fresh");
    editor.tf.undo();
    const before = JSON.stringify(editor.children);

    expect(applyUploadToBlock(editor, "fresh", { assetId: "asset-1" })).toBe(false);
    expect(JSON.stringify(editor.children)).toBe(before);
    expect(nodeProp(editor, "fresh", "id")).toBeUndefined();
  });

  test("deletes only unreferenced assets older than the grace period", async () => {
    const now = Date.parse("2026-10-05T00:00:00.000Z");
    const old = new Date(now - 48 * 60 * 60 * 1000).toISOString();
    const recent = new Date(now - 60 * 1000).toISOString();
    const store = memoryStore([
      record("kept-old", old),
      record("recent", recent),
      record("stale", old),
    ]);

    const deleted = await cleanupUnreferencedAssets(store, new Set(["kept-old"]), { now });
    const remaining = (await store.list()).map((item) => item.id);

    expect(deleted).toEqual(["stale"]);
    expect(remaining).toEqual(["kept-old", "recent"]);
  });
});
