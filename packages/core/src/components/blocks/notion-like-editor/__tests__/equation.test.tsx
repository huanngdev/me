import { describe, expect, test } from "bun:test";
import {
  BaseEquationPlugin,
  getEquationHtml,
  insertEquation as insertNativeEquation,
} from "@platejs/math";
import katex from "katex";
import { KEYS, createSlateEditor, type TElement, type TEquationElement } from "platejs";
import { createPlateEditor } from "platejs/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { runEditorCommand } from "../lib/commands/editor-commands";
import { createEditorDocument, serializeEditorDocument } from "../lib/document/editor-document";
import {
  EQUATION_EXPRESSION_MAX,
  allowedChildTypes,
  isStoredEquationExpression,
} from "../lib/document/editor-document-schema";
import { parseEditorDocument } from "../lib/document/editor-document-validate";
import {
  EQUATION_EMPTY_PLACEHOLDER,
  EQUATION_KATEX_OPTIONS,
  equationEditingId,
  insertEquation,
  loadKatex,
  removeEquationCommand,
  renderEquation,
} from "../lib/features/editor-equation";
import { createEditorPlugins } from "../lib/plugins/editor-plugins";
import { EditorSurface } from "../components/editor/editor-surface";
import type { EditorValue } from "../lib/document/editor-value";
import { caret, createEditor, expectOk, expectUnsupported, field } from "./test-utils";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

const QUADRATIC = "x=\\frac{-b\\pm\\sqrt{b^{2}-4ac}}{2a}";
const MATRIX = "\\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}";
const SUM = "\\sum_{n=1}^{\\infty}\\frac{1}{n^2}";

function paragraph(value: string, id = "p"): TElement {
  return { type: "p", id, children: [{ text: value }] };
}

function equation(id: string, texExpression = ""): TElement {
  return { type: "equation", id, texExpression, children: [{ text: "" }] };
}

function toggle(id: string, children: TElement[]): TElement {
  return { type: "toggle", id, children };
}

function quote(id: string, children: TElement[]): TElement {
  return { type: "blockquote", id, children };
}

function callout(id: string, children: TElement[]): TElement {
  return { type: "callout", id, children };
}

function columnGroup(child: TElement): TElement {
  return {
    type: "column_group",
    id: "group-1",
    children: [
      {
        type: "column",
        id: "column-1",
        width: "50%",
        children: [child],
      },
      {
        type: "column",
        id: "column-2",
        width: "50%",
        children: [paragraph("Note", "column-note")],
      },
    ],
  };
}

function tableWith(children: TElement[]): TElement {
  return {
    type: "table",
    id: "table-1",
    children: [
      {
        type: "tr",
        id: "row-1",
        children: [{ type: "td", id: "cell-1", children }],
      },
    ],
  };
}

function isReactContainer(value: object): value is Parameters<typeof createRoot>[0] {
  return "nodeType" in value && value.nodeType === 1;
}

