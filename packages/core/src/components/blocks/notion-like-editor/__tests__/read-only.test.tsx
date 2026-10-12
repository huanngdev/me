import { describe, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { KEYS, type SlateEditor, type TElement } from "platejs";
import { createPlateEditor } from "platejs/react";

import { EditorSurface } from "../components/editor/editor-surface";
import { DEMO_DOCUMENT_VALUE } from "../demo/demo-document";
import * as commandModule from "../lib/commands/editor-commands";
import { runEditorCommand, type EditorCommand } from "../lib/commands/editor-commands";
import { createEditorDocument } from "../lib/document/editor-document";
import { parseEditorDocument } from "../lib/document/editor-document-validate";
import type { EditorValue } from "../lib/document/editor-value";
import { createEditorPlugins } from "../lib/plugins/editor-plugins";

const CHROME = [
  "[data-block-handle]",
  "[data-block-menu]",
  "[data-slash-menu]",
  "[data-selection-toolbar]",
  "[data-link-popover]",
  "[data-bookmark-popover]",
  "[data-paste-url]",
  "[data-mention-combobox]",
  "[data-table-controls]",
  "[data-block-marquee]",
  "[data-block-selected]",
  "[data-paste-repair]",
  "[data-block-placeholder]",
];

function isCommand(value: unknown): value is EditorCommand {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "run" in value &&
    typeof value.id === "string" &&
    typeof value.run === "function"
  );
}

function registryCommands(): EditorCommand[] {
  const byId = new Map<string, EditorCommand>();
  for (const value of Object.values(commandModule)) {
    if (isCommand(value)) {
      byId.set(value.id, value);
    }
    if (!Array.isArray(value)) {
      continue;
    }
    for (const item of value) {
      if (isCommand(item)) {
        byId.set(item.id, item);
      }
    }
  }
  return [...byId.values()];
}

type ShortcutHandler = (context: { editor: SlateEditor; event: KeyboardEvent }) => void;

function shortcutHandlers(editor: SlateEditor): { id: string; handler: ShortcutHandler }[] {
  const plugins = editor.meta.pluginList as {
    key: string;
    shortcuts?: Record<string, { handler?: ShortcutHandler }>;
  }[];
  const handlers: { id: string; handler: ShortcutHandler }[] = [];
  for (const plugin of plugins) {
    for (const [name, shortcut] of Object.entries(plugin.shortcuts ?? {})) {
      if (typeof shortcut.handler === "function") {
        handlers.push({ id: `${plugin.key}.${name}`, handler: shortcut.handler });
      }
    }
  }
  return handlers;
}

function paragraph(id: string, text: string): TElement {
  return { type: KEYS.p, id, children: [{ text }] };
}

async function mount(
  value: EditorValue,
  readOnly: boolean,
): Promise<{
  host: HTMLDivElement;
  editor: ReturnType<typeof createPlateEditor>;
  root: Root;
  changes: EditorValue[];
}> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const editor = createPlateEditor({
    plugins: createEditorPlugins(),
    value,
  });
  const changes: EditorValue[] = [];
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <EditorSurface
        editor={editor}
        readOnly={readOnly}
        placeholder="Type something…"
        className="editor"
        onValueChange={(next) => {
          changes.push(next);
        }}
      />,
    );
  });
  return { host, editor, root, changes };
}

