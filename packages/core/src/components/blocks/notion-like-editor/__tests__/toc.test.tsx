import { describe, expect, test } from "bun:test";
import { BaseTocPlugin, isHeading } from "@platejs/toc";
import { TocPlugin, useTocElementState } from "@platejs/toc/react";
import { KEYS, type SlateEditor, type TElement } from "platejs";
import { Plate, createPlateEditor } from "platejs/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { runEditorCommand } from "../lib/commands/editor-commands";
import { createEditorDocument, serializeEditorDocument } from "../lib/document/editor-document";
import { allowedChildTypes } from "../lib/document/editor-document-schema";
import { parseEditorDocument } from "../lib/document/editor-document-validate";
import { createEditorPlugins } from "../lib/plugins/editor-plugins";
import { readToggleOpenIds } from "../lib/plugins/editor-toggle";
import {
  TOC_EMPTY_PLACEHOLDER,
  TOC_UNTITLED,
  insertToc,
  removeTocCommand,
  setTocDepthCommand,
  tocEntries,
} from "../lib/features/editor-toc";
import { HEADING_STYLES, headingAnchorId } from "../components/elements/heading-element";
import { EditorSurface } from "../components/editor/editor-surface";
import type { EditorValue } from "../lib/document/editor-value";
import { caret, createEditor, expectOk, expectUnsupported, field } from "./test-utils";

function text(value: string, marks?: Record<string, boolean>): TElement["children"][number] {
  return marks === undefined ? { text: value } : { text: value, ...marks };
}

function heading(type: "h1" | "h2" | "h3", value: string, id: string): TElement {
  return { type, id, children: [{ text: value }] };
}

function paragraph(value: string, id = "p"): TElement {
  return { type: "p", id, children: [{ text: value }] };
}

