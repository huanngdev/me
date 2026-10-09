import { describe, expect, test } from "bun:test";
import { type SlateEditor, type TElement } from "platejs";
import { createPlateEditor } from "platejs/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";

import {
  BOOKMARK_CARD_CLASS,
  BOOKMARK_PREVIEW_TIMEOUT_MS,
  setBookmarkPreviewTimeoutMs,
} from "./bookmark-element";
import { runEditorCommand } from "./editor-commands";
import { createEditorDocument, serializeEditorDocument } from "./editor-document";
import { allowedChildTypes, isVoidElementType } from "./editor-document-schema";
import { parseEditorDocument, type ParseResult } from "./editor-document-validate";
import {
  applyBookmarkPreview,
  convertBookmarkToText,
  insertBookmarkFromUrl,
  removeBookmark,
} from "./editor-bookmark";
import {
  BOOKMARK_INVALID_URL,
  BOOKMARK_KEY,
  BOOKMARK_PASTE_DROPPED,
  BOOKMARK_TITLE_MAX,
  normalizeBookmarkUrl,
  sanitizeBookmarkText,
} from "./editor-bookmark-url";
import { demoLinkPreviewAdapter } from "./demo-link-preview";
import { EditorSurface } from "./editor-surface";
import { createEditorPlugins } from "./editor-plugins";
import { pasteRepairsOf } from "./editor-paste";
import {
  applyPasteUrlAction,
  clearPasteUrlOffer,
  pasteUrlActions,
  pasteUrlPlugin,
} from "./editor-paste-url";
import type { LinkPreview, LinkPreviewAdapter } from "./editor-bookmark-url";
import type { EditorValue } from "./editor-value";
import { blockIds, caret, createEditor, expectOk, field, isRecord, texts } from "./test-utils";

const PLATE_DOCS = "https://platejs.org/docs";
const FALLBACK_URL = "https://example.com/not-in-the-preview-list";
const YOUTUBE = "https://www.youtube.com/watch?v=jNQXAC9IVRw";

function paragraph(text: string, id: string): TElement {
  return { type: "p", id, children: [{ text }] };
}

function bookmark(id: string, extra: Record<string, unknown> = {}): TElement {
  const node: TElement = {
    type: BOOKMARK_KEY,
    id,
    url: PLATE_DOCS,
    children: [{ text: "" }],
  };
  for (const [key, value] of Object.entries(extra)) {
    node[key] = value;
  }
  return node;
}

function quote(id: string, children: TElement[]): TElement {
  return { type: "blockquote", id, children };
}

function callout(id: string, children: TElement[]): TElement {
  return { type: "callout", id, children };
}

function toggle(id: string, children: TElement[]): TElement {
  return { type: "toggle", id, children };
}

function cell(kind: "td" | "th", id: string, children: TElement[]): TElement {
  return { type: kind, id, children };
}

function row(id: string, cells: TElement[]): TElement {
  return { type: "tr", id, children: cells };
}

function tableNode(id: string, rows: TElement[]): TElement {
  return { type: "table", id, children: rows };
}

function codeBlock(text: string): TElement {
  return {
    type: "code_block",
    id: "code-1",
    children: [{ type: "code_line", id: "line-1", children: [{ text }] }],
  };
}

function documentOf(content: TElement[]): ParseResult {
  return parseEditorDocument(createEditorDocument("doc-bookmark", content));
}

function messages(result: ParseResult): string {
  if (result.status !== "unsupported" && result.status !== "invalid") {
    return "";
  }

  return result.issues.map((issue) => issue.message).join("\n");
}

function typesOf(editor: SlateEditor): string[] {
  return editor.children.map((block) => block.type);
}

function blockString(editor: SlateEditor, index = 0): string {
  const block = editor.children[index];
  if (block === undefined) {
    throw new Error("Missing block.");
  }

  return editor.api.string(block);
}

function childTypes(node: unknown): string[] {
  if (!isRecord(node) || !Array.isArray(node.children)) {
    return [];
  }

  return node.children.map((child) => {
    const type = field(child, "type");
    return typeof type === "string" ? type : "";
  });
}

