import { describe, expect, test } from "bun:test";
import { KEYS } from "platejs";
import { createPlateEditor as createReactEditor } from "platejs/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";

import { EditorSurface } from "../components/editor/editor-surface";
import { FOOTNOTE_DEF_KEY, FOOTNOTE_REF_KEY } from "../lib/document/editor-document-schema";
import type { EditorValue } from "../lib/document/editor-value";
import { footnoteIndex } from "../lib/features/editor-footnote";
import { inlineDateNode } from "../lib/features/editor-inline-date";
import { preparePastedFragment } from "../lib/paste/editor-paste";
import { createEditorPlugins } from "../lib/plugins/editor-plugins";
import { NotionLikeEditorStatic } from "../notion-like-editor-static";
import { caret, createEditor, deserializeHtmlInDom, texts } from "./test-utils";
import { def, para, ref, text } from "./footnote-fixtures";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

function collect(value: unknown, type: string): Record<string, unknown>[] {
  const found: Record<string, unknown>[] = [];
  const visit = (node: unknown): void => {
    if (typeof node !== "object" || node === null) {
      return;
    }
    if ("type" in node && node.type === type) {
      found.push(node as Record<string, unknown>);
    }
    if ("children" in node && Array.isArray(node.children)) {
      node.children.forEach(visit);
    }
  };
  if (Array.isArray(value)) {
    value.forEach(visit);
  } else {
    visit(value);
  }
  return found;
}

function clipboard(): { data: DataTransfer; written: Map<string, string> } {
  const written = new Map<string, string>();
  const data = {
    setData: (type: string, value: string) => {
      written.set(type, value);
    },
    getData: (type: string) => written.get(type) ?? "",
  } as unknown as DataTransfer;
  return { data, written };
}

describe("footnote paste", () => {
  test("a fragment copied from the editor keeps its reference and definition", () => {
    const source = createEditor([
      para("src", [text("see "), ref("r-src", "note")]),
      def("d-src", "note", "the note"),
    ] as unknown as EditorValue);
    source.tf.select({
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [1, 0], offset: 8 },
    });
    const fragment = source.api.getFragment();

    const target = createEditor([para("t", [text("")])] as unknown as EditorValue);
    target.tf.select(caret([0, 0], 0));
    const value = preparePastedFragment(target, fragment);
    target.tf.insertFragment(value);

    expect(collect(target.children, FOOTNOTE_REF_KEY).map((node) => node.footnoteId)).toEqual([
      "note",
    ]);
    expect(collect(target.children, FOOTNOTE_DEF_KEY).map((node) => node.footnoteId)).toEqual([
      "note",
    ]);
    expect(collect(target.children, FOOTNOTE_REF_KEY)[0]?.id).not.toBe("r-src");
  });

  test("a pasted definition whose id already exists in the document gets a fresh id", () => {
    const target = createEditor([
      para("t", [text("a")]),
      def("d-old", "note", "old"),
    ] as unknown as EditorValue);

    const value = preparePastedFragment(target, [def("d-new", "note", "new")]);

    const [pasted] = value;
    expect(pasted?.type).toBe(FOOTNOTE_DEF_KEY);
    expect(pasted && "footnoteId" in pasted ? pasted.footnoteId : undefined).not.toBe("note");
    expect(JSON.stringify(value)).toContain("new");
  });

  test("the same definition pasted three times gives three definitions with three ids and the text kept", () => {
    const target = createEditor([para("t", [text("start")])] as unknown as EditorValue);
    const fragment = [def("d", "note", "repeat me")];

    // Each paste starts on a new empty paragraph. A caret inside a definition would merge the text.
    for (let index = 0; index < 3; index += 1) {
      const last = target.children.length;
      target.tf.insertNodes(para(`empty-${index}`, [text("")]), { at: [last] });
      target.tf.select(caret([last, 0], 0));
      target.tf.insertFragment(preparePastedFragment(target, fragment));
    }

    const defs = collect(target.children, FOOTNOTE_DEF_KEY);
    expect(defs).toHaveLength(3);
    expect(new Set(defs.map((node) => node.id)).size).toBe(3);
    expect(new Set(defs.map((node) => node.footnoteId)).size).toBe(3);
    expect(texts(target).filter((line) => line === "repeat me")).toHaveLength(3);
  });

  test("a pasted definition landing inside a toggle becomes a paragraph", () => {
    const target = createEditor([
      {
        type: KEYS.toggle,
        id: "t",
        children: [
          { type: KEYS.p, id: "label", children: [text("label")] },
          { type: KEYS.p, id: "body", children: [text("body")] },
        ],
      },
    ] as unknown as EditorValue);
    target.tf.select(caret([0, 1, 0], 4));

    target.tf.insertFragment([def("d", "note", "inside")] as unknown as EditorValue);

    expect(collect(target.children, FOOTNOTE_DEF_KEY)).toHaveLength(0);
    expect(JSON.stringify(target.children)).toContain("inside");
  });

  test("a reference pasted into a code line is dropped", () => {
    const value = preparePastedFragment(createEditor(), [
      {
        type: KEYS.codeBlock,
        id: "cb",
        children: [{ type: KEYS.codeLine, id: "cl", children: [text("code "), ref("r", "note")] }],
      },
    ]);

    expect(JSON.stringify(value)).not.toContain(FOOTNOTE_REF_KEY);
    expect(JSON.stringify(value)).toContain("code");
  });

  test("a reference with an invalid footnoteId is dropped when pasted", () => {
    const value = preparePastedFragment(createEditor(), [
      para("src", [
        text("a"),
        { type: FOOTNOTE_REF_KEY, id: "r", footnoteId: "bad id!", children: [{ text: "" }] },
      ]),
    ]);

    expect(JSON.stringify(value)).not.toContain(FOOTNOTE_REF_KEY);
  });

  test("an external superscript link pasted from HTML creates no footnote reference", () => {
    const editor = createEditor([para("t", [text("")])] as unknown as EditorValue);
    editor.tf.select(caret([0, 0], 0));
    editor.tf.insertFragment(
      deserializeHtmlInDom(
        editor,
        '<p>Claim<sup><a href="#fn1">1</a></sup> and <sup>[^2]</sup></p><ol><li id="fn1">note</li></ol>',
      ),
    );

    expect(JSON.stringify(editor.children)).not.toContain(FOOTNOTE_REF_KEY);
    expect(JSON.stringify(editor.children)).not.toContain(FOOTNOTE_DEF_KEY);
  });
});

