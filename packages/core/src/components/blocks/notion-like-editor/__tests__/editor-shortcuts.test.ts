import { describe, expect, test } from "bun:test";
import { Hotkeys, IS_APPLE, KEYS, type SlateEditor, type TElement } from "platejs";

import type { EditorValue } from "../lib/document/editor-value";
import { isBlockMenuShortcut } from "../lib/features/editor-block-menu";
import {
  EDITOR_SHORTCUTS,
  ariaKeyShortcuts,
  formatShortcut,
  formatShortcutKeys,
  itemShortcutId,
  shortcutPlatformOf,
  shortcutText,
  type EditorShortcutId,
} from "../lib/features/editor-shortcuts";
import {
  blockSelectionIds,
  onBlockSelectionKeyDown,
  setBlockSelection,
} from "../lib/plugins/editor-block-selection";
import { isFindOpenKey, isMacPlatform } from "../lib/plugins/editor-find-ui";
import { onInlineDateKeyDown } from "../lib/plugins/editor-inline-date-ui";
import { onInlineEquationKeyDown } from "../lib/plugins/editor-inline-equation-ui";
import { onLinkKeyDown } from "../lib/plugins/editor-link";
import { caret, createEditor } from "./test-utils";
import { syntheticRegistryKey } from "./shortcut-keys";

function paragraph(id: string, text: string): TElement {
  return { type: KEYS.p, id, children: [{ text }] };
}

function ids(editor: SlateEditor): string[] {
  return editor.children.flatMap((node) =>
    "id" in node && typeof node.id === "string" ? [node.id] : [],
  );
}

describe("shortcut labels", () => {
  test("every token has a glyph on macOS and a name elsewhere", () => {
    const tokens = [
      "Mod",
      "Shift",
      "Alt",
      "Enter",
      "Backspace",
      "Escape",
      "ArrowUp",
      "ArrowDown",
      "Slash",
      "period",
      "comma",
      "semicolon",
      "Backslash",
      "BracketLeft",
      "BracketRight",
      "b",
      "1",
    ];

    expect(formatShortcutKeys(tokens, "mac")).toEqual([
      "⌘",
      "⇧",
      "⌥",
      "↵",
      "⌫",
      "Esc",
      "↑",
      "↓",
      "/",
      ".",
      ",",
      ";",
      "\\",
      "[",
      "]",
      "B",
      "1",
    ]);
    expect(formatShortcutKeys(tokens, "other")).toEqual([
      "Ctrl",
      "Shift",
      "Alt",
      "Enter",
      "Backspace",
      "Esc",
      "↑",
      "↓",
      "/",
      ".",
      ",",
      ";",
      "\\",
      "[",
      "]",
      "B",
      "1",
    ]);
  });

  test("macOS joins the glyphs with nothing and other platforms join with +", () => {
    expect(formatShortcut(["Mod", "Shift", "x"], "mac")).toBe("⌘⇧X");
    expect(formatShortcut(["Mod", "Shift", "x"], "other")).toBe("Ctrl+Shift+X");
    expect(formatShortcut(["Mod", "Alt", "Shift", "ArrowUp"], "mac")).toBe("⌘⌥⇧↑");
    expect(formatShortcut(["Shift", "Enter"], "mac")).toBe("⇧↵");
    expect(formatShortcut(["Shift", "Enter"], "other")).toBe("Shift+Enter");
  });

  test("shortcutText formats a registry entry for a platform", () => {
    expect(shortcutText("blockMenu", "mac")).toBe("⌘/");
    expect(shortcutText("blockMenu", "other")).toBe("Ctrl+/");
    expect(shortcutText("moveBlocksDown", "other")).toBe("Ctrl+Alt+Shift+↓");
  });

  test("aria-keyshortcuts uses Meta on macOS and Control elsewhere", () => {
    expect(ariaKeyShortcuts("bold", "mac")).toBe("Meta+B");
    expect(ariaKeyShortcuts("bold", "other")).toBe("Control+B");
    expect(ariaKeyShortcuts("h2", "other")).toBe("Control+Alt+2");
    expect(ariaKeyShortcuts("findPrevious", "mac")).toBe("Shift+Enter");
  });

  test("picker and slash item ids map to their commands", () => {
    expect(itemShortcutId("paragraph")).toBe("paragraph");
    expect(itemShortcutId("h1")).toBe("h1");
    expect(itemShortcutId("todo")).toBe("todo");
    expect(itemShortcutId("link")).toBe("link");
    expect(itemShortcutId("toggle")).toBeUndefined();
    expect(itemShortcutId("image")).toBeUndefined();
  });
});

