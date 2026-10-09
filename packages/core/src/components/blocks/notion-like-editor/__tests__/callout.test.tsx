import { describe, expect, test } from "bun:test";
import { KEYS, type SlateEditor, type TElement } from "platejs";
import { Plate, PlateContent, createPlateEditor } from "platejs/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";

import { CALLOUT_TONE_CLASS_NAME } from "../components/elements/callout-element";
import {
  createTurnIntoContainer,
  getBlockType,
  resetCallout,
  runEditorCommand,
  setCalloutIcon,
  setCalloutTone,
  turnIntoBlockquote,
  turnIntoCallout,
} from "../lib/commands/editor-commands";
import { createEditorDocument } from "../lib/document/editor-document";
import { CALLOUT_ICONS, allowedChildTypes } from "../lib/document/editor-document-schema";
import { parseEditorDocument } from "../lib/document/editor-document-validate";
import { createEditorPlugins } from "../lib/plugins/editor-plugins";
import { EditorSurface } from "../components/editor/editor-surface";
import type { EditorValue } from "../lib/document/editor-value";
import {
  caret,
  createEditor,
  deserializeHtmlInDom,
  expectInvalid,
  expectOk,
  expectUnsupported,
  field,
  isRecord,
} from "./test-utils";

function paragraph(
  text: string,
  id: string,
  extra: { align?: string; indent?: number; listStyleType?: string } = {},
): TElement {
  return { type: "p", id, ...extra, children: [{ text }] };
}

function callout(
  id: string,
  children: TElement[],
  attrs: { icon?: string; variant?: string } = {},
): TElement {
  return { type: "callout", id, ...attrs, children };
}

function quote(id: string, children: TElement[]): TElement {
  return { type: "blockquote", id, children };
}