describe("footnote plain-text copy", () => {
  test("a reference copies as its number and a definition as number, dot, and text", () => {
    const editor = createEditor([
      para("p", [text("claim "), ref("r", "note")]),
      def("d", "note", "the note"),
    ] as unknown as EditorValue);
    editor.tf.select({ anchor: { path: [0, 0], offset: 0 }, focus: { path: [1, 0], offset: 8 } });
    const { data, written } = clipboard();

    editor.tf.setFragmentData(data);

    expect(written.get("text/plain")).toBe("claim [1]\n1. the note");
  });

  test("an unreferenced definition copies as its text only", () => {
    const editor = createEditor([def("d", "orphan", "alone")] as unknown as EditorValue);
    editor.tf.select({ anchor: { path: [0, 0], offset: 0 }, focus: { path: [0, 0], offset: 5 } });
    const { data, written } = clipboard();

    editor.tf.setFragmentData(data);

    expect(written.get("text/plain")).toBe("alone");
  });

  test("a fragment with a footnote and a date copies both as text", () => {
    const editor = createEditor([
      para("p", [text("due "), inlineDateNode("2026-10-12", "d1"), text(" "), ref("r", "note")]),
      def("d", "note", "n"),
    ] as unknown as EditorValue);
    editor.tf.select({ anchor: { path: [0, 0], offset: 0 }, focus: { path: [1, 0], offset: 1 } });
    const { data, written } = clipboard();

    editor.tf.setFragmentData(data);

    expect(written.get("text/plain")).toBe("due Oct 12, 2026 [1]\n1. n");
  });
});

