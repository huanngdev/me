import { describe, expect, test } from "bun:test";
import { KEYS, type SlateEditor } from "platejs";
import { Key, createPlateEditor } from "platejs/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";

import { todoTextId } from "./block-list";
import {
  TODO_LIST_TYPE,
  clearFormatting,
  getBlockType,
  runEditorCommand,
  setLineHeight,
  setListRestart,
  setTextAlign,
  toggleBulletedList,
  toggleNumberedList,
  toggleTodoChecked,
  toggleTodoList,
} from "./editor-commands";
import { parseEditorDocument } from "./editor-document-validate";
import {
  LIST_INDENTS,
  isAllowedElementAttrValue,
  isAllowedValue,
  unsatisfiedDependentAttrs,
} from "./editor-document-schema";
import { createEditorPlugins, pastedTodoChecked } from "./editor-plugins";
import { EditorSurface } from "./editor-surface";
import type { EditorValue } from "./editor-value";
import {
  blockIds,
  caret,
  createEditor,
  expectOk,
  expectUnsupported,
  field,
  isRecord,
  textRange,
  texts,
} from "./test-utils";

function envelope(content: unknown) {
  return {
    schemaVersion: 1,
    documentId: "doc",
    revision: 0,
    content,
  };
}

function todo(text: string, id: string, indent = 1, checked = false): EditorValue[number] {
  return {
    type: "p",
    id,
    indent,
    listStyleType: "todo",
    checked,
    children: [{ text }],
  };
}

function numbered(text: string, id: string, indent = 1): EditorValue[number] {
  return {
    type: "p",
    id,
    indent,
    listStyleType: "decimal",
    children: [{ text }],
  };
}

function pressShortcut(editor: SlateEditor, id: string): void {
  const shortcut = editor.meta.shortcuts[id];
  if (!shortcut?.handler) {
    throw new Error(`Missing shortcut ${id}.`);
  }

  shortcut.handler({ editor });
}

function hasTab(tf: object): tf is { tab: (options?: { reverse?: boolean }) => boolean } {
  return "tab" in tf && typeof tf.tab === "function";
}

function pressTab(editor: SlateEditor, reverse = false): boolean {
  if (!hasTab(editor.tf)) {
    throw new Error("Missing tab transform.");
  }

  return editor.tf.tab({ reverse }) === true;
}

function taskItem(html: string): HTMLElement {
  const created = document.createElement("li");
  created.innerHTML = html;
  return created;
}

function keepsCheckbox(element: ParentNode): boolean {
  return element.querySelector('input[type="checkbox"]') !== null;
}

function pasteHtml(html: string): SlateEditor {
  const editor = createEditor();
  editor.tf.select(caret([0, 0], 0));
  const data = new DataTransfer();
  data.setData("text/html", html);
  editor.tf.insertData(data);
  return editor;
}

function renderList(value: EditorValue, readOnly = false): string {
  const editor = createPlateEditor({
    plugins: createEditorPlugins(),
    value,
  });

  return renderToStaticMarkup(
    <EditorSurface editor={editor} readOnly={readOnly} placeholder="" className="editor" />,
  );
}

function shortcutCollisions(editor: SlateEditor, id: string): string[] {
  const keys = JSON.stringify(editor.meta.shortcuts[id]?.keys);
  return Object.entries(editor.meta.shortcuts)
    .filter(([shortcutId, shortcut]) => {
      if (shortcutId === id || !isRecord(shortcut) || !("keys" in shortcut)) {
        return false;
      }

      return JSON.stringify(shortcut.keys) === keys;
    })
    .map(([shortcutId]) => shortcutId);
}

type CheckboxControl = {
  dispatchEvent: (event: Event) => boolean;
  hasAttribute: (name: string) => boolean;
  ownerDocument: {
    defaultView: {
      MouseEvent: new (type: string, init?: MouseEventInit) => MouseEvent;
    } | null;
  };
};

function isReactContainer(value: object): value is Parameters<typeof createRoot>[0] {
  return "nodeType" in value && value.nodeType === 1;
}

function isCheckboxControl(value: unknown): value is CheckboxControl {
  if (
    !isRecord(value) ||
    typeof value.dispatchEvent !== "function" ||
    typeof value.hasAttribute !== "function" ||
    !isRecord(value.ownerDocument) ||
    !isRecord(value.ownerDocument.defaultView)
  ) {
    return false;
  }

  return typeof value.ownerDocument.defaultView.MouseEvent === "function";
}

