import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { DEMO_DOCUMENT_VALUE } from "../demo/demo-document";
import { demoMentionProvider } from "../demo/demo-mention";
import { demoPageProvider } from "../demo/demo-pages";
import {
  FEATURE_INVENTORY,
  SLASH_ITEM_LABELS,
  renderFeatureList,
  renderShortcutList,
  type FeatureEntry,
} from "../lib/document/feature-inventory";
import {
  EDITOR_ELEMENT_RULES,
  EDITOR_MARK_RULES,
  LIST_NUMBER_RANGE,
  PALETTE_TOKENS,
  FONT_SIZES,
  FONT_FAMILIES,
  CODE_LANGS,
  CALLOUT_ICONS,
  LINE_HEIGHTS,
  TEXT_ALIGNS,
  TABLE_MAX_ROWS,
  TABLE_MAX_COLUMNS,
  EQUATION_EXPRESSION_MAX,
  isAllowedMark,
} from "../lib/document/editor-document-schema";
import { BLOCK_INDENT_MAX } from "../lib/features/editor-block-indent-style";
import { COLUMN_MAX_COUNT } from "../lib/document/editor-column-repair";
import { FIND_MATCH_MAX, FIND_QUERY_MAX } from "../lib/features/editor-find";
import { FIND_REPLACEMENT_MAX } from "../lib/features/editor-find-replace";
import { LINK_URL_MAX } from "../lib/features/editor-link-url";
import { MENTION_LABEL_MAX } from "../lib/features/editor-mention-node";
import { PAGE_LINK_TITLE_MAX } from "../lib/features/editor-page-link";
import {
  BOOKMARK_DESCRIPTION_MAX,
  BOOKMARK_SITE_NAME_MAX,
  BOOKMARK_TITLE_MAX,
  BOOKMARK_URL_MAX,
} from "../lib/features/editor-bookmark-url";
import { EMOJI_SUGGEST_LIMIT } from "../lib/features/editor-emoji";
import { slashMenuItems } from "../lib/plugins/editor-slash";
import { SLASH_QUERY_LIMIT } from "../lib/features/editor-slash";
import {
  PASTE_BLOCK_LIMIT,
  PASTE_HTML_CHAR_LIMIT,
  PASTE_TEXT_CHAR_LIMIT,
} from "../lib/paste/editor-paste";
import { attachMentionProvider } from "../lib/plugins/editor-mention";
import { attachPageLinkHost } from "../lib/plugins/editor-page-link";
import { onBlockSelectionKeyDown, setBlockSelection } from "../lib/plugins/editor-block-selection";
import { editorStaticPlugins } from "../lib/static/editor-static-plugins";
import { EMPTY_EDITOR_VALUE } from "../lib/document/editor-value";
import { caret, createEditor, isRecord, paragraphValue } from "./test-utils";

// Exceptions are named here, with a reason. Each one is a product inconsistency the tests found.
const DEMO_EXCEPTIONS: Readonly<Record<string, string>> = {};

const SHORTCUT_EXCEPTIONS: Readonly<Record<string, string>> = {
  Tab: "Not declared by a plugin shortcut. Plate's core Tab hotkey calls editor.tf.tab, which lib/plugins/editor-plugins.ts overrides for lists.",
  "Mod+Z":
    "Not declared by the editor. slate-react handles undo as a default hotkey, so no plugin shortcut exists to check.",
  "Mod+Shift+Z":
    "Not declared by the editor. slate-react handles redo as a default hotkey, so no plugin shortcut exists to check.",
};

const STATIC_EXCEPTIONS: Readonly<Record<string, string>> = {};

// Inline element types. The schema does not mark them, so they are named here and checked against the allow list.
const INLINE_ELEMENT_TYPES: readonly string[] = [
  "a",
  "mention",
  "inline_equation",
  "date",
  "footnote_ref",
];

// Shortcuts that live in a keydown handler, not in a plugin's shortcuts map.
// Each file is checked to exist and to contain the literal key the handler test dispatches.
const HANDLER_VERIFIED: readonly { keys: string; file: string; contains: string }[] = [
  { keys: "Mod+F", file: "__tests__/find-bar.test.tsx", contains: 'key: "f", metaKey: true' },
  { keys: "Mod+K", file: "__tests__/link.test.tsx", contains: 'key: "k"' },
  {
    keys: "Mod+Shift+E",
    file: "__tests__/inline-equation-ui.test.tsx",
    contains: 'key: "e", metaKey: true, shiftKey: true',
  },
  { keys: "Mod+;", file: "__tests__/inline-date-ui.test.tsx", contains: 'key: ";", metaKey: true' },
  { keys: "Mod+/", file: "__tests__/block-menu.test.tsx", contains: 'key: "/"' },
  {
    keys: "Mod+A",
    file: "__tests__/block-selection.test.tsx",
    contains: 'key: "a", metaKey: true',
  },
];