function plateEditor(value: TElement[]): SlateEditor {
  return createPlateEditor({ plugins: createEditorPlugins(), value });
}

function pasteText(editor: SlateEditor, text: string, html = ""): void {
  const data = new DataTransfer();
  data.setData("text/plain", text);
  if (html.length > 0) {
    data.setData("text/html", html);
  }
  editor.tf.insertData(data);
}

function pasteHtml(editor: SlateEditor, html: string): void {
  const data = new DataTransfer();
  data.setData("text/html", html);
  editor.tf.insertData(data);
}

function offerOf(editor: SlateEditor): { url: string } | undefined {
  return editor.getOption(pasteUrlPlugin, "offer");
}

function previewAdapter(
  preview: LinkPreview | null,
  calls: string[],
  signals: AbortSignal[],
  fail?: "throw" | "hang",
): LinkPreviewAdapter {
  return {
    fetchPreview(url, signal) {
      calls.push(url);
      signals.push(signal);
      if (fail === "throw") {
        return Promise.reject(new Error("preview failed"));
      }

      if (fail === "hang") {
        return new Promise((resolve) => {
          signal.addEventListener("abort", () => {
            resolve(null);
          });
        });
      }

      return Promise.resolve(preview);
    },
  };
}

function isReactContainer(value: object): value is Parameters<typeof createRoot>[0] {
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

async function mountBookmark(
  value: EditorValue,
  linkPreview: LinkPreviewAdapter | null = null,
  readOnly = false,
) {
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
      <EditorSurface
        editor={editor}
        readOnly={readOnly}
        placeholder=""
        className="editor"
        linkPreview={linkPreview}
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

describe("bookmark schema", () => {
  test("a stored bookmark round-trips with and without metadata", () => {
    expect(isVoidElementType(BOOKMARK_KEY)).toBe(true);
    const rich = bookmark("rich", {
      title: "Plate",
      description: "Docs",
      siteName: "Plate",
      imageUrl: "/blocks/notion-like-editor/bookmark-demo.svg",
      fetchedAt: "2026-10-08T00:00:00.000Z",
    });
    const parsed = expectOk(documentOf([rich]));
    expect(parsed.repairs).toEqual([]);
    expect(parsed.document.content).toEqual([rich]);
    const again = expectOk(
      parseEditorDocument(JSON.parse(serializeEditorDocument(parsed.document))),
    );
    expect(again.document.content).toEqual([rich]);

    const plain = bookmark("plain");
    const plainParsed = expectOk(documentOf([plain]));
    expect(plainParsed.document.content).toEqual([plain]);
    const plainAgain = expectOk(
      parseEditorDocument(JSON.parse(serializeEditorDocument(plainParsed.document))),
    );
    expect(plainAgain.document.content).toEqual([plain]);
  });

  test("rejects unsafe urls, unknown attrs, html, a non-https image, and a bad timestamp", () => {
    expect(messages(documentOf([bookmark("bad", { url: "javascript:alert(1)" })]))).toContain(
      "url",
    );
    expect(messages(documentOf([bookmark("bad", { url: "data:text/html,hi" })]))).toContain("url");
    expect(messages(documentOf([bookmark("bad", { url: "ftp://example.com/a" })]))).toContain(
      "url",
    );
    expect(
      messages(documentOf([bookmark("bad", { url: "https://user:pass@example.com/a" })])),
    ).toContain("url");
    expect(
      messages(documentOf([bookmark("bad", { url: `https://example.com/${"a".repeat(2048)}` })])),
    ).toContain("url");
    expect(messages(documentOf([bookmark("bad", { note: "extra" })]))).toContain(
      'attribute "note"',
    );
    expect(messages(documentOf([bookmark("bad", { html: "<iframe>" })]))).toContain(
      'attribute "html"',
    );
    expect(messages(documentOf([bookmark("bad", { iframe: "x" })]))).toContain(
      'attribute "iframe"',
    );
    expect(messages(documentOf([bookmark("bad", { script: "x" })]))).toContain(
      'attribute "script"',
    );
    expect(
      messages(documentOf([bookmark("bad", { imageUrl: "http://example.com/a.png" })])),
    ).toContain("imageUrl");
    expect(messages(documentOf([bookmark("bad", { fetchedAt: "yesterday" })]))).toContain(
      "fetchedAt",
    );
    expect(
      messages(documentOf([bookmark("bad", { fetchedAt: "2026-13-40T00:00:00.000Z" })])),
    ).toContain("fetchedAt");
  });
});

describe("bookmark sanitizer", () => {
  test("strips controls and bidi marks, collapses whitespace, truncates, and keeps Unicode", () => {
    expect(sanitizeBookmarkText("a\u0001b\u007fc", 20)).toBe("abc");
    expect(sanitizeBookmarkText("a\u202eb\u2066c", 20)).toBe("abc");
    expect(sanitizeBookmarkText("a \n\t  b", 20)).toBe("a b");
    expect(sanitizeBookmarkText("abcdef", 5)).toBe("abcd…");
    expect([..."abcd…"].length).toBe(5);
    expect(sanitizeBookmarkText("e\u0301 🎉", 20)).toBe("é 🎉");
    expect(sanitizeBookmarkText("   \n\t  ", 20)).toBeUndefined();
    expect(sanitizeBookmarkText("x".repeat(BOOKMARK_TITLE_MAX + 5), BOOKMARK_TITLE_MAX)).toBe(
      `${"x".repeat(BOOKMARK_TITLE_MAX - 1)}…`,
    );
  });
});

describe("bookmark commands", () => {
  test("insert, convert, and remove each undo once, and an invalid url is unchanged", () => {
    expect(insertBookmarkFromUrl.id).toBe("block.insert.bookmark");
    expect(insertBookmarkFromUrl.label).toBe("Bookmark");
    const editor = createEditor([paragraph("", "empty")]);
    editor.tf.select(caret([0, 0], 0));
    const before = JSON.parse(JSON.stringify(editor.children));
    runEditorCommand(editor, insertBookmarkFromUrl, `  ${PLATE_DOCS}  `);
    expect(field(editor.children[0], "type")).toBe(BOOKMARK_KEY);
    expect(field(editor.children[0], "url")).toBe(PLATE_DOCS);
    expect(editor.history.undos.length).toBe(1);
    editor.tf.undo();
    expect(editor.children).toEqual(before);

    runEditorCommand(editor, insertBookmarkFromUrl, "javascript:alert(1)");
    expect(editor.children).toEqual(before);
    expect(pasteRepairsOf(editor).map((repair) => repair.message)).toContain(BOOKMARK_INVALID_URL);
    expect(editor.history.undos.length).toBe(0);

    runEditorCommand(editor, insertBookmarkFromUrl, PLATE_DOCS);
    const id = String(field(editor.children[0], "id"));
    runEditorCommand(editor, convertBookmarkToText, id);
    expect(typesOf(editor)).toEqual(["p"]);
    expect(texts(editor)).toEqual([PLATE_DOCS]);
    expect(editor.history.undos.length).toBe(2);
    editor.tf.undo();
    expect(field(editor.children[0], "type")).toBe(BOOKMARK_KEY);

    runEditorCommand(editor, removeBookmark, String(field(editor.children[0], "id")));
    expect(typesOf(editor)).toEqual(["p"]);
    expect(texts(editor)).toEqual([""]);
    expect(editor.history.undos.length).toBe(2);
    editor.tf.undo();
    expect(field(editor.children[0], "type")).toBe(BOOKMARK_KEY);

    editor.dom.readOnly = true;
    const frozen = JSON.parse(JSON.stringify(editor.children));
    runEditorCommand(editor, insertBookmarkFromUrl, PLATE_DOCS);
    runEditorCommand(editor, convertBookmarkToText, String(field(editor.children[0], "id")));
    runEditorCommand(editor, removeBookmark, String(field(editor.children[0], "id")));
    expect(editor.children).toEqual(frozen);
  });
});

describe("bookmark preview adapter", () => {
  test("no adapter leaves the fallback card and does not fetch", async () => {
    const mounted = await mountBookmark([bookmark("plain", { url: FALLBACK_URL })]);
    await flush();
    const card = mounted.host.querySelector("[data-bookmark-card]");
    expect(card?.getAttribute("data-bookmark-status")).toBe("fallback");
    expect(mounted.host.querySelector("[data-bookmark-skeleton]")).toBeNull();
    expect(mounted.host.querySelector("[data-bookmark-unavailable]")).toBeNull();
    expect(mounted.host.textContent).toContain(FALLBACK_URL);
    expect(mounted.host.textContent).toContain("example.com");
    await mounted.cleanup();
  });

  test("a stored preview is not fetched again", async () => {
    const calls: string[] = [];
    const signals: AbortSignal[] = [];
    const mounted = await mountBookmark(
      [
        bookmark("rich", {
          title: "Plate",
          fetchedAt: "2026-10-08T00:00:00.000Z",
        }),
      ],
      previewAdapter({ title: "Other" }, calls, signals),
    );
    await flush();
    expect(calls).toEqual([]);
    expect(field(mounted.editor.children[0], "title")).toBe("Plate");
    await mounted.cleanup();
  });

  test("a successful preview is stored without a history entry, and undo removes the block", async () => {
    const calls: string[] = [];
    const signals: AbortSignal[] = [];
    const mounted = await mountBookmark(
      [paragraph("", "empty")],
      previewAdapter(
        { title: "<b>Plate</b>", description: "Docs", siteName: "Plate", imageUrl: "/cover.svg" },
        calls,
        signals,
      ),
    );
    mounted.editor.tf.select(caret([0, 0], 0));
    const before = JSON.parse(JSON.stringify(mounted.editor.children));
    await act(async () => {
      runEditorCommand(mounted.editor, insertBookmarkFromUrl, PLATE_DOCS);
    });
    expect(mounted.editor.history.undos.length).toBe(1);
    await flush();
    expect(calls).toEqual([PLATE_DOCS]);
    expect(field(mounted.editor.children[0], "title")).toBe("<b>Plate</b>");
    expect(field(mounted.editor.children[0], "description")).toBe("Docs");
    expect(field(mounted.editor.children[0], "fetchedAt")).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(mounted.editor.history.undos.length).toBe(1);
    expect(mounted.host.querySelector("b")).toBeNull();
    expect(mounted.host.textContent).toContain("<b>Plate</b>");
    mounted.editor.tf.undo();
    expect(mounted.editor.children).toEqual(before);
    await mounted.cleanup();
  });

  test("null, a throw, and a timeout keep the url and write nothing", async () => {
    const emptyCalls: string[] = [];
    const empty = await mountBookmark(
      [bookmark("plain", { url: FALLBACK_URL })],
      previewAdapter(null, emptyCalls, []),
    );
    await flush();
    expect(emptyCalls).toEqual([FALLBACK_URL]);
    expect(field(empty.editor.children[0], "url")).toBe(FALLBACK_URL);
    expect(field(empty.editor.children[0], "fetchedAt")).toBeUndefined();
    expect(
      empty.host.querySelector("[data-bookmark-card]")?.getAttribute("data-bookmark-status"),
    ).toBe("fallback");
    expect(empty.host.querySelector("[data-bookmark-unavailable]")).toBeNull();
    expect(empty.host.textContent).not.toContain("Preview unavailable");
    await empty.cleanup();

    const thrown = await mountBookmark(
      [bookmark("plain", { url: FALLBACK_URL })],
      previewAdapter(null, [], [], "throw"),
    );
    await flush();
    expect(field(thrown.editor.children[0], "url")).toBe(FALLBACK_URL);
    expect(field(thrown.editor.children[0], "title")).toBeUndefined();
    expect(thrown.host.querySelector("[data-bookmark-unavailable]")).not.toBeNull();
    await thrown.cleanup();

    const restoreTimeout = setBookmarkPreviewTimeoutMs(30);
    const hungCalls: string[] = [];
    const hungSignals: AbortSignal[] = [];
    const hung = await mountBookmark(
      [bookmark("plain", { url: FALLBACK_URL })],
      previewAdapter(null, hungCalls, hungSignals, "hang"),
    );
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 50);
      });
    });
    expect(hungSignals[0]?.aborted).toBe(true);
    expect(field(hung.editor.children[0], "url")).toBe(FALLBACK_URL);
    expect(field(hung.editor.children[0], "fetchedAt")).toBeUndefined();
    expect(hung.host.querySelector("[data-bookmark-unavailable]")).not.toBeNull();
    restoreTimeout();
    await hung.cleanup();
  });

  test("the demo fallback card stays a plain url card", async () => {
    const mounted = await mountBookmark(
      [bookmark("demo-bookmark-fallback", { url: FALLBACK_URL })],
      demoLinkPreviewAdapter,
    );
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 500);
      });
    });
    const card = mounted.host.querySelector("[data-bookmark-card]");
    expect(card?.getAttribute("data-bookmark-status")).toBe("fallback");
    expect(card?.textContent).toContain("example.com");
    expect(card?.textContent).toContain(FALLBACK_URL);
    expect(mounted.host.querySelector("[data-bookmark-unavailable]")).toBeNull();
    expect(mounted.host.textContent).not.toContain("Preview unavailable");
    expect(field(mounted.editor.children[0], "url")).toBe(FALLBACK_URL);
    expect(field(mounted.editor.children[0], "fetchedAt")).toBeUndefined();
    expect(Reflect.get(globalThis, "__bookmarkPreviewFetches")).toBeUndefined();
    await mounted.cleanup();
  });

  test("remove and unmount abort the preview request", async () => {
    const removedSignals: AbortSignal[] = [];
    const removed = await mountBookmark(
      [bookmark("plain", { url: FALLBACK_URL })],
      previewAdapter(null, [], removedSignals, "hang"),
    );
    await flush();
    expect(removedSignals[0]?.aborted).toBe(false);
    await act(async () => {
      runEditorCommand(removed.editor, removeBookmark, "plain");
    });
    expect(removedSignals[0]?.aborted).toBe(true);
    await removed.cleanup();

    const unmountedSignals: AbortSignal[] = [];
    const unmounted = await mountBookmark(
      [bookmark("plain", { url: FALLBACK_URL })],
      previewAdapter(null, [], unmountedSignals, "hang"),
    );
    await flush();
    expect(unmountedSignals[0]?.aborted).toBe(false);
    await unmounted.cleanup();
    expect(unmountedSignals[0]?.aborted).toBe(true);
  });

  test("refresh replaces the cached preview without a history entry", async () => {
    const calls: string[] = [];
    let title = "First";
    const mounted = await mountBookmark([bookmark("plain", { url: PLATE_DOCS })], {
      fetchPreview(url) {
        calls.push(url);
        return Promise.resolve({ title, description: "Docs" });
      },
    });
    await flush();
    expect(field(mounted.editor.children[0], "title")).toBe("First");
    const undos = mounted.editor.history.undos.length;
    title = "Second";
    const button = mounted.host.querySelector("[aria-label='Refresh preview']");
    if (!(button instanceof HTMLButtonElement)) {
      throw new Error("Missing refresh button.");
    }
    await act(async () => {
      button.click();
    });
    await flush();
    expect(calls).toEqual([PLATE_DOCS, PLATE_DOCS]);
    expect(field(mounted.editor.children[0], "title")).toBe("Second");
    expect(mounted.editor.history.undos.length).toBe(undos);
    expect(applyBookmarkPreview(mounted.editor, "missing", PLATE_DOCS, { title: "No" })).toBe(
      false,
    );
    await mounted.cleanup();
  });
});

