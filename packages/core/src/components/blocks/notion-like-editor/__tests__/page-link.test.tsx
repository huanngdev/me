import { describe, expect, test } from "bun:test";
import { KEYS, type SlateEditor, type TElement } from "platejs";
import { createPlateEditor } from "platejs/react";
import { renderToStaticMarkup } from "react-dom/server";

import { runEditorCommand } from "../lib/commands/editor-commands";
import { createEditorDocument, serializeEditorDocument } from "../lib/document/editor-document";
import {
  EDITOR_ELEMENT_RULES,
  allowedChildTypes,
  isVoidElementType,
} from "../lib/document/editor-document-schema";
import { parseEditorDocument, type ParseResult } from "../lib/document/editor-document-validate";
import { BOOKMARK_KEY } from "../lib/features/editor-bookmark-url";
import {
  blockMenuDecisions,
  deleteBlockAt,
  duplicateBlockAt,
  menuBlockView,
} from "../lib/features/editor-block-menu";
import { targetBlockAtPath } from "../lib/features/editor-block-handle";
import { blockToneAllowed } from "../lib/features/editor-block-tone";
import { blockIndentAllowed } from "../lib/features/editor-block-indent";
import {
  PAGE_LINK_KEY,
  PAGE_LINK_PASTE_DROPPED,
  PAGE_LINK_TITLE_MAX,
  cleanPageLinkTitle,
  isStoredPageId,
  pageLinkNode,
  sanitizePageEntity,
} from "../lib/features/editor-page-link";
import { insertPageLink } from "../lib/features/editor-page-link-command";
import { pasteRepairsOf } from "../lib/paste/editor-paste";
import { createEditorPlugins } from "../lib/plugins/editor-plugins";
import { NotionLikeEditorStatic } from "../notion-like-editor-static";
import { blockIds, expectOk, field, texts } from "./test-utils";

const PAGE_ID = "page-alpha";
const SAFE_URL = "https://example.com/";

function paragraph(text: string, id: string): TElement {
  return { type: "p", id, children: [{ text }] };
}

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

function bookmark(id: string, url: string, extra: Record<string, unknown> = {}): TElement {
  return { type: BOOKMARK_KEY, id, url, ...extra, children: [{ text: "" }] };
}

function withoutKey(node: TElement, key: string): TElement {
  const copy: TElement = { ...node };
  Reflect.deleteProperty(copy, key);
  return copy;
}

function documentOf(content: TElement[]): ParseResult {
  return parseEditorDocument(createEditorDocument("doc-page-link", content));
}

function messages(result: ParseResult): string {
  if (result.status !== "unsupported" && result.status !== "invalid") {
    return "";
  }

  return result.issues.map((issue) => issue.message).join("\n");
}

function plateEditor(value: TElement[]): SlateEditor {
  return createPlateEditor({ plugins: createEditorPlugins(), value });
}

function selectStart(editor: SlateEditor, path: number[]): void {
  const point = editor.api.start(path);
  if (!point) {
    throw new Error("Missing point.");
  }

  editor.tf.select({ anchor: point, focus: point });
}

function selectEnd(editor: SlateEditor, path: number[]): void {
  const point = editor.api.end(path);
  if (!point) {
    throw new Error("Missing point.");
  }

  editor.tf.select({ anchor: point, focus: point });
}

function encodeFragment(fragment: unknown): string {
  return window.btoa(encodeURIComponent(JSON.stringify(fragment)));
}