function checkboxEvent(checkbox: CheckboxControl, type: "mousedown" | "click"): MouseEvent {
  const view = checkbox.ownerDocument.defaultView;
  if (!view) {
    throw new Error("Missing window.");
  }

  return new view.MouseEvent(type, { bubbles: true, cancelable: true });
}

// Plate's checkbox hook prevents mousedown (react/index.js). Mounting the same
// control is what proves the click writes one history entry without moving the selection.
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

async function mountTodos(
  value: EditorValue,
  readOnly: boolean,
): Promise<{
  editor: ReturnType<typeof createPlateEditor>;
  checkbox: CheckboxControl;
  cleanup: () => Promise<void>;
}> {
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

  const checkbox: unknown = host.querySelector("[role='checkbox']");
  if (!isCheckboxControl(checkbox)) {
    throw new Error("Missing to-do checkbox.");
  }

  return {
    editor,
    checkbox,
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

describe("to-do list allowlist", () => {
  test("isAllowedValue accepts the boolean checked values", () => {
    expect(isAllowedValue(true, [true, false])).toBe(true);
    expect(isAllowedValue(false, [true, false])).toBe(true);
    expect(isAllowedValue("true", [true, false])).toBe(false);
    expect(isAllowedValue(1, [true, false])).toBe(false);
    expect(isAllowedElementAttrValue(KEYS.p, "checked", true)).toBe(true);
    expect(isAllowedElementAttrValue(KEYS.p, "checked", false)).toBe(true);
    expect(isAllowedElementAttrValue(KEYS.p, "checked", "true")).toBe(false);
  });

  test("checked true and false round-trip at every indent", () => {
    for (const indent of LIST_INDENTS) {
      for (const checked of [true, false]) {
        const content = [todo("Item", "block-a", indent, checked)];
        const result = expectOk(parseEditorDocument(envelope(content)));

        expect(result.document.content).toBe(content);
        expect(field(result.document.content[0], "listStyleType")).toBe("todo");
        expect(field(result.document.content[0], "indent")).toBe(indent);
        expect(field(result.document.content[0], "checked")).toBe(checked);
      }
    }
  });

  test('checked "true" is unsupported and the raw document is kept', () => {
    const content = [
      {
        type: "p",
        id: "block-a",
        indent: 1,
        listStyleType: "todo",
        checked: "true",
        children: [{ text: "Item" }],
      },
    ];
    const raw = envelope(content);
    const result = expectUnsupported(parseEditorDocument(raw));

    expect(result.raw).toBe(raw);
    expect(
      result.issues.some((issue) => issue.message.includes('unsupported checked "true"')),
    ).toBe(true);
  });

  test.each(["disc", "decimal"] as const)(
    "checked on a %s item is unsupported",
    (listStyleType) => {
      expect(unsatisfiedDependentAttrs("p", { listStyleType, checked: true })).toEqual(["checked"]);

      const content = [
        {
          type: "p",
          id: "block-a",
          indent: 1,
          listStyleType,
          checked: true,
          children: [{ text: "Item" }],
        },
      ];
      const raw = envelope(content);
      const result = expectUnsupported(parseEditorDocument(raw));

      expect(result.raw).toBe(raw);
      expect(result.issues.some((issue) => issue.message.includes("unsupported checked"))).toBe(
        true,
      );
      expect(result.issues.some((issue) => issue.message.includes("without listStyleType"))).toBe(
        false,
      );
    },
  );

  test("checked on a paragraph is unsupported", () => {
    expect(unsatisfiedDependentAttrs("p", { checked: false })).toEqual(["checked"]);

    const content = [{ type: "p", id: "block-a", checked: false, children: [{ text: "Item" }] }];
    const raw = envelope(content);
    const result = expectUnsupported(parseEditorDocument(raw));

    expect(result.raw).toBe(raw);
    expect(
      result.issues.some((issue) =>
        issue.message.includes("unsupported checked without listStyleType"),
      ),
    ).toBe(true);
  });

  test("listStart on a to-do is unsupported", () => {
    expect(unsatisfiedDependentAttrs("p", { listStyleType: "todo", listStart: 2 })).toEqual([
      "listStart",
    ]);

    const content = [
      {
        type: "p",
        id: "block-a",
        indent: 1,
        listStyleType: "todo",
        checked: false,
        listStart: 2,
        children: [{ text: "Item" }],
      },
    ];
    const raw = envelope(content);
    const result = expectUnsupported(parseEditorDocument(raw));

    expect(result.raw).toBe(raw);
    expect(result.issues.some((issue) => issue.message.includes("unsupported listStart"))).toBe(
      true,
    );
    expect(result.issues.some((issue) => issue.message.includes("without listStyleType"))).toBe(
      false,
    );
  });

  test("normalize drops checked when the item leaves the to-do style", () => {
    const editor = createEditor([todo("Item", "block-a", 1, true)]);

    editor.tf.withoutNormalizing(() => {
      editor.tf.setNodes({ listStyleType: "disc" }, { at: [0] });
      // Slate normalizes when withoutNormalizing returns, so checked only exists inside.
      expect(field(editor.children[0], "checked")).toBe(true);
      expect(field(editor.children[0], "listStyleType")).toBe("disc");
    });

    editor.tf.normalize({ force: true });

    expect(field(editor.children[0], "checked")).toBeUndefined();
    expect(field(editor.children[0], "listStyleType")).toBe("disc");
    expect(field(editor.children[0], "indent")).toBe(1);

    editor.tf.withoutNormalizing(() => {
      editor.tf.setNodes({ listStyleType: "todo", checked: true }, { at: [0] });
      editor.tf.unsetNodes("listStyleType", { at: [0] });
      expect(field(editor.children[0], "checked")).toBe(true);
    });

    expect(field(editor.children[0], "checked")).toBeUndefined();
    expect(field(editor.children[0], "listStyleType")).toBeUndefined();
    expect(field(editor.children[0], "indent")).toBeUndefined();
  });
});

describe("toggle to-do list", () => {
  test("toggling a paragraph keeps text, marks, id, align, and line height, then removes checked", () => {
    const editor = createEditor([
      {
        type: "p",
        id: "block-a",
        align: "center",
        lineHeight: 2,
        children: [{ text: "Hello", bold: true }],
      },
    ]);
    editor.tf.select(caret([0, 0], 2));
    const before = editor.history.undos.length;

    expect(toggleTodoList.id).toBe("block.turn-into.todo-list");
    expect(toggleTodoList.label).toBe("To-do list");
    expect(toggleTodoList.group).toBe("turn-into");
    expect(runEditorCommand(editor, toggleTodoList, undefined)).toBe(true);

    expect(getBlockType(editor)).toBe(TODO_LIST_TYPE);
    expect(field(editor.children[0], "listStyleType")).toBe("todo");
    expect(field(editor.children[0], "indent")).toBe(1);
    expect(field(editor.children[0], "checked")).toBe(false);
    expect(field(editor.children[0], "align")).toBe("center");
    expect(field(editor.children[0], "lineHeight")).toBe(2);
    expect(blockIds(editor)).toEqual(["block-a"]);
    expect(editor.children[0]?.children[0]).toEqual({ text: "Hello", bold: true });
    expect(editor.history.undos.length - before).toBe(1);

    runEditorCommand(editor, toggleTodoList, undefined);

    expect(field(editor.children[0], "listStyleType")).toBeUndefined();
    expect(field(editor.children[0], "indent")).toBeUndefined();
    expect(field(editor.children[0], "checked")).toBeUndefined();
    expect(field(editor.children[0], "align")).toBe("center");
    expect(field(editor.children[0], "lineHeight")).toBe(2);
    expect(editor.children[0]?.children[0]).toEqual({ text: "Hello", bold: true });
  });

  test("switching to-do, bullet, and numbered keeps indent and drops checked", () => {
    const editor = createEditor([
      {
        type: "p",
        id: "block-a",
        indent: 2,
        listStyleType: "todo",
        checked: true,
        align: "right",
        lineHeight: 1.5,
        children: [{ text: "Item", italic: true }],
      },
    ]);
    editor.tf.select(caret([0, 0], 1));

    runEditorCommand(editor, toggleBulletedList, undefined);

    expect(field(editor.children[0], "listStyleType")).toBe("disc");
    expect(field(editor.children[0], "indent")).toBe(2);
    expect(field(editor.children[0], "checked")).toBeUndefined();
    expect(field(editor.children[0], "align")).toBe("right");
    expect(field(editor.children[0], "lineHeight")).toBe(1.5);
    expect(blockIds(editor)).toEqual(["block-a"]);
    expect(editor.children[0]?.children[0]).toEqual({ text: "Item", italic: true });

    runEditorCommand(editor, toggleNumberedList, undefined);

    expect(field(editor.children[0], "listStyleType")).toBe("decimal");
    expect(field(editor.children[0], "indent")).toBe(2);
    expect(field(editor.children[0], "checked")).toBeUndefined();

    runEditorCommand(editor, toggleTodoList, undefined);

    expect(field(editor.children[0], "listStyleType")).toBe("todo");
    expect(field(editor.children[0], "indent")).toBe(2);
    expect(field(editor.children[0], "checked")).toBe(false);
    expect(field(editor.children[0], "listStart")).toBeUndefined();
  });

  test("a multi-block selection makes every paragraph a to-do and skips a heading", () => {
    const editor = createEditor([
      { type: "p", id: "block-a", children: [{ text: "One" }] },
      { type: "h2", id: "block-b", children: [{ text: "Title" }] },
      { type: "p", id: "block-c", children: [{ text: "Two" }] },
    ]);
    editor.tf.select({
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [2, 0], offset: 2 },
    });
    const before = editor.history.undos.length;

    runEditorCommand(editor, toggleTodoList, undefined);

    expect(field(editor.children[0], "listStyleType")).toBe("todo");
    expect(field(editor.children[0], "checked")).toBe(false);
    expect(field(editor.children[1], "type")).toBe("h2");
    expect(field(editor.children[1], "listStyleType")).toBeUndefined();
    expect(field(editor.children[1], "checked")).toBeUndefined();
    expect(field(editor.children[2], "listStyleType")).toBe("todo");
    expect(field(editor.children[2], "checked")).toBe(false);
    expect(getBlockType(editor)).toBe("mixed");
    expect(editor.history.undos.length - before).toBe(1);

    editor.tf.undo();

    expect(field(editor.children[0], "listStyleType")).toBeUndefined();
    expect(field(editor.children[2], "listStyleType")).toBeUndefined();
    expect(field(editor.children[1], "type")).toBe("h2");
  });

  test("read-only refuses the command", () => {
    const editor = createEditor([{ type: "p", id: "block-a", children: [{ text: "Hello" }] }]);
    editor.tf.select(caret([0, 0], 1));
    const undos = editor.history.undos.length;

    expect(runEditorCommand(editor, toggleTodoList, undefined, { readOnly: true })).toBe(false);
    expect(field(editor.children[0], "listStyleType")).toBeUndefined();
    expect(editor.history.undos.length).toBe(undos);
  });

  test("getBlockType reports a to-do list or mixed", () => {
    const editor = createEditor([
      todo("One", "block-a", 1, true),
      { type: "p", id: "block-b", children: [{ text: "Two" }] },
    ]);

    editor.tf.select(caret([0, 0], 1));
    expect(getBlockType(editor)).toBe(TODO_LIST_TYPE);

    editor.tf.select({
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [1, 0], offset: 1 },
    });
    expect(getBlockType(editor)).toBe("mixed");
  });
});

