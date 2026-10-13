import { afterEach, describe, expect, test } from "bun:test";
import { KEYS, type SlateEditor, type TElement } from "platejs";
import { Plate, createPlateEditor } from "platejs/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { DropdownMenu, DropdownMenuContent } from "@/components/dropdown-menu";

import { EditorSurface } from "../components/editor/editor-surface";
import { BlockPickerGroups } from "../components/ui/block-picker";
import { ShortcutHintsScope, ShortcutKbd, ShortcutLabel } from "../components/ui/editor-shortcut";
import type { EditorValue } from "../lib/document/editor-value";
import { blockPickerAddItems, blockPickerTurnItems } from "../lib/features/editor-block-picker";
import { BLOCK_MENU_GRIP_LABEL } from "../lib/features/editor-block-menu";
import { resolveEditorOptions } from "../lib/features/editor-options";
import { EDITOR_SHORTCUTS } from "../lib/features/editor-shortcuts";
import { findState } from "../lib/plugins/editor-find";
import { editorConfigPlugin } from "../lib/plugins/editor-config";
import { createEditorPlugins } from "../lib/plugins/editor-plugins";
import { caret, textRange } from "./test-utils";
import { keyboardInit } from "./shortcut-keys";

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

const restorers: Array<() => void> = [];

// Stubs navigator.platform for one test. Restored by afterEach.
function setPlatform(platform: string): void {
  const had = Object.getOwnPropertyDescriptor(navigator, "platform");
  Object.defineProperty(navigator, "platform", { configurable: true, value: platform });
  restorers.push(() => {
    if (had) {
      Object.defineProperty(navigator, "platform", had);
    } else {
      Reflect.deleteProperty(navigator, "platform");
    }
  });
}

const MAC = "MacIntel";
const WINDOWS = "Win32";

// matches for both pointer queries. false is a touch-only device.
function setKeyboardDevice(matches: boolean): void {
  const original = window.matchMedia;
  window.matchMedia = ((query: string) => ({
    matches,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
  })) as typeof window.matchMedia;
  restorers.push(() => {
    window.matchMedia = original;
  });
}

afterEach(() => {
  for (const restore of restorers.splice(0)) {
    restore();
  }
});

function paragraph(id: string, text = ""): TElement {
  return { type: KEYS.p, id, children: [{ text }] };
}

function domRect(x: number, y: number, width: number, height: number): DOMRect {
  return {
    x,
    y,
    left: x,
    top: y,
    right: x + width,
    bottom: y + height,
    width,
    height,
    toJSON() {
      return {};
    },
  } as DOMRect;
}

async function mount(value: EditorValue) {
  const host = document.createElement("div");
  host.setAttribute("data-block-viewport", "");
  document.body.appendChild(host);
  const editor: SlateEditor = createPlateEditor({ plugins: createEditorPlugins(), value });
  const root: Root = createRoot(host);
  await act(async () => {
    root.render(
      <EditorSurface editor={editor} readOnly={false} placeholder="" className="editor" />,
    );
  });
  return {
    host,
    editor,
    cleanup: async () => {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    },
  };
}

function shortcutOf(node: Element | null): string {
  return node?.querySelector("[data-slot='command-shortcut']")?.textContent ?? "";
}

function menuShortcutOf(node: Element | null): string {
  return node?.querySelector("[data-slot='dropdown-menu-shortcut']")?.textContent ?? "";
}

function menuItem(label: string): Element | null {
  return (
    Array.from(document.querySelectorAll("[role='menuitem']")).find((node) =>
      node.textContent?.includes(label),
    ) ?? null
  );
}

async function typeSlash(editor: SlateEditor): Promise<void> {
  await act(async () => {
    editor.tf.select(caret([0, 0], 0));
    editor.tf.insertText("/");
  });
}

