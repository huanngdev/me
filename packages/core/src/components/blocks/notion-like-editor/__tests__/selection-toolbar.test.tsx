import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";
import { KEYS, type SlateEditor, type TElement } from "platejs";
import { createPlateEditor } from "platejs/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { EditorSurface } from "../components/editor/editor-surface";
import {
  getFontFamily,
  getFontSize,
  getHighlight,
  getLineHeight,
  getTextAlign,
  getTextColor,
  runEditorCommand,
  turnBlockInto,
} from "../lib/commands/editor-commands";
import { createEditorDocument } from "../lib/document/editor-document";
import { parseEditorDocument } from "../lib/document/editor-document-validate";
import type { EditorValue } from "../lib/document/editor-value";
import {
  SELECTION_TOOLBAR_MEDIA,
  selectionToolbarFrame,
  selectionToolbarModel,
  selectionToolbarPlacement,
  selectionToolbarVisible,
  showingToolbarSnapshot,
} from "../lib/features/editor-selection-toolbar";
import { closeLinkPopover, linkUiPlugin } from "../lib/plugins/editor-link";
import { createEditorPlugins } from "../lib/plugins/editor-plugins";
import { slashUiPlugin } from "../lib/plugins/editor-slash";
import { createEditor, textRange } from "./test-utils";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
Reflect.set(globalThis, "innerWidth", 1280);
Reflect.set(globalThis, "innerHeight", 800);
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
}

const editorRoot = join(import.meta.dir, "..");

function paragraph(text: string, id = "p", marks?: Record<string, unknown>): TElement {
  return { type: "p", id, children: [marks ? { text, ...marks } : { text }] };
}

function showing(
  editor: SlateEditor,
  overrides: Parameters<typeof showingToolbarSnapshot>[0] = {},
) {
  return selectionToolbarVisible(editor, showingToolbarSnapshot(overrides));
}

function isReactContainer(value: object): value is Parameters<typeof createRoot>[0] {
  return "nodeType" in value && value.nodeType === 1;
}

async function mount(value: EditorValue, readOnly = false) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const editor = createPlateEditor({ plugins: createEditorPlugins(), value });
  const seen: EditorValue[] = [];
  if (!isReactContainer(host)) {
    throw new Error("Missing mount node.");
  }
  let root: Root | undefined;
  await act(async () => {
    root = createRoot(host);
    root.render(
      <EditorSurface
        editor={editor}
        readOnly={readOnly}
        placeholder=""
        className="editor"
        onValueChange={(next) => {
          seen.push(next);
        }}
      />,
    );
  });
  const editable = host.querySelector("[data-slate-editor]");
  await act(async () => {
    if (editable instanceof HTMLElement) {
      editable.focus();
    }
  });

  return {
    editor,
    host,
    seen,
    cleanup: async () => {
      await act(async () => {
        root?.unmount();
      });
      host.remove();
    },
  };
}

async function showToolbar(value: EditorValue = [paragraph("Hello world")]) {
  const mounted = await mount(value);
  mounted.editor.tf.select(textRange([0, 0], 0, 5));
  await act(async () => {
    const editable = mounted.host.querySelector("[data-slate-editor]");
    if (editable instanceof HTMLElement) {
      editable.focus();
    }
  });
  return mounted;
}

function toolbar(): HTMLElement | null {
  const node = document.querySelector("[data-selection-toolbar]");
  return node instanceof HTMLElement ? node : null;
}

function control(label: string): HTMLElement {
  const node = document.querySelector(`[data-selection-toolbar] [aria-label="${label}"]`);
  if (!(node instanceof HTMLElement)) {
    throw new Error(`Missing control ${label}`);
  }
  return node;
}

async function press(label: string): Promise<void> {
  const node = control(label);
  await act(async () => {
    node.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, cancelable: true, button: 0 }),
    );
    node.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    node.click();
  });
}

async function openMoreSubmenu(label: string): Promise<void> {
  const trigger = Array.from(
    document.querySelectorAll("[data-selection-more] [role='menuitem']"),
  ).find((node) => {
    const text = node.textContent ?? "";
    if (label === "Font") {
      return text.includes("Font") && !text.includes("Font size");
    }
    return text.includes(label);
  });
  await act(async () => {
    trigger?.dispatchEvent(new PointerEvent("pointermove", { bubbles: true }));
    if (trigger instanceof HTMLElement) {
      trigger.click();
    }
  });
}

