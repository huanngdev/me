import { describe, expect, test } from "bun:test";
import { KEYS } from "platejs";
import { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { runEditorCommand } from "../lib/commands/editor-commands";
import { allowedChildTypes, EDITOR_ELEMENT_RULES } from "../lib/document/editor-document-schema";
import { createEditorDocument } from "../lib/document/editor-document";
import { parseEditorDocument } from "../lib/document/editor-document-validate";
import type { EditorValue } from "../lib/document/editor-value";
import { IMAGE_KEY } from "../lib/features/editor-image";
import { FILE_KEY } from "../lib/features/editor-file";
import { AUDIO_KEY } from "../lib/features/editor-audio";
import { mediaKindForFile } from "../lib/features/editor-media";
import { MEDIA_WIDTH_MAX, MEDIA_WIDTH_MIN } from "../lib/features/editor-media-layout";
import { VIDEO_KEY, VIDEO_URL_REMOVED } from "../lib/features/editor-video";
import {
  clearVideoSource,
  insertVideo,
  removeVideo,
  setVideoAlign,
  setVideoCaption,
  setVideoSource,
  setVideoWidth,
} from "../lib/features/editor-video-commands";
import { pasteRepairsOf } from "../lib/paste/editor-paste";
import {
  mediaActionsBlockId,
  mediaSourceBlockId,
  onMediaUiKeyDown,
  openMediaSource,
  selectedMediaId,
} from "../lib/plugins/editor-media-ui";
import { chooseSlashItem, slashMenuItems } from "../lib/plugins/editor-slash";
import { NotionLikeEditorStatic } from "../notion-like-editor-static";
import { caret, createEditor, expectOk, expectUnsupported, field } from "./test-utils";
import {
  blockHost,
  buttonWithLabel,
  chooseFile,
  click,
  controlledAdapter,
  expectOneUndo,
  find,
  fireMedia,
  fileInput,
  mediaBlock,
  mount,
  namedAdapter,
  nodeOf,
  paragraph,
  pasteFiles,
  press,
  realClick,
  settle,
  snapshot,
  typeInto,
  types,
} from "./media-block-helpers";

const CLIP = "https://cdn.example.com/clip.mp4";

function video(id: string, extra: Record<string, unknown> = {}) {
  return mediaBlock(VIDEO_KEY, id, extra);
}

function parse(content: unknown[]) {
  return parseEditorDocument(createEditorDocument("doc", content as EditorValue));
}

function repairMessages(result: ReturnType<typeof parse>): string[] {
  return result.status === "ok" ? result.repairs.map((repair) => repair.message) : [];
}

// The anchor of a video block carries its state: empty, loading, ready, unavailable, uploading, failed.
function videoState(host: HTMLElement, id: string): string | null {
  return (
    blockHost(host, id)?.querySelector("[data-video-state]")?.getAttribute("data-video-state") ??
    null
  );
}

function player(host: HTMLElement, id: string): HTMLVideoElement | null {
  return blockHost(host, id)?.querySelector<HTMLVideoElement>("[data-video-player]") ?? null;
}

// A click on the card, outside the player, opens the actions.
async function openActionsOn(host: HTMLElement, id: string): Promise<void> {
  await click(blockHost(host, id)?.querySelector("[data-video-card]") ?? null);
}

describe("video schema", () => {
  test("a valid video round-trips unchanged, with its layout and a video mime type", () => {
    const content = [
      paragraph("Before", "p1"),
      video("v1", {
        url: CLIP,
        name: "clip.mp4",
        size: 2048,
        mime: "video/mp4",
        width: 60,
        align: "right",
        caption: "A clip",
      }),
      video("v2", { url: "/blocks/notion-like-editor/video-demo.webm", mime: "video/webm" }),
      video("v3"),
    ];
    const result = expectOk(parse(content));
    expect(result.repairs).toEqual([]);
    expect(result.document.content).toEqual(content);
  });

  test("a video is a void block, and the containers that take a file take a video", () => {
    const rule = EDITOR_ELEMENT_RULES.find((item) => item.type === VIDEO_KEY);
    expect(rule?.isVoid).toBe(true);
    expect(allowedChildTypes(KEYS.toggle)).toContain(VIDEO_KEY);
    expect(allowedChildTypes(KEYS.column)).toContain(VIDEO_KEY);
  });

  test("a width outside 10 to 100, or an unknown align, is dropped with a repair", () => {
    const result = expectOk(
      parse([video("v1", { url: CLIP, width: 5, align: "justify", mime: "video/mp4" })]),
    );
    expect(repairMessages(result).length).toBe(2);
    expect(field(result.document.content[0], "width")).toBeUndefined();
    expect(field(result.document.content[0], "align")).toBeUndefined();
    expect(field(result.document.content[0], "url")).toBe(CLIP);
  });

  test("a mime type that is not a video type is dropped, and the video stays", () => {
    const result = expectOk(parse([video("v1", { url: CLIP, mime: "audio/wav" })]));
    expect(repairMessages(result).length).toBe(1);
    expect(field(result.document.content[0], "mime")).toBeUndefined();
    expect(field(result.document.content[0], "url")).toBe(CLIP);
  });

  test("a caption over 500 characters is dropped with a repair", () => {
    const result = expectOk(parse([video("v1", { url: CLIP, caption: "x".repeat(501) })]));
    expect(repairMessages(result).length).toBe(1);
    expect(field(result.document.content[0], "caption")).toBeUndefined();
  });

  test("a url that is not storable is repaired to an empty placeholder", () => {
    const result = expectOk(parse([video("v1", { url: "javascript:alert(1)" })]));
    expect(repairMessages(result)).toEqual([VIDEO_URL_REMOVED]);
    expect(field(result.document.content[0], "url")).toBeUndefined();
  });

  test("a blob url is repaired to an empty placeholder, since it only exists in one tab", () => {
    const result = expectOk(parse([video("v1", { url: "blob:https://x.example/abc" })]));
    expect(repairMessages(result)).toEqual([VIDEO_URL_REMOVED]);
  });

  test("a field the video does not have, such as mimeType, makes the document unsupported", () => {
    const result = expectUnsupported(parse([video("v1", { url: CLIP, mimeType: "video/mp4" })]));
    expect(result.issues.some((issue) => issue.message.includes("mimeType"))).toBe(true);
  });
});

describe("video commands", () => {
  test("insertVideo places one empty video block, and undo removes it", () => {
    const editor = createEditor([paragraph("Stay", "p1")]);
    editor.tf.select(caret([0, 0], 4));
    expectOneUndo(editor, () => runEditorCommand(editor, insertVideo, { id: "v1" }));
    runEditorCommand(editor, insertVideo, { id: "v1" });
    expect(types(editor)).toEqual([KEYS.p, VIDEO_KEY]);
    expect(field(nodeOf(editor, "v1"), "url")).toBeUndefined();
  });

  test("insertVideo refuses an empty, long, or used id", () => {
    const editor = createEditor([paragraph("Stay", "p1")]);
    editor.tf.select(caret([0, 0], 4));
    expect(runEditorCommand(editor, insertVideo, { id: "" })).toBe(false);
    expect(runEditorCommand(editor, insertVideo, { id: "p1" })).toBe(false);
    expect(runEditorCommand(editor, insertVideo, { id: "x".repeat(129) })).toBe(false);
    expect(types(editor)).toEqual([KEYS.p]);
  });

  test("setVideoSource stores an upload result with its mime type, and one undo restores the empty block", () => {
    const editor = createEditor([paragraph("Stay", "p1"), video("v1")]);
    expectOneUndo(editor, () =>
      runEditorCommand(editor, setVideoSource, {
        id: "v1",
        file: { url: CLIP, name: "clip.mp4", size: 3, mime: "video/mp4" },
      }),
    );
    runEditorCommand(editor, setVideoSource, {
      id: "v1",
      file: { url: CLIP, name: "clip.mp4", size: 3, mime: "video/mp4" },
    });
    expect(nodeOf(editor, "v1")).toMatchObject({ url: CLIP, name: "clip.mp4", mime: "video/mp4" });
  });

  test("setVideoSource with only a url is a link, and only http or https is stored", () => {
    const editor = createEditor([paragraph("Stay", "p1"), video("v1")]);
    expect(
      runEditorCommand(editor, setVideoSource, { id: "v1", file: { url: "javascript:x" } }),
    ).toBe(false);
    expect(
      runEditorCommand(editor, setVideoSource, {
        id: "v1",
        file: { url: "ftp://x.example/a.mp4" },
      }),
    ).toBe(false);
    expect(runEditorCommand(editor, setVideoSource, { id: "v1", file: { url: CLIP } })).toBe(true);
    expect(nodeOf(editor, "v1")).toMatchObject({ url: CLIP });
    expect(field(nodeOf(editor, "v1"), "name")).toBeUndefined();
  });

  test("a video link does not parse YouTube or Vimeo: the page url is stored as the link", () => {
    const editor = createEditor([paragraph("Stay", "p1"), video("v1")]);
    const page = "https://www.youtube.com/watch?v=jNQXAC9IVRw";
    expect(runEditorCommand(editor, setVideoSource, { id: "v1", file: { url: page } })).toBe(true);
    expect(nodeOf(editor, "v1")).toMatchObject({ url: page });
  });

  test("a mime type that is not video/ is dropped from an upload result", () => {
    const editor = createEditor([paragraph("Stay", "p1"), video("v1")]);
    runEditorCommand(editor, setVideoSource, {
      id: "v1",
      file: { url: CLIP, mime: "application/octet-stream" },
    });
    expect(field(nodeOf(editor, "v1"), "mime")).toBeUndefined();
  });

  test("a command refuses a block that is not a video", () => {
    const editor = createEditor([
      paragraph("Stay", "p1"),
      { type: IMAGE_KEY, id: "img", children: [{ text: "" }] },
    ]);
    expect(runEditorCommand(editor, setVideoSource, { id: "img", file: { url: CLIP } })).toBe(
      false,
    );
    expect(runEditorCommand(editor, setVideoCaption, { id: "img", caption: "x" })).toBe(false);
  });

  test("clearVideoSource removes the url and the file fields, and keeps the layout", () => {
    const editor = createEditor([
      paragraph("Stay", "p1"),
      video("v1", {
        url: CLIP,
        name: "clip.mp4",
        mime: "video/mp4",
        width: 40,
        align: "left",
        caption: "Hi",
      }),
    ]);
    expect(runEditorCommand(editor, clearVideoSource, { id: "v1" })).toBe(true);
    expect(nodeOf(editor, "v1")).toMatchObject({ width: 40, align: "left", caption: "Hi" });
    expect(field(nodeOf(editor, "v1"), "url")).toBeUndefined();
    expect(field(nodeOf(editor, "v1"), "mime")).toBeUndefined();
  });

  test("setVideoCaption stores the caption, cuts it to 500 characters, and an empty one removes it", () => {
    const editor = createEditor([paragraph("Stay", "p1"), video("v1", { url: CLIP })]);
    expectOneUndo(editor, () =>
      runEditorCommand(editor, setVideoCaption, { id: "v1", caption: "Clip" }),
    );
    runEditorCommand(editor, setVideoCaption, { id: "v1", caption: "x".repeat(600) });
    expect(String(field(nodeOf(editor, "v1"), "caption")).length).toBe(500);
    runEditorCommand(editor, setVideoCaption, { id: "v1", caption: "" });
    expect(field(nodeOf(editor, "v1"), "caption")).toBeUndefined();
  });

  test("setVideoWidth accepts 10 to 100, refuses anything else, and null removes the width", () => {
    const editor = createEditor([paragraph("Stay", "p1"), video("v1", { url: CLIP })]);
    expect(runEditorCommand(editor, setVideoWidth, { id: "v1", width: MEDIA_WIDTH_MIN - 1 })).toBe(
      false,
    );
    expect(runEditorCommand(editor, setVideoWidth, { id: "v1", width: MEDIA_WIDTH_MAX + 1 })).toBe(
      false,
    );
    expectOneUndo(editor, () => runEditorCommand(editor, setVideoWidth, { id: "v1", width: 50 }));
    runEditorCommand(editor, setVideoWidth, { id: "v1", width: 50 });
    expect(field(nodeOf(editor, "v1"), "width")).toBe(50);
    runEditorCommand(editor, setVideoWidth, { id: "v1", width: null });
    expect(field(nodeOf(editor, "v1"), "width")).toBeUndefined();
  });

  test("setVideoAlign stores left, center or right, and refuses a block that is not a video", () => {
    const editor = createEditor([
      paragraph("Stay", "p1"),
      video("v1", { url: CLIP }),
      { type: IMAGE_KEY, id: "img", children: [{ text: "" }] },
    ]);
    expect(runEditorCommand(editor, setVideoAlign, { id: "img", align: "left" })).toBe(false);
    runEditorCommand(editor, setVideoAlign, { id: "v1", align: "right" });
    expect(field(nodeOf(editor, "v1"), "align")).toBe("right");
  });

  test("removeVideo deletes the block in one undo step, and an empty document gets a paragraph", () => {
    const editor = createEditor([video("v1", { url: CLIP })]);
    expectOneUndo(editor, () => runEditorCommand(editor, removeVideo, { id: "v1" }));
    runEditorCommand(editor, removeVideo, { id: "v1" });
    expect(types(editor)).toEqual([KEYS.p]);
  });
});

describe("video slash item", () => {
  test("the Video item is offered right after File, with its description and keywords", () => {
    const editor = createEditor([paragraph("", "target")]);
    editor.tf.select(caret([0, 0], 0));
    editor.tf.insertText("/");
    const items = slashMenuItems(editor);
    const ids = items.map((item) => item.id);
    expect(ids[ids.indexOf("file") + 1]).toBe("video");
    expect(items.find((item) => item.id === "video")).toMatchObject({
      label: "Video",
      description: "Upload or embed with a link",
      group: "Advanced",
    });
    expect(items.find((item) => item.id === "video")?.keywords).toEqual(
      expect.arrayContaining(["movie", "mp4", "clip"]),
    );
  });

  test("choosing Video inserts an empty video block and opens its source popover", () => {
    const editor = createEditor([paragraph("", "target"), paragraph("below", "below")]);
    editor.tf.select(caret([0, 0], 0));
    editor.tf.insertText("/");
    runEditorCommand(editor, chooseSlashItem, "video");
    const inserted = editor.children.find((node) => field(node, "type") === VIDEO_KEY);
    expect(inserted).toBeDefined();
    expect(mediaSourceBlockId(editor)).toBe(String(field(inserted, "id")));
    expect(field(inserted, "url")).toBeUndefined();
  });

  test("the Video item is not offered in read-only mode", () => {
    const editor = createEditor([paragraph("", "target")]);
    editor.tf.select(caret([0, 0], 0));
    editor.tf.insertText("/");
    editor.dom.readOnly = true;
    expect(slashMenuItems(editor).some((item) => item.id === "video")).toBe(false);
  });
});

describe("video rendering", () => {
  test("an empty video is the Add a video placeholder with the video icon", async () => {
    const mounted = await mount([paragraph("", "p1"), video("v1")]);
    await settle();
    const placeholder = blockHost(mounted.host, "v1")?.querySelector("[data-media-placeholder]");
    expect(placeholder?.getAttribute("aria-label")).toBe("Add a video");
    expect(placeholder?.textContent).toContain("Add a video");
    expect(videoState(mounted.host, "v1")).toBe("empty");
    await mounted.cleanup();
  });

  test("a ready video is a player with controls, metadata preload and playsinline, and no autoplay", async () => {
    const mounted = await mount([
      paragraph("", "p1"),
      video("v1", { url: CLIP, caption: "A clip" }),
    ]);
    await settle();
    const element = player(mounted.host, "v1");
    expect(element).not.toBeNull();
    expect(element?.hasAttribute("controls")).toBe(true);
    expect(element?.getAttribute("preload")).toBe("metadata");
    expect(element?.hasAttribute("playsinline")).toBe(true);
    expect(element?.hasAttribute("autoplay")).toBe(false);
    expect(element?.hasAttribute("controlslist")).toBe(false);
    expect(element?.getAttribute("src")).toBe(CLIP);
    expect(element?.className).toContain("aspect-video");
    const caption = blockHost(mounted.host, "v1")?.querySelector(
      'input[aria-label="Video caption"]',
    );
    expect(caption instanceof HTMLInputElement ? caption.value : undefined).toBe("A clip");
    await mounted.cleanup();
  });

  test("once the metadata loads the player drops the aspect placeholder", async () => {
    const mounted = await mount([paragraph("", "p1"), video("v1", { url: CLIP })]);
    await settle();
    await fireMedia(player(mounted.host, "v1"), "loadedmetadata");
    expect(player(mounted.host, "v1")?.className).not.toContain("aspect-video");
    await mounted.cleanup();
  });

  test("there is no More button, in an editable editor or read-only", async () => {
    const mounted = await mount([paragraph("", "p1"), video("v1", { url: CLIP })]);
    await settle();
    expect(blockHost(mounted.host, "v1")?.querySelector("[data-video-more]")).toBeNull();
    await mounted.cleanup();
  });

  test("a width sets the box and the alignment class, as the image does", async () => {
    const mounted = await mount([
      paragraph("", "p1"),
      video("v1", { url: CLIP, width: 40, align: "left" }),
    ]);
    await settle();
    const figure = blockHost(mounted.host, "v1")?.querySelector("figure");
    expect(figure?.getAttribute("style")).toContain("width: 40%");
    expect(figure?.className).toContain("mr-auto");
    await mounted.cleanup();
  });

  test("a video that does not resolve shows Video unavailable with its name, and Replace when editable", async () => {
    const mounted = await mount([
      paragraph("", "p1"),
      video("v1", { url: "local-file:abc", name: "clip.mp4" }),
    ]);
    await settle();
    expect(videoState(mounted.host, "v1")).toBe("unavailable");
    const text = blockHost(mounted.host, "v1")?.textContent ?? "";
    expect(text).toContain("Video unavailable");
    expect(text).toContain("clip.mp4");
    expect(buttonWithLabel("Replace")).not.toBeNull();
    await mounted.cleanup();
  });

  test("a player that fails to load shows the unavailable row", async () => {
    const mounted = await mount([paragraph("", "p1"), video("v1", { url: CLIP })]);
    await settle();
    await fireMedia(player(mounted.host, "v1"), "error");
    expect(videoState(mounted.host, "v1")).toBe("unavailable");
    await mounted.cleanup();
  });
});

describe("video source popover", () => {
  test("its config: the label, video accept, and the link words", async () => {
    const mounted = await mount([paragraph("", "p1"), video("v1")], { adapter: namedAdapter() });
    await settle();
    await click(blockHost(mounted.host, "v1")?.querySelector("[data-media-placeholder]") ?? null);
    const popover = find("[data-media-source-popover]");
    expect(popover?.getAttribute("aria-label")).toBe("Add a video");
    expect(find("[data-media-upload]")?.textContent).toBe("Upload file");
    expect(fileInput().getAttribute("accept")).toBe("video/*");
    await mounted.cleanup();
  });

  test("without an adapter it has only the link form, labelled for a video", async () => {
    const mounted = await mount([paragraph("", "p1"), video("v1")]);
    await act(async () => {
      openMediaSource(mounted.editor, "v1");
    });
    expect(find("[data-media-source-popover]")?.getAttribute("aria-label")).toBe("Add a video");
    expect(find("[data-media-file-input]")).toBeNull();
    expect(find('input[aria-label="Video link"]')?.getAttribute("placeholder")).toBe(
      "Paste the video link…",
    );
    expect(find("[data-media-embed-submit]")?.textContent).toBe("Embed video");
    await mounted.cleanup();
  });

  test("an embed link is stored, and a link that is not http or https is refused", async () => {
    const mounted = await mount([paragraph("", "p1"), video("v1")]);
    await act(async () => {
      openMediaSource(mounted.editor, "v1");
    });
    const link = find('input[aria-label="Video link"]');
    if (!(link instanceof HTMLInputElement)) {
      throw new Error("Missing the video link field.");
    }
    await typeInto(link, "ftp://x.example/clip.mp4");
    await click(find("[data-media-embed-submit]"));
    expect(field(nodeOf(mounted.editor, "v1"), "url")).toBeUndefined();
    await typeInto(link, CLIP);
    await click(find("[data-media-embed-submit]"));
    expect(field(nodeOf(mounted.editor, "v1"), "url")).toBe(CLIP);
    await mounted.cleanup();
  });
});

describe("video upload", () => {
  test("an upload shows the uploading row with the video icon, then the ready player", async () => {
    const { adapter, calls } = controlledAdapter();
    const mounted = await mount([paragraph("", "p1"), video("v1")], { adapter });
    await act(async () => {
      openMediaSource(mounted.editor, "v1");
    });
    await chooseFile(new File(["x"], "clip.mp4", { type: "video/mp4" }));
    expect(calls.length).toBe(1);
    expect(videoState(mounted.host, "v1")).toBe("uploading");
    expect(
      blockHost(mounted.host, "v1")?.querySelector('[data-media-row="uploading"]'),
    ).not.toBeNull();

    await act(async () => {
      calls[0]?.resolve({
        url: "https://cdn.example.com/clip.mp4",
        name: "clip.mp4",
        size: 1,
        mime: "video/mp4",
      });
    });
    await settle();
    expect(videoState(mounted.host, "v1")).toBe("ready");
    expect(nodeOf(mounted.editor, "v1")).toMatchObject({
      url: "https://cdn.example.com/clip.mp4",
      mime: "video/mp4",
    });
    await mounted.cleanup();
  });

  test("Cancel stops the upload and leaves the empty placeholder", async () => {
    const { adapter, calls } = controlledAdapter();
    const mounted = await mount([paragraph("", "p1"), video("v1")], { adapter });
    await act(async () => {
      openMediaSource(mounted.editor, "v1");
    });
    await chooseFile(new File(["x"], "clip.mp4", { type: "video/mp4" }));
    await click(buttonWithLabel("Cancel upload"));
    expect(calls[0]?.options.signal.aborted).toBe(true);
    expect(videoState(mounted.host, "v1")).toBe("empty");
    await mounted.cleanup();
  });

  test("a failure shows Retry and Remove, Retry uploads again, and Remove deletes the block", async () => {
    const { adapter, calls } = controlledAdapter();
    const mounted = await mount([paragraph("", "p1"), video("v1")], { adapter });
    await act(async () => {
      openMediaSource(mounted.editor, "v1");
    });
    await chooseFile(new File(["x"], "clip.mp4", { type: "video/mp4" }));
    await act(async () => {
      calls[0]?.reject(new Error("Network down"));
    });
    await settle();
    expect(
      blockHost(mounted.host, "v1")?.querySelector('[data-media-row="failed"]'),
    ).not.toBeNull();
    await click(buttonWithLabel("Retry"));
    await settle();
    expect(calls.length).toBe(2);
    await act(async () => {
      calls[1]?.reject(new Error("Network down"));
    });
    await settle();
    await click(buttonWithLabel("Remove"));
    expect(types(mounted.editor)).toEqual([KEYS.p]);
    await mounted.cleanup();
  });

  test("the first upload into a block is not an undo step, so one undo removes the inserted block", async () => {
    const mounted = await mount([paragraph("Stay", "p1")], { adapter: namedAdapter() });
    mounted.editor.tf.select(caret([0, 0], 4));
    const undos = mounted.editor.history.undos.length;
    await act(async () => {
      pasteFiles(mounted.editor, [new File(["x"], "clip.mp4", { type: "video/mp4" })]);
    });
    await settle();
    expect(types(mounted.editor)).toEqual([KEYS.p, VIDEO_KEY]);
    expect(mounted.editor.history.undos.length).toBe(undos + 1);
    await act(async () => {
      mounted.editor.tf.undo();
    });
    expect(types(mounted.editor)).toEqual([KEYS.p]);
    await mounted.cleanup();
  });
});

describe("video action popover", () => {
  test("one click on the block outside the player, from an editor that never had focus, selects it and opens the actions", async () => {
    const mounted = await mount([paragraph("Before", "p1"), video("v1", { url: CLIP })]);
    await settle();
    expect(mounted.editor.selection).toBeNull();
    await openActionsOn(mounted.host, "v1");
    expect(find("[data-video-actions]")?.getAttribute("aria-label")).toBe("Video actions");
    expect(mounted.editor.selection).not.toBeNull();
    expect(selectedMediaId(mounted.editor)).toBe("v1");
    expect(mediaActionsBlockId(mounted.editor)).toBe("v1");
    await mounted.cleanup();
  });

  test("Enter on the selected video opens its actions", async () => {
    const mounted = await mount([paragraph("Before", "p1"), video("v1", { url: CLIP })]);
    await settle();
    await act(async () => {
      mounted.editor.tf.select(mounted.editor.api.start([1])!);
    });
    await act(async () => {
      expect(onMediaUiKeyDown(mounted.editor, { key: "Enter", preventDefault() {} })).toBe(true);
    });
    expect(find("[data-video-actions]")).not.toBeNull();
    await mounted.cleanup();
  });

  test("a click on the player does not open the actions and does not change the selection", async () => {
    const mounted = await mount([paragraph("Before", "p1"), video("v1", { url: CLIP })]);
    await settle();
    const before = mounted.editor.selection;
    await realClick(player(mounted.host, "v1"));
    expect(find("[data-video-actions]")).toBeNull();
    expect(mounted.editor.selection).toEqual(before);
    await mounted.cleanup();
  });

  test("align buttons set left, center and right, and show the current one as pressed", async () => {
    const mounted = await mount([
      paragraph("Before", "p1"),
      video("v1", { url: CLIP, align: "left" }),
    ]);
    await settle();
    await openActionsOn(mounted.host, "v1");
    expect(find('[data-video-align="left"]')?.getAttribute("aria-pressed")).toBe("true");
    await click(find('[data-video-align="right"]'));
    expect(field(nodeOf(mounted.editor, "v1"), "align")).toBe("right");
    expect(find('[data-video-align="right"]')?.getAttribute("aria-pressed")).toBe("true");
    await mounted.cleanup();
  });

  test("Caption opens a caption field, and Enter commits the caption", async () => {
    const mounted = await mount([paragraph("Before", "p1"), video("v1", { url: CLIP })]);
    await settle();
    await openActionsOn(mounted.host, "v1");
    await click(find('[data-video-action="caption"]'));
    const input = find('input[aria-label="Video caption"]');
    if (!(input instanceof HTMLInputElement)) {
      throw new Error("Missing the caption field.");
    }
    expect(input.getAttribute("placeholder")).toBe("Write a caption…");
    await typeInto(input, "Opening scene");
    await press(input, "Enter");
    expect(field(nodeOf(mounted.editor, "v1"), "caption")).toBe("Opening scene");
    await mounted.cleanup();
  });

  test("Replace opens the source popover for the same block", async () => {
    const mounted = await mount([paragraph("Before", "p1"), video("v1", { url: CLIP })]);
    await settle();
    await openActionsOn(mounted.host, "v1");
    await click(find('[data-video-action="replace"]'));
    expect(mediaSourceBlockId(mounted.editor)).toBe("v1");
    expect(find("[data-media-source-popover]")?.getAttribute("aria-label")).toBe("Add a video");
    await mounted.cleanup();
  });

  test("Download links the url with the file name for a blob, and opens an http file in a new tab", async () => {
    const mounted = await mount([
      paragraph("Before", "p1"),
      video("v1", { url: CLIP, name: "clip.mp4" }),
    ]);
    await settle();
    await openActionsOn(mounted.host, "v1");
    const download = find('[data-video-action="download"]');
    expect(download?.getAttribute("href")).toBe(CLIP);
    expect(download?.getAttribute("download")).toBe("clip.mp4");
    expect(download?.getAttribute("target")).toBe("_blank");
    expect(download?.getAttribute("rel")).toBe("noopener noreferrer nofollow");
    await mounted.cleanup();
  });

  test("Delete removes the block, and undo brings it back", async () => {
    const mounted = await mount([paragraph("Before", "p1"), video("v1", { url: CLIP })]);
    await settle();
    await openActionsOn(mounted.host, "v1");
    const before = snapshot(mounted.editor);
    await click(find('[data-video-action="delete"]'));
    expect(types(mounted.editor)).toEqual([KEYS.p]);
    await act(async () => {
      mounted.editor.tf.undo();
    });
    expect(snapshot(mounted.editor)).toBe(before);
    await mounted.cleanup();
  });
});

describe("video fit to width", () => {
  test("the current align is pressed with the selection tint, and Fit to width sets 100 in one undo step", async () => {
    const mounted = await mount([
      paragraph("Before", "p1"),
      video("v1", { url: CLIP, width: 60, align: "left" }),
    ]);
    await settle();
    await openActionsOn(mounted.host, "v1");
    expect(find('[data-video-align="left"]')?.className).toContain("aria-pressed:bg-muted");
    expect(find('[aria-label="Fit to width"]')?.getAttribute("aria-pressed")).toBe("false");

    const undos = mounted.editor.history.undos.length;
    await click(find('[aria-label="Fit to width"]'));
    expect(field(nodeOf(mounted.editor, "v1"), "width")).toBe(100);
    expect(find('[aria-label="Fit to width"]')?.getAttribute("aria-pressed")).toBe("true");
    expect(mounted.editor.history.undos.length).toBe(undos + 1);

    mounted.editor.tf.undo();
    expect(field(nodeOf(mounted.editor, "v1"), "width")).toBe(60);
    await mounted.cleanup();
  });
});

describe("video resize", () => {
  test("the resize handles are shown while the block is selected, with ARIA values", async () => {
    const mounted = await mount([paragraph("Before", "p1"), video("v1", { url: CLIP, width: 60 })]);
    await settle();
    await fireMedia(player(mounted.host, "v1"), "loadedmetadata");
    await act(async () => {
      mounted.editor.tf.select(mounted.editor.api.start([1])!);
    });
    const right = blockHost(mounted.host, "v1")?.querySelector('[data-video-resize="right"]');
    expect(right?.getAttribute("role")).toBe("separator");
    expect(right?.getAttribute("aria-label")).toBe("Resize video");
    expect(right?.getAttribute("aria-valuenow")).toBe("60");
    expect(right?.getAttribute("aria-valuemin")).toBe(String(MEDIA_WIDTH_MIN));
    expect(right?.getAttribute("aria-valuemax")).toBe(String(MEDIA_WIDTH_MAX));
    await mounted.cleanup();
  });

  test("arrow keys resize by 5, Shift by 1, and Home and End set the limits", async () => {
    const mounted = await mount([paragraph("Before", "p1"), video("v1", { url: CLIP, width: 60 })]);
    await settle();
    await fireMedia(player(mounted.host, "v1"), "loadedmetadata");
    await act(async () => {
      mounted.editor.tf.select(mounted.editor.api.start([1])!);
    });
    const handle =
      blockHost(mounted.host, "v1")?.querySelector('[data-video-resize="right"]') ?? null;
    await press(handle, "ArrowRight");
    expect(field(nodeOf(mounted.editor, "v1"), "width")).toBe(65);
    await press(handle, "ArrowLeft", { shiftKey: true });
    expect(field(nodeOf(mounted.editor, "v1"), "width")).toBe(64);
    await press(handle, "End");
    expect(field(nodeOf(mounted.editor, "v1"), "width")).toBe(MEDIA_WIDTH_MAX);
    await press(handle, "Home");
    expect(field(nodeOf(mounted.editor, "v1"), "width")).toBe(MEDIA_WIDTH_MIN);
    await mounted.cleanup();
  });
});

describe("video keys inside the player", () => {
  test("Space and Mod+B pressed on the player do not reach the editor", async () => {
    const mounted = await mount([paragraph("Hello", "p1"), video("v1", { url: CLIP })]);
    await settle();
    await act(async () => {
      mounted.editor.tf.select(caret([0, 0], 2));
    });
    const before = snapshot(mounted.editor);
    const element = player(mounted.host, "v1");
    await press(element, " ");
    await press(element, "b", { metaKey: true });
    expect(snapshot(mounted.editor)).toBe(before);
    await mounted.cleanup();
  });

  test("Escape on the player returns focus to the editor", async () => {
    const mounted = await mount([paragraph("Hello", "p1"), video("v1", { url: CLIP })]);
    await settle();
    await press(player(mounted.host, "v1"), "Escape");
    expect(document.activeElement).toBe(mounted.host.querySelector("[data-slate-editor]"));
    await mounted.cleanup();
  });
});

describe("video read-only", () => {
  test("read-only shows the player and the caption, with no More button, popover or input", async () => {
    const mounted = await mount(
      [paragraph("Before", "p1"), video("v1", { url: CLIP, caption: "Read me" })],
      { readOnly: true },
    );
    await settle();
    expect(player(mounted.host, "v1")).not.toBeNull();
    expect(blockHost(mounted.host, "v1")?.querySelector("[data-video-more]")).toBeNull();
    expect(blockHost(mounted.host, "v1")?.querySelector("input")).toBeNull();
    expect(blockHost(mounted.host, "v1")?.querySelector("figcaption")?.textContent).toBe("Read me");
    expect(find("[data-video-actions]")).toBeNull();
    await mounted.cleanup();
  });

  test("read-only an empty video is plain text, not a button", async () => {
    const mounted = await mount([paragraph("Before", "p1"), video("v1")], { readOnly: true });
    await settle();
    expect(blockHost(mounted.host, "v1")?.querySelector("button")).toBeNull();
    expect(blockHost(mounted.host, "v1")?.querySelector("[data-media-placeholder]")).toBeNull();
    await mounted.cleanup();
  });
});

describe("video static output", () => {
  test("a url the browser loads is a player with the caption", () => {
    const html = renderToStaticMarkup(
      <NotionLikeEditorStatic
        value={
          [
            video("v1", {
              url: "/blocks/notion-like-editor/video-demo.webm",
              name: "video-demo.webm",
              mime: "video/webm",
              caption: "Clip",
            }),
          ] as EditorValue
        }
      />,
    );
    expect(html).toContain("<video");
    expect(html).toContain('src="/blocks/notion-like-editor/video-demo.webm"');
    expect(html).toContain("controls");
    expect(html).toContain("Clip");
  });

  test("a url the browser cannot load is the unavailable row with the name, and no player", () => {
    const html = renderToStaticMarkup(
      <NotionLikeEditorStatic
        value={[video("v1", { url: "local-file:abc", name: "clip.mp4" })] as EditorValue}
      />,
    );
    expect(html).not.toContain("<video");
    expect(html).toContain("Video unavailable");
    expect(html).toContain("clip.mp4");
  });
});

describe("media paste and drop with a video", () => {
  test("a png, an mp4, an mp3 and a pdf become image, video, audio and file blocks in order, as one undo step", async () => {
    const { adapter, calls } = controlledAdapter();
    const mounted = await mount([paragraph("Stay", "p1")], { adapter });
    mounted.editor.tf.select(caret([0, 0], 4));
    const undos = mounted.editor.history.undos.length;
    await act(async () => {
      pasteFiles(mounted.editor, [
        new File(["x"], "pic.png", { type: "image/png" }),
        new File(["x"], "clip.mp4", { type: "video/mp4" }),
        new File(["x"], "tone.mp3", { type: "audio/mpeg" }),
        new File(["%PDF"], "doc.pdf", { type: "application/pdf" }),
      ]);
    });
    expect(types(mounted.editor)).toEqual([KEYS.p, IMAGE_KEY, VIDEO_KEY, AUDIO_KEY, FILE_KEY]);
    expect(mounted.editor.history.undos.length).toBe(undos + 1);
    expect(pasteRepairsOf(mounted.editor)).toEqual([]);
    expect(calls.map((call) => call.file.name)).toEqual([
      "pic.png",
      "clip.mp4",
      "tone.mp3",
      "doc.pdf",
    ]);
    await mounted.cleanup();
  });

  test("the file kinds route by mime type, and any other type is a file", () => {
    expect(mediaKindForFile({ type: "video/quicktime" })).toBe("video");
    expect(mediaKindForFile({ type: "audio/wav" })).toBe("audio");
    expect(mediaKindForFile({ type: "image/png" })).toBe("image");
    expect(mediaKindForFile({ type: "application/pdf" })).toBe("file");
  });
});