function stubAnimationFrame(): () => void {
  const previousFrame = Reflect.get(globalThis, "requestAnimationFrame");
  const previousCancel = Reflect.get(globalThis, "cancelAnimationFrame");
  const previousWidth = Reflect.get(globalThis, "innerWidth");
  const previousHeight = Reflect.get(globalThis, "innerHeight");
  Reflect.set(globalThis, "requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  Reflect.set(globalThis, "cancelAnimationFrame", () => {});
  Reflect.set(globalThis, "innerWidth", 1280);
  Reflect.set(globalThis, "innerHeight", 800);
  return () => {
    Reflect.set(globalThis, "requestAnimationFrame", previousFrame);
    Reflect.set(globalThis, "cancelAnimationFrame", previousCancel);
    if (previousWidth === undefined) {
      Reflect.deleteProperty(globalThis, "innerWidth");
    } else {
      Reflect.set(globalThis, "innerWidth", previousWidth);
    }
    if (previousHeight === undefined) {
      Reflect.deleteProperty(globalThis, "innerHeight");
    } else {
      Reflect.set(globalThis, "innerHeight", previousHeight);
    }
  };
}

async function mountEquation(value: EditorValue, readOnly = false) {
  const restoreFrame = stubAnimationFrame();
  const before = new Set(Array.from(document.body.childNodes));
  const host = document.createElement("div");
  document.body.appendChild(host);
  const editor = createPlateEditor({ plugins: createEditorPlugins(), value });
  let root: Root | undefined;
  if (!isReactContainer(host)) {
    throw new Error("Missing mount node.");
  }

  await act(async () => {
    root = createRoot(host);
    root.render(
      <EditorSurface editor={editor} readOnly={readOnly} placeholder="" className="editor" />,
    );
    // KaTeX resolves on a microtask after the effect. Stay inside this act
    // until that setState is queued, or React warns that it ran outside act.
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
      for (const node of Array.from(document.body.childNodes)) {
        if (!before.has(node)) {
          node.remove();
        }
      }
      restoreFrame();
    },
  };
}

function openEquation(host: ParentNode): void {
  const target = host.querySelector(
    "[data-equation-empty], [data-equation-math], [data-equation-error], [data-equation-loading]",
  );
  if (!(target instanceof HTMLElement)) {
    throw new Error("Missing the equation.");
  }
  target.click();
}

function button(host: ParentNode, label: string): HTMLButtonElement {
  const node = host.querySelector(`[aria-label="${label}"]`);
  if (!(node instanceof HTMLButtonElement)) {
    const named = Array.from(host.querySelectorAll("button")).find(
      (candidate) => candidate.textContent === label,
    );
    if (!(named instanceof HTMLButtonElement)) {
      throw new Error(`Missing ${label}.`);
    }
    return named;
  }
  return node;
}

function isTextArea(node: Element | null): node is HTMLTextAreaElement {
  return node !== null && node.tagName === "TEXTAREA";
}

function sourceField(): HTMLTextAreaElement {
  const node = document.querySelector('[aria-label="Equation source"]');
  if (!isTextArea(node)) {
    throw new Error("Missing the equation source.");
  }
  return node;
}

function typeInto(textarea: HTMLTextAreaElement, value: string): void {
  const prototype: unknown = Object.getPrototypeOf(textarea);
  const descriptor =
    typeof prototype === "object" && prototype !== null
      ? Object.getOwnPropertyDescriptor(prototype, "value")
      : undefined;
  descriptor?.set?.call(textarea, value);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

function renderedDom(html: string): HTMLElement {
  const holder = document.createElement("div");
  holder.innerHTML = html;
  return holder;
}

function pressKey(target: HTMLElement, key: string, mod = false): boolean {
  const event = new KeyboardEvent("keydown", {
    key,
    metaKey: mod,
    ctrlKey: mod,
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(event);
  return event.defaultPrevented;
}

async function flushKatex(): Promise<void> {
  await act(async () => {
    await import("katex");
  });
}

describe("native @platejs/math equation", () => {
  test("the block plugin is a void and insertEquation writes an empty texExpression", () => {
    const editor = createSlateEditor({
      plugins: [BaseEquationPlugin],
      value: [paragraph("")],
    });

    expect(BaseEquationPlugin.key).toBe(KEYS.equation);
    expect(KEYS.equation).toBe("equation");
    insertNativeEquation(editor, { at: [1] });

    expect(editor.children[1]).toEqual({
      type: "equation",
      texExpression: "",
      children: [{ text: "" }],
    });
    expect(editor.api.isVoid(editor.children[1])).toBe(true);
    expect(Object.keys(EQUATION_KATEX_OPTIONS)).not.toContain("macros");
    expect(EQUATION_KATEX_OPTIONS).toEqual({
      displayMode: true,
      throwOnError: true,
      trust: false,
      strict: "ignore",
      maxSize: 10,
      maxExpand: 1000,
      output: "htmlAndMathml",
    });
  });

  test("native getEquationHtml forwards trust, and the editor options do not", () => {
    const element = {
      type: KEYS.equation,
      texExpression: "\\href{https://example.com}{x}",
      children: [{ text: "" }],
    } satisfies TEquationElement;
    const trusted = getEquationHtml({
      element,
      options: { displayMode: true, throwOnError: false, trust: true },
    });
    const safe = renderEquation(katex, "\\href{javascript:alert(1)}{x}");

    expect(renderedDom(trusted).querySelector("a")).not.toBeNull();
    expect(safe.ok).toBe(true);
    if (safe.ok) {
      const dom = renderedDom(safe.html);
      expect(dom.querySelector("a")).toBeNull();
      expect(dom.querySelector("[href]")).toBeNull();
    }
  });
});

describe("equation schema", () => {
  test("an equation round-trips and an empty expression is stored", () => {
    const content = [equation("eq-empty"), equation("eq-text", "a+b")];
    const parsed = expectOk(parseEditorDocument(createEditorDocument("doc-eq", content)));

    expect(parsed.repairs).toEqual([]);
    expect(parsed.document.content).toBe(content);
    expect(JSON.parse(serializeEditorDocument(createEditorDocument("doc-eq", content)))).toEqual(
      createEditorDocument("doc-eq", content),
    );
    expect(isStoredEquationExpression("")).toBe(true);
    expect(isStoredEquationExpression("a\nb\tc")).toBe(true);
  });

  test("a long expression, a control character, or an unknown attribute keeps the raw document", () => {
    const tooLong = equation("eq-long", "a".repeat(EQUATION_EXPRESSION_MAX + 1));
    const control = equation("eq-control", "a\u0001b");
    const carriage = equation("eq-cr", "a\rb");
    const html = { ...equation("eq-html", "a"), html: "<b>a</b>" };
    const rendered = { ...equation("eq-rendered", "a"), rendered: "<span>a</span>" };
    const displayMode = { ...equation("eq-mode", "a"), displayMode: true };
    const missing = { type: "equation", id: "eq-missing", children: [{ text: "" }] };
    const number = { ...equation("eq-number"), texExpression: 1 };

    for (const node of [tooLong, control, carriage, html, rendered, displayMode, missing, number]) {
      const raw = createEditorDocument("doc-bad", [node]);
      const parsed = expectUnsupported(parseEditorDocument(raw));
      expect(parsed.raw).toBe(raw);
    }

    expect(isStoredEquationExpression("a".repeat(EQUATION_EXPRESSION_MAX))).toBe(true);
  });

  test("an equation is allowed at the top, in a toggle, and in a column, and not in a cell", () => {
    expect(allowedChildTypes("toggle")).toContain(KEYS.equation);
    expect(allowedChildTypes(KEYS.column)).toContain(KEYS.equation);
    expect(allowedChildTypes("blockquote")).toEqual([KEYS.p]);
    expect(allowedChildTypes("callout")).toEqual([KEYS.p]);
    expect(allowedChildTypes("td")).toEqual([KEYS.p]);

    const nested = [
      equation("top", "a"),
      toggle("tg", [paragraph("Label", "label"), equation("in-toggle", "b")]),
      columnGroup(equation("in-column", "c")),
    ];
    const parsed = expectOk(parseEditorDocument(createEditorDocument("doc-nested", nested)));
    expect(parsed.document.content).toBe(nested);

    for (const node of [
      quote("quote-1", [paragraph("Said", "said"), equation("in-quote", "a")]),
      callout("callout-1", [paragraph("Note", "note"), equation("in-callout", "a")]),
      tableWith([paragraph("Cell", "cell"), equation("in-cell", "a")]),
    ]) {
      const raw = createEditorDocument("doc-container", [node]);
      expect(expectUnsupported(parseEditorDocument(raw)).raw).toBe(raw);
    }
  });
});

describe("equation render", () => {
  test("a fraction, a matrix, and a sum include MathML", () => {
    for (const expression of [QUADRATIC, MATRIX, SUM]) {
      const rendered = renderEquation(katex, expression);
      expect(rendered.ok).toBe(true);
      if (rendered.ok) {
        expect(rendered.html).toContain("<math");
      }
    }
  });

  test("invalid syntax shows the KaTeX message and the source", async () => {
    const rendered = renderEquation(katex, "\\frac{");
    expect(rendered.ok).toBe(false);
    if (!rendered.ok) {
      expect(rendered.message.length).toBeGreaterThan(0);
      expect(rendered.message).toContain("KaTeX");
    }

    const mounted = await mountEquation([equation("eq-bad", "\\frac{")]);
    try {
      await flushKatex();
      const error = mounted.host.querySelector("[data-equation-error]");
      expect(error?.textContent).toContain("KaTeX");
      expect(error?.textContent).toContain("\\frac{");
      expect(field(mounted.editor.children[0], "texExpression")).toBe("\\frac{");
    } finally {
      await mounted.cleanup();
    }
  });

  test("untrusted commands produce no link, class, or image", () => {
    const cases = [
      "\\href{javascript:alert(1)}{x}",
      "\\url{javascript:alert(1)}",
      "\\htmlClass{x}{y}",
      "\\htmlId{x}{y}",
      "\\htmlStyle{color:red}{y}",
      "\\htmlData{a=b}{y}",
      "\\includegraphics{https://example.com/a.png}",
    ];

    for (const expression of cases) {
      const rendered = renderEquation(katex, expression);
      expect(rendered.ok).toBe(true);
      if (!rendered.ok) {
        continue;
      }
      const dom = renderedDom(rendered.html);
      expect(dom.querySelector("a")).toBeNull();
      expect(dom.querySelector("[href]")).toBeNull();
      expect(dom.querySelector("img")).toBeNull();
      expect(dom.querySelector(".x")).toBeNull();
      expect(dom.querySelector("[class='x']")).toBeNull();
    }
  });

  test("a macro definition does not become a stored attribute", () => {
    const node = equation("eq-def", "\\newcommand{\\foo}{x}\\foo");
    const rendered = renderEquation(katex, "\\newcommand{\\foo}{x}\\foo");
    const parsed = expectOk(parseEditorDocument(createEditorDocument("doc-def", [node])));

    expect(rendered.ok).toBe(true);
    expect(field(parsed.document.content[0], "texExpression")).toBe("\\newcommand{\\foo}{x}\\foo");
    expect(JSON.stringify(parsed.document)).not.toContain("macros");
    expect("macros" in EQUATION_KATEX_OPTIONS).toBe(false);
  });

  test("maxExpand stops a recursive definition", () => {
    const started = Date.now();
    const rendered = renderEquation(katex, "\\def\\a{\\a\\a}\\a");
    expect(Date.now() - started).toBeLessThan(2000);
    expect(rendered.ok).toBe(false);
    if (!rendered.ok) {
      expect(rendered.message.toLowerCase()).toContain("maxexpand");
    }
  }, 2000);

  test("an empty equation shows a placeholder while editing and nothing in read-only", async () => {
    const editable = await mountEquation([equation("eq-empty")]);
    const readOnly = await mountEquation([equation("eq-empty")], true);
    try {
      await flushKatex();
      expect(editable.host.textContent).toContain(EQUATION_EMPTY_PLACEHOLDER);
      expect(readOnly.host.querySelector("[data-equation-empty]")).toBeNull();
      expect(readOnly.host.textContent).not.toContain(EQUATION_EMPTY_PLACEHOLDER);
    } finally {
      await editable.cleanup();
      await readOnly.cleanup();
    }
  });

  test("a wide expression scrolls inside the block", async () => {
    const mounted = await mountEquation([equation("eq-wide", "x".repeat(80))]);
    try {
      await flushKatex();
      const scroller = mounted.host.querySelector("[data-equation-scroll]");
      expect(scroller?.className).toContain("overflow-x-auto");
      expect(scroller?.className).toContain("max-w-full");
    } finally {
      await mounted.cleanup();
    }
  });
});

describe("equation editing", () => {
  test("Done writes one undo, Cancel and Escape write nothing, and an unchanged Done adds no history", async () => {
    const mounted = await mountEquation([paragraph("Before", "p1"), equation("eq-1", "a")]);
    try {
      await flushKatex();
      const undos = mounted.editor.history.undos.length;
      await act(async () => {
        openEquation(mounted.host);
      });
      const area = sourceField();
      const selection = JSON.stringify(mounted.editor.selection);
      await act(async () => {
        typeInto(area, "a+b");
      });
      expect(JSON.stringify(mounted.editor.selection)).toBe(selection);
      expect(mounted.editor.history.undos.length).toBe(undos);
      expect(field(mounted.editor.children[1], "texExpression")).toBe("a");

      await act(async () => {
        button(document.body, "Cancel").click();
      });
      expect(field(mounted.editor.children[1], "texExpression")).toBe("a");
      expect(mounted.editor.history.undos.length).toBe(undos);
      expect(equationEditingId(mounted.editor)).toBe("");

      await act(async () => {
        openEquation(mounted.host);
      });
      await act(async () => {
        typeInto(sourceField(), "a+c");
        pressKey(sourceField(), "Escape");
      });
      expect(field(mounted.editor.children[1], "texExpression")).toBe("a");
      expect(mounted.editor.history.undos.length).toBe(undos);

      await act(async () => {
        openEquation(mounted.host);
      });
      await act(async () => {
        typeInto(sourceField(), "\\frac{1}{2}");
        button(document.body, "Done").click();
      });
      expect(field(mounted.editor.children[1], "texExpression")).toBe("\\frac{1}{2}");
      expect(mounted.editor.history.undos.length).toBe(undos + 1);
      expect(document.querySelector('[aria-label="Equation source"]')).toBeNull();
      const editable = mounted.host.querySelector("[data-slate-editor]");
      const active = document.activeElement;
      expect(
        active === editable || (editable !== null && active !== null && editable.contains(active)),
      ).toBe(true);

      const afterDone = mounted.editor.history.undos.length;
      await act(async () => {
        openEquation(mounted.host);
      });
      await act(async () => {
        button(document.body, "Done").click();
      });
      expect(mounted.editor.history.undos.length).toBe(afterDone);
    } finally {
      await mounted.cleanup();
    }
  });

  test("Mod+Enter applies the draft and plain Enter does not submit", async () => {
    const mounted = await mountEquation([equation("eq-1", "a")]);
    try {
      await act(async () => {
        openEquation(mounted.host);
      });
      const area = sourceField();
      await act(async () => {
        typeInto(area, "b+c");
      });
      const submitted = await act(async () => pressKey(area, "Enter", true));
      expect(submitted).toBe(true);
      expect(field(mounted.editor.children[0], "texExpression")).toBe("b+c");

      await act(async () => {
        openEquation(mounted.host);
      });
      const again = sourceField();
      const newline = await act(async () => pressKey(again, "Enter", false));
      expect(newline).toBe(false);
      expect(field(mounted.editor.children[0], "texExpression")).toBe("b+c");
    } finally {
      await mounted.cleanup();
    }
  });

  test("a click outside the popover drops the draft", async () => {
    const mounted = await mountEquation([equation("eq-1", "a")]);
    const outside = document.createElement("button");
    outside.type = "button";
    outside.textContent = "Outside";
    document.body.appendChild(outside);
    try {
      const undos = mounted.editor.history.undos.length;
      await act(async () => {
        openEquation(mounted.host);
      });
      // Radix attaches the outside listener on a timer, then waits for click
      // after a left-button pointerdown (deferPointerDownOutside).
      await act(async () => {
        await new Promise((resolve) => {
          setTimeout(resolve, 0);
        });
      });
      await act(async () => {
        typeInto(sourceField(), "zzz");
        outside.dispatchEvent(
          new PointerEvent("pointerdown", { bubbles: true, cancelable: true, button: 0 }),
        );
        outside.dispatchEvent(
          new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }),
        );
      });
      expect(field(mounted.editor.children[0], "texExpression")).toBe("a");
      expect(mounted.editor.history.undos.length).toBe(undos);
      expect(equationEditingId(mounted.editor)).toBe("");
      expect(document.querySelector('[aria-label="Equation source"]')).toBeNull();
    } finally {
      outside.remove();
      await mounted.cleanup();
    }
  });

  test("Enter on the selected equation opens the editor and does not insert a paragraph", async () => {
    const mounted = await mountEquation([equation("eq-1", "a")]);
    try {
      const start = mounted.editor.api.start([0]);
      if (!start) {
        throw new Error("Missing the equation start.");
      }
      mounted.editor.tf.select(start);
      const undos = mounted.editor.history.undos.length;
      await act(async () => {
        mounted.editor.tf.insertBreak();
      });
      expect(mounted.editor.children.map((block) => block.type)).toEqual(["equation"]);
      expect(equationEditingId(mounted.editor)).toBe("eq-1");
      expect(mounted.editor.history.undos.length).toBe(undos);
      expect(sourceField().tagName).toBe("TEXTAREA");
    } finally {
      await mounted.cleanup();
    }
  });

  test("copy source writes the expression", async () => {
    const writes: string[] = [];
    const previous = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText(text: string) {
          writes.push(text);
          return Promise.resolve();
        },
      },
    });
    const mounted = await mountEquation(
      [paragraph("Before", "p1"), equation("eq-1", QUADRATIC)],
      true,
    );
    try {
      await act(async () => {
        button(mounted.host, "Copy source").click();
        await Promise.resolve();
      });
      expect(writes).toEqual([QUADRATIC]);
      expect(mounted.host.querySelector('[aria-label="Edit"]')).toBeNull();
      expect(mounted.host.querySelector('[aria-label="Delete"]')).toBeNull();
      expect(mounted.host.querySelector("[data-equation-toolbar]")).toBeNull();
    } finally {
      if (previous) {
        Object.defineProperty(navigator, "clipboard", previous);
      } else {
        Reflect.deleteProperty(navigator, "clipboard");
      }
      await mounted.cleanup();
    }
  });

  test("the click popover holds Copy and Delete and there is no hover toolbar or Edit button", async () => {
    const mounted = await mountEquation([equation("eq-1", "a")]);
    try {
      await flushKatex();
      expect(mounted.host.querySelector("[data-equation-toolbar]")).toBeNull();
      expect(mounted.host.querySelector('[aria-label="Edit"]')).toBeNull();
      expect(mounted.host.querySelector('[aria-label="Copy source"]')).toBeNull();
      await act(async () => {
        openEquation(mounted.host);
      });
      expect(document.querySelector("[data-equation-toolbar]")).toBeNull();
      expect(document.querySelector('[aria-label="Edit"]')).toBeNull();
      expect(button(document.body, "Copy source").getAttribute("data-variant")).not.toBe(
        "destructive",
      );
      expect(button(document.body, "Delete").getAttribute("data-variant")).toBe("destructive");
      expect(button(document.body, "Cancel")).toBeTruthy();
      expect(button(document.body, "Done")).toBeTruthy();
    } finally {
      await mounted.cleanup();
    }
  });

  test("Cancel does not call a scrolling focus", async () => {
    const mounted = await mountEquation([paragraph("Before", "p1"), equation("eq-1", "a")]);
    const focusCalls: Array<FocusOptions | undefined> = [];
    const scrolls: unknown[] = [];
    const originalFocus = HTMLElement.prototype.focus;
    const originalScroll = Element.prototype.scrollIntoView;
    HTMLElement.prototype.focus = function focusSpy(this: HTMLElement, options?: FocusOptions) {
      focusCalls.push(options);
      return originalFocus.call(this, options);
    };
    Element.prototype.scrollIntoView = function scrollSpy(
      this: Element,
      options?: boolean | ScrollIntoViewOptions,
    ) {
      scrolls.push(options);
    };
    try {
      await flushKatex();
      await act(async () => {
        openEquation(mounted.host);
      });
      focusCalls.length = 0;
      scrolls.length = 0;
      await act(async () => {
        button(document.body, "Cancel").click();
      });
      expect(scrolls).toEqual([]);
      expect(focusCalls.length).toBeGreaterThan(0);
      for (const options of focusCalls) {
        expect(options?.preventScroll).toBe(true);
      }
      expect(equationEditingId(mounted.editor)).toBe("");
    } finally {
      HTMLElement.prototype.focus = originalFocus;
      Element.prototype.scrollIntoView = originalScroll;
      await mounted.cleanup();
    }
  });
});

