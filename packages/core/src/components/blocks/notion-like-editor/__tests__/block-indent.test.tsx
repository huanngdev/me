import { describe, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { ElementApi, type SlateEditor, type TElement } from "platejs";
import { createPlateEditor } from "platejs/react";

import { EditorSurface } from "../components/editor/editor-surface";
import { NotionLikeEditorStatic } from "../notion-like-editor-static";
import {
  runEditorCommand,
  toggleBulletedList,
  toggleNumberedList,
  turnBlockInto,
} from "../lib/commands/editor-commands";
import { DEMO_DOCUMENT_VALUE } from "../demo/demo-document";
import { createEditorDocument } from "../lib/document/editor-document";
import { parseEditorDocument } from "../lib/document/editor-document-validate";
import type { EditorValue } from "../lib/document/editor-value";
import {
  indentBlocks,
  outdentBlocks,
  blockIndentTargets,
} from "../lib/features/editor-block-indent";
import { selectionToolbarModel } from "../lib/features/editor-selection-toolbar";
import { createEditorPlugins } from "../lib/plugins/editor-plugins";
import { setBlockSelection } from "../lib/plugins/editor-block-selection";
import { sanitizePastedFragment } from "../lib/paste/editor-paste";
import { caret, createEditor, expectOk, expectUnsupported, field } from "./test-utils";

function paragraph(id: string, text: string, extra: Record<string, unknown> = {}) {
  return { type: "p", id, ...extra, children: [{ text }] };
}

function heading(id: string, text: string, extra: Record<string, unknown> = {}) {
  return { type: "h2", id, ...extra, children: [{ text }] };
}

function bullet(id: string, text: string, indent: number) {
  return paragraph(id, text, { listStyleType: "disc", indent });
}

function numbered(id: string, text: string, indent: number) {
  return paragraph(id, text, { listStyleType: "decimal", indent });
}

function quote(id: string, extra: Record<string, unknown> = {}) {
  return {
    type: "blockquote",
    id,
    ...extra,
    children: [{ type: "p", id: `${id}-p`, children: [{ text: "Quoted" }] }],
  };
}

function cellTable() {
  return {
    type: "table",
    id: "table",
    children: [
      {
        type: "tr",
        id: "row",
        children: [
          {
            type: "td",
            id: "cell",
            children: [{ type: "p", id: "cell-p", children: [{ text: "Cell" }] }],
          },
        ],
      },
    ],
  };
}

function callout(id: string) {
  return {
    type: "callout",
    id,
    icon: "info",
    variant: "info",
    children: [paragraph(`${id}-p`, "Inside")],
  };
}

function codeBlock(id: string) {
  return {
    type: "code_block",
    id,
    children: [{ type: "code_line", id: `${id}-line`, children: [{ text: "x" }] }],
  };
}

// Every element in document order, including nested blocks.
function allElements(nodes: readonly unknown[]): TElement[] {
  const found: TElement[] = [];
  const visit = (node: unknown): void => {
    if (!ElementApi.isElement(node)) {
      return;
    }
    found.push(node);
    for (const child of node.children) {
      visit(child);
    }
  };
  for (const node of nodes) {
    visit(node);
  }
  return found;
}

function byId(editor: SlateEditor, id: string): TElement {
  const found = allElements(editor.children).find((node) => node.id === id);
  if (!found) {
    throw new Error(`no block ${id}`);
  }
  return found;
}

function withoutIndent(node: unknown): unknown {
  const copy = structuredClone(node) as Record<string, unknown>;
  delete copy.indent;
  return copy;
}

function shortcut(editor: SlateEditor, id: string): boolean {
  const entry = editor.meta.shortcuts[id];
  if (!entry?.handler) {
    throw new Error(`missing shortcut ${id}`);
  }
  return entry.handler({ editor }) === true;
}

async function render(
  value: EditorValue,
  readOnly: boolean,
): Promise<{ host: HTMLElement; root: Root }> {
  const editor = createPlateEditor({ plugins: createEditorPlugins(), value });
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <EditorSurface editor={editor} readOnly={readOnly} placeholder="" className="editor" />,
    );
  });
  return { host, root };
}

