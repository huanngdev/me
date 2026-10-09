import { describe, expect, test } from "bun:test";
import { BaseLinkPlugin, LinkRules, createLinkNode, upsertLink, validateUrl } from "@platejs/link";
import { KEYS, createSlateEditor, type SlateEditor, type TElement } from "platejs";
import { createPlateEditor } from "platejs/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";

import { runEditorCommand } from "./editor-commands";
import { createEditorDocument, serializeEditorDocument } from "./editor-document";
import { parseEditorDocument } from "./editor-document-validate";
import {
  commitLinkPopover,
  closeLinkPopover,
  editInlineLink,
  insertInlineLink,
  linkUiPlugin,
  onLinkKeyDown,
  openInlineLink,
  openLinkPopover,
  removeInlineLink,
  setLinkComposing,
} from "./editor-link";
import {
  LINK_URL_MAX,
  UNSAFE_LINK_PASTE,
  normalizeLinkInput,
  sanitizeLinkUrl,
} from "./editor-link-url";
import { createEditorPlugins } from "./editor-plugins";
import { pasteRepairsOf } from "./editor-paste";
import {
  applyPasteUrlAction,
  clearPasteUrlOffer,
  pasteUrlActions,
  pasteUrlPlugin,
} from "./editor-paste-url";
import { EditorSurface } from "./editor-surface";
import type { EditorValue } from "./editor-value";
import {
  caret,
  createEditor,
  expectOk,
  expectUnsupported,
  field,
  isRecord,
  textRange,
} from "./test-utils";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

const HTTPS = "https://example.com";
const MAIL = "mailto:a@b.c";
const TEL = "tel:+84123456789";

function paragraph(text: string, id = "p"): TElement {
  return { type: "p", id, children: [{ text }] };
}

function codeBlock(text: string): TElement {
  return {
    type: "code_block",
    id: "code-1",
    children: [{ type: "code_line", id: "line-1", children: [{ text }] }],
  };
}

function linkNode(
  url: string,
  text: string,
  id = "link-1",
  marks?: Record<string, unknown>,
): TElement {
  return {
    type: "a",
    id,
    url,
    children: [{ text, ...marks }],
  };
}

function blockString(editor: SlateEditor, index = 0): string {
  const block = editor.children[index];
  if (block === undefined) {
    throw new Error("Missing block.");
  }

  return editor.api.string(block);
}

function nestedText(node: unknown): string {
  if (typeof node === "string") {
    return node;
  }

  if (Array.isArray(node)) {
    return node.map((item) => nestedText(item)).join("");
  }

  if (!isRecord(node)) {
    return "";
  }

  const text = typeof node.text === "string" ? node.text : "";
  const children = Array.isArray(node.children) ? nestedText(node.children) : "";
  return text + children;
}

function childAt(node: unknown, index: number): Record<string, unknown> | undefined {
  if (!isRecord(node) || !Array.isArray(node.children)) {
    return undefined;
  }

  const child = node.children[index];
  return isRecord(child) ? child : undefined;
}

function linkNodes(value: unknown): Record<string, unknown>[] {
  const found: Record<string, unknown>[] = [];
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const child of node) {
        visit(child);
      }
      return;
    }

    if (!isRecord(node)) {
      return;
    }

    if (node.type === KEYS.link) {
      found.push(node);
    }

    if (Array.isArray(node.children)) {
      visit(node.children);
    }
  };
  visit(value);
  return found;
}

function documentOf(content: TElement[]) {
  return parseEditorDocument(createEditorDocument("doc-link", content));
}

function linkAnchor(root: ParentNode): HTMLElement {
  const node = root.querySelector("a[data-link-url]");
  if (!(node instanceof HTMLElement) || node.tagName !== "A") {
    throw new Error("Missing link.");
  }

  return node;
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
  data.setData("text/plain", "");
  editor.tf.insertData(data);
}

function pressLink(editor: SlateEditor, meta = true): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    key: "k",
    metaKey: meta,
    ctrlKey: !meta,
    bubbles: true,
    cancelable: true,
  });
  onLinkKeyDown(editor, event);
  return event;
}

function isReactContainer(value: object): value is Parameters<typeof createRoot>[0] {
  return "nodeType" in value && value.nodeType === 1;
}

