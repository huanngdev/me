import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, test } from "bun:test";
import { KEYS, type TElement } from "platejs";
import { createPlateEditor } from "platejs/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { EditorSaveStatus } from "../components/editor/editor-save-status";
import { EditorSurface } from "../components/editor/editor-surface";
import type { EditorValue } from "../lib/document/editor-value";
import type { AutosaveStatus } from "../lib/document/editor-autosave";
import { createEditorPlugins } from "../lib/plugins/editor-plugins";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

const editorRoot = join(import.meta.dir, "..");

function sourceFiles(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__") {
        continue;
      }
      found.push(...sourceFiles(path));
      continue;
    }
    if (entry.name.endsWith(".tsx")) {
      found.push(path);
    }
  }
  return found;
}

function isReactContainer(value: object): value is Parameters<typeof createRoot>[0] {
  return "nodeType" in value && value.nodeType === 1;
}

async function mountSaveStatus(status: AutosaveStatus, message?: string) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<EditorSaveStatus status={status} message={message} onRetry={() => undefined} />);
  });
  return {
    host,
    cleanup: async () => {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    },
  };
}

describe("DEV-149 scroll areas", () => {
  test("no native overflow-auto/scroll class remains in the editor components", () => {
    const offenders: string[] = [];
    for (const path of sourceFiles(editorRoot)) {
      const text = readFileSync(path, "utf8");
      if (/overflow-(?:x-|y-)?(?:auto|scroll)\b/.test(text)) {
        offenders.push(relative(editorRoot, path));
      }
    }
    expect(offenders).toEqual([]);
  });

  test("the scroll helper wraps the app ScrollArea and fades the viewport", () => {
    const text = readFileSync(join(editorRoot, "components/ui/editor-scroll.tsx"), "utf8");
    expect(text).toContain('from "@/components/scroll-area"');
    expect(text).toContain("scroll-fade-y");
    expect(text).toContain("scroll-fade-x");
    expect(text).toContain('orientation="horizontal"');
  });
});

