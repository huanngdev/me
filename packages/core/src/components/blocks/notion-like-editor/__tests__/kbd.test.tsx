import { describe, expect, test } from "bun:test";
import { KEYS, type SlateEditor, type TElement, type TText } from "platejs";
import { createPlateEditor } from "platejs/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";

import { EditorSurface } from "../components/editor/editor-surface";
import { KBD_CLASS } from "../components/elements/kbd-classes";
import {
  clearFormatting,
  formatBold,
  formatCode,
  formatKeyboard,
  formatSuperscript,
  runEditorCommand,
  type EditorCommand,
} from "../lib/commands/editor-commands";
import { createEditorDocument } from "../lib/document/editor-document";
import { parseEditorDocument } from "../lib/document/editor-document-validate";
import type { EditorValue } from "../lib/document/editor-value";
import { selectionToolbarModel } from "../lib/features/editor-selection-toolbar";
import { createEditorPlugins } from "../lib/plugins/editor-plugins";
import { NotionLikeEditorStatic } from "../notion-like-editor-static";
import { DEMO_DOCUMENT_VALUE } from "../demo/demo-document";
import {
  caret,
  createEditor,
  deserializeHtmlInDom,
  field,
  plainText,
  textRange,
} from "./test-utils";

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

function paragraph(text: string, id = "p", marks?: Record<string, unknown>): TElement {
  return { type: "p", id, children: [marks ? { text, ...marks } : { text }] };
}

function leaves(editor: SlateEditor, index = 0): Record<string, unknown>[] {
  return (editor.children[index]?.children ?? []) as Record<string, unknown>[];
}

function leaf(editor: SlateEditor, path: number[]): Record<string, unknown> {
  const node = editor.api.node(path)?.[0];
  if (!node || typeof node !== "object") {
    throw new Error("Missing leaf.");
  }
  return node as Record<string, unknown>;
}

function markState(editor: SlateEditor, command: EditorCommand): string | undefined {
  return command.getState?.(editor);
}

function paste(fragment: TElement[]): SlateEditor {
  const editor = createEditor();
  editor.tf.select(caret([0, 0], 0));
  editor.tf.insertFragment(fragment);
  return editor;
}

function pasteHtml(html: string): SlateEditor {
  const editor = createEditor();
  editor.tf.select(caret([0, 0], 0));
  editor.tf.insertFragment(deserializeHtmlInDom(editor, html));
  return editor;
}

function markedText(editor: SlateEditor, mark: string): string[] {
  const pieces: string[] = [];
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const child of node) {
        visit(child);
      }
      return;
    }

    if (typeof node !== "object" || node === null) {
      return;
    }

    if ("text" in node && typeof node.text === "string" && !("children" in node)) {
      if (field(node, mark) === true) {
        pieces.push(node.text);
      }
      return;
    }

    if ("children" in node && Array.isArray(node.children)) {
      for (const child of node.children) {
        visit(child);
      }
    }
  };

  visit(editor.children);
  return pieces;
}

function parsedParagraph(child: TText) {
  return parseEditorDocument(
    createEditorDocument("doc-kbd", [{ type: "p", id: "p", children: [child] }]),
  );
}

function hasClasses(node: Element, classes: string): boolean {
  return classes.split(" ").every((name) => node.classList.contains(name));
}

// The editor adds non-breaking spacer spans inside inline leaves. They are not key text.
function keyText(node: Element | null | undefined): string {
  return (node?.textContent ?? "").replace(/\s/g, "");
}

describe("keyboard mark validation", () => {
  test("a leaf with kbd true passes with no repairs", () => {
    const result = parsedParagraph({ text: "⌘K", kbd: true });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") {
      throw new Error("Expected a valid document.");
    }
    expect(result.repairs).toEqual([]);
  });

  test("kbd with a non-boolean value is handled the way an invalid bold is", () => {
    const bold = parsedParagraph({ text: "x", bold: "yes" });
    const kbd = parsedParagraph({ text: "x", kbd: "yes" });

    expect(kbd.status).toBe(bold.status);
    if (kbd.status === "ok" && bold.status === "ok") {
      expect(kbd.repairs).toEqual(bold.repairs);
      expect(kbd.document.content).toEqual([
        { type: "p", id: "p", children: [{ text: "x", kbd: "yes" }] },
      ]);
      expect(bold.document.content).toEqual([
        { type: "p", id: "p", children: [{ text: "x", bold: "yes" }] },
      ]);
    }
  });
});