// Dispatched in the dispatch test below, through the block selection keydown handler.
const DISPATCH_VERIFIED: readonly string[] = [
  "Mod+D",
  "Mod+Shift+Alt+ArrowUp",
  "Mod+Shift+Alt+ArrowDown",
];

const KEY_NAMES: Readonly<Record<string, string>> = {
  mod: "Mod",
  alt: "Alt",
  shift: "Shift",
  period: ".",
  comma: ",",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
};

// Plate's key arrays, such as [["mod", "shift", "x"]], as the inventory writes them.
function normalizeCombo(combo: readonly string[]): string {
  return combo
    .map((part) => {
      const named = KEY_NAMES[part];
      if (named !== undefined) {
        return named;
      }
      return part.length === 1 ? part.toUpperCase() : part;
    })
    .join("+");
}

function keyEvent(partial: {
  key: string;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}) {
  return {
    key: partial.key,
    metaKey: partial.metaKey ?? false,
    ctrlKey: false,
    altKey: partial.altKey ?? false,
    shiftKey: partial.shiftKey ?? false,
    defaultPrevented: false,
    preventDefault: () => undefined,
  };
}

// Plate's resolved shortcut entries hold keys as arrays of key parts.
function shortcutCombos(value: unknown): string[][] {
  if (!isRecord(value) || !Array.isArray(value.keys)) {
    return [];
  }

  return value.keys.filter(
    (combo): combo is string[] =>
      Array.isArray(combo) && combo.every((part) => typeof part === "string"),
  );
}

function entriesOfKind(kind: FeatureEntry["kind"]): FeatureEntry[] {
  return FEATURE_INVENTORY.filter((feature) => feature.kind === kind);
}

function readme(): string {
  return readFileSync(new URL("../README.md", import.meta.url), "utf8");
}

function trimmedLines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim()
    .split("\n");
}

function between(text: string, start: string, end: string): string {
  const from = text.indexOf(start);
  const to = text.indexOf(end);
  if (from < 0 || to < 0 || to < from) {
    throw new Error(`Missing markers ${start} and ${end}.`);
  }
  return text.slice(from + start.length, to);
}

function allNodes(value: unknown): Record<string, unknown>[] {
  const nodes: Record<string, unknown>[] = [];
  const visit = (node: unknown): void => {
    if (!isRecord(node)) {
      return;
    }
    nodes.push(node);
    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        visit(child);
      }
    }
  };
  if (Array.isArray(value)) {
    for (const item of value) {
      visit(item);
    }
  }
  return nodes;
}

function findById(id: string): Record<string, unknown> | undefined {
  return allNodes(DEMO_DOCUMENT_VALUE).find((node) => node.id === id);
}

function limitsOf(key: string): string {
  const feature = FEATURE_INVENTORY.find((item) => item.key === key);
  if (feature === undefined) {
    throw new Error(`No inventory entry for ${key}.`);
  }
  return feature.limits.join("; ");
}

function slashIdsFromEntries(): string[] {
  return FEATURE_INVENTORY.flatMap((feature) =>
    feature.entry.flatMap((point) =>
      point.via === "slash" && point.id !== undefined ? [point.id] : [],
    ),
  );
}

// Link needs text before the caret, and Footnote needs no text. The union covers both.
function slashItemsWithProviders() {
  const byId = new Map<string, ReturnType<typeof slashMenuItems>[number]>();
  for (const text of ["", "Text "]) {
    const editor = createEditor(paragraphValue(text));
    attachMentionProvider(editor, demoMentionProvider);
    attachPageLinkHost(editor, { provider: demoPageProvider, onOpenPage: null });
    editor.tf.select(caret([0, 0], text.length));
    editor.tf.insertText("/");
    for (const item of slashMenuItems(editor)) {
      byId.set(item.id, item);
    }
  }
  return [...byId.values()];
}