function leaf(editor: SlateEditor, path: number[]): Record<string, unknown> {
  const node = editor.api.node(path)?.[0];
  if (!node || typeof node !== "object") {
    throw new Error("Missing leaf.");
  }
  return node as Record<string, unknown>;
}

describe("selection toolbar show rule", () => {
  test("shows for an editable text range and hides each failing condition", () => {
    const editor = createEditor([paragraph("Hello world")]);
    editor.tf.select(textRange([0, 0], 0, 5));
    expect(showing(editor)).toBe(true);

    editor.tf.select({ anchor: { path: [0, 0], offset: 1 }, focus: { path: [0, 0], offset: 1 } });
    expect(showing(editor)).toBe(false);

    editor.tf.select(textRange([0, 0], 0, 5));
    expect(showing(editor, { readOnly: true })).toBe(false);
    expect(showing(editor, { composing: true })).toBe(false);
    expect(showing(editor, { pointerHeld: true })).toBe(false);
    expect(showing(editor, { keyboardSelecting: true })).toBe(false);
    expect(showing(editor, { dismissed: true })).toBe(false);
    expect(showing(editor, { editorFocused: false })).toBe(false);
    expect(showing(editor, { editorFocused: false, toolbarFocused: true })).toBe(true);
    expect(showing(editor, { linkPopoverOpen: true })).toBe(false);
    expect(showing(editor, { slashOpen: true })).toBe(false);
    expect(showing(editor, { bookmarkOpen: true })).toBe(false);
    expect(showing(editor, { mentionOpen: true })).toBe(false);
    expect(showing(editor, { blockMenuOpen: true })).toBe(false);
    expect(showing(editor, { addMenuOpen: true })).toBe(false);
    expect(showing(editor, { dragging: true })).toBe(false);
    expect(showing(editor, { dismissed: false })).toBe(true);
  });

  test("hides an expanded range with no text, a void-only selection, and a code block", () => {
    const empty = createEditor([paragraph(""), { type: "p", id: "p2", children: [{ text: "" }] }]);
    empty.tf.select({
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [1, 0], offset: 0 },
    });
    expect(empty.api.isCollapsed()).toBe(false);
    expect(showing(empty)).toBe(false);

    const divider = createEditor([{ type: "hr", id: "rule", children: [{ text: "" }] }]);
    const start = divider.api.start([0]);
    const end = divider.api.end([0]);
    if (start && end) {
      divider.tf.select({ anchor: start, focus: end });
    }
    expect(showing(divider)).toBe(false);

    const code = createEditor([
      {
        type: "code_block",
        id: "code",
        children: [{ type: "code_line", id: "line", children: [{ text: "const a = 1" }] }],
      },
    ]);
    code.tf.select(textRange([0, 0, 0], 0, 5));
    expect(showing(code)).toBe(false);
  });
});