async function unmount(host: HTMLElement, root: Root): Promise<void> {
  await act(async () => {
    root.unmount();
  });
  host.remove();
}

function blockEl(host: HTMLElement, id: string): HTMLElement {
  const el = host.querySelector<HTMLElement>(`[data-block-id='${id}']`);
  if (!el) {
    throw new Error(`no rendered block ${id}`);
  }
  return el;
}

describe("block indent validation", () => {
  test.each([
    ["p", paragraph("b", "x", { indent: 1 })],
    ["p", paragraph("b", "x", { indent: 6 })],
    ["h1", { type: "h1", id: "b", indent: 1, children: [{ text: "x" }] }],
    ["h2", { type: "h2", id: "b", indent: 6, children: [{ text: "x" }] }],
    ["h3", { type: "h3", id: "b", indent: 3, children: [{ text: "x" }] }],
    ["blockquote", quote("q", { indent: 1 })],
  ])("plain %s accepts a 1..6 indent", (_type, node) => {
    expectOk(parseEditorDocument(createEditorDocument("doc", [node] as EditorValue)));
  });

  test.each([0, 7, 1.5, "2"])("a plain paragraph rejects indent %p", (value) => {
    const result = expectUnsupported(
      parseEditorDocument(
        createEditorDocument("doc", [paragraph("p", "x", { indent: value })] as EditorValue),
      ),
    );
    expect(result.issues[0]?.path).toEqual([0]);
    expect(result.issues[0]?.message).toContain("indent");
  });

  test("a toggle's first child still forbids indent", () => {
    const toggle = {
      type: "toggle",
      id: "t",
      children: [paragraph("label", "Label", { indent: 1 }), paragraph("body", "Body")],
    };
    const result = expectUnsupported(
      parseEditorDocument(createEditorDocument("doc", [toggle] as EditorValue)),
    );
    expect(result.issues[0]?.message).toContain("indent");
  });

  test.each([
    ["callout", callout("c")],
    ["code block", codeBlock("code")],
  ])("indent on a %s is unsupported", (_label, node) => {
    const withIndent = { ...node, indent: 1 };
    expectUnsupported(
      parseEditorDocument(createEditorDocument("doc", [withIndent] as EditorValue)),
    );
  });

  test("a list paragraph keeps its rules: listStart still needs listStyleType", () => {
    expectUnsupported(
      parseEditorDocument(
        createEditorDocument("doc", [paragraph("p", "x", { listStart: 2 })] as EditorValue),
      ),
    );
  });
});

describe("block indent commands on a plain paragraph", () => {
  test("indent steps to 6, and the seventh step is refused with no change", () => {
    const editor = createEditor([paragraph("p", "One")] as EditorValue);
    editor.tf.select(caret([0, 0], 0));
    for (let step = 0; step < 6; step += 1) {
      expect(runEditorCommand(editor, indentBlocks, undefined)).toBe(true);
    }
    expect(field(byId(editor, "p"), "indent")).toBe(6);

    const before = structuredClone(editor.children);
    expect(runEditorCommand(editor, indentBlocks, undefined)).toBe(false);
    expect(editor.children).toEqual(before);
    expect(indentBlocks.isEnabled?.(editor)).toBe(false);
    expect(indentBlocks.disabledReason?.(editor)).toBe("Already at the deepest level.");
  });

  test("outdent to 0 removes the attribute, and outdent at 0 is refused", () => {
    const editor = createEditor([paragraph("p", "One", { indent: 1 })] as EditorValue);
    editor.tf.select(caret([0, 0], 0));
    expect(runEditorCommand(editor, outdentBlocks, undefined)).toBe(true);
    expect("indent" in byId(editor, "p")).toBe(false);

    const before = structuredClone(editor.children);
    expect(runEditorCommand(editor, outdentBlocks, undefined)).toBe(false);
    expect(editor.children).toEqual(before);
    expect(outdentBlocks.disabledReason?.(editor)).toBe("Not indented.");
  });

  test("each step is one undo and other attrs and marks are untouched", () => {
    const original = paragraph("p", "Bold text", {
      align: "center",
      lineHeight: 1.5,
      textTone: "red",
      backgroundTone: "blue",
    });
    const editor = createEditor([
      { ...original, children: [{ text: "Bold ", bold: true }, { text: "text" }] },
    ] as EditorValue);
    editor.tf.select(caret([0, 0], 0));
    const before = structuredClone(editor.children);

    runEditorCommand(editor, indentBlocks, undefined);
    runEditorCommand(editor, indentBlocks, undefined);
    expect(field(byId(editor, "p"), "indent")).toBe(2);
    expect(withoutIndent(byId(editor, "p"))).toEqual(withoutIndent(before[0]));

    editor.tf.undo();
    expect(field(byId(editor, "p"), "indent")).toBe(1);
    editor.tf.undo();
    expect(editor.children).toEqual(before);
  });
});

