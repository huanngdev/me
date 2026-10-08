import { describe, expect, test } from "bun:test";
import { KEYS, type SlateEditor, type TElement } from "platejs";
import { createPlateEditor } from "platejs/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";

import { runEditorCommand } from "./editor-commands";
import { createEditorDocument, serializeEditorDocument } from "./editor-document";
import { allowedChildTypes, isVoidElementType } from "./editor-document-schema";
import { parseEditorDocument, type ParseResult } from "./editor-document-validate";
import {
  EMBED_INVALID_URL,
  EMBED_PASTE_DROPPED,
  applyPasteUrlAction,
  clearPasteUrlOffer,
  convertEmbedToText,
  insertEmbedFromUrl,
  pasteUrlActions,
  pasteUrlPlugin,
  removeEmbed,
} from "./editor-embed";
import {
  EMBED_IFRAME_ALLOW,
  EMBED_SANDBOX,
  embedFrameSrc,
  parseEmbedUrl,
  type ParsedEmbed,
} from "./editor-embed-url";
import { EditorSurface } from "./editor-surface";
import { createEditorPlugins } from "./editor-plugins";
import { pasteRepairsOf } from "./editor-paste";
import { insertVideoFromUrl, VIDEO_EMBED_REJECTED } from "./editor-video";
import type { EditorValue } from "./editor-value";
import { blockIds, caret, createEditor, expectOk, field, isRecord, texts } from "./test-utils";

const YOUTUBE_ID = "jNQXAC9IVRw";
const WATCH = `https://www.youtube.com/watch?v=${YOUTUBE_ID}`;

function paragraph(text: string, id: string): TElement {
  return { type: "p", id, children: [{ text }] };
}

function embed(id: string, extra: Record<string, unknown> = {}): TElement {
  const node: TElement = {
    type: KEYS.mediaEmbed,
    id,
    provider: "youtube",
    videoId: YOUTUBE_ID,
    sourceUrl: WATCH,
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
  return parseEditorDocument(createEditorDocument("doc-embed", content));
}

function messages(result: ParseResult): string {
  if (result.status !== "unsupported" && result.status !== "invalid") {
    return "";
  }

  return result.issues.map((issue) => issue.message).join("\n");
}

function allText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => allText(item)).join("");
  }

  if (!isRecord(value)) {
    return "";
  }

  const text = typeof value.text === "string" ? value.text : "";
  const children = Array.isArray(value.children) ? allText(value.children) : "";
  return text + children;
}

