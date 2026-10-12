import { describe, expect, test } from "bun:test";
import { KEYS, createSlateEditor, type TElement } from "platejs";
import { createPlateEditor } from "platejs/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";

import { EditorSurface } from "../components/editor/editor-surface";
import { createEditorDocument } from "../lib/document/editor-document";
import { parseEditorDocument } from "../lib/document/editor-document-validate";
import type { EditorValue } from "../lib/document/editor-value";
import { insertInlineEquation } from "../lib/features/editor-inline-equation";
import { INLINE_EQUATION_EMPTY_PLACEHOLDER } from "../lib/features/editor-equation-render";
import { exportEditorDocument } from "../lib/io/export-document";
import { importEditorDocument } from "../lib/io/import-document";
import { createEditorPlugins } from "../lib/plugins/editor-plugins";
import { NotionLikeEditorStatic } from "../notion-like-editor-static";
import { comparableDocument } from "./io-test-utils";
import { caret, createEditor, expectOk, expectUnsupported, texts } from "./test-utils";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

const INLINE = "e^{i\\pi}+1=0";

function eq(id: string, texExpression: string): TElement {
  return { type: KEYS.inlineEquation, id, texExpression, children: [{ text: "" }] };
}

function paragraphWith(id: string, children: unknown[]): EditorValue[number] {
  return { type: KEYS.p, id, children } as unknown as EditorValue[number];
}

function parse(value: EditorValue) {
  return parseEditorDocument(createEditorDocument("document", value));
}

// The shape of a paragraph: text leaves as strings, inline equations as their source.
function shape(editor: ReturnType<typeof createEditor>, block = 0): unknown[] {
  const node = editor.children[block];
  if (!node || !("children" in node)) {
    return [];
  }
  return node.children.map((child) => {
    if ("texExpression" in child && typeof child.texExpression === "string") {
      return { equation: child.texExpression };
    }
    return "text" in child ? child.text : child;
  });
}

describe("inline equation schema", () => {
  test("a valid node is accepted in every inline-capable parent", () => {
    const value: EditorValue = [
      paragraphWith("p", [{ text: "a " }, eq("e1", INLINE), { text: " b" }]),
      {
        type: KEYS.h1,
        id: "h",
        children: [{ text: "x " }, eq("e2", "x^2")],
      } as EditorValue[number],
      {
        type: KEYS.p,
        id: "li",
        listStyleType: "disc",
        indent: 1,
        children: [eq("e3", "y")],
      } as unknown as EditorValue[number],
      {
        type: KEYS.blockquote,
        id: "q",
        children: [paragraphWith("qp", [eq("e4", "z")])],
      } as unknown as EditorValue[number],
      {
        type: KEYS.callout,
        id: "c",
        variant: "info",
        icon: "lightbulb",
        children: [paragraphWith("cp", [eq("e5", "w")])],
      } as unknown as EditorValue[number],
      {
        type: KEYS.table,
        id: "t",
        children: [
          {
            type: KEYS.tr,
            id: "tr",
            children: [
              {
                type: KEYS.td,
                id: "td",
                children: [paragraphWith("tp", [eq("e6", "v")])],
              },
            ],
          },
        ],
      } as unknown as EditorValue[number],
    ];
    expectOk(parse(value));
  });

  test("an inline equation inside a link is unsupported", () => {
    const value = [
      paragraphWith("p", [
        {
          type: KEYS.link,
          id: "l",
          url: "https://example.com",
          children: [{ text: "go " }, eq("e1", "x")],
        },
      ]),
    ] as unknown as EditorValue;
    expectUnsupported(parse(value));
  });

  // Conflict with the spec: the validator has no top-level rule for inline voids,
  // so a top-level equation is accepted exactly as a top-level mention is.
  test("a top-level inline equation gets the same status as a top-level mention", () => {
    const mention = [
      {
        type: KEYS.mention,
        id: "m",
        entityType: "person",
        entityId: "a",
        label: "Ada",
        children: [{ text: "" }],
      },
    ] as unknown as EditorValue;
    const equation = [eq("e1", "x")] as unknown as EditorValue;
    expect(parse(equation).status).toBe(parse(mention).status);
  });

  test("an expression of 4001 characters is unsupported", () => {
    const value = [paragraphWith("p", [eq("e1", "x".repeat(4001))])];
    expectUnsupported(parse(value));
  });

  test("an expression with a control character is unsupported", () => {
    const value = [paragraphWith("p", [eq("e1", "x\u0000y")])];
    expectUnsupported(parse(value));
  });
});

