import { describe, expect, test } from "bun:test";
import { createSlateEditor, type SlateEditor } from "platejs";
import { act } from "react";
import { createRoot } from "react-dom/client";

import { useNotionLikeEditor } from "../hooks/use-notion-like-editor";
import {
  BLOCK_HANDLE_ANCHOR_CENTER_MAX,
  BLOCK_HANDLE_CENTER_MAX,
  BLOCK_HANDLE_GAP,
} from "../lib/features/editor-block-handle";
import { DEFAULT_AUTOSAVE_DEBOUNCE_MS } from "../lib/document/editor-autosave";
import {
  DEFAULT_EDITOR_OPTIONS,
  editorOptionsKey,
  resolveEditorOptions,
  type EditorOptions,
} from "../lib/features/editor-options";
import { editorConfigPlugin, editorOptions } from "../lib/plugins/editor-config";
import { createEditor } from "./test-utils";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

describe("editor options defaults", () => {
  test("the defaults are the existing constants", () => {
    expect(DEFAULT_EDITOR_OPTIONS).toEqual({
      handle: {
        gap: BLOCK_HANDLE_GAP,
        centerMax: BLOCK_HANDLE_CENTER_MAX,
        anchorCenterMax: BLOCK_HANDLE_ANCHOR_CENTER_MAX,
      },
      autosave: { debounceMs: DEFAULT_AUTOSAVE_DEBOUNCE_MS },
      shortcutHints: true,
      appendOnTailClick: true,
    });
    expect(DEFAULT_EDITOR_OPTIONS.handle.gap).toBe(12);
    expect(DEFAULT_EDITOR_OPTIONS.handle.centerMax).toBe(48);
    expect(DEFAULT_EDITOR_OPTIONS.handle.anchorCenterMax).toBe(64);
    expect(DEFAULT_EDITOR_OPTIONS.autosave.debounceMs).toBe(800);
  });

  test("no options resolve to the defaults, as a new object", () => {
    expect(resolveEditorOptions(undefined)).toEqual(DEFAULT_EDITOR_OPTIONS);
    expect(resolveEditorOptions({})).toEqual(DEFAULT_EDITOR_OPTIONS);
    expect(resolveEditorOptions(undefined)).not.toBe(DEFAULT_EDITOR_OPTIONS);
  });

  test("a partial override changes only the fields it names", () => {
    const resolved = resolveEditorOptions({
      handle: { gap: 20 },
      autosave: { debounceMs: 1500 },
      shortcutHints: false,
    });
    expect(resolved).toEqual({
      handle: {
        gap: 20,
        centerMax: BLOCK_HANDLE_CENTER_MAX,
        anchorCenterMax: BLOCK_HANDLE_ANCHOR_CENTER_MAX,
      },
      autosave: { debounceMs: 1500 },
      shortcutHints: false,
      appendOnTailClick: true,
    });
  });

  test("zero is a valid number", () => {
    expect(resolveEditorOptions({ handle: { gap: 0 } }).handle.gap).toBe(0);
  });

  test("negative, NaN, infinite and string numbers fall back to the default", () => {
    const invalid = [-1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, "16"];
    for (const value of invalid) {
      const options = {
        handle: { gap: value },
        autosave: { debounceMs: value },
      } as unknown as EditorOptions;
      const resolved = resolveEditorOptions(options);
      expect(resolved.handle.gap).toBe(BLOCK_HANDLE_GAP);
      expect(resolved.autosave.debounceMs).toBe(DEFAULT_AUTOSAVE_DEBOUNCE_MS);
    }
    expect(
      resolveEditorOptions({ handle: { centerMax: -5, anchorCenterMax: Number.NaN } }),
    ).toEqual(DEFAULT_EDITOR_OPTIONS);
  });

  test("non-boolean flags fall back to the default", () => {
    const resolved = resolveEditorOptions({
      shortcutHints: "no",
      appendOnTailClick: 0,
    } as unknown as EditorOptions);
    expect(resolved.shortcutHints).toBe(true);
    expect(resolved.appendOnTailClick).toBe(true);
    expect(resolveEditorOptions({ shortcutHints: false }).shortcutHints).toBe(false);
  });
});

describe("editor options key", () => {
  test("equal values give the same key, whatever the object", () => {
    const a = resolveEditorOptions({ handle: { gap: 20 }, shortcutHints: false });
    const b = resolveEditorOptions({ shortcutHints: false, handle: { gap: 20 } });
    expect(a).not.toBe(b);
    expect(editorOptionsKey(a)).toBe(editorOptionsKey(b));
    expect(editorOptionsKey(resolveEditorOptions())).toBe(editorOptionsKey(DEFAULT_EDITOR_OPTIONS));
  });

  test("different values give different keys", () => {
    const base = editorOptionsKey(DEFAULT_EDITOR_OPTIONS);
    expect(editorOptionsKey(resolveEditorOptions({ handle: { gap: 13 } }))).not.toBe(base);
    expect(editorOptionsKey(resolveEditorOptions({ handle: { centerMax: 49 } }))).not.toBe(base);
    expect(editorOptionsKey(resolveEditorOptions({ handle: { anchorCenterMax: 65 } }))).not.toBe(
      base,
    );
    expect(editorOptionsKey(resolveEditorOptions({ autosave: { debounceMs: 801 } }))).not.toBe(
      base,
    );
    expect(editorOptionsKey(resolveEditorOptions({ shortcutHints: false }))).not.toBe(base);
    expect(editorOptionsKey(resolveEditorOptions({ appendOnTailClick: false }))).not.toBe(base);
  });
});

describe("editorOptions(editor)", () => {
  test("an editor without the config plugin gets the defaults and does not throw", () => {
    const bare = createSlateEditor({ plugins: [], value: [] }) as SlateEditor;
    expect(editorOptions(bare)).toEqual(DEFAULT_EDITOR_OPTIONS);
  });

  test("an editor with the plugin and no value set gets the defaults", () => {
    expect(editorOptions(createEditor())).toEqual(DEFAULT_EDITOR_OPTIONS);
  });

  test("the value written to the plugin is read back", () => {
    const editor = createEditor();
    const next = resolveEditorOptions({ handle: { gap: 30 } });
    editor.setOption(editorConfigPlugin, "resolved", next);
    expect(editorOptions(editor)).toEqual(next);
  });
});

describe("useNotionLikeEditor options", () => {
  type Editor = ReturnType<typeof useNotionLikeEditor>["editor"];

  function Probe({ options, seen }: { options?: EditorOptions; seen: Editor[] }) {
    const { editor } = useNotionLikeEditor({ documentId: "options-doc", options });
    seen.push(editor);
    return null;
  }

  test("the editor instance survives equal and changed options, and a change is visible to readers", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const seen: Editor[] = [];
    try {
      await act(async () => {
        root.render(<Probe seen={seen} options={{ handle: { gap: 20 } }} />);
      });
      // A fresh object with the same values must not recreate the editor or write again.
      await act(async () => {
        root.render(<Probe seen={seen} options={{ handle: { gap: 20 } }} />);
      });
      const first = seen[0];
      expect(first).toBeDefined();
      expect(seen.length).toBeGreaterThan(1);
      expect(seen.every((editor) => editor === first)).toBe(true);
      expect(editorOptions(first as SlateEditor).handle.gap).toBe(20);

      await act(async () => {
        root.render(<Probe seen={seen} options={{ handle: { gap: 30 } }} />);
      });
      expect(seen.every((editor) => editor === first)).toBe(true);
      expect(editorOptions(first as SlateEditor).handle.gap).toBe(30);
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });
});