describe("page link schema", () => {
  test("page_link is a void that lives where bookmark lives and nowhere else", () => {
    expect(isVoidElementType(PAGE_LINK_KEY)).toBe(true);
    for (const rule of EDITOR_ELEMENT_RULES) {
      const childTypes = allowedChildTypes(rule.type);
      if (childTypes === undefined) {
        continue;
      }

      expect(childTypes.includes(PAGE_LINK_KEY)).toBe(childTypes.includes(BOOKMARK_KEY));
    }
    expect(allowedChildTypes(KEYS.toggle)).toContain(PAGE_LINK_KEY);
    expect(allowedChildTypes(KEYS.column)).toContain(PAGE_LINK_KEY);
    expect(allowedChildTypes(KEYS.blockquote)).not.toContain(PAGE_LINK_KEY);
    expect(allowedChildTypes(KEYS.callout)).not.toContain(PAGE_LINK_KEY);
    expect(allowedChildTypes(KEYS.td)).not.toContain(PAGE_LINK_KEY);
  });

  test("a page link is valid at the top level and inside a toggle", () => {
    expectOk(documentOf([pageLink("top")]));
    const toggle: TElement = {
      type: KEYS.toggle,
      id: "toggle-1",
      children: [paragraph("Head", "head-1"), pageLink("inside")],
    };
    expectOk(documentOf([toggle]));
  });

  test("a page link inside a quote is unsupported, as a bookmark is", () => {
    const quote: TElement = {
      type: KEYS.blockquote,
      id: "quote-1",
      children: [paragraph("Quoted", "quoted-1"), pageLink("inside")],
    };
    expect(documentOf([quote]).status).toBe("unsupported");
    const bookmarkQuote: TElement = {
      type: KEYS.blockquote,
      id: "quote-2",
      children: [paragraph("Quoted", "quoted-2"), bookmark("bm", SAFE_URL)],
    };
    expect(documentOf([bookmarkQuote]).status).toBe("unsupported");
  });

  test("an unknown attribute makes the document unsupported, as it does for a bookmark", () => {
    expect(messages(documentOf([pageLink("bad", { note: "extra" })]))).toContain(
      'attribute "note"',
    );
    expect(documentOf([bookmark("bad", SAFE_URL, { note: "extra" })]).status).toBe("unsupported");
  });

  test("a missing or invalid pageId makes the document unsupported, as an invalid bookmark url does", () => {
    const invalidBookmark = bookmark("bad", "javascript:alert(1)");
    expect(documentOf([invalidBookmark]).status).toBe("unsupported");

    const bad = [
      withoutKey(pageLink("missing"), "pageId"),
      pageLink("empty", { pageId: "" }),
      pageLink("long", { pageId: "x".repeat(129) }),
      pageLink("control", { pageId: "a\u0007b" }),
      pageLink("number", { pageId: 7 }),
    ];
    for (const node of bad) {
      const result = documentOf([node]);
      expect(result.status).toBe("unsupported");
      expect(messages(result)).toContain("pageId");
    }
  });

  test("a pageId of 128 characters is valid", () => {
    expectOk(documentOf([pageLink("edge", { pageId: "x".repeat(128) })]));
    expect(isStoredPageId("x".repeat(128))).toBe(true);
    expect(isStoredPageId("x".repeat(129))).toBe(false);
    expect(isStoredPageId("")).toBe(false);
    expect(isStoredPageId("a\nb")).toBe(false);
  });

  test("a non-string title is repaired to an empty string and reported", () => {
    const parsed = expectOk(documentOf([pageLink("pl", { title: 42 })]));
    expect(field(parsed.document.content[0], "title")).toBe("");
    expect(parsed.repairs).toHaveLength(1);
    expect(parsed.repairs[0]?.message).toContain("title");
  });

  test("an over-long title is cut to the limit and reported", () => {
    const parsed = expectOk(documentOf([pageLink("pl", { title: "a".repeat(250) })]));
    expect(field(parsed.document.content[0], "title")).toBe("a".repeat(PAGE_LINK_TITLE_MAX));
    expect(parsed.repairs).toHaveLength(1);
  });

  test("control characters are removed from a title and reported", () => {
    const parsed = expectOk(documentOf([pageLink("pl", { title: "Mem\u0007o\nPad" })]));
    expect(field(parsed.document.content[0], "title")).toBe("MemoPad");
    expect(parsed.repairs).toHaveLength(1);
  });

  test("a missing or unknown kind becomes link and is reported", () => {
    const missing = expectOk(documentOf([withoutKey(pageLink("pl"), "kind")]));
    expect(field(missing.document.content[0], "kind")).toBe("link");
    expect(missing.repairs).toHaveLength(1);

    const unknown = expectOk(documentOf([pageLink("pl", { kind: "folder" })]));
    expect(field(unknown.document.content[0], "kind")).toBe("link");
    expect(unknown.repairs).toHaveLength(1);
  });

  test("a child kind and a valid title are kept without a repair", () => {
    const parsed = expectOk(documentOf([pageLink("pl", { kind: "child" })]));
    expect(field(parsed.document.content[0], "kind")).toBe("child");
    expect(parsed.repairs).toEqual([]);
  });

  test("a valid page link round-trips unchanged, and a repaired one stays repaired", () => {
    const node = pageLink("rt", { title: "Plan", kind: "child" });
    const parsed = expectOk(documentOf([node]));
    expect(parsed.repairs).toEqual([]);
    expect(parsed.document.content).toEqual([node]);
    const again = expectOk(
      parseEditorDocument(JSON.parse(serializeEditorDocument(parsed.document))),
    );
    expect(again.document.content).toEqual([node]);
    expect(again.repairs).toEqual([]);

    const repaired = expectOk(documentOf([pageLink("rt2", { kind: "folder", title: 1 })]));
    const second = expectOk(
      parseEditorDocument(JSON.parse(serializeEditorDocument(repaired.document))),
    );
    expect(second.repairs).toEqual([]);
    expect(second.document.content).toEqual(repaired.document.content);
  });
});

