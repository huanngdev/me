import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";
import { ElementApi, KEYS, type Descendant, type SlateEditor, type TElement } from "platejs";
import { createPlateEditor } from "platejs/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { EditorSurface } from "../components/editor/editor-surface";
import {
  deleteBlock,
  duplicateBlock,
  runEditorCommand,
  turnBlockInto,
  turnIntoParagraph,
} from "../lib/commands/editor-commands";
import { createEditorDocument } from "../lib/document/editor-document";
import { parseEditorDocument } from "../lib/document/editor-document-validate";
import type { EditorValue } from "../lib/document/editor-value";
import {
  BLOCK_MENU_GRIP_LABEL,
  BLOCK_MENU_TURNS,
  blockMenuDecisions,
  currentBlockMenuKind,
  isBlockMenuShortcut,
  keepNativeContextMenu,
  type MenuBlockView,
  type NativeMenuProbe,
} from "../lib/features/editor-block-menu";
import { createEditorPlugins } from "../lib/plugins/editor-plugins";
import { caret, createEditor, expectOk } from "./test-utils";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

const editorRoot = join(import.meta.dir, "..");

function textOf(node: Descendant): string {
  if (ElementApi.isElement(node)) {
    return node.children.map((child) => textOf(child)).join("");
  }
  return "text" in node && typeof node.text === "string" ? node.text : "";
}

function documentText(editor: SlateEditor): string {
  return editor.children.map((node) => textOf(node)).join("");
}

function collectIds(nodes: readonly Descendant[]): string[] {
  const ids: string[] = [];
  const visit = (node: Descendant): void => {
    if (!ElementApi.isElement(node)) {
      return;
    }
    if (typeof node.id === "string") {
      ids.push(node.id);
    }
    for (const child of node.children) {
      visit(child);
    }
  };
  for (const node of nodes) {
    visit(node);
  }
  return ids;
}

function expectUniqueIds(editor: SlateEditor): void {
  const ids = collectIds(editor.children);
  expect(new Set(ids).size).toBe(ids.length);
}

function expectSaved(editor: SlateEditor): void {
  const content = editor.children;
  expect(Array.isArray(content)).toBe(true);
  expectOk(parseEditorDocument(createEditorDocument("doc", content as EditorValue)));
}

function paragraph(
  id: string,
  text: string,
  children?: Descendant[],
  attrs?: Record<string, string | number | boolean>,
): TElement {
  return {
    type: KEYS.p,
    id,
    ...attrs,
    children: children ?? [{ text }],
  };
}

function view(partial: Partial<MenuBlockView> & Pick<MenuBlockView, "type">): MenuBlockView {
  return {
    listStyleType: undefined,
    rich: false,
    children: [],
    parentType: null,
    index: 0,
    toggleAncestors: 0,
    ...partial,
  };
}

function richParagraph(): TElement {
  return {
    type: KEYS.p,
    id: "p1",
    children: [
      { text: "Hello ", bold: true },
      {
        type: KEYS.link,
        id: "lnk",
        url: "https://example.com",
        children: [{ text: "link" }],
      },
      { text: " end", italic: true },
      {
        type: KEYS.mention,
        id: "men",
        entityType: "person",
        entityId: "person-ada",
        label: "Ada",
        children: [{ text: "" }],
      },
      { text: "" },
    ],
  };
}

function quoteWithList(): TElement {
  return {
    type: KEYS.blockquote,
    id: "quote-1",
    children: [
      paragraph("item-1", "Quoted item", undefined, { listStyleType: "disc", indent: 1 }),
      paragraph("after-1", "After"),
    ],
  };
}

function nestedToggle(): TElement {
  return {
    type: KEYS.toggle,
    id: "outer",
    children: [
      paragraph("outer-label", "Outer"),
      {
        type: KEYS.toggle,
        id: "inner",
        children: [paragraph("inner-label", "Inner"), paragraph("inner-body", "Body")],
      },
    ],
  };
}