describe("shortcut platform", () => {
  test("Apple devices are mac, and the other platforms are not", () => {
    expect(shortcutPlatformOf({ platform: "MacIntel", userAgent: "" })).toBe("mac");
    expect(shortcutPlatformOf({ platform: "iPhone", userAgent: "" })).toBe("mac");
    expect(shortcutPlatformOf({ platform: "iPad", userAgent: "" })).toBe("mac");
    expect(shortcutPlatformOf({ platform: "", userAgent: "Mozilla/5.0 (iPod touch)" })).toBe("mac");
    expect(
      shortcutPlatformOf({
        platform: "Win32",
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120",
      }),
    ).toBe("other");
    expect(shortcutPlatformOf({ platform: "Linux x86_64", userAgent: "X11; Linux" })).toBe("other");
    expect(shortcutPlatformOf(undefined)).toBe("other");
  });

  test("isMacPlatform reads the same rule as the registry", () => {
    const nav = typeof navigator === "undefined" ? undefined : navigator;
    expect(isMacPlatform()).toBe(shortcutPlatformOf(nav) === "mac");
  });
});

describe("registry entries", () => {
  // Plate binds these keys on the plugin. The test reads what the plugin resolved.
  const PLATE_SHORTCUTS: Partial<Record<EditorShortcutId, string>> = {
    bold: "bold.toggle",
    italic: "italic.toggle",
    underline: "underline.toggle",
    strikethrough: "strikethrough.toggle",
    code: "code.toggle",
    superscript: "superscript.toggle",
    subscript: "subscript.toggle",
    paragraph: "p.toggleParagraph",
    h1: "h1.toggle",
    h2: "h2.toggle",
    h3: "h3.toggle",
    bulleted: "list.toggleBulleted",
    numbered: "list.toggleNumbered",
    todo: "list.toggleTodo",
    todoCheck: "list.toggleChecked",
    indent: "blockIndent.indent",
    outdent: "blockOutdent.outdent",
    clearFormatting: "clearFormatting.clear",
  };

  test("each Plate-bound entry is the keys the plugin resolves", () => {
    const editor = createEditor([paragraph("p1", "Text")] as EditorValue);
    const shortcuts = editor.meta.shortcuts as Record<string, { keys?: string[][] } | undefined>;
    for (const [id, pluginShortcut] of Object.entries(PLATE_SHORTCUTS)) {
      const keys = shortcuts[pluginShortcut ?? ""]?.keys;
      const tokens = [...EDITOR_SHORTCUTS[id as EditorShortcutId]];
      if (id === "paragraph") {
        // Plate also binds Mod+Shift+0 to the same command. The registry shows the Alt form.
        expect(keys).toContainEqual(tokens);
      } else {
        expect(keys).toEqual([tokens]);
      }
    }
  });

  // Hand-written handlers. Each one receives the registry keys as a synthetic event, and the
  // probe returns true only when the real handler takes the key and changes something.
  const HANDLED: Partial<Record<EditorShortcutId, (editor: SlateEditor, mac: boolean) => boolean>> =
    {
      link: (editor, mac) => onLinkKeyDown(editor, syntheticRegistryKey("link", mac)) === true,
      inlineEquation: (editor, mac) => {
        const event = syntheticRegistryKey("inlineEquation", mac);
        onInlineEquationKeyDown(editor, event);
        return event.defaultPrevented;
      },
      inlineDate: (editor, mac) => {
        const event = syntheticRegistryKey("inlineDate", mac);
        onInlineDateKeyDown(editor, event);
        return event.defaultPrevented;
      },
      blockMenu: (_editor, mac) => isBlockMenuShortcut(syntheticRegistryKey("blockMenu", mac)),
      find: (_editor, mac) => isFindOpenKey(syntheticRegistryKey("find", mac), mac),
      selectAll: (editor, mac) => {
        const event = syntheticRegistryKey("selectAll", mac);
        return onBlockSelectionKeyDown(editor, event) && event.defaultPrevented;
      },
      duplicateBlocks: (editor, mac) => {
        setBlockSelection(editor, ["a"]);
        const handled = onBlockSelectionKeyDown(
          editor,
          syntheticRegistryKey("duplicateBlocks", mac),
        );
        return handled && editor.children.length === 3;
      },
      deleteBlocks: (editor, mac) => {
        setBlockSelection(editor, ["a"]);
        const handled = onBlockSelectionKeyDown(editor, syntheticRegistryKey("deleteBlocks", mac));
        return handled && editor.children.length === 1;
      },
      moveBlocksUp: (editor, mac) => {
        setBlockSelection(editor, ["b"]);
        const handled = onBlockSelectionKeyDown(editor, syntheticRegistryKey("moveBlocksUp", mac));
        return handled && ids(editor).join(",") === "b,a";
      },
      moveBlocksDown: (editor, mac) => {
        setBlockSelection(editor, ["a"]);
        const handled = onBlockSelectionKeyDown(
          editor,
          syntheticRegistryKey("moveBlocksDown", mac),
        );
        return handled && ids(editor).join(",") === "b,a";
      },
      escape: (editor, mac) => {
        setBlockSelection(editor, ["a"]);
        const handled = onBlockSelectionKeyDown(editor, syntheticRegistryKey("escape", mac));
        return handled && blockSelectionIds(editor).length === 0;
      },
    };

  // Covered in editor-shortcut-ui.test.tsx, where the real find bar takes these keys.
  const FIND_BAR_COVERED: EditorShortcutId[] = ["findNext", "findPrevious"];

  // Plate's own undo and redo matcher, the one the editable calls.
  const HOTKEYS: Partial<Record<EditorShortcutId, () => boolean>> = {
    undo: () => Hotkeys.isUndo(syntheticRegistryKey("undo", IS_APPLE)),
    redo: () => Hotkeys.isRedo(syntheticRegistryKey("redo", IS_APPLE)),
  };

  function editorWithBlocks(): SlateEditor {
    return createEditor([paragraph("a", "Alpha"), paragraph("b", "Beta")] as EditorValue);
  }

  test("every hand-written entry is taken by its real handler on both platforms", () => {
    for (const [id, probe] of Object.entries(HANDLED)) {
      for (const mac of [true, false]) {
        const editor = editorWithBlocks();
        editor.tf.select(caret([0, 0], 0));
        expect({ id, mac, accepted: probe(editor, mac) }).toEqual({ id, mac, accepted: true });
      }
    }
  });

  test("undo and redo are taken by Plate's hotkey matcher", () => {
    expect(HOTKEYS.undo?.()).toBe(true);
    expect(HOTKEYS.redo?.()).toBe(true);
  });

  test("every registry entry has a test that reads or drives it", () => {
    const covered = new Set<string>([
      ...Object.keys(PLATE_SHORTCUTS),
      ...Object.keys(HANDLED),
      ...Object.keys(HOTKEYS),
      ...FIND_BAR_COVERED,
    ]);
    const untested = Object.keys(EDITOR_SHORTCUTS).filter((id) => !covered.has(id));
    expect(untested).toEqual([]);
  });
});