describe("slash menu hints", () => {
  test("macOS shows glyphs and Windows shows names on the mapped items only", async () => {
    setPlatform(MAC);
    const mac = await mount([paragraph("p1")] as EditorValue);
    await typeSlash(mac.editor);
    expect(shortcutOf(document.querySelector("[data-slash-item='paragraph']"))).toBe("⌘⌥0");
    expect(shortcutOf(document.querySelector("[data-slash-item='h1']"))).toBe("⌘⌥1");
    expect(shortcutOf(document.querySelector("[data-slash-item='h3']"))).toBe("⌘⌥3");
    expect(shortcutOf(document.querySelector("[data-slash-item='bulleted']"))).toBe("⌘⇧8");
    expect(shortcutOf(document.querySelector("[data-slash-item='numbered']"))).toBe("⌘⇧7");
    expect(shortcutOf(document.querySelector("[data-slash-item='todo']"))).toBe("⌘⇧9");
    expect(shortcutOf(document.querySelector("[data-slash-item='link']"))).toBe("⌘K");
    expect(shortcutOf(document.querySelector("[data-slash-item='divider']"))).toBe("");
    expect(shortcutOf(document.querySelector("[data-slash-item='toggle']"))).toBe("");
    await mac.cleanup();

    setPlatform(WINDOWS);
    const windows = await mount([paragraph("p2")] as EditorValue);
    await typeSlash(windows.editor);
    expect(shortcutOf(document.querySelector("[data-slash-item='h1']"))).toBe("Ctrl+Alt+1");
    expect(shortcutOf(document.querySelector("[data-slash-item='bulleted']"))).toBe("Ctrl+Shift+8");
    expect(shortcutOf(document.querySelector("[data-slash-item='link']"))).toBe("Ctrl+K");
    await windows.cleanup();
  });

  test("a touch-only device shows no slash hints", async () => {
    setPlatform(MAC);
    setKeyboardDevice(false);
    const touch = await mount([paragraph("p1")] as EditorValue);
    await typeSlash(touch.editor);
    expect(document.querySelector("[data-slash-item='h1']")).not.toBeNull();
    expect(document.querySelector("[data-slot='command-shortcut']")).toBeNull();
    await touch.cleanup();
  });
});

describe("add menu and turn-into hints", () => {
  async function renderPicker(shortcuts: boolean | undefined) {
    const editor = await mount([paragraph("p1", "Hello")] as EditorValue);
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(
        <DropdownMenu open>
          <DropdownMenuContent>
            <BlockPickerGroups
              items={blockPickerAddItems(editor.editor, [0])}
              onChoose={() => undefined}
              shortcuts={shortcuts}
            />
          </DropdownMenuContent>
        </DropdownMenu>,
      );
    });
    return {
      row: (id: string) => document.querySelector(`[data-block-picker-item='${id}']`),
      cleanup: async () => {
        await act(async () => {
          root.unmount();
        });
        host.remove();
        await editor.cleanup();
      },
    };
  }

  test("the Add menu renders no shortcut hints on macOS or elsewhere", async () => {
    for (const platform of [MAC, WINDOWS]) {
      setPlatform(platform);
      const picker = await renderPicker(undefined);
      expect(document.querySelector("[data-slot='dropdown-menu-shortcut']")).toBeNull();
      expect(picker.row("h1")?.textContent).toContain("Heading 1");
      await picker.cleanup();
    }
  });

  test("the Turn into submenu renders the mapped hints on macOS and elsewhere", async () => {
    setPlatform(MAC);
    const mac = await renderPicker(true);
    expect(menuShortcutOf(mac.row("h1"))).toBe("⌘⌥1");
    expect(menuShortcutOf(mac.row("paragraph"))).toBe("⌘⌥0");
    expect(menuShortcutOf(mac.row("todo"))).toBe("⌘⇧9");
    expect(menuShortcutOf(mac.row("divider"))).toBe("");
    expect(menuShortcutOf(mac.row("toggle"))).toBe("");
    await mac.cleanup();

    setPlatform(WINDOWS);
    const other = await renderPicker(true);
    expect(menuShortcutOf(other.row("h1"))).toBe("Ctrl+Alt+1");
    expect(menuShortcutOf(other.row("bulleted"))).toBe("Ctrl+Shift+8");
    await other.cleanup();
  });
});