function tableBlock(): TElement {
  return {
    type: KEYS.table,
    id: "table-1",
    children: [
      {
        type: KEYS.tr,
        id: "row-1",
        children: [
          {
            type: KEYS.td,
            id: "cell-1",
            children: [paragraph("cell-p", "Cell")],
          },
        ],
      },
    ],
  };
}

function codeBlock(): TElement {
  return {
    type: KEYS.codeBlock,
    id: "code-1",
    children: [
      { type: KEYS.codeLine, id: "line-1", children: [{ text: "first" }] },
      { type: KEYS.codeLine, id: "line-2", children: [{ text: "second" }] },
    ],
  };
}

const nativeClear: NativeMenuProbe = {
  selectionCollapsed: true,
  pointInsideSelection: false,
  insideLink: false,
  insideTableCell: false,
  insideCodeText: false,
  insideControl: false,
  hasBlockTarget: true,
};

describe("block menu conversion matrix", () => {
  test("structural blocks are not offered a turn into submenu", () => {
    for (const type of [
      KEYS.table,
      KEYS.columnGroup,
      KEYS.hr,
      "bookmark",
      KEYS.equation,
      KEYS.toc,
      "synced_ref",
    ]) {
      expect(blockMenuDecisions(view({ type }))).toBeNull();
    }
  });

  test("code turns into text only", () => {
    const decisions = blockMenuDecisions(view({ type: KEYS.codeBlock }));
    expect(decisions).not.toBeNull();
    for (const decision of decisions ?? []) {
      expect(decision.allowed).toBe(decision.kind === "paragraph");
      if (!decision.allowed) {
        expect(decision.reason).toBe("Code turns into text.");
      }
    }
  });

  test("a paragraph inside a quote cannot become a block the quote cannot hold", () => {
    const decisions = blockMenuDecisions(view({ type: KEYS.p, parentType: KEYS.blockquote }));
    expect(currentBlockMenuKind(view({ type: KEYS.p }))).toBe("paragraph");
    const allowed = new Set(
      (decisions ?? []).filter((decision) => decision.allowed).map((decision) => decision.kind),
    );
    expect(allowed.has("paragraph")).toBe(true);
    expect(allowed.has("bulleted")).toBe(true);
    expect(allowed.has("numbered")).toBe(true);
    expect(allowed.has("todo")).toBe(true);
    for (const kind of ["h1", "h2", "h3", "toggle", "quote", "callout", "code"] as const) {
      expect(allowed.has(kind)).toBe(false);
    }
  });

  test("a fourth toggle level is not offered", () => {
    const decisions = blockMenuDecisions(view({ type: KEYS.p, toggleAncestors: 3 }));
    const toggle = decisions?.find((decision) => decision.kind === "toggle");
    expect(toggle?.allowed).toBe(false);
    expect(toggle?.reason).toBe("Toggles can only nest three levels deep.");
  });

  test("rich text cannot turn into code", () => {
    const decisions = blockMenuDecisions(view({ type: KEYS.p, rich: true }));
    expect(decisions?.find((decision) => decision.kind === "code")?.allowed).toBe(false);
  });

  test("every allowed turn of a rich paragraph keeps the text, marks, and block id", () => {
    const source = richParagraph();
    const decisions = blockMenuDecisions(view({ type: KEYS.p, rich: true }));
    expect(decisions).not.toBeNull();
    for (const decision of decisions ?? []) {
      if (!decision.allowed || decision.kind === "paragraph") {
        continue;
      }
      const editor = createEditor([structuredClone(source), paragraph("other", "Stay")]);
      const before = documentText(editor);
      editor.tf.select(caret([1, 0], 0));
      const undos = editor.history.undos.length;
      const ran = runEditorCommand(editor, turnBlockInto, { path: [0], kind: decision.kind });
      expect(ran).toBe(true);
      expect(editor.history.undos.length - undos).toBe(1);
      expect(documentText(editor)).toBe(before);
      expect(collectIds(editor.children)).toContain("p1");
      expect(collectIds(editor.children)).toContain("lnk");
      expect(collectIds(editor.children)).toContain("men");
      expect(JSON.stringify(editor.children)).toContain('"bold":true');
      expect(JSON.stringify(editor.children)).toContain("https://example.com");
      expect(JSON.stringify(editor.children)).toContain("Ada");
      expect(textOf(editor.children[1])).toBe("Stay");
      expect(editor.children[1]?.type).toBe(KEYS.p);
      expectSaved(editor);
      editor.tf.undo();
      expect(JSON.stringify(editor.children[0])).toBe(JSON.stringify(source));
    }
  });

  test("code becomes one paragraph per line and keeps the code block id", () => {
    const editor = createEditor([codeBlock(), paragraph("tail", "Tail")]);
    const before = documentText(editor);
    runEditorCommand(editor, turnBlockInto, { path: [0], kind: "paragraph" });
    expect(documentText(editor)).toBe(before);
    expect(editor.children[0]?.id).toBe("code-1");
    expect(editor.children[0]?.type).toBe(KEYS.p);
    expect(textOf(editor.children[0] ?? { text: "" })).toBe("first");
    expect(textOf(editor.children[1] ?? { text: "" })).toBe("second");
    expect(textOf(editor.children[2] ?? { text: "" })).toBe("Tail");
    expectUniqueIds(editor);
    expectSaved(editor);
    editor.tf.undo();
    expect(editor.children[0]?.type).toBe(KEYS.codeBlock);
    expect(documentText(editor)).toBe(before);
  });

  test("plain text can turn into code and back without losing the lines", () => {
    const editor = createEditor([paragraph("p1", "alpha kept")]);
    const before = documentText(editor);
    runEditorCommand(editor, turnBlockInto, { path: [0], kind: "code" });
    expect(editor.children[0]?.type).toBe(KEYS.codeBlock);
    expect(editor.children[0]?.id).toBe("p1");
    expect(documentText(editor)).toBe(before);
    expectSaved(editor);
    runEditorCommand(editor, turnBlockInto, { path: [0], kind: "paragraph" });
    expect(documentText(editor)).toBe(before);
    expect(editor.children[0]?.id).toBe("p1");
    expectSaved(editor);
  });

  test("a quote keeps its list when it becomes a callout, and lifts it when it becomes text", () => {
    const callout = createEditor([quoteWithList()]);
    const before = documentText(callout);
    runEditorCommand(callout, turnBlockInto, { path: [0], kind: "callout" });
    expect(callout.children[0]?.type).toBe(KEYS.callout);
    expect(callout.children[0]?.id).toBe("quote-1");
    expect(documentText(callout)).toBe(before);
    expect(JSON.stringify(callout.children)).toContain('"listStyleType":"disc"');
    expect(collectIds(callout.children)).toContain("item-1");
    expectSaved(callout);

    const lifted = createEditor([quoteWithList()]);
    const liftedBefore = documentText(lifted);
    runEditorCommand(lifted, turnBlockInto, { path: [0], kind: "paragraph" });
    expect(documentText(lifted)).toBe(liftedBefore);
    expect(JSON.stringify(lifted.children)).toContain('"listStyleType":"disc"');
    expect(collectIds(lifted.children)).toContain("item-1");
    expect(collectIds(lifted.children)).toContain("quote-1");
    expectSaved(lifted);
  });

  test("a toggle keeps its children when it becomes another container", () => {
    const editor = createEditor([
      {
        type: KEYS.toggle,
        id: "tog",
        children: [
          { type: KEYS.h1, id: "label", children: [{ text: "Title", bold: true }] },
          paragraph("body", "Inside"),
        ],
      },
    ]);
    const before = documentText(editor);
    const quoteDecision = blockMenuDecisions(
      view({
        type: KEYS.toggle,
        children: [
          { type: KEYS.h1, rich: true },
          { type: KEYS.p, rich: false },
        ],
      }),
    )?.find((decision) => decision.kind === "quote");
    expect(quoteDecision?.allowed).toBe(true);
    runEditorCommand(editor, turnBlockInto, { path: [0], kind: "quote" });
    expect(editor.children[0]?.type).toBe(KEYS.blockquote);
    expect(editor.children[0]?.id).toBe("tog");
    expect(documentText(editor)).toBe(before);
    expect(collectIds(editor.children)).toContain("label");
    expect(collectIds(editor.children)).toContain("body");
    expect(JSON.stringify(editor.children)).toContain('"bold":true');
    expectSaved(editor);

    const nested = createEditor([nestedToggle()]);
    const denied = blockMenuDecisions(
      view({
        type: KEYS.toggle,
        children: [
          { type: KEYS.p, rich: false },
          { type: KEYS.toggle, rich: false },
        ],
      }),
    )?.find((decision) => decision.kind === "quote");
    expect(denied?.allowed).toBe(false);
    expect(denied?.reason).toBe("A quote cannot hold a toggle.");
    const unchanged = JSON.stringify(nested.children);
    runEditorCommand(nested, turnBlockInto, { path: [0], kind: "quote" });
    expect(JSON.stringify(nested.children)).toBe(unchanged);
  });

  test("turning a container into text does not drop its text", () => {
    const editor = createEditor([nestedToggle(), paragraph("tail", "Tail")]);
    const before = documentText(editor);
    runEditorCommand(editor, turnBlockInto, { path: [0], kind: "paragraph" });
    expect(documentText(editor)).toBe(before);
    expect(collectIds(editor.children)).toContain("outer");
    expect(collectIds(editor.children)).toContain("inner");
    expect(collectIds(editor.children)).toContain("inner-body");
    expectSaved(editor);
  });

  test("the same kind is a no-op", () => {
    const editor = createEditor([paragraph("p1", "Hello")]);
    const before = JSON.stringify(editor.children);
    const undos = editor.history.undos.length;
    expect(runEditorCommand(editor, turnBlockInto, { path: [0], kind: "paragraph" })).toBe(true);
    expect(JSON.stringify(editor.children)).toBe(before);
    expect(editor.history.undos.length).toBe(undos);
  });
});