describe("block indent multi-block and list behavior", () => {
  test("one indent call moves four blocks by their own rule in one undo, same as Tab on the list items", () => {
    const value = [
      paragraph("p1", "One"),
      heading("h", "Two"),
      numbered("n1", "Three", 1),
      bullet("b2", "Four", 2),
    ] as EditorValue;
    const editor = createEditor(value);
    const reference = createEditor(value);
    const before = structuredClone(editor.children);

    editor.tf.select({ anchor: { path: [0, 0], offset: 0 }, focus: { path: [3, 0], offset: 4 } });
    expect(runEditorCommand(editor, indentBlocks, undefined)).toBe(true);

    expect(field(byId(editor, "p1"), "indent")).toBe(1);
    expect(field(byId(editor, "h"), "indent")).toBe(1);
    expect(field(byId(editor, "n1"), "indent")).toBe(2);
    expect(field(byId(editor, "b2"), "indent")).toBe(3);

    reference.tf.select({
      anchor: { path: [2, 0], offset: 0 },
      focus: { path: [3, 0], offset: 4 },
    });
    expect(reference.tf.tab({ reverse: false })).toBe(true);
    for (const id of ["n1", "b2"]) {
      const mine = byId(editor, id);
      const tabbed = byId(reference, id);
      expect(mine.listStyleType).toBe(tabbed.listStyleType);
      expect(mine.indent).toBe(tabbed.indent);
      expect(mine.id).toBe(tabbed.id);
    }

    editor.tf.undo();
    expect(editor.children).toEqual(before);
  });

  test("indenting a plain paragraph between numbered items does not change numbering", () => {
    const items = (indent: number) =>
      [
        numbered("n1", "One", 1),
        paragraph("plain", "Between", { indent }),
        numbered("n2", "Two", 1),
        numbered("n3", "Three", 1),
      ] as EditorValue;
    const indented = createEditor(items(2));
    const flat = createEditor(items(0));
    const listAttrs = (editor: SlateEditor) =>
      editor.children
        .filter((node) => node.listStyleType !== undefined)
        .map((node) => ({
          id: node.id,
          listStyleType: node.listStyleType,
          indent: node.indent,
          listStart: node.listStart,
          listRestart: node.listRestart,
        }));

    expect(listAttrs(indented)).toEqual(listAttrs(flat));
  });

  test("bullet at depth 2 toggles off to a plain paragraph with no indent", () => {
    const editor = createEditor([bullet("b", "Nested", 2)] as EditorValue);
    editor.tf.select(caret([0, 0], 1));

    runEditorCommand(editor, toggleBulletedList, undefined);

    expect(field(byId(editor, "b"), "listStyleType")).toBeUndefined();
    expect("indent" in byId(editor, "b")).toBe(false);
  });

  test("a plain paragraph with indent 2 becomes a depth 2 bullet, then loses its level when toggled off", () => {
    const editor = createEditor([paragraph("p", "Plain", { indent: 2 })] as EditorValue);
    editor.tf.select(caret([0, 0], 1));

    runEditorCommand(editor, toggleBulletedList, undefined);
    expect(field(byId(editor, "p"), "listStyleType")).toBe("disc");
    expect(field(byId(editor, "p"), "indent")).toBe(2);

    runEditorCommand(editor, toggleBulletedList, undefined);
    expect(field(byId(editor, "p"), "listStyleType")).toBeUndefined();
    expect("indent" in byId(editor, "p")).toBe(false);
  });

  test("a numbered toggle off also drops the level", () => {
    const editor = createEditor([numbered("n", "Item", 3)] as EditorValue);
    editor.tf.select(caret([0, 0], 1));

    runEditorCommand(editor, toggleNumberedList, undefined);

    expect("indent" in byId(editor, "n")).toBe(false);
  });
});