describe("insertInlineEquation", () => {
  test("a collapsed caret splits the text and the caret lands after the node", () => {
    const editor = createEditor([{ type: KEYS.p, id: "p", children: [{ text: "abcd" }] }]);
    editor.tf.select(caret([0, 0], 2));
    const id = insertInlineEquation(editor, INLINE);

    expect(typeof id).toBe("string");
    expect(shape(editor)).toEqual(["ab", { equation: INLINE }, "cd"]);
    expect(editor.selection).toEqual(caret([0, 2], 0));
  });

  test("an expanded selection is replaced by the node", () => {
    const editor = createEditor([{ type: KEYS.p, id: "p", children: [{ text: "abcd" }] }]);
    editor.tf.select({ anchor: { path: [0, 0], offset: 1 }, focus: { path: [0, 0], offset: 3 } });
    expect(insertInlineEquation(editor, "x")).not.toBeNull();
    expect(shape(editor)).toEqual(["a", { equation: "x" }, "d"]);
  });

  test("inside a code line it returns null and changes nothing", () => {
    const editor = createEditor([
      {
        type: KEYS.codeBlock,
        id: "cb",
        children: [{ type: KEYS.codeLine, id: "cl", children: [{ text: "const" }] }],
      } as unknown as EditorValue[number],
    ]);
    editor.tf.select(caret([0, 0, 0], 2));
    expect(insertInlineEquation(editor, "x")).toBeNull();
    expect(JSON.stringify(editor.children)).not.toContain(KEYS.inlineEquation);
    expect(JSON.stringify(editor.children)).toContain("const");
  });

  test("inside a link it returns null", () => {
    const editor = createEditor([
      paragraphWith("p", [
        { type: KEYS.link, id: "l", url: "https://example.com", children: [{ text: "go" }] },
      ]),
    ] as unknown as EditorValue);
    editor.tf.select(caret([0, 0, 0], 1));
    expect(insertInlineEquation(editor, "x")).toBeNull();
  });

  test("an invalid expression or no selection returns null", () => {
    const editor = createEditor([{ type: KEYS.p, id: "p", children: [{ text: "abc" }] }]);
    expect(insertInlineEquation(editor, "x")).toBeNull();
    editor.tf.select(caret([0, 0], 1));
    expect(insertInlineEquation(editor, "x\u0000")).toBeNull();
  });

  test("one undo after a batch restores the text", () => {
    const editor = createEditor([{ type: KEYS.p, id: "p", children: [{ text: "abcd" }] }]);
    editor.tf.select(caret([0, 0], 2));
    editor.tf.withNewBatch(() => {
      insertInlineEquation(editor, INLINE);
    });
    expect(shape(editor)).toEqual(["ab", { equation: INLINE }, "cd"]);
    editor.tf.undo();
    expect(texts(editor)).toEqual(["abcd"]);
  });
});

