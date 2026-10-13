import { describe, expect, test } from "bun:test";
import { KEYS, type SlateEditor } from "platejs";
import { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { runEditorCommand } from "../lib/commands/editor-commands";
import { allowedChildTypes, EDITOR_ELEMENT_RULES } from "../lib/document/editor-document-schema";
import { createEditorDocument } from "../lib/document/editor-document";
import { parseEditorDocument } from "../lib/document/editor-document-validate";
import type { EditorValue } from "../lib/document/editor-value";
import { AUDIO_KEY, AUDIO_URL_REMOVED } from "../lib/features/editor-audio";
import {
  clearAudioSource,
  insertAudio,
  removeAudio,
  setAudioCaption,
  setAudioSource,
} from "../lib/features/editor-audio-commands";
import { IMAGE_KEY } from "../lib/features/editor-image";
import { mediaKindForFile } from "../lib/features/editor-media";
import {
  mediaSourceBlockId,
  onMediaUiKeyDown,
  openMediaSource,
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

const TONE = "https://cdn.example.com/tone.mp3";

function audio(id: string, extra: Record<string, unknown> = {}) {
  return mediaBlock(AUDIO_KEY, id, extra);
}

function parse(content: unknown[]) {
  return parseEditorDocument(createEditorDocument("doc", content as EditorValue));
}

function repairMessages(result: ReturnType<typeof parse>): string[] {
  return result.status === "ok" ? result.repairs.map((repair) => repair.message) : [];
}

// The anchor of an audio block carries its state: empty, loading, ready, unavailable, uploading, failed.
function audioState(host: HTMLElement, id: string): string | null {
  return (
    blockHost(host, id)?.querySelector("[data-audio-state]")?.getAttribute("data-audio-state") ??
    null
  );
}

// The player's own media element, rendered by the audio player.
function player(host: HTMLElement, id: string): HTMLAudioElement | null {
  return blockHost(host, id)?.querySelector<HTMLAudioElement>("audio") ?? null;
}

// The player is a control, so a click does not open the actions. The keyboard does: Enter on the selected
// block. The block is selected first, as the arrow keys would select it.
async function openActionsOn(editor: SlateEditor, id: string): Promise<void> {
  const index = editor.children.findIndex((node) => "id" in node && node.id === id);
  await act(async () => {
    editor.tf.select(editor.api.start([index])!);
  });
  await act(async () => {
    onMediaUiKeyDown(editor, { key: "Enter", preventDefault() {} });
  });
}

describe("audio schema", () => {
  test("a valid audio round-trips unchanged, with an audio mime type and a caption", () => {
    const content = [
      paragraph("Before", "p1"),
      audio("a1", { url: TONE, name: "tone.mp3", size: 2048, mime: "audio/mpeg", caption: "Tone" }),
      audio("a2", { url: "/blocks/notion-like-editor/audio-demo.wav", mime: "audio/wav" }),
      audio("a3"),
    ];
    const result = expectOk(parse(content));
    expect(result.repairs).toEqual([]);
    expect(result.document.content).toEqual(content);
  });

  test("an audio is a void block, and the containers that take a file take an audio", () => {
    const rule = EDITOR_ELEMENT_RULES.find((item) => item.type === AUDIO_KEY);
    expect(rule?.isVoid).toBe(true);
    expect(allowedChildTypes(KEYS.toggle)).toContain(AUDIO_KEY);
    expect(allowedChildTypes(KEYS.column)).toContain(AUDIO_KEY);
  });

  test("a mime type that is not audio/ is dropped, and the audio stays", () => {
    const result = expectOk(parse([audio("a1", { url: TONE, mime: "video/mp4" })]));
    expect(repairMessages(result).length).toBe(1);
    expect(field(result.document.content[0], "mime")).toBeUndefined();
    expect(field(result.document.content[0], "url")).toBe(TONE);
  });

  test("a caption over 500 characters is dropped with a repair", () => {
    const result = expectOk(parse([audio("a1", { url: TONE, caption: "x".repeat(501) })]));
    expect(repairMessages(result).length).toBe(1);
    expect(field(result.document.content[0], "caption")).toBeUndefined();
  });

  test("a url that is not storable is repaired to an empty placeholder", () => {
    const result = expectOk(parse([audio("a1", { url: "javascript:alert(1)" })]));
    expect(repairMessages(result)).toEqual([AUDIO_URL_REMOVED]);
    expect(field(result.document.content[0], "url")).toBeUndefined();
  });

  test("width and align are not audio fields, so they make the document unsupported", () => {
    expectUnsupported(parse([audio("a1", { url: TONE, width: 50 })]));
    expectUnsupported(parse([audio("a1", { url: TONE, align: "left" })]));
  });
});

describe("audio commands", () => {
  test("insertAudio places one empty audio block, and undo removes it", () => {
    const editor = createEditor([paragraph("Stay", "p1")]);
    editor.tf.select(caret([0, 0], 4));
    expectOneUndo(editor, () => runEditorCommand(editor, insertAudio, { id: "a1" }));
    runEditorCommand(editor, insertAudio, { id: "a1" });
    expect(types(editor)).toEqual([KEYS.p, AUDIO_KEY]);
    expect(field(nodeOf(editor, "a1"), "url")).toBeUndefined();
  });

  test("insertAudio refuses an empty, long, or used id", () => {
    const editor = createEditor([paragraph("Stay", "p1")]);
    editor.tf.select(caret([0, 0], 4));
    expect(runEditorCommand(editor, insertAudio, { id: "" })).toBe(false);
    expect(runEditorCommand(editor, insertAudio, { id: "p1" })).toBe(false);
    expect(runEditorCommand(editor, insertAudio, { id: "x".repeat(129) })).toBe(false);
    expect(types(editor)).toEqual([KEYS.p]);
  });

  test("setAudioSource stores an upload result, and one undo restores the empty block", () => {
    const editor = createEditor([paragraph("Stay", "p1"), audio("a1")]);
    const file = { url: TONE, name: "tone.mp3", size: 3, mime: "audio/mpeg" };
    expectOneUndo(editor, () => runEditorCommand(editor, setAudioSource, { id: "a1", file }));
    runEditorCommand(editor, setAudioSource, { id: "a1", file });
    expect(nodeOf(editor, "a1")).toMatchObject({ url: TONE, name: "tone.mp3", mime: "audio/mpeg" });
  });

  test("setAudioSource with only a url is a link, and only http or https is stored", () => {
    const editor = createEditor([paragraph("Stay", "p1"), audio("a1")]);
    expect(
      runEditorCommand(editor, setAudioSource, {
        id: "a1",
        file: { url: "data:audio/mp3;base64,AA" },
      }),
    ).toBe(false);
    expect(runEditorCommand(editor, setAudioSource, { id: "a1", file: { url: TONE } })).toBe(true);
    expect(nodeOf(editor, "a1")).toMatchObject({ url: TONE });
  });

  test("a command refuses a block that is not an audio", () => {
    const editor = createEditor([
      paragraph("Stay", "p1"),
      { type: IMAGE_KEY, id: "img", children: [{ text: "" }] },
    ]);
    expect(runEditorCommand(editor, setAudioSource, { id: "img", file: { url: TONE } })).toBe(
      false,
    );
    expect(runEditorCommand(editor, setAudioCaption, { id: "img", caption: "x" })).toBe(false);
  });

  test("clearAudioSource removes the url and the file fields, and keeps the caption", () => {
    const editor = createEditor([
      paragraph("Stay", "p1"),
      audio("a1", { url: TONE, name: "tone.mp3", mime: "audio/mpeg", caption: "Hi" }),
    ]);
    expect(runEditorCommand(editor, clearAudioSource, { id: "a1" })).toBe(true);
    expect(nodeOf(editor, "a1")).toMatchObject({ caption: "Hi" });
    expect(field(nodeOf(editor, "a1"), "url")).toBeUndefined();
    expect(field(nodeOf(editor, "a1"), "name")).toBeUndefined();
  });

  test("setAudioCaption stores the caption, cuts it to 500 characters, and an empty one removes it", () => {
    const editor = createEditor([paragraph("Stay", "p1"), audio("a1", { url: TONE })]);
    expectOneUndo(editor, () =>
      runEditorCommand(editor, setAudioCaption, { id: "a1", caption: "Tone" }),
    );
    runEditorCommand(editor, setAudioCaption, { id: "a1", caption: "x".repeat(600) });
    expect(String(field(nodeOf(editor, "a1"), "caption")).length).toBe(500);
    runEditorCommand(editor, setAudioCaption, { id: "a1", caption: "" });
    expect(field(nodeOf(editor, "a1"), "caption")).toBeUndefined();
  });

  test("removeAudio deletes the block in one undo step, and an empty document gets a paragraph", () => {
    const editor = createEditor([audio("a1", { url: TONE })]);
    expectOneUndo(editor, () => runEditorCommand(editor, removeAudio, { id: "a1" }));
    runEditorCommand(editor, removeAudio, { id: "a1" });
    expect(types(editor)).toEqual([KEYS.p]);
  });
});

describe("audio slash item", () => {
  test("the Audio item is offered right after Video, with its description and keywords", () => {
    const editor = createEditor([paragraph("", "target")]);
    editor.tf.select(caret([0, 0], 0));
    editor.tf.insertText("/");
    const items = slashMenuItems(editor);
    const ids = items.map((item) => item.id);
    expect(ids[ids.indexOf("video") + 1]).toBe("audio");
    expect(items.find((item) => item.id === "audio")).toMatchObject({
      label: "Audio",
      description: "Upload or embed with a link",
      group: "Advanced",
    });
    expect(items.find((item) => item.id === "audio")?.keywords).toEqual(
      expect.arrayContaining(["sound", "music", "mp3", "voice"]),
    );
  });

  test("choosing Audio inserts an empty audio block and opens its source popover", () => {
    const editor = createEditor([paragraph("", "target"), paragraph("below", "below")]);
    editor.tf.select(caret([0, 0], 0));
    editor.tf.insertText("/");
    runEditorCommand(editor, chooseSlashItem, "audio");
    const inserted = editor.children.find((node) => field(node, "type") === AUDIO_KEY);
    expect(inserted).toBeDefined();
    expect(mediaSourceBlockId(editor)).toBe(String(field(inserted, "id")));
  });

  test("the Audio item is not offered in read-only mode", () => {
    const editor = createEditor([paragraph("", "target")]);
    editor.tf.select(caret([0, 0], 0));
    editor.tf.insertText("/");
    editor.dom.readOnly = true;
    expect(slashMenuItems(editor).some((item) => item.id === "audio")).toBe(false);
  });
});

describe("audio rendering", () => {
  test("an empty audio is the Add an audio file placeholder", async () => {
    const mounted = await mount([paragraph("", "p1"), audio("a1")]);
    await settle();
    const placeholder = blockHost(mounted.host, "a1")?.querySelector("[data-media-placeholder]");
    expect(placeholder?.getAttribute("aria-label")).toBe("Add an audio file");
    expect(audioState(mounted.host, "a1")).toBe("empty");
    await mounted.cleanup();
  });

  test("a ready audio is the player alone: no name, size or icon row, and no native controls", async () => {
    const mounted = await mount([
      paragraph("", "p1"),
      audio("a1", { url: TONE, name: "tone.mp3", size: 2048, mime: "audio/mpeg" }),
    ]);
    await settle();
    const card = blockHost(mounted.host, "a1")?.querySelector("[data-audio-card]");
    expect(card?.textContent).not.toContain("tone.mp3");
    expect(card?.textContent).not.toContain("2 KB");
    expect(card?.className).not.toContain("max-w-");
    expect(card?.querySelector('[role="group"]')?.getAttribute("aria-label")).toBe("tone.mp3");
    const element = player(mounted.host, "a1");
    expect(element?.hasAttribute("controls")).toBe(false);
    expect(element?.hasAttribute("autoplay")).toBe(false);
    await mounted.cleanup();
  });

  test("there is no More button on the card", async () => {
    const mounted = await mount([
      paragraph("", "p1"),
      audio("a1", { url: TONE, name: "tone.mp3" }),
    ]);
    await settle();
    expect(blockHost(mounted.host, "a1")?.querySelector("[data-audio-more]")).toBeNull();
    await mounted.cleanup();
  });

  test("an audio that does not resolve shows Audio unavailable with its name, and Replace when editable", async () => {
    const mounted = await mount([
      paragraph("", "p1"),
      audio("a1", { url: "local-file:abc", name: "tone.mp3" }),
    ]);
    await settle();
    expect(audioState(mounted.host, "a1")).toBe("unavailable");
    const text = blockHost(mounted.host, "a1")?.textContent ?? "";
    expect(text).toContain("Audio unavailable");
    expect(text).toContain("tone.mp3");
    expect(buttonWithLabel("Replace")).not.toBeNull();
    expect(blockHost(mounted.host, "a1")?.querySelector("[data-audio-more]")).toBeNull();
    await mounted.cleanup();
  });
  test("a player that fails to load shows the unavailable row", async () => {
    const mounted = await mount([paragraph("", "p1"), audio("a1", { url: TONE })]);
    await settle();
    await fireMedia(player(mounted.host, "a1"), "error");
    expect(audioState(mounted.host, "a1")).toBe("unavailable");
    await mounted.cleanup();
  });
});

describe("audio source popover", () => {
  test("its config: the label, audio accept, and the upload label", async () => {
    const mounted = await mount([paragraph("", "p1"), audio("a1")], { adapter: namedAdapter() });
    await settle();
    await click(blockHost(mounted.host, "a1")?.querySelector("[data-media-placeholder]") ?? null);
    expect(find("[data-media-source-popover]")?.getAttribute("aria-label")).toBe(
      "Add an audio file",
    );
    expect(find("[data-media-upload]")?.textContent).toBe("Upload file");
    expect(fileInput().getAttribute("accept")).toBe("audio/*");
    await mounted.cleanup();
  });

  test("without an adapter it has only the link form, labelled for an audio file", async () => {
    const mounted = await mount([paragraph("", "p1"), audio("a1")]);
    await act(async () => {
      openMediaSource(mounted.editor, "a1");
    });
    expect(find('input[aria-label="Audio link"]')?.getAttribute("placeholder")).toBe(
      "Paste the audio link…",
    );
    expect(find("[data-media-embed-submit]")?.textContent).toBe("Embed audio");
    expect(find("[data-media-file-input]")).toBeNull();
    await mounted.cleanup();
  });
});

describe("audio upload", () => {
  test("an upload shows the uploading row, then the ready card when it finishes", async () => {
    const { adapter, calls } = controlledAdapter();
    const mounted = await mount([paragraph("", "p1"), audio("a1")], { adapter });
    await act(async () => {
      openMediaSource(mounted.editor, "a1");
    });
    await chooseFile(new File(["x"], "tone.mp3", { type: "audio/mpeg" }));
    expect(audioState(mounted.host, "a1")).toBe("uploading");
    await act(async () => {
      calls[0]?.resolve({ url: TONE, name: "tone.mp3", size: 1, mime: "audio/mpeg" });
    });
    await settle();
    expect(audioState(mounted.host, "a1")).toBe("ready");
    expect(nodeOf(mounted.editor, "a1")).toMatchObject({ url: TONE, mime: "audio/mpeg" });
    await mounted.cleanup();
  });

  test("Cancel stops the upload and leaves the empty placeholder", async () => {
    const { adapter, calls } = controlledAdapter();
    const mounted = await mount([paragraph("", "p1"), audio("a1")], { adapter });
    await act(async () => {
      openMediaSource(mounted.editor, "a1");
    });
    await chooseFile(new File(["x"], "tone.mp3", { type: "audio/mpeg" }));
    await click(buttonWithLabel("Cancel upload"));
    expect(calls[0]?.options.signal.aborted).toBe(true);
    expect(audioState(mounted.host, "a1")).toBe("empty");
    await mounted.cleanup();
  });

  test("a failure shows Retry and Remove, and Remove deletes the block", async () => {
    const { adapter, calls } = controlledAdapter();
    const mounted = await mount([paragraph("", "p1"), audio("a1")], { adapter });
    await act(async () => {
      openMediaSource(mounted.editor, "a1");
    });
    await chooseFile(new File(["x"], "tone.mp3", { type: "audio/mpeg" }));
    await act(async () => {
      calls[0]?.reject(new Error("Network down"));
    });
    await settle();
    expect(
      blockHost(mounted.host, "a1")?.querySelector('[data-media-row="failed"]'),
    ).not.toBeNull();
    await click(buttonWithLabel("Remove"));
    expect(types(mounted.editor)).toEqual([KEYS.p]);
    await mounted.cleanup();
  });

  test("the first upload into a block is not an undo step, so one undo removes the inserted block", async () => {
    const mounted = await mount([paragraph("Stay", "p1")], { adapter: namedAdapter() });
    mounted.editor.tf.select(caret([0, 0], 4));
    const undos = mounted.editor.history.undos.length;
    await act(async () => {
      pasteFiles(mounted.editor, [new File(["x"], "tone.mp3", { type: "audio/mpeg" })]);
    });
    await settle();
    expect(types(mounted.editor)).toEqual([KEYS.p, AUDIO_KEY]);
    expect(mounted.editor.history.undos.length).toBe(undos + 1);
    await act(async () => {
      mounted.editor.tf.undo();
    });
    expect(types(mounted.editor)).toEqual([KEYS.p]);
    await mounted.cleanup();
  });
});

describe("audio action popover", () => {
  test("Enter on the selected audio opens its actions", async () => {
    const mounted = await mount([paragraph("Before", "p1"), audio("a1", { url: TONE })]);
    await settle();
    await act(async () => {
      mounted.editor.tf.select(mounted.editor.api.start([1])!);
    });
    await act(async () => {
      expect(onMediaUiKeyDown(mounted.editor, { key: "Enter", preventDefault() {} })).toBe(true);
    });
    expect(find("[data-audio-actions]")).not.toBeNull();
    await mounted.cleanup();
  });

  test("a click on the player does not open the actions and does not change the selection", async () => {
    const mounted = await mount([paragraph("Before", "p1"), audio("a1", { url: TONE })]);
    await settle();
    const before = mounted.editor.selection;
    await realClick(player(mounted.host, "a1"));
    expect(find("[data-audio-actions]")).toBeNull();
    expect(mounted.editor.selection).toEqual(before);
    await mounted.cleanup();
  });

  test("the actions are Caption, Replace, Download and Delete, with no align", async () => {
    const mounted = await mount([
      paragraph("Before", "p1"),
      audio("a1", { url: TONE, name: "tone.mp3" }),
    ]);
    await settle();
    await openActionsOn(mounted.editor, "a1");
    expect(find('[data-audio-action="caption"]')).not.toBeNull();
    expect(find('[data-audio-action="replace"]')).not.toBeNull();
    expect(find('[data-audio-action="download"]')).not.toBeNull();
    expect(find('[data-audio-action="delete"]')).not.toBeNull();
    expect(find("[data-audio-align]")).toBeNull();
    await mounted.cleanup();
  });

  test("Caption opens a caption field, and Enter commits the caption", async () => {
    const mounted = await mount([paragraph("Before", "p1"), audio("a1", { url: TONE })]);
    await settle();
    await openActionsOn(mounted.editor, "a1");
    await click(find('[data-audio-action="caption"]'));
    const input = find('input[aria-label="Audio caption"]');
    if (!(input instanceof HTMLInputElement)) {
      throw new Error("Missing the caption field.");
    }
    await typeInto(input, "Short tone");
    await press(input, "Enter");
    expect(field(nodeOf(mounted.editor, "a1"), "caption")).toBe("Short tone");
    await mounted.cleanup();
  });

  test("Replace opens the source popover for the same block", async () => {
    const mounted = await mount([paragraph("Before", "p1"), audio("a1", { url: TONE })]);
    await settle();
    await openActionsOn(mounted.editor, "a1");
    await click(find('[data-audio-action="replace"]'));
    expect(mediaSourceBlockId(mounted.editor)).toBe("a1");
    expect(find("[data-media-source-popover]")?.getAttribute("aria-label")).toBe(
      "Add an audio file",
    );
    await mounted.cleanup();
  });

  test("Download links the url with the file name", async () => {
    const mounted = await mount([
      paragraph("Before", "p1"),
      audio("a1", { url: TONE, name: "tone.mp3" }),
    ]);
    await settle();
    await openActionsOn(mounted.editor, "a1");
    const download = find('[data-audio-action="download"]');
    expect(download?.getAttribute("href")).toBe(TONE);
    expect(download?.getAttribute("download")).toBe("tone.mp3");
    expect(download?.getAttribute("target")).toBe("_blank");
    await mounted.cleanup();
  });

  test("Delete removes the block, and undo brings it back", async () => {
    const mounted = await mount([paragraph("Before", "p1"), audio("a1", { url: TONE })]);
    await settle();
    await openActionsOn(mounted.editor, "a1");
    const before = snapshot(mounted.editor);
    await click(find('[data-audio-action="delete"]'));
    expect(types(mounted.editor)).toEqual([KEYS.p]);
    await act(async () => {
      mounted.editor.tf.undo();
    });
    expect(snapshot(mounted.editor)).toBe(before);
    await mounted.cleanup();
  });
});

describe("audio keys inside the player", () => {
  test("Space and Mod+B pressed on the player do not reach the editor", async () => {
    const mounted = await mount([paragraph("Hello", "p1"), audio("a1", { url: TONE })]);
    await settle();
    await act(async () => {
      mounted.editor.tf.select(caret([0, 0], 2));
    });
    const before = snapshot(mounted.editor);
    await press(player(mounted.host, "a1"), " ");
    await press(player(mounted.host, "a1"), "b", { metaKey: true });
    expect(snapshot(mounted.editor)).toBe(before);
    await mounted.cleanup();
  });
});

describe("audio read-only", () => {
  test("read-only shows the player and the caption, with no More button, popover or input", async () => {
    const mounted = await mount(
      [paragraph("Before", "p1"), audio("a1", { url: TONE, caption: "Read me" })],
      { readOnly: true },
    );
    await settle();
    expect(player(mounted.host, "a1")).not.toBeNull();
    expect(blockHost(mounted.host, "a1")?.querySelector("[data-audio-more]")).toBeNull();
    expect(blockHost(mounted.host, "a1")?.querySelector("input")).toBeNull();
    expect(blockHost(mounted.host, "a1")?.querySelector("figcaption")?.textContent).toBe("Read me");
    expect(find("[data-audio-actions]")).toBeNull();
    await mounted.cleanup();
  });

  test("read-only an empty audio is plain text, not a button", async () => {
    const mounted = await mount([paragraph("Before", "p1"), audio("a1")], { readOnly: true });
    await settle();
    expect(blockHost(mounted.host, "a1")?.querySelector("button")).toBeNull();
    expect(blockHost(mounted.host, "a1")?.textContent).toContain("Add an audio file");
    await mounted.cleanup();
  });
});

describe("audio static output", () => {
  test("a url the browser loads is the audio control and the caption, with no card, name or icon", () => {
    const html = renderToStaticMarkup(
      <NotionLikeEditorStatic
        value={
          [
            audio("a1", {
              url: "/blocks/notion-like-editor/audio-demo.wav",
              name: "audio-demo.wav",
              size: 8044,
              mime: "audio/wav",
              caption: "A tone",
            }),
          ] as EditorValue
        }
      />,
    );
    expect(html).toContain("<audio");
    expect(html).toContain('src="/blocks/notion-like-editor/audio-demo.wav"');
    expect(html).not.toMatch(/>audio-demo\.wav</);
    expect(html).not.toContain("<svg");
    expect(html).toContain("A tone");
  });

  test("a url the browser cannot load is the unavailable row with the name, and no player", () => {
    const html = renderToStaticMarkup(
      <NotionLikeEditorStatic
        value={[audio("a1", { url: "local-file:abc", name: "tone.mp3" })] as EditorValue}
      />,
    );
    expect(html).not.toContain("<audio");
    expect(html).toContain("Audio unavailable");
    expect(html).toContain("tone.mp3");
  });
});

describe("audio kind routing", () => {
  test("an audio file routes to the audio kind", () => {
    expect(mediaKindForFile({ type: "audio/mpeg" })).toBe("audio");
    expect(mediaKindForFile({ type: "audio/wav" })).toBe("audio");
  });
});