describe("block indent targets", () => {
  test("a paragraph inside a quote moves itself; the quote moves only when block-selected", () => {
    const editor = createEditor([quote("q")] as EditorValue);
    editor.tf.select(caret([0, 0, 0], 1));
    expect(blockIndentTargets(editor)).toEqual([[0, 0]]);
    runEditorCommand(editor, indentBlocks, undefined);
    expect(field(byId(editor, "q-p"), "indent")).toBe(1);
    expect(field(byId(editor, "q"), "indent")).toBeUndefined();

    setBlockSelection(editor, ["q"]);
    expect(blockIndentTargets(editor)).toEqual([[0]]);
    runEditorCommand(editor, indentBlocks, undefined);
    expect(field(byId(editor, "q"), "indent")).toBe(1);
    expect(field(byId(editor, "q-p"), "indent")).toBe(1);
  });

  test("a code line is refused with the reason", () => {
    const editor = createEditor([codeBlock("code")] as EditorValue);
    editor.tf.select(caret([0, 0, 0], 0));
    expect(indentBlocks.isEnabled?.(editor)).toBe(false);
    expect(indentBlocks.disabledReason?.(editor)).toBe("Indent is not available here.");
    expect(runEditorCommand(editor, indentBlocks, undefined)).toBe(false);
  });

  test("a block-selected callout and table are refused with the reason", () => {
    const editor = createEditor([callout("c"), cellTable()] as EditorValue);
    setBlockSelection(editor, ["c"]);
    expect(indentBlocks.isEnabled?.(editor)).toBe(false);
    expect(indentBlocks.disabledReason?.(editor)).toBe("Indent is not available here.");
    setBlockSelection(editor, ["table"]);
    expect(indentBlocks.isEnabled?.(editor)).toBe(false);
    expect(indentBlocks.disabledReason?.(editor)).toBe("Indent is not available here.");
  });

  test("a paragraph inside a table cell and inside a callout can be indented", () => {
    const editor = createEditor([callout("c"), cellTable()] as EditorValue);
    editor.tf.select(caret([0, 0, 0], 0));
    runEditorCommand(editor, indentBlocks, undefined);
    expect(field(byId(editor, "c-p"), "indent")).toBe(1);

    editor.tf.select(caret([1, 0, 0, 0], 0));
    runEditorCommand(editor, indentBlocks, undefined);
    expect(field(byId(editor, "cell-p"), "indent")).toBe(1);
  });
});

