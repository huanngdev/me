import { describe, expect, test } from "bun:test";
import { type SlateEditor, type TElement } from "platejs";
import { Plate, PlateContent, createPlateEditor } from "platejs/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";

import { getBlockType, runEditorCommand, turnIntoToggle } from "./editor-commands";
import { createEditorDocument } from "./editor-document";
import { allowedChildTypes, firstChildType, maxNesting } from "./editor-document-schema";
import { parseEditorDocument } from "./editor-document-validate";
import { createEditorPlugins } from "./editor-plugins";
import { EditorSurface } from "./editor-surface";
import { readToggleOpenIds, toggleOpen } from "./editor-toggle";
import type { EditorValue } from "./editor-value";
import { TOGGLE_HIDDEN_CONTENT_CLASS } from "./toggle-element";
import {
  caret,
  createEditor,
  deserializeHtmlInDom,
  expectOk,
  expectUnsupported,
  field,
  isRecord,
} from "./test-utils";

function paragraph(
  text: string,
  id: string,
  extra: { indent?: number; listStyleType?: string; checked?: boolean } = {},
): TElement {
  return { type: "p", id, ...extra, children: [{ text }] };
}

function toggle(id: string, children: TElement[], extra: Record<string, unknown> = {}): TElement {
  return { type: "toggle", id, ...extra, children };
}

function quote(id: string, children: TElement[]): TElement {
  return { type: "blockquote", id, children };
}

function callout(id: string, children: TElement[]): TElement {
  return { type: "callout", id, children };
}

function childrenOf(node: unknown): unknown[] {
  if (!isRecord(node) || !Array.isArray(node.children)) {
    return [];
  }

  return node.children;
}

function nodeText(node: unknown): string {
  if (!isRecord(node)) {
    return "";
  }

  if (typeof node.text === "string" && !("children" in node)) {
    return node.text;
  }

  return childrenOf(node)
    .map((child) => nodeText(child))
    .join("");
}

function typesOf(editor: SlateEditor): string[] {
  return editor.children.map((block) => block.type);
}

function childIds(node: unknown): string[] {
  return childrenOf(node).map((child) => {
    const id = field(child, "id");
    return typeof id === "string" ? id : "";
  });
}

function childTypes(node: unknown): string[] {
  return childrenOf(node).map((child) => {
    const type = field(child, "type");
    return typeof type === "string" ? type : "";
  });
}

function childTexts(node: unknown): string[] {
  return childrenOf(node).map((child) => nodeText(child));
}

function toggleId(editor: SlateEditor, index = 0): string {
  const id = field(editor.children[index], "id");
  if (typeof id !== "string" || id.length === 0) {
    throw new Error("Missing toggle id.");
  }

  return id;
}

function maxToggleDepth(node: unknown, above = 0): number {
  const depth = isRecord(node) && node.type === "toggle" ? above + 1 : above;
  let max = depth;
  for (const child of childrenOf(node)) {
    max = Math.max(max, maxToggleDepth(child, depth));
  }

  return max;
}

function renderToggle(value: EditorValue, readOnly = false): string {
  const editor = createPlateEditor({
    plugins: createEditorPlugins(),
    value,
  });

  return renderToStaticMarkup(
    <Plate editor={editor} readOnly={readOnly}>
      <PlateContent />
    </Plate>,
  );
}

function pasteHtml(html: string): SlateEditor {
  const editor = createEditor();
  editor.tf.select(caret([0, 0], 0));
  editor.tf.insertFragment(deserializeHtmlInDom(editor, html));
  return editor;
}

function isReactContainer(value: object): value is Parameters<typeof createRoot>[0] {
  return "nodeType" in value && value.nodeType === 1;
}

function isClickable(value: unknown): value is {
  dispatchEvent: (event: Event) => boolean;
  hasAttribute: (name: string) => boolean;
  getAttribute: (name: string) => string | null;
  ownerDocument: {
    defaultView: {
      MouseEvent: new (type: string, init?: MouseEventInit) => MouseEvent;
    } | null;
  };
} {
  return (
    isRecord(value) &&
    typeof value.dispatchEvent === "function" &&
    typeof value.hasAttribute === "function" &&
    typeof value.getAttribute === "function" &&
    isRecord(value.ownerDocument) &&
    isRecord(value.ownerDocument.defaultView) &&
    typeof value.ownerDocument.defaultView.MouseEvent === "function"
  );
}