describe("block menu duplicate and delete", () => {
  test("duplicates a nested toggle and a table with new ids in one undo", () => {
    const editor = createEditor([nestedToggle(), tableBlock()]);
    const before = JSON.stringify(editor.children);
    const beforeIds = collectIds(editor.children);

    runEditorCommand(editor, duplicateBlock, { path: [0] });
    expect(editor.history.undos.length).toBe(1);
    expect(documentText(editor)).toBe("OuterInnerBodyOuterInnerBodyCell");
    expectUniqueIds(editor);
    const afterToggle = collectIds(editor.children);
    for (const id of beforeIds) {
      expect(afterToggle.filter((found) => found === id).length).toBe(1);
    }
    expect(editor.children).toHaveLength(3);
    expectSaved(editor);
    editor.tf.undo();
    expect(JSON.stringify(editor.children)).toBe(before);

    runEditorCommand(editor, duplicateBlock, { path: [1] });
    expect(editor.history.undos.length).toBe(1);
    expectUniqueIds(editor);
    expect(documentText(editor)).toContain("CellCell");
    expect(editor.children[2]?.type).toBe(KEYS.table);
    expect(editor.children[2]?.id).not.toBe("table-1");
    expectSaved(editor);
    editor.tf.undo();
    expect(JSON.stringify(editor.children)).toBe(before);
  });

  test("deleting the only block leaves one empty paragraph and undo restores it", () => {
    const editor = createEditor([paragraph("only", "Gone")]);
    const before = JSON.stringify(editor.children);
    runEditorCommand(editor, deleteBlock, { path: [0] });
    expect(editor.history.undos.length).toBe(1);
    expect(editor.children).toHaveLength(1);
    expect(editor.children[0]?.type).toBe(KEYS.p);
    expect(textOf(editor.children[0] ?? { text: "x" })).toBe("");
    expect(editor.children[0]?.id).not.toBe("only");
    expectSaved(editor);
    editor.tf.undo();
    expect(JSON.stringify(editor.children)).toBe(before);
    expect(editor.history.undos.length).toBe(0);
  });

  test("delete and undo restore a multi-block document exactly", () => {
    const editor = createEditor([paragraph("a", "A"), nestedToggle(), paragraph("b", "B")]);
    const before = JSON.stringify(editor.children);
    runEditorCommand(editor, deleteBlock, { path: [1] });
    expect(documentText(editor)).toBe("AB");
    expect(editor.children).toHaveLength(2);
    expectSaved(editor);
    editor.tf.undo();
    expect(JSON.stringify(editor.children)).toBe(before);
  });

  test("turn into paragraph is registered like the other turn commands", () => {
    expect(turnIntoParagraph.id).toBe("block.turn-into.paragraph");
    expect(turnIntoParagraph.label).toBe("Text");
    expect(turnIntoParagraph.group).toBe("turn-into");
    expect(BLOCK_MENU_TURNS.map((item) => item.commandId)).toContain("block.turn-into.paragraph");
  });
});

