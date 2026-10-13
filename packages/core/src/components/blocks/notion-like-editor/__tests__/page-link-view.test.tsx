import { describe, expect, test } from "bun:test";
import { type SlateEditor, type TElement } from "platejs";
import { createPlateEditor } from "platejs/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { EditorSurface } from "../components/editor/editor-surface";
import {
  PAGE_LINK_KEY,
  type PageEntity,
  type PageProvider,
  type PageResolution,
} from "../lib/features/editor-page-link";
import type { PageOpenRequest } from "../lib/features/editor-page-link";
import { onPageLinkKeyDown } from "../lib/plugins/editor-page-link";
import { setPageLinkResolveTimeoutMs } from "../components/elements/page-link-element";
import { setBlockSelection } from "../lib/plugins/editor-block-selection";
import { createEditorPlugins } from "../lib/plugins/editor-plugins";
import type { EditorValue } from "../lib/document/editor-value";
import { field } from "./test-utils";

const PAGE_ID = "page-alpha";

type Mounted = {
  editor: SlateEditor;
  host: HTMLElement;
  cleanup: () => Promise<void>;
};

function pageLink(id: string, extra: Record<string, unknown> = {}): TElement {
  const node: TElement = {
    type: PAGE_LINK_KEY,
    id,
    pageId: PAGE_ID,
    title: "Stored title",
    kind: "link",
    children: [{ text: "" }],
  };
  for (const [key, value] of Object.entries(extra)) {
    node[key] = value;
  }
  return node;
}

function paragraph(text: string, id: string): TElement {
  return { type: "p", id, children: [{ text }] };
}

function isElementHost(value: object): value is Parameters<typeof createRoot>[0] {
  return "nodeType" in value && value.nodeType === 1;
}

function stubAnimationFrame(): () => void {
  const previousFrame = Reflect.get(globalThis, "requestAnimationFrame");
  const previousCancel = Reflect.get(globalThis, "cancelAnimationFrame");
  Reflect.set(globalThis, "requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  Reflect.set(globalThis, "cancelAnimationFrame", () => {});
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
  return () => {
    Reflect.set(globalThis, "requestAnimationFrame", previousFrame);
    Reflect.set(globalThis, "cancelAnimationFrame", previousCancel);
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT");
  };
}

type ProviderMode = PageResolution | "reject" | "hang";

function providerOf(
  mode: ProviderMode,
  pageIds: string[] = [],
  signals: AbortSignal[] = [],
): PageProvider {
  return {
    search: () => Promise.resolve([]),
    resolve(pageId, signal) {
      pageIds.push(pageId);
      signals.push(signal);
      if (mode === "reject") {
        return Promise.reject(new Error("resolve failed"));
      }

      if (mode === "hang") {
        return new Promise(() => {});
      }

      return Promise.resolve(mode);
    },
  };
}

async function mountPageLink(
  value: EditorValue,
  options: {
    pageProvider?: PageProvider | null;
    onOpenPage?: ((request: PageOpenRequest) => void) | null;
    readOnly?: boolean;
  } = {},
): Promise<Mounted> {
  const restoreFrame = stubAnimationFrame();
  const before = new Set(Array.from(document.body.childNodes));
  const host = document.createElement("div");
  document.body.appendChild(host);
  const editor = createPlateEditor({ plugins: createEditorPlugins(), value });
  let root: Root | undefined;
  if (!isElementHost(host)) {
    throw new Error("Missing mount node.");
  }

  await act(async () => {
    root = createRoot(host);
    root.render(
      <EditorSurface
        editor={editor}
        readOnly={options.readOnly ?? false}
        placeholder=""
        className="editor"
        pageProvider={options.pageProvider ?? null}
        onOpenPage={options.onOpenPage ?? null}
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
      for (const node of Array.from(document.body.childNodes)) {
        if (!before.has(node)) {
          node.remove();
        }
      }
      restoreFrame();
    },
  };
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
  });
}

