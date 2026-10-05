import { describe, expect, test } from "bun:test";
import { createSlateEditor } from "platejs";

import { EDITOR_PLUGINS } from "./editor-plugins";
import { EMPTY_EDITOR_VALUE, type EditorValue } from "./editor-value";

const AI_OR_COLLABORATION_KEY = /(?:^ai$|aichat|copilot|yjs|collab)/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseJson(text: string): unknown {
  const parsed: unknown = JSON.parse(text);
  return parsed;
}

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

function pluginKeys(plugins: readonly object[]): string[] {
  return plugins.map((plugin) => pluginKey(plugin));
}

function resolvedPluginKeys(pluginList: unknown): string[] {
  if (!Array.isArray(pluginList)) {
    throw new Error("Editor plugin list is missing.");
  }

  return pluginList.map((plugin: unknown) => {
    if (!isRecord(plugin)) {
      throw new Error("Plugin is not an object.");
    }

    return pluginKey(plugin);
  });
}

function paragraphText(value: unknown): string {
  if (!Array.isArray(value) || value.length !== 1) {
    throw new Error("Expected one block.");
  }

  const block = value[0];
  if (!isRecord(block) || block.type !== "p" || !Array.isArray(block.children)) {
    throw new Error("Expected one paragraph.");
  }

  if (block.children.length !== 1) {
    throw new Error("Expected one text child.");
  }

  const textNode = block.children[0];
  if (!isRecord(textNode) || typeof textNode.text !== "string") {
    throw new Error("Expected a text child.");
  }

  return textNode.text;
}

describe("notion-like editor value", () => {
  test("EMPTY_EDITOR_VALUE is one empty paragraph", () => {
    expect(EMPTY_EDITOR_VALUE).toEqual([
      {
        type: "p",
        children: [{ text: "" }],
      },
    ]);
    expect(paragraphText(EMPTY_EDITOR_VALUE)).toBe("");
  });

  test("paragraph text survives a JSON round-trip after insertText", () => {
    const startingValue = [
      {
        type: "p",
        children: [{ text: "Hello" }],
      },
    ] satisfies EditorValue;

    const editor = createSlateEditor({
      plugins: EDITOR_PLUGINS,
      value: startingValue,
    });

    editor.tf.select({
      anchor: { path: [0, 0], offset: 5 },
      focus: { path: [0, 0], offset: 5 },
    });
    editor.tf.insertText(" world");

    const roundTrip = parseJson(JSON.stringify(editor.children));

    expect(roundTrip).toEqual(editor.children);
    expect(paragraphText(roundTrip)).toBe("Hello world");
  });

  test("plugin list has no AI or collaboration plugins", () => {
    const editor = createSlateEditor({
      plugins: EDITOR_PLUGINS,
      value: EMPTY_EDITOR_VALUE,
    });
    const keys = [...pluginKeys(EDITOR_PLUGINS), ...resolvedPluginKeys(editor.meta.pluginList)];

    expect(keys.filter((key) => AI_OR_COLLABORATION_KEY.test(key))).toEqual([]);
  });
});