describe("selection toolbar controls", () => {
  test("each mark toggles, mixed applies once, and undo restores the range", async () => {
    const mounted = await showToolbar([paragraph("Hello")]);
    const before = mounted.editor.selection;
    try {
      expect(control("Bold").getAttribute("aria-pressed")).toBe("false");
      await press("Bold");
      expect(leaf(mounted.editor, [0, 0]).bold).toBe(true);
      expect(mounted.editor.api.string(mounted.editor.selection!)).toBe("Hello");
      expect(mounted.editor.selection).toEqual(before);
      expect(control("Bold").getAttribute("aria-pressed")).toBe("true");
      expect(mounted.editor.history.undos).toHaveLength(1);

      await press("Bold");
      expect(leaf(mounted.editor, [0, 0]).bold).toBeUndefined();
      expect(mounted.editor.selection).toEqual(before);

      mounted.editor.tf.undo();
      expect(leaf(mounted.editor, [0, 0]).bold).toBe(true);
      expect(mounted.editor.selection).toEqual(before);
    } finally {
      await mounted.cleanup();
    }

    const mixed = await showToolbar([
      {
        type: "p",
        id: "p",
        children: [{ text: "Hello", bold: true }, { text: " world" }],
      },
    ]);
    mixed.editor.tf.select({
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [0, 1], offset: 6 },
    });
    await act(async () => {});
    try {
      expect(control("Bold").getAttribute("aria-pressed")).toBe("mixed");
      expect(control("Bold").hasAttribute("data-state-mixed")).toBe(true);
      const selected = mixed.editor.api.string(mixed.editor.selection!);
      await press("Bold");
      expect(mixed.editor.api.string(mixed.editor.selection!)).toBe(selected);
      const paragraphNode = mixed.editor.children[0];
      if (!paragraphNode || !("children" in paragraphNode)) {
        throw new Error("Missing paragraph.");
      }
      expect(paragraphNode.children.every((node) => "bold" in node && node.bold === true)).toBe(
        true,
      );
    } finally {
      await mixed.cleanup();
    }
  });

  test("italic, underline, strikethrough, and code follow the same command", async () => {
    const labels = ["Italic", "Underline", "Strikethrough", "Code"] as const;
    const keys = [KEYS.italic, KEYS.underline, KEYS.strikethrough, KEYS.code] as const;
    for (const [index, label] of labels.entries()) {
      const mounted = await showToolbar([paragraph("Hello")]);
      const before = mounted.editor.selection;
      try {
        await press(label);
        expect(leaf(mounted.editor, [0, 0])[keys[index] ?? ""]).toBe(true);
        expect(mounted.editor.selection).toEqual(before);
        expect(mounted.editor.history.undos).toHaveLength(1);
        mounted.editor.tf.undo();
        expect(leaf(mounted.editor, [0, 0])[keys[index] ?? ""]).toBeUndefined();
        expect(mounted.editor.selection).toEqual(before);
      } finally {
        await mounted.cleanup();
      }
    }
  });

  test("link opens insert or edit and the toolbar returns with the same selection", async () => {
    const inserted = await showToolbar([paragraph("Hello world")]);
    const before = inserted.editor.selection;
    try {
      await press("Link");
      expect(document.querySelector("[data-link-popover]")?.getAttribute("data-link-mode")).toBe(
        "insert",
      );
      expect(toolbar()).toBeNull();
      await act(async () => {
        closeLinkPopover(inserted.editor);
      });
      expect(toolbar()).not.toBeNull();
      expect(inserted.editor.selection).toEqual(before);
    } finally {
      await inserted.cleanup();
    }

    const linked = await mount([
      {
        type: "p",
        id: "p",
        children: [{ type: "a", url: "https://example.com", children: [{ text: "Hello" }] }],
      },
    ]);
    linked.editor.tf.select(textRange([0, 0, 0], 0, 5));
    await act(async () => {
      const editable = linked.host.querySelector("[data-slate-editor]");
      if (editable instanceof HTMLElement) {
        editable.focus();
      }
    });
    try {
      expect(control("Link").getAttribute("aria-pressed")).toBe("true");
      await press("Link");
      expect(document.querySelector("[data-link-popover]")?.getAttribute("data-link-mode")).toBe(
        "edit",
      );
      expect(toolbar()).toBeNull();
    } finally {
      await linked.cleanup();
    }
  });

  test("color sets a token and default, stays open, and marks none when mixed", async () => {
    const mounted = await showToolbar([paragraph("Hello")]);
    try {
      await press("Color");
      expect(document.querySelector("[data-selection-color-menu]")).not.toBeNull();
      const gray = document.querySelector("[data-color-kind='text'][data-color-token='gray']");
      await act(async () => {
        if (gray instanceof HTMLElement) {
          gray.click();
        }
      });
      expect(document.querySelector("[data-selection-color-menu]")).not.toBeNull();
      expect(getTextColor(mounted.editor)).toBe("gray");
      expect(gray?.getAttribute("aria-pressed")).toBe("true");
      const clear = document.querySelector("[data-color-kind='text'][data-color-token='default']");
      await act(async () => {
        if (clear instanceof HTMLElement) {
          clear.click();
        }
      });
      expect(getTextColor(mounted.editor)).toBeNull();
      const highlight = document.querySelector(
        "[data-color-kind='highlight'][data-color-token='yellow']",
      );
      await act(async () => {
        if (highlight instanceof HTMLElement) {
          highlight.click();
        }
      });
      expect(getHighlight(mounted.editor)).toBe("yellow");
      expect(document.querySelector("[data-selection-color-menu]")).not.toBeNull();
    } finally {
      await mounted.cleanup();
    }

    const mixed = await showToolbar([
      {
        type: "p",
        id: "p",
        children: [
          { text: "Hello", color: "gray" },
          { text: " world", color: "blue" },
        ],
      },
    ]);
    mixed.editor.tf.select({
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [0, 1], offset: 6 },
    });
    await act(async () => {});
    try {
      await press("Color");
      const pressed = document.querySelector("[data-color-kind='text'][aria-pressed='true']");
      expect(pressed).toBeNull();
      expect(control("Color").getAttribute("data-color-summary")).toBe("Color: mixed");
    } finally {
      await mixed.cleanup();
    }
  });

  test("the color button and swatches show the current value, including after undo", async () => {
    document.documentElement.style.setProperty("--editor-text-red", "rgb(180, 0, 0)");
    document.documentElement.style.setProperty("--editor-bg-yellow", "rgb(255, 240, 0)");
    const mounted = await showToolbar([paragraph("Hello")]);
    try {
      const button = control("Color");
      expect(button.getAttribute("data-color-summary")).toBe("Color: Default");
      expect(button.style.color).toBe("");
      expect(button.style.backgroundColor).toBe("");
      await press("Color");
      const textDefault = document.querySelector(
        "[data-color-kind='text'][data-color-token='default']",
      );
      const highlightDefault = document.querySelector(
        "[data-color-kind='highlight'][data-color-token='default']",
      );
      expect(textDefault?.getAttribute("aria-pressed")).toBe("true");
      expect(textDefault?.querySelector("[data-color-check]")).not.toBeNull();
      expect(highlightDefault?.getAttribute("aria-pressed")).toBe("true");
      expect(highlightDefault?.className).toContain("border");

      const red = document.querySelector("[data-color-kind='text'][data-color-token='red']");
      await act(async () => {
        if (red instanceof HTMLElement) {
          red.click();
        }
      });
      expect(red?.getAttribute("aria-pressed")).toBe("true");
      expect(red?.className).toContain("ring-2");
      expect(control("Color").style.color).toContain("--editor-text-red");
      expect(control("Color").getAttribute("data-color-summary")).toBe("Color: Red text");
      const selected = mounted.host.querySelector("[data-slate-leaf]");
      if (selected instanceof HTMLElement) {
        expect(selected.style.color).toContain("--editor-text-red");
        expect(control("Color").style.color).toBe(selected.style.color);
      }

      const yellow = document.querySelector(
        "[data-color-kind='highlight'][data-color-token='yellow']",
      );
      await act(async () => {
        if (yellow instanceof HTMLElement) {
          yellow.click();
        }
      });
      expect(yellow?.getAttribute("aria-pressed")).toBe("true");
      expect(control("Color").style.backgroundColor).toContain("--editor-bg-yellow");
      expect(control("Color").getAttribute("data-color-summary")).toBe(
        "Color: Red text, Yellow highlight",
      );

      await act(async () => {
        mounted.editor.tf.undo();
      });
      expect(getHighlight(mounted.editor)).toBeNull();
      expect(control("Color").style.backgroundColor).toBe("");
      expect(control("Color").getAttribute("data-color-summary")).toBe("Color: Red text");
    } finally {
      await mounted.cleanup();
      document.documentElement.style.removeProperty("--editor-text-red");
      document.documentElement.style.removeProperty("--editor-bg-yellow");
    }
  });

  test("toolbar controls are direct children of a plain toolbar, split into sections", async () => {
    const mounted = await showToolbar();
    try {
      const bar = toolbar();
      if (!(bar instanceof HTMLElement)) {
        throw new Error("Missing toolbar.");
      }
      expect(bar.querySelectorAll("[data-slot='button-group']")).toHaveLength(0);
      expect(bar.hasAttribute("data-slot")).toBe(false);
      expect(bar.getAttribute("role")).toBe("toolbar");
      const order = [...bar.children].map((node) =>
        node.hasAttribute("data-toolbar-separator")
          ? "|"
          : node.getAttribute("data-toolbar-control"),
      );
      expect(order).toEqual([
        "turn-into",
        "|",
        "bold",
        "italic",
        "underline",
        "strikethrough",
        "code",
        "|",
        "link",
        "equation",
        "|",
        "align",
        "|",
        "color",
        "|",
        "more",
      ]);
      for (const node of bar.querySelectorAll("[data-toolbar-separator]")) {
        expect(node.getAttribute("data-slot")).toBe("separator");
        expect(node.getAttribute("data-orientation")).toBe("vertical");
        expect(node.className).toContain("data-vertical:self-center");
        expect(node.className).not.toContain("data-vertical:self-stretch");
        expect(node.hasAttribute("tabindex")).toBe(false);
      }
      const controls = [...bar.querySelectorAll("[data-toolbar-control]")];
      expect(controls.map((node) => node.getAttribute("aria-label"))).toEqual([
        "Turn into",
        "Bold",
        "Italic",
        "Underline",
        "Strikethrough",
        "Code",
        "Link",
        "Equation",
        "Align",
        "Color",
        "More",
      ]);
      for (const node of controls) {
        expect(node.parentElement).toBe(bar);
      }
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (!first || !last) {
        throw new Error("Missing toolbar controls.");
      }
      expect(bar.firstElementChild).toBe(first);
      expect(bar.lastElementChild).toBe(last);
    } finally {
      await mounted.cleanup();
    }
  });

  test("align, turn into, and color keep the selection and editor focus", async () => {
    const mounted = await showToolbar([paragraph("Hello world")]);
    const editable = mounted.host.querySelector("[data-slate-editor]");
    const before = JSON.parse(JSON.stringify(mounted.editor.selection));
    try {
      for (const align of ["center", "right", "justify", "left"] as const) {
        const previous = getTextAlign(mounted.editor);
        await press("Align");
        const choice = document.querySelector(`[data-align-choice='${align}']`);
        await act(async () => {
          if (choice instanceof HTMLElement) {
            choice.click();
          }
        });
        expect(getTextAlign(mounted.editor)).toBe(align);
        expect(mounted.editor.selection).toEqual(before);
        expect(document.activeElement).toBe(editable);
        await act(async () => {
          mounted.editor.tf.undo();
        });
        expect(getTextAlign(mounted.editor)).toBe(previous);
        expect(mounted.editor.selection).toEqual(before);
      }

      await press("Turn into");
      const heading = document.querySelector("[data-block-picker-item='h2']");
      await act(async () => {
        if (heading instanceof HTMLElement) {
          heading.click();
        }
      });
      expect(mounted.editor.children[0]?.type).toBe("h2");
      expect(document.activeElement).toBe(editable);
      expect(mounted.editor.selection?.anchor.offset).toBe(before.anchor.offset);
      expect(mounted.editor.selection?.focus.offset).toBe(before.focus.offset);
      await act(async () => {
        mounted.editor.tf.undo();
      });
      expect(mounted.editor.children[0]?.type).toBe("p");
      expect(mounted.editor.selection).toEqual(before);

      await press("Color");
      expect(document.querySelector("[data-selection-color-menu]")).not.toBeNull();
      const swatch = document.querySelector("[data-color-swatch]");
      await act(async () => {
        if (swatch instanceof HTMLElement) {
          swatch.focus();
        }
        swatch?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      });
      expect(document.querySelector("[data-selection-color-menu]")).toBeNull();
      expect(mounted.editor.selection).toEqual(before);
      expect(document.activeElement).toBe(editable);
    } finally {
      await mounted.cleanup();
    }
  });

  test("more menu sets superscript, align, font, line height, and clear", async () => {
    const mounted = await showToolbar([paragraph("Hello", "p", { bold: true })]);
    try {
      await press("More");
      const superscript = document.querySelector("[data-more-choice='superscript']");
      await act(async () => {
        if (superscript instanceof HTMLElement) {
          superscript.click();
        }
      });
      expect(leaf(mounted.editor, [0, 0]).superscript).toBe(true);

      await press("Align");
      const center = document.querySelector("[data-align-choice='center']");
      expect(center).not.toBeNull();
      expect(center?.getAttribute("aria-checked")).toBe("false");
      await act(async () => {
        if (center instanceof HTMLElement) {
          center.click();
        }
      });
      expect(getTextAlign(mounted.editor)).toBe("center");
      expect(control("Align").getAttribute("data-align-current")).toBe("center");

      await press("More");
      expect(document.querySelector("[data-selection-more]")?.textContent).not.toContain("Align");
      await openMoreSubmenu("Font size");
      const fontSizeMenu = document.querySelector("[data-slot='dropdown-menu-sub-content']");
      const moreViewport = document.querySelector(
        "[data-selection-more] [data-slot='scroll-area-viewport']",
      );
      expect(fontSizeMenu).not.toBeNull();
      expect(moreViewport?.contains(fontSizeMenu ?? null)).toBe(false);
      const size = document.querySelector("[data-more-choice='font-size-18px']");
      await act(async () => {
        if (size instanceof HTMLElement) {
          size.click();
        }
      });
      expect(getFontSize(mounted.editor)).toBe("18px");

      await press("More");
      await openMoreSubmenu("Font");
      const font = document.querySelector("[data-more-choice='font-serif']");
      await act(async () => {
        if (font instanceof HTMLElement) {
          font.click();
        }
      });
      expect(getFontFamily(mounted.editor)).toBe("serif");

      await press("More");
      await openMoreSubmenu("Line height");
      const height = document.querySelector("[data-more-choice='line-height-2']");
      await act(async () => {
        if (height instanceof HTMLElement) {
          height.click();
        }
      });
      expect(getLineHeight(mounted.editor)).toBe(2);

      await press("More");
      const clear = document.querySelector("[data-more-choice='clear']");
      await act(async () => {
        if (clear instanceof HTMLElement) {
          clear.click();
        }
      });
      expect(leaf(mounted.editor, [0, 0]).bold).toBeUndefined();
      expect(leaf(mounted.editor, [0, 0]).superscript).toBeUndefined();

      await press("More");
      const disabled = document.querySelector("[data-more-choice='clear']");
      expect(
        disabled?.getAttribute("aria-disabled") ?? disabled?.getAttribute("data-disabled"),
      ).not.toBeNull();
    } finally {
      await mounted.cleanup();
    }
  });

  test("turn into is checked for one block, omitted for many, and keeps the text selected", async () => {
    const mounted = await showToolbar([paragraph("Hello world")]);
    const before = mounted.editor.api.string(mounted.editor.selection!);
    try {
      expect(control("Turn into").textContent).toContain("Text");
      await press("Turn into");
      const heading = document.querySelector("[data-block-picker-item='h2']");
      expect(heading?.getAttribute("data-state")).toBe("unchecked");
      const current = document.querySelector("[data-block-picker-item='paragraph']");
      expect(current?.getAttribute("data-state")).toBe("checked");
      await act(async () => {
        if (heading instanceof HTMLElement) {
          heading.click();
        }
      });
      expect(mounted.editor.children[0]?.type).toBe("h2");
      expect(mounted.editor.api.string(mounted.editor.selection!)).toBe(before);

      const fresh = createEditor([paragraph("Hello world")]);
      fresh.tf.select(textRange([0, 0], 0, 5));
      runEditorCommand(fresh, turnBlockInto, { path: [0], kind: "h2" });
      expect(fresh.children[0]?.type).toBe(mounted.editor.children[0]?.type);
    } finally {
      await mounted.cleanup();
    }

    const many = await showToolbar([paragraph("Hello"), paragraph("World", "p2")]);
    many.editor.tf.select({
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [1, 0], offset: 5 },
    });
    await act(async () => {});
    try {
      expect(document.querySelector("[aria-label='Turn into']")).toBeNull();
      expect(toolbar()?.querySelector("[data-toolbar-control]")?.getAttribute("aria-label")).toBe(
        "Bold",
      );
      expect(toolbar()).not.toBeNull();
    } finally {
      await many.cleanup();
    }
  });

  test("multi-block and table selections show the toolbar and apply marks", async () => {
    const blocks = await showToolbar([paragraph("Hello"), paragraph("World", "p2")]);
    blocks.editor.tf.select({
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [1, 0], offset: 5 },
    });
    await act(async () => {});
    try {
      expect(toolbar()).not.toBeNull();
      await press("Bold");
      expect(leaf(blocks.editor, [0, 0]).bold).toBe(true);
      expect(leaf(blocks.editor, [1, 0]).bold).toBe(true);
    } finally {
      await blocks.cleanup();
    }

    const table = await mount([
      {
        type: "table",
        id: "table",
        children: [
          {
            type: "tr",
            id: "row",
            children: [
              { type: "td", id: "a", children: [paragraph("One", "a-p")] },
              { type: "td", id: "b", children: [paragraph("Two", "b-p")] },
            ],
          },
        ],
      },
    ]);
    table.editor.tf.select({
      anchor: { path: [0, 0, 0, 0, 0], offset: 0 },
      focus: { path: [0, 0, 1, 0, 0], offset: 3 },
    });
    await act(async () => {
      const editable = table.host.querySelector("[data-slate-editor]");
      if (editable instanceof HTMLElement) {
        editable.focus();
      }
    });
    try {
      expect(toolbar()).not.toBeNull();
      await press("Bold");
      expect(leaf(table.editor, [0, 0, 0, 0, 0]).bold).toBe(true);
      expect(leaf(table.editor, [0, 0, 1, 0, 0]).bold).toBe(true);
    } finally {
      await table.cleanup();
    }
  });

  test("keys hide, rove, and return focus without losing the selection", async () => {
    const mounted = await showToolbar([paragraph("Hello world")]);
    const before = mounted.editor.selection;
    try {
      const editable = mounted.host.querySelector("[data-slate-editor]");
      await act(async () => {
        editable?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      });
      expect(toolbar()).toBeNull();
      expect(mounted.editor.selection).toEqual(before);

      mounted.editor.tf.select(textRange([0, 0], 0, 6));
      await act(async () => {});
      expect(toolbar()).not.toBeNull();

      await act(async () => {
        editable?.dispatchEvent(
          new KeyboardEvent("keydown", { key: "F10", altKey: true, bubbles: true }),
        );
      });
      expect(document.activeElement?.getAttribute("aria-label")).toBe("Turn into");

      await act(async () => {
        toolbar()?.dispatchEvent(
          new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
        );
        toolbar()?.dispatchEvent(
          new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
        );
      });
      const labels = Array.from(
        document.querySelectorAll(
          "[data-selection-toolbar] [data-toolbar-control]:not([disabled])",
        ),
      ).map((node) => node.getAttribute("aria-label"));
      expect(document.activeElement?.getAttribute("aria-label")).toBe(labels[2]);

      await act(async () => {
        toolbar()?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      });
      expect(mounted.host.querySelector("[data-slate-editor]")).toBe(document.activeElement);
      expect(mounted.editor.api.string(mounted.editor.selection!)).toBe("Hello ");

      const shortcut = mounted.editor.meta.shortcuts["bold.toggle"];
      await act(async () => {
        shortcut?.handler?.({
          editor: mounted.editor,
          event: new KeyboardEvent("keydown", { key: "b", metaKey: true }),
          eventDetails: { keys: ["mod", "b"] },
        } as never);
      });
      expect(control("Bold").getAttribute("aria-pressed")).toBe("true");
    } finally {
      await mounted.cleanup();
    }
  });

  test("placement follows the media query", async () => {
    expect(selectionToolbarPlacement(false)).toBe("floating");
    expect(selectionToolbarPlacement(true)).toBe("docked");
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query === SELECTION_TOOLBAR_MEDIA,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
    })) as typeof window.matchMedia;
    const docked = await showToolbar();
    try {
      expect(toolbar()?.getAttribute("data-placement")).toBe("docked");
      expect(toolbar()?.parentElement?.closest("[data-slate-editor]")).toBeNull();
    } finally {
      await docked.cleanup();
      window.matchMedia = original;
    }

    const floating = await showToolbar();
    try {
      expect(toolbar()?.getAttribute("data-placement")).toBe("floating");
      expect(toolbar()?.closest("[data-radix-popper-content-wrapper]")).not.toBeNull();
    } finally {
      await floating.cleanup();
    }
  });

  test("the floating toolbar uses the editor frame as its collision boundary only when it exists", async () => {
    document.querySelector("[data-block-viewport]")?.remove();
    expect(selectionToolbarFrame(document)).toBeUndefined();
    const open = await showToolbar();
    try {
      expect(toolbar()?.hasAttribute("data-collision-boundary")).toBe(false);
      expect(toolbar()?.closest("[data-radix-popper-content-wrapper]")).not.toBeNull();
    } finally {
      await open.cleanup();
    }

    const frame = document.createElement("div");
    frame.setAttribute("data-block-viewport", "");
    document.body.appendChild(frame);
    expect(selectionToolbarFrame(document)).toBe(frame);
    const bounded = await showToolbar();
    try {
      expect(toolbar()?.getAttribute("data-collision-boundary")).toBe("frame");
    } finally {
      await bounded.cleanup();
      frame.remove();
    }
  });

  test("saving stores only the marks the command writes", async () => {
    const mounted = await showToolbar([paragraph("Hello")]);
    try {
      await press("Bold");
      const value = mounted.seen.at(-1);
      expect(value?.[0]?.children).toEqual([{ text: "Hello", bold: true }]);
      expect(parseEditorDocument(createEditorDocument("doc", value)).status).toBe("ok");
      expect(JSON.stringify(value)).not.toContain("selection-toolbar");
    } finally {
      await mounted.cleanup();
    }
  });

  test("read-only, pointer, composition, and an open slash menu hide the toolbar", async () => {
    const readOnly = await mount([paragraph("Hello")], true);
    readOnly.editor.tf.select(textRange([0, 0], 0, 5));
    await act(async () => {});
    try {
      expect(toolbar()).toBeNull();
    } finally {
      await readOnly.cleanup();
    }

    const mounted = await showToolbar();
    try {
      const editable = mounted.host.querySelector("[data-slate-editor]");
      await act(async () => {
        editable?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      });
      expect(toolbar()).toBeNull();
      await act(async () => {
        document.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
        if (editable instanceof HTMLElement) {
          editable.focus();
        }
      });
      expect(toolbar()).not.toBeNull();

      await act(async () => {
        mounted.editor.setOption(slashUiPlugin, "open", true);
      });
      expect(toolbar()).toBeNull();
      expect(mounted.editor.getOption(linkUiPlugin, "mode")).toBe("closed");
    } finally {
      await mounted.cleanup();
    }
  });

  test("a collapsed caret leaves no toolbar in the DOM", async () => {
    const mounted = await mount([paragraph("Hello")]);
    mounted.editor.tf.select({
      anchor: { path: [0, 0], offset: 1 },
      focus: { path: [0, 0], offset: 1 },
    });
    await act(async () => {});
    try {
      expect(toolbar()).toBeNull();
    } finally {
      await mounted.cleanup();
    }
  });
});