describe("keyboard mark command", () => {
  test("toggling keyboard on a range sets only kbd and keeps exact characters", () => {
    const text = "Press ⌘K or ⌥⇧P 🙂 để mở";
    const editor = createEditor([paragraph(text, "p", { bold: true, color: "red" })]);
    editor.tf.select(textRange([0, 0], 6, 8));

    expect(runEditorCommand(editor, formatKeyboard, undefined)).toBe(true);

    expect(leaves(editor)).toEqual([
      { text: "Press ", bold: true, color: "red" },
      { text: "⌘K", bold: true, color: "red", kbd: true },
      { text: " or ⌥⇧P 🙂 để mở", bold: true, color: "red" },
    ]);
    expect(plainText(editor)).toBe(text);
  });

  test("toggling keyboard again on the same range removes it", () => {
    const editor = createEditor([paragraph("Press ⌘K")]);
    editor.tf.select(textRange([0, 0], 6, 8));
    runEditorCommand(editor, formatKeyboard, undefined);
    editor.tf.select(textRange([0, 1], 0, 2));

    runEditorCommand(editor, formatKeyboard, undefined);

    expect(leaves(editor)).toEqual([{ text: "Press ⌘K" }]);
  });

  test("each keyboard toggle is one undo step", () => {
    const editor = createEditor([paragraph("Hello")]);
    editor.tf.select(textRange([0, 0], 0, 5));
    const undos = editor.history.undos.length;

    runEditorCommand(editor, formatKeyboard, undefined);
    expect(editor.history.undos.length - undos).toBe(1);

    editor.tf.undo();
    expect(leaves(editor)).toEqual([{ text: "Hello" }]);
  });

  test("a caret toggle marks the next typed text, the same as superscript", () => {
    const keyboard = createEditor([paragraph("Hello")]);
    const superscript = createEditor([paragraph("Hello")]);
    keyboard.tf.select(caret([0, 0], 5));
    superscript.tf.select(caret([0, 0], 5));

    runEditorCommand(keyboard, formatKeyboard, undefined);
    runEditorCommand(superscript, formatSuperscript, undefined);
    keyboard.tf.insertText("!");
    superscript.tf.insertText("!");

    expect(markState(keyboard, formatKeyboard)).toBe(markState(superscript, formatSuperscript));
    expect(leaves(keyboard)).toEqual([{ text: "Hello" }, { text: "!", kbd: true }]);
    expect(leaves(superscript)).toEqual([{ text: "Hello" }, { text: "!", superscript: true }]);
  });

  test("a read-only editor refuses the keyboard command", () => {
    const editor = createEditor([paragraph("Hello")]);
    editor.tf.select(textRange([0, 0], 0, 5));

    expect(runEditorCommand(editor, formatKeyboard, undefined, { readOnly: true })).toBe(false);
    expect(leaves(editor)).toEqual([{ text: "Hello" }]);
  });

  test("keyboard is not available inside a code block", () => {
    const editor = createEditor([
      {
        type: KEYS.codeBlock,
        id: "code-1",
        children: [{ type: KEYS.codeLine, id: "line-1", children: [{ text: "const", kbd: true }] }],
      },
    ]);
    editor.tf.normalize({ force: true });

    // Path [0, 0, 0] is the text inside the first code line of the first block.
    expect(field(editor.api.node([0, 0, 0])?.[0], KEYS.kbd)).toBeUndefined();
  });

  test("keyboard state is on, off, and mixed", () => {
    const editor = createEditor([
      { type: "p", id: "p", children: [{ text: "Hello " }, { text: "world", kbd: true }] },
    ]);

    editor.tf.select(textRange([0, 1], 0, 5));
    expect(markState(editor, formatKeyboard)).toBe("on");

    editor.tf.select(textRange([0, 0], 0, 6));
    expect(markState(editor, formatKeyboard)).toBe("off");

    editor.tf.select({
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [0, 1], offset: 5 },
    });
    expect(markState(editor, formatKeyboard)).toBe("mixed");
  });

  test("bold and keyboard coexist on the same text", () => {
    const editor = createEditor([paragraph("Hello")]);
    editor.tf.select(textRange([0, 0], 0, 5));
    runEditorCommand(editor, formatBold, undefined);

    runEditorCommand(editor, formatKeyboard, undefined);

    expect(leaves(editor)).toEqual([{ text: "Hello", bold: true, kbd: true }]);
  });
});