describe("inline equation rendering", () => {
  function render(value: EditorValue) {
    return renderToStaticMarkup(<NotionLikeEditorStatic value={value} />);
  }

  test("the static renderer shows math, the error source, and the empty placeholder", () => {
    const html = render([
      paragraphWith("p", [
        { text: "a " },
        eq("m", "x^2"),
        { text: " b " },
        eq("bad", "\\frac{"),
        { text: " c " },
        eq("empty", ""),
      ]),
    ]);
    expect(html).toContain("data-inline-equation-math");
    expect(html).toContain("katex");
    expect(html).not.toContain("katex-display");
    expect(html).toMatch(/data-inline-equation-error[^>]*>\\frac\{</);
    expect(html).toContain("data-inline-equation-empty");
    expect(html).toContain(INLINE_EQUATION_EMPTY_PLACEHOLDER);
  });

  test("the static renderer keeps the paragraph's text around the equation", () => {
    const html = render([
      paragraphWith("p", [{ text: "before " }, eq("m", "x"), { text: " after" }]),
    ]);
    expect(html).toContain("before ");
    expect(html).toContain(" after");
  });
});

async function mountInline(value: EditorValue, readOnly = false) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const editor = createPlateEditor({ plugins: createEditorPlugins(), value });
  let root: Root | undefined;
  await act(async () => {
    root = createRoot(host);
    root.render(
      <EditorSurface editor={editor} readOnly={readOnly} placeholder="" className="editor" />,
    );
    // KaTeX loads on a microtask. Stay inside act until that state update is queued.
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  });
  return {
    editor,
    host,
    cleanup: async () => {
      await act(async () => {
        root?.unmount();
      });
      host.remove();
    },
  };
}

describe("inline equation element", () => {
  const value: EditorValue = [
    paragraphWith("p", [
      { text: "a " },
      eq("m", "x^2"),
      { text: " b " },
      eq("bad", "\\frac{"),
      { text: " c " },
      eq("empty", ""),
    ]),
  ];

  test("renders math, error source, and placeholder in the editor", async () => {
    const mounted = await mountInline(value);
    try {
      const math = mounted.host.querySelector("[data-inline-equation-math]");
      expect(math?.querySelector(".katex")).not.toBeNull();
      expect(math?.innerHTML).not.toContain("katex-display");
      const error = mounted.host.querySelector("[data-inline-equation-error]");
      expect(error?.textContent).toBe("\\frac{");
      expect(error?.getAttribute("title")?.length ?? 0).toBeGreaterThan(0);
      expect(mounted.host.querySelector("[data-inline-equation-empty]")?.textContent).toBe(
        INLINE_EQUATION_EMPTY_PLACEHOLDER,
      );
    } finally {
      await mounted.cleanup();
    }
  });

  test("a read-only editor renders the same math", async () => {
    const mounted = await mountInline(value, true);
    try {
      expect(mounted.host.querySelector("[data-inline-equation-math] .katex")).not.toBeNull();
    } finally {
      await mounted.cleanup();
    }
  });
});