function stubAnimationFrame(): () => void {
  const previousFrame = Reflect.get(globalThis, "requestAnimationFrame");
  const previousCancel = Reflect.get(globalThis, "cancelAnimationFrame");
  const hadAct = Object.hasOwn(globalThis, "IS_REACT_ACT_ENVIRONMENT");
  const previousAct = hadAct ? Reflect.get(globalThis, "IS_REACT_ACT_ENVIRONMENT") : undefined;

  Reflect.set(globalThis, "requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  Reflect.set(globalThis, "cancelAnimationFrame", () => {});
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

  return () => {
    Reflect.set(globalThis, "requestAnimationFrame", previousFrame);
    Reflect.set(globalThis, "cancelAnimationFrame", previousCancel);
    if (hadAct) {
      Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", previousAct);
      return;
    }
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT");
  };
}

async function mountToggle(value: EditorValue, readOnly = false) {
  const restoreFrame = stubAnimationFrame();
  const before = new Set(Array.from(document.body.childNodes));
  const host = document.createElement("div");
  document.body.appendChild(host);
  const editor = createPlateEditor({
    plugins: createEditorPlugins(),
    value,
  });
  let root: Root | undefined;
  if (!isReactContainer(host)) {
    throw new Error("Missing mount node.");
  }

  await act(async () => {
    root = createRoot(host);
    root.render(
      <EditorSurface editor={editor} readOnly={readOnly} placeholder="" className="editor" />,
    );
  });

  return {
    editor,
    cleanup: async () => {
      await act(async () => {
        root?.unmount();
      });
      for (const node of Array.from(document.body.childNodes)) {
        if (!before.has(node)) {
          node.remove();
        }
      }
      restoreFrame();
    },
  };
}

function storedToggle(): TElement {
  return toggle("toggle-1", [paragraph("Hello", "para-1"), paragraph("Body", "para-2")]);
}

describe("toggle schema", () => {
  test("childTypes, the label type, and the depth cap are the toggle rule", () => {
    expect(allowedChildTypes("toggle")).toEqual([
      "p",
      "toggle",
      "blockquote",
      "callout",
      "hr",
      "img",
      "video",
      "code_block",
      "table",
    ]);
    expect(firstChildType("toggle")).toBe("p");
    expect(maxNesting("toggle")).toBe(3);
    expect(firstChildType("blockquote")).toBeUndefined();
    expect(maxNesting("callout")).toBeUndefined();
  });

  test("nested toggles to depth 3, a list, and a quote round-trip", () => {
    const content = [
      toggle("toggle-1", [
        paragraph("One", "para-1"),
        paragraph("Item", "para-2", { indent: 1, listStyleType: "disc" }),
        quote("quote-1", [paragraph("Said", "para-3")]),
        toggle("toggle-2", [
          paragraph("Two", "para-4"),
          toggle("toggle-3", [paragraph("Three", "para-5"), paragraph("Deep", "para-6")]),
        ]),
      ]),
    ];
    const parsed = expectOk(parseEditorDocument(createEditorDocument("doc", content)));

    expect(parsed.repairs).toEqual([]);
    expect(parsed.document.content).toEqual(content);
    expect(JSON.stringify(parsed.document.content)).not.toContain('"open"');
  });

  test("a fourth nested toggle is unsupported and the raw document is kept", () => {
    const raw = createEditorDocument("doc-depth", [
      toggle("toggle-1", [
        paragraph("One", "para-1"),
        toggle("toggle-2", [
          paragraph("Two", "para-2"),
          toggle("toggle-3", [
            paragraph("Three", "para-3"),
            toggle("toggle-4", [paragraph("Four", "para-4")]),
          ]),
        ]),
      ]),
    ]);
    const result = expectUnsupported(parseEditorDocument(raw));

    expect(
      result.issues.some((issue) => issue.message.includes("nested deeper than 3 toggle")),
    ).toBe(true);
    expect(result.raw).toBe(raw);
  });

  test("a first child that is not a paragraph is unsupported and the raw document is kept", () => {
    const raw = createEditorDocument("doc-label", [
      toggle("toggle-1", [quote("quote-1", [paragraph("Said", "para-1")])]),
    ]);
    const result = expectUnsupported(parseEditorDocument(raw));

    expect(result.issues[0]?.message).toContain('unsupported first child type "blockquote"');
    expect(result.raw).toBe(raw);
  });

  test("list attrs on the label are unsupported and the raw document is kept", () => {
    const raw = createEditorDocument("doc-label-list", [
      toggle("toggle-1", [
        paragraph("Todo", "para-1", { indent: 1, listStyleType: "todo", checked: true }),
      ]),
    ]);
    const result = expectUnsupported(parseEditorDocument(raw));
    const messages = result.issues.map((issue) => issue.message).join("\n");

    expect(messages).toContain("unsupported label listStyleType");
    expect(messages).toContain("unsupported label indent");
    expect(messages).toContain("unsupported label checked");
    expect(result.raw).toBe(raw);
  });

  test("a stored open attr is unsupported and the raw document is kept", () => {
    const raw = createEditorDocument("doc-open", [
      toggle("toggle-1", [paragraph("Hello", "para-1")], { open: true }),
    ]);
    const result = expectUnsupported(parseEditorDocument(raw));

    expect(result.issues[0]?.message).toContain('unsupported attribute "open"');
    expect(result.raw).toBe(raw);
    expect(field(raw.content[0], "open")).toBe(true);
  });

  test("inline children are unsupported and the raw document is kept", () => {
    const raw = createEditorDocument("doc-inline", [
      { type: "toggle", id: "toggle-1", children: [{ text: "Loose" }] },
    ]);
    const result = expectUnsupported(parseEditorDocument(raw));

    expect(result.issues.some((issue) => issue.message.includes("inline children"))).toBe(true);
    expect(result.raw).toBe(raw);
  });
});

describe("toggle normalizer", () => {
  test("a missing label is inserted as an empty paragraph", () => {
    const editor = createEditor([
      toggle("toggle-1", [quote("quote-1", [paragraph("Said", "para-1")])]),
    ]);
    editor.tf.normalize({ force: true });

    expect(childTypes(editor.children[0])).toEqual(["p", "blockquote"]);
    expect(childTexts(editor.children[0])[0]).toBe("");
    expect(nodeText(childrenOf(editor.children[0])[1])).toBe("Said");
    expect(field(editor.children[0], "id")).toBe("toggle-1");
  });

  test("list attrs are stripped from the label and kept on content", () => {
    const editor = createEditor([
      toggle("toggle-1", [
        paragraph("Todo", "para-1", { indent: 1, listStyleType: "todo", checked: true }),
        paragraph("Item", "para-2", { indent: 1, listStyleType: "disc" }),
      ]),
    ]);
    editor.tf.normalize({ force: true });
    const label = childrenOf(editor.children[0])[0];
    const item = childrenOf(editor.children[0])[1];

    expect(field(label, "listStyleType")).toBeUndefined();
    expect(field(label, "indent")).toBeUndefined();
    expect(field(label, "checked")).toBeUndefined();
    expect(nodeText(label)).toBe("Todo");
    expect(field(label, "id")).toBe("para-1");
    expect(field(item, "listStyleType")).toBe("disc");
    expect(field(item, "indent")).toBe(1);
    expect(nodeText(item)).toBe("Item");
  });

  test("a toggle nested past the cap unwraps and keeps its text", () => {
    const editor = createEditor([
      toggle("toggle-1", [
        paragraph("One", "para-1"),
        toggle("toggle-2", [
          paragraph("Two", "para-2"),
          toggle("toggle-3", [
            paragraph("Three", "para-3"),
            toggle("toggle-4", [paragraph("Four", "para-4"), paragraph("Body", "para-5")]),
          ]),
        ]),
      ]),
    ]);
    editor.tf.normalize({ force: true });

    expect(maxToggleDepth({ children: editor.children })).toBe(3);
    expect(nodeText({ children: editor.children })).toBe("OneTwoThreeFourBody");
    expect(typesOf(editor)).toEqual(["toggle"]);
    const inner = childrenOf(childrenOf(childrenOf(editor.children[0])[1])[1]);
    expect(inner.map((child) => field(child, "type"))).toEqual(["p", "p", "p"]);
    expect(inner.map((child) => nodeText(child))).toEqual(["Three", "Four", "Body"]);
    expect(inner.map((child) => field(child, "id"))).toEqual(["para-3", "para-4", "para-5"]);
  });

  test("a toggle inside a quote or a callout flattens to paragraphs", () => {
    const quoted = createEditor([
      quote("quote-1", [
        toggle("toggle-1", [paragraph("Label", "para-1"), paragraph("Body", "para-2")]),
      ]),
    ]);
    const noted = createEditor([
      callout("callout-1", [
        toggle("toggle-2", [paragraph("Label", "para-3"), paragraph("Body", "para-4")]),
      ]),
    ]);
    quoted.tf.normalize({ force: true });
    noted.tf.normalize({ force: true });

    expect(typesOf(quoted)).toEqual(["blockquote"]);
    expect(childTypes(quoted.children[0])).toEqual(["p", "p"]);
    expect(childTexts(quoted.children[0])).toEqual(["Label", "Body"]);
    expect(childIds(quoted.children[0])).toEqual(["para-1", "para-2"]);
    expect(typesOf(noted)).toEqual(["callout"]);
    expect(childTypes(noted.children[0])).toEqual(["p", "p"]);
    expect(childTexts(noted.children[0])).toEqual(["Label", "Body"]);
    expect(childIds(noted.children[0])).toEqual(["para-3", "para-4"]);
  });

  test("a heading inside a toggle becomes a paragraph", () => {
    const editor = createEditor([
      toggle("toggle-1", [
        paragraph("Label", "para-1"),
        { type: "h1", id: "heading-1", children: [{ text: "Title" }] },
      ]),
    ]);
    editor.tf.normalize({ force: true });

    expect(childTypes(editor.children[0])).toEqual(["p", "p"]);
    expect(childTexts(editor.children[0])).toEqual(["Label", "Title"]);
    expect(childIds(editor.children[0])).toEqual(["para-1", "heading-1"]);
  });
});

describe("toggle open state", () => {
  test("a loaded toggle starts closed", () => {
    const editor = createEditor([storedToggle()]);

    expect(readToggleOpenIds(editor).has("toggle-1")).toBe(false);
    expect(JSON.stringify(editor.children)).not.toContain('"open"');
  });

  test("turn into toggle opens the new toggle", () => {
    const editor = createEditor([paragraph("One", "para-1"), paragraph("Two", "para-2")]);
    editor.tf.select({
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [1, 0], offset: 3 },
    });

    expect(runEditorCommand(editor, turnIntoToggle, undefined)).toBe(true);

    expect(typesOf(editor)).toEqual(["toggle"]);
    expect(readToggleOpenIds(editor).has(toggleId(editor))).toBe(true);
  });

  test("toggling is not in history, so undo does not reopen or close it", () => {
    const editor = createEditor([storedToggle()]);
    editor.tf.select(caret([0, 0, 0], 5));
    editor.tf.insertText("!");
    const undos = editor.history.undos.length;

    toggleOpen(editor, "toggle-1", true);

    expect(readToggleOpenIds(editor).has("toggle-1")).toBe(true);
    expect(editor.history.undos.length).toBe(undos);

    editor.tf.undo();

    expect(nodeText(editor.children[0])).toBe("HelloBody");
    expect(readToggleOpenIds(editor).has("toggle-1")).toBe(true);

    toggleOpen(editor, "toggle-1", false);
    editor.tf.redo();

    expect(nodeText(editor.children[0])).toBe("Hello!Body");
    expect(readToggleOpenIds(editor).has("toggle-1")).toBe(false);
  });

  test("collapsing with the caret in the content moves it to the end of the label", () => {
    const editor = createEditor([storedToggle()]);
    toggleOpen(editor, "toggle-1", true);
    editor.tf.select(caret([0, 1, 0], 1));

    toggleOpen(editor, "toggle-1", false);

    expect(readToggleOpenIds(editor).has("toggle-1")).toBe(false);
    expect(editor.selection).toEqual(caret([0, 0, 0], 5));
    expect(childTexts(editor.children[0])).toEqual(["Hello", "Body"]);
  });

  test("a selection that lands in hidden content opens the toggle", async () => {
    const editor = createEditor([storedToggle()]);

    editor.tf.select(caret([0, 1, 0], 1));
    await Promise.resolve();

    expect(readToggleOpenIds(editor).has("toggle-1")).toBe(true);
    expect(editor.selection).toEqual(caret([0, 1, 0], 1));
  });

  test("a read-only editor can still toggle", async () => {
    const mounted = await mountToggle([storedToggle(), paragraph("Outside", "para-3")], true);
    const selection = caret([1, 0], 2);
    mounted.editor.tf.select(selection);
    const children = JSON.parse(JSON.stringify(mounted.editor.children));
    const undos = mounted.editor.history.undos.length;

    try {
      const button: unknown = document.querySelector("[aria-expanded]");
      if (!isClickable(button)) {
        throw new Error("Missing toggle button.");
      }

      const view = button.ownerDocument.defaultView;
      if (!view) {
        throw new Error("Missing window.");
      }

      expect(button.hasAttribute("disabled")).toBe(false);
      expect(button.getAttribute("aria-expanded")).toBe("false");
      await act(async () => {
        button.dispatchEvent(new view.MouseEvent("click", { bubbles: true, cancelable: true }));
      });

      expect(button.getAttribute("aria-expanded")).toBe("true");
      expect(readToggleOpenIds(mounted.editor).has("toggle-1")).toBe(true);
      expect(mounted.editor.children).toEqual(children);
      expect(mounted.editor.history.undos.length).toBe(undos);
      expect(mounted.editor.selection).toEqual(selection);
    } finally {
      await mounted.cleanup();
    }
  });
});

