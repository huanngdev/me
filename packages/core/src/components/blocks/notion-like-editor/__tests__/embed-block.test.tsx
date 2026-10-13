import { describe, expect, test } from "bun:test";
import { KEYS } from "platejs";
import { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { runEditorCommand } from "../lib/commands/editor-commands";
import { allowedChildTypes, EDITOR_ELEMENT_RULES } from "../lib/document/editor-document-schema";
import { createEditorDocument } from "../lib/document/editor-document";
import { parseEditorDocument } from "../lib/document/editor-document-validate";
import type { EditorValue } from "../lib/document/editor-value";
import { AUDIO_KEY } from "../lib/features/editor-audio";
import { EMBED_ATTRS_CLEANED, EMBED_KEY, EMBED_SOURCE_REMOVED } from "../lib/features/editor-embed";
import {
  insertEmbed,
  removeEmbed,
  setEmbedAlign,
  setEmbedCaption,
  setEmbedSource,
  setEmbedWidth,
} from "../lib/features/editor-embed-commands";
import { EMBED_IFRAME_ALLOW, EMBED_SANDBOX } from "../lib/features/editor-embed-url";
import { MEDIA_CAPTION_MAX } from "../lib/features/editor-media-layout";
import {
  applyPasteUrlAction,
  pasteUrlActions,
  pasteUrlPlugin,
} from "../lib/paste/editor-paste-url";
import {
  mediaActionsBlockId,
  mediaSourceBlockId,
  onMediaUiKeyDown,
} from "../lib/plugins/editor-media-ui";
import { createEditorPlugins } from "../lib/plugins/editor-plugins";
import { chooseSlashItem, slashMenuItems } from "../lib/plugins/editor-slash";
import { NotionLikeEditorStatic } from "../notion-like-editor-static";
import { caret, createEditor, expectOk, field } from "./test-utils";
import {
  blockHost,
  click,
  expectOneUndo,
  find,
  mediaBlock,
  mount,
  nodeOf,
  paragraph,
  press,
  settle,
  snapshot,
  typeInto,
  types,
} from "./media-block-helpers";

const ID = "aqz-KE-bpKQ";
const YOUTUBE = `https://www.youtube.com/watch?v=${ID}`;
const SHORT = `https://www.youtube.com/shorts/${ID}`;
const VIMEO = "https://vimeo.com/76979871";

function embed(id: string, extra: Record<string, unknown> = {}) {
  return mediaBlock(EMBED_KEY, id, extra);
}

function parse(content: unknown[]) {
  return parseEditorDocument(createEditorDocument("doc", content as EditorValue));
}

function repairMessages(result: ReturnType<typeof parse>): string[] {
  return result.status === "ok" ? result.repairs.map((repair) => repair.message) : [];
}

// The anchor of an embed block carries its state: empty, or ready with its frame.
function embedState(host: HTMLElement, id: string): string | null {
  return (
    blockHost(host, id)?.querySelector("[data-embed-state]")?.getAttribute("data-embed-state") ??
    null
  );
}

function frames(host: HTMLElement, id: string): HTMLIFrameElement[] {
  return [...(blockHost(host, id)?.querySelectorAll<HTMLIFrameElement>("iframe") ?? [])];
}

// A click on the card, outside the frame, opens the actions.
async function openActionsOn(host: HTMLElement, id: string): Promise<void> {
  await click(blockHost(host, id)?.querySelector("[data-embed-card]") ?? null);
}

function linkInput(): HTMLInputElement {
  const input = find("[data-embed-link-input]");
  if (!(input instanceof HTMLInputElement)) {
    throw new Error("Missing the embed link field.");
  }
  return input;
}

async function submitLink(link: string): Promise<void> {
  await typeInto(linkInput(), link);
  await click(find("[data-embed-submit]"));
}

// Pastes plain text, the way a clipboard holds a bare link.
function pasteText(editor: ReturnType<typeof createEditor>, text: string): void {
  const data = new DataTransfer();
  data.setData("text/plain", text);
  editor.tf.insertData(data);
}

describe("embed schema", () => {
  test("a valid embed round-trips unchanged, through JSON as well", () => {
    const content = [
      paragraph("Before", "p1"),
      embed("e1", {
        provider: "youtube",
        videoId: ID,
        startSeconds: 90,
        url: `https://youtu.be/${ID}?t=90`,
        width: 60,
        align: "right",
        caption: "A talk",
      }),
      embed("e2", { provider: "vimeo", videoId: "76979871", hash: "abcdef1234", url: VIMEO }),
      embed("e3"),
    ];
    const result = expectOk(parse(content));
    expect(result.repairs).toEqual([]);
    expect(result.document.content).toEqual(content);

    const again = expectOk(parse(JSON.parse(JSON.stringify(result.document.content))));
    expect(again.document.content).toEqual(content);
  });

  test("an embed is a void block, and the containers that take a video take an embed", () => {
    const rule = EDITOR_ELEMENT_RULES.find((item) => item.type === EMBED_KEY);
    expect(rule?.isVoid).toBe(true);
    expect(allowedChildTypes(KEYS.toggle)).toContain(EMBED_KEY);
    expect(allowedChildTypes(KEYS.column)).toContain(EMBED_KEY);
  });

  test("a provider that is not YouTube or Vimeo clears the source, and keeps the width", () => {
    const result = expectOk(
      parse([embed("e1", { provider: "dailymotion", videoId: ID, url: YOUTUBE, width: 40 })]),
    );
    expect(repairMessages(result)).toEqual([EMBED_SOURCE_REMOVED]);
    const node = result.document.content[0];
    expect(field(node, "provider")).toBeUndefined();
    expect(field(node, "videoId")).toBeUndefined();
    expect(field(node, "url")).toBeUndefined();
    expect(field(node, "width")).toBe(40);
  });

  test("a video id of the wrong length for its provider clears the source", () => {
    const result = expectOk(parse([embed("e1", { provider: "youtube", videoId: "short" })]));
    expect(repairMessages(result)).toEqual([EMBED_SOURCE_REMOVED]);
    expect(field(result.document.content[0], "videoId")).toBeUndefined();
  });

  test("a Vimeo hash on a YouTube embed clears the source", () => {
    const result = expectOk(
      parse([embed("e1", { provider: "youtube", videoId: ID, hash: "abcdef1234" })]),
    );
    expect(repairMessages(result)).toEqual([EMBED_SOURCE_REMOVED]);
    expect(field(result.document.content[0], "hash")).toBeUndefined();
  });

  test("an attribute the embed does not have is dropped, and the embed is kept", () => {
    const result = expectOk(
      parse([embed("e1", { provider: "vimeo", videoId: "76979871", mimeType: "video/mp4" })]),
    );
    expect(repairMessages(result)).toEqual([EMBED_ATTRS_CLEANED]);
    expect(field(result.document.content[0], "mimeType")).toBeUndefined();
    expect(field(result.document.content[0], "videoId")).toBe("76979871");
  });

  test("a url that points to another video is dropped, and the embed is kept", () => {
    const result = expectOk(
      parse([
        embed("e1", {
          provider: "youtube",
          videoId: ID,
          url: "https://www.youtube.com/watch?v=jNQXAC9IVRw",
        }),
      ]),
    );
    expect(repairMessages(result)).toEqual([EMBED_ATTRS_CLEANED]);
    expect(field(result.document.content[0], "url")).toBeUndefined();
    expect(field(result.document.content[0], "videoId")).toBe(ID);
  });

  test("a url on another host, or a data url, is dropped without rejecting the document", () => {
    const other = expectOk(
      parse([embed("e1", { provider: "youtube", videoId: ID, url: "https://example.com/clip" })]),
    );
    expect(repairMessages(other)).toEqual([EMBED_ATTRS_CLEANED]);
    expect(field(other.document.content[0], "url")).toBeUndefined();

    const data = expectOk(
      parse([embed("e1", { provider: "youtube", videoId: ID, url: "data:text/html,x" })]),
    );
    expect(repairMessages(data)).toEqual([EMBED_ATTRS_CLEANED]);
  });

  test("a start time that is not a whole number of seconds is dropped", () => {
    const result = expectOk(
      parse([embed("e1", { provider: "youtube", videoId: ID, startSeconds: -5 })]),
    );
    expect(repairMessages(result)).toEqual([EMBED_ATTRS_CLEANED]);
    expect(field(result.document.content[0], "startSeconds")).toBeUndefined();
  });
});

describe("embed commands", () => {
  test("insertEmbed places one empty embed, and undo removes it", () => {
    const editor = createEditor([paragraph("Stay", "p1")]);
    editor.tf.select(caret([0, 0], 4));
    expectOneUndo(editor, () => runEditorCommand(editor, insertEmbed, { id: "e1" }));
    runEditorCommand(editor, insertEmbed, { id: "e1" });
    expect(types(editor)).toEqual([KEYS.p, EMBED_KEY]);
    expect(field(nodeOf(editor, "e1"), "videoId")).toBeUndefined();
  });

  test("setEmbedSource stores a YouTube link, and one undo restores the empty block", () => {
    const editor = createEditor([paragraph("Stay", "p1"), embed("e1")]);
    expectOneUndo(editor, () =>
      runEditorCommand(editor, setEmbedSource, { id: "e1", file: { url: `${YOUTUBE}&t=1m30s` } }),
    );
    runEditorCommand(editor, setEmbedSource, { id: "e1", file: { url: `${YOUTUBE}&t=1m30s` } });
    expect(nodeOf(editor, "e1")).toMatchObject({
      provider: "youtube",
      videoId: ID,
      startSeconds: 90,
      url: YOUTUBE + "&t=1m30s",
    });
  });

  test("setEmbedSource replaces the source and removes the fields the new link does not have", () => {
    const editor = createEditor([paragraph("Stay", "p1"), embed("e1")]);
    runEditorCommand(editor, setEmbedSource, { id: "e1", file: { url: `${YOUTUBE}&t=90` } });
    runEditorCommand(editor, setEmbedSource, { id: "e1", file: { url: VIMEO } });
    const node = nodeOf(editor, "e1");
    expect(node).toMatchObject({ provider: "vimeo", videoId: "76979871", url: VIMEO });
    expect(field(node, "startSeconds")).toBeUndefined();
    expect(field(node, "hash")).toBeUndefined();
  });

  test("setEmbedSource refuses a link that is not YouTube or Vimeo, and changes nothing", () => {
    const editor = createEditor([paragraph("Stay", "p1"), embed("e1")]);
    const before = snapshot(editor);
    for (const url of ["https://example.com/", "javascript:alert(1)", "data:text/html,x"]) {
      expect(runEditorCommand(editor, setEmbedSource, { id: "e1", file: { url } })).toBe(false);
    }
    expect(snapshot(editor)).toBe(before);
  });

  test("a command refuses a block that is not an embed", () => {
    const editor = createEditor([paragraph("Stay", "p1")]);
    expect(runEditorCommand(editor, setEmbedSource, { id: "p1", file: { url: YOUTUBE } })).toBe(
      false,
    );
    expect(runEditorCommand(editor, setEmbedCaption, { id: "p1", caption: "x" })).toBe(false);
  });

  test("setEmbedCaption stores the caption, cuts it to 500 characters, and an empty one removes it", () => {
    const editor = createEditor([
      paragraph("Stay", "p1"),
      embed("e1", { provider: "vimeo", videoId: "1" }),
    ]);
    runEditorCommand(editor, setEmbedCaption, { id: "e1", caption: "x".repeat(600) });
    expect(String(field(nodeOf(editor, "e1"), "caption")).length).toBe(MEDIA_CAPTION_MAX);
    runEditorCommand(editor, setEmbedCaption, { id: "e1", caption: "   " });
    expect(field(nodeOf(editor, "e1"), "caption")).toBeUndefined();
  });

  test("setEmbedWidth accepts 10 to 100, refuses anything else, and null removes the width", () => {
    const editor = createEditor([
      paragraph("Stay", "p1"),
      embed("e1", { provider: "vimeo", videoId: "1" }),
    ]);
    expect(runEditorCommand(editor, setEmbedWidth, { id: "e1", width: 9 })).toBe(false);
    expect(runEditorCommand(editor, setEmbedWidth, { id: "e1", width: 50 })).toBe(true);
    expect(field(nodeOf(editor, "e1"), "width")).toBe(50);
    expect(runEditorCommand(editor, setEmbedWidth, { id: "e1", width: null })).toBe(true);
    expect(field(nodeOf(editor, "e1"), "width")).toBeUndefined();
  });

  test("setEmbedAlign stores left, center or right, and refuses another value", () => {
    const editor = createEditor([
      paragraph("Stay", "p1"),
      embed("e1", { provider: "vimeo", videoId: "1" }),
    ]);
    expect(runEditorCommand(editor, setEmbedAlign, { id: "e1", align: "justify" as "left" })).toBe(
      false,
    );
    expect(runEditorCommand(editor, setEmbedAlign, { id: "e1", align: "right" })).toBe(true);
    expect(field(nodeOf(editor, "e1"), "align")).toBe("right");
  });

  test("removeEmbed deletes the block in one undo step, and an empty document gets a paragraph", () => {
    const editor = createEditor([embed("e1", { provider: "vimeo", videoId: "1" })]);
    expectOneUndo(editor, () => runEditorCommand(editor, removeEmbed, { id: "e1" }));
    runEditorCommand(editor, removeEmbed, { id: "e1" });
    expect(types(editor)).toEqual([KEYS.p]);
  });
});

describe("embed paste url action", () => {
  test("createEditorPlugins, the entry the app uses, registers the Embed action", () => {
    // The action is removed, then the app's entry point runs. Only that call may add it back.
    const index = pasteUrlActions.findIndex((action) => action.id === "embed");
    pasteUrlActions.splice(index, 1);
    expect(pasteUrlActions.some((action) => action.id === "embed")).toBe(false);

    createEditorPlugins();
    createEditorPlugins();
    expect(pasteUrlActions.map((action) => action.id)).toEqual(["bookmark", "embed"]);
  });

  test("Embed is offered for a YouTube link after Bookmark, and not for another site", () => {
    const youtube = pasteUrlActions.filter((action) => action.match(YOUTUBE));
    expect(youtube.map((action) => action.label)).toEqual(["Bookmark", "Embed"]);
    const other = pasteUrlActions.filter((action) => action.match("https://example.com/"));
    expect(other.map((action) => action.label)).toEqual(["Bookmark"]);
  });

  test("the embed action replaces the pasted link with an embed, and undo brings the link back", () => {
    const editor = createEditor([paragraph("", "p1")]);
    editor.tf.select(caret([0, 0], 0));
    pasteText(editor, YOUTUBE);
    expect(editor.getOption(pasteUrlPlugin, "offer")?.url).toBe(YOUTUBE);

    runEditorCommand(editor, applyPasteUrlAction, "embed");
    expect(types(editor)).toEqual([EMBED_KEY]);
    expect(field(editor.children[0], "videoId")).toBe(ID);

    editor.tf.undo();
    expect(types(editor)).toEqual([KEYS.p]);
    expect(JSON.stringify(editor.children)).toContain(YOUTUBE);
  });
});

describe("embed slash item", () => {
  test("the Embed item is offered right after Audio, with its description", () => {
    const editor = createEditor([paragraph("", "target")]);
    editor.tf.select(caret([0, 0], 0));
    editor.tf.insertText("/");
    const items = slashMenuItems(editor);
    const ids = items.map((item) => item.id);
    expect(ids[ids.indexOf("audio") + 1]).toBe("embed");
    expect(items.find((item) => item.id === "embed")).toMatchObject({
      label: "Embed",
      description: "YouTube or Vimeo link",
      group: "Advanced",
    });
    expect(AUDIO_KEY).toBe("audio");
  });

  test("choosing Embed inserts an empty embed and opens its link popover", () => {
    const editor = createEditor([paragraph("", "target"), paragraph("below", "below")]);
    editor.tf.select(caret([0, 0], 0));
    editor.tf.insertText("/");
    runEditorCommand(editor, chooseSlashItem, "embed");
    const inserted = editor.children.find((node) => field(node, "type") === EMBED_KEY);
    expect(inserted).toBeDefined();
    expect(mediaSourceBlockId(editor)).toBe(String(field(inserted, "id")));
    expect(field(inserted, "videoId")).toBeUndefined();
  });

  test("/embed lists Embed first, /bookmark lists Bookmark first, and /link keeps Link first", () => {
    const first = (query: string) => {
      const editor = createEditor([paragraph("", "target")]);
      editor.tf.select(caret([0, 0], 0));
      editor.tf.insertText("/");
      editor.tf.insertText(query);
      return slashMenuItems(editor)[0]?.id;
    };
    expect(first("embed")).toBe("embed");
    expect(first("bookmark")).toBe("bookmark");
    expect(first("link")).toBe("link");
  });

  test("the Embed item is not offered in read-only mode", () => {
    const editor = createEditor([paragraph("", "target")]);
    editor.tf.select(caret([0, 0], 0));
    editor.tf.insertText("/");
    editor.dom.readOnly = true;
    expect(slashMenuItems(editor).some((item) => item.id === "embed")).toBe(false);
  });
});

describe("embed link popover and frame", () => {
  test("the empty placeholder opens a link popover with no upload tab, and Escape closes it", async () => {
    const mounted = await mount([paragraph("", "p1"), embed("e1")]);
    await settle();
    await click(blockHost(mounted.host, "e1")?.querySelector("[data-media-placeholder]") ?? null);
    const popover = find("[data-embed-link-popover]");
    expect(popover?.getAttribute("aria-label")).toBe("Embed link");
    expect(find("[data-media-upload]")).toBeNull();
    expect(linkInput().getAttribute("placeholder")).toBe("Paste a YouTube or Vimeo link…");

    await press(linkInput(), "Escape");
    expect(find("[data-embed-link-popover]")).toBeNull();
    expect(mediaSourceBlockId(mounted.editor)).toBe("");
    await mounted.cleanup();
  });

  test("a link that is not YouTube or Vimeo shows the error and changes nothing", async () => {
    const mounted = await mount([paragraph("", "p1"), embed("e1")]);
    await settle();
    await click(blockHost(mounted.host, "e1")?.querySelector("[data-media-placeholder]") ?? null);
    const before = snapshot(mounted.editor);
    await submitLink("https://example.com/");
    expect(find('[role="alert"]')?.textContent).toBe("Enter a YouTube or Vimeo link");
    expect(snapshot(mounted.editor)).toBe(before);
    expect(find("[data-embed-link-popover]")).not.toBeNull();
    await mounted.cleanup();
  });

  test("a valid link fills the block, closes the popover, and the frame is there with no click", async () => {
    const mounted = await mount([paragraph("", "p1"), embed("e1")]);
    await settle();
    await click(blockHost(mounted.host, "e1")?.querySelector("[data-media-placeholder]") ?? null);
    await submitLink(YOUTUBE);
    expect(find("[data-embed-link-popover]")).toBeNull();
    expect(nodeOf(mounted.editor, "e1")).toMatchObject({ provider: "youtube", videoId: ID });
    expect(embedState(mounted.host, "e1")).toBe("ready");
    expect(frames(mounted.host, "e1")).toHaveLength(1);
    expect(blockHost(mounted.host, "e1")?.querySelector("[data-embed-load]")).toBeNull();
    await mounted.cleanup();
  });

  test("the frame is one iframe with its src, sandbox, allow and title, and no autoplay", async () => {
    const mounted = await mount([
      paragraph("", "p1"),
      embed("e1", { provider: "youtube", videoId: ID, startSeconds: 90, url: `${YOUTUBE}&t=90` }),
    ]);
    await settle();
    const [frame, ...rest] = frames(mounted.host, "e1");
    expect(rest).toHaveLength(0);
    expect(frame?.getAttribute("src")).toBe(
      `https://www.youtube-nocookie.com/embed/${ID}?start=90`,
    );
    expect(frame?.getAttribute("sandbox")).toBe(EMBED_SANDBOX);
    expect(frame?.getAttribute("allow")).toBe(EMBED_IFRAME_ALLOW);
    expect(frame?.getAttribute("title")).toBe("YouTube video");
    expect(frame?.getAttribute("referrerpolicy")).toBe("strict-origin-when-cross-origin");
    expect(frame?.hasAttribute("allowfullscreen")).toBe(true);
    expect(frame?.getAttribute("loading")).toBe("lazy");
    expect(frame?.hasAttribute("autoplay")).toBe(false);
    expect(embedState(mounted.host, "e1")).toBe("ready");

    // The frame is a control, so the card and its actions are not opened by the frame itself.
    expect(find("[data-embed-actions]")).toBeNull();
    expect(mediaActionsBlockId(mounted.editor)).toBe("");
    await mounted.cleanup();
  });

  test("Replace with another link changes the frame to the new provider", async () => {
    const mounted = await mount([
      paragraph("", "p1"),
      embed("e1", { provider: "youtube", videoId: ID, url: YOUTUBE }),
    ]);
    await settle();
    expect(frames(mounted.host, "e1")).toHaveLength(1);

    await openActionsOn(mounted.host, "e1");
    await click(find('[data-embed-action="replace"]'));
    await submitLink(VIMEO);
    expect(nodeOf(mounted.editor, "e1")).toMatchObject({ provider: "vimeo", videoId: "76979871" });
    expect(frames(mounted.host, "e1")).toHaveLength(1);
    expect(frames(mounted.host, "e1")[0]?.getAttribute("title")).toBe("Vimeo video");
    expect(frames(mounted.host, "e1")[0]?.getAttribute("src")).toContain("player.vimeo.com");
    await mounted.cleanup();
  });

  test("a YouTube Shorts link gets a 9:16 box", async () => {
    const mounted = await mount([
      paragraph("", "p1"),
      embed("e1", { provider: "youtube", videoId: ID, url: SHORT }),
    ]);
    await settle();
    const box = blockHost(mounted.host, "e1")?.querySelector<HTMLElement>(
      "[data-embed-frame]",
    )?.parentElement;
    expect(box?.getAttribute("style")).toContain("9 / 16");
    await mounted.cleanup();
  });
});

describe("embed focus and caption", () => {
  test("Caption focuses the caption field, for a block that already has a caption", async () => {
    const mounted = await mount([
      paragraph("Before", "p1"),
      embed("e1", { provider: "vimeo", videoId: "76979871", url: VIMEO, caption: "A talk" }),
    ]);
    await settle();
    await openActionsOn(mounted.host, "e1");
    await click(find('[data-embed-action="caption"]'));
    const caption = find('input[aria-label="Embed caption"]');
    expect(document.activeElement).toBe(caption);
    await mounted.cleanup();
  });
});

describe("embed actions", () => {
  test("one click on the card, outside the frame, opens the actions, and align sets the alignment", async () => {
    const mounted = await mount([
      paragraph("Before", "p1"),
      embed("e1", { provider: "vimeo", videoId: "76979871", url: VIMEO }),
    ]);
    await settle();
    await openActionsOn(mounted.host, "e1");
    expect(find("[data-embed-actions]")?.getAttribute("aria-label")).toBe("Embed actions");
    expect(mediaActionsBlockId(mounted.editor)).toBe("e1");

    await click(find('[data-embed-align="left"]'));
    expect(field(nodeOf(mounted.editor, "e1"), "align")).toBe("left");
    await mounted.cleanup();
  });

  test("Caption opens a caption field, and Enter commits the caption", async () => {
    const mounted = await mount([
      paragraph("Before", "p1"),
      embed("e1", { provider: "vimeo", videoId: "76979871", url: VIMEO }),
    ]);
    await settle();
    await openActionsOn(mounted.host, "e1");
    await click(find('[data-embed-action="caption"]'));
    const caption = blockHost(mounted.host, "e1")?.querySelector<HTMLInputElement>(
      'input[aria-label="Embed caption"]',
    );
    if (caption === null || caption === undefined) {
      throw new Error("Missing the caption field.");
    }
    await typeInto(caption, "A talk");
    await press(caption, "Enter");
    expect(field(nodeOf(mounted.editor, "e1"), "caption")).toBe("A talk");
    await mounted.cleanup();
  });

  test("Open original links the stored url in a new tab, and only when there is one", async () => {
    const mounted = await mount([
      paragraph("Before", "p1"),
      embed("e1", { provider: "youtube", videoId: ID, url: YOUTUBE }),
      embed("e2", { provider: "vimeo", videoId: "76979871" }),
    ]);
    await settle();
    await openActionsOn(mounted.host, "e1");
    const link = find('[data-embed-action="open"]');
    expect(link?.getAttribute("href")).toBe(YOUTUBE);
    expect(link?.getAttribute("target")).toBe("_blank");
    expect(link?.getAttribute("rel")).toBe("noopener noreferrer nofollow");
    await press(find('[data-embed-action="caption"]'), "Escape");

    await openActionsOn(mounted.host, "e2");
    expect(find('[data-embed-action="open"]')).toBeNull();
    await mounted.cleanup();
  });

  test("Delete removes the block, and undo brings it back", async () => {
    const mounted = await mount([
      paragraph("Before", "p1"),
      embed("e1", { provider: "vimeo", videoId: "76979871", url: VIMEO }),
    ]);
    await settle();
    await openActionsOn(mounted.host, "e1");
    const before = snapshot(mounted.editor);
    await click(find('[data-embed-action="delete"]'));
    expect(types(mounted.editor)).toEqual([KEYS.p]);
    await act(async () => {
      mounted.editor.tf.undo();
    });
    expect(snapshot(mounted.editor)).toBe(before);
    await mounted.cleanup();
  });

  test("the resize handle moves the width by keys, and Enter on the selected embed opens its actions", async () => {
    const mounted = await mount([
      paragraph("Before", "p1"),
      embed("e1", { provider: "vimeo", videoId: "76979871", url: VIMEO, width: 50 }),
    ]);
    await settle();
    await act(async () => {
      mounted.editor.tf.select(mounted.editor.api.start([1])!);
    });
    const handle =
      blockHost(mounted.host, "e1")?.querySelector('[data-embed-resize="right"]') ?? null;
    expect(handle?.getAttribute("aria-label")).toBe("Resize embed");
    await press(handle, "ArrowLeft");
    expect(field(nodeOf(mounted.editor, "e1"), "width")).toBe(45);

    await act(async () => {
      expect(onMediaUiKeyDown(mounted.editor, { key: "Enter", preventDefault() {} })).toBe(true);
    });
    expect(find("[data-embed-actions]")).not.toBeNull();
    await mounted.cleanup();
  });
});

describe("embed strip", () => {
  test("a strip under the frame opens the actions on click, and the frame itself does not", async () => {
    const mounted = await mount([
      paragraph("Before", "p1"),
      embed("e1", { provider: "vimeo", videoId: "76979871", url: VIMEO }),
    ]);
    await settle();
    const strip = blockHost(mounted.host, "e1")?.querySelector("[data-embed-strip]") ?? null;
    expect(strip).not.toBeNull();
    await click(strip);
    expect(find("[data-embed-actions]")?.getAttribute("aria-label")).toBe("Embed actions");
    await mounted.cleanup();
  });
});

describe("embed fit to width", () => {
  test("the current align is pressed with the selection tint, and Fit to width sets 100 in one undo step", async () => {
    const mounted = await mount([
      paragraph("Before", "p1"),
      embed("e1", { provider: "vimeo", videoId: "76979871", url: VIMEO, width: 60, align: "left" }),
    ]);
    await settle();
    await openActionsOn(mounted.host, "e1");
    expect(find('[data-embed-align="left"]')?.className).toContain("aria-pressed:bg-muted");
    expect(find('[aria-label="Fit to width"]')?.getAttribute("aria-pressed")).toBe("false");

    const undos = mounted.editor.history.undos.length;
    await click(find('[aria-label="Fit to width"]'));
    expect(field(nodeOf(mounted.editor, "e1"), "width")).toBe(100);
    expect(find('[aria-label="Fit to width"]')?.getAttribute("aria-pressed")).toBe("true");
    expect(mounted.editor.history.undos.length).toBe(undos + 1);

    mounted.editor.tf.undo();
    expect(field(nodeOf(mounted.editor, "e1"), "width")).toBe(60);
    await mounted.cleanup();
  });
});

describe("embed read-only", () => {
  test("read-only shows the frame, the caption and the original link, with no handles or actions", async () => {
    const mounted = await mount(
      [
        paragraph("Before", "p1"),
        embed("e1", { provider: "youtube", videoId: ID, url: YOUTUBE, caption: "Read me" }),
      ],
      { readOnly: true },
    );
    await settle();
    const host = blockHost(mounted.host, "e1");
    expect(host?.querySelector('[role="separator"]')).toBeNull();
    expect(host?.querySelector("input")).toBeNull();
    expect(host?.querySelector("figcaption")?.textContent).toBe("Read me");
    expect(host?.querySelector('a[href="' + YOUTUBE + '"]')?.textContent).toBe("Open original");
    expect(find("[data-embed-actions]")).toBeNull();
    expect(frames(mounted.host, "e1")).toHaveLength(1);
    await mounted.cleanup();
  });

  test("read-only an empty embed is plain text, not a button", async () => {
    const mounted = await mount([paragraph("Before", "p1"), embed("e1")], { readOnly: true });
    await settle();
    expect(blockHost(mounted.host, "e1")?.querySelector("button")).toBeNull();
    expect(blockHost(mounted.host, "e1")?.querySelector("[data-media-placeholder]")).toBeNull();
    await mounted.cleanup();
  });
});

describe("embed static output", () => {
  test("a YouTube embed is a watch link with its caption, and no frame or script", () => {
    const html = renderToStaticMarkup(
      <NotionLikeEditorStatic
        value={
          [
            embed("e1", { provider: "youtube", videoId: ID, url: YOUTUBE, caption: "A talk" }),
          ] as EditorValue
        }
      />,
    );
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("<script");
    expect(html).toContain(`href="https://www.youtube.com/watch?v=${ID}"`);
    expect(html).toContain("Watch on YouTube");
    expect(html).toContain("A talk");
  });

  test("a Vimeo embed links to its vimeo page, and an empty embed renders nothing", () => {
    const vimeo = renderToStaticMarkup(
      <NotionLikeEditorStatic
        value={[embed("e1", { provider: "vimeo", videoId: "76979871", url: VIMEO })] as EditorValue}
      />,
    );
    expect(vimeo).toContain('href="https://vimeo.com/76979871"');
    expect(vimeo).toContain("Watch on Vimeo");

    const empty = renderToStaticMarkup(
      <NotionLikeEditorStatic value={[embed("e1")] as EditorValue} />,
    );
    expect(empty).not.toContain("Watch on");
  });
});