describe("toggle to-do checked", () => {
  test("a single item flips, a mixed selection checks all, and all checked unchecks all", () => {
    const editor = createEditor([
      todo("One", "block-a", 1, false),
      todo("Two", "block-b", 1, true),
      {
        type: "p",
        id: "block-c",
        indent: 1,
        listStyleType: "disc",
        children: [{ text: "Bullet" }],
      },
    ]);
    editor.tf.select(caret([0, 0], 1));
    const before = editor.history.undos.length;

    expect(toggleTodoChecked.id).toBe("format.todo-checked");
    expect(toggleTodoChecked.group).toBe("format");
    expect(toggleTodoChecked.isEnabled?.(editor)).toBe(true);
    expect(runEditorCommand(editor, toggleTodoChecked, undefined)).toBe(true);

    expect(field(editor.children[0], "checked")).toBe(true);
    expect(field(editor.children[1], "checked")).toBe(true);
    expect(editor.history.undos.length - before).toBe(1);

    editor.tf.undo();
    expect(field(editor.children[0], "checked")).toBe(false);

    editor.tf.select({
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [2, 0], offset: 1 },
    });
    runEditorCommand(editor, toggleTodoChecked, undefined);

    expect(field(editor.children[0], "checked")).toBe(true);
    expect(field(editor.children[1], "checked")).toBe(true);
    expect(field(editor.children[2], "listStyleType")).toBe("disc");
    expect(field(editor.children[2], "checked")).toBeUndefined();

    editor.tf.select({
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [1, 0], offset: 1 },
    });
    runEditorCommand(editor, toggleTodoChecked, undefined);

    expect(field(editor.children[0], "checked")).toBe(false);
    expect(field(editor.children[1], "checked")).toBe(false);
  });

  test("read-only refuses and a bullet disables the command", () => {
    const todoEditor = createEditor([todo("One", "block-a", 1, false)]);
    todoEditor.tf.select(caret([0, 0], 1));
    const undos = todoEditor.history.undos.length;

    expect(runEditorCommand(todoEditor, toggleTodoChecked, undefined, { readOnly: true })).toBe(
      false,
    );
    expect(field(todoEditor.children[0], "checked")).toBe(false);
    expect(todoEditor.history.undos.length).toBe(undos);

    const bullet = createEditor([
      {
        type: "p",
        id: "block-a",
        indent: 1,
        listStyleType: "disc",
        children: [{ text: "Bullet" }],
      },
    ]);
    bullet.tf.select(caret([0, 0], 1));

    expect(toggleTodoChecked.isEnabled?.(bullet)).toBe(false);
    expect(runEditorCommand(bullet, toggleTodoChecked, undefined)).toBe(false);
    expect(field(bullet.children[0], "checked")).toBeUndefined();
    expect(field(bullet.children[0], "listStyleType")).toBe("disc");
  });
});