describe("inline equation paste", () => {
  test("a fragment keeps the expression and gets a new id", () => {
    const source = createEditor([
      paragraphWith("src", [{ text: "x " }, eq("eq-src", INLINE), { text: " z" }]),
    ] as unknown as EditorValue);
    source.tf.select({ anchor: { path: [0, 0], offset: 0 }, focus: { path: [0, 2], offset: 2 } });
    const fragment = source.api.getFragment();
    const target = createEditor();
    target.tf.select(caret([0, 0], 0));
    target.tf.insertFragment(fragment);

    const found: { id?: unknown; texExpression?: unknown }[] = [];
    for (const block of target.children) {
      for (const child of block.children) {
        if ("texExpression" in child) {
          found.push(child as { id?: unknown; texExpression?: unknown });
        }
      }
    }
    expect(found).toHaveLength(1);
    expect(found[0]?.texExpression).toBe(INLINE);
    expect(found[0]?.id).not.toBe("eq-src");
  });

  test("an invalid expression in a fragment becomes its source as text", () => {
    const target = createEditor();
    target.tf.select(caret([0, 0], 0));
    target.tf.insertFragment([
      paragraphWith("src", [{ text: "a" }, eq("bad", "x\u0000y"), { text: "b" }]),
    ] as unknown as EditorValue);
    expect(JSON.stringify(target.children)).not.toContain(KEYS.inlineEquation);
    expect(JSON.stringify(target.children)).toContain("xy");
  });

  test("copying a selection with an equation writes its source wrapped in dollars", async () => {
    // Slate's copy writer needs rendered DOM nodes, so the editor is mounted first.
    const mounted = await mountInline([
      paragraphWith("p", [{ text: "a " }, eq("m", INLINE), { text: " b" }]),
    ]);
    try {
      const { editor } = mounted;
      await act(async () => {
        editor.tf.select({
          anchor: { path: [0, 0], offset: 0 },
          focus: { path: [0, 2], offset: 2 },
        });
      });
      const written = new Map<string, string>();
      const data = {
        setData: (type: string, value: string) => {
          written.set(type, value);
        },
        getData: (type: string) => written.get(type) ?? "",
      } as unknown as DataTransfer;
      editor.tf.setFragmentData(data);
      expect(written.get("text/plain")).toBe(`a $${INLINE}$ b`);
    } finally {
      await mounted.cleanup();
    }
  });

  test("a foreign HTML dollar string stays text, not an equation", () => {
    const editor = createSlateEditor({ plugins: createEditorPlugins(), value: [] });
    editor.tf.insertFragment(
      editor.api.html.deserialize({
        element: new DOMParser().parseFromString("<p>$x^2$</p>", "text/html").body,
      }),
    );
    expect(JSON.stringify(editor.children)).not.toContain(KEYS.inlineEquation);
  });
});

describe("inline equation io", () => {
  const value: EditorValue = [
    paragraphWith("p", [{ text: "a " }, eq("m", INLINE), { text: " b" }]),
  ];

  test("JSON export and import keep the node", async () => {
    const exported = await exportEditorDocument(value, "json");
    const imported = await importEditorDocument(exported.content, "json");
    expect(imported.ok).toBe(true);
    if (!imported.ok) {
      return;
    }
    expect(comparableDocument(imported.value)).toEqual(comparableDocument(value));
  });

  test("HTML export writes the marker and import restores the type and expression", async () => {
    const exported = await exportEditorDocument(value, "html");
    expect(exported.content).toContain("data-nle-inline-equation");
    const imported = await importEditorDocument(exported.content, "html");
    expect(imported.ok).toBe(true);
    if (!imported.ok) {
      return;
    }
    expect(JSON.stringify(imported.value)).toContain(
      `"texExpression":"${INLINE.replaceAll("\\", "\\\\")}"`,
    );
  });

  test("HTML import copies no attributes or elements from an inline equation span", async () => {
    const html =
      '<p data-nle-id="p">a <span data-nle-inline-equation onclick="x"><img src=x onerror=1>x^2</span> b</p>';
    const imported = await importEditorDocument(html, "html");
    expect(imported.ok).toBe(true);
    if (!imported.ok) {
      return;
    }
    const json = JSON.stringify(imported.value);
    expect(json).not.toContain("onclick");
    expect(json).not.toContain("onerror");
    expect(json).not.toContain("img");
    expect(json).toContain(KEYS.inlineEquation);
  });

  test("Markdown round trips $x^2$ and keeps other dollar text as text", async () => {
    const parsed = await importEditorDocument("a $x^2$ b", "markdown");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    const block = parsed.value[0] as unknown as {
      children: { type?: string; texExpression?: string; text?: string }[];
    };
    expect(block.children.map((child) => child.texExpression ?? child.text)).toEqual([
      "a ",
      "x^2",
      " b",
    ]);
    const exported = await exportEditorDocument(parsed.value, "markdown");
    expect(exported.content.trim()).toBe("a $x^2$ b");
  });

  test("dollar amounts stay text both ways", async () => {
    const source = "costs $5 and $6 today";
    const parsed = await importEditorDocument(source, "markdown");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    expect(JSON.stringify(parsed.value)).not.toContain(KEYS.inlineEquation);
    const exported = await exportEditorDocument(parsed.value, "markdown");
    const again = await importEditorDocument(exported.content, "markdown");
    expect(again.ok).toBe(true);
    if (!again.ok) {
      return;
    }
    expect(texts({ children: again.value } as never)).toEqual([source]);
  });

  test("a literal dollar pair survives a round trip as text", async () => {
    const literal = [
      { type: KEYS.p, id: "p", children: [{ text: "price $x$ here" }] },
    ] as unknown as EditorValue;
    const exported = await exportEditorDocument(literal, "markdown");
    const again = await importEditorDocument(exported.content, "markdown");
    expect(again.ok).toBe(true);
    if (!again.ok) {
      return;
    }
    expect(JSON.stringify(again.value)).not.toContain(KEYS.inlineEquation);
    expect(JSON.stringify(again.value)).toContain("price $x$ here");
  });

  test("space-padded and code-span dollars are not equations", async () => {
    const spaced = await importEditorDocument("$ x $", "markdown");
    expect(spaced.ok && JSON.stringify(spaced.value)).not.toContain(KEYS.inlineEquation);
    const code = await importEditorDocument("`$x$`", "markdown");
    expect(code.ok).toBe(true);
    if (!code.ok) {
      return;
    }
    expect(JSON.stringify(code.value)).not.toContain(KEYS.inlineEquation);
    expect(JSON.stringify(code.value)).toContain('"code":true');
  });

  test("a block equation is still a block equation", async () => {
    const parsed = await importEditorDocument("$$\nx\n$$", "markdown");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    expect(parsed.value[0]?.type).toBe(KEYS.equation);
  });

  test("TeX with underscores, asterisks and backslashes round trips unchanged", async () => {
    const tex = "\\sum_{i=1}^{n} a_i*b_i";
    const source = [paragraphWith("p", [{ text: "s " }, eq("m", tex)])];
    const exported = await exportEditorDocument(source, "markdown");
    expect(exported.content).toContain(`$${tex}$`);
    const again = await importEditorDocument(exported.content, "markdown");
    expect(again.ok).toBe(true);
    if (!again.ok) {
      return;
    }
    expect(JSON.stringify(again.value)).toContain(
      `"texExpression":"${tex.replaceAll("\\", "\\\\")}"`,
    );
  });
});