describe("block menu shortcut and native context menu", () => {
  test("Mod+/ is free of the editor shortcut list", () => {
    const source = readFileSync(join(editorRoot, "lib/plugins/editor-plugins.ts"), "utf8");
    for (const match of source.matchAll(/keys:\s*\[([\s\S]*?)\]/g)) {
      const body = match[1] ?? "";
      expect(body.includes('"/"') || body.includes("Slash")).toBe(false);
    }
    expect(
      isBlockMenuShortcut({
        key: "/",
        code: "Slash",
        metaKey: true,
        ctrlKey: false,
        altKey: false,
        shiftKey: false,
      }),
    ).toBe(true);
    expect(
      isBlockMenuShortcut({
        key: "/",
        code: "Slash",
        metaKey: false,
        ctrlKey: true,
        altKey: false,
        shiftKey: false,
      }),
    ).toBe(true);
    expect(
      isBlockMenuShortcut({
        key: "/",
        code: "Slash",
        metaKey: true,
        ctrlKey: false,
        altKey: false,
        shiftKey: true,
      }),
    ).toBe(false);
    expect(
      isBlockMenuShortcut({
        key: "/",
        code: "Slash",
        metaKey: true,
        ctrlKey: false,
        altKey: true,
        shiftKey: false,
      }),
    ).toBe(false);
    expect(
      isBlockMenuShortcut({
        key: "/",
        code: "Slash",
        metaKey: true,
        ctrlKey: true,
        altKey: false,
        shiftKey: false,
      }),
    ).toBe(false);
    expect(
      isBlockMenuShortcut({
        key: "/",
        code: "Slash",
        metaKey: false,
        ctrlKey: false,
        altKey: false,
        shiftKey: false,
      }),
    ).toBe(false);
  });

  test("right-click keeps the native menu for a selection, a link, a cell, and code text", () => {
    expect(keepNativeContextMenu(nativeClear)).toBe(false);
    expect(
      keepNativeContextMenu({
        ...nativeClear,
        selectionCollapsed: false,
        pointInsideSelection: true,
      }),
    ).toBe(true);
    expect(
      keepNativeContextMenu({
        ...nativeClear,
        selectionCollapsed: false,
        pointInsideSelection: false,
      }),
    ).toBe(false);
    expect(keepNativeContextMenu({ ...nativeClear, insideLink: true })).toBe(true);
    expect(keepNativeContextMenu({ ...nativeClear, insideTableCell: true })).toBe(true);
    expect(keepNativeContextMenu({ ...nativeClear, insideCodeText: true })).toBe(true);
    expect(keepNativeContextMenu({ ...nativeClear, insideControl: true })).toBe(true);
    expect(keepNativeContextMenu({ ...nativeClear, hasBlockTarget: false })).toBe(true);
  });
});