describe("feature inventory", () => {
  test("keys are unique, every entry has an entry point, and labels are set", () => {
    const keys = FEATURE_INVENTORY.map((feature) => feature.key);
    expect(new Set(keys).size).toBe(keys.length);

    for (const feature of FEATURE_INVENTORY) {
      expect(feature.entry.length).toBeGreaterThan(0);
      expect(feature.label.trim().length).toBeGreaterThan(0);
      expect(feature.key.startsWith("ux:")).toBe(feature.kind === "ux");
    }
  });

  test("every allowed element type and mark has one entry of the right kind, and no entry is unknown", () => {
    for (const rule of EDITOR_ELEMENT_RULES) {
      const matches = FEATURE_INVENTORY.filter((feature) => feature.key === rule.type);
      expect(matches.length).toBe(1);
      const expected = INLINE_ELEMENT_TYPES.includes(rule.type) ? "inline" : "block";
      expect(matches[0]?.kind).toBe(expected);
    }

    for (const rule of EDITOR_MARK_RULES) {
      const matches = FEATURE_INVENTORY.filter((feature) => feature.key === rule.type);
      expect(matches.length).toBe(1);
      expect(matches[0]?.kind).toBe("mark");
    }

    const allowedTypes: readonly string[] = EDITOR_ELEMENT_RULES.map((rule) => rule.type);
    for (const feature of entriesOfKind("block")) {
      expect(allowedTypes).toContain(feature.key);
    }
    for (const feature of entriesOfKind("inline")) {
      expect(allowedTypes).toContain(feature.key);
    }
    for (const feature of entriesOfKind("mark")) {
      expect(isAllowedMark(feature.key)).toBe(true);
    }
  });

  test("every block, inline and mark entry is shown in the demo document", () => {
    for (const feature of FEATURE_INVENTORY) {
      if (feature.kind !== "block" && feature.kind !== "inline" && feature.kind !== "mark") {
        continue;
      }

      if (DEMO_EXCEPTIONS[feature.key] !== undefined) {
        continue;
      }

      expect(feature.demoBlockId).toBeDefined();
      const root = findById(feature.demoBlockId ?? "");
      expect(root).toBeDefined();
      if (root === undefined) {
        continue;
      }

      if (feature.kind === "mark") {
        const leaves = allNodes([root]).filter((node) => typeof node.text === "string");
        expect(leaves.some((leaf) => leaf[feature.key] !== undefined)).toBe(true);
      } else {
        expect(allNodes([root]).some((node) => node.type === feature.key)).toBe(true);
      }
    }

    for (const feature of FEATURE_INVENTORY) {
      if (feature.demoBlockId === undefined || feature.kind !== "block-attribute") {
        continue;
      }

      const root = findById(feature.demoBlockId);
      expect(root).toBeDefined();
      expect(allNodes([root]).some((node) => node[feature.key] !== undefined)).toBe(true);
    }
  });

  test("slash entries and slash items name each other", () => {
    const items = slashItemsWithProviders();
    expect(items.length).toBeGreaterThan(0);

    const ids = items.map((item) => item.id);
    const referenced = slashIdsFromEntries();
    for (const id of referenced) {
      expect(ids).toContain(id);
    }
    for (const id of ids) {
      expect(referenced).toContain(id);
    }

    for (const item of items) {
      expect(SLASH_ITEM_LABELS[item.id]).toBe(item.label);
    }
    expect(Object.keys(SLASH_ITEM_LABELS).sort()).toEqual([...ids].sort());
  });

  test("every shortcut entry is registered by a plugin or verified by a handler test", () => {
    const editor = createEditor(EMPTY_EDITOR_VALUE);
    const registered = new Set<string>();
    for (const hotkey of Object.values(editor.meta.shortcuts)) {
      for (const combo of shortcutCombos(hotkey)) {
        registered.add(normalizeCombo(combo));
      }
    }

    const inventoryKeys = new Set<string>();
    for (const feature of FEATURE_INVENTORY) {
      for (const point of feature.entry) {
        if (point.via !== "shortcut") {
          continue;
        }
        const keys = point.keys ?? "";
        inventoryKeys.add(keys);
        const handler = HANDLER_VERIFIED.find((item) => item.keys === keys);
        if (
          registered.has(keys) ||
          SHORTCUT_EXCEPTIONS[keys] !== undefined ||
          DISPATCH_VERIFIED.includes(keys)
        ) {
          continue;
        }
        expect(handler).toBeDefined();
        if (handler !== undefined) {
          expect(readFileSync(new URL(`../${handler.file}`, import.meta.url), "utf8")).toContain(
            handler.contains,
          );
        }
      }
    }

    for (const keys of registered) {
      expect(inventoryKeys.has(keys)).toBe(true);
    }
  });

  test("block selection shortcuts run through the block selection handler", () => {
    const editor = createEditor([
      { type: "p", id: "a", children: [{ text: "A" }] },
      { type: "p", id: "b", children: [{ text: "B" }] },
    ]);
    setBlockSelection(editor, ["a"]);
    expect(onBlockSelectionKeyDown(editor, keyEvent({ key: "d", metaKey: true }))).toBe(true);
    expect(editor.children.length).toBe(3);

    setBlockSelection(editor, ["b"]);
    expect(
      onBlockSelectionKeyDown(
        editor,
        keyEvent({ key: "ArrowUp", metaKey: true, shiftKey: true, altKey: true }),
      ),
    ).toBe(true);
    expect(
      onBlockSelectionKeyDown(
        editor,
        keyEvent({ key: "ArrowDown", metaKey: true, shiftKey: true, altKey: true }),
      ),
    ).toBe(true);
    expect(editor.children.length).toBe(3);
  });

  test("every block, inline and mark entry is rendered by the static renderer", () => {
    const staticKeys = new Set(editorStaticPlugins.map((plugin) => plugin.key));
    for (const feature of FEATURE_INVENTORY) {
      if (feature.kind !== "block" && feature.kind !== "inline" && feature.kind !== "mark") {
        continue;
      }

      if (feature.static === "not-applicable") {
        expect(STATIC_EXCEPTIONS[feature.key]).toBeDefined();
        continue;
      }

      expect(staticKeys.has(feature.key)).toBe(true);
    }
  });

  test("nothing advertised is pending", () => {
    // grep for import, export, upload, AI, comment and collaboration in lib, components and hooks:
    // no matching feature exists in the code, so the inventory text must not name one.
    const text = JSON.stringify(FEATURE_INVENTORY);
    expect(text).not.toMatch(/import|export|upload|collaborat|comment/i);
    expect(text).not.toMatch(/\bAI\b/);
  });

  test("limits quote the constants the code enforces", () => {
    const expectations: readonly [string, number | string, string][] = [
      ["ux:find", FIND_QUERY_MAX, "query"],
      ["ux:find", FIND_MATCH_MAX, "matches"],
      ["ux:find", FIND_REPLACEMENT_MAX, "replacement"],
      ["ux:slash-menu", SLASH_QUERY_LIMIT, "slash query"],
      ["table", TABLE_MAX_ROWS, "table rows"],
      ["table", TABLE_MAX_COLUMNS, "table columns"],
      ["tr", TABLE_MAX_COLUMNS, "row cells"],
      ["equation", EQUATION_EXPRESSION_MAX, "equation"],
      ["inline_equation", EQUATION_EXPRESSION_MAX, "inline equation"],
      ["indent", BLOCK_INDENT_MAX, "indent levels"],
      ["listRestart", LIST_NUMBER_RANGE.max, "list numbers"],
      ["column_group", COLUMN_MAX_COUNT, "column count"],
      ["a", LINK_URL_MAX, "link url"],
      ["bookmark", BOOKMARK_URL_MAX, "bookmark url"],
      ["bookmark", BOOKMARK_TITLE_MAX, "bookmark title"],
      ["bookmark", BOOKMARK_DESCRIPTION_MAX, "bookmark description"],
      ["bookmark", BOOKMARK_SITE_NAME_MAX, "bookmark site name"],
      ["page_link", PAGE_LINK_TITLE_MAX, "page title"],
      ["mention", MENTION_LABEL_MAX, "mention label"],
      ["ux:emoji", EMOJI_SUGGEST_LIMIT, "emoji suggestions"],
      ["ux:paste", PASTE_BLOCK_LIMIT, "paste blocks"],
      ["ux:paste", PASTE_TEXT_CHAR_LIMIT, "paste text"],
      ["ux:paste", PASTE_HTML_CHAR_LIMIT, "paste html"],
      ["code_block", CODE_LANGS.length, "code languages"],
      ["callout", CALLOUT_ICONS.length, "callout icons"],
      ["align", TEXT_ALIGNS.length, "align values"],
      ["lineHeight", LINE_HEIGHTS.length, "line heights"],
      ["color", PALETTE_TOKENS.length, "palette tokens"],
      ["fontSize", FONT_SIZES.length, "font sizes"],
      ["fontFamily", FONT_FAMILIES.length, "font families"],
    ];

    for (const [key, value, label] of expectations) {
      expect({ label, text: limitsOf(key).includes(String(value)) }).toEqual({
        label,
        text: true,
      });
    }
  });

  test("README feature list matches the generated list", () => {
    const section = between(readme(), "<!-- feature-list:start -->", "<!-- feature-list:end -->");
    expect(trimmedLines(section)).toEqual(trimmedLines(renderFeatureList()));
  });

  test("README keyboard shortcut list matches the generated list", () => {
    const section = between(readme(), "<!-- shortcut-list:start -->", "<!-- shortcut-list:end -->");
    expect(trimmedLines(section)).toEqual(trimmedLines(renderShortcutList()));
  });
});