describe("block menu hints", () => {
  function mountOverlay(): ReturnType<typeof mount> {
    const original = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function () {
      if (this.hasAttribute("data-block-handle")) {
        return domRect(230, 96, 66, 32);
      }
      if (this.hasAttribute("data-slate-node")) {
        return domRect(300, 100, 400, 24);
      }
      return domRect(0, 0, 1280, 800);
    };
    restorers.push(() => {
      HTMLElement.prototype.getBoundingClientRect = original;
    });
    return mount([paragraph("block-1", "Hello"), paragraph("block-2", "There")] as EditorValue);
  }

  test("the grip selects the block, so its menu rows show their hints", async () => {
    setPlatform(MAC);
    const mounted = await mountOverlay();
    const block = mounted.host.querySelector("[data-block-id='block-1']");
    await act(async () => {
      block?.dispatchEvent(
        new PointerEvent("pointermove", { bubbles: true, pointerType: "mouse" }),
      );
    });
    await act(async () => {
      document
        .querySelector("[data-block-handle-grip]")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(document.querySelector("[data-block-menu]")).not.toBeNull();
    expect(menuShortcutOf(menuItem("Duplicate"))).toBe("⌘D");
    expect(menuShortcutOf(menuItem("Move down"))).toBe("⌘⌥⇧↓");
    expect(menuShortcutOf(menuItem("Delete"))).toBe("⌫");
    await mounted.cleanup();
  });

  test("Mod+/ opens the menu without a block selection, so no row shows a block hint", async () => {
    setPlatform(MAC);
    const mounted = await mountOverlay();
    await act(async () => {
      mounted.editor.tf.select(caret([0, 0], 0));
    });
    const editable = mounted.host.querySelector("[data-slate-editor]");
    await act(async () => {
      editable?.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "/",
          code: "Slash",
          metaKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    expect(document.querySelector("[data-block-menu]")).not.toBeNull();
    expect(menuShortcutOf(menuItem("Duplicate"))).toBe("");
    expect(menuShortcutOf(menuItem("Delete"))).toBe("");
    await mounted.cleanup();
  });

  test("the grip tooltip shows the block menu shortcut, and the Add tooltip shows none", async () => {
    setPlatform(MAC);
    const mounted = await mountOverlay();
    const block = mounted.host.querySelector("[data-block-id='block-1']");
    await act(async () => {
      block?.dispatchEvent(
        new PointerEvent("pointermove", { bubbles: true, pointerType: "mouse" }),
      );
    });
    const grip = document.querySelector("[data-block-handle-grip]");
    await act(async () => {
      grip?.dispatchEvent(new PointerEvent("pointerenter", { bubbles: true }));
      grip?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });
    await act(async () => {
      if (grip instanceof HTMLElement) {
        grip.focus();
      }
    });
    const tip = document.querySelector("[data-block-handle-tooltip]");
    expect(tip?.textContent).toBe(`${BLOCK_MENU_GRIP_LABEL}⌘/`);
    expect(tip?.querySelector("[data-slot='kbd-group']")).not.toBeNull();
    await mounted.cleanup();
  });
});

describe("selection toolbar hints", () => {
  test("a mark tooltip carries its hint, and the More menu rows carry theirs", async () => {
    setPlatform(MAC);
    const mounted = await mount([paragraph("p1", "Hello world")] as EditorValue);
    await act(async () => {
      mounted.editor.tf.select(textRange([0, 0], 0, 5));
    });
    await act(async () => {
      const editable = mounted.host.querySelector("[data-slate-editor]");
      if (editable instanceof HTMLElement) {
        editable.focus();
      }
    });
    const bold = document.querySelector("[data-selection-toolbar] [aria-label='Bold']");
    if (!(bold instanceof HTMLElement)) {
      throw new Error("Missing Bold control.");
    }
    expect(bold.getAttribute("aria-keyshortcuts")).toBe("Meta+B");
    await act(async () => {
      bold.focus();
    });
    const tip = document.querySelector("[data-slot='tooltip-content']");
    expect(tip?.textContent).toBe("Bold⌘B");

    const more = document.querySelector("[data-selection-toolbar] [aria-label='More']");
    if (!(more instanceof HTMLElement)) {
      throw new Error("Missing More control.");
    }
    await act(async () => {
      more.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
      more.click();
    });
    expect(menuShortcutOf(document.querySelector("[data-more-choice='indent']"))).toBe("⌘]");
    expect(menuShortcutOf(document.querySelector("[data-more-choice='outdent']"))).toBe("⌘[");
    expect(menuShortcutOf(document.querySelector("[data-more-choice='clear']"))).toBe("⌘\\");
    expect(menuShortcutOf(document.querySelector("[data-more-choice='superscript']"))).toBe("⌘.");
    expect(menuShortcutOf(document.querySelector("[data-more-choice='keyboard']"))).toBe("");
    await mounted.cleanup();
  });
});

describe("find bar hints and keys", () => {
  test("the buttons show their keys, and the registry keys drive the bar", async () => {
    setPlatform(MAC);
    const mounted = await mount([paragraph("p1", "a a a")] as EditorValue);
    const editable = mounted.host.querySelector("[data-slate-editor]");
    if (!(editable instanceof HTMLElement)) {
      throw new Error("Missing editable.");
    }
    await act(async () => {
      editable.dispatchEvent(
        new KeyboardEvent("keydown", { key: "f", metaKey: true, bubbles: true, cancelable: true }),
      );
    });
    const input = document.querySelector("[data-find-input]");
    if (!(input instanceof HTMLInputElement)) {
      throw new Error("Missing find input.");
    }
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, "a");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const next = document.querySelector("[aria-label='Next match']");
    if (!(next instanceof HTMLElement)) {
      throw new Error("Missing Next match.");
    }
    expect(next.getAttribute("aria-keyshortcuts")).toBe("Enter");
    await act(async () => {
      next.focus();
    });
    expect(document.querySelector("[data-slot='tooltip-content']")?.textContent).toBe(
      "Next match↵",
    );

    await act(async () => {
      input.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          ...keyboardInit(EDITOR_SHORTCUTS.findNext, true),
        }),
      );
    });
    expect(findState(mounted.editor).activeIndex).toBe(1);
    await act(async () => {
      input.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          ...keyboardInit(EDITOR_SHORTCUTS.findPrevious, true),
        }),
      );
    });
    expect(findState(mounted.editor).activeIndex).toBe(0);
    await act(async () => {
      input.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          ...keyboardInit(EDITOR_SHORTCUTS.escape, true),
        }),
      );
    });
    expect(document.querySelector("[data-find-bar]")).toBeNull();
    await mounted.cleanup();
  });
});