describe("keyboard and inline code are mutually exclusive", () => {
  test("turning keyboard on removes code from code text", () => {
    const editor = createEditor([paragraph("Hello", "p", { code: true })]);
    editor.tf.select(textRange([0, 0], 0, 5));
    const undos = editor.history.undos.length;

    runEditorCommand(editor, formatKeyboard, undefined);

    expect(leaves(editor)).toEqual([{ text: "Hello", kbd: true }]);
    expect(leaves(editor)[0]).not.toHaveProperty("code");
    expect(editor.history.undos.length - undos).toBe(1);
  });

  test("turning code on removes keyboard from keyboard text", () => {
    const editor = createEditor([paragraph("Hello", "p", { kbd: true })]);
    editor.tf.select(textRange([0, 0], 0, 5));
    const undos = editor.history.undos.length;

    runEditorCommand(editor, formatCode, undefined);

    expect(leaves(editor)).toEqual([{ text: "Hello", code: true }]);
    expect(leaves(editor)[0]).not.toHaveProperty("kbd");
    expect(editor.history.undos.length - undos).toBe(1);

    editor.tf.undo();
    expect(leaves(editor)).toEqual([{ text: "Hello", kbd: true }]);
  });

  test("a selection across code and plain text becomes keyboard only", () => {
    const editor = createEditor([
      { type: "p", id: "p", children: [{ text: "abc", code: true }, { text: "def" }] },
    ]);
    editor.tf.select({
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [0, 1], offset: 3 },
    });

    runEditorCommand(editor, formatKeyboard, undefined);

    expect(leaves(editor)).toEqual([{ text: "abcdef", kbd: true }]);
    expect(markedText(editor, KEYS.code)).toEqual([]);
  });
});

describe("keyboard rendering", () => {
  test("the editor renders a kbd element with the shared classes", async () => {
    const mounted = await mount([
      { type: "p", id: "p", children: [{ text: "Press " }, { text: "⌘K", kbd: true }] },
    ]);
    try {
      const kbd = mounted.host.querySelector("kbd");
      expect(keyText(kbd)).toBe("⌘K");
      expect(kbd && hasClasses(kbd, KBD_CLASS)).toBe(true);
    } finally {
      await mounted.cleanup();
    }
  });

  test("the editor renders bold and keyboard together", async () => {
    const mounted = await mount([
      { type: "p", id: "p", children: [{ text: "⌘K", bold: true, kbd: true }] },
    ]);
    try {
      expect(mounted.host.querySelector("kbd strong, strong kbd")?.textContent).toBe("⌘K");
    } finally {
      await mounted.cleanup();
    }
  });

  test("the read-only editor renders the same kbd element", async () => {
    const mounted = await mount(
      [{ type: "p", id: "p", children: [{ text: "⌘K", kbd: true }] }],
      true,
    );
    try {
      const kbd = mounted.host.querySelector("kbd");
      expect(keyText(kbd)).toBe("⌘K");
      expect(kbd && hasClasses(kbd, KBD_CLASS)).toBe(true);
    } finally {
      await mounted.cleanup();
    }
  });

  test("the static renderer renders the same kbd element", () => {
    const html = renderToStaticMarkup(
      <NotionLikeEditorStatic
        value={[{ type: "p", id: "p", children: [{ text: "Press " }, { text: "⌘K", kbd: true }] }]}
      />,
    );
    const container = document.createElement("div");
    container.innerHTML = html;
    const kbd = container.querySelector("kbd");

    expect(kbd?.textContent).toBe("⌘K");
    expect(kbd && hasClasses(kbd, KBD_CLASS)).toBe(true);
  });

  test("the static renderer renders bold and keyboard together", () => {
    const html = renderToStaticMarkup(
      <NotionLikeEditorStatic
        value={[{ type: "p", id: "p", children: [{ text: "⌘K", bold: true, kbd: true }] }]}
      />,
    );
    const container = document.createElement("div");
    container.innerHTML = html;

    expect(container.querySelector("kbd strong, strong kbd")?.textContent).toBe("⌘K");
  });
});