function toc(id = "toc-1", maxDepth?: 1 | 2 | 3): TElement {
  const node: TElement = { type: "toc", id, children: [{ text: "" }] };
  if (maxDepth !== undefined) {
    node.maxDepth = maxDepth;
  }
  return node;
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

function columnGroup(): TElement {
  return {
    type: "column_group",
    id: "group-1",
    children: [
      {
        type: "column",
        id: "column-1",
        width: "50%",
        children: [heading("h2", "In a column", "column-heading")],
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
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
  Reflect.set(globalThis, "innerWidth", 1280);
  Reflect.set(globalThis, "innerHeight", 800);
  return () => {
    Reflect.set(globalThis, "requestAnimationFrame", previousFrame);
    Reflect.set(globalThis, "cancelAnimationFrame", previousCancel);
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT");
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

async function mountToc(value: EditorValue, readOnly = false) {
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

function labels(host: ParentNode): string[] {
  return Array.from(host.querySelectorAll("[data-toc-target]"), (node) => node.textContent ?? "");
}

function targets(host: ParentNode): string[] {
  return Array.from(host.querySelectorAll("[data-toc-target]"), (node) => {
    const target = node.getAttribute("data-toc-target");
    return target ?? "";
  });
}

function buttonFor(host: ParentNode, id: string): HTMLButtonElement {
  const node = host.querySelector(`[data-toc-target="${id}"]`);
  if (!(node instanceof HTMLButtonElement)) {
    throw new Error(`Missing table of contents entry ${id}.`);
  }
  return node;
}

// The mount helper runs animation frames immediately, which is before the rest of
// the click listeners. Queue the frame and flush it after the event instead.
async function flushAfter(run: () => void): Promise<void> {
  const queued: FrameRequestCallback[] = [];
  const previous = Reflect.get(globalThis, "requestAnimationFrame");
  Reflect.set(globalThis, "requestAnimationFrame", (callback: FrameRequestCallback) => {
    queued.push(callback);
    return queued.length;
  });
  await act(async () => {
    run();
  });
  await act(async () => {
    const batch = queued.splice(0);
    for (const callback of batch) {
      callback(0);
    }
  });
  Reflect.set(globalThis, "requestAnimationFrame", previous);
}

function snapshot(editor: SlateEditor): string {
  return JSON.stringify(editor.children);
}

describe("native @platejs/toc plugin", () => {
  test("isHeading matches h1 through h6 and the plugin scrolls with a fixed offset", () => {
    const editor = createEditor();
    const options = editor.getOptions(BaseTocPlugin);

    expect(BaseTocPlugin.key).toBe(KEYS.toc);
    expect(KEYS.toc).toBe("toc");
    expect(options.isScroll).toBe(true);
    expect(options.topOffset).toBe(80);
    expect("scrollContainerSelector" in options).toBe(false);
    for (const type of ["h1", "h2", "h3", "h4", "h5", "h6"]) {
      expect(isHeading({ type, children: [{ text: "A" }] })).toBe(true);
    }
    expect(isHeading({ type: "p", children: [{ text: "A" }] })).toBe(false);
    expect(isHeading({ type: "toggle", children: [{ text: "" }] })).toBe(false);
    expect(isHeading({ type: "toc", children: [{ text: "" }] })).toBe(false);
    expect(isHeading({ type: "column", children: [{ text: "" }] })).toBe(false);
  });

  test("getHeadingList keeps nested headings, skips an empty title, and uses the block id", async () => {
    const restoreFrame = stubAnimationFrame();
    const previousObserver = Reflect.get(globalThis, "IntersectionObserver");
    class Observer {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
      takeRecords(): [] {
        return [];
      }
    }
    Reflect.set(globalThis, "IntersectionObserver", Observer);

    function NativeList() {
      const state = useTocElementState();
      return (
        <ul data-native-headings>
          {state.headingList.map((item, index) => (
            <li key={index} data-id={item.id} data-depth={item.depth} data-type={item.type}>
              {item.title}
            </li>
          ))}
        </ul>
      );
    }

    const value = [
      heading("h1", "Alpha", "a"),
      { type: "h2", id: "b", children: [{ text: "  Beta  " }] },
      heading("h1", "", "empty"),
      {
        type: "h1",
        id: "marks",
        children: [text("Bo", { bold: true }), { text: "ld" }],
      },
      heading("h1", "Alpha", "same"),
      toggle("tg", [heading("h3", "Label", "label"), paragraph("Inside", "inside")]),
      columnGroup(),
      { type: "h4", id: "deep", children: [{ text: "Four" }] },
      toc("toc-native"),
      paragraph("Nope", "plain"),
    ];
    const editor = createPlateEditor({ plugins: [TocPlugin], value });
    const host = document.createElement("div");
    document.body.appendChild(host);
    if (!isReactContainer(host)) {
      throw new Error("Missing mount node.");
    }
    let root: Root | undefined;
    await act(async () => {
      root = createRoot(host);
      root.render(
        <Plate editor={editor}>
          <NativeList />
        </Plate>,
      );
    });

    const items = Array.from(host.querySelectorAll("[data-id]"));
    expect(items.map((item) => item.getAttribute("data-id"))).toEqual([
      "a",
      "b",
      "marks",
      "same",
      "label",
      "column-heading",
      "deep",
    ]);
    expect(items.map((item) => item.textContent)).toEqual([
      "Alpha",
      "  Beta  ",
      "Bold",
      "Alpha",
      "Label",
      "In a column",
      "Four",
    ]);
    expect(items.map((item) => item.getAttribute("data-depth"))).toEqual([
      "1",
      "2",
      "1",
      "1",
      "3",
      "2",
      "4",
    ]);
    expect(items.map((item) => item.getAttribute("data-type"))).toEqual([
      "h1",
      "h2",
      "h1",
      "h1",
      "h3",
      "h2",
      "h4",
    ]);

    await act(async () => {
      root?.unmount();
    });
    host.remove();
    restoreFrame();
    if (previousObserver === undefined) {
      Reflect.deleteProperty(globalThis, "IntersectionObserver");
    } else {
      Reflect.set(globalThis, "IntersectionObserver", previousObserver);
    }
  });
});

describe("toc schema", () => {
  test("a table of contents round-trips with and without maxDepth", () => {
    const absent = [toc("toc-absent"), heading("h1", "Title", "heading-1")];
    const stored = [toc("toc-depth", 2)];
    const absentResult = expectOk(parseEditorDocument(createEditorDocument("doc-absent", absent)));
    const storedResult = expectOk(parseEditorDocument(createEditorDocument("doc-depth", stored)));

    expect(absentResult.repairs).toEqual([]);
    expect(absentResult.document.content).toBe(absent);
    expect(storedResult.document.content).toBe(stored);
    expect(JSON.parse(serializeEditorDocument(createEditorDocument("doc-depth", stored)))).toEqual(
      createEditorDocument("doc-depth", stored),
    );
  });

  test("a bad maxDepth, entries, title, or unknown attribute keeps the raw document", () => {
    const cases = [
      toc("bad-0"),
      toc("bad-4"),
      toc("bad-string"),
      toc("bad-fraction"),
      toc("bad-entries"),
      toc("bad-title"),
      toc("bad-gap"),
    ];
    cases[0] = { ...toc("bad-0"), maxDepth: 0 };
    cases[1] = { ...toc("bad-4"), maxDepth: 4 };
    cases[2] = { ...toc("bad-string"), maxDepth: "2" };
    cases[3] = { ...toc("bad-fraction"), maxDepth: 2.5 };
    cases[4] = { ...toc("bad-entries"), entries: [{ title: "A" }] };
    cases[5] = { ...toc("bad-title"), title: "Outline" };
    cases[6] = { ...toc("bad-gap"), gap: 8 };

    for (const node of cases) {
      const raw = createEditorDocument("doc-bad", [node]);
      const parsed = expectUnsupported(parseEditorDocument(raw));
      expect(parsed.raw).toBe(raw);
    }
  });

  test("a table of contents is allowed at the top, in a toggle, and in a column", () => {
    expect(allowedChildTypes("toggle")).toContain(KEYS.toc);
    expect(allowedChildTypes(KEYS.column)).toContain(KEYS.toc);
    expect(allowedChildTypes("blockquote")).toEqual([KEYS.p]);
    expect(allowedChildTypes("callout")).toEqual([KEYS.p]);
    expect(allowedChildTypes("td")).toEqual([KEYS.p]);
    expect(allowedChildTypes("th")).toEqual([KEYS.p]);

    const nested = [
      toc("top"),
      toggle("tg", [paragraph("Label", "label"), toc("in-toggle")]),
      columnGroup(),
      toc("second"),
    ];
    const column = nested[2];
    if (!column || column.type !== "column_group") {
      throw new Error("Missing the column group.");
    }
    const firstColumn = column.children[0];
    if (!firstColumn || !("children" in firstColumn) || !Array.isArray(firstColumn.children)) {
      throw new Error("Missing the column.");
    }
    firstColumn.children = [heading("h2", "In a column", "column-heading"), toc("in-column")];
    const parsed = expectOk(parseEditorDocument(createEditorDocument("doc-nested", nested)));
    expect(parsed.document.content).toBe(nested);
  });
});

describe("toc outline", () => {
  function sample(): TElement[] {
    return [
      toc("outline"),
      heading("h1", "Alpha", "h-alpha"),
      {
        type: "h2",
        id: "h-marked",
        children: [text("  <b>Hi</b>  ", { bold: true }), { text: " there" }],
      },
      heading("h2", "Alpha", "h-again"),
      heading("h3", "   ", "h-empty"),
      heading("h1", "Later", "h-later"),
      toggle("tg", [heading("h2", "Toggle label", "h-label"), paragraph("Inside", "h-inner")]),
      columnGroup(),
      toc("other"),
    ];
  }

  test("entries follow document order, ignore other tables of contents, and flatten text", () => {
    const editor = createEditor(sample());
    const entries = tocEntries(editor, 3);

    expect(entries.map((entry) => entry.title)).toEqual([
      "Alpha",
      "<b>Hi</b> there",
      "Alpha",
      "",
      "Later",
      "Toggle label",
      "In a column",
    ]);
    expect(entries.map((entry) => entry.id)).toEqual([
      "h-alpha",
      "h-marked",
      "h-again",
      "h-empty",
      "h-later",
      "h-label",
      "column-heading",
    ]);
    expect(entries.map((entry) => entry.depth)).toEqual([1, 2, 2, 3, 1, 2, 2]);
    expect(tocEntries(editor, 1).map((entry) => entry.id)).toEqual(["h-alpha", "h-later"]);
    expect(tocEntries(editor, 2).map((entry) => entry.id)).toEqual([
      "h-alpha",
      "h-marked",
      "h-again",
      "h-later",
      "h-label",
      "column-heading",
    ]);
  });

  test("the mounted outline renders plain text, Untitled, and relative indents", async () => {
    const mounted = await mountToc([
      toc("outline"),
      heading("h2", "Alpha", "h-alpha"),
      heading("h2", "Alpha", "h-again"),
      heading("h3", "   ", "h-empty"),
      heading("h3", "<img src=x onerror=alert(1)>", "h-html"),
    ]);

    expect(labels(mounted.host)).toEqual([
      "Alpha",
      "Alpha",
      TOC_UNTITLED,
      "<img src=x onerror=alert(1)>",
    ]);
    expect(targets(mounted.host)).toEqual(["h-alpha", "h-again", "h-empty", "h-html"]);
    expect(buttonFor(mounted.host, "h-alpha").getAttribute("data-toc-indent")).toBe("0");
    expect(buttonFor(mounted.host, "h-html").getAttribute("data-toc-indent")).toBe("1");
    expect(buttonFor(mounted.host, "h-empty").getAttribute("data-toc-untitled")).toBe("true");
    expect(buttonFor(mounted.host, "h-html").querySelector("img")).toBeNull();
    expect(buttonFor(mounted.host, "h-html").innerHTML).toContain("&lt;img");
    expect(HEADING_STYLES.h1).toContain("scroll-mt-24");
    expect(headingAnchorId("h-alpha")).toBe("heading-h-alpha");

    await mounted.cleanup();
  });

  test("an empty outline shows the placeholder only while editing", async () => {
    const editing = await mountToc([toc("outline"), paragraph("Body", "body")]);
    expect(editing.host.textContent).toContain(TOC_EMPTY_PLACEHOLDER);
    await editing.cleanup();

    const reading = await mountToc([toc("outline"), paragraph("Body", "body")], true);
    expect(reading.host.textContent).not.toContain(TOC_EMPTY_PLACEHOLDER);
    expect(reading.host.querySelector("[data-toc-toolbar]")).toBeNull();
    await reading.cleanup();
  });

  test("rename, reorder, delete, and undo update the same mounted outline", async () => {
    const mounted = await mountToc([
      heading("h1", "One", "one"),
      heading("h2", "Two", "two"),
      toc("outline"),
    ]);

    expect(labels(mounted.host)).toEqual(["One", "Two"]);
    await act(async () => {
      mounted.editor.tf.select(caret([0, 0], 3));
      mounted.editor.tf.insertText("!");
    });
    expect(labels(mounted.host)).toEqual(["One!", "Two"]);

    await act(async () => {
      mounted.editor.tf.moveNodes({ at: [1], to: [0] });
    });
    expect(labels(mounted.host)).toEqual(["Two", "One!"]);

    await act(async () => {
      mounted.editor.tf.removeNodes({ at: [0] });
    });
    expect(labels(mounted.host)).toEqual(["One!"]);

    await act(async () => {
      mounted.editor.tf.undo();
    });
    expect(labels(mounted.host)).toEqual(["Two", "One!"]);
    await mounted.cleanup();
  });
});

describe("toc navigation", () => {
  function spyScroll(): { calls: unknown[]; restore: () => void } {
    const calls: unknown[] = [];
    const previous = Reflect.get(HTMLElement.prototype, "scrollIntoView");
    Reflect.set(HTMLElement.prototype, "scrollIntoView", (options?: unknown) => {
      calls.push(options);
    });
    return {
      calls,
      restore: () => {
        Reflect.set(HTMLElement.prototype, "scrollIntoView", previous);
      },
    };
  }

  function stubMotion(reduced: boolean): () => void {
    const previous = window.matchMedia;
    window.matchMedia = (query: string) => ({
      matches: reduced && query === "(prefers-reduced-motion: reduce)",
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    });
    return () => {
      window.matchMedia = previous;
    };
  }

  test("click, Enter, and Space place the caret at the heading without a history entry", async () => {
    const mounted = await mountToc([
      toc("outline"),
      heading("h1", "Far", "far"),
      heading("h2", "Near", "near"),
    ]);
    const scroll = spyScroll();
    const undos = mounted.editor.history.undos.length;
    const before = snapshot(mounted.editor);
    expect(mounted.host.querySelector("#heading-far")?.hasAttribute("tabindex")).toBe(false);

    await flushAfter(() => {
      buttonFor(mounted.host, "far").click();
    });
    expect(mounted.editor.selection?.anchor).toEqual({ path: [1, 0], offset: 0 });
    expect(mounted.editor.history.undos.length).toBe(undos);
    expect(snapshot(mounted.editor)).toBe(before);
    expect(scroll.calls[0]).toEqual({ behavior: "smooth", block: "start" });

    await act(async () => {
      mounted.editor.tf.withoutSaving(() => {
        mounted.editor.tf.select(caret([0, 0], 0));
      });
    });
    await flushAfter(() => {
      buttonFor(mounted.host, "near").dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
      );
    });
    expect(mounted.editor.selection?.anchor).toEqual({ path: [2, 0], offset: 0 });

    await act(async () => {
      mounted.editor.tf.withoutSaving(() => {
        mounted.editor.tf.select(caret([0, 0], 0));
      });
    });
    await flushAfter(() => {
      buttonFor(mounted.host, "far").dispatchEvent(
        new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true }),
      );
    });
    expect(mounted.editor.selection?.anchor).toEqual({ path: [1, 0], offset: 0 });
    expect(mounted.editor.history.undos.length).toBe(undos);

    scroll.restore();
    await mounted.cleanup();
  });

  test("a closed ancestor toggle opens without changing the document", async () => {
    // A heading is legal only as a toggle's label. Nest that toggle heading
    // inside a closed toggle: columns cannot sit in a toggle.
    const mounted = await mountToc([
      toc("outline"),
      toggle("outer", [
        paragraph("Outer", "outer-label"),
        toggle("inner", [heading("h2", "Nested", "nested"), paragraph("Body", "body")]),
      ]),
    ]);
    const before = snapshot(mounted.editor);
    const undos = mounted.editor.history.undos.length;
    expect(readToggleOpenIds(mounted.editor).has("outer")).toBe(false);

    await flushAfter(() => {
      buttonFor(mounted.host, "nested").click();
    });

    expect(readToggleOpenIds(mounted.editor).has("outer")).toBe(true);
    expect(snapshot(mounted.editor)).toBe(before);
    expect(mounted.editor.history.undos.length).toBe(undos);
    expect(mounted.editor.selection?.anchor).toEqual({ path: [1, 1, 0, 0], offset: 0 });
    await mounted.cleanup();
  });

  test("reduced motion scrolls with behavior auto", async () => {
    const mounted = await mountToc([toc("outline"), heading("h1", "Far", "far")]);
    const scroll = spyScroll();
    const restoreMotion = stubMotion(true);

    await flushAfter(() => {
      buttonFor(mounted.host, "far").click();
    });

    expect(scroll.calls[0]).toEqual({ behavior: "auto", block: "start" });
    scroll.restore();
    restoreMotion();
    await mounted.cleanup();
  });

  test("read-only focuses the heading and leaves the selection", async () => {
    const mounted = await mountToc([toc("outline"), heading("h2", "Far", "far")], true);
    const selection = JSON.stringify(mounted.editor.selection);
    const headingNode = mounted.host.querySelector("#heading-far");
    expect(headingNode?.getAttribute("tabindex")).toBe("-1");

    await flushAfter(() => {
      buttonFor(mounted.host, "far").click();
    });

    expect(JSON.stringify(mounted.editor.selection)).toBe(selection);
    expect(headingNode).not.toBeNull();
    expect(headingNode?.getAttribute("tabindex")).toBe("-1");
    expect(document.activeElement).toBe(headingNode);
    await mounted.cleanup();
  });
});

describe("toc commands", () => {
  test("insert, depth, and remove each take one undo and read-only is a no-op", () => {
    const editor = createEditor([paragraph("Stay", "stay")]);
    editor.tf.select(caret([0, 0], 0));
    const undos = editor.history.undos.length;

    expect(runEditorCommand(editor, insertToc, undefined, { readOnly: true })).toBe(false);
    expect(editor.children.map((block) => block.type)).toEqual(["p"]);
    expect(editor.history.undos.length).toBe(undos);

    expect(insertToc.id).toBe("block.insert.toc");
    expect(insertToc.label).toBe("Table of contents");
    expect(runEditorCommand(editor, insertToc, undefined)).toBe(true);
    expect(editor.children.map((block) => block.type)).toEqual(["p", "toc"]);
    expect(editor.history.undos.length).toBe(undos + 1);
    editor.tf.undo();
    expect(editor.children.map((block) => block.type)).toEqual(["p"]);

    expect(runEditorCommand(editor, insertToc, undefined)).toBe(true);
    editor.tf.select(caret([1, 0], 0));
    const afterInsert = editor.history.undos.length;
    expect(runEditorCommand(editor, setTocDepthCommand, 3)).toBe(true);
    expect(field(editor.children[1], "maxDepth")).toBeUndefined();
    expect(editor.history.undos.length).toBe(afterInsert);

    expect(runEditorCommand(editor, setTocDepthCommand, 1)).toBe(true);
    expect(field(editor.children[1], "maxDepth")).toBe(1);
    expect(editor.history.undos.length).toBe(afterInsert + 1);
    editor.tf.undo();
    expect(field(editor.children[1], "maxDepth")).toBeUndefined();

    editor.tf.select(caret([1, 0], 0));
    const beforeRemove = editor.history.undos.length;
    expect(runEditorCommand(editor, removeTocCommand, undefined)).toBe(true);
    expect(editor.children.map((block) => block.type)).toEqual(["p"]);
    expect(editor.history.undos.length).toBe(beforeRemove + 1);
    editor.tf.undo();
    expect(editor.children.map((block) => block.type)).toEqual(["p", "toc"]);

    editor.tf.select(caret([1, 0], 0));
    expect(runEditorCommand(editor, setTocDepthCommand, 2, { readOnly: true })).toBe(false);
    expect(runEditorCommand(editor, removeTocCommand, undefined, { readOnly: true })).toBe(false);
    expect(field(editor.children[1], "maxDepth")).toBeUndefined();
    expect(editor.children).toHaveLength(2);
  });

  test("the toolbar changes depth and removes the block", async () => {
    const mounted = await mountToc([
      heading("h1", "One", "one"),
      heading("h2", "Two", "two"),
      toc("outline"),
    ]);
    const select = mounted.host.querySelector('[aria-label="Table of contents depth"]');
    if (select === null || select.tagName !== "SELECT" || !("value" in select)) {
      throw new Error("Missing the depth select.");
    }
    const undos = mounted.editor.history.undos.length;

    await act(async () => {
      select.value = "1";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(labels(mounted.host)).toEqual(["One"]);
    expect(field(mounted.editor.children[2], "maxDepth")).toBe(1);
    expect(mounted.editor.history.undos.length).toBe(undos + 1);

    const remove = mounted.host.querySelector('[aria-label="Remove"]');
    if (!(remove instanceof HTMLButtonElement)) {
      throw new Error("Missing the remove button.");
    }
    await act(async () => {
      remove.click();
    });
    expect(mounted.host.querySelector("[data-toc-target]")).toBeNull();
    expect(mounted.editor.children.map((block) => block.type)).toEqual(["h1", "h2"]);
    expect(mounted.editor.history.undos.length).toBe(undos + 2);
    await mounted.cleanup();
  });
});

describe("toc containers", () => {
  test("a quote, a callout, and a table cell lift the block out", () => {
    const quoted = createEditor([quote("quote-1", [paragraph("Said", "said"), toc("toc-quote")])]);
    const noted = createEditor([
      callout("callout-1", [paragraph("Note", "note"), toc("toc-callout")]),
    ]);
    const table = createEditor([tableWith([paragraph("Cell", "cell"), toc("toc-table")])]);
    quoted.tf.normalize({ force: true });
    noted.tf.normalize({ force: true });
    table.tf.normalize({ force: true });

    expect(quoted.children.map((block) => block.type)).toEqual(["blockquote", "toc"]);
    expect(noted.children.map((block) => block.type)).toEqual(["callout", "toc"]);
    expect(table.children.map((block) => block.type)).toEqual(["table", "toc"]);
    expect(field(quoted.children[1], "id")).toBe("toc-quote");
    expect(field(table.children[1], "id")).toBe("toc-table");
  });
});