async function mountLink(value: EditorValue, readOnly = false) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const editor = createPlateEditor({ plugins: createEditorPlugins(), value });
  if (!isReactContainer(host)) {
    throw new Error("Missing mount node.");
  }

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
    cleanup: async () => {
      await act(async () => {
        root?.unmount();
      });
      host.remove();
    },
  };
}

function renderLinks(value: EditorValue, readOnly = false): string {
  const editor = createPlateEditor({ plugins: createEditorPlugins(), value });
  return renderToStaticMarkup(
    <EditorSurface editor={editor} readOnly={readOnly} placeholder="" className="editor" />,
  );
}

function maxUrl(extra = 0): string {
  const prefix = "https://example.com/";
  return prefix + "a".repeat(LINK_URL_MAX - prefix.length + extra);
}

describe("native link plugin", () => {
  // @platejs/link@53.3.5
  // dist/upsertLink-DyzF00MY.js createLinkNode 4-11 stores target even when unset.
  // validateUrl 55-68 allows / and # unless they contain whitespace, then isUrl/sanitizeUrl.
  // BaseLinkPlugin 102-143: key "a", allowedSchemes http/https/mailto/tel,
  // dangerouslySkipSanitization false, keepSelectedTextOnPaste true, removeEmpty true.
  // dist/index.js LinkRules.autolink is a factory. The product plugin does not register it:
  // its paste/space/break rules call upsertLink, which writes target, and they keep trailing punctuation.
  test("BaseLinkPlugin keeps the published defaults and upsertLink stores target", () => {
    const editor = createSlateEditor({
      plugins: [BaseLinkPlugin],
      value: [paragraph("Hello")],
    });
    const options = editor.getOptions(BaseLinkPlugin);

    expect(BaseLinkPlugin.key).toBe("a");
    expect(BaseLinkPlugin.key).toBe(KEYS.link);
    expect(options.allowedSchemes).toEqual(["http", "https", "mailto", "tel"]);
    expect(options.dangerouslySkipSanitization).toBe(false);
    expect(options.keepSelectedTextOnPaste).toBe(true);
    expect(options.defaultLinkAttributes).toEqual({});
    expect(validateUrl(editor, HTTPS)).toBe(true);
    expect(validateUrl(editor, "/blog")).toBe(true);
    expect(validateUrl(editor, "#intro")).toBe(true);
    expect(validateUrl(editor, "javascript:alert(1)")).toBe(false);
    expect(validateUrl(editor, "//evil.com")).toBe(false);
    expect(typeof LinkRules.autolink).toBe("function");

    const created = createLinkNode(editor, { url: HTTPS, text: "Hello" });
    expect(created.type).toBe("a");
    expect("target" in created).toBe(true);

    editor.tf.select(textRange([0, 0], 0, 5));
    upsertLink(editor, { url: HTTPS, target: "_blank" });
    const stored = linkNodes(editor.children)[0];
    expect(stored?.url).toBe(HTTPS);
    expect(stored?.target).toBe("_blank");
  });
});

describe("link url policy", () => {
  test("allows http, https, mailto, tel, root-relative, and in-document anchors", () => {
    const allowed = [
      HTTPS,
      "http://example.com",
      "HTTP://example.com",
      MAIL,
      TEL,
      "/blog",
      "#intro",
    ];
    for (const url of allowed) {
      expect(sanitizeLinkUrl(url)).toBe(url);
    }

    expect(sanitizeLinkUrl(maxUrl())).toBe(maxUrl());
  });

  test("rejects unsafe schemes, protocol-relative urls, control characters, and overlong urls", () => {
    const rejected = [
      "javascript:alert(1)",
      "JaVaScRiPt:alert(1)",
      "java\tscript:alert(1)",
      "java\nscript:alert(1)",
      "//evil.com",
      "data:text/html,hi",
      "file:///tmp/x",
      "vbscript:msg",
      "blob:https://example.com/id",
      " https://example.com",
      "https://example.com/a b",
      "example.com",
      "",
      maxUrl(1),
    ];
    for (const url of rejected) {
      expect(sanitizeLinkUrl(url)).toBeUndefined();
    }
  });

  test("a bare domain is normalized only by the input helper", () => {
    expect(normalizeLinkInput("example.com")).toBe("https://example.com");
    expect(normalizeLinkInput("  example.com/docs  ")).toBe("https://example.com/docs");
    expect(normalizeLinkInput(`  ${HTTPS}  `)).toBe(HTTPS);
    expect(normalizeLinkInput("javascript:alert(1)")).toBe("javascript:alert(1)");
    expect(sanitizeLinkUrl("example.com")).toBeUndefined();
  });
});