describe("toggle rendering", () => {
  test("a closed toggle keeps its content in the markup and hides it with the container class", () => {
    const html = renderToggle([storedToggle()]);

    expect(html).toContain('data-open="false"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-label="Expand Hello"');
    expect(html).toContain(
      TOGGLE_HIDDEN_CONTENT_CLASS.replaceAll("&", "&amp;").replaceAll(">", "&gt;"),
    );
    expect(html).toContain("duration-150");
    expect(html).toContain("ease-out");
    expect(html).toContain("motion-reduce:transition-none");
    expect(html).toContain("Hello");
    expect(html).toContain("Body");
    expect(html).not.toContain("rotate-90");
    expect(html).not.toContain("disabled");
  });

  test("mousedown on the button is cancelled and clicking opens then closes it", async () => {
    const mounted = await mountToggle([storedToggle(), paragraph("Outside word", "para-3")]);
    const selection = {
      anchor: { path: [1, 0], offset: 8 },
      focus: { path: [1, 0], offset: 12 },
    };
    mounted.editor.tf.select(selection);

    try {
      const button: unknown = document.querySelector("[aria-expanded]");
      if (!isClickable(button)) {
        throw new Error("Missing toggle button.");
      }

      const view = button.ownerDocument.defaultView;
      if (!view) {
        throw new Error("Missing window.");
      }

      const mouseDown = new view.MouseEvent("mousedown", { bubbles: true, cancelable: true });
      button.dispatchEvent(mouseDown);
      expect(mouseDown.defaultPrevented).toBe(true);
      expect(mounted.editor.selection).toEqual(selection);

      await act(async () => {
        button.dispatchEvent(new view.MouseEvent("click", { bubbles: true, cancelable: true }));
      });

      expect(button.getAttribute("aria-expanded")).toBe("true");
      expect(document.querySelector("[data-open]")?.getAttribute("data-open")).toBe("true");
      expect(document.body.innerHTML).toContain("rotate-90");
      expect(mounted.editor.selection).toEqual(selection);

      await act(async () => {
        button.dispatchEvent(new view.MouseEvent("click", { bubbles: true, cancelable: true }));
      });

      expect(button.getAttribute("aria-expanded")).toBe("false");
      expect(document.querySelector("[data-open]")?.getAttribute("data-open")).toBe("false");
      expect(mounted.editor.selection).toEqual(selection);
    } finally {
      await mounted.cleanup();
    }
  });
});