describe("bookmark paste menu", () => {
  test("bookmark is offered for every url, including a video url", async () => {
    expect(pasteUrlActions.map((action) => action.label)).toEqual(["Bookmark"]);
    const editor = plateEditor([paragraph("", "empty")]);
    editor.tf.select(caret([0, 0], 0));
    pasteText(editor, `  ${FALLBACK_URL}  `);
    expect(offerOf(editor)?.url).toBe(FALLBACK_URL);
    expect(editor.history.undos.length).toBe(1);
    runEditorCommand(editor, applyPasteUrlAction, "bookmark");
    expect(typesOf(editor)).toEqual([BOOKMARK_KEY]);
    expect(field(editor.children[0], "url")).toBe(FALLBACK_URL);
    expect(editor.history.undos.length).toBe(2);
    editor.tf.undo();
    expect(blockString(editor)).toBe(FALLBACK_URL);
    expect(childTypes(editor.children[0])).toContain("a");

    const video = plateEditor([paragraph("", "empty")]);
    video.tf.select(caret([0, 0], 0));
    pasteText(video, YOUTUBE);
    expect(offerOf(video)?.url).toBe(YOUTUBE);
    expect(
      pasteUrlActions.filter((action) => action.match(YOUTUBE)).map((action) => action.label),
    ).toEqual(["Bookmark"]);

    const mounted = await mountBookmark([paragraph("", "empty")]);
    mounted.editor.tf.select(caret([0, 0], 0));
    await act(async () => {
      pasteText(mounted.editor, YOUTUBE);
    });
    const menu = document.querySelector("[data-paste-url-menu]");
    expect(menu?.textContent).toContain("Bookmark");
    expect(menu?.textContent).not.toContain("Embed");
    expect(menu?.textContent).toContain("Keep as link");
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(document.querySelector("[data-paste-url-menu]")).toBeNull();
    expect(blockString(mounted.editor)).toBe(YOUTUBE);
    expect(childTypes(mounted.editor.children[0])).toContain("a");
    await mounted.cleanup();
  });

  test("typing dismisses the menu, and code, table, and read-only paste stay text", async () => {
    const typed = plateEditor([paragraph("", "empty")]);
    typed.tf.select(caret([0, 0], 0));
    pasteText(typed, FALLBACK_URL);
    typed.tf.insertText("!");
    expect(offerOf(typed)).toBeUndefined();

    const moved = plateEditor([paragraph("", "empty"), paragraph("Next", "next")]);
    moved.tf.select(caret([0, 0], 0));
    pasteText(moved, FALLBACK_URL);
    moved.tf.select(caret([1, 0], 0));
    await Promise.resolve();
    expect(offerOf(moved)).toBeUndefined();

    clearPasteUrlOffer(typed);
    const code = plateEditor([codeBlock("")]);
    code.tf.select(caret([0, 0, 0], 0));
    pasteText(code, FALLBACK_URL);
    expect(offerOf(code)).toBeUndefined();

    const table = plateEditor([
      tableNode("table-1", [row("row-1", [cell("td", "cell-1", [paragraph("", "cell-p")])])]),
    ]);
    table.tf.select(caret([0, 0, 0, 0, 0], 0));
    pasteText(table, FALLBACK_URL);
    expect(offerOf(table)).toBeUndefined();

    const readonly = plateEditor([paragraph("", "empty")]);
    readonly.dom.readOnly = true;
    readonly.tf.select(caret([0, 0], 0));
    pasteText(readonly, FALLBACK_URL);
    expect(offerOf(readonly)).toBeUndefined();
  });

  test("copy keeps the attrs and a new id, and an html anchor becomes a link", () => {
    const copied = createEditor([paragraph("", "empty")]);
    copied.tf.select(caret([0, 0], 0));
    copied.tf.insertFragment([
      bookmark("same", {
        title: "Plate",
        description: "Docs",
        siteName: "Plate",
        imageUrl: "/blocks/notion-like-editor/bookmark-demo.svg",
        fetchedAt: "2026-10-08T00:00:00.000Z",
      }),
    ]);
    const pasted = copied.children.find((block) => block.type === BOOKMARK_KEY);
    expect(field(pasted, "url")).toBe(PLATE_DOCS);
    expect(field(pasted, "title")).toBe("Plate");
    expect(field(pasted, "fetchedAt")).toBe("2026-10-08T00:00:00.000Z");
    expect(field(pasted, "id")).not.toBe("same");

    const dropped = createEditor([paragraph("Stay", "stay")]);
    dropped.tf.select(caret([0, 0], 0));
    dropped.tf.insertFragment([bookmark("bad", { url: "javascript:alert(1)" })]);
    expect(typesOf(dropped)).not.toContain(BOOKMARK_KEY);
    expect(pasteRepairsOf(dropped).map((repair) => repair.message)).toContain(
      BOOKMARK_PASTE_DROPPED,
    );

    const linked = plateEditor([paragraph("", "empty")]);
    linked.tf.select(caret([0, 0], 0));
    pasteHtml(linked, `<p><a href="${PLATE_DOCS}">Docs</a></p>`);
    expect(typesOf(linked)).not.toContain(BOOKMARK_KEY);
    expect(blockString(linked)).toContain("Docs");
    expect(childTypes(linked.children[0])).toContain("a");
    expect(JSON.stringify(linked.children)).toContain(PLATE_DOCS);
    expect(JSON.stringify(linked.children)).not.toContain("target");
    expect(normalizeBookmarkUrl("javascript:alert(1)")).toBeUndefined();
  });
});