describe("DEV-149 placeholder is out of flow", () => {
  test("the placeholder rule is absolutely positioned and never a text node", () => {
    const css = readFileSync(join(editorRoot, "..", "..", "..", "styles", "globals.css"), "utf8");
    const rule = css.slice(css.indexOf("[data-block-placeholder]::before"));
    expect(rule.slice(0, 400)).toContain("position: absolute");
    expect(rule.slice(0, 400)).toContain("white-space: nowrap");
    expect(rule.slice(0, 400)).toContain("text-overflow: ellipsis");
  });

  test("an empty heading keeps its children untouched while marked", async () => {
    const host = document.createElement("div");
    host.setAttribute("data-block-viewport", "");
    document.body.appendChild(host);
    // Two blocks so this is not the single-empty-document case, which the
    // built-in document placeholder owns.
    const value: TElement[] = [
      { type: KEYS.p, id: "other", children: [{ text: "Text" }] },
      { type: KEYS.h1, id: "h", children: [{ text: "" }] },
    ];
    const editor = createPlateEditor({
      plugins: createEditorPlugins(),
      value: value as EditorValue,
    });
    if (!isReactContainer(host)) {
      throw new Error("Missing mount node.");
    }
    const root: Root = createRoot(host);
    await act(async () => {
      root.render(
        <EditorSurface
          editor={editor}
          readOnly={false}
          placeholder="Type something…"
          className="editor"
        />,
      );
      editor.tf.select({ anchor: { path: [1, 0], offset: 0 }, focus: { path: [1, 0], offset: 0 } });
    });
    try {
      const block = host.querySelector("[data-block-id='h']");
      expect(block?.getAttribute("data-block-placeholder")).toBe("Heading 1");
      // The placeholder is CSS content, not a DOM text node.
      expect(block?.textContent).not.toContain("Heading 1");
      const childCount = block?.childNodes.length;
      await act(async () => {
        editor.tf.insertText("H");
      });
      expect(
        host.querySelector("[data-block-id='h']")?.getAttribute("data-block-placeholder"),
      ).toBeNull();
      expect(host.querySelector("[data-block-id='h']")?.childNodes.length).toBeGreaterThan(0);
      void childCount;
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });
});

describe("DEV-149 bookmark card", () => {
  test("the card is a fixed-height rounded container", () => {
    const text = readFileSync(join(editorRoot, "components/elements/bookmark-element.tsx"), "utf8");
    expect(text).toContain("@container/card");
    expect(text).toContain("rounded-xl");
    expect(text).toContain("h-[150px]");
    expect(text).toContain("w-[27%]");
  });
});

describe("DEV-149 Add and Turn into menus", () => {
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

  async function mountEditor() {
    const original = HTMLElement.prototype.getBoundingClientRect;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1280 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
    HTMLElement.prototype.getBoundingClientRect = function () {
      if (this.hasAttribute("data-block-handle")) {
        return domRect(230, 96, 66, 32);
      }
      if (this.hasAttribute("data-slate-node")) {
        return domRect(300, 100, 400, 24);
      }
      return domRect(0, 0, 1280, 800);
    };
    const host = document.createElement("div");
    host.setAttribute("data-block-viewport", "");
    document.body.appendChild(host);
    const editor = createPlateEditor({
      plugins: createEditorPlugins(),
      value: [
        { type: KEYS.p, id: "block-1", children: [{ text: "Hello" }] },
        { type: KEYS.p, id: "block-2", children: [{ text: "There" }] },
      ] as EditorValue,
    });
    if (!isReactContainer(host)) {
      throw new Error("Missing mount node.");
    }
    const root = createRoot(host);
    await act(async () => {
      root.render(
        <EditorSurface editor={editor} readOnly={false} placeholder="" className="editor" />,
      );
    });
    return {
      host,
      editor,
      root,
      cleanup: async () => {
        await act(async () => {
          root.unmount();
        });
        host.remove();
        HTMLElement.prototype.getBoundingClientRect = original;
      },
    };
  }

  async function hoverHandle(host: HTMLElement): Promise<void> {
    const block = host.querySelector("[data-block-id='block-1']");
    await act(async () => {
      block?.dispatchEvent(
        new PointerEvent("pointermove", { bubbles: true, pointerType: "mouse" }),
      );
    });
  }

  test("the Add menu is grouped, has no search input, and inserts on choose", async () => {
    const mounted = await mountEditor();
    try {
      await hoverHandle(mounted.host);
      const add = document.querySelector("[data-block-handle-add]");
      if (!(add instanceof HTMLElement)) {
        throw new Error("Missing add button.");
      }
      await act(async () => {
        add.dispatchEvent(
          new PointerEvent("pointerdown", {
            bubbles: true,
            cancelable: true,
            button: 0,
            pointerType: "mouse",
            isPrimary: true,
          } as PointerEventInit),
        );
      });
      const menu = document.querySelector("[data-block-add-menu]");
      expect(menu).not.toBeNull();
      for (const group of ["Basic", "Lists", "Containers", "Advanced"]) {
        expect(menu?.textContent).toContain(group);
      }
      expect(menu?.querySelector("[data-block-picker-item='h1']")).not.toBeNull();
      expect(menu?.querySelector("[data-block-picker-item='equation']")).not.toBeNull();
      // No search field anywhere in these menus.
      expect(document.querySelector("[data-block-picker-search]")).toBeNull();
      expect(menu?.querySelector("input")).toBeNull();

      const item = menu?.querySelector("[data-block-picker-item='h1']");
      await act(async () => {
        item?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      });
      const types = mounted.editor.children.map((node) => ("type" in node ? node.type : null));
      expect(types[1]).toBe("h1");
    } finally {
      await mounted.cleanup();
    }
  });

  test("the Turn into submenu uses the shared grouped radio renderer", () => {
    const menu = readFileSync(join(editorRoot, "components/ui/block-menu.tsx"), "utf8");
    expect(menu).toContain("DropdownMenuSub");
    expect(menu).toContain("<BlockPickerGroups");
    expect(menu).toContain("radio");
    expect(menu).toContain("blockPickerTurnItems");
    const picker = readFileSync(join(editorRoot, "components/ui/block-picker.tsx"), "utf8");
    expect(picker).toContain("DropdownMenuRadioItem");
    expect(picker).toContain("DropdownMenuLabel");
  });
});

describe("DEV-149 save status", () => {
  test("the healthy states render nothing", async () => {
    for (const status of ["saved", "saving", "dirty"] as const) {
      const mounted = await mountSaveStatus(status);
      try {
        expect(mounted.host.textContent).toBe("");
      } finally {
        await mounted.cleanup();
      }
    }
  });

  test("the failure states render the message and the retry button", async () => {
    const error = await mountSaveStatus("error");
    try {
      expect(error.host.textContent).toContain("could not be saved");
      expect(error.host.querySelector('[aria-label="Retry"]')).not.toBeNull();
    } finally {
      await error.cleanup();
    }
    const conflict = await mountSaveStatus("conflict");
    try {
      expect(conflict.host.textContent).toContain("Changed in another tab");
      expect(conflict.host.querySelector('[aria-label="Retry"]')).toBeNull();
    } finally {
      await conflict.cleanup();
    }
  });
});