describe("toggle commands", () => {
  test("the command is Toggle list in the turn-into group and has no shortcut", () => {
    const editor = createEditor([paragraph("Hello", "para-1")]);

    expect(turnIntoToggle.id).toBe("block.turn-into.toggle");
    expect(turnIntoToggle.label).toBe("Toggle list");
    expect(turnIntoToggle.group).toBe("turn-into");
    expect(editor.meta.shortcuts["toggle.toggle"]).toBeUndefined();
    expect(editor.getPlugin({ key: "toggle" }).inputRules ?? []).toEqual([]);
  });

  test("wraps the selection so the first block is the label and opens the toggle", () => {
    const editor = createEditor([paragraph("One", "para-1"), paragraph("Two", "para-2")]);
    editor.tf.select({
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [1, 0], offset: 3 },
    });
    const before = editor.history.undos.length;

    expect(runEditorCommand(editor, turnIntoToggle, undefined)).toBe(true);

    expect(typesOf(editor)).toEqual(["toggle"]);
    expect(childIds(editor.children[0])).toEqual(["para-1", "para-2"]);
    expect(childTexts(editor.children[0])).toEqual(["One", "Two"]);
    expect(field(childrenOf(editor.children[0])[0], "listStyleType")).toBeUndefined();
    expect(readToggleOpenIds(editor).has(toggleId(editor))).toBe(true);
    expect(editor.history.undos.length - before).toBe(1);
    expect(JSON.stringify(editor.children)).not.toContain('"open"');
  });

  test("one undo restores the wrapped paragraphs", () => {
    const editor = createEditor([paragraph("One", "para-1"), paragraph("Two", "para-2")]);
    editor.tf.select({
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [1, 0], offset: 3 },
    });
    runEditorCommand(editor, turnIntoToggle, undefined);
    const id = toggleId(editor);

    editor.tf.undo();

    expect(typesOf(editor)).toEqual(["p", "p"]);
    expect(childIds({ children: editor.children })).toEqual(["para-1", "para-2"]);
    expect(readToggleOpenIds(editor).has(id)).toBe(true);
  });

  test("a selection on the label unwraps the whole toggle", () => {
    const editor = createEditor([
      toggle("toggle-1", [
        paragraph("One", "para-1"),
        paragraph("Two", "para-2"),
        paragraph("Three", "para-3"),
      ]),
    ]);
    editor.tf.select(caret([0, 0, 0], 1));

    runEditorCommand(editor, turnIntoToggle, undefined);

    expect(typesOf(editor)).toEqual(["p", "p", "p"]);
    expect(childIds({ children: editor.children })).toEqual(["para-1", "para-2", "para-3"]);
    expect(editor.children.map((block) => nodeText(block))).toEqual(["One", "Two", "Three"]);
  });

  test("a selection in the content lifts that block out and leaves the rest in the toggle", () => {
    const editor = createEditor([
      toggle("toggle-1", [
        paragraph("Label", "para-1"),
        paragraph("Moved", "para-2"),
        paragraph("Item", "para-3", { indent: 1, listStyleType: "disc" }),
      ]),
    ]);
    editor.tf.select(caret([0, 1, 0], 1));

    runEditorCommand(editor, turnIntoToggle, undefined);

    expect(typesOf(editor)).toEqual(["toggle", "p"]);
    expect(field(editor.children[0], "id")).toBe("toggle-1");
    expect(childIds(editor.children[0])).toEqual(["para-1", "para-3"]);
    expect(childTexts(editor.children[0])).toEqual(["Label", "Item"]);
    expect(field(childrenOf(editor.children[0])[1], "listStyleType")).toBe("disc");
    expect(field(childrenOf(editor.children[0])[1], "indent")).toBe(1);
    expect(field(editor.children[1], "id")).toBe("para-2");
    expect(nodeText(editor.children[1])).toBe("Moved");
  });

  test("a read-only editor refuses turn into toggle", () => {
    const editor = createEditor([paragraph("Hello", "para-1")]);
    editor.tf.select(caret([0, 0], 1));
    const undos = editor.history.undos.length;

    expect(runEditorCommand(editor, turnIntoToggle, undefined, { readOnly: true })).toBe(false);
    expect(typesOf(editor)).toEqual(["p"]);
    expect(editor.history.undos.length).toBe(undos);
  });
});

