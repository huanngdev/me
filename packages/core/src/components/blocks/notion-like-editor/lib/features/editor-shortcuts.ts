// One registry of the editor's keyboard shortcuts. Plate plugins read their keys from here,
// and the UI shows the same keys. Hand-written handlers keep their own matching, and their
// tests feed these keys into them, so a display cannot drift from the binding.
//
// Tokens are Plate's: "Mod" is Cmd on macOS and Ctrl elsewhere, and the rest are key names.

export type ShortcutPlatform = "mac" | "other";

export const EDITOR_SHORTCUTS = {
  bold: ["Mod", "b"],
  italic: ["Mod", "i"],
  underline: ["Mod", "u"],
  strikethrough: ["Mod", "Shift", "x"],
  code: ["Mod", "e"],
  superscript: ["Mod", "period"],
  subscript: ["Mod", "comma"],
  link: ["Mod", "k"],
  inlineEquation: ["Mod", "Shift", "e"],
  inlineDate: ["Mod", "semicolon"],
  paragraph: ["Mod", "Alt", "0"],
  h1: ["Mod", "Alt", "1"],
  h2: ["Mod", "Alt", "2"],
  h3: ["Mod", "Alt", "3"],
  bulleted: ["Mod", "Shift", "8"],
  numbered: ["Mod", "Shift", "7"],
  todo: ["Mod", "Shift", "9"],
  todoCheck: ["Mod", "Enter"],
  indent: ["Mod", "BracketRight"],
  outdent: ["Mod", "BracketLeft"],
  clearFormatting: ["Mod", "Backslash"],
  blockMenu: ["Mod", "Slash"],
  selectAll: ["Mod", "a"],
  duplicateBlocks: ["Mod", "d"],
  deleteBlocks: ["Backspace"],
  moveBlocksUp: ["Mod", "Alt", "Shift", "ArrowUp"],
  moveBlocksDown: ["Mod", "Alt", "Shift", "ArrowDown"],
  find: ["Mod", "f"],
  findNext: ["Enter"],
  findPrevious: ["Shift", "Enter"],
  escape: ["Escape"],
  undo: ["Mod", "z"],
  redo: ["Mod", "Shift", "z"],
} as const;

export type EditorShortcutId = keyof typeof EDITOR_SHORTCUTS;

// Block picker and slash menu item ids that have a shortcut. The shortcut runs the item's command.
const ITEM_SHORTCUTS: Partial<Record<string, EditorShortcutId>> = {
  paragraph: "paragraph",
  h1: "h1",
  h2: "h2",
  h3: "h3",
  bulleted: "bulleted",
  numbered: "numbered",
  todo: "todo",
  link: "link",
};

export function itemShortcutId(itemId: string): EditorShortcutId | undefined {
  return ITEM_SHORTCUTS[itemId];
}

// The platform rule. Touch-only detection lives in the UI hook, not here.
export function shortcutPlatformOf(
  nav: { platform?: string; userAgent?: string } | undefined,
): ShortcutPlatform {
  if (nav === undefined) {
    return "other";
  }

  return /Mac|iPhone|iPad|iPod/.test(`${nav.platform ?? ""}${nav.userAgent ?? ""}`)
    ? "mac"
    : "other";
}

function shortcutKeyLabel(key: string, platform: ShortcutPlatform): string {
  const mac = platform === "mac";
  if (key === "Mod") {
    return mac ? "⌘" : "Ctrl";
  }
  if (key === "Shift") {
    return mac ? "⇧" : "Shift";
  }
  if (key === "Alt") {
    return mac ? "⌥" : "Alt";
  }
  if (key === "Enter") {
    return mac ? "↵" : "Enter";
  }
  if (key === "Backspace") {
    return mac ? "⌫" : "Backspace";
  }
  if (key === "Escape") {
    return "Esc";
  }
  if (key === "ArrowUp") {
    return "↑";
  }
  if (key === "ArrowDown") {
    return "↓";
  }
  if (key === "Slash") {
    return "/";
  }
  if (key === "period") {
    return ".";
  }
  if (key === "comma") {
    return ",";
  }
  if (key === "semicolon") {
    return ";";
  }
  if (key === "Backslash") {
    return "\\";
  }
  if (key === "BracketLeft") {
    return "[";
  }
  if (key === "BracketRight") {
    return "]";
  }
  if (key.length === 1) {
    return key.toUpperCase();
  }

  return key;
}

export function formatShortcutKeys(keys: readonly string[], platform: ShortcutPlatform): string[] {
  return keys.map((key) => shortcutKeyLabel(key, platform));
}

// Mac joins the glyphs with nothing, as menus do (⌘⌥1). Elsewhere the names are joined with +.
export function formatShortcut(keys: readonly string[], platform: ShortcutPlatform): string {
  const labels = formatShortcutKeys(keys, platform);
  return platform === "mac" ? labels.join("") : labels.join("+");
}

export function shortcutText(id: EditorShortcutId, platform: ShortcutPlatform): string {
  return formatShortcut(EDITOR_SHORTCUTS[id], platform);
}

// The aria-keyshortcuts value: Meta or Control for Mod, and the other tokens joined with +.
export function ariaKeyShortcuts(id: EditorShortcutId, platform: ShortcutPlatform): string {
  return EDITOR_SHORTCUTS[id]
    .map((key) => {
      if (key === "Mod") {
        return platform === "mac" ? "Meta" : "Control";
      }
      return key.length === 1 ? key.toUpperCase() : key;
    })
    .join("+");
}