describe("bookmark render", () => {
  test("the skeleton uses the card height, and a long url and unicode title stay inside 360px", async () => {
    expect(BOOKMARK_CARD_CLASS).toContain("h-28");
    expect(BOOKMARK_PREVIEW_TIMEOUT_MS).toBe(5000);
    const title = "Tiêu đề 🎉 và đường dẫn";
    const longUrl = `https://example.com/${"a".repeat(280)}`;
    const calls: string[] = [];
    const mounted = await mountBookmark(
      [
        bookmark("loading", { url: FALLBACK_URL }),
        bookmark("ready", {
          url: longUrl,
          title,
          description: "A wrapped description that stays on two lines.",
          siteName: "Example",
          imageUrl: "/blocks/notion-like-editor/bookmark-demo.svg",
          fetchedAt: "2026-10-08T00:00:00.000Z",
        }),
      ],
      previewAdapter(null, calls, [], "hang"),
    );
    const skeleton = mounted.host.querySelector("[data-bookmark-skeleton]");
    const ready = mounted.host.querySelector('[data-bookmark-url="' + longUrl + '"]');
    expect(skeleton?.className).toContain("h-28");
    expect(ready?.className).toContain("h-28");
    expect(ready?.textContent).toContain(title);
    expect(ready?.textContent).toContain(longUrl);
    expect(ready?.innerHTML).toContain("overflow-wrap:anywhere");
    expect(ready?.innerHTML).toContain("line-clamp-2");
    mounted.host.style.width = "360px";
    if (ready instanceof HTMLElement && ready.clientWidth > 0) {
      expect(ready.scrollWidth).toBeLessThanOrEqual(ready.clientWidth);
    }
    await mounted.cleanup();
  });

  test("a broken thumbnail hides its box", async () => {
    const mounted = await mountBookmark([
      bookmark("rich", {
        title: "Plate",
        imageUrl: "https://example.com/cover.svg",
        fetchedAt: "2026-10-08T00:00:00.000Z",
      }),
    ]);
    const image = mounted.host.querySelector("[data-bookmark-thumbnail] img");
    if (image === null) {
      throw new Error("Missing thumbnail.");
    }
    expect(image.getAttribute("alt")).toBe("");
    expect(image.getAttribute("loading")).toBe("lazy");
    expect(image.getAttribute("referrerpolicy")).toBe("no-referrer");
    await act(async () => {
      image.dispatchEvent(new Event("error"));
    });
    expect(mounted.host.querySelector("[data-bookmark-thumbnail]")).toBeNull();
    expect(mounted.host.textContent).toContain("Plate");
    await mounted.cleanup();
  });

  test("read-only renders the card as a link, and an editable click selects the void", async () => {
    const html = renderToStaticMarkup(
      <EditorSurface
        editor={createPlateEditor({
          plugins: createEditorPlugins(),
          value: [bookmark("rich", { title: "Plate", fetchedAt: "2026-10-08T00:00:00.000Z" })],
        })}
        readOnly
        placeholder=""
        className="editor"
      />,
    );
    expect(html).toContain(`href="${PLATE_DOCS}"`);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer nofollow"');
    expect(html).not.toContain('aria-label="Remove"');

    const readonly = await mountBookmark(
      [bookmark("rich", { title: "Plate", fetchedAt: "2026-10-08T00:00:00.000Z" })],
      null,
      true,
    );
    const link = readonly.host.querySelector("[data-bookmark-card]");
    expect(link?.tagName).toBe("A");
    expect(link?.getAttribute("rel")).toBe("noopener noreferrer nofollow");
    expect(link?.getAttribute("target")).toBe("_blank");
    expect(readonly.host.querySelector("[aria-label='Open']")).toBeNull();
    await readonly.cleanup();

    const editable = await mountBookmark([
      bookmark("rich", { title: "Plate", fetchedAt: "2026-10-08T00:00:00.000Z" }),
    ]);
    const card = editable.host.querySelector("[data-bookmark-card]");
    expect(card?.tagName).toBe("DIV");
    const open = editable.host.querySelector("[aria-label='Open']");
    expect(open?.tagName).toBe("A");
    expect(open?.getAttribute("rel")).toBe("noopener noreferrer nofollow");
    await act(async () => {
      card?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
    });
    expect(editable.editor.selection?.anchor.path[0]).toBe(0);
    expect(blockIds(editable.editor)).toEqual(["rich"]);
    await editable.cleanup();
  });
});