describe("toggle getBlockType", () => {
  test("the label reports toggle and content reports its own type", () => {
    const editor = createEditor([
      toggle("toggle-1", [
        paragraph("Label", "para-1"),
        paragraph("Body", "para-2"),
        paragraph("Item", "para-3", { indent: 1, listStyleType: "disc" }),
      ]),
      paragraph("After", "para-4"),
    ]);

    editor.tf.select(caret([0, 0, 0], 1));
    expect(getBlockType(editor)).toBe("toggle");

    editor.tf.select(caret([0, 1, 0], 1));
    expect(getBlockType(editor)).toBe("p");

    editor.tf.select(caret([0, 2, 0], 1));
    expect(getBlockType(editor)).toBe("bulleted-list");

    editor.tf.select({
      anchor: { path: [0, 0, 0], offset: 1 },
      focus: { path: [0, 1, 0], offset: 1 },
    });
    expect(getBlockType(editor)).toBe("mixed");
  });
});

describe("toggle keyboard", () => {
  test("Enter at the end of an open label inserts the first content paragraph", () => {
    const editor = createEditor([storedToggle()]);
    toggleOpen(editor, "toggle-1", true);
    editor.tf.select(caret([0, 0, 0], 5));

    editor.tf.insertBreak();

    expect(typesOf(editor)).toEqual(["toggle"]);
    expect(childTexts(editor.children[0])).toEqual(["Hello", "", "Body"]);
    expect(childIds(editor.children[0])[0]).toBe("para-1");
    expect(childIds(editor.children[0])[2]).toBe("para-2");
    expect(editor.selection).toEqual(caret([0, 1, 0], 0));
  });

  test("Enter in the middle of an open label moves the second part into content", () => {
    const editor = createEditor([storedToggle()]);
    toggleOpen(editor, "toggle-1", true);
    editor.tf.select(caret([0, 0, 0], 2));

    editor.tf.insertBreak();

    expect(typesOf(editor)).toEqual(["toggle"]);
    expect(childTexts(editor.children[0])).toEqual(["He", "llo", "Body"]);
    expect(childIds(editor.children[0])[0]).toBe("para-1");
    expect(childIds(editor.children[0])[2]).toBe("para-2");
    expect(editor.selection).toEqual(caret([0, 1, 0], 0));
  });

  test("Enter at the end of a closed label inserts a paragraph after the toggle", () => {
    const editor = createEditor([storedToggle()]);
    editor.tf.select(caret([0, 0, 0], 5));

    editor.tf.insertBreak();

    expect(typesOf(editor)).toEqual(["toggle", "p"]);
    expect(childTexts(editor.children[0])).toEqual(["Hello", "Body"]);
    expect(childIds(editor.children[0])).toEqual(["para-1", "para-2"]);
    expect(nodeText(editor.children[1])).toBe("");
    expect(editor.selection).toEqual(caret([1, 0], 0));
  });

  test("Enter in the middle of a closed label moves the rest after the toggle", () => {
    const editor = createEditor([storedToggle()]);
    editor.tf.select(caret([0, 0, 0], 2));

    editor.tf.insertBreak();

    expect(typesOf(editor)).toEqual(["toggle", "p"]);
    expect(childTexts(editor.children[0])).toEqual(["He", "Body"]);
    expect(childIds(editor.children[0])).toEqual(["para-1", "para-2"]);
    expect(nodeText(editor.children[1])).toBe("llo");
    expect(editor.selection).toEqual(caret([1, 0], 0));
  });

  test("Backspace at the start of the label unwraps the toggle and keeps every child", () => {
    const editor = createEditor([
      toggle("toggle-1", [paragraph("Hello", "para-1"), paragraph("Body", "para-2")]),
    ]);
    editor.tf.select(caret([0, 0, 0], 0));

    editor.tf.deleteBackward();

    expect(typesOf(editor)).toEqual(["p", "p"]);
    expect(childIds({ children: editor.children })).toEqual(["para-1", "para-2"]);
    expect(editor.children.map((block) => nodeText(block))).toEqual(["Hello", "Body"]);
    expect(editor.selection).toEqual(caret([0, 0], 0));
  });

  test("Backspace at the start of an empty label unwraps and keeps the content", () => {
    const editor = createEditor([
      toggle("toggle-1", [paragraph("", "para-1"), paragraph("Body", "para-2")]),
    ]);
    editor.tf.select(caret([0, 0, 0], 0));

    editor.tf.deleteBackward();

    expect(typesOf(editor)).toEqual(["p", "p"]);
    expect(childIds({ children: editor.children })).toEqual(["para-1", "para-2"]);
    expect(editor.children.map((block) => nodeText(block))).toEqual(["", "Body"]);
  });

  test("Backspace at the start of a closed label keeps hidden content", () => {
    const editor = createEditor([storedToggle()]);
    expect(readToggleOpenIds(editor).has("toggle-1")).toBe(false);
    editor.tf.select(caret([0, 0, 0], 0));

    editor.tf.deleteBackward();

    expect(typesOf(editor)).toEqual(["p", "p"]);
    expect(editor.children.map((block) => nodeText(block))).toEqual(["Hello", "Body"]);
    expect(childIds({ children: editor.children })).toEqual(["para-1", "para-2"]);
  });

  test("Enter on an empty last content paragraph lifts it out after the toggle", () => {
    const editor = createEditor([
      toggle("toggle-1", [paragraph("Hello", "para-1"), paragraph("", "para-2")]),
    ]);
    editor.tf.select(caret([0, 1, 0], 0));

    editor.tf.insertBreak();

    expect(typesOf(editor)).toEqual(["toggle", "p"]);
    expect(childIds(editor.children[0])).toEqual(["para-1"]);
    expect(nodeText(editor.children[0])).toBe("Hello");
    expect(field(editor.children[1], "id")).toBe("para-2");
    expect(nodeText(editor.children[1])).toBe("");
  });

  test("Backspace at the start of the first content paragraph merges it into the label", () => {
    const editor = createEditor([
      toggle("toggle-1", [paragraph("Hello", "para-1"), paragraph("Next", "para-2")]),
    ]);
    editor.tf.select(caret([0, 1, 0], 0));

    editor.tf.deleteBackward();

    expect(typesOf(editor)).toEqual(["toggle"]);
    expect(childIds(editor.children[0])).toEqual(["para-1"]);
    expect(nodeText(editor.children[0])).toBe("HelloNext");
  });

  test("Enter at the start of a non-empty label inserts an empty paragraph above the toggle", () => {
    const editor = createEditor([storedToggle(), paragraph("After", "para-3")]);
    editor.tf.select(caret([0, 0, 0], 0));

    editor.tf.insertBreak();

    expect(typesOf(editor)).toEqual(["p", "toggle", "p"]);
    expect(nodeText(editor.children[0])).toBe("");
    expect(field(editor.children[1], "id")).toBe("toggle-1");
    expect(childTexts(editor.children[1])).toEqual(["Hello", "Body"]);
    expect(childIds(editor.children[1])).toEqual(["para-1", "para-2"]);
    expect(nodeText(editor.children[2])).toBe("After");
  });

  test("Tab nests a content list item and does nothing on the label", () => {
    const listed = createEditor([
      toggle("toggle-1", [
        paragraph("Label", "para-1"),
        paragraph("Item", "para-2", { indent: 1, listStyleType: "disc" }),
      ]),
    ]);
    listed.tf.select(caret([0, 1, 0], 1));

    expect(listed.tf.tab({ reverse: false })).toBe(true);

    const item = childrenOf(listed.children[0])[1];
    expect(field(item, "indent")).toBe(2);
    expect(field(item, "listStyleType")).toBe("disc");
    expect(field(item, "id")).toBe("para-2");
    expect(childIds(listed.children[0])[0]).toBe("para-1");

    const plain = createEditor([storedToggle()]);
    plain.tf.select(caret([0, 0, 0], 1));

    expect(plain.tf.tab({ reverse: false })).toBe(false);
    expect(childTexts(plain.children[0])).toEqual(["Hello", "Body"]);
  });
});