describe("read-only mode", () => {
  test("requirement 1 and 2: chrome stays closed and editing does not turn itself on", async () => {
    const mounted = await mount(DEMO_DOCUMENT_VALUE, true);
    try {
      for (const selector of CHROME) {
        expect(mounted.host.querySelector(selector)).toBeNull();
        expect(document.body.querySelector(selector)).toBeNull();
      }
      expect(mounted.editor.dom.readOnly).toBe(true);
      const editable = mounted.host.querySelector("[data-slate-editor]");
      expect(editable?.getAttribute("contenteditable")).not.toBe("true");
    } finally {
      await act(async () => {
        mounted.root.unmount();
      });
      mounted.host.remove();
    }
  });

  test("requirement 3: commands and shortcuts leave the document unchanged", () => {
    const value = [paragraph("a", "Alpha")] as EditorValue;
    const editor = createPlateEditor({
      plugins: createEditorPlugins(),
      value,
    });
    editor.dom.readOnly = true;
    const before = JSON.stringify(editor.children);
    const commands = registryCommands();
    expect(commands.length).toBeGreaterThan(20);
    for (const command of commands) {
      expect(runEditorCommand(editor, command, undefined as never)).toBe(false);
    }
    const event = new KeyboardEvent("keydown", { key: "b", metaKey: true });
    for (const shortcut of shortcutHandlers(editor)) {
      shortcut.handler({ editor, event });
    }
    expect(shortcutHandlers(editor).length).toBeGreaterThan(5);
    expect(JSON.stringify(editor.children)).toBe(before);
  });

  test("requirement 4: a to-do checkbox is shown and not editable", async () => {
    const mounted = await mount(
      [
        {
          type: KEYS.p,
          id: "todo",
          listStyleType: KEYS.listTodo,
          indent: 1,
          checked: true,
          children: [{ text: "Done" }],
        },
      ] as EditorValue,
      true,
    );
    try {
      const checkbox = mounted.host.querySelector("[role='checkbox']");
      expect(checkbox?.getAttribute("aria-checked")).toBe("true");
      expect(
        checkbox?.getAttribute("aria-disabled") ?? checkbox?.getAttribute("disabled"),
      ).not.toBe(null);
      expect(checkbox?.getAttribute("tabindex")).not.toBe("0");
    } finally {
      await act(async () => {
        mounted.root.unmount();
      });
      mounted.host.remove();
    }
  });

  test("requirement 4: links keep a safe new-tab relationship", async () => {
    const mounted = await mount(DEMO_DOCUMENT_VALUE, true);
    try {
      const link = mounted.host.querySelector("a[data-link-url='https://example.com']");
      expect(link?.getAttribute("target")).toBe("_blank");
      expect(link?.getAttribute("rel")).toBe("noopener noreferrer nofollow");
    } finally {
      await act(async () => {
        mounted.root.unmount();
      });
      mounted.host.remove();
    }
  });

  test("requirement 6: an unknown node and an invalid attribute do not rewrite storage", () => {
    const raw = createEditorDocument("doc-bad", [
      { type: "aside", id: "unknown", children: [{ text: "Nope" }] },
      { type: "p", id: "bad-attr", indent: 1, children: [{ text: "Hi" }] },
    ] as EditorValue);
    const snapshot = JSON.stringify(raw);
    const parsed = parseEditorDocument(raw);
    expect(parsed.status).not.toBe("ok");
    expect(JSON.stringify(raw)).toBe(snapshot);
    if (parsed.status !== "ok") {
      expect(parsed.raw).toBe(raw);
    }
  });

  test("requirement 7: the editable root is not a writable textbox", async () => {
    const mounted = await mount([paragraph("a", "Alpha")] as EditorValue, true);
    try {
      const editable = mounted.host.querySelector("[data-slate-editor]");
      expect(editable).not.toBeNull();
      expect(editable?.getAttribute("contenteditable")).not.toBe("true");
      const role = editable?.getAttribute("role");
      if (role === "textbox") {
        expect(editable?.getAttribute("aria-readonly")).toBe("true");
      }
    } finally {
      await act(async () => {
        mounted.root.unmount();
      });
      mounted.host.remove();
    }
  });

  test("switching readOnly false then true then false keeps the document", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const editor = createPlateEditor({
      plugins: createEditorPlugins(),
      value: [paragraph("a", "Alpha")] as EditorValue,
    });
    const root = createRoot(host);
    const render = (readOnly: boolean) => {
      root.render(
        <EditorSurface editor={editor} readOnly={readOnly} placeholder="" className="editor" />,
      );
    };
    await act(async () => {
      render(false);
    });
    await act(async () => {
      render(true);
    });
    expect(editor.dom.readOnly).toBe(true);
    expect(JSON.stringify(editor.children)).toContain("Alpha");
    await act(async () => {
      render(false);
    });
    expect(editor.dom.readOnly).toBe(false);
    await act(async () => {
      root.unmount();
    });
    host.remove();
  });
});