describe("touch-only devices", () => {
  test("the shared label shows the label alone and no kbd", async () => {
    setPlatform(MAC);
    setKeyboardDevice(false);
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(
        <>
          <ShortcutLabel label="Bold" shortcut="bold" />
          <ShortcutKbd id="blockMenu" />
        </>,
      );
    });
    expect(host.textContent).toBe("Bold");
    expect(host.querySelector("kbd")).toBeNull();
    await act(async () => {
      root.unmount();
    });
    host.remove();
  });

  test("a keyboard device shows the hint with the platform's glyphs", async () => {
    setPlatform(MAC);
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(<ShortcutKbd id="blockMenu" />);
    });
    expect(host.textContent).toBe("⌘/");
    await act(async () => {
      root.unmount();
    });
    host.remove();
  });
});

describe("shortcutHints option", () => {
  // The Turn into menu and a shared label render inside the editor's Plate tree, so
  // they read the editor's option through ShortcutHintsScope.
  async function renderInEditor(shortcutHints: boolean) {
    const editor = createPlateEditor({
      plugins: createEditorPlugins(),
      value: [paragraph("p1", "Hello")] as EditorValue,
    });
    editor.setOption(editorConfigPlugin, "resolved", resolveEditorOptions({ shortcutHints }));
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(
        <Plate editor={editor}>
          <ShortcutHintsScope>
            <ShortcutLabel label="Bold" shortcut="bold" />
            <DropdownMenu open>
              <DropdownMenuContent>
                <BlockPickerGroups
                  items={blockPickerTurnItems(editor, [0])}
                  onChoose={() => undefined}
                  shortcuts
                />
              </DropdownMenuContent>
            </DropdownMenu>
          </ShortcutHintsScope>
        </Plate>,
      );
    });
    return {
      row: (id: string) => document.querySelector(`[data-block-picker-item='${id}']`),
      cleanup: async () => {
        await act(async () => {
          root.unmount();
        });
        host.remove();
      },
    };
  }

  test("on shows the Turn into hints and the label's kbd", async () => {
    setPlatform(MAC);
    const shown = await renderInEditor(true);
    expect(menuShortcutOf(shown.row("h1"))).toBe("⌘⌥1");
    expect(document.querySelector("[data-slot='kbd']")).not.toBeNull();
    await shown.cleanup();
  });

  test("off removes every hint, kbd and aria-keyshortcuts from the same menu", async () => {
    setPlatform(MAC);
    const hidden = await renderInEditor(false);
    expect(hidden.row("h1")?.textContent).toContain("Heading 1");
    expect(document.querySelector("[data-slot='dropdown-menu-shortcut']")).toBeNull();
    expect(document.querySelector("[data-slot='command-shortcut']")).toBeNull();
    expect(document.querySelector("[data-slot='kbd']")).toBeNull();
    expect(document.querySelector("[aria-keyshortcuts]")).toBeNull();
    await hidden.cleanup();
  });
});
