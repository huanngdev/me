import { describe, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { ElementApi, type SlateEditor, type TElement } from "platejs";
import { createPlateEditor } from "platejs/react";

import { EditorSurface } from "../components/editor/editor-surface";
import { NotionLikeEditorStatic } from "../notion-like-editor-static";
import { runEditorCommand, turnBlockInto, duplicateBlock } from "../lib/commands/editor-commands";
import { createEditorDocument } from "../lib/document/editor-document";
import { parseEditorDocument } from "../lib/document/editor-document-validate";
import type { EditorValue } from "../lib/document/editor-value";
import {
  blockToneAllowed,
  blockToneState,
  blockToneTargetIds,
  setBlockTone,
} from "../lib/features/editor-block-tone";
import { exportEditorDocument } from "../lib/io/export-document";
import { importEditorDocument } from "../lib/io/import-document";
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

function quote(id: string, extra: Record<string, unknown> = {}) {
  return {
    type: "blockquote",
    id,
    ...extra,
    children: [{ type: "p", id: `${id}-p`, children: [{ text: "Quoted" }] }],
  };
}

function cellTable(cellExtra: Record<string, unknown>) {
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
            ...cellExtra,
            children: [{ type: "p", id: "cell-p", children: [{ text: "Cell" }] }],
          },
        ],
      },
    ],
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

function toneAttrs(node: unknown): Record<string, unknown> {
  return {
    textTone: field(node, "textTone"),
    backgroundTone: field(node, "backgroundTone"),
  };
}