describe("keyboard in the selection toolbar", () => {
  test("the More menu lists Keyboard right after Subscript, with no shortcut", async () => {
    const mounted = await showToolbar();
    try {
      await press("More");
      const ids = Array.from(
        document.querySelectorAll("[data-selection-more] [data-more-choice]"),
      ).map((node) => node.getAttribute("data-more-choice"));
      const subscript = ids.indexOf("subscript");

      expect(ids[subscript + 1]).toBe("keyboard");
      expect(
        document.querySelector("[data-selection-more] [data-more-choice='keyboard']")?.textContent,
      ).toContain("Keyboard");
      expect(selectionToolbarModel(mounted.editor).keyboard.shortcut).toBeUndefined();
    } finally {
      await mounted.cleanup();
    }
  });

  test("there is no top-level keyboard button", async () => {
    const mounted = await showToolbar();
    try {
      expect(document.querySelector("[data-selection-toolbar] [aria-label='Keyboard']")).toBeNull();
    } finally {
      await mounted.cleanup();
    }
  });

  test("clicking Keyboard in the More menu toggles the mark and the pressed state follows", async () => {
    const mounted = await showToolbar();
    try {
      await press("More");
      const item = document.querySelector("[data-more-choice='keyboard']");
      await act(async () => {
        if (item instanceof HTMLElement) {
          item.click();
        }
      });
      expect(leaf(mounted.editor, [0, 0]).kbd).toBe(true);

      await press("More");
      expect(
        document.querySelector("[data-more-choice='keyboard']")?.getAttribute("aria-checked"),
      ).toBe("true");
    } finally {
      await mounted.cleanup();
    }
  });
});

describe("keyboard paste", () => {
  test("pasting kbd makes its text a keyboard leaf with the exact characters", () => {
    const editor = pasteHtml("<p>Press <kbd>⌘K</kbd></p>");

    expect(markedText(editor, KEYS.kbd)).toEqual(["⌘K"]);
    expect(plainText(editor)).toBe("Press ⌘K");
  });

  test("pasting kbd inside inline code keeps code and drops kbd", () => {
    const editor = pasteHtml("<p><code><kbd>x</kbd></code></p>");

    expect(markedText(editor, KEYS.code)).toEqual(["x"]);
    expect(markedText(editor, KEYS.kbd)).toEqual([]);
  });

  test("an editor fragment keeps the keyboard mark", () => {
    const editor = paste([
      { type: "p", id: "p", children: [{ text: "Press " }, { text: "⌘K", kbd: true }] },
    ]);

    expect(markedText(editor, KEYS.kbd)).toEqual(["⌘K"]);
    expect(plainText(editor)).toBe("Press ⌘K");
  });
});

describe("keyboard clear formatting and demo", () => {
  test("clear formatting removes keyboard", () => {
    const editor = createEditor([paragraph("Hello", "p", { kbd: true, bold: true })]);
    editor.tf.select(textRange([0, 0], 0, 5));

    runEditorCommand(editor, clearFormatting, undefined);

    expect(leaves(editor)).toEqual([{ text: "Hello" }]);
  });

  test("the demo keyboard paragraph validates and marks only the key", () => {
    const parsed = parseEditorDocument(createEditorDocument("demo", DEMO_DOCUMENT_VALUE));
    const block = DEMO_DOCUMENT_VALUE.find((item) => item.id === "demo-kbd");
    const marked = block?.children
      .filter((child) => field(child, KEYS.kbd) === true)
      .map((child) => ("text" in child && typeof child.text === "string" ? child.text : ""));

    expect(parsed.status).toBe("ok");
    if (parsed.status !== "ok") {
      throw new Error("Expected a valid demo document.");
    }
    expect(parsed.repairs).toEqual([]);
    expect(marked).toEqual(["⌘K"]);
  });
});

async function mount(value: EditorValue, readOnly = false) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const editor = createPlateEditor({ plugins: createEditorPlugins(), value });
  let root: Root | undefined;
  await act(async () => {
    root = createRoot(host);
    root.render(
      <EditorSurface
        editor={editor}
        readOnly={readOnly}
        placeholder=""
        className="editor"
        onValueChange={() => {}}
      />,
    );
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

async function showToolbar(value: EditorValue = [paragraph("Hello world")]) {
  const mounted = await mount(value);
  mounted.editor.tf.select(textRange([0, 0], 0, 5));
  await act(async () => {
    const editable = mounted.host.querySelector("[data-slate-editor]");
    if (editable instanceof HTMLElement) {
      editable.focus();
    }
  });
  return mounted;
}

async function press(label: string): Promise<void> {
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