function row(host: HTMLElement): HTMLElement {
  const element = host.querySelector<HTMLElement>("[data-page-link]");
  if (!element) {
    throw new Error("Missing page link row.");
  }

  return element;
}

function titleText(host: HTMLElement): string {
  return host.querySelector("[data-page-title]")?.textContent ?? "";
}

function status(host: HTMLElement): string | null {
  return row(host).getAttribute("data-page-status");
}

function ok(page: Partial<PageEntity> = {}): PageResolution {
  return { status: "ok", page: { pageId: PAGE_ID, title: "Renamed page", icon: "📄", ...page } };
}

const ONE_BLOCK: EditorValue = [pageLink("pl-1")];

describe("page link resolve and render", () => {
  test("a renamed page shows the new title while the stored fallback title does not change", async () => {
    const pageIds: string[] = [];
    const mounted = await mountPageLink(ONE_BLOCK, { pageProvider: providerOf(ok(), pageIds) });
    const before = mounted.editor.children;
    const undos = mounted.editor.history.undos.length;

    await flush();

    expect(status(mounted.host)).toBe("ok");
    expect(titleText(mounted.host)).toBe("Renamed page");
    expect(row(mounted.host).textContent).toContain("📄");
    expect(mounted.editor.children).toBe(before);
    expect(mounted.editor.history.undos.length).toBe(undos);
    expect(field(mounted.editor.children[0], "title")).toBe("Stored title");
    expect(pageIds).toEqual([PAGE_ID]);
    await mounted.cleanup();
  });

  test("without a provider the row shows the stored title and status fallback, with no label", async () => {
    const mounted = await mountPageLink(ONE_BLOCK);
    expect(status(mounted.host)).toBe("fallback");
    expect(titleText(mounted.host)).toBe("Stored title");
    expect(mounted.host.textContent).not.toContain("Unavailable");
    expect(mounted.host.textContent).not.toContain("not found");
    await mounted.cleanup();
  });

  test("a missing page shows the stored title and Page not found", async () => {
    const mounted = await mountPageLink(ONE_BLOCK, {
      pageProvider: providerOf({ status: "missing" }),
    });
    await flush();
    expect(status(mounted.host)).toBe("missing");
    expect(titleText(mounted.host)).toBe("Stored title");
    expect(mounted.host.textContent).toContain("Page not found");
    await mounted.cleanup();
  });

  test("a denied page shows the stored title and No access", async () => {
    const mounted = await mountPageLink(ONE_BLOCK, {
      pageProvider: providerOf({ status: "denied" }),
    });
    await flush();
    expect(status(mounted.host)).toBe("denied");
    expect(titleText(mounted.host)).toBe("Stored title");
    expect(mounted.host.textContent).toContain("No access");
    await mounted.cleanup();
  });

  test("a rejected resolve shows the stored title and Unavailable", async () => {
    const mounted = await mountPageLink(ONE_BLOCK, { pageProvider: providerOf("reject") });
    await flush();
    expect(status(mounted.host)).toBe("unavailable");
    expect(titleText(mounted.host)).toBe("Stored title");
    expect(mounted.host.textContent).toContain("Unavailable");
    await mounted.cleanup();
  });

  test("a resolve that never settles is aborted after the timeout and shows Unavailable", async () => {
    const restoreTimeout = setPageLinkResolveTimeoutMs(30);
    const signals: AbortSignal[] = [];
    try {
      const mounted = await mountPageLink(ONE_BLOCK, {
        pageProvider: providerOf("hang", [], signals),
      });
      await act(async () => {
        await new Promise((resolve) => {
          setTimeout(resolve, 60);
        });
      });
      expect(signals[0]?.aborted).toBe(true);
      expect(status(mounted.host)).toBe("unavailable");
      expect(titleText(mounted.host)).toBe("Stored title");
      await mounted.cleanup();
    } finally {
      restoreTimeout();
    }
  });

  test("a result that arrives after unmount is ignored and throws nothing", async () => {
    let settle: ((resolution: PageResolution) => void) | undefined;
    const signals: AbortSignal[] = [];
    const provider: PageProvider = {
      search: () => Promise.resolve([]),
      resolve(_pageId, signal) {
        signals.push(signal);
        return new Promise((resolve) => {
          settle = resolve;
        });
      },
    };
    const mounted = await mountPageLink(ONE_BLOCK, { pageProvider: provider });
    await mounted.cleanup();

    expect(signals[0]?.aborted).toBe(true);
    expect(() => settle?.(ok())).not.toThrow();
    await flush();
  });

  test("control characters and an over-long title are cleaned on screen", async () => {
    const mounted = await mountPageLink(ONE_BLOCK, {
      pageProvider: providerOf(ok({ title: `Bad\u0007Title${"x".repeat(300)}` })),
    });
    await flush();
    const shown = titleText(mounted.host);
    expect(shown.startsWith("BadTitle")).toBe(true);
    expect(shown).toHaveLength(200);
    expect(shown).not.toContain("\u0007");
    await mounted.cleanup();
  });

  test("an icon that is not one grapheme of at most 8 units is ignored", async () => {
    const mounted = await mountPageLink(ONE_BLOCK, {
      pageProvider: providerOf(ok({ icon: "ab" })),
    });
    await flush();
    expect(status(mounted.host)).toBe("ok");
    expect(row(mounted.host).textContent).not.toContain("ab");
    await mounted.cleanup();
  });

  test("an empty title shows Untitled, both resolved and as the stored fallback", async () => {
    const resolved = await mountPageLink(ONE_BLOCK, {
      pageProvider: providerOf(ok({ title: "" })),
    });
    await flush();
    expect(titleText(resolved.host)).toBe("Untitled");
    await resolved.cleanup();

    const stored = await mountPageLink([pageLink("pl-2", { title: "" })]);
    expect(titleText(stored.host)).toBe("Untitled");
    await stored.cleanup();
  });

  test("a child page renders with its data kind and the same title", async () => {
    const mounted = await mountPageLink([pageLink("pl-3", { kind: "child" })], {
      pageProvider: providerOf(ok()),
    });
    await flush();
    expect(row(mounted.host).getAttribute("data-page-kind")).toBe("child");
    expect(row(mounted.host).getAttribute("data-page-id")).toBe(PAGE_ID);
    await mounted.cleanup();
  });

  test("the provider is called once per page and the document never changes", async () => {
    const pageIds: string[] = [];
    const mounted = await mountPageLink(ONE_BLOCK, { pageProvider: providerOf(ok(), pageIds) });
    await flush();
    await flush();
    expect(pageIds).toEqual([PAGE_ID]);
    expect(mounted.editor.history.undos.length).toBe(0);
    await mounted.cleanup();
  });
});