describe("to-do list shortcuts", () => {
  test("Mod+Shift+9 and Mod+Enter do not share keys with another editor shortcut", () => {
    const editor = createEditor();

    expect(editor.meta.shortcuts["list.toggleTodo"]?.keys).toEqual([[Key.Mod, Key.Shift, "9"]]);
    expect(editor.meta.shortcuts["list.toggleChecked"]?.keys).toEqual([[Key.Mod, "Enter"]]);
    expect(shortcutCollisions(editor, "list.toggleTodo")).toEqual([]);
    expect(shortcutCollisions(editor, "list.toggleChecked")).toEqual([]);
  });

  test("Mod+Shift+9 at a caret and on a range toggles the to-do list", () => {
    const editor = createEditor([
      { type: "p", id: "block-a", children: [{ text: "One" }] },
      { type: "p", id: "block-b", children: [{ text: "Two" }] },
    ]);
    editor.tf.select(caret([0, 0], 1));

    pressShortcut(editor, "list.toggleTodo");

    expect(field(editor.children[0], "listStyleType")).toBe("todo");
    expect(field(editor.children[0], "checked")).toBe(false);
    expect(field(editor.children[1], "listStyleType")).toBeUndefined();

    editor.tf.select({
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [1, 0], offset: 1 },
    });
    pressShortcut(editor, "list.toggleTodo");

    expect(field(editor.children[0], "listStyleType")).toBe("todo");
    expect(field(editor.children[1], "listStyleType")).toBe("todo");
  });

  test("Mod+Enter at a caret and on a range toggles checked", () => {
    const editor = createEditor([
      todo("One", "block-a", 1, false),
      todo("Two", "block-b", 1, true),
    ]);
    editor.tf.select(caret([0, 0], 1));

    pressShortcut(editor, "list.toggleChecked");

    expect(field(editor.children[0], "checked")).toBe(true);
    expect(field(editor.children[1], "checked")).toBe(true);

    editor.tf.select({
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [1, 0], offset: 1 },
    });
    pressShortcut(editor, "list.toggleChecked");

    expect(field(editor.children[0], "checked")).toBe(false);
    expect(field(editor.children[1], "checked")).toBe(false);
  });

  test("Mod+Shift+9 and Mod+Enter do nothing in a read-only editor", () => {
    const editor = createEditor([todo("Hello", "block-a", 1, false)]);
    editor.tf.select(caret([0, 0], 1));
    editor.dom.readOnly = true;
    const undos = editor.history.undos.length;

    pressShortcut(editor, "list.toggleTodo");
    pressShortcut(editor, "list.toggleChecked");

    expect(field(editor.children[0], "listStyleType")).toBe("todo");
    expect(field(editor.children[0], "checked")).toBe(false);
    expect(editor.history.undos.length).toBe(undos);
  });
});