describe("bookmark containers and keyboard", () => {
  test("backspace selects a bookmark and a second backspace deletes it, and enter inserts after it", () => {
    const editor = createEditor([
      paragraph("Hello", "a"),
      bookmark("clip"),
      paragraph("World", "b"),
    ]);
    editor.tf.select(caret([2, 0], 0));
    editor.tf.deleteBackward();
    expect(blockIds(editor)).toEqual(["a", "clip", "b"]);
    expect(editor.selection?.anchor.path[0]).toBe(1);
    editor.tf.deleteBackward();
    expect(typesOf(editor)).toEqual(["p", "p"]);
    expect(texts(editor)).toEqual(["Hello", "World"]);

    const entered = createEditor([
      paragraph("Hello", "a"),
      bookmark("clip"),
      paragraph("World", "b"),
    ]);
    const anchor = entered.api.start([1]);
    const focus = entered.api.end([1]);
    if (!anchor || !focus) {
      throw new Error("Missing bookmark.");
    }
    entered.tf.select({ anchor, focus });
    entered.tf.insertBreak();
    expect(typesOf(entered)).toEqual(["p", BOOKMARK_KEY, "p", "p"]);
    expect(blockIds(entered)[1]).toBe("clip");
    expect(entered.selection?.anchor.path[0]).toBe(2);
  });

  test("a bookmark stays inside a toggle, splits a quote and a callout, and lifts out of a table cell", () => {
    expect(allowedChildTypes("toggle")).toContain(BOOKMARK_KEY);
    const kept = createEditor([
      toggle("toggle-1", [paragraph("Label", "label"), bookmark("clip")]),
    ]);
    kept.tf.normalize({ force: true });
    expect(typesOf(kept)).toEqual(["toggle"]);
    expect(childTypes(kept.children[0])).toEqual(["p", BOOKMARK_KEY]);

    const split = createEditor([
      quote("quote-1", [
        paragraph("Before", "before"),
        bookmark("clip"),
        paragraph("After", "after"),
      ]),
      callout("callout-1", [
        paragraph("Note", "note"),
        bookmark("icon"),
        paragraph("Tail", "tail"),
      ]),
    ]);
    split.tf.normalize({ force: true });
    expect(typesOf(split)).toEqual([
      "blockquote",
      BOOKMARK_KEY,
      "blockquote",
      "callout",
      BOOKMARK_KEY,
      "callout",
    ]);
    expect(field(split.children[1], "id")).toBe("clip");

    const lifted = createEditor([
      tableNode("table-1", [
        row("row-1", [cell("td", "cell-1", [paragraph("Stay", "stay"), bookmark("clip")])]),
      ]),
      paragraph("After", "after"),
    ]);
    lifted.tf.normalize({ force: true });
    expect(typesOf(lifted)).toEqual(["table", BOOKMARK_KEY, "p"]);
    expect(field(lifted.children[1], "id")).toBe("clip");
    expect(field(lifted.children[1], "url")).toBe(PLATE_DOCS);
  });
});