function typesOf(editor: SlateEditor): string[] {
  return editor.children.map((block) => block.type);
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

// createSlateEditor leaves insertData unimplemented. The Plate editor inserts
// plain text, which is what a pasted URL uses on the page.
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

const accepted: { url: string; embed: ParsedEmbed }[] = [
  {
    url: WATCH,
    embed: { provider: "youtube", videoId: YOUTUBE_ID, sourceUrl: WATCH },
  },
  {
    url: `${WATCH}&t=90`,
    embed: {
      provider: "youtube",
      videoId: YOUTUBE_ID,
      sourceUrl: `${WATCH}&t=90`,
      startSeconds: 90,
    },
  },
  {
    url: `${WATCH}&t=1m30s`,
    embed: {
      provider: "youtube",
      videoId: YOUTUBE_ID,
      sourceUrl: `${WATCH}&t=1m30s`,
      startSeconds: 90,
    },
  },
  {
    url: `${WATCH}&list=PLxxxx`,
    embed: { provider: "youtube", videoId: YOUTUBE_ID, sourceUrl: `${WATCH}&list=PLxxxx` },
  },
  {
    url: `https://youtu.be/${YOUTUBE_ID}?t=42`,
    embed: {
      provider: "youtube",
      videoId: YOUTUBE_ID,
      sourceUrl: `https://youtu.be/${YOUTUBE_ID}?t=42`,
      startSeconds: 42,
    },
  },
  {
    url: `https://www.youtube.com/shorts/${YOUTUBE_ID}`,
    embed: {
      provider: "youtube",
      videoId: YOUTUBE_ID,
      sourceUrl: `https://www.youtube.com/shorts/${YOUTUBE_ID}`,
    },
  },
  {
    url: `https://www.youtube.com/embed/${YOUTUBE_ID}`,
    embed: {
      provider: "youtube",
      videoId: YOUTUBE_ID,
      sourceUrl: `https://www.youtube.com/embed/${YOUTUBE_ID}`,
    },
  },
  {
    url: `https://www.youtube.com/live/${YOUTUBE_ID}`,
    embed: {
      provider: "youtube",
      videoId: YOUTUBE_ID,
      sourceUrl: `https://www.youtube.com/live/${YOUTUBE_ID}`,
    },
  },
  {
    url: `https://www.youtube-nocookie.com/embed/${YOUTUBE_ID}`,
    embed: {
      provider: "youtube",
      videoId: YOUTUBE_ID,
      sourceUrl: `https://www.youtube-nocookie.com/embed/${YOUTUBE_ID}`,
    },
  },
  {
    url: `https://music.youtube.com/watch?v=${YOUTUBE_ID}`,
    embed: {
      provider: "youtube",
      videoId: YOUTUBE_ID,
      sourceUrl: `https://music.youtube.com/watch?v=${YOUTUBE_ID}`,
    },
  },
  {
    url: `http://www.youtube.com/watch?v=${YOUTUBE_ID}`,
    embed: { provider: "youtube", videoId: YOUTUBE_ID, sourceUrl: WATCH },
  },
  {
    url: `http://m.youtube.com/watch?v=${YOUTUBE_ID}`,
    embed: {
      provider: "youtube",
      videoId: YOUTUBE_ID,
      sourceUrl: `https://m.youtube.com/watch?v=${YOUTUBE_ID}`,
    },
  },
  {
    url: `https://youtube.com/watch?v=${YOUTUBE_ID}#t=1m30s`,
    embed: {
      provider: "youtube",
      videoId: YOUTUBE_ID,
      sourceUrl: `https://youtube.com/watch?v=${YOUTUBE_ID}#t=1m30s`,
      startSeconds: 90,
    },
  },
  {
    url: "https://vimeo.com/123",
    embed: { provider: "vimeo", videoId: "123", sourceUrl: "https://vimeo.com/123" },
  },
  {
    url: "https://vimeo.com/123/abcdef",
    embed: {
      provider: "vimeo",
      videoId: "123",
      hash: "abcdef",
      sourceUrl: "https://vimeo.com/123/abcdef",
    },
  },
  {
    url: "https://vimeo.com/channels/staffpicks/123",
    embed: {
      provider: "vimeo",
      videoId: "123",
      sourceUrl: "https://vimeo.com/channels/staffpicks/123",
    },
  },
  {
    url: "https://vimeo.com/groups/shortfilms/videos/123",
    embed: {
      provider: "vimeo",
      videoId: "123",
      sourceUrl: "https://vimeo.com/groups/shortfilms/videos/123",
    },
  },
  {
    url: "https://player.vimeo.com/video/123?h=abcdef",
    embed: {
      provider: "vimeo",
      videoId: "123",
      hash: "abcdef",
      sourceUrl: "https://player.vimeo.com/video/123?h=abcdef",
    },
  },
  {
    url: "http://www.vimeo.com/123",
    embed: { provider: "vimeo", videoId: "123", sourceUrl: "https://www.vimeo.com/123" },
  },
  {
    url: "https://player.vimeo.com/video/123?h=abcdef#t=1m30s",
    embed: {
      provider: "vimeo",
      videoId: "123",
      hash: "abcdef",
      startSeconds: 90,
      sourceUrl: "https://player.vimeo.com/video/123?h=abcdef#t=1m30s",
    },
  },
];

const rejected = [
  "https://youtube.com.evil.com/watch?v=jNQXAC9IVRw",
  "https://evilyoutube.com/watch?v=jNQXAC9IVRw",
  "https://a@youtube.com/watch?v=jNQXAC9IVRw",
  "javascript:alert(1)",
  "data:text/html,hi",
  "https://www.youtube.com/watch?v=jNQXAC9IVR",
  "https://www.youtube.com/watch?v=jNQXAC9IVRwX",
  "https://www.youtube.com/watch?v=jNQXAC9IVR!",
  "",
  `https://www.youtube.com/watch?v=${YOUTUBE_ID}&${"q".repeat(2100)}`,
  "https://vimeo.com/user123",
  "https://www.youtube.com/@channel",
  "https://www.youtube.com/playlist?list=PLxxxxxxxx",
  "https://studio.youtube.com/watch?v=jNQXAC9IVRw",
  "https://vimeopro.com/123",
  "https://www.dailymotion.com/video/x7tgad0",
  "https://vimeo.com/1234567890123",
];

describe("embed url parser", () => {
  test("accepts YouTube and Vimeo URLs and records the stored fields", () => {
    for (const item of accepted) {
      expect(parseEmbedUrl(item.url)).toEqual(item.embed);
    }
  });

  test("rejects look-alikes, bad ids, and non-http schemes", () => {
    for (const url of rejected) {
      expect(parseEmbedUrl(url)).toBeUndefined();
    }
    expect(parseEmbedUrl(`  ${WATCH}  `)).toEqual({
      provider: "youtube",
      videoId: YOUTUBE_ID,
      sourceUrl: WATCH,
    });
  });
});

describe("embed schema", () => {
  test("a stored embed round-trips and rejects url, src, html, and bad fields", () => {
    expect(isVoidElementType(KEYS.mediaEmbed)).toBe(true);
    const node = embed("embed-1", { caption: [{ text: "First upload" }] });
    const parsed = expectOk(documentOf([node]));
    expect(parsed.repairs).toEqual([]);
    expect(parsed.document.content).toEqual([node]);
    const again = expectOk(
      parseEditorDocument(JSON.parse(serializeEditorDocument(parsed.document))),
    );
    expect(again.document.content).toEqual([node]);

    expect(messages(documentOf([embed("bad", { url: WATCH })]))).toContain('attribute "url"');
    expect(messages(documentOf([embed("bad", { src: WATCH })]))).toContain('attribute "src"');
    expect(messages(documentOf([embed("bad", { html: "<iframe>" })]))).toContain(
      'attribute "html"',
    );
    expect(messages(documentOf([embed("bad", { provider: "dailymotion" })]))).toContain("provider");
    expect(messages(documentOf([embed("bad", { videoId: "short" })]))).toContain("videoId");
    expect(messages(documentOf([embed("bad", { hash: "nope" })]))).toContain("hash");
    expect(
      messages(
        documentOf([embed("bad", { sourceUrl: "http://www.youtube.com/watch?v=jNQXAC9IVRw" })]),
      ),
    ).toContain("not https");
    const sourceless = embed("bad");
    delete sourceless.sourceUrl;
    expect(messages(documentOf([sourceless]))).toContain("sourceUrl");
    const idless = embed("bad");
    delete idless.videoId;
    expect(messages(documentOf([idless]))).toContain("videoId");
  });
});

describe("embed render", () => {
  test("the facade is first, and activation derives the player src", async () => {
    const value = [embed("clip", { startSeconds: 42, sourceUrl: `${WATCH}&t=42` })];
    const html = renderEmbed(value);
    expect(html).toContain("YouTube video");
    expect(html).toContain("Play YouTube video");
    expect(html).not.toContain("<iframe");
    expect(html).toContain(`href="${WATCH}&amp;t=42"`);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');

    const mounted = await mountEmbed(value);
    expect(mounted.host.querySelector("iframe")).toBeNull();
    const play = mounted.host.querySelector("button");
    if (!(play instanceof HTMLButtonElement)) {
      throw new Error("Missing play button.");
    }
    await act(async () => {
      play.click();
    });
    const frame = mounted.host.querySelector("iframe");
    if (!(frame instanceof HTMLIFrameElement)) {
      throw new Error("Missing iframe.");
    }
    expect(frame.src).toBe(
      embedFrameSrc({ provider: "youtube", videoId: YOUTUBE_ID, startSeconds: 42 }, true),
    );
    expect(frame.title).toBe("YouTube video");
    expect(frame.getAttribute("loading")).toBe("lazy");
    expect(frame.getAttribute("allow")).toBe(EMBED_IFRAME_ALLOW);
    expect(frame.hasAttribute("allowfullscreen")).toBe(true);
    expect(frame.getAttribute("referrerpolicy")).toBe("strict-origin-when-cross-origin");
    expect(frame.getAttribute("sandbox")).toBe(EMBED_SANDBOX);
    expect(document.activeElement).toBe(frame);
    const prior = document.createElement("button");
    prior.type = "button";
    mounted.host.before(prior);
    prior.focus();
    const undos = mounted.editor.history.undos.length;
    const selection = JSON.parse(JSON.stringify(mounted.editor.selection));
    await act(async () => {
      prior.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }),
      );
    });
    expect(document.activeElement).toBe(frame);
    const link = mounted.host.querySelector("a");
    if (!(link instanceof HTMLElement)) {
      throw new Error("Missing original link.");
    }
    link.focus();
    await act(async () => {
      link.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Tab",
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    expect(document.activeElement).toBe(frame);
    expect(mounted.editor.history.undos.length).toBe(undos);
    expect(JSON.parse(JSON.stringify(mounted.editor.selection))).toEqual(selection);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link?.getAttribute("rel")).toBe("noopener noreferrer");
    await mounted.cleanup();
  });

  test("a Vimeo hash and a Shorts frame use the derived player", async () => {
    const vimeo = embed("vimeo", {
      provider: "vimeo",
      videoId: "123",
      hash: "abcdef",
      startSeconds: 90,
      sourceUrl: "https://player.vimeo.com/video/123?h=abcdef#t=1m30s",
    });
    const mounted = await mountEmbed([vimeo]);
    const play = mounted.host.querySelector("button");
    if (!(play instanceof HTMLButtonElement)) {
      throw new Error("Missing play button.");
    }
    await act(async () => {
      play.click();
    });
    const frame = mounted.host.querySelector("iframe");
    expect(frame?.getAttribute("src")).toBe(
      "https://player.vimeo.com/video/123?h=abcdef&autoplay=1#t=90s",
    );
    expect(frame?.title).toBe("Vimeo video");
    await mounted.cleanup();

    const shorts = renderEmbed([
      embed("short", { sourceUrl: `https://www.youtube.com/shorts/${YOUTUBE_ID}` }),
    ]);
    expect(shorts).toContain("aspect-ratio:9 / 16");
    expect(shorts).toContain("70vh");
  });

  test("read-only still plays from the facade and hides the toolbar", async () => {
    const mounted = await mountEmbed([embed("clip")], true);
    expect(mounted.host.querySelector('[aria-label="Remove"]')).toBeNull();
    expect(mounted.host.querySelector('[aria-label="Convert to text"]')).toBeNull();
    const play = mounted.host.querySelector("button");
    if (!(play instanceof HTMLButtonElement)) {
      throw new Error("Missing play button.");
    }
    await act(async () => {
      play.click();
    });
    expect(mounted.host.querySelector("iframe")).not.toBeNull();
    await mounted.cleanup();
  });

  test("activation and iframe pointer or keys leave the selection and history alone", async () => {
    const mounted = await mountEmbed([paragraph("Before", "before"), embed("clip")]);
    const selection = JSON.parse(JSON.stringify(mounted.editor.selection));
    const undos = mounted.editor.history.undos.length;
    const play = mounted.host.querySelector('[aria-label="Play YouTube video"]');
    if (!(play instanceof HTMLButtonElement)) {
      throw new Error("Missing play button.");
    }
    await act(async () => {
      play.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
      play.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
      play.click();
    });
    const frame = mounted.host.querySelector("iframe");
    if (!(frame instanceof HTMLIFrameElement)) {
      throw new Error("Missing iframe.");
    }
    await act(async () => {
      frame.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
      frame.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
      frame.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      frame.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true }));
      frame.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", code: "ArrowRight", bubbles: true }),
      );
    });
    expect(JSON.parse(JSON.stringify(mounted.editor.selection))).toEqual(selection);
    expect(mounted.editor.history.undos.length).toBe(undos);
    await mounted.cleanup();
  });
});