describe("inline equation markdown read-back", () => {
  function para(children: unknown[]): EditorValue {
    return [paragraphWith("p", children)];
  }

  // Export, then import. Warning codes come from the export, which decides literal text.
  async function roundTrip(value: EditorValue) {
    const exported = await exportEditorDocument(value, "markdown");
    const imported = await importEditorDocument(exported.content, "markdown");
    if (!imported.ok) {
      throw new Error(imported.error);
    }
    return {
      markdown: exported.content,
      codes: exported.warnings.map((warning) => warning.code),
      children: (imported.value[0] as unknown as { children: Record<string, unknown>[] }).children,
    };
  }

  // Each child as its text, or as its equation source.
  function summary(children: Record<string, unknown>[]): unknown[] {
    return children.map((child) =>
      child.type === KEYS.inlineEquation ? { equation: child.texExpression } : child.text,
    );
  }

  test("case 1: an equation followed by a digit is written as text", async () => {
    const result = await roundTrip(para([{ text: "a " }, eq("e1", "x"), { text: "2 b" }]));
    expect(result.codes).toEqual(["inline-equation-text"]);
    expect(summary(result.children)).toEqual(["a $x$2 b"]);
  });

  test("case 2: an equation ending in an odd backslash is written as text", async () => {
    const result = await roundTrip(para([{ text: "a " }, eq("e1", "a\\")]));
    expect(result.codes).toEqual(["inline-equation-text"]);
    expect(summary(result.children)).toEqual(["a $a\\$"]);
  });

  test("case 3: surrounding spaces are dropped and the equation survives", async () => {
    const result = await roundTrip(para([{ text: "a " }, eq("e1", " x ")]));
    expect(result.codes).toEqual([]);
    expect(summary(result.children)).toEqual(["a ", { equation: "x" }]);
  });

  test("case 4: an unescaped dollar inside TeX is written as text, not as a wrong equation", async () => {
    const result = await roundTrip(para([{ text: "a " }, eq("e1", "\\text{$5}")]));
    expect(result.codes).toEqual(["inline-equation-text"]);
    expect(summary(result.children)).toEqual(["a $\\text{$5}$"]);
  });

  test("case 5: a newline in the source becomes a space", async () => {
    const result = await roundTrip(para([{ text: "a " }, eq("e1", "a\nb")]));
    expect(result.codes).toEqual([]);
    expect(summary(result.children)).toEqual(["a ", { equation: "a b" }]);
  });

  test("case 6: placeholder-shaped document text stays text", async () => {
    const result = await roundTrip(para([{ text: "%%NLEIEQ0041%% literal" }]));
    expect(result.codes).toEqual([]);
    expect(summary(result.children)).toEqual(["%%NLEIEQ0041%% literal"]);
  });

  test("an equation whose source ends in two backslashes reads back", async () => {
    const result = await roundTrip(para([{ text: "a " }, eq("e1", "a\\\\")]));
    expect(result.codes).toEqual([]);
    expect(summary(result.children)).toEqual(["a ", { equation: "a\\\\" }]);
  });

  test("text ending in a backslash before an equation keeps the equation", async () => {
    const result = await roundTrip(para([{ text: "a\\" }, eq("e1", "x")]));
    expect(result.codes).toEqual([]);
    expect(summary(result.children)).toEqual(["a\\", { equation: "x" }]);
  });

  test("adjacent equations, a pipe, and equations in blocks read back as equations", async () => {
    const adjacent = await importEditorDocument("$a$$b$", "markdown");
    expect(adjacent.ok && JSON.stringify(adjacent.value)).toContain('"texExpression":"a"');
    expect(adjacent.ok && JSON.stringify(adjacent.value)).toContain('"texExpression":"b"');

    const pipe = await importEditorDocument("a $|x|$ b", "markdown");
    expect(pipe.ok && JSON.stringify(pipe.value)).toContain('"texExpression":"|x|"');

    const heading = await importEditorDocument("# Head $a^2$ title", "markdown");
    expect(heading.ok && JSON.stringify(heading.value)).toContain('"type":"h1"');
    expect(heading.ok && JSON.stringify(heading.value)).toContain('"texExpression":"a^2"');

    const list = await importEditorDocument("- item $q_1*r$", "markdown");
    expect(list.ok && JSON.stringify(list.value)).toContain('"texExpression":"q_1*r"');

    const quote = await importEditorDocument("> quote $w$", "markdown");
    expect(quote.ok && JSON.stringify(quote.value)).toContain('"texExpression":"w"');

    const table = await importEditorDocument("| h |\n|---|\n| $z$ |", "markdown");
    expect(table.ok && JSON.stringify(table.value)).toContain('"texExpression":"z"');
  });

  test("code spans and fences keep dollar signs as code", async () => {
    const span = await importEditorDocument("`$x$` and $y$", "markdown");
    expect(span.ok && JSON.stringify(span.value)).toContain('"texExpression":"y"');
    expect(span.ok && JSON.stringify(span.value).match(/"texExpression"/g)?.length).toBe(1);

    const fence = await importEditorDocument("```\n$x$\n```", "markdown");
    expect(fence.ok && JSON.stringify(fence.value)).not.toContain(KEYS.inlineEquation);
    expect(fence.ok && JSON.stringify(fence.value)).toContain("$x$");
  });

  test("a single inline equation exports as dollars with no warning", async () => {
    const result = await roundTrip(para([{ text: "a " }, eq("e1", "x^2"), { text: " b" }]));
    expect(result.markdown.trim()).toBe("a $x^2$ b");
    expect(result.codes).toEqual([]);
  });
});