describe("link schema", () => {
  test("a link with marks round-trips and drops no characters", () => {
    const content = [
      {
        type: "p",
        id: "p",
        children: [
          { text: "Hello " },
          {
            type: "a",
            id: "link-1",
            url: HTTPS,
            children: [{ text: "world", bold: true, italic: true }],
          },
        ],
      },
    ] satisfies TElement[];
    const document = createEditorDocument("doc-link", content);
    const parsed = expectOk(parseEditorDocument(JSON.parse(serializeEditorDocument(document))));

    expect(parsed.repairs).toEqual([]);
    expect(parsed.document.content).toEqual(content);
  });

  test("target, rel, and unknown attrs are rejected and the raw document is kept", () => {
    for (const extra of [{ target: "_blank" }, { rel: "noopener" }, { title: "Docs" }]) {
      const result = documentOf([
        {
          type: "p",
          id: "p",
          children: [{ ...linkNode(HTTPS, "Docs"), ...extra }],
        },
      ]);
      expectUnsupported(result);
    }
  });

  test("an unsafe stored url is a repair and renders as text", () => {
    const long = maxUrl(1);
    const parsed = expectOk(
      documentOf([
        {
          type: "p",
          id: "p",
          children: [
            { text: "See " },
            linkNode("javascript:alert(1)", "click", "bad", { bold: true }),
          ],
        },
      ]),
    );
    expect(parsed.repairs.map((repair) => repair.message).join(" ")).toContain("unsafe link URL");
    expect(JSON.stringify(parsed.document.content)).not.toContain("javascript:");
    expect(nestedText(parsed.document.content)).toContain("click");

    const overlong = expectOk(
      documentOf([
        {
          type: "p",
          id: "p",
          children: [linkNode(long, "long", "bad-long")],
        },
      ]),
    );
    const message = overlong.repairs.map((repair) => repair.message).join(" ");
    expect(message).toContain("unsafe link URL");
    expect(message).not.toContain(long);

    const html = renderLinks(parsed.document.content);
    expect(html).toContain("click");
    expect(html).not.toContain("<a");
    expect(html).not.toContain("javascript:");
  });

  test("an empty link is removed and the neighbouring text stays", () => {
    const editor = createEditor([
      {
        type: "p",
        id: "p",
        children: [{ text: "Keep" }, linkNode(HTTPS, "", "empty"), { text: " me" }],
      },
    ]);
    // createSlateEditor does not force-normalize on init. The rule runs when normalize does.
    editor.tf.normalize({ force: true });

    expect(blockString(editor)).toBe("Keep me");
    expect(linkNodes(editor.children)).toEqual([]);
  });
});