describe("page link opening in edit mode", () => {
  test("a plain click selects the block and does not open the page", async () => {
    const opened: PageOpenRequest[] = [];
    const mounted = await mountPageLink([paragraph("Before", "p-0"), pageLink("pl-1")], {
      pageProvider: providerOf(ok()),
      onOpenPage: (request) => {
        opened.push(request);
      },
    });
    await flush();
    await act(async () => {
      row(mounted.host).dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
    });
    expect(mounted.editor.selection?.anchor.path[0]).toBe(1);
    await act(async () => {
      row(mounted.host).dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(opened).toEqual([]);
    await mounted.cleanup();
  });

  test("Mod+click and Cmd+click open with the page id and kind", async () => {
    const opened: PageOpenRequest[] = [];
    const mounted = await mountPageLink([pageLink("pl-1", { kind: "child" })], {
      pageProvider: providerOf(ok()),
      onOpenPage: (request) => {
        opened.push(request);
      },
    });
    await flush();
    await act(async () => {
      row(mounted.host).dispatchEvent(new MouseEvent("click", { bubbles: true, ctrlKey: true }));
    });
    await act(async () => {
      row(mounted.host).dispatchEvent(new MouseEvent("click", { bubbles: true, metaKey: true }));
    });
    expect(opened).toEqual([
      { pageId: PAGE_ID, kind: "child" },
      { pageId: PAGE_ID, kind: "child" },
    ]);
    await mounted.cleanup();
  });

  test("Enter on the selected page link opens it", async () => {
    const opened: PageOpenRequest[] = [];
    const mounted = await mountPageLink(ONE_BLOCK, {
      pageProvider: providerOf(ok()),
      onOpenPage: (request) => {
        opened.push(request);
      },
    });
    await flush();
    const start = mounted.editor.api.start([0]);
    if (!start) {
      throw new Error("Missing point.");
    }
    await act(async () => {
      mounted.editor.tf.select({ anchor: start, focus: start });
    });
    await act(async () => {
      const handled = onPageLinkKeyDown(mounted.editor, { key: "Enter", preventDefault() {} });
      expect(handled).toBe(true);
    });
    expect(opened).toEqual([{ pageId: PAGE_ID, kind: "link" }]);
    await mounted.cleanup();
  });

  test("a missing or denied page never opens by click or Enter", async () => {
    for (const mode of [{ status: "missing" as const }, { status: "denied" as const }]) {
      const opened: PageOpenRequest[] = [];
      const mounted = await mountPageLink(ONE_BLOCK, {
        pageProvider: providerOf(mode),
        onOpenPage: (request) => {
          opened.push(request);
        },
      });
      await flush();
      await act(async () => {
        row(mounted.host).dispatchEvent(new MouseEvent("click", { bubbles: true, ctrlKey: true }));
      });
      const start = mounted.editor.api.start([0]);
      if (!start) {
        throw new Error("Missing point.");
      }
      await act(async () => {
        mounted.editor.tf.select({ anchor: start, focus: start });
        onPageLinkKeyDown(mounted.editor, { key: "Enter", preventDefault() {} });
      });
      expect(opened).toEqual([]);
      await mounted.cleanup();
    }
  });

  test("without onOpenPage nothing is called and nothing throws", async () => {
    const mounted = await mountPageLink(ONE_BLOCK, { pageProvider: providerOf(ok()) });
    await flush();
    await act(async () => {
      row(mounted.host).dispatchEvent(new MouseEvent("click", { bubbles: true, ctrlKey: true }));
    });
    const start = mounted.editor.api.start([0]);
    if (!start) {
      throw new Error("Missing point.");
    }
    await act(async () => {
      mounted.editor.tf.select({ anchor: start, focus: start });
      onPageLinkKeyDown(mounted.editor, { key: "Enter", preventDefault() {} });
    });
    await mounted.cleanup();
  });

  test("a block selection never opens the page", async () => {
    // slate-react reads the free globals innerWidth and innerHeight when it scrolls a selection.
    const previousWidth = Reflect.get(globalThis, "innerWidth");
    const previousHeight = Reflect.get(globalThis, "innerHeight");
    Reflect.set(globalThis, "innerWidth", 1280);
    Reflect.set(globalThis, "innerHeight", 800);
    try {
      const opened: PageOpenRequest[] = [];
      const mounted = await mountPageLink([pageLink("pl-1"), paragraph("Next", "p-next")], {
        pageProvider: providerOf(ok()),
        onOpenPage: (request) => {
          opened.push(request);
        },
      });
      await flush();
      await act(async () => {
        setBlockSelection(mounted.editor, ["pl-1"]);
      });
      await act(async () => {
        row(mounted.host).dispatchEvent(new MouseEvent("click", { bubbles: true, ctrlKey: true }));
      });
      expect(opened).toEqual([]);
      await mounted.cleanup();
    } finally {
      Reflect.set(globalThis, "innerWidth", previousWidth);
      Reflect.set(globalThis, "innerHeight", previousHeight);
    }
  });

  test("plain-text copy writes the stored title, or Untitled when it is empty", async () => {
    const mounted = await mountPageLink([pageLink("pl-copy", { title: "Stored title" })]);
    const start = mounted.editor.api.start([0]);
    const end = mounted.editor.api.end([0]);
    if (!start || !end) {
      throw new Error("Missing point.");
    }
    await act(async () => {
      mounted.editor.tf.select({ anchor: start, focus: end });
    });
    const written = new Map<string, string>();
    const data = {
      setData: (type: string, value: string) => {
        written.set(type, value);
      },
      getData: (type: string) => written.get(type) ?? "",
    } as unknown as DataTransfer;
    mounted.editor.tf.setFragmentData(data);
    expect(written.get("text/plain")).toBe("Stored title");
    await mounted.cleanup();

    const empty = await mountPageLink([pageLink("pl-empty", { title: "" })]);
    const emptyStart = empty.editor.api.start([0]);
    const emptyEnd = empty.editor.api.end([0]);
    if (!emptyStart || !emptyEnd) {
      throw new Error("Missing point.");
    }
    await act(async () => {
      empty.editor.tf.select({ anchor: emptyStart, focus: emptyEnd });
    });
    const untitled = new Map<string, string>();
    const untitledData = {
      setData: (type: string, value: string) => {
        untitled.set(type, value);
      },
      getData: (type: string) => untitled.get(type) ?? "",
    } as unknown as DataTransfer;
    empty.editor.tf.setFragmentData(untitledData);
    expect(untitled.get("text/plain")).toBe("Untitled");
    await empty.cleanup();
  });

  test("the edit-mode row is not a tab stop and has no link role", async () => {
    const mounted = await mountPageLink(ONE_BLOCK, { pageProvider: providerOf(ok()) });
    expect(row(mounted.host).getAttribute("tabindex")).toBeNull();
    expect(row(mounted.host).getAttribute("role")).toBeNull();
    await mounted.cleanup();
  });
});

describe("page link opening in read-only mode", () => {
  test("the row is a focusable link, and a plain click opens the renamed page", async () => {
    const opened: PageOpenRequest[] = [];
    const mounted = await mountPageLink(ONE_BLOCK, {
      readOnly: true,
      pageProvider: providerOf(ok()),
      onOpenPage: (request) => {
        opened.push(request);
      },
    });
    await flush();
    expect(row(mounted.host).getAttribute("role")).toBe("link");
    expect(row(mounted.host).getAttribute("tabindex")).toBe("0");
    expect(row(mounted.host).getAttribute("aria-label")).toBe("Renamed page");
    expect(row(mounted.host).getAttribute("aria-disabled")).toBeNull();
    await act(async () => {
      row(mounted.host).dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(opened).toEqual([{ pageId: PAGE_ID, kind: "link" }]);
    await mounted.cleanup();
  });

  test("Enter and Space on the focused row open the page", async () => {
    const opened: PageOpenRequest[] = [];
    const mounted = await mountPageLink(ONE_BLOCK, {
      readOnly: true,
      pageProvider: null,
      onOpenPage: (request) => {
        opened.push(request);
      },
    });
    await act(async () => {
      row(mounted.host).dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });
    await act(async () => {
      row(mounted.host).dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
    });
    expect(opened).toEqual([
      { pageId: PAGE_ID, kind: "link" },
      { pageId: PAGE_ID, kind: "link" },
    ]);
    await mounted.cleanup();
  });

  test("a missing page is aria-disabled and does not open", async () => {
    const opened: PageOpenRequest[] = [];
    const mounted = await mountPageLink(ONE_BLOCK, {
      readOnly: true,
      pageProvider: providerOf({ status: "missing" }),
      onOpenPage: (request) => {
        opened.push(request);
      },
    });
    await flush();
    expect(row(mounted.host).getAttribute("aria-disabled")).toBe("true");
    await act(async () => {
      row(mounted.host).dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await act(async () => {
      row(mounted.host).dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });
    expect(opened).toEqual([]);
    await mounted.cleanup();
  });
});