describe("block indent keyboard", () => {
  test("Mod+] indents and Mod+[ outdents a plain paragraph and a list item", () => {
    const editor = createEditor([paragraph("p", "Plain"), bullet("b", "Item", 1)] as EditorValue);
    editor.tf.select(caret([0, 0], 0));
    expect(shortcut(editor, "blockIndent.indent")).toBe(true);
    expect(field(byId(editor, "p"), "indent")).toBe(1);

    expect(shortcut(editor, "blockOutdent.outdent")).toBe(true);
    expect("indent" in byId(editor, "p")).toBe(false);

    editor.tf.select(caret([1, 0], 0));
    expect(shortcut(editor, "blockIndent.indent")).toBe(true);
    expect(field(byId(editor, "b"), "indent")).toBe(2);
    expect(shortcut(editor, "blockOutdent.outdent")).toBe(true);
    expect(field(byId(editor, "b"), "indent")).toBe(1);
  });

  test("at the limit the key is consumed with no change; with no target it is not consumed", () => {
    const editor = createEditor([paragraph("p", "Plain", { indent: 6 })] as EditorValue);
    editor.tf.select(caret([0, 0], 0));
    expect(shortcut(editor, "blockIndent.indent")).toBe(true);
    expect(field(byId(editor, "p"), "indent")).toBe(6);

    const code = createEditor([codeBlock("code")] as EditorValue);
    code.tf.select(caret([0, 0, 0], 0));
    expect(shortcut(code, "blockIndent.indent")).toBe(false);
  });

  test("Tab outside a list still does not indent", () => {
    const editor = createEditor([paragraph("p", "Plain")] as EditorValue);
    editor.tf.select(caret([0, 0], 0));
    expect(editor.tf.tab({ reverse: false })).toBe(false);
    expect("indent" in byId(editor, "p")).toBe(false);
  });

  test("Backspace at the start of an indented paragraph outdents one level and keeps the text", () => {
    const editor = createEditor([
      paragraph("a", "One"),
      paragraph("b", "Two", { indent: 2 }),
    ] as EditorValue);
    editor.tf.select(caret([1, 0], 0));

    editor.tf.deleteBackward("character");

    expect(editor.children.length).toBe(2);
    expect(field(byId(editor, "b"), "indent")).toBe(1);
    expect(byId(editor, "b").children).toEqual([{ text: "Two" }]);
  });

  test("Backspace at indent 0 still merges with the block above", () => {
    const editor = createEditor([paragraph("a", "One"), paragraph("b", "Two")] as EditorValue);
    editor.tf.select(caret([1, 0], 0));

    editor.tf.deleteBackward("character");

    expect(editor.children.length).toBe(1);
    expect(editor.children[0]?.children).toEqual([{ text: "OneTwo" }]);
  });

  test("Enter keeps the indent on the new paragraph", () => {
    const editor = createEditor([paragraph("p", "Hi", { indent: 2 })] as EditorValue);
    editor.tf.select(caret([0, 0], 2));

    editor.tf.insertBreak();

    expect(editor.children.length).toBe(2);
    expect(field(editor.children[1], "indent")).toBe(2);
  });

  test("a read-only run changes nothing", () => {
    const editor = createEditor([paragraph("p", "Plain")] as EditorValue);
    editor.tf.select(caret([0, 0], 0));
    expect(runEditorCommand(editor, indentBlocks, undefined, { readOnly: true })).toBe(false);
    expect("indent" in byId(editor, "p")).toBe(false);
  });
});

describe("block indent rendering", () => {
  test("static: a plain paragraph and a heading get a margin and data attribute", () => {
    const markup = renderToStaticMarkup(
      <NotionLikeEditorStatic
        value={
          [paragraph("p", "P", { indent: 2 }), heading("h", "H", { indent: 2 })] as EditorValue
        }
      />,
    );
    expect(markup).toContain("margin-inline-start:48px");
    expect(markup.match(/data-block-indent="2"/g)?.length).toBe(2);
  });

  test("static: a list paragraph gets no injected margin and no data attribute", () => {
    const markup = renderToStaticMarkup(
      <NotionLikeEditorStatic value={[bullet("b", "Item", 2)] as EditorValue} />,
    );
    expect(markup).not.toContain("margin-inline-start");
    expect(markup).not.toContain("data-block-indent");
  });

  test("static: an out-of-range value renders nothing", () => {
    const markup = renderToStaticMarkup(
      <NotionLikeEditorStatic
        value={[paragraph("p", "P", { indent: 9 })] as unknown as EditorValue}
      />,
    );
    expect(markup).not.toContain("margin-inline-start");
    expect(markup).not.toContain("data-block-indent");
  });

  test("static: a background tone and an indent both render", () => {
    const markup = renderToStaticMarkup(
      <NotionLikeEditorStatic
        value={[paragraph("p", "P", { indent: 2, backgroundTone: "blue" })] as EditorValue}
      />,
    );
    expect(markup).toContain("margin-inline-start:48px");
    expect(markup).toContain("background-color:var(--editor-bg-blue)");
  });

  test("editor: a plain paragraph gets the margin, a list paragraph does not", async () => {
    const { host, root } = await render(
      [paragraph("p", "P", { indent: 2 }), bullet("b", "Item", 2)] as EditorValue,
      false,
    );
    try {
      const plain = blockEl(host, "p");
      expect(plain.style.marginInlineStart).toBe("48px");
      expect(plain.getAttribute("data-block-indent")).toBe("2");
      expect(plain.style.marginLeft).toBe("");

      const list = blockEl(host, "b");
      expect(list.style.marginInlineStart).toBe("");
      expect(list.hasAttribute("data-block-indent")).toBe(false);
    } finally {
      await unmount(host, root);
    }
  });

  test("editor: a heading with a background tone keeps both styles", async () => {
    const { host, root } = await render(
      [heading("h", "H", { indent: 2, backgroundTone: "blue" })] as EditorValue,
      false,
    );
    try {
      const el = blockEl(host, "h");
      expect(el.style.marginInlineStart).toBe("48px");
      expect(el.style.backgroundColor).toContain("var(--editor-bg-blue)");
    } finally {
      await unmount(host, root);
    }
  });
});