describe("selection toolbar keys and state", () => {
  test("arrow keys rove over enabled controls only, and Home and End jump to the ends", async () => {
    const mounted = await showToolbar([paragraph("Hello world")]);
    try {
      const editable = mounted.host.querySelector("[data-slate-editor]");
      await act(async () => {
        editable?.dispatchEvent(
          new KeyboardEvent("keydown", { key: "F10", altKey: true, bubbles: true }),
        );
      });
      const enabled = Array.from(
        document.querySelectorAll(
          "[data-selection-toolbar] [data-toolbar-control]:not([disabled])",
        ),
      ).map((node) => node.getAttribute("aria-label"));
      expect(enabled[0]).toBe("Turn into");

      const visited: (string | null)[] = [];
      for (let step = 0; step < enabled.length; step += 1) {
        await act(async () => {
          toolbar()?.dispatchEvent(
            new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
          );
        });
        visited.push(document.activeElement?.getAttribute("aria-label") ?? null);
      }
      expect(visited).toEqual([...enabled.slice(1), enabled[0]]);

      await act(async () => {
        toolbar()?.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
      });
      expect(document.activeElement?.getAttribute("aria-label")).toBe(enabled[enabled.length - 1]);

      await act(async () => {
        toolbar()?.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
      });
      expect(document.activeElement?.getAttribute("aria-label")).toBe(enabled[0]);
    } finally {
      await mounted.cleanup();
    }
  });

  test("a pressed mark reports aria-pressed, and a disabled control keeps its reason", async () => {
    const bold = await showToolbar([paragraph("Hello", "p", { bold: true })]);
    try {
      expect(control("Bold").getAttribute("aria-pressed")).toBe("true");
    } finally {
      await bold.cleanup();
    }

    const spanning = await showToolbar([paragraph("Hello"), paragraph("World", "p2")]);
    try {
      spanning.editor.tf.select({
        anchor: { path: [0, 0], offset: 0 },
        focus: { path: [1, 0], offset: 5 },
      });
      await act(async () => {});
      const equation = control("Equation");
      expect(equation.hasAttribute("disabled")).toBe(true);
      expect(equation.className).toContain("disabled:pointer-events-auto");
      expect(selectionToolbarModel(spanning.editor).equation.reason).toBe(
        "Equations cannot span blocks.",
      );
    } finally {
      await spanning.cleanup();
    }
  });

  test("the floating popover is the visible surface, padded with p-2", async () => {
    const mounted = await showToolbar();
    try {
      const content = toolbar()?.closest("[data-slot='popover-content']");
      if (!(content instanceof HTMLElement)) {
        throw new Error("Missing popover content.");
      }
      expect(content.classList.contains("p-2")).toBe(true);
      expect(content.className).not.toContain("bg-transparent");
      expect(content.classList.contains("p-0")).toBe(false);
      expect(content.className).not.toContain("shadow-none");
    } finally {
      await mounted.cleanup();
    }
  });
});

describe("selection toolbar source", () => {
  test("popover files are listed and contain no raw button", () => {
    const floating = readFileSync(join(import.meta.dir, "floating-ui.test.tsx"), "utf8");
    expect(floating).toContain("components/ui/selection-toolbar.tsx");
    expect(floating).toContain("components/ui/selection-color-menu.tsx");
    for (const path of [
      "components/ui/selection-toolbar.tsx",
      "components/ui/selection-color-menu.tsx",
    ]) {
      expect(readFileSync(join(editorRoot, path), "utf8")).not.toContain("<button");
    }
    const toolbarSource = readFileSync(
      join(editorRoot, "components/ui/selection-toolbar.tsx"),
      "utf8",
    );
    expect(toolbarSource).toContain("...(frame ? { collisionBoundary: frame } : {})");
    expect(toolbarSource).toContain("UnfoldVertical");
    expect(toolbarSource).not.toContain("Baseline");
  });
});