describe("to-do list keyboard", () => {
  test("Enter at the end of a checked item adds an unchecked to-do", () => {
    const editor = createEditor([todo("Hello", "block-a", 2, true)]);
    editor.tf.select(caret([0, 0], 5));

    editor.tf.insertBreak();

    expect(texts(editor)).toEqual(["Hello", ""]);
    expect(blockIds(editor)[0]).toBe("block-a");
    expect(blockIds(editor)[1]).not.toBe("block-a");
    expect(field(editor.children[0], "listStyleType")).toBe("todo");
    expect(field(editor.children[0], "indent")).toBe(2);
    expect(field(editor.children[0], "checked")).toBe(true);
    expect(field(editor.children[1], "listStyleType")).toBe("todo");
    expect(field(editor.children[1], "indent")).toBe(2);
    expect(field(editor.children[1], "checked")).toBe(false);
  });

  test("Enter on an empty to-do outdents, then exits with no checked left", () => {
    const editor = createEditor([todo("Item", "block-a", 2, true)]);
    editor.tf.select(caret([0, 0], 4));
    editor.tf.insertBreak();
    editor.tf.insertBreak();

    expect(field(editor.children[1], "indent")).toBe(1);
    expect(field(editor.children[1], "listStyleType")).toBe("todo");
    expect(field(editor.children[1], "checked")).toBe(false);

    editor.tf.insertBreak();

    expect(editor.children).toHaveLength(2);
    expect(field(editor.children[1], "type")).toBe("p");
    expect(field(editor.children[1], "listStyleType")).toBeUndefined();
    expect(field(editor.children[1], "indent")).toBeUndefined();
    expect(field(editor.children[1], "checked")).toBeUndefined();
  });

  test("Tab nests a to-do and each item keeps its own checked value", () => {
    const editor = createEditor([todo("A", "block-a", 1, true), todo("B", "block-b", 1, false)]);
    editor.tf.select(caret([1, 0], 0));

    expect(pressTab(editor)).toBe(true);

    expect(field(editor.children[0], "indent")).toBe(1);
    expect(field(editor.children[0], "checked")).toBe(true);
    expect(field(editor.children[1], "indent")).toBe(2);
    expect(field(editor.children[1], "checked")).toBe(false);

    expect(pressTab(editor, true)).toBe(true);

    expect(field(editor.children[1], "indent")).toBe(1);
    expect(field(editor.children[1], "checked")).toBe(false);
    expect(field(editor.children[0], "checked")).toBe(true);
  });

  test("Backspace at the start of a to-do returns a paragraph and drops checked", () => {
    const editor = createEditor([
      todo("Above", "block-a", 1, false),
      {
        type: "p",
        id: "block-b",
        indent: 2,
        listStyleType: "todo",
        checked: true,
        children: [{ text: "Keep", bold: true }],
      },
    ]);
    editor.tf.select(caret([1, 0], 0));

    editor.tf.deleteBackward();

    expect(texts(editor)).toEqual(["Above", "Keep"]);
    expect(blockIds(editor)).toEqual(["block-a", "block-b"]);
    expect(field(editor.children[1], "type")).toBe("p");
    expect(field(editor.children[1], "listStyleType")).toBeUndefined();
    expect(field(editor.children[1], "indent")).toBeUndefined();
    expect(field(editor.children[1], "checked")).toBeUndefined();
    expect(editor.children[1]?.children[0]).toEqual({ text: "Keep", bold: true });
  });

  test("Enter at the start inserts an unchecked to-do above and keeps the original checked", () => {
    const editor = createEditor([
      {
        type: "p",
        id: "block-a",
        indent: 2,
        listStyleType: "todo",
        checked: true,
        align: "right",
        lineHeight: 2,
        children: [{ text: "Hello", bold: true }],
      },
    ]);
    editor.tf.select(caret([0, 0], 0));

    editor.tf.insertBreak();

    expect(texts(editor)).toEqual(["", "Hello"]);
    expect(blockIds(editor)[1]).toBe("block-a");
    expect(blockIds(editor)[0]).not.toBe("block-a");
    expect(field(editor.children[0], "listStyleType")).toBe("todo");
    expect(field(editor.children[0], "indent")).toBe(2);
    expect(field(editor.children[0], "checked")).toBe(false);
    expect(field(editor.children[0], "align")).toBeUndefined();
    expect(field(editor.children[1], "checked")).toBe(true);
    expect(field(editor.children[1], "align")).toBe("right");
    expect(field(editor.children[1], "lineHeight")).toBe(2);
    expect(editor.children[1]?.children[0]).toEqual({ text: "Hello", bold: true });
  });

  test("a to-do at the same depth breaks a numbered run, and a nested to-do does not", () => {
    const broken = createEditor([
      numbered("A", "a"),
      todo("Task", "task", 1, true),
      numbered("C", "c"),
    ]);

    expect(field(broken.children[2], "listStart")).toBeUndefined();

    const nested = createEditor([
      numbered("A", "a"),
      todo("Task", "task", 2, false),
      numbered("B", "b"),
    ]);
    nested.tf.normalize({ force: true });

    expect(field(nested.children[2], "listStart")).toBe(2);
  });

  test("typing a markdown checkbox does not start a to-do", () => {
    for (const typed of ["[] ", "[ ] ", "[x] "]) {
      const editor = createEditor([{ type: "p", id: "block-a", children: [{ text: "" }] }]);
      editor.tf.select(caret([0, 0], 0));

      editor.tf.insertText(typed);

      expect(texts(editor)).toEqual([typed]);
      expect(field(editor.children[0], "listStyleType")).toBeUndefined();
      expect(field(editor.children[0], "checked")).toBeUndefined();
    }
  });
});