describe("page link text and provider sanitizing", () => {
  test("cleanPageLinkTitle removes controls and never splits a surrogate pair", () => {
    expect(cleanPageLinkTitle("a\u0000b\u001fc\u007f")).toBe("abc");
    expect(cleanPageLinkTitle("x".repeat(300))).toHaveLength(PAGE_LINK_TITLE_MAX);
    const emoji = cleanPageLinkTitle("😀".repeat(150));
    expect(emoji).toHaveLength(PAGE_LINK_TITLE_MAX);
    expect(emoji).toBe("😀".repeat(100));
  });

  test("a provider entity has its title cleaned and a bad icon dropped", () => {
    expect(sanitizePageEntity({ pageId: PAGE_ID, title: "Q\u0007 Name", icon: "📄" })).toEqual({
      pageId: PAGE_ID,
      title: "Q Name",
      icon: "📄",
    });
    expect(sanitizePageEntity({ pageId: PAGE_ID, title: "Long", icon: "🇻🇳" }).icon).toBe("🇻🇳");

    const rejected = ["ab", "👨‍👩‍👧‍👦", "\u0007", "", "\n"];
    for (const icon of rejected) {
      expect(sanitizePageEntity({ pageId: PAGE_ID, title: "T", icon }).icon).toBeUndefined();
    }
    expect(sanitizePageEntity({ pageId: PAGE_ID, title: "T" }).icon).toBeUndefined();

    const long = sanitizePageEntity({ pageId: PAGE_ID, title: "x".repeat(300) });
    expect(long.title).toHaveLength(PAGE_LINK_TITLE_MAX);
  });

  test("pageLinkNode builds a valid node with cleaned title, default kind, and an optional id", () => {
    expect(pageLinkNode(PAGE_ID, "T\u0007", undefined, "id-1")).toEqual({
      type: PAGE_LINK_KEY,
      id: "id-1",
      pageId: PAGE_ID,
      title: "T",
      kind: "link",
      children: [{ text: "" }],
    });
    expect(pageLinkNode(PAGE_ID, "T", "child").kind).toBe("child");
    expect(pageLinkNode(PAGE_ID, "T", "child").id).toBeUndefined();
  });
});

describe("insertPageLink", () => {
  test("an empty paragraph is replaced, the new block is selected, and one undo restores it", () => {
    const editor = plateEditor([paragraph("", "p-1")]);
    selectStart(editor, [0]);
    const undos = editor.history.undos.length;

    const ran = runEditorCommand(editor, insertPageLink, { pageId: PAGE_ID, title: "Notes" });

    expect(ran).toBe(true);
    expect(editor.children.map((block) => block.type)).toEqual([PAGE_LINK_KEY]);
    expect(field(editor.children[0], "pageId")).toBe(PAGE_ID);
    expect(field(editor.children[0], "title")).toBe("Notes");
    expect(field(editor.children[0], "kind")).toBe("link");
    expect(editor.selection?.anchor.path[0]).toBe(0);
    expect(editor.history.undos.length).toBe(undos + 1);

    editor.tf.undo();
    expect(editor.children.map((block) => block.type)).toEqual(["p"]);
  });

  test("a non-empty paragraph keeps its text and the link goes below it", () => {
    const editor = plateEditor([paragraph("Hello", "p-1")]);
    selectEnd(editor, [0]);

    runEditorCommand(editor, insertPageLink, {
      pageId: PAGE_ID,
      title: "Plan",
      kind: "child",
    });

    expect(editor.children.map((block) => block.type)).toEqual(["p", PAGE_LINK_KEY]);
    expect(texts(editor)[0]).toBe("Hello");
    expect(field(editor.children[1], "kind")).toBe("child");
    expect(editor.selection?.anchor.path[0]).toBe(1);
  });

  test("an invalid pageId is refused with no change and no history entry", () => {
    const editor = plateEditor([paragraph("", "p-1")]);
    selectStart(editor, [0]);
    const before = editor.children;
    const undos = editor.history.undos.length;

    const ran = runEditorCommand(editor, insertPageLink, { pageId: "", title: "Nope" });

    expect(ran).toBe(false);
    expect(editor.children).toBe(before);
    expect(editor.history.undos.length).toBe(undos);
  });

  test("a read-only editor refuses the insert", () => {
    const editor = plateEditor([paragraph("", "p-1")]);
    selectStart(editor, [0]);
    const before = editor.children;

    const ran = runEditorCommand(
      editor,
      insertPageLink,
      { pageId: PAGE_ID, title: "Nope" },
      { readOnly: true },
    );

    expect(ran).toBe(false);
    expect(editor.children).toBe(before);
  });
});