describe("embed commands", () => {
  test("insert, video-from-url, convert, caption, and remove each undo once", () => {
    expect(insertEmbedFromUrl.id).toBe("block.insert.embed");
    expect(insertEmbedFromUrl.label).toBe("Embed video");
    const editor = createEditor([paragraph("", "empty")]);
    editor.tf.select(caret([0, 0], 0));
    const before = JSON.parse(JSON.stringify(editor.children));
    runEditorCommand(editor, insertEmbedFromUrl, `  ${WATCH}&t=42  `);
    const block = editor.children.find((item) => item.type === KEYS.mediaEmbed);
    expect(field(block, "provider")).toBe("youtube");
    expect(field(block, "videoId")).toBe(YOUTUBE_ID);
    expect(field(block, "startSeconds")).toBe(42);
    expect(field(block, "url")).toBeUndefined();
    expect(editor.history.undos.length).toBe(1);
    editor.tf.undo();
    expect(editor.children).toEqual(before);

    runEditorCommand(editor, insertEmbedFromUrl, "https://example.com/video");
    expect(editor.children).toEqual(before);
    expect(pasteRepairsOf(editor).map((repair) => repair.message)).toContain(EMBED_INVALID_URL);
    expect(editor.history.undos.length).toBe(0);

    runEditorCommand(editor, insertVideoFromUrl, WATCH);
    expect(editor.children.some((item) => item.type === KEYS.mediaEmbed)).toBe(true);
    expect(editor.history.undos.length).toBe(1);
    const id = String(
      field(
        editor.children.find((item) => item.type === KEYS.mediaEmbed),
        "id",
      ),
    );
    runEditorCommand(editor, convertEmbedToText, id);
    expect(typesOf(editor)).toEqual(["p"]);
    expect(texts(editor)).toEqual([WATCH]);
    expect(editor.history.undos.length).toBe(2);
    editor.tf.undo();
    expect(field(editor.children[0], "videoId")).toBe(YOUTUBE_ID);

    editor.tf.setNodes({ caption: [{ text: "Zoo" }] }, { at: [0] });
    expect(field(editor.children[0], "caption")).toEqual([{ text: "Zoo" }]);
    expect(editor.history.undos.length).toBe(2);
    editor.tf.undo();
    expect(field(editor.children[0], "caption")).toBeUndefined();

    runEditorCommand(editor, removeEmbed, String(field(editor.children[0], "id")));
    expect(typesOf(editor)).toEqual(["p"]);
    expect(editor.history.undos.length).toBe(2);
    editor.tf.undo();
    expect(field(editor.children[0], "type")).toBe(KEYS.mediaEmbed);

    editor.dom.readOnly = true;
    const frozen = JSON.parse(JSON.stringify(editor.children));
    runEditorCommand(editor, insertEmbedFromUrl, WATCH);
    runEditorCommand(editor, convertEmbedToText, String(field(editor.children[0], "id")));
    runEditorCommand(editor, removeEmbed, String(field(editor.children[0], "id")));
    expect(editor.children).toEqual(frozen);
  });
});

