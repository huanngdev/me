import { describe, expect, test } from "bun:test";
import { KEYS } from "platejs";
import { createPlateEditor } from "platejs/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { EditorSurface } from "../components/editor/editor-surface";
import type { EditorValue } from "../lib/document/editor-value";
import { closeFind, findNext, findState, openFind, setFindQuery } from "../lib/plugins/editor-find";
import { createEditorPlugins } from "../lib/plugins/editor-plugins";

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

function para(id: string, children: unknown[]): EditorValue[number] {
  return { type: KEYS.p, id, children } as unknown as EditorValue[number];
}

async function mount(value: EditorValue, readOnly = false) {
  const before = new Set(Array.from(document.body.childNodes));
  const host = document.createElement("div");
  document.body.appendChild(host);
  const editor = createPlateEditor({ plugins: createEditorPlugins(), value });
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
    flush: async () => {
      await act(async () => {
        await Promise.resolve();
        await new Promise((resolve) => {
          setTimeout(resolve, 30);
        });
      });
    },
    cleanup: async () => {
      await act(async () => {
        root?.unmount();
      });
      for (const node of Array.from(document.body.childNodes)) {
        if (!before.has(node)) {
          node.remove();
        }
      }
    },
  };
}

function highlights(host: HTMLElement): HTMLElement[] {
  return Array.from(host.querySelectorAll<HTMLElement>("[data-find-match]"));
}

function activeHighlights(host: HTMLElement): HTMLElement[] {
  return Array.from(host.querySelectorAll<HTMLElement>("[data-find-active]"));
}

describe("find highlights", () => {
  test("every match is highlighted and exactly one is active", async () => {
    const view = await mount([para("p1", [{ text: "foo bar foo" }])] as EditorValue);
    await act(async () => {
      openFind(view.editor);
      setFindQuery(view.editor, "foo");
    });
    await view.flush();

    expect(highlights(view.host).map((node) => node.textContent)).toEqual(["foo", "foo"]);
    expect(activeHighlights(view.host)).toHaveLength(1);
    expect(activeHighlights(view.host)[0]).toBe(highlights(view.host)[0]);
    await view.cleanup();
  });

  test("findNext moves the active highlight and wraps around", async () => {
    const view = await mount([para("p1", [{ text: "foo bar foo" }])] as EditorValue);
    await act(async () => {
      openFind(view.editor);
      setFindQuery(view.editor, "foo");
      findNext(view.editor);
    });
    await view.flush();
    expect(activeHighlights(view.host)[0]).toBe(highlights(view.host)[1]);

    await act(async () => {
      findNext(view.editor);
    });
    await view.flush();
    expect(activeHighlights(view.host)).toHaveLength(1);
    expect(activeHighlights(view.host)[0]).toBe(highlights(view.host)[0]);
    await view.cleanup();
  });

  test("closing removes every highlight and keeps the query for the next open", async () => {
    const view = await mount([para("p1", [{ text: "foo bar foo" }])] as EditorValue);
    await act(async () => {
      openFind(view.editor);
      setFindQuery(view.editor, "foo");
    });
    await view.flush();
    expect(highlights(view.host)).toHaveLength(2);

    await act(async () => {
      closeFind(view.editor);
    });
    await view.flush();
    expect(highlights(view.host)).toHaveLength(0);

    await act(async () => {
      openFind(view.editor);
    });
    await view.flush();
    expect(findState(view.editor).query).toBe("foo");
    expect(highlights(view.host)).toHaveLength(2);
    await view.cleanup();
  });

  test("a match across three leaves produces three highlighted spans", async () => {
    const view = await mount([
      para("p1", [{ text: "a f" }, { text: "o", bold: true }, { text: "o b" }]),
    ] as EditorValue);
    await act(async () => {
      openFind(view.editor);
      setFindQuery(view.editor, "a foo b");
    });
    await view.flush();

    expect(highlights(view.host).map((node) => node.textContent)).toEqual(["a f", "o", "o b"]);
    expect(activeHighlights(view.host)).toHaveLength(3);
    await view.cleanup();
  });

  test("nothing is highlighted while the find bar is closed", async () => {
    const view = await mount([para("p1", [{ text: "foo" }])] as EditorValue);
    await act(async () => {
      setFindQuery(view.editor, "foo");
    });
    await view.flush();
    expect(highlights(view.host)).toHaveLength(0);
    await view.cleanup();
  });

  test("highlights are shown in a read-only editor", async () => {
    const view = await mount([para("p1", [{ text: "foo" }])] as EditorValue, true);
    await act(async () => {
      openFind(view.editor);
      setFindQuery(view.editor, "foo");
    });
    await view.flush();
    expect(highlights(view.host)).toHaveLength(1);
    await view.cleanup();
  });
});