describe("toggle paste", () => {
  test("details with a summary becomes an open toggle", () => {
    const editor = pasteHtml("<details><summary>Label</summary><p>a</p><p>b</p></details>");

    expect(typesOf(editor)).toEqual(["toggle"]);
    expect(childTypes(editor.children[0])).toEqual(["p", "p", "p"]);
    expect(childTexts(editor.children[0])).toEqual(["Label", "a", "b"]);
    expect(readToggleOpenIds(editor).has(toggleId(editor))).toBe(true);
    expect(JSON.stringify(editor.children)).not.toContain('"open"');
  });

  test("details without a summary gets an empty label and keeps the content", () => {
    const editor = pasteHtml("<details><p>a</p><p>b</p></details>");

    expect(typesOf(editor)).toEqual(["toggle"]);
    expect(childTexts(editor.children[0])).toEqual(["", "a", "b"]);
    expect(childTypes(editor.children[0])).toEqual(["p", "p", "p"]);
    expect(readToggleOpenIds(editor).has(toggleId(editor))).toBe(true);
  });

  test("details nested past the cap flatten and keep the text", () => {
    const editor = pasteHtml(
      "<details><summary>A</summary><details><summary>B</summary><details><summary>C</summary><details><summary>D</summary><p>E</p></details></details></details></details>",
    );

    expect(maxToggleDepth({ children: editor.children })).toBe(3);
    expect(nodeText({ children: editor.children })).toBe("ABCDE");
    const third = childrenOf(childrenOf(childrenOf(editor.children[0])[1])[1]);
    expect(third.map((child) => field(child, "type"))).toEqual(["p", "p", "p"]);
    expect(third.map((child) => nodeText(child))).toEqual(["C", "D", "E"]);
  });

  test("an editor fragment keeps the toggle", () => {
    const editor = createEditor();
    editor.tf.select(caret([0, 0], 0));

    editor.tf.insertFragment([
      toggle("toggle-1", [paragraph("Label", "para-1"), paragraph("Body", "para-2")]),
    ]);

    expect(typesOf(editor)).toEqual(["toggle"]);
    expect(childTexts(editor.children[0])).toEqual(["Label", "Body"]);
    expect(childIds(editor.children[0])).toEqual(["para-1", "para-2"]);
    expect(field(editor.children[0], "id")).toBe("toggle-1");
    expect(readToggleOpenIds(editor).has("toggle-1")).toBe(true);
  });

  test("plain text stays text", () => {
    const editor = pasteHtml("Just text");

    expect(typesOf(editor)).toEqual(["p"]);
    expect(nodeText(editor.children[0])).toBe("Just text");
    expect(readToggleOpenIds(editor).size).toBe(0);
  });

  test("a fragment with colliding ids keeps the structure, assigns new ids, and undo restores it", () => {
    const editor = createEditor([
      toggle("toggle-1", [paragraph("Old", "para-1"), paragraph("Old body", "para-2")]),
      paragraph("", "para-3"),
    ]);
    editor.tf.select(caret([1, 0], 0));
    const before = JSON.parse(JSON.stringify(editor.children));

    editor.tf.insertFragment([
      toggle("toggle-1", [paragraph("Label", "para-1"), paragraph("Body", "para-2")]),
    ]);

    expect(typesOf(editor)).toEqual(["toggle", "toggle"]);
    expect(childTexts(editor.children[0])).toEqual(["Old", "Old body"]);
    expect(childIds(editor.children[0])).toEqual(["para-1", "para-2"]);
    expect(childTexts(editor.children[1])).toEqual(["Label", "Body"]);
    expect(field(editor.children[1], "id")).not.toBe("toggle-1");
    expect(childIds(editor.children[1])).not.toEqual(["para-1", "para-2"]);
    const pastedId = field(editor.children[1], "id");
    expect(typeof pastedId).toBe("string");
    if (typeof pastedId === "string") {
      expect(readToggleOpenIds(editor).has(pastedId)).toBe(true);
    }
    expect(readToggleOpenIds(editor).has("toggle-1")).toBe(false);

    editor.tf.undo();

    expect(editor.children).toEqual(before);
  });
});