describe("equation commands", () => {
  test("insert opens the editor in one undo and remove takes one undo", async () => {
    const editor = createEditor([paragraph("Hi", "p1")]);
    editor.tf.select(caret([0, 0], 2));
    expect(runEditorCommand(editor, insertEquation, undefined, { readOnly: true })).toBe(false);
    expect(editor.children).toHaveLength(1);

    const before = editor.history.undos.length;
    expect(insertEquation.id).toBe("block.insert.equation");
    expect(insertEquation.label).toBe("Equation");
    expect(runEditorCommand(editor, insertEquation, undefined)).toBe(true);
    expect(editor.children.map((block) => block.type)).toEqual(["p", "equation"]);
    expect(field(editor.children[1], "texExpression")).toBe("");
    expect(equationEditingId(editor).length).toBeGreaterThan(0);
    expect(editor.history.undos.length).toBe(before + 1);

    editor.undo();
    expect(editor.children.map((block) => block.type)).toEqual(["p"]);
    expect(editor.history.undos.length).toBe(before);

    const mounted = await mountEquation([paragraph("Hi", "p1")]);
    try {
      mounted.editor.tf.select(caret([0, 0], 2));
      await act(async () => {
        runEditorCommand(mounted.editor, insertEquation, undefined);
        await loadKatex();
        await new Promise((resolve) => {
          setTimeout(resolve, 0);
        });
      });
      expect(sourceField().tagName).toBe("TEXTAREA");
      expect(mounted.editor.children.map((block) => block.type)).toEqual(["p", "equation"]);
      const inserted = mounted.editor.history.undos.length;
      let removed = false;
      await act(async () => {
        const equationStart = mounted.editor.api.start([1]);
        if (!equationStart) {
          throw new Error("Missing the inserted equation.");
        }
        mounted.editor.tf.select(equationStart);
        removed = runEditorCommand(mounted.editor, removeEquationCommand, undefined);
        await loadKatex();
      });
      expect(removed).toBe(true);
      expect(mounted.editor.children.map((block) => block.type)).toEqual(["p"]);
      expect(mounted.editor.history.undos.length).toBe(inserted + 1);
      expect(
        runEditorCommand(mounted.editor, removeEquationCommand, undefined, { readOnly: true }),
      ).toBe(false);
      await flushKatex();
    } finally {
      await mounted.cleanup();
    }
  });

  test("pasting a selected equation keeps the expression and assigns a new id", () => {
    const editor = createEditor([equation("eq-1", "a+b"), paragraph("", "p1")]);
    editor.tf.select(caret([1, 0], 0));
    editor.tf.insertFragment([equation("eq-1", "a+b")]);

    const equations = editor.children.filter((block) => block.type === "equation");
    expect(equations).toHaveLength(2);
    expect(equations.map((block) => field(block, "texExpression"))).toEqual(["a+b", "a+b"]);
    const ids = equations.map((block) => field(block, "id"));
    expect(ids[0]).toBe("eq-1");
    expect(typeof ids[1]).toBe("string");
    expect(ids[1]).not.toBe("eq-1");
  });

  test("a quote, a callout, and a table cell lift the block out", () => {
    const quoted = createEditor([
      quote("quote-1", [paragraph("Said", "said"), equation("eq-quote", "a")]),
    ]);
    const noted = createEditor([
      callout("callout-1", [paragraph("Note", "note"), equation("eq-callout", "b")]),
    ]);
    const table = createEditor([tableWith([paragraph("Cell", "cell"), equation("eq-table", "c")])]);
    quoted.tf.normalize({ force: true });
    noted.tf.normalize({ force: true });
    table.tf.normalize({ force: true });

    expect(quoted.children.map((block) => block.type)).toEqual(["blockquote", "equation"]);
    expect(noted.children.map((block) => block.type)).toEqual(["callout", "equation"]);
    expect(table.children.map((block) => block.type)).toEqual(["table", "equation"]);
    expect(field(quoted.children[1], "texExpression")).toBe("a");
    expect(field(table.children[1], "id")).toBe("eq-table");
  });
});