describe("to-do list paste", () => {
  test("a GitHub task list becomes checked and unchecked to-dos", () => {
    const editor = pasteHtml(
      '<ul class="contains-task-list"><li class="task-list-item"><input type="checkbox" checked disabled> Done</li><li class="task-list-item"><input type="checkbox" disabled> Open</li></ul>',
    );

    expect(texts(editor).map((line) => line.trim())).toEqual(["Done", "Open"]);
    expect(editor.children.map((node) => field(node, "listStyleType"))).toEqual(["todo", "todo"]);
    expect(editor.children.map((node) => field(node, "checked"))).toEqual([true, false]);
    expect(editor.children.map((node) => field(node, "indent"))).toEqual([1, 1]);
    expect(JSON.stringify(editor.children)).not.toContain("input");
    expect(JSON.stringify(editor.children)).not.toContain("checkbox");
  });

  test("parsing the same task item twice returns the same checked value", () => {
    const done = taskItem('<input type="checkbox" checked disabled> Done');
    const open = taskItem('<input type="checkbox" disabled> Open');

    expect(pastedTodoChecked(done)).toBe(pastedTodoChecked(done));
    expect(pastedTodoChecked(done)).toBe(true);
    expect(pastedTodoChecked(open)).toBe(pastedTodoChecked(open));
    expect(pastedTodoChecked(open)).toBe(false);
    expect(keepsCheckbox(done)).toBe(true);
    expect(keepsCheckbox(open)).toBe(true);
  });

  test("Google Docs checklist HTML keeps role=checkbox as a to-do", () => {
    const editor = pasteHtml(
      '<b style="font-weight:normal" id="docs-internal-guid-todo"><ul style="margin-top:0;margin-bottom:0"><li dir="ltr" role="checkbox" aria-checked="true" style="list-style-type:none"><p role="presentation">Done in Docs</p></li><li dir="ltr" role="checkbox" aria-checked="false" style="list-style-type:none"><p role="presentation">Open in Docs</p></li></ul></b>',
    );

    expect(texts(editor).map((line) => line.trim())).toEqual(["Done in Docs", "Open in Docs"]);
    expect(editor.children.map((node) => field(node, "listStyleType"))).toEqual(["todo", "todo"]);
    expect(editor.children.map((node) => field(node, "checked"))).toEqual([true, false]);
    expect(editor.children.map((node) => field(node, "indent"))).toEqual([1, 1]);
  });

  test("Notion checkbox markup without a checkbox input stays a disc list", () => {
    const editor = pasteHtml(
      '<ul><li><div class="checkbox checkbox-on"></div><span>Done in Notion</span></li><li><div class="checkbox checkbox-off"></div><span>Open in Notion</span></li></ul>',
    );

    expect(texts(editor).map((line) => line.trim())).toEqual(["Done in Notion", "Open in Notion"]);
    expect(editor.children.map((node) => field(node, "listStyleType"))).toEqual(["disc", "disc"]);
    expect(editor.children.every((node) => field(node, "checked") === undefined)).toBe(true);
  });

  test("an editor fragment keeps checked", () => {
    const editor = createEditor();
    editor.tf.select(caret([0, 0], 0));
    editor.tf.insertFragment([
      todo("A", "keep-a", 1, true),
      {
        type: "p",
        id: "keep-b",
        listStyleType: "todo",
        indent: 2,
        checked: false,
        align: "center",
        children: [{ text: "B" }],
      },
    ]);

    const items = editor.children.filter((node) => field(node, "listStyleType") === "todo");

    expect(texts(editor).filter((line) => line === "A" || line === "B")).toEqual(["A", "B"]);
    expect(items.map((node) => field(node, "checked"))).toEqual([true, false]);
    expect(items.map((node) => field(node, "indent"))).toEqual([1, 2]);
    expect(field(items[1], "align")).toBe("center");
  });

  test("plain text checkbox syntax stays text", () => {
    const editor = createPlateEditor({
      plugins: createEditorPlugins(),
      value: [{ type: "p", id: "block-a", children: [{ text: "" }] }],
    });
    editor.tf.select(caret([0, 0], 0));
    const data = new DataTransfer();
    data.setData("text/plain", "[ ] a");
    editor.tf.insertData(data);

    expect(JSON.stringify(editor.children)).not.toContain("listStyleType");
    expect(JSON.stringify(editor.children)).not.toContain("checked");
    expect(texts(editor)).toEqual(["[ ] a"]);
  });
});

