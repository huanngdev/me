import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";
import { createPlateEditor } from "platejs/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import * as ts from "typescript";

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
  "components/ui/bookmark-toolbar-popover.tsx",
  "components/ui/page-link-picker.tsx",
  "components/ui/inline-equation-popover.tsx",
  "components/ui/inline-date-popover.tsx",
  "components/ui/paste-url-menu.tsx",
  "components/elements/link-element.tsx",
  "components/elements/mention-element.tsx",
  "components/elements/equation-element.tsx",
  "components/ui/table-controls.tsx",
  "components/elements/callout-element.tsx",
  "components/elements/toc-element.tsx",
  "components/elements/code-block-element.tsx",
  "components/ui/block-menu.tsx",
  "components/ui/block-color-menu.tsx",
  "components/ui/selection-toolbar.tsx",
  "components/ui/selection-toolbar-align.tsx",
  "components/ui/selection-toolbar-choice.tsx",
  "components/ui/selection-color-menu.tsx",
  "components/ui/slash-menu.tsx",
  "components/ui/emoji-suggest.tsx",
  "components/ui/find-bar.tsx",
  "components/ui/file-action-popover.tsx",
  "components/ui/video-action-popover.tsx",
  "components/ui/audio-action-popover.tsx",
  "components/ui/embed-action-popover.tsx",
  "components/ui/embed-link-popover.tsx",
];

function isReactContainer(value: object): value is Parameters<typeof createRoot>[0] {
  return "nodeType" in value && value.nodeType === 1;
}

// Counts the <PopoverContent> elements in a file that have no aria-label attribute.
function unlabeledPopovers(path: string, text: string): number {
  const file = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let unlabeled = 0;
  const visit = (node: ts.Node): void => {
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      node.tagName.getText(file) === "PopoverContent" &&
      !node.attributes.properties.some(
        (attribute) =>
          ts.isJsxAttribute(attribute) && attribute.name.getText(file) === "aria-label",
      )
    ) {
      unlabeled += 1;
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return unlabeled;
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
      const unlabeled = unlabeledPopovers(path, text);
      if (unlabeled > 0) {
        problems.push(`${path} has ${unlabeled} popover contents without aria-label`);
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