describe("footnote rendering in the editor", () => {
  async function mount(value: EditorValue, readOnly = true) {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const editor = createReactEditor({ plugins: createEditorPlugins(), value });
    let root: Root | undefined;
    await act(async () => {
      root = createRoot(host);
      root.render(
        <EditorSurface editor={editor} readOnly={readOnly} placeholder="" className="editor" />,
      );
    });
    return {
      editor,
      host,
      unmount: async () => {
        await act(async () => {
          root?.unmount();
        });
        host.remove();
      },
    };
  }

  test("references show their numbers, a shared number, and ? for a missing definition", async () => {
    const mounted = await mount([
      para("p1", [text("a "), ref("r1", "one")]),
      para("p2", [text("b "), ref("r2", "two")]),
      para("p3", [text("c "), ref("r3", "one")]),
      para("p4", [text("d "), ref("r4", "missing")]),
      def("d1", "one", "first"),
      def("d2", "two", "second"),
    ] as unknown as EditorValue);
    try {
      const labels = [...mounted.host.querySelectorAll("[data-footnote-ref]")].map(
        (node) => node.textContent,
      );
      expect(labels).toEqual(["1", "2", "1", "?"]);
      expect(
        mounted.host
          .querySelector('[data-footnote-ref][data-footnote-id="missing"]')
          ?.hasAttribute("data-footnote-missing"),
      ).toBe(true);
      expect(
        mounted.host
          .querySelector('[data-footnote-ref][data-footnote-id="one"]')
          ?.hasAttribute("data-footnote-missing"),
      ).toBe(false);
    } finally {
      await mounted.unmount();
    }
  });

  test("definitions show their numbers and an unreferenced definition has no number", async () => {
    const mounted = await mount([
      para("p1", [text("a "), ref("r1", "one")]),
      def("d1", "one", "first"),
      def("d2", "orphan", "lonely"),
    ] as unknown as EditorValue);
    try {
      const defs = [...mounted.host.querySelectorAll("[data-footnote-def]")];
      expect(defs).toHaveLength(2);
      expect(defs[0]?.textContent).toContain("1.");
      expect(defs[0]?.hasAttribute("data-footnote-unreferenced")).toBe(false);
      expect(defs[1]?.hasAttribute("data-footnote-unreferenced")).toBe(true);
      expect(defs[1]?.textContent).not.toContain("1.");
    } finally {
      await mounted.unmount();
    }
  });

  test("numbers update after a block with a reference moves above another", async () => {
    const mounted = await mount(
      [
        para("p1", [text("first "), ref("r1", "a")]),
        para("p2", [text("second "), ref("r2", "b")]),
        def("da", "a", "A"),
        def("db", "b", "B"),
      ] as unknown as EditorValue,
      false,
    );
    try {
      const before = [...mounted.host.querySelectorAll("[data-footnote-ref]")].map(
        (node) => node.textContent,
      );
      expect(before).toEqual(["1", "2"]);

      await act(async () => {
        mounted.editor.tf.moveNodes({ at: [1], to: [0] });
      });

      const after = [...mounted.host.querySelectorAll("[data-footnote-ref]")].map((node) => ({
        id: node.getAttribute("data-footnote-id"),
        label: node.textContent,
      }));
      expect(after).toEqual([
        { id: "b", label: "1" },
        { id: "a", label: "2" },
      ]);
    } finally {
      await mounted.unmount();
    }
  });
});

describe("footnote static HTML", () => {
  const value = [
    para("p1", [text("a "), ref("r1", "one")]),
    para("p2", [text("b "), ref("r2", "one")]),
    para("p3", [text("c "), ref("r3", "gone")]),
    def("d1", "one", "first"),
    def("d2", "orphan", "lonely"),
  ] as unknown as EditorValue;

  test("references link to their definition and carry numbered ids", () => {
    const html = renderToStaticMarkup(<NotionLikeEditorStatic value={value} />);

    expect(html).toContain('id="fnref-one-1"');
    expect(html).toContain('id="fnref-one-2"');
    expect(html).toContain('href="#fn-one"');
    expect(html).toContain('id="fn-one"');
  });

  test("a missing definition renders a plain ? without a link", () => {
    const html = renderToStaticMarkup(<NotionLikeEditorStatic value={value} />);

    expect(html).toContain("<sup>?</sup>");
    expect(html).not.toContain('href="#fn-gone"');
  });

  test("the back link appears only on a referenced definition", () => {
    const html = renderToStaticMarkup(<NotionLikeEditorStatic value={value} />);

    expect(html).toContain('href="#fnref-one-1"');
    expect(html).toContain('aria-label="Back to reference"');
    expect(html.match(/aria-label="Back to reference"/g)).toHaveLength(1);
  });

  test("the static index numbers the same references the editor numbers", () => {
    const index = footnoteIndex(createEditor(value));

    expect(index.numbers.get("one")).toBe(1);
    expect(index.numbers.has("gone")).toBe(true);
    expect(index.definitions.has("orphan")).toBe(true);
  });
});