function withoutTones(node: unknown): unknown {
  const copy = structuredClone(node) as Record<string, unknown>;
  delete copy.textTone;
  delete copy.backgroundTone;
  return copy;
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

function withoutIds(value: unknown): unknown {
  return JSON.parse(
    JSON.stringify(value, (key, child: unknown) => (key === "id" ? undefined : child)),
  );
}

describe("block tone validation", () => {
  test.each(["p", "h1", "h2", "h3", "blockquote"])("%s accepts both tones", (type) => {
    const node =
      type === "blockquote"
        ? quote("q", { textTone: "blue", backgroundTone: "pink" })
        : { type, id: "b", textTone: "blue", backgroundTone: "pink", children: [{ text: "x" }] };
    expectOk(parseEditorDocument(createEditorDocument("doc", [node] as EditorValue)));
  });

  test("a tone outside the palette is unsupported, not repaired", () => {
    const result = expectUnsupported(
      parseEditorDocument(
        createEditorDocument("doc", [paragraph("p", "x", { textTone: "#f00" })] as EditorValue),
      ),
    );
    expect(result.issues[0]?.message).toContain("textTone");
  });

  test("an unknown background token on a quote is unsupported", () => {
    const result = expectUnsupported(
      parseEditorDocument(
        createEditorDocument("doc", [quote("q", { backgroundTone: "teal" })] as EditorValue),
      ),
    );
    expect(result.issues[0]?.message).toContain("backgroundTone");
  });

  test.each([
    [
      "callout",
      {
        type: "callout",
        id: "c",
        icon: "info",
        variant: "info",
        textTone: "red",
        children: [paragraph("c-p", "x")],
      },
    ],
    [
      "code block",
      {
        type: "code_block",
        id: "code",
        backgroundTone: "red",
        children: [{ type: "code_line", id: "line", children: [{ text: "x" }] }],
      },
    ],
    ["table cell", cellTable({ textTone: "red" })],
  ])("a tone on a %s is unsupported", (_label, node) => {
    const result = expectUnsupported(
      parseEditorDocument(createEditorDocument("doc", [node] as EditorValue)),
    );
    expect(result.issues.some((issue) => issue.message.includes("Tone"))).toBe(true);
  });

  test("a tone on a paragraph inside a table is accepted by the validator", () => {
    // Validation stays permissive here. The command and paste refuse these instead.
    const table = cellTable({});
    const cell = (table.children[0] as { children: { children: unknown[] }[] }).children[0];
    const cellParagraph = cell?.children[0] as Record<string, unknown>;
    cellParagraph.textTone = "red";
    expectOk(parseEditorDocument(createEditorDocument("doc", [table] as unknown as EditorValue)));
  });
});

describe("setBlockTone", () => {
  test("sets a text tone on one paragraph", () => {
    const editor = createEditor([paragraph("p1", "One")] as EditorValue);
    expect(
      runEditorCommand(editor, setBlockTone, { ids: ["p1"], kind: "text", token: "red" }),
    ).toBe(true);
    expect(field(byId(editor, "p1"), "textTone")).toBe("red");
    expect(field(byId(editor, "p1"), "backgroundTone")).toBeUndefined();
  });

  test("one call sets a background on three mixed blocks and one undo restores them", () => {
    const editor = createEditor([
      paragraph("p1", "One"),
      heading("h", "Two"),
      quote("q"),
    ] as EditorValue);
    const before = structuredClone(editor.children);
    runEditorCommand(editor, setBlockTone, {
      ids: ["p1", "h", "q"],
      kind: "background",
      token: "blue",
    });
    for (const id of ["p1", "h", "q"]) {
      expect(field(byId(editor, id), "backgroundTone")).toBe("blue");
    }
    editor.tf.undo();
    expect(editor.children).toEqual(before);
  });

  test("null unsets only the chosen kind", () => {
    const editor = createEditor([
      paragraph("p1", "One", { textTone: "red", backgroundTone: "green" }),
    ] as EditorValue);
    runEditorCommand(editor, setBlockTone, { ids: ["p1"], kind: "text", token: null });
    expect(toneAttrs(byId(editor, "p1"))).toEqual({
      textTone: undefined,
      backgroundTone: "green",
    });
    expect("textTone" in byId(editor, "p1")).toBe(false);
  });

  test("callout, code block and a paragraph in a table are skipped while the allowed sibling changes", () => {
    const editor = createEditor([
      {
        type: "callout",
        id: "c",
        icon: "info",
        variant: "info",
        children: [paragraph("c-p", "x")],
      },
      {
        type: "code_block",
        id: "code",
        children: [{ type: "code_line", id: "line", children: [{ text: "x" }] }],
      },
      cellTable({}),
      paragraph("p1", "One"),
    ] as EditorValue);
    const callout = structuredClone(byId(editor, "c"));
    const code = structuredClone(byId(editor, "code"));
    const cellP = structuredClone(byId(editor, "cell-p"));
    runEditorCommand(editor, setBlockTone, {
      ids: ["c", "code", "cell-p", "p1"],
      kind: "text",
      token: "red",
    });
    expect(byId(editor, "c")).toEqual(callout);
    expect(byId(editor, "code")).toEqual(code);
    expect(byId(editor, "cell-p")).toEqual(cellP);
    expect(field(byId(editor, "p1"), "textTone")).toBe("red");
  });

  test("an invalid token changes nothing", () => {
    const editor = createEditor([paragraph("p1", "One")] as EditorValue);
    const before = structuredClone(editor.children);
    runEditorCommand(editor, setBlockTone, {
      ids: ["p1"],
      kind: "text",
      token: "#f00" as never,
    });
    expect(editor.children).toEqual(before);
  });

  test("read-only refuses the command", () => {
    const editor = createEditor([paragraph("p1", "One")] as EditorValue);
    const before = structuredClone(editor.children);
    expect(
      runEditorCommand(
        editor,
        setBlockTone,
        { ids: ["p1"], kind: "text", token: "red" },
        { readOnly: true },
      ),
    ).toBe(false);
    expect(editor.children).toEqual(before);
  });

  test("changes only the tone attr, keeping children, marks and selection", () => {
    const children = [
      { type: "p", id: "p1", children: [{ text: "Mark", color: "blue", backgroundColor: "gray" }] },
    ] as unknown as EditorValue;
    const editor = createEditor(children);
    editor.tf.select(caret([0, 0], 2));
    const selection = structuredClone(editor.selection);
    const before = structuredClone(editor.children);
    runEditorCommand(editor, setBlockTone, { ids: ["p1"], kind: "background", token: "pink" });
    const after = structuredClone(editor.children) as unknown[];
    expect(after.map(withoutTones)).toEqual(before.map(withoutTones));
    expect(field(after[0], "backgroundTone")).toBe("pink");
    expect(editor.selection).toEqual(selection);
  });
});

describe("blockToneState", () => {
  test("none set is null", () => {
    const editor = createEditor([paragraph("a", "A"), paragraph("b", "B")] as EditorValue);
    expect(blockToneState(editor, [[0], [1]], "text")).toBeNull();
  });

  test("the same token everywhere is that token", () => {
    const editor = createEditor([
      paragraph("a", "A", { textTone: "red" }),
      heading("b", "B", { textTone: "red" }),
    ] as EditorValue);
    expect(blockToneState(editor, [[0], [1]], "text")).toBe("red");
  });

  test("different tokens are mixed", () => {
    const editor = createEditor([
      paragraph("a", "A", { textTone: "red" }),
      paragraph("b", "B", { textTone: "blue" }),
    ] as EditorValue);
    expect(blockToneState(editor, [[0], [1]], "text")).toBe("mixed");
  });

  test("disallowed blocks are ignored", () => {
    const editor = createEditor([
      {
        type: "callout",
        id: "c",
        icon: "info",
        variant: "info",
        textTone: "red",
        children: [paragraph("c-p", "x")],
      },
      paragraph("p", "P", { textTone: "blue" }),
    ] as EditorValue);
    expect(blockToneAllowed(editor, [0])).toBe(false);
    expect(blockToneState(editor, [[0], [1]], "text")).toBe("blue");
  });
});

describe("blockToneTargetIds", () => {
  test("a caret in a paragraph targets that paragraph", () => {
    const editor = createEditor([paragraph("p1", "One")] as EditorValue);
    editor.tf.select(caret([0, 0], 1));
    expect(blockToneTargetIds(editor)).toEqual(["p1"]);
  });

  test("a text selection across a paragraph and a heading targets both", () => {
    const editor = createEditor([paragraph("p1", "One"), heading("h", "Two")] as EditorValue);
    editor.tf.select({ anchor: { path: [0, 0], offset: 0 }, focus: { path: [1, 0], offset: 1 } });
    expect(blockToneTargetIds(editor)).toEqual(["p1", "h"]);
  });

  test("a caret inside a table cell targets nothing", () => {
    const editor = createEditor([cellTable({})] as unknown as EditorValue);
    editor.tf.select(caret([0, 0, 0, 0], 0));
    expect(blockToneTargetIds(editor)).toEqual([]);
  });

  test("an active block selection returns its ids", () => {
    const editor = createEditor([paragraph("p1", "One"), heading("h", "Two")] as EditorValue);
    setBlockSelection(editor, ["p1", "h"]);
    expect(blockToneTargetIds(editor)).toEqual(["p1", "h"]);
  });
});

describe("rendering in the editor", () => {
  test("background and text tones are on the block with their data attributes", async () => {
    const { host, root } = await render(
      [
        paragraph("p1", "Blue", { backgroundTone: "blue" }),
        heading("h", "Red", { textTone: "red" }),
      ] as EditorValue,
      false,
    );
    const para = blockEl(host, "p1");
    expect(para.style.backgroundColor).toContain("var(--editor-bg-blue)");
    expect(para.getAttribute("data-block-background-tone")).toBe("blue");
    expect(blockEl(host, "h").style.color).toContain("var(--editor-text-red)");
    expect(blockEl(host, "h").getAttribute("data-block-text-tone")).toBe("red");
    await unmount(host, root);
  });

  test("a quote tone is on the quote, and its child paragraph gets none", async () => {
    const { host, root } = await render([quote("q", { textTone: "green" })] as EditorValue, false);
    expect(blockEl(host, "q").getAttribute("data-block-text-tone")).toBe("green");
    const child = host.querySelector<HTMLElement>("[data-block-id='q-p']");
    expect(child?.hasAttribute("data-block-text-tone")).toBe(false);
    expect(child?.style.color ?? "").toBe("");
    await unmount(host, root);
  });

  test("a leaf colour mark keeps its own style inside a toned block", async () => {
    const { host, root } = await render(
      [
        {
          type: "p",
          id: "p1",
          textTone: "red",
          children: [{ text: "Mixed" }, { text: "Own", color: "blue" }],
        },
      ] as unknown as EditorValue,
      false,
    );
    expect(blockEl(host, "p1").style.color).toContain("var(--editor-text-red)");
    const span = [...blockEl(host, "p1").querySelectorAll<HTMLElement>("span")].find(
      (node) => node.textContent === "Own",
    );
    expect(span?.style.color).toContain("var(--editor-text-blue)");
    await unmount(host, root);
  });

  test("an invalid stored value renders no style and no data attribute", async () => {
    const { host, root } = await render(
      [
        paragraph("p1", "Bad", { textTone: "#f00", backgroundTone: "teal" }),
      ] as unknown as EditorValue,
      false,
    );
    const el = blockEl(host, "p1");
    expect(el.hasAttribute("data-block-text-tone")).toBe(false);
    expect(el.hasAttribute("data-block-background-tone")).toBe(false);
    expect(el.style.color).toBe("");
    expect(el.style.backgroundColor).toBe("");
    await unmount(host, root);
  });

  test("read-only renders the same tones", async () => {
    const { host, root } = await render(
      [paragraph("p1", "Blue", { backgroundTone: "blue" })] as EditorValue,
      true,
    );
    expect(blockEl(host, "p1").getAttribute("data-block-background-tone")).toBe("blue");
    await unmount(host, root);
  });
});

describe("rendering in the static renderer", () => {
  test("the static markup has the same styles and data attributes", () => {
    const markup = renderToStaticMarkup(
      <NotionLikeEditorStatic
        value={
          [
            paragraph("p1", "Blue", { backgroundTone: "blue" }),
            heading("h", "Red", { textTone: "red" }),
            quote("q", { textTone: "green" }),
            {
              type: "p",
              id: "leaf",
              textTone: "red",
              children: [{ text: "Own", color: "blue" }],
            },
            paragraph("bad", "Bad", { textTone: "#f00" }),
          ] as unknown as EditorValue
        }
      />,
    );
    expect(markup).toContain('data-block-background-tone="blue"');
    expect(markup).toContain("background-color:var(--editor-bg-blue)");
    expect(markup).toContain("color:var(--editor-text-red)");
    expect(markup).toContain('data-block-text-tone="green"');
    expect(markup).toContain("color:var(--editor-text-blue)");
    expect(markup.match(/data-block-text-tone=/g)?.length).toBe(3);
    expect(markup).not.toContain("#f00");
  });
});

describe("turn into, duplicate", () => {
  test("a paragraph with both tones keeps both on a heading", () => {
    const editor = createEditor([
      paragraph("p1", "One", { textTone: "red", backgroundTone: "blue" }),
    ] as EditorValue);
    runEditorCommand(editor, turnBlockInto, { path: [0], kind: "h1" });
    expect(toneAttrs(editor.children[0])).toEqual({ textTone: "red", backgroundTone: "blue" });
  });

  test("a paragraph with both tones drops both on a code block", () => {
    const editor = createEditor([
      paragraph("p1", "One", { textTone: "red", backgroundTone: "blue" }),
    ] as EditorValue);
    runEditorCommand(editor, turnBlockInto, { path: [0], kind: "code" });
    expect(JSON.stringify(editor.children)).not.toContain("Tone");
  });

  test("duplicate keeps both tones", () => {
    const editor = createEditor([
      paragraph("p1", "One", { textTone: "red", backgroundTone: "blue" }),
    ] as EditorValue);
    runEditorCommand(editor, duplicateBlock, { path: [0] });
    expect(editor.children).toHaveLength(2);
    expect(toneAttrs(editor.children[1])).toEqual({ textTone: "red", backgroundTone: "blue" });
  });
});

describe("paste", () => {
  test("sanitizing an editor fragment keeps valid tones on allowed types", () => {
    const value = sanitizePastedFragment([
      paragraph("p1", "One", { textTone: "red", backgroundTone: "blue" }),
      heading("h", "Two", { textTone: "pink" }),
    ]);
    expect(toneAttrs(value[0])).toEqual({ textTone: "red", backgroundTone: "blue" });
    expect(toneAttrs(value[1])).toEqual({ textTone: "pink", backgroundTone: undefined });
  });

  test("a javascript value loses its tone", () => {
    const value = sanitizePastedFragment([
      paragraph("p1", "One", { textTone: "javascript:alert(1)" }),
    ]);
    expect("textTone" in value[0]!).toBe(false);
  });

  test("a tone on a callout is stripped", () => {
    const value = sanitizePastedFragment([
      {
        type: "callout",
        id: "c",
        icon: "info",
        variant: "info",
        textTone: "red",
        children: [paragraph("c-p", "x")],
      },
    ]);
    expect(JSON.stringify(value)).not.toContain("textTone");
  });

  test("a fragment inserted into a table cell loses its tones", () => {
    const editor = createEditor([cellTable({})] as unknown as EditorValue);
    editor.tf.select(caret([0, 0, 0, 0, 0], 4));
    // Slate merges the first and last fragment blocks into the caret block, so the pasted one sits between.
    editor.tf.insertFragment([
      paragraph("before", "Before"),
      paragraph("pasted", "Pasted", { textTone: "red", backgroundTone: "blue" }),
      paragraph("after", "After"),
    ]);
    const pasted = allElements(editor.children).find((node) => node.id === "pasted");
    expect(pasted).toBeDefined();
    expect("textTone" in (pasted ?? {})).toBe(false);
    expect("backgroundTone" in (pasted ?? {})).toBe(false);
  });

  test("a fragment inserted outside a table keeps its tones", () => {
    const editor = createEditor([paragraph("p1", "One")] as EditorValue);
    editor.tf.select(caret([0, 0], 3));
    editor.tf.insertFragment([
      paragraph("before", "Before"),
      paragraph("pasted", "Pasted", { textTone: "red" }),
      paragraph("after", "After"),
    ]);
    expect(allElements(editor.children).find((node) => node.id === "pasted")?.textTone).toBe("red");
  });
});

describe("io", () => {
  const toned = [
    paragraph("p1", "One", { textTone: "red", backgroundTone: "blue" }),
    heading("h", "Two", { textTone: "green" }),
    quote("q", { backgroundTone: "pink" }),
  ] as EditorValue;

  test("json round trip keeps the tones", async () => {
    const exported = await exportEditorDocument(toned, "json");
    const imported = await importEditorDocument(exported.content, "json");
    expect(imported.ok).toBe(true);
    if (imported.ok) {
      // Import assigns fresh ids, so compare everything else.
      expect(withoutIds(imported.value)).toEqual(withoutIds(toned));
    }
  });

  test("html export carries data attributes and inline colours", async () => {
    const exported = await exportEditorDocument(toned, "html");
    expect(exported.content).toContain('data-nle-text-tone="red"');
    expect(exported.content).toContain('data-nle-background-tone="blue"');
    // Text uses the saturated hex. A block background uses the soft tint.
    expect(exported.content).toContain("color: #d44c47");
    expect(exported.content).toContain("background-color: #e7f3f8");
    expect(exported.content).not.toContain("background-color: #337ea9");
  });

  test("a highlight mark exports the soft tint and imports back to the same token", async () => {
    const value = [
      {
        type: "p",
        id: "p1",
        children: [{ text: "Marked", backgroundColor: "yellow" }],
      },
    ] as unknown as EditorValue;
    const exported = await exportEditorDocument(value, "html");
    expect(exported.content).toContain("background-color: #fbf3db");
    const imported = await importEditorDocument(exported.content, "html");
    expect(imported.ok).toBe(true);
    if (!imported.ok) {
      return;
    }
    expect(field(imported.value[0]?.children[0], "backgroundColor")).toBe("yellow");
  });

  test("a highlight with the old saturated hex still imports as the same token", async () => {
    const imported = await importEditorDocument(
      '<p data-nle-id="p1"><span style="background-color: #cb912f">Old</span></p>',
      "html",
    );
    expect(imported.ok).toBe(true);
    if (!imported.ok) {
      return;
    }
    expect(field(imported.value[0]?.children[0], "backgroundColor")).toBe("yellow");
    expect(imported.warnings.some((warning) => warning.code === "highlight")).toBe(false);
  });

  test("html import restores the tones", async () => {
    const exported = await exportEditorDocument(toned, "html");
    const imported = await importEditorDocument(exported.content, "html");
    expect(imported.ok).toBe(true);
    if (!imported.ok) {
      return;
    }
    const first = imported.value[0] as TElement;
    expect(toneAttrs(first)).toEqual({ textTone: "red", backgroundTone: "blue" });
  });

  test("an unknown data attribute is dropped with a block-color warning", async () => {
    const imported = await importEditorDocument(
      '<p data-nle-id="p1" data-nle-text-tone="evil">Hi</p>',
      "html",
    );
    expect(imported.ok).toBe(true);
    if (!imported.ok) {
      return;
    }
    expect(toneAttrs(imported.value[0])).toEqual({
      textTone: undefined,
      backgroundTone: undefined,
    });
    expect(imported.warnings.some((warning) => warning.code === "block-color")).toBe(true);
  });

  test("foreign html never produces tones", async () => {
    const imported = await importEditorDocument(
      '<p style="color:red;background:blue">Hi</p>',
      "html",
    );
    expect(imported.ok).toBe(true);
    if (!imported.ok) {
      return;
    }
    expect(JSON.stringify(imported.value)).not.toContain("Tone");
  });

  test("markdown drops tones with one block-color warning counting the toned blocks", async () => {
    const exported = await exportEditorDocument(toned, "markdown");
    const warnings = exported.warnings.filter((warning) => warning.code === "block-color");
    expect(warnings).toEqual([
      {
        code: "block-color",
        message: "3 block colours were removed. Markdown has no block colour.",
        count: 3,
      },
    ]);
    const imported = await importEditorDocument(exported.content, "markdown");
    expect(imported.ok).toBe(true);
    if (imported.ok) {
      expect(JSON.stringify(imported.value)).not.toContain("Tone");
    }
  });
});
