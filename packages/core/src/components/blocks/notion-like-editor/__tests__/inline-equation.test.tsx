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
import { createEditorPlugins } from "../lib/plugins/editor-plugins";
import { NotionLikeEditorStatic } from "../notion-like-editor-static";
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