describe("embed paste", () => {
  test("a bare provider URL pastes as text and offers embed, then one extra undo", () => {
    const editor = plateEditor([paragraph("", "empty")]);
    editor.tf.select(caret([0, 0], 0));
    pasteText(editor, `  https://youtu.be/${YOUTUBE_ID}?t=42  `);
    expect(texts(editor)).toEqual([`  https://youtu.be/${YOUTUBE_ID}?t=42  `]);
    expect(offerOf(editor)?.url).toBe(`https://youtu.be/${YOUTUBE_ID}?t=42`);
    expect(editor.history.undos.length).toBe(1);

    runEditorCommand(editor, applyPasteUrlAction, "embed");
    expect(typesOf(editor)).toEqual([KEYS.mediaEmbed]);
    expect(field(editor.children[0], "startSeconds")).toBe(42);
    expect(editor.history.undos.length).toBe(2);
    editor.tf.undo();
    expect(texts(editor)).toEqual([`  https://youtu.be/${YOUTUBE_ID}?t=42  `]);
    editor.tf.undo();
    expect(texts(editor)).toEqual([""]);
  });

  test("a mixed paragraph removes only the URL and inserts the embed after it", () => {
    const editor = plateEditor([paragraph("See ", "note")]);
    editor.tf.select(caret([0, 0], 4));
    pasteText(editor, WATCH);
    expect(texts(editor)).toEqual([`See ${WATCH}`]);
    expect(offerOf(editor)?.url).toBe(WATCH);
    runEditorCommand(editor, applyPasteUrlAction, "embed");
    expect(typesOf(editor)).toEqual(["p", KEYS.mediaEmbed]);
    expect(texts(editor)[0]).toBe("See ");
    expect(field(editor.children[1], "videoId")).toBe(YOUTUBE_ID);
    editor.tf.undo();
    expect(texts(editor)).toEqual([`See ${WATCH}`]);
  });

  test("keep, escape, typing, and a selection change dismiss the menu and keep the text", async () => {
    const kept = plateEditor([paragraph("", "empty")]);
    kept.tf.select(caret([0, 0], 0));
    pasteText(kept, WATCH);
    runEditorCommand(kept, applyPasteUrlAction, "missing");
    expect(offerOf(kept)?.url).toBe(WATCH);
    clearPasteUrlOffer(kept);
    expect(offerOf(kept)).toBeUndefined();
    expect(texts(kept)).toEqual([WATCH]);

    const typed = plateEditor([paragraph("", "empty")]);
    typed.tf.select(caret([0, 0], 0));
    pasteText(typed, WATCH);
    typed.tf.insertText("!");
    expect(offerOf(typed)).toBeUndefined();
    expect(texts(typed)).toEqual([`${WATCH}!`]);

    const moved = plateEditor([paragraph("", "empty"), paragraph("Next", "next")]);
    moved.tf.select(caret([0, 0], 0));
    pasteText(moved, WATCH);
    expect(offerOf(moved)?.url).toBe(WATCH);
    moved.tf.select(caret([1, 0], 0));
    await Promise.resolve();
    expect(offerOf(moved)).toBeUndefined();
    expect(texts(moved)[0]).toBe(WATCH);

    const mounted = await mountEmbed([paragraph("", "empty")]);
    mounted.editor.tf.select(caret([0, 0], 0));
    await act(async () => {
      pasteText(mounted.editor, WATCH);
    });
    expect(document.querySelector("[data-paste-url-menu]")).not.toBeNull();
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(document.querySelector("[data-paste-url-menu]")).toBeNull();
    expect(texts(mounted.editor)).toEqual([WATCH]);
    await mounted.cleanup();
  });

  test("other URLs, extra text, code, and table cells do not offer an embed", () => {
    const plain = plateEditor([paragraph("", "empty")]);
    plain.tf.select(caret([0, 0], 0));
    pasteText(plain, "https://example.com/video");
    expect(offerOf(plain)).toBeUndefined();
    expect(texts(plain)).toEqual(["https://example.com/video"]);

    const mixed = plateEditor([paragraph("", "empty")]);
    mixed.tf.select(caret([0, 0], 0));
    pasteText(mixed, `see ${WATCH}`);
    expect(offerOf(mixed)).toBeUndefined();

    const code = plateEditor([codeBlock("")]);
    code.tf.select(caret([0, 0, 0], 0));
    pasteText(code, WATCH);
    expect(offerOf(code)).toBeUndefined();
    expect(allText(code.children)).toContain(WATCH);

    const table = plateEditor([
      tableNode("table-1", [row("row-1", [cell("td", "cell-1", [paragraph("", "cell-p")])])]),
    ]);
    table.tf.select(caret([0, 0, 0, 0, 0], 0));
    pasteText(table, WATCH);
    expect(offerOf(table)).toBeUndefined();
    expect(allText(table.children)).toContain(WATCH);

    const readonly = plateEditor([paragraph("", "empty")]);
    readonly.dom.readOnly = true;
    readonly.tf.select(caret([0, 0], 0));
    pasteText(readonly, WATCH);
    expect(offerOf(readonly)).toBeUndefined();
  });

  test("an iframe src becomes an embed, another iframe is dropped, and script text does not survive", () => {
    const provider = createEditor([paragraph("", "empty")]);
    provider.tf.select(caret([0, 0], 0));
    pasteHtml(provider, `<iframe src="https://youtu.be/${YOUTUBE_ID}?t=42"></iframe>`);
    expect(typesOf(provider)).toContain(KEYS.mediaEmbed);
    expect(
      field(
        provider.children.find((block) => block.type === KEYS.mediaEmbed),
        "startSeconds",
      ),
    ).toBe(42);

    const other = createEditor([paragraph("Stay", "stay")]);
    other.tf.select(caret([0, 0], 0));
    pasteHtml(other, '<iframe src="https://example.com/video"></iframe>');
    expect(typesOf(other)).not.toContain(KEYS.mediaEmbed);
    expect(pasteRepairsOf(other).map((repair) => repair.message)).toContain(EMBED_PASTE_DROPPED);
    expect(texts(other).join("\n")).not.toContain("example.com");

    const script = createEditor([paragraph("", "empty")]);
    script.tf.select(caret([0, 0], 0));
    pasteHtml(script, "<script>alert(1)</script><p>Hi</p>");
    expect(texts(script).join("\n")).not.toContain("alert");
    expect(texts(script)).toContain("Hi");

    const copied = createEditor([paragraph("", "empty")]);
    copied.tf.select(caret([0, 0], 0));
    copied.tf.insertFragment([embed("same", { caption: [{ text: "Kept" }], hash: undefined })]);
    const pasted = copied.children.find((block) => block.type === KEYS.mediaEmbed);
    expect(field(pasted, "videoId")).toBe(YOUTUBE_ID);
    expect(field(pasted, "sourceUrl")).toBe(WATCH);
    expect(field(pasted, "caption")).toEqual([{ text: "Kept" }]);
    expect(field(pasted, "id")).not.toBe("same");
  });

  test("a pasted video node with a provider URL becomes an embed", () => {
    const editor = createEditor([paragraph("", "empty")]);
    editor.tf.select(caret([0, 0], 0));
    editor.tf.insertFragment([
      { type: "video", id: "clip", url: "https://vimeo.com/123/abcdef", children: [{ text: "" }] },
    ]);
    const block = editor.children.find((item) => item.type === KEYS.mediaEmbed);
    expect(field(block, "provider")).toBe("vimeo");
    expect(field(block, "videoId")).toBe("123");
    expect(field(block, "hash")).toBe("abcdef");
    expect(pasteRepairsOf(editor).map((repair) => repair.message)).not.toContain(
      VIDEO_EMBED_REJECTED,
    );
  });
});