function divider(): TElement {
  return { type: "hr", id: "rule", children: [{ text: "" }] };
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

function renderCallout(value: EditorValue, readOnly = false): string {
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
  ownerDocument: {
    defaultView: {
      MouseEvent: new (type: string, init?: MouseEventInit) => MouseEvent;
      PointerEvent: new (type: string, init?: PointerEventInit) => PointerEvent;
    } | null;
  };
} {
  return (
    isRecord(value) &&
    typeof value.dispatchEvent === "function" &&
    isRecord(value.ownerDocument) &&
    isRecord(value.ownerDocument.defaultView) &&
    typeof value.ownerDocument.defaultView.MouseEvent === "function" &&
    typeof value.ownerDocument.defaultView.PointerEvent === "function"
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

async function mountCallout(value: EditorValue, readOnly = false) {
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

describe("callout schema", () => {
  test("childTypes allows paragraphs, the same as a quote", () => {
    expect(allowedChildTypes("callout")).toEqual(["p"]);
    expect(allowedChildTypes("blockquote")).toEqual(["p"]);
  });

  test("a callout with an icon, a tone, two paragraphs, and a bullet round-trips", () => {
    const content = [
      callout(
        "callout-1",
        [
          {
            type: "p",
            id: "para-1",
            align: "center",
            children: [{ text: "Hello ", bold: true }, { text: "there" }],
          },
          paragraph("Item", "para-2", { indent: 1, listStyleType: "disc" }),
        ],
        { icon: "lightbulb", variant: "info" },
      ),
    ];
    const parsed = expectOk(parseEditorDocument(createEditorDocument("doc", content)));

    expect(parsed.repairs).toEqual([]);
    expect(parsed.document.content).toEqual(content);
  });

  test("an invalid tone is unsupported and the raw document is kept", () => {
    const raw = createEditorDocument("doc-tone", [
      callout("callout-1", [paragraph("Note", "para-1")], { variant: "error" }),
    ]);
    const result = expectUnsupported(parseEditorDocument(raw));

    expect(result.issues[0]?.message).toContain('unsupported variant "error"');
    expect(result.raw).toBe(raw);
  });

  test("an invalid icon is unsupported and the raw document is kept", () => {
    const raw = createEditorDocument("doc-icon", [
      callout("callout-1", [paragraph("Note", "para-1")], { icon: "🦄" }),
    ]);
    const result = expectUnsupported(parseEditorDocument(raw));

    expect(result.issues[0]?.message).toContain('unsupported icon "🦄"');
    expect(result.raw).toBe(raw);
  });

  test("every Lucide icon key round-trips", () => {
    const content = CALLOUT_ICONS.map((icon, index) =>
      callout(`callout-${String(index)}`, [paragraph("Note", `para-${String(index)}`)], { icon }),
    );
    const parsed = expectOk(parseEditorDocument(createEditorDocument("doc-icons", content)));

    expect(parsed.repairs).toEqual([]);
    expect(parsed.document.content).toEqual(content);
  });

  test("a stored emoji icon is unsupported and the raw document is kept", () => {
    const raw = createEditorDocument("doc-emoji", [
      callout("callout-1", [paragraph("Note", "para-1")], { icon: "💡" }),
    ]);
    const result = expectUnsupported(parseEditorDocument(raw));

    expect(result.issues[0]?.message).toContain('unsupported icon "💡"');
    expect(result.raw).toBe(raw);
  });

  test("a stored default tone is unsupported and the raw document is kept", () => {
    const raw = createEditorDocument("doc-default", [
      callout("callout-1", [paragraph("Note", "para-1")], { variant: "default" }),
    ]);
    const result = expectUnsupported(parseEditorDocument(raw));

    expect(result.status).toBe("unsupported");
    expect(result.issues[0]?.message).toContain('unsupported variant "default"');
    expect(result.raw).toBe(raw);
  });

  test("inline children are unsupported and the raw document is kept", () => {
    const raw = createEditorDocument("doc-inline", [
      { type: "callout", id: "callout-1", children: [{ text: "Note" }] },
    ]);
    const result = expectUnsupported(parseEditorDocument(raw));

    expect(result.issues[0]?.message).toContain("has inline children");
    expect(result.raw).toBe(raw);
  });

  test("a heading child is unsupported and the raw document is kept", () => {
    const raw = createEditorDocument("doc-heading", [
      callout("callout-1", [{ type: "h1", id: "heading-1", children: [{ text: "Title" }] }]),
    ]);
    const result = expectUnsupported(parseEditorDocument(raw));

    expect(result.issues[0]?.message).toContain('has an unsupported child type "h1"');
    expect(result.raw).toBe(raw);
  });

  test("a callout with no children is invalid and the raw document is kept", () => {
    const raw = createEditorDocument("doc-empty", [
      { type: "callout", id: "callout-1", children: [] },
    ]);
    const result = expectInvalid(parseEditorDocument(raw));

    expect(result.issues[0]?.message).toContain("has no children");
    expect(result.raw).toBe(raw);
  });
});

describe("callout normalizer", () => {
  test("a quote inside a callout flattens into the callout", () => {
    const editor = createEditor([
      callout("callout-1", [quote("quote-1", [paragraph("x", "para-1")])], { icon: "pin" }),
    ]);

    editor.tf.normalize({ force: true });

    expect(typesOf(editor)).toEqual(["callout"]);
    expect(field(editor.children[0], "id")).toBe("callout-1");
    expect(field(editor.children[0], "icon")).toBe("pin");
    expect(childIds(editor.children[0])).toEqual(["para-1"]);
    expect(nodeText(editor.children[0])).toBe("x");
    expect(JSON.stringify(editor.children)).not.toContain("quote-1");
  });

  test("a callout inside a quote flattens into the quote", () => {
    const editor = createEditor([
      quote("quote-1", [callout("callout-1", [paragraph("x", "para-1")], { variant: "info" })]),
    ]);

    editor.tf.normalize({ force: true });

    expect(typesOf(editor)).toEqual(["blockquote"]);
    expect(field(editor.children[0], "id")).toBe("quote-1");
    expect(childIds(editor.children[0])).toEqual(["para-1"]);
    expect(nodeText(editor.children[0])).toBe("x");
    expect(JSON.stringify(editor.children)).not.toContain("callout-1");
  });

  test("a heading inside a callout becomes a paragraph", () => {
    const editor = createEditor([
      callout("callout-1", [
        {
          type: "h2",
          id: "heading-1",
          align: "right",
          children: [{ text: "Title", bold: true }],
        },
      ]),
    ]);

    editor.tf.normalize({ force: true });
    const child = childrenOf(editor.children[0])[0];

    expect(field(child, "type")).toBe("p");
    expect(field(child, "id")).toBe("heading-1");
    expect(field(child, "align")).toBe("right");
    expect(child && isRecord(child) ? child.children : undefined).toEqual([
      { text: "Title", bold: true },
    ]);
  });

  test("an hr inside a callout splits the callout", () => {
    const editor = createEditor([
      callout("callout-1", [paragraph("A", "a"), divider(), paragraph("B", "b")]),
    ]);

    editor.tf.normalize({ force: true });

    expect(typesOf(editor)).toEqual(["callout", "hr", "callout"]);
    expect(field(editor.children[1], "id")).toBe("rule");
    expect(childIds(editor.children[0])).toEqual(["a"]);
    expect(childIds(editor.children[2])).toEqual(["b"]);
  });
});

describe("callout commands", () => {
  test("the container factory produces the quote and callout commands", () => {
    const made = createTurnIntoContainer(KEYS.callout, {
      id: "block.turn-into.callout",
      label: "Callout",
    });

    expect(turnIntoBlockquote.id).toBe("block.turn-into.blockquote");
    expect(turnIntoBlockquote.label).toBe("Quote");
    expect(turnIntoBlockquote.group).toBe("turn-into");
    expect(turnIntoCallout.id).toBe(made.id);
    expect(turnIntoCallout.label).toBe("Callout");
    expect(turnIntoCallout.group).toBe("turn-into");
    expect(setCalloutIcon.id).toBe("format.callout-icon");
    expect(setCalloutTone.id).toBe("format.callout-tone");
  });

  test("wraps the selection into one callout without icon or tone attrs", () => {
    const editor = createEditor([paragraph("One", "para-1"), paragraph("Two", "para-2")]);
    editor.tf.select({
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [1, 0], offset: 3 },
    });
    const before = editor.history.undos.length;

    expect(runEditorCommand(editor, turnIntoCallout, undefined)).toBe(true);

    expect(typesOf(editor)).toEqual(["callout"]);
    expect(field(editor.children[0], "icon")).toBeUndefined();
    expect(field(editor.children[0], "variant")).toBeUndefined();
    expect(childIds(editor.children[0])).toEqual(["para-1", "para-2"]);
    expect(editor.history.undos.length - before).toBe(1);

    editor.tf.undo();

    expect(typesOf(editor)).toEqual(["p", "p"]);
    expect(childIds({ children: editor.children })).toEqual(["para-1", "para-2"]);
  });

  test("unwraps a callout and keeps the paragraph ids in order", () => {
    const editor = createEditor([
      callout("callout-1", [paragraph("One", "para-1"), paragraph("Two", "para-2")]),
    ]);
    editor.tf.select({
      anchor: { path: [0, 0, 0], offset: 0 },
      focus: { path: [0, 1, 0], offset: 3 },
    });

    runEditorCommand(editor, turnIntoCallout, undefined);

    expect(typesOf(editor)).toEqual(["p", "p"]);
    expect(childIds({ children: editor.children })).toEqual(["para-1", "para-2"]);
    expect(editor.children.map((block) => nodeText(block))).toEqual(["One", "Two"]);
  });

  test("a partial selection splits the callout", () => {
    const editor = createEditor([
      callout("callout-1", [
        paragraph("One", "para-1"),
        paragraph("Two", "para-2"),
        paragraph("Three", "para-3"),
      ]),
    ]);
    editor.tf.select(caret([0, 1, 0], 0));

    runEditorCommand(editor, turnIntoCallout, undefined);

    expect(typesOf(editor)).toEqual(["callout", "p", "callout"]);
    expect(field(editor.children[0], "id")).toBe("callout-1");
    expect(childIds(editor.children[0])).toEqual(["para-1"]);
    expect(field(editor.children[1], "id")).toBe("para-2");
    expect(childIds(editor.children[2])).toEqual(["para-3"]);
  });

  test("a read-only editor refuses turn into callout", () => {
    const editor = createEditor([paragraph("Hello", "para-1")]);
    editor.tf.select(caret([0, 0], 1));
    const undos = editor.history.undos.length;

    expect(runEditorCommand(editor, turnIntoCallout, undefined, { readOnly: true })).toBe(false);
    expect(typesOf(editor)).toEqual(["p"]);
    expect(editor.history.undos.length).toBe(undos);
  });

  test("setCalloutIcon and setCalloutTone set, replace, and reset without changing children", () => {
    const editor = createEditor([
      callout("callout-1", [paragraph("Note", "para-1"), paragraph("More", "para-2")]),
    ]);
    editor.tf.select(caret([0, 0, 0], 1));
    const children = JSON.parse(JSON.stringify(editor.children[0]?.children));

    const setIcon = editor.history.undos.length;
    expect(runEditorCommand(editor, setCalloutIcon, { value: "pin" })).toBe(true);
    expect(field(editor.children[0], "icon")).toBe("pin");
    expect(editor.history.undos.length - setIcon).toBe(1);

    runEditorCommand(editor, setCalloutIcon, { value: "flame" });
    expect(field(editor.children[0], "icon")).toBe("flame");
    editor.tf.undo();
    expect(field(editor.children[0], "icon")).toBe("pin");

    runEditorCommand(editor, setCalloutIcon, { value: null });
    expect(field(editor.children[0], "icon")).toBeUndefined();
    editor.tf.undo();
    expect(field(editor.children[0], "icon")).toBe("pin");

    const setTone = editor.history.undos.length;
    expect(runEditorCommand(editor, setCalloutTone, { value: "info" })).toBe(true);
    expect(field(editor.children[0], "variant")).toBe("info");
    expect(editor.history.undos.length - setTone).toBe(1);

    runEditorCommand(editor, setCalloutTone, { value: "warning" });
    expect(field(editor.children[0], "variant")).toBe("warning");
    editor.tf.undo();
    expect(field(editor.children[0], "variant")).toBe("info");

    runEditorCommand(editor, setCalloutTone, { value: null });
    expect(field(editor.children[0], "variant")).toBeUndefined();
    expect(editor.children[0]?.children).toEqual(children);

    editor.tf.select({
      anchor: { path: [1, 0], offset: 0 },
      focus: { path: [1, 0], offset: 4 },
    });
    const outside = createEditor([
      callout("callout-1", [paragraph("Note", "para-1")]),
      paragraph("Outside word", "para-2"),
    ]);
    const selection = {
      anchor: { path: [1, 0], offset: 8 },
      focus: { path: [1, 0], offset: 12 },
    };
    outside.tf.select(selection);
    runEditorCommand(outside, setCalloutIcon, { value: "triangle-alert", at: [0] });
    expect(outside.selection).toEqual(selection);
    expect(field(outside.children[0], "icon")).toBe("triangle-alert");
  });

  test("a read-only editor refuses icon and tone changes", () => {
    const editor = createEditor([
      callout("callout-1", [paragraph("Note", "para-1")], { icon: "lightbulb", variant: "info" }),
    ]);
    editor.tf.select(caret([0, 0, 0], 1));
    const undos = editor.history.undos.length;

    expect(runEditorCommand(editor, setCalloutIcon, { value: "flame" }, { readOnly: true })).toBe(
      false,
    );
    expect(runEditorCommand(editor, setCalloutTone, { value: null }, { readOnly: true })).toBe(
      false,
    );
    expect(field(editor.children[0], "icon")).toBe("lightbulb");
    expect(field(editor.children[0], "variant")).toBe("info");
    expect(editor.history.undos.length).toBe(undos);
  });

  test("reset removes both attrs in one undo and leaves the children", () => {
    const editor = createEditor([
      callout("callout-1", [paragraph("Note", "para-1")], {
        icon: "lightbulb",
        variant: "warning",
      }),
    ]);
    const children = JSON.parse(JSON.stringify(editor.children[0]?.children));
    const before = editor.history.undos.length;

    resetCallout(editor, [0]);

    expect(field(editor.children[0], "icon")).toBeUndefined();
    expect(field(editor.children[0], "variant")).toBeUndefined();
    expect(editor.children[0]?.children).toEqual(children);
    expect(editor.history.undos.length - before).toBe(1);

    editor.tf.undo();

    expect(field(editor.children[0], "icon")).toBe("lightbulb");
    expect(field(editor.children[0], "variant")).toBe("warning");
  });
});

describe("callout getBlockType", () => {
  test("a paragraph inside a callout reports callout, and a list reports the list", () => {
    const editor = createEditor([
      callout("callout-1", [
        paragraph("Note", "para-1"),
        paragraph("Item", "para-2", { indent: 1, listStyleType: "disc" }),
      ]),
      paragraph("After", "para-3"),
    ]);

    editor.tf.select(caret([0, 0, 0], 1));
    expect(getBlockType(editor)).toBe("callout");

    editor.tf.select(caret([0, 1, 0], 1));
    expect(getBlockType(editor)).toBe("bulleted-list");

    editor.tf.select({
      anchor: { path: [0, 0, 0], offset: 1 },
      focus: { path: [0, 1, 0], offset: 1 },
    });
    expect(getBlockType(editor)).toBe("mixed");
  });
});

describe("callout keyboard", () => {
  test("Enter at the end of a paragraph inserts a paragraph inside the callout", () => {
    const editor = createEditor([callout("callout-1", [paragraph("Hello", "para-1")])]);
    editor.tf.select(caret([0, 0, 0], 5));

    editor.tf.insertBreak();

    expect(typesOf(editor)).toEqual(["callout"]);
    expect(childrenOf(editor.children[0]).map((child) => nodeText(child))).toEqual(["Hello", ""]);
    expect(childIds(editor.children[0])[0]).toBe("para-1");
  });

  test("Enter on the last empty paragraph lifts it out", () => {
    const editor = createEditor([
      callout("callout-1", [paragraph("Hello", "para-1"), paragraph("", "para-2")]),
    ]);
    editor.tf.select(caret([0, 1, 0], 0));

    editor.tf.insertBreak();

    expect(typesOf(editor)).toEqual(["callout", "p"]);
    expect(childIds(editor.children[0])).toEqual(["para-1"]);
    expect(field(editor.children[1], "id")).toBe("para-2");
  });

  test("Backspace at the start of the first paragraph lifts it out", () => {
    const editor = createEditor([
      callout("callout-1", [paragraph("Hello", "para-1"), paragraph("Next", "para-2")]),
    ]);
    editor.tf.select(caret([0, 0, 0], 0));

    editor.tf.deleteBackward();

    expect(typesOf(editor)).toEqual(["p", "callout"]);
    expect(field(editor.children[0], "id")).toBe("para-1");
    expect(childIds(editor.children[1])).toEqual(["para-2"]);
  });

  test("Backspace at the start of a later paragraph merges it", () => {
    const editor = createEditor([
      callout("callout-1", [paragraph("Hello", "para-1"), paragraph("Next", "para-2")]),
    ]);
    editor.tf.select(caret([0, 1, 0], 0));

    editor.tf.deleteBackward();

    expect(typesOf(editor)).toEqual(["callout"]);
    expect(childIds(editor.children[0])).toEqual(["para-1"]);
    expect(nodeText(editor.children[0])).toBe("HelloNext");
  });

  test("callout has no shortcut", () => {
    const editor = createEditor([paragraph("Hello", "para-1")]);
    const ids = Object.keys(editor.meta.shortcuts);

    expect(ids.filter((id) => id.toLowerCase().includes("callout"))).toEqual([]);
  });
});

describe("callout rendering", () => {
  test("an info callout uses the info tone and the stored icon", () => {
    const html = renderCallout([
      callout("callout-1", [paragraph("Note", "para-1")], { icon: "pin", variant: "info" }),
    ]);

    expect(html).toContain('role="note"');
    expect(html).toContain(CALLOUT_TONE_CLASS_NAME.info);
    expect(html).toContain("lucide-pin");
    expect(html).toContain('aria-label="Change callout icon and color"');
  });

  test("a callout without an icon shows the default light bulb", () => {
    const html = renderCallout([callout("callout-1", [paragraph("Note", "para-1")])]);

    expect(html).toContain("<svg");
    expect(html).toContain("lucide-lightbulb");
    expect(html).toContain("text-muted-foreground");
    expect(html).toContain(CALLOUT_TONE_CLASS_NAME.default);
  });

  test("a read-only callout shows the icon and no button", () => {
    const html = renderCallout(
      [callout("callout-1", [paragraph("Note", "para-1")], { icon: "circle-check" })],
      true,
    );

    expect(html).toContain("lucide-circle-check");
    expect(html).not.toContain("<button");
    expect(html).not.toContain("Change callout icon and color");
  });
});

describe("callout picker", () => {
  test("mousedown on the trigger is cancelled and choosing an icon writes once", async () => {
    const mounted = await mountCallout([
      callout("callout-1", [paragraph("Note", "para-1")]),
      paragraph("Outside word", "para-2"),
    ]);
    const selection = {
      anchor: { path: [1, 0], offset: 8 },
      focus: { path: [1, 0], offset: 12 },
    };
    mounted.editor.tf.select(selection);

    try {
      const trigger: unknown = document.querySelector(
        "[aria-label='Change callout icon and color']",
      );
      if (!isClickable(trigger)) {
        throw new Error("Missing callout trigger.");
      }

      const view = trigger.ownerDocument.defaultView;
      if (!view) {
        throw new Error("Missing window.");
      }

      const mouseDown = new view.MouseEvent("mousedown", { bubbles: true, cancelable: true });
      trigger.dispatchEvent(mouseDown);
      expect(mouseDown.defaultPrevented).toBe(true);
      expect(mounted.editor.selection).toEqual(selection);

      await act(async () => {
        trigger.dispatchEvent(
          new view.PointerEvent("pointerdown", { bubbles: true, cancelable: true, button: 0 }),
        );
      });

      const items = [...document.querySelectorAll("[role='menuitem']")];
      const labels = [
        "Lightbulb",
        "Info",
        "Circle check",
        "Triangle alert",
        "Ban",
        "Pin",
        "Notebook pen",
        "Flame",
        "Circle help",
        "Star",
        "Target",
        "Message circle",
      ];
      for (const label of labels) {
        const item = items.find((entry) => entry.getAttribute("aria-label") === label);
        if (!item) {
          throw new Error(`Missing ${label} icon.`);
        }
      }

      const warning = items.find((item) => item.getAttribute("aria-label") === "Triangle alert");
      if (!warning || !isClickable(warning)) {
        throw new Error("Missing warning icon.");
      }

      const before = mounted.editor.history.undos.length;
      await act(async () => {
        warning.dispatchEvent(new view.MouseEvent("click", { bubbles: true, cancelable: true }));
      });

      expect(field(mounted.editor.children[0], "icon")).toBe("triangle-alert");
      expect(mounted.editor.history.undos.length - before).toBe(1);
      expect(mounted.editor.selection).toEqual(selection);
      expect(document.querySelector("[role='menu']")).toBeNull();
    } finally {
      await mounted.cleanup();
    }
  });

  test("the open picker marks the default icon and tone when none are stored", async () => {
    const mounted = await mountCallout([callout("callout-1", [paragraph("Note", "para-1")])]);

    try {
      await openCalloutPicker();
      const lightbulb = pickerButton("Lightbulb");
      const info = pickerButton("Info");
      expect(lightbulb.getAttribute("aria-pressed")).toBe("true");
      expect(lightbulb.getAttribute("data-state")).toBe("on");
      expect(info.getAttribute("aria-pressed")).toBe("false");
      expect(checkedTone()?.textContent).toContain("Default");
    } finally {
      await mounted.cleanup();
    }
  });

  test("the open picker marks the stored icon and tone", async () => {
    const mounted = await mountCallout([
      callout("callout-1", [paragraph("Note", "para-1")], { icon: "pin", variant: "warning" }),
    ]);

    try {
      await openCalloutPicker();
      const pin = pickerButton("Pin");
      const lightbulb = pickerButton("Lightbulb");
      expect(pin.getAttribute("aria-pressed")).toBe("true");
      expect(pin.getAttribute("data-state")).toBe("on");
      expect(lightbulb.getAttribute("aria-pressed")).toBe("false");
      expect(checkedTone()?.textContent).toContain("Warning");
    } finally {
      await mounted.cleanup();
    }
  });
});

async function openCalloutPicker(): Promise<void> {
  const trigger = document.querySelector("[aria-label='Change callout icon and color']");
  if (!(trigger instanceof HTMLElement)) {
    throw new Error("Missing callout trigger.");
  }

  const view = trigger.ownerDocument.defaultView;
  if (!view) {
    throw new Error("Missing window.");
  }

  await act(async () => {
    trigger.dispatchEvent(
      new view.PointerEvent("pointerdown", { bubbles: true, cancelable: true, button: 0 }),
    );
  });
}

function pickerButton(label: string): HTMLElement {
  const item = [...document.querySelectorAll("[role='menuitem']")].find(
    (entry) => entry.getAttribute("aria-label") === label,
  );
  if (!(item instanceof HTMLElement)) {
    throw new Error(`Missing ${label} icon.`);
  }

  return item;
}

function checkedTone(): Element | null {
  return document.querySelector("[role='menuitemradio'][aria-checked='true']");
}

describe("callout paste", () => {
  test("an editor fragment keeps an allowed icon and tone", () => {
    const editor = createEditor();
    editor.tf.select(caret([0, 0], 0));
    editor.tf.insertFragment([
      callout("callout-1", [paragraph("Kept", "para-1")], { icon: "star", variant: "success" }),
    ]);

    expect(typesOf(editor)).toEqual(["callout"]);
    expect(field(editor.children[0], "icon")).toBe("star");
    expect(field(editor.children[0], "variant")).toBe("success");
    expect(nodeText(editor.children[0])).toBe("Kept");
  });

  test("an editor fragment drops an invalid tone and keeps the callout", () => {
    const editor = createEditor();
    editor.tf.select(caret([0, 0], 0));
    editor.tf.insertFragment([
      callout("callout-1", [paragraph("Kept", "para-1")], { icon: "star", variant: "error" }),
    ]);

    expect(typesOf(editor)).toEqual(["callout"]);
    expect(field(editor.children[0], "icon")).toBe("star");
    expect(field(editor.children[0], "variant")).toBeUndefined();
    expect(nodeText(editor.children[0])).toBe("Kept");
  });

  test("a list inside a pasted callout stays a list", () => {
    const editor = createEditor();
    editor.tf.select(caret([0, 0], 0));
    editor.tf.insertFragment([
      callout("callout-1", [paragraph("Item", "para-1", { indent: 1, listStyleType: "disc" })]),
    ]);
    const child = childrenOf(editor.children[0])[0];

    expect(field(child, "type")).toBe("p");
    expect(field(child, "listStyleType")).toBe("disc");
    expect(field(child, "indent")).toBe(1);
    expect(nodeText(child)).toBe("Item");
  });

  test("an editor fragment drops an emoji icon and keeps the callout", () => {
    const editor = createEditor();
    editor.tf.select(caret([0, 0], 0));
    editor.tf.insertFragment([
      callout("callout-1", [paragraph("Kept", "para-1")], { icon: "💡", variant: "info" }),
    ]);

    expect(typesOf(editor)).toEqual(["callout"]);
    expect(field(editor.children[0], "icon")).toBeUndefined();
    expect(field(editor.children[0], "variant")).toBe("info");
    expect(nodeText(editor.children[0])).toBe("Kept");
  });

  test("native HTML does not invent a callout, and the text is kept", () => {
    const aside = pasteHtml("<aside>Note from aside</aside>");
    const slate = pasteHtml('<div data-slate-type="callout">Slate note</div>');
    const notion = pasteHtml('<div class="callout"><span>💡</span><div>Notion note</div></div>');

    expect(typesOf(aside)).not.toContain("callout");
    expect(nodeText({ children: aside.children })).toContain("Note from aside");
    expect(typesOf(slate)).not.toContain("callout");
    expect(nodeText({ children: slate.children })).toContain("Slate note");
    expect(typesOf(notion)).not.toContain("callout");
    expect(nodeText({ children: notion.children })).toContain("Notion note");
  });
});