describe("to-do formatting commands", () => {
  test("clear formatting keeps checked", () => {
    const editor = createEditor([
      {
        type: "p",
        id: "block-a",
        indent: 1,
        listStyleType: "todo",
        checked: true,
        children: [{ text: "Done", bold: true }],
      },
    ]);
    editor.tf.select(textRange([0, 0], 0, 4));

    expect(runEditorCommand(editor, clearFormatting, undefined)).toBe(true);

    expect(editor.children[0]?.children[0]).toEqual({ text: "Done" });
    expect(field(editor.children[0], "checked")).toBe(true);
    expect(field(editor.children[0], "listStyleType")).toBe("todo");
  });

  test("align and line height apply to a to-do and restart refuses", () => {
    const editor = createEditor([todo("Item", "block-a", 1, true)]);
    editor.tf.select(caret([0, 0], 1));

    expect(runEditorCommand(editor, setTextAlign, "center")).toBe(true);
    expect(runEditorCommand(editor, setLineHeight, 2)).toBe(true);

    expect(field(editor.children[0], "align")).toBe("center");
    expect(field(editor.children[0], "lineHeight")).toBe(2);
    expect(field(editor.children[0], "checked")).toBe(true);
    expect(field(editor.children[0], "listStyleType")).toBe("todo");

    expect(setListRestart.isEnabled?.(editor)).toBe(false);
    expect(runEditorCommand(editor, setListRestart, 3)).toBe(false);
    expect(field(editor.children[0], "listRestart")).toBeUndefined();
    expect(field(editor.children[0], "listStart")).toBeUndefined();
    expect(field(editor.children[0], "checked")).toBe(true);
  });
});