describe("link editing", () => {
  test("cmd-k links exactly the selected characters across marks, and one undo removes it", () => {
    const editor = createEditor([
      {
        type: "p",
        id: "p",
        children: [
          { text: "Go " },
          { text: "bo", bold: true },
          { text: "ld", italic: true },
          { text: " now" },
        ],
      },
    ]);
    editor.tf.select({
      anchor: { path: [0, 1], offset: 0 },
      focus: { path: [0, 2], offset: 2 },
    });
    const undos = editor.history.undos.length;
    const event = pressLink(editor);
    expect(event.defaultPrevented).toBe(true);
    expect(editor.history.undos.length).toBe(undos);
    expect(editor.getOption(linkUiPlugin, "mode")).toBe("insert");

    expect(commitLinkPopover(editor, HTTPS, "ignored")).toBe(true);
    const link = linkNodes(editor.children)[0];
    expect(link?.url).toBe(HTTPS);
    expect(nestedText(link)).toBe("bold");
    expect(childAt(link, 0)).toMatchObject({ text: "bo", bold: true });
    expect(blockString(editor)).toBe("Go bold now");
    expect("target" in (link ?? {})).toBe(false);
    expect(editor.history.undos.length).toBe(undos + 1);

    editor.tf.undo();
    expect(linkNodes(editor.children)).toEqual([]);
    expect(blockString(editor)).toBe("Go bold now");
    expect(field(editor.children[0]?.children[1], "bold")).toBe(true);
    expect(field(editor.children[0]?.children[2], "italic")).toBe(true);
  });

  test("a collapsed caret inserts a link whose label defaults to the url", () => {
    const editor = createEditor([paragraph("")]);
    editor.tf.select(caret([0, 0], 0));
    openLinkPopover(editor);
    expect(editor.getOption(linkUiPlugin, "mode")).toBe("label");
    const undos = editor.history.undos.length;

    expect(commitLinkPopover(editor, "example.com", "")).toBe(true);
    const link = linkNodes(editor.children)[0];
    expect(link?.url).toBe("https://example.com");
    expect(nestedText(link)).toBe("https://example.com");
    expect(editor.history.undos.length).toBe(undos + 1);

    editor.tf.undo();
    expect(linkNodes(editor.children)).toEqual([]);
    expect(blockString(editor)).toBe("");
  });

  test("edit changes the url and label, unlink keeps text and marks, and each is one undo", () => {
    const editor = createEditor([
      {
        type: "p",
        id: "p",
        children: [
          { text: "See " },
          linkNode(HTTPS, "docs", "link-1", { bold: true }),
          { text: " now" },
        ],
      },
    ]);
    editor.tf.select(caret([0, 1, 0], 1));
    openLinkPopover(editor);
    expect(editor.getOption(linkUiPlugin, "mode")).toBe("edit");
    const undos = editor.history.undos.length;

    expect(commitLinkPopover(editor, MAIL, "mail")).toBe(true);
    expect(linkNodes(editor.children)[0]?.url).toBe(MAIL);
    expect(nestedText(linkNodes(editor.children)[0])).toBe("mail");
    expect(childAt(linkNodes(editor.children)[0], 0)).toMatchObject({ text: "mail", bold: true });
    expect(editor.history.undos.length).toBe(undos + 1);

    editor.tf.select(caret([0, 1, 0], 1));
    expect(runEditorCommand(editor, removeInlineLink, undefined)).toBe(true);
    expect(linkNodes(editor.children)).toEqual([]);
    expect(blockString(editor)).toBe("See mail now");
    expect(field(editor.children[0]?.children[1], "bold")).toBe(true);
    expect(editor.history.undos.length).toBe(undos + 2);

    editor.tf.undo();
    expect(linkNodes(editor.children)[0]?.url).toBe(MAIL);
    expect(nestedText(linkNodes(editor.children)[0])).toBe("mail");
  });

  test("an invalid url shows an error and writes nothing, and escape closes without writing", () => {
    const editor = createEditor([paragraph("Hello")]);
    editor.tf.select(textRange([0, 0], 0, 5));
    openLinkPopover(editor);
    const before = JSON.parse(JSON.stringify(editor.children));
    const undos = editor.history.undos.length;

    expect(commitLinkPopover(editor, "javascript:alert(1)", "x")).toBe(false);
    expect(editor.getOption(linkUiPlugin, "error")).toBe("Enter a valid URL.");
    expect(editor.children).toEqual(before);
    expect(editor.history.undos.length).toBe(undos);

    closeLinkPopover(editor);
    expect(editor.getOption(linkUiPlugin, "mode")).toBe("closed");
    expect(editor.children).toEqual(before);
  });

  test("read-only editing commands no-op and cmd-k does not steal the key", () => {
    const editor = createEditor([{ type: "p", id: "p", children: [linkNode(HTTPS, "docs")] }]);
    editor.dom.readOnly = true;
    editor.tf.select(caret([0, 1, 0], 1));
    const before = JSON.parse(JSON.stringify(editor.children));

    expect(insertInlineLink.id).toBe("inline.link.insert");
    expect(insertInlineLink.label).toBe("Link");
    expect(insertInlineLink.group).toBe("insert");
    expect(editInlineLink.id).toBe("inline.link.edit");
    expect(removeInlineLink.id).toBe("inline.link.remove");
    expect(openInlineLink.id).toBe("inline.link.open");
    expect(insertInlineLink.isEnabled?.(editor)).toBe(false);
    expect(editInlineLink.isEnabled?.(editor)).toBe(false);
    expect(removeInlineLink.isEnabled?.(editor)).toBe(false);
    expect(runEditorCommand(editor, removeInlineLink, undefined, { readOnly: true })).toBe(false);
    expect(editor.children).toEqual(before);

    const event = pressLink(editor);
    expect(event.defaultPrevented).toBe(false);
    expect(editor.getOption(linkUiPlugin, "mode")).toBe("closed");
  });
});

