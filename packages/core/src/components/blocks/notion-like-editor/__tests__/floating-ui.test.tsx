import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";
import { createPlateEditor } from "platejs/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { EditorSurface } from "../components/editor/editor-surface";
import type { EditorValue } from "../lib/document/editor-value";
import { closeLinkPopover, openLinkPopover } from "../lib/plugins/editor-link";
import { createEditorPlugins } from "../lib/plugins/editor-plugins";
import { textRange } from "./test-utils";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

const editorRoot = join(import.meta.dir, "..");

// Every portaled editor surface. The prop is the shared detach behavior.
const floatingSources = [
  "components/ui/link-popover.tsx",
  "components/ui/bookmark-url-popover.tsx",
  "components/ui/paste-url-menu.tsx",
  "components/elements/link-element.tsx",
  "components/elements/mention-element.tsx",
  "components/elements/equation-element.tsx",
  "components/ui/table-controls.tsx",
  "components/elements/callout-element.tsx",
  "components/elements/toc-element.tsx",
  "components/elements/column-element.tsx",
  "components/elements/code-block-element.tsx",
  "components/ui/block-menu.tsx",
];

function isReactContainer(value: object): value is Parameters<typeof createRoot>[0] {
  return "nodeType" in value && value.nodeType === 1;
}

describe("floating ui positioning", () => {
  test("each editor popover and menu hides when its anchor detaches and keeps collision padding", () => {
    const problems: string[] = [];

    for (const path of floatingSources) {
      const text = readFileSync(join(editorRoot, path), "utf8");
      const surfaces =
        text.match(/<PopoverContent|<DropdownMenuContent|<DropdownMenuSubContent/g) ?? [];
      const hidden = text.match(/hideWhenDetached/g) ?? [];
      const padding = text.match(/collisionPadding=\{8\}/g) ?? [];
      if (surfaces.length === 0) {
        problems.push(`${path} has no floating content`);
      }
      if (hidden.length !== surfaces.length) {
        problems.push(`${path} hides ${hidden.length} of ${surfaces.length} surfaces`);
      }
      if (padding.length !== surfaces.length) {
        problems.push(`${path} pads ${padding.length} of ${surfaces.length} surfaces`);
      }
    }

    expect(problems).toEqual([]);
  });

  test("opening, scrolling, and closing the link popover writes no history", async () => {
    const value: EditorValue = [{ type: "p", id: "p", children: [{ text: "Hello world" }] }];
    const host = document.createElement("div");
    document.body.appendChild(host);
    const editor = createPlateEditor({ plugins: createEditorPlugins(), value });
    if (!isReactContainer(host)) {
      throw new Error("Missing mount node.");
    }

    let root: Root | undefined;
    await act(async () => {
      root = createRoot(host);
      root.render(
        <EditorSurface editor={editor} readOnly={false} placeholder="" className="editor" />,
      );
    });

    editor.tf.select(textRange([0, 0], 0, 5));
    const selection = editor.selection;
    const undos = editor.history.undos.length;
    const before = JSON.stringify(editor.children);
    const viewport = document.createElement("div");
    viewport.setAttribute("data-block-viewport", "");
    document.body.appendChild(viewport);

    try {
      await act(async () => {
        openLinkPopover(editor);
      });
      viewport.scrollTop = 80;
      viewport.dispatchEvent(new Event("scroll", { bubbles: true }));
      window.dispatchEvent(new Event("scroll"));
      expect(document.querySelector("[data-link-popover]")).not.toBeNull();
      expect(editor.history.undos.length).toBe(undos);
      expect(editor.selection).toEqual(selection);

      await act(async () => {
        closeLinkPopover(editor);
      });
      expect(document.querySelector("[data-link-popover]")).toBeNull();
      expect(editor.history.undos.length).toBe(undos);
      expect(editor.selection).toEqual(selection);
      expect(JSON.stringify(editor.children)).toBe(before);
    } finally {
      viewport.remove();
      await act(async () => {
        root?.unmount();
      });
      host.remove();
    }
  });
});