describe("to-do list rendering", () => {
  test("a to-do renders a checkbox named by its text", () => {
    const html = renderList([
      todo("Write the spec.", "demo-todo", 1, true),
      todo("Ship it.", "open", 2, false),
    ]);

    expect(html.match(/<ul/g)?.length).toBe(2);
    expect(html).not.toContain("<ol");
    expect(html).toContain("list-none");
    expect(html).toContain("pl-6");
    expect(html).toContain("pl-12");
    expect(html).toContain('data-list-item="todo"');
    expect(html).toContain('role="checkbox"');
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain('aria-checked="false"');
    expect(html).toContain(`aria-labelledby="${todoTextId("demo-todo")}"`);
    expect(html).toContain(`id="${todoTextId("demo-todo")}"`);
    expect(html).toContain("Write the spec.");
    expect(html.toLowerCase()).toContain('contenteditable="false"');
    expect(html).toContain("data-checked");
    expect(html).toContain("data-checked:line-through");
    expect(html).toContain("data-checked:text-muted-foreground");
    expect(html).toContain("-left-5");
    expect(todoTextId("demo-todo")).toBe("todo-text-demo-todo");
  });

  test("a read-only to-do checkbox is disabled", () => {
    const html = renderList([todo("Write the spec.", "demo-todo", 1, true)], true);

    expect(html).toContain('role="checkbox"');
    expect(html).toContain("disabled");
  });
});

describe("to-do checkbox interaction", () => {
  test("a click checks the item in one history step and mousedown keeps the selection", async () => {
    const mounted = await mountTodos(
      [
        todo("Write the spec.", "demo-todo", 1, false),
        { type: "p", id: "other", children: [{ text: "Other" }] },
      ],
      false,
    );

    try {
      mounted.editor.tf.select(textRange([1, 0], 0, 5));
      const selection = JSON.stringify(mounted.editor.selection);
      const down = checkboxEvent(mounted.checkbox, "mousedown");
      mounted.checkbox.dispatchEvent(down);

      expect(down.defaultPrevented).toBe(true);
      expect(JSON.stringify(mounted.editor.selection)).toBe(selection);

      const undos = mounted.editor.history.undos.length;
      await act(async () => {
        mounted.checkbox.dispatchEvent(checkboxEvent(mounted.checkbox, "click"));
      });

      expect(field(mounted.editor.children[0], "checked")).toBe(true);
      expect(mounted.editor.history.undos.length - undos).toBe(1);
      expect(JSON.stringify(mounted.editor.selection)).toBe(selection);
    } finally {
      await mounted.cleanup();
    }
  });

  test("a read-only click does nothing", async () => {
    const mounted = await mountTodos([todo("Write the spec.", "demo-todo", 1, false)], true);

    try {
      const undos = mounted.editor.history.undos.length;
      await act(async () => {
        mounted.checkbox.dispatchEvent(checkboxEvent(mounted.checkbox, "click"));
      });

      expect(mounted.checkbox.hasAttribute("disabled")).toBe(true);
      expect(field(mounted.editor.children[0], "checked")).toBe(false);
      expect(mounted.editor.history.undos.length).toBe(undos);
    } finally {
      await mounted.cleanup();
    }
  });
});