describe("block indent toolbar model", () => {
  test("indent and outdent expose their shortcuts and reasons", () => {
    const editor = createEditor([paragraph("p", "Plain")] as EditorValue);
    editor.tf.select(caret([0, 0], 0));
    const model = selectionToolbarModel(editor);
    expect(model.indent.disabled).toBe(false);
    expect(model.indent.shortcut).toBe("indent");
    expect(model.outdent.disabled).toBe(true);
    expect(model.outdent.reason).toBe("Not indented.");
    expect(model.outdent.shortcut).toBe("outdent");
  });

  test("a code block disables both with the shared reason", () => {
    const editor = createEditor([codeBlock("code")] as EditorValue);
    editor.tf.select(caret([0, 0, 0], 0));
    const model = selectionToolbarModel(editor);
    expect(model.indent.reason).toBe("Indent is not available here.");
    expect(model.outdent.reason).toBe("Indent is not available here.");
  });
});

describe("block indent turn into", () => {
  function turn(node: unknown, path: number[], kind: string) {
    const editor = createEditor([node] as EditorValue);
    runEditorCommand(editor, turnBlockInto, { path, kind } as never);
    return editor;
  }

  test("a plain paragraph becomes a heading and keeps its indent", () => {
    const editor = turn(paragraph("p", "T", { indent: 2 }), [0], "h2");
    expect(field(editor.children[0], "type")).toBe("h2");
    expect(field(editor.children[0], "indent")).toBe(2);
  });

  test("a plain paragraph becomes a quote; the quote carries the indent and the child does not", () => {
    const editor = turn(paragraph("p", "T", { indent: 2 }), [0], "quote");
    expect(field(editor.children[0], "indent")).toBe(2);
    expect("indent" in (editor.children[0]?.children[0] ?? {})).toBe(false);
  });

  test("a plain paragraph becomes a list at the same depth", () => {
    const editor = turn(paragraph("p", "T", { indent: 3 }), [0], "bulleted");
    expect(field(editor.children[0], "listStyleType")).toBe("disc");
    expect(field(editor.children[0], "indent")).toBe(3);
  });

  test("a list item becomes a plain paragraph and drops its level, as before", () => {
    const editor = turn(bullet("b", "Item", 2), [0], "paragraph");
    expect("indent" in editor.children[0]!).toBe(false);
  });

  test("a type that cannot be indented drops the attribute", () => {
    const editor = turn(paragraph("p", "T", { indent: 2 }), [0], "callout");
    expect("indent" in editor.children[0]!).toBe(false);
    const code = turn(paragraph("p", "T", { indent: 2 }), [0], "code");
    expect("indent" in code.children[0]!).toBe(false);
  });
});