describe("block menu overlay", () => {
  function isReactContainer(value: object): value is Parameters<typeof createRoot>[0] {
    return "nodeType" in value && value.nodeType === 1;
  }

  function domRect(x: number, y: number, width: number, height: number): DOMRect {
    const rect = {
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
    };
    return rect as DOMRect;
  }

  async function mount(readOnly: boolean): Promise<{
    host: HTMLDivElement;
    editor: ReturnType<typeof createPlateEditor>;
    root: Root;
    restore: () => void;
  }> {
    const previousWidth = window.innerWidth;
    const previousHeight = window.innerHeight;
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
      value: [paragraph("block-1", "Hello"), paragraph("block-2", "There")] as EditorValue,
    });
    if (!isReactContainer(host)) {
      throw new Error("Missing mount node.");
    }
    const root = createRoot(host);
    await act(async () => {
      root.render(
        <EditorSurface editor={editor} readOnly={readOnly} placeholder="" className="editor" />,
      );
    });
    return {
      host,
      editor,
      root,
      restore: () => {
        HTMLElement.prototype.getBoundingClientRect = original;
        Object.defineProperty(window, "innerWidth", { configurable: true, value: previousWidth });
        Object.defineProperty(window, "innerHeight", { configurable: true, value: previousHeight });
      },
    };
  }

  test("read-only renders no handle and no menu", async () => {
    const mounted = await mount(true);
    try {
      expect(document.querySelector("[data-block-handle]")).toBeNull();
      expect(document.querySelector("[data-block-menu]")).toBeNull();
      const block = mounted.host.querySelector("[data-block-id='block-1']");
      await act(async () => {
        block?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
      });
      expect(document.querySelector("[data-block-menu]")).toBeNull();
    } finally {
      await act(async () => {
        mounted.root.unmount();
      });
      mounted.host.remove();
      mounted.restore();
    }
  });

  test("the grip opens the menu without writing history", async () => {
    const mounted = await mount(false);
    try {
      const block = mounted.host.querySelector("[data-block-id='block-1']");
      await act(async () => {
        block?.dispatchEvent(
          new PointerEvent("pointermove", { bubbles: true, pointerType: "mouse" }),
        );
      });
      const grip = document.querySelector("[data-block-handle-grip]");
      expect(grip?.getAttribute("aria-label")).toBe(BLOCK_MENU_GRIP_LABEL);
      const undos = mounted.editor.history.undos.length;
      const selection = mounted.editor.selection;
      await act(async () => {
        grip?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      const menu = document.querySelector("[data-block-menu]");
      expect(menu).not.toBeNull();
      expect(menu?.textContent).toContain("Turn into");
      expect(menu?.textContent).toContain("Duplicate");
      expect(menu?.textContent).toContain("Delete");
      expect(mounted.editor.history.undos.length).toBe(undos);
      await act(async () => {
        menu?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      });
      expect(mounted.editor.history.undos.length).toBe(undos);
      expect(mounted.editor.selection).toEqual(selection);
    } finally {
      await act(async () => {
        mounted.root.unmount();
      });
      mounted.host.remove();
      mounted.restore();
    }
  });

  test("Mod+/ opens the menu for the caret block", async () => {
    const mounted = await mount(false);
    try {
      await act(async () => {
        mounted.editor.tf.select(caret([1, 0], 1));
      });
      const editable = mounted.host.querySelector("[data-slate-editor]");
      const undos = mounted.editor.history.undos.length;
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
        await new Promise((resolve) => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => resolve(undefined));
          });
        });
      });
      const menu = document.querySelector("[data-block-menu]");
      expect(menu?.getAttribute("data-block-menu-for")).toBe("block-2");
      expect(mounted.editor.history.undos.length).toBe(undos);
    } finally {
      await act(async () => {
        mounted.root.unmount();
      });
      mounted.host.remove();
      mounted.restore();
    }
  });
});