describe("autolink", () => {
  test("space and enter link a url and leave trailing punctuation outside", () => {
    const spaced = createEditor([paragraph("")]);
    spaced.tf.select(caret([0, 0], 0));
    spaced.tf.insertText("see https://example.com.");
    const typed = spaced.history.undos.length;
    spaced.tf.insertText(" ");

    expect(linkNodes(spaced.children).map((node) => node.url)).toEqual([HTTPS]);
    expect(blockString(spaced)).toBe("see https://example.com. ");
    expect(nestedText(linkNodes(spaced.children)[0])).toBe(HTTPS);
    spaced.tf.undo();
    expect(linkNodes(spaced.children)).toEqual([]);
    expect(blockString(spaced)).toBe("see https://example.com.");
    expect(spaced.history.undos.length).toBe(typed);

    const entered = createEditor([paragraph("")]);
    entered.tf.select(caret([0, 0], 0));
    entered.tf.insertText(HTTPS);
    entered.tf.insertBreak();
    expect(entered.children).toHaveLength(2);
    expect(linkNodes(entered.children).map((node) => node.url)).toEqual([HTTPS]);
    expect(blockString(entered, 0)).toBe(HTTPS);
    entered.tf.undo();
    expect(entered.children).toHaveLength(1);
    expect(linkNodes(entered.children)).toEqual([]);
    expect(blockString(entered)).toBe(HTTPS);
  });

  test("parentheses stay outside the url, and a mid-word or code-block token does not link", () => {
    const wrapped = createEditor([paragraph("")]);
    wrapped.tf.select(caret([0, 0], 0));
    wrapped.tf.insertText("(https://example.com)");
    wrapped.tf.insertText(" ");
    expect(linkNodes(wrapped.children).map((node) => node.url)).toEqual([HTTPS]);
    expect(blockString(wrapped)).toBe("(https://example.com) ");
    expect(nestedText(linkNodes(wrapped.children)[0])).toBe(HTTPS);

    const mid = createEditor([paragraph("")]);
    mid.tf.select(caret([0, 0], 0));
    mid.tf.insertText("foohttps://example.com");
    mid.tf.insertText(" ");
    expect(linkNodes(mid.children)).toEqual([]);
    expect(blockString(mid)).toBe("foohttps://example.com ");

    const code = createEditor([codeBlock(HTTPS)]);
    code.tf.select(caret([0, 0, 0], HTTPS.length));
    code.tf.insertText(" ");
    expect(linkNodes(code.children)).toEqual([]);
    expect(nestedText(code.children)).toBe(`${HTTPS} `);
  });

  test("composition does not autolink", () => {
    const editor = createEditor([paragraph("")]);
    editor.tf.select(caret([0, 0], 0));
    editor.tf.insertText(HTTPS);
    setLinkComposing(editor, true);
    editor.tf.insertText(" ");
    expect(linkNodes(editor.children)).toEqual([]);
    expect(blockString(editor)).toBe(`${HTTPS} `);
    setLinkComposing(editor, false);
  });
});

