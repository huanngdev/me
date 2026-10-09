import { describe, expect, test } from "bun:test";
import { NodeIdPlugin } from "platejs";

import { createEditorPlugins } from "../lib/plugins/editor-plugins";
import { EMPTY_EDITOR_VALUE } from "../lib/document/editor-value";
import { blockIds, createEditor, isRecord } from "./test-utils";

const AI_OR_COLLABORATION_KEY = /(?:^ai$|aichat|copilot|yjs|collab)/i;

function pluginKey(plugin: object): string {
  if (!("key" in plugin)) {
    throw new Error("Plugin is missing a key.");
  }

  const key: unknown = plugin.key;
  if (typeof key !== "string") {
    throw new Error("Plugin key is not a string.");
  }

  return key;
}

describe("editor value", () => {
  test("an empty document is one paragraph with no text", () => {
    expect(EMPTY_EDITOR_VALUE).toEqual([{ type: "p", children: [{ text: "" }] }]);
  });

  test("typed text survives a JSON round-trip", () => {
    const editor = createEditor([{ type: "p", children: [{ text: "Hello" }] }]);
    editor.tf.select({
      anchor: { path: [0, 0], offset: 5 },
      focus: { path: [0, 0], offset: 5 },
    });

    editor.tf.insertText(" world");

    const roundTrip: unknown = JSON.parse(JSON.stringify(editor.children));

    expect(roundTrip).toEqual(editor.children);
  });

  test("the plugin list has no AI or collaboration plugin", () => {
    const editor = createEditor();
    const configured = createEditorPlugins().map((plugin) => pluginKey(plugin));
    const resolved = editor.meta.pluginList.map((plugin: unknown) => {
      if (!isRecord(plugin)) {
        throw new Error("Plugin is not an object.");
      }

      return pluginKey(plugin);
    });
    const matches = [...configured, ...resolved].filter((key) => AI_OR_COLLABORATION_KEY.test(key));

    expect(matches).toEqual([]);
  });

  test("two editors created from fresh plugin lists both assign an id on insert", () => {
    const first = createEditor([{ type: "p", children: [{ text: "A" }] }]);
    const second = createEditor([{ type: "p", children: [{ text: "A" }] }]);

    first.tf.insertNodes({ type: "p", children: [{ text: "Inserted" }] }, { at: [1] });
    second.tf.insertNodes({ type: "p", children: [{ text: "Inserted" }] }, { at: [1] });

    expect(blockIds(first).at(1)?.length).toBeGreaterThan(0);
    expect(blockIds(second).at(1)?.length).toBeGreaterThan(0);
    expect(createEditorPlugins()).toContain(NodeIdPlugin);
  });
});