describe("page link paste and copy", () => {
  test("a copied fragment keeps the page link and gives it a fresh id when the id already exists", () => {
    const editor = plateEditor([paragraph("", "p-1"), pageLink("source-id")]);
    selectStart(editor, [0]);
    const data = new DataTransfer();
    data.setData(
      "application/x-slate-fragment",
      encodeFragment([pageLink("source-id", { kind: "child" })]),
    );

    editor.tf.insertData(data);

    const links = editor.children.filter((block) => block.type === PAGE_LINK_KEY);
    expect(links).toHaveLength(2);
    const pasted = links[0];
    expect(field(pasted, "pageId")).toBe(PAGE_ID);
    expect(field(pasted, "title")).toBe("Stored title");
    expect(field(pasted, "kind")).toBe("child");
    const ids = links.map((block) => field(block, "id"));
    expect(new Set(ids).size).toBe(2);
    expect(ids.every((id) => typeof id === "string" && id.length > 0)).toBe(true);
  });

  test("a copied page link with an invalid pageId is dropped and reported", () => {
    const editor = plateEditor([paragraph("", "p-1")]);
    selectStart(editor, [0]);
    const data = new DataTransfer();
    data.setData("application/x-slate-fragment", encodeFragment([pageLink("bad", { pageId: "" })]));

    editor.tf.insertData(data);

    expect(editor.children.some((block) => block.type === PAGE_LINK_KEY)).toBe(false);
    const messagesSeen = pasteRepairsOf(editor).map((repair) => repair.message);
    expect(messagesSeen).toContain(PAGE_LINK_PASTE_DROPPED);
  });

  test("external html never creates a page link", () => {
    const editor = plateEditor([paragraph("", "p-1")]);
    selectStart(editor, [0]);
    const data = new DataTransfer();
    data.setData(
      "text/html",
      `<div data-page-link="" data-page-id="${PAGE_ID}" data-page-kind="child">Stored</div>`,
    );

    editor.tf.insertData(data);

    expect(editor.children.some((block) => block.type === PAGE_LINK_KEY)).toBe(false);
  });
});

function blockControls(editor: SlateEditor, path: number[]) {
  const view = menuBlockView(editor, path);
  return {
    menuOffered: view !== null && blockMenuDecisions(view) !== null,
    handleTarget: targetBlockAtPath(editor, path) !== null,
    tone: blockToneAllowed(editor, path),
    indent: blockIndentAllowed(editor, path),
  };
}

describe("page link block menu, handle, tone, and indent match bookmark", () => {
  test("the same block controls apply to a page link as to a bookmark", () => {
    const editor = plateEditor([bookmark("bm-1", SAFE_URL), pageLink("pl-1")]);

    const asBookmark = blockControls(editor, [0]);
    const asPageLink = blockControls(editor, [1]);

    expect(asPageLink).toEqual(asBookmark);
    expect(asPageLink.menuOffered).toBe(false);
    expect(asPageLink.handleTarget).toBe(true);
    expect(asPageLink.tone).toBe(false);
  });

  test("duplicate and delete work on a page link as on a bookmark", () => {
    const editor = plateEditor([pageLink("pl-1")]);
    expect(duplicateBlockAt(editor, [0])).toBe(true);
    expect(editor.children.map((block) => block.type)).toEqual([PAGE_LINK_KEY, PAGE_LINK_KEY]);
    expect(blockIds(editor)[0]).not.toBe(blockIds(editor)[1]);

    expect(deleteBlockAt(editor, [0])).toBe(true);
    expect(editor.children.map((block) => block.type)).toEqual([PAGE_LINK_KEY]);
  });
});

describe("page link static output", () => {
  test("static html has the attributes and the stored fallback title, and is not a link", () => {
    const html = renderToStaticMarkup(
      <NotionLikeEditorStatic value={[pageLink("pl", { title: "Stored title", kind: "child" })]} />,
    );

    expect(html).toContain('data-page-link=""');
    expect(html).toContain(`data-page-id="${PAGE_ID}"`);
    expect(html).toContain('data-page-kind="child"');
    expect(html).toContain("Stored title");
    expect(html).not.toContain('role="link"');
    expect(html).not.toContain("href=");
  });

  test("static html shows Untitled for an empty stored title", () => {
    const html = renderToStaticMarkup(
      <NotionLikeEditorStatic value={[pageLink("pl", { title: "" })]} />,
    );
    expect(html).toContain("Untitled");
  });
});