describe("link paste", () => {
  test("a url pasted over a selection links that selection and does not open the menu", () => {
    const editor = createEditor([
      {
        type: "p",
        id: "p",
        children: [{ text: "Hello " }, { text: "bold", bold: true }],
      },
    ]);
    editor.tf.select({
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [0, 1], offset: 4 },
    });
    pasteText(editor, HTTPS);

    expect(blockString(editor)).toBe("Hello bold");
    expect(linkNodes(editor.children).map((node) => node.url)).toEqual([HTTPS]);
    expect(nestedText(linkNodes(editor.children)[0])).toBe("Hello bold");
    expect(editor.getOption(pasteUrlPlugin, "offer")).toBeUndefined();
  });

  test("a collapsed url paste inserts a link and still offers bookmark and embed", () => {
    const editor = createEditor([paragraph("", "empty")]);
    editor.tf.select(caret([0, 0], 0));
    pasteText(editor, `  ${HTTPS}/docs  `);
    expect(linkNodes(editor.children).map((node) => node.url)).toEqual([`${HTTPS}/docs`]);
    expect(nestedText(linkNodes(editor.children)[0])).toBe(`${HTTPS}/docs`);
    expect(blockString(editor)).toBe(`${HTTPS}/docs`);
    expect(editor.getOption(pasteUrlPlugin, "offer")?.url).toBe(`${HTTPS}/docs`);
    expect(pasteUrlActions.map((action) => action.label)).toEqual(["Bookmark", "Embed video"]);
    expect(
      pasteUrlActions
        .filter((action) => action.match(`${HTTPS}/docs`))
        .map((action) => action.label),
    ).toEqual(["Bookmark"]);

    clearPasteUrlOffer(editor);
    expect(linkNodes(editor.children)).toHaveLength(1);

    const video = "https://www.youtube.com/watch?v=jNQXAC9IVRw";
    const offered = createEditor([paragraph("See ", "note")]);
    offered.tf.select(caret([0, 0], 4));
    pasteText(offered, video);
    expect(offered.getOption(pasteUrlPlugin, "offer")?.url).toBe(video);
    expect(
      pasteUrlActions.filter((action) => action.match(video)).map((action) => action.label),
    ).toEqual(["Bookmark", "Embed video"]);
    runEditorCommand(offered, applyPasteUrlAction, "bookmark");
    expect(offered.children.map((block) => block.type)).toEqual(["p", "bookmark"]);
    expect(blockString(offered)).toBe("See ");
    offered.tf.undo();
    expect(linkNodes(offered.children).map((node) => node.url)).toEqual([video]);
    expect(blockString(offered)).toBe(`See ${video}`);
  });

  test("safe html anchors become links and unsafe anchors stay text with a repair", () => {
    const safe = createEditor([paragraph("", "empty")]);
    safe.tf.select(caret([0, 0], 0));
    pasteHtml(safe, `<p>See <a href="${HTTPS}"><strong>Docs</strong></a></p>`);
    const link = linkNodes(safe.children)[0];
    expect(link?.url).toBe(HTTPS);
    expect(nestedText(link)).toBe("Docs");
    expect(childAt(link, 0)).toMatchObject({ text: "Docs", bold: true });
    expect("target" in (link ?? {})).toBe(false);
    expect(pasteRepairsOf(safe)).toEqual([]);

    const unsafe = createEditor([paragraph("Stay", "stay")]);
    unsafe.tf.select(caret([0, 0], 0));
    pasteHtml(unsafe, '<p><a href="javascript:alert(1)">Docs</a></p>');
    expect(linkNodes(unsafe.children)).toEqual([]);
    expect(nestedText(unsafe.children)).toContain("Docs");
    expect(pasteRepairsOf(unsafe).map((repair) => repair.message)).toContain(UNSAFE_LINK_PASTE);

    const code = createEditor([codeBlock("")]);
    code.tf.select(caret([0, 0, 0], 0));
    pasteText(code, HTTPS);
    expect(linkNodes(code.children)).toEqual([]);
    expect(nestedText(code.children)).toContain(HTTPS);
    pasteHtml(code, `<p><a href="${HTTPS}">Docs</a></p>`);
    expect(linkNodes(code.children)).toEqual([]);
    expect(nestedText(code.children)).toContain("Docs");
  });

  test("a bare domain paste stays text and a mailto paste is a link without the menu", () => {
    // createSlateEditor leaves insertData unimplemented. The page editor inserts the text.
    const bare = createPlateEditor({
      plugins: createEditorPlugins(),
      value: [paragraph("", "empty")],
    });
    bare.tf.select(caret([0, 0], 0));
    pasteText(bare, "example.com");
    expect(linkNodes(bare.children)).toEqual([]);
    expect(blockString(bare)).toBe("example.com");

    const mail = createEditor([paragraph("", "empty")]);
    mail.tf.select(caret([0, 0], 0));
    pasteText(mail, MAIL);
    expect(linkNodes(mail.children).map((node) => node.url)).toEqual([MAIL]);
    expect(mail.getOption(pasteUrlPlugin, "offer")).toBeUndefined();
  });
});