describe("embed containers and keyboard", () => {
  test("backspace selects an embed and a second backspace deletes it, and enter inserts after it", () => {
    const editor = createEditor([paragraph("Hello", "a"), embed("clip"), paragraph("World", "b")]);
    editor.tf.select(caret([2, 0], 0));
    editor.tf.deleteBackward();
    expect(blockIds(editor)).toEqual(["a", "clip", "b"]);
    expect(editor.selection?.anchor.path[0]).toBe(1);
    editor.tf.deleteBackward();
    expect(typesOf(editor)).toEqual(["p", "p"]);
    expect(texts(editor)).toEqual(["Hello", "World"]);

    const entered = createEditor([paragraph("Hello", "a"), embed("clip"), paragraph("World", "b")]);
    const anchor = entered.api.start([1]);
    const focus = entered.api.end([1]);
    if (!anchor || !focus) {
      throw new Error("Missing embed.");
    }
    entered.tf.select({ anchor, focus });
    entered.tf.insertBreak();
    expect(typesOf(entered)).toEqual(["p", KEYS.mediaEmbed, "p", "p"]);
    expect(blockIds(entered)[1]).toBe("clip");
    expect(entered.selection?.anchor.path[0]).toBe(2);
  });

  test("an embed stays inside a toggle, splits a quote and a callout, and lifts out of a table cell", () => {
    expect(allowedChildTypes("toggle")).toContain(KEYS.mediaEmbed);
    const kept = createEditor([toggle("toggle-1", [paragraph("Label", "label"), embed("clip")])]);
    kept.tf.normalize({ force: true });
    expect(typesOf(kept)).toEqual(["toggle"]);
    expect(childTypes(kept.children[0])).toEqual(["p", KEYS.mediaEmbed]);

    const split = createEditor([
      quote("quote-1", [paragraph("Before", "before"), embed("clip"), paragraph("After", "after")]),
      callout("callout-1", [paragraph("Note", "note"), embed("icon"), paragraph("Tail", "tail")]),
    ]);
    split.tf.normalize({ force: true });
    expect(typesOf(split)).toEqual([
      "blockquote",
      KEYS.mediaEmbed,
      "blockquote",
      "callout",
      KEYS.mediaEmbed,
      "callout",
    ]);
    expect(field(split.children[1], "id")).toBe("clip");

    const lifted = createEditor([
      tableNode("table-1", [
        row("row-1", [cell("td", "cell-1", [paragraph("Stay", "stay"), embed("clip")])]),
      ]),
      paragraph("After", "after"),
    ]);
    lifted.tf.normalize({ force: true });
    expect(typesOf(lifted)).toEqual(["table", KEYS.mediaEmbed, "p"]);
    expect(field(lifted.children[1], "id")).toBe("clip");
    expect(field(lifted.children[1], "sourceUrl")).toBe(WATCH);
  });
});

describe("paste url actions", () => {
  test("the menu is a list DEV-109 can extend", () => {
    expect(pasteUrlActions.map((action) => action.label)).toEqual(["Embed video"]);
    expect(pasteUrlActions[0]?.match(WATCH)).toBe(true);
    expect(pasteUrlActions[0]?.match("https://example.com/video")).toBe(false);
  });
});

function renderEmbed(value: EditorValue, readOnly = false): string {
  const editor = createPlateEditor({ plugins: createEditorPlugins(), value });
  return renderToStaticMarkup(
    <EditorSurface editor={editor} readOnly={readOnly} placeholder="" className="editor" />,
  );
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

async function mountEmbed(value: EditorValue, readOnly = false) {
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