describe("block indent paste", () => {
  test("a valid plain indent is kept on an allowed type", () => {
    const value = sanitizePastedFragment([
      { type: "p", id: "a", indent: 2, children: [{ text: "x" }] },
    ]);
    expect(field(value[0], "indent")).toBe(2);
  });

  test("an indent above 6 is clamped to 6; 0 and non-integers are dropped", () => {
    const value = sanitizePastedFragment([
      { type: "p", id: "a", indent: 9, children: [{ text: "x" }] },
      { type: "p", id: "b", indent: 0, children: [{ text: "y" }] },
      { type: "p", id: "c", indent: 1.5, children: [{ text: "z" }] },
    ]);
    expect(field(value[0], "indent")).toBe(6);
    expect("indent" in (value[1] ?? {})).toBe(false);
    expect("indent" in (value[2] ?? {})).toBe(false);
  });

  test("an indent on a disallowed type is dropped", () => {
    const value = sanitizePastedFragment([
      {
        type: "code_block",
        id: "code",
        indent: 2,
        children: [{ type: "code_line", id: "line", children: [{ text: "x" }] }],
      },
    ]);
    expect("indent" in (value[0] ?? {})).toBe(false);
  });
});

describe("block indent demo", () => {
  test("the demo paragraph exists after the block color paragraph and validates", () => {
    const index = DEMO_DOCUMENT_VALUE.findIndex((item) => item.id === "demo-block-color");
    const block = DEMO_DOCUMENT_VALUE[index + 1];
    expect(block?.id).toBe("demo-indent");
    expect(field(block, "indent")).toBe(1);
    expectOk(parseEditorDocument(createEditorDocument("doc", DEMO_DOCUMENT_VALUE as EditorValue)));
  });
});

async function mountWithToolbar(value: EditorValue) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const editor = createPlateEditor({ plugins: createEditorPlugins(), value });
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <EditorSurface editor={editor} readOnly={false} placeholder="" className="editor" />,
    );
  });
  const focusEditable = async (): Promise<void> => {
    await act(async () => {
      const editable = host.querySelector("[data-slate-editor]");
      if (editable instanceof HTMLElement) {
        editable.focus();
      }
    });
  };
  await focusEditable();
  editor.tf.select({ anchor: { path: [0, 0], offset: 0 }, focus: { path: [0, 0], offset: 3 } });
  await focusEditable();
  return {
    editor,
    host,
    cleanup: async () => {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    },
  };
}

async function pressControl(label: string): Promise<void> {
  const node = document.querySelector(`[data-selection-toolbar] [aria-label="${label}"]`);
  if (!(node instanceof HTMLElement)) {
    throw new Error(`Missing control ${label}`);
  }
  await act(async () => {
    node.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, cancelable: true, button: 0 }),
    );
    node.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    node.click();
  });
}

function moreItems(): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>("[data-selection-more] [role='menuitem']"),
  );
}

function moreItem(choice: string): HTMLElement {
  const node = document.querySelector<HTMLElement>(`[data-more-choice='${choice}']`);
  if (!node) {
    throw new Error(`Missing more choice ${choice}`);
  }
  return node;
}

// The toolbar needs the same viewport and observer shims as selection-toolbar.test.tsx.
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

describe("block indent More menu", () => {
  test("Indent and Outdent sit after line height and before Clear formatting", async () => {
    const mounted = await mountWithToolbar([paragraph("p", "Hello")] as EditorValue);
    try {
      await pressControl("More");
      const labels = moreItems().map((node) => node.textContent ?? "");
      const at = (text: string) => labels.findIndex((label) => label.includes(text));
      expect(at("Line height")).toBeGreaterThanOrEqual(0);
      expect(at("Indent")).toBeGreaterThan(at("Line height"));
      expect(at("Outdent")).toBeGreaterThan(at("Indent"));
      expect(at("Clear formatting")).toBeGreaterThan(at("Outdent"));
    } finally {
      await mounted.cleanup();
    }
  });

  test("Indent sets indent 1, and Outdent is disabled with Not indented. on a plain paragraph", async () => {
    const mounted = await mountWithToolbar([paragraph("p", "Hello")] as EditorValue);
    try {
      await pressControl("More");
      const outdent = moreItem("outdent");
      expect(outdent.getAttribute("data-disabled")).not.toBeNull();
      expect(outdent.textContent).toContain("Not indented.");

      await act(async () => {
        moreItem("indent").click();
      });
      expect(field(byId(mounted.editor, "p"), "indent")).toBe(1);
    } finally {
      await mounted.cleanup();
    }
  });
});