describe("link render and clicks", () => {
  test("external links set target and rel, and the other schemes omit both", () => {
    const html = renderLinks([
      {
        type: "p",
        id: "p",
        children: [
          linkNode(HTTPS, "site", "site"),
          { text: " " },
          linkNode("http://example.com", "http", "http"),
          { text: " " },
          linkNode(MAIL, "mail", "mail"),
          { text: " " },
          linkNode(TEL, "tel", "tel"),
          { text: " " },
          linkNode("/blog", "blog", "blog"),
          { text: " " },
          linkNode("#intro", "intro", "intro"),
        ],
      },
    ]);

    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer nofollow"');
    expect(html).toContain("link-underline");
    expect(html).toContain('href="mailto:a@b.c"');
    expect(html).toContain('href="tel:+84123456789"');
    expect(html).toContain('href="/blog"');
    expect(html).toContain('href="#intro"');
    const mailAnchor = html.slice(
      html.indexOf('href="mailto:a@b.c"') - 80,
      html.indexOf('href="mailto:a@b.c"') + 40,
    );
    expect(mailAnchor).not.toContain("target");
    expect(mailAnchor).not.toContain("rel=");
    expect(html).not.toContain("data-link-toolbar");
  });

  test("an editable click does not navigate, mod-click and Open do, and read-only is a normal link", async () => {
    const opened: unknown[][] = [];
    const original = Reflect.get(window, "open");
    Reflect.set(window, "open", (...args: unknown[]) => {
      opened.push(args);
      return null;
    });

    const mounted = await mountLink([
      { type: "p", id: "p", children: [linkNode(HTTPS, "site", "site")] },
    ]);
    mounted.editor.tf.select(caret([0, 0, 0], 1));
    await act(async () => {});
    const anchor = linkAnchor(mounted.host);

    const plain = new MouseEvent("click", { bubbles: true, cancelable: true });
    anchor.dispatchEvent(plain);
    expect(plain.defaultPrevented).toBe(true);
    expect(opened).toEqual([]);

    const modified = new MouseEvent("click", { bubbles: true, cancelable: true, metaKey: true });
    anchor.dispatchEvent(modified);
    expect(opened).toEqual([[HTTPS, "_blank", "noopener,noreferrer"]]);

    const toolbar = document.querySelector("[data-link-toolbar]");
    const urlLabel = toolbar?.querySelector("[data-link-toolbar-url]");
    expect(toolbar?.textContent).toContain(HTTPS);
    if (!(urlLabel instanceof HTMLElement)) {
      throw new Error("Missing toolbar URL.");
    }
    expect(urlLabel.style.overflowWrap).toBe("anywhere");
    const open = Array.from(document.querySelectorAll("[data-link-toolbar] button")).find(
      (button) => button.textContent === "Open",
    );
    if (!(open instanceof HTMLButtonElement)) {
      throw new Error("Missing Open.");
    }
    await act(async () => {
      open.click();
    });
    expect(opened[1]).toEqual([HTTPS, "_blank", "noopener,noreferrer"]);
    await mounted.cleanup();

    const readOnly = await mountLink(
      [{ type: "p", id: "p", children: [linkNode(MAIL, "mail", "mail")] }],
      true,
    );
    const mail = linkAnchor(readOnly.host);
    expect(mail.getAttribute("target")).toBeNull();
    expect(mail.getAttribute("rel")).toBeNull();
    expect(document.querySelector("[data-link-toolbar]")).toBeNull();
    const readOnlyClick = new MouseEvent("click", { bubbles: true, cancelable: true });
    mail.dispatchEvent(readOnlyClick);
    expect(readOnlyClick.defaultPrevented).toBe(false);
    await readOnly.cleanup();
    Reflect.set(window, "open", original);
  });

  test("escape and an invalid popover url write nothing", async () => {
    const mounted = await mountLink([paragraph("Hello", "p")]);
    mounted.editor.tf.select(textRange([0, 0], 0, 5));
    const before = JSON.parse(JSON.stringify(mounted.editor.children));
    await act(async () => {
      openLinkPopover(mounted.editor);
    });
    expect(document.querySelector("[data-link-popover]")?.getAttribute("data-link-mode")).toBe(
      "insert",
    );

    await act(async () => {
      commitLinkPopover(mounted.editor, "javascript:alert(1)", "");
    });
    expect(document.querySelector("[role='alert']")?.textContent).toBe("Enter a valid URL.");
    expect(mounted.editor.children).toEqual(before);

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(document.querySelector("[data-link-popover]")).toBeNull();
    expect(mounted.editor.children).toEqual(before);
    await mounted.cleanup();
  });
});
