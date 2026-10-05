import { describe, expect, test } from "bun:test";
import type { SlateEditor } from "platejs";

import { applyUploadToBlock, cleanupUnreferencedAssets, collectAssetIds } from "./asset-references";
import type { AssetRecord } from "./editor-assets";
import type { EditorValue } from "./editor-value";
import { caret, createEditor, createMemoryAssetStore, field, plainText } from "./test-utils";

function nodeProp(editor: SlateEditor, id: string, key: string): unknown {
  const entry = editor.api.node({ at: [], id });
  const node = entry?.[0];
  return field(node, key);
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
  test("nested asset ids are collected once", () => {
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

  test("applying an upload patches the matching block and is not an undo step", () => {
    const editor = createEditor([
      { type: "p", id: "block-1", children: [{ text: "Hello" }] },
      { type: "p", id: "block-2", children: [{ text: "Other" }] },
    ]);
    editor.tf.select(caret([0, 0], 5));
    editor.tf.insertText("!");
    const undos = editor.history.undos.length;

    const applied = applyUploadToBlock(editor, "block-1", { assetId: "asset-1" });

    expect(applied).toBe(true);
    expect(nodeProp(editor, "block-1", "assetId")).toBe("asset-1");
    expect(nodeProp(editor, "block-2", "assetId")).toBeUndefined();
    expect(editor.history.undos.length).toBe(undos);

    editor.tf.undo();

    expect(plainText(editor)).toBe("HelloOther");
    expect(nodeProp(editor, "block-1", "assetId")).toBe("asset-1");
  });

  test("applying an upload does nothing when the block was deleted", () => {
    const editor = createEditor([
      { type: "p", id: "keep", children: [{ text: "Stay" }] },
      { type: "p", id: "gone", children: [{ text: "Leave" }] },
    ]);
    editor.tf.removeNodes({ at: [1] });
    const before = JSON.stringify(editor.children);

    const applied = applyUploadToBlock(editor, "gone", { assetId: "asset-1" });

    expect(applied).toBe(false);
    expect(JSON.stringify(editor.children)).toBe(before);
  });

  test("applying an upload does nothing after the block insertion is undone", () => {
    const editor = createEditor([{ type: "p", id: "keep", children: [{ text: "Stay" }] }]);
    editor.tf.insertNodes({ type: "p", id: "fresh", children: [{ text: "New" }] }, { at: [1] });

    expect(nodeProp(editor, "fresh", "id")).toBe("fresh");

    editor.tf.undo();
    const before = JSON.stringify(editor.children);
    const applied = applyUploadToBlock(editor, "fresh", { assetId: "asset-1" });

    expect(applied).toBe(false);
    expect(JSON.stringify(editor.children)).toBe(before);
    expect(nodeProp(editor, "fresh", "id")).toBeUndefined();
  });

  test("cleanup deletes only unreferenced assets older than the grace period", async () => {
    const now = Date.parse("2026-10-05T00:00:00.000Z");
    const old = new Date(now - 48 * 60 * 60 * 1000).toISOString();
    const recent = new Date(now - 60 * 1000).toISOString();
    const saved = createMemoryAssetStore([
      record("kept-old", old),
      record("recent", recent),
      record("stale", old),
    ]);

    const deleted = await cleanupUnreferencedAssets(saved.store, new Set(["kept-old"]), { now });
    const remaining = (await saved.store.list()).map((item) => item.id);

    expect(deleted).toEqual(["stale"]);
    expect(remaining).toEqual(["kept-old", "recent"]);
  });

  test("an asset created exactly one grace period ago is kept", async () => {
    const now = Date.parse("2026-10-05T00:00:00.000Z");
    const boundary = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    const saved = createMemoryAssetStore([record("boundary", boundary)]);

    const deleted = await cleanupUnreferencedAssets(saved.store, new Set(), { now });
    const remaining = (await saved.store.list()).map((item) => item.id);

    expect(deleted).toEqual([]);
    expect(remaining).toEqual(["boundary"]);
  });

  test("an asset with an unreadable created date is kept", async () => {
    const now = Date.parse("2026-10-05T00:00:00.000Z");
    const saved = createMemoryAssetStore([record("bad-date", "not-a-date")]);

    const deleted = await cleanupUnreferencedAssets(saved.store, new Set(), { now });
    const remaining = (await saved.store.list()).map((item) => item.id);

    expect(deleted).toEqual([]);
    expect(remaining).toEqual(["bad-date"]);
  });
});
