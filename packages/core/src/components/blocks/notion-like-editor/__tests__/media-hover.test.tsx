import { describe, expect, test } from "bun:test";
import { act } from "react";

import { mediaBlockClassName } from "../components/elements/media-classes";
import { AUDIO_KEY } from "../lib/features/editor-audio";
import { EMBED_KEY } from "../lib/features/editor-embed";
import { FILE_KEY } from "../lib/features/editor-file";
import { IMAGE_KEY } from "../lib/features/editor-image";
import { VIDEO_KEY } from "../lib/features/editor-video";
import {
  MEDIA_HOVER_CLOSE_MS,
  MEDIA_HOVER_OPEN_MS,
  mediaHoverBlockId,
  mediaSourceBlockId,
  openMediaHover,
  openMediaSource,
  scheduleMediaHoverClose,
} from "../lib/plugins/editor-media-ui";
import {
  blockHost,
  click,
  find,
  mediaBlock,
  mount,
  paragraph,
  settle,
  type Mounted,
} from "./media-block-helpers";

// The hover toolbar opens after a rest over a block, and closes after the pointer has left. happy-dom has
// no layout, so the hover timers ask document.elementFromPoint what is under the pointer. A test sets that
// element by hand.

const PNG = "https://cdn.example.com/a.png";
const FILE = "https://cdn.example.com/a.pdf";
const CLIP = "https://cdn.example.com/clip.mp4";
const TONE = "https://cdn.example.com/tone.mp3";
const ID = "aqz-KE-bpKQ";
const YOUTUBE = `https://www.youtube.com/watch?v=${ID}`;

let pointerTarget: Element | null = null;

function withPointer(run: () => Promise<void>): () => Promise<void> {
  return async () => {
    const previous = Object.getOwnPropertyDescriptor(document, "elementFromPoint");
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: () => pointerTarget,
    });
    try {
      await run();
    } finally {
      if (previous === undefined) {
        Reflect.deleteProperty(document, "elementFromPoint");
      } else {
        Object.defineProperty(document, "elementFromPoint", previous);
      }
      pointerTarget = null;
    }
  };
}

function enter(element: Element, buttons = 0): void {
  element.dispatchEvent(new MouseEvent("mouseenter", { buttons, clientX: 10, clientY: 10 }));
}

function leave(element: Element): void {
  element.dispatchEvent(new MouseEvent("mouseleave", { clientX: 1, clientY: 1 }));
}

async function wait(ms: number): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  });
}

function anchorOf(host: HTMLElement, id: string): HTMLElement {
  const anchor = blockHost(host, id)?.querySelector<HTMLElement>("[data-media-anchor]");
  if (anchor === null || anchor === undefined) {
    throw new Error(`No anchor for ${id}.`);
  }
  return anchor;
}

function toolbarLabel(): string | null {
  return find("[data-media-actions]")?.getAttribute("aria-label") ?? null;
}

function video(id: string) {
  return mediaBlock(VIDEO_KEY, id, { url: CLIP });
}

function mediaDocument() {
  return [
    paragraph("Before", "p1"),
    mediaBlock(IMAGE_KEY, "i1", { url: PNG }),
    mediaBlock(FILE_KEY, "f1", { url: FILE, name: "a.pdf", mime: "application/pdf" }),
    video("v1"),
    mediaBlock(AUDIO_KEY, "a1", { url: TONE, name: "tone.mp3" }),
    mediaBlock(EMBED_KEY, "e1", { provider: "youtube", videoId: ID, url: YOUTUBE }),
  ];
}

describe("media hover toolbar", () => {
  test(
    "resting on each media block opens its toolbar after the rest, and leaving closes it after the delay",
    withPointer(async () => {
      const mounted: Mounted = await mount(mediaDocument());
      await settle();
      const kinds: [string, string][] = [
        ["i1", "Image actions"],
        ["f1", "File actions"],
        ["v1", "Video actions"],
        ["a1", "Audio actions"],
        ["e1", "Embed actions"],
      ];
      for (const [id, label] of kinds) {
        const anchor = anchorOf(mounted.host, id);
        pointerTarget = anchor;
        enter(anchor);
        expect(toolbarLabel()).toBeNull();
        await wait(MEDIA_HOVER_OPEN_MS + 60);
        expect(toolbarLabel()).toBe(label);
        expect(mediaHoverBlockId(mounted.editor)).toBe(id);

        pointerTarget = document.body;
        leave(anchor);
        await wait(MEDIA_HOVER_CLOSE_MS + 80);
        expect(toolbarLabel()).toBeNull();
        expect(mediaHoverBlockId(mounted.editor)).toBe("");
      }
      await mounted.cleanup();
    }),
    10000,
  );

  test(
    "a hover toolbar takes no focus and does not move the selection",
    withPointer(async () => {
      const mounted = await mount([
        paragraph("Before", "p1"),
        mediaBlock(IMAGE_KEY, "i1", { url: PNG }),
      ]);
      await settle();
      await act(async () => {
        mounted.editor.tf.select(mounted.editor.api.start([0])!);
      });
      const focusBefore = document.activeElement;
      const selectionBefore = mounted.editor.selection;

      const anchor = anchorOf(mounted.host, "i1");
      pointerTarget = anchor;
      enter(anchor);
      await wait(MEDIA_HOVER_OPEN_MS + 60);
      expect(toolbarLabel()).toBe("Image actions");
      expect(document.activeElement).toBe(focusBefore);
      expect(document.activeElement?.hasAttribute("data-image-actions-row")).toBe(false);
      expect(mounted.editor.selection).toEqual(selectionBefore);
      await mounted.cleanup();
    }),
  );

  test(
    "a press that is down when the pointer enters does not open the toolbar",
    withPointer(async () => {
      const mounted = await mount([
        paragraph("Before", "p1"),
        mediaBlock(IMAGE_KEY, "i1", { url: PNG }),
      ]);
      await settle();
      const anchor = anchorOf(mounted.host, "i1");
      pointerTarget = anchor;
      enter(anchor, 1);
      await wait(MEDIA_HOVER_OPEN_MS + 60);
      expect(toolbarLabel()).toBeNull();
      await mounted.cleanup();
    }),
  );

  test(
    "the hover toolbar stays open while the pointer is on it, and closes once it is left",
    withPointer(async () => {
      const mounted = await mount([
        paragraph("Before", "p1"),
        mediaBlock(IMAGE_KEY, "i1", { url: PNG }),
      ]);
      await settle();
      const anchor = anchorOf(mounted.host, "i1");
      pointerTarget = anchor;
      enter(anchor);
      await wait(MEDIA_HOVER_OPEN_MS + 60);
      const toolbar = find("[data-media-actions]");
      expect(toolbar).not.toBeNull();

      // The pointer leaves the block for the toolbar: the close is scheduled, then the toolbar is entered.
      pointerTarget = toolbar;
      leave(anchor);
      await act(async () => {
        toolbar?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      });
      await wait(MEDIA_HOVER_CLOSE_MS + 80);
      expect(toolbarLabel()).toBe("Image actions");

      // The toolbar is left for empty space: the close runs.
      pointerTarget = document.body;
      if (toolbar !== null) {
        toolbar.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
      }
      scheduleMediaHoverClose(mounted.editor, { x: 1, y: 1 });
      await wait(MEDIA_HOVER_CLOSE_MS + 80);
      expect(toolbarLabel()).toBeNull();
      await mounted.cleanup();
    }),
  );

  test(
    "one toolbar at a time: opening another block's hover toolbar replaces the first",
    withPointer(async () => {
      const mounted = await mount([
        paragraph("Before", "p1"),
        mediaBlock(IMAGE_KEY, "i1", { url: PNG }),
        video("v1"),
      ]);
      await settle();
      await act(async () => {
        openMediaHover(mounted.editor, "i1");
      });
      expect(toolbarLabel()).toBe("Image actions");
      await act(async () => {
        openMediaHover(mounted.editor, "v1");
      });
      expect(toolbarLabel()).toBe("Video actions");
      expect(document.querySelectorAll("[data-media-actions]").length).toBe(1);
      await mounted.cleanup();
    }),
  );

  test(
    "a click-opened toolbar is not replaced by a hover over another block",
    withPointer(async () => {
      const mounted = await mount([
        paragraph("Before", "p1"),
        mediaBlock(IMAGE_KEY, "i1", { url: PNG }),
        video("v1"),
      ]);
      await settle();
      await click(blockHost(mounted.host, "i1")?.querySelector("[data-image-card]") ?? null);
      expect(toolbarLabel()).toBe("Image actions");
      await act(async () => {
        openMediaHover(mounted.editor, "v1");
      });
      expect(mediaHoverBlockId(mounted.editor)).toBe("");
      expect(toolbarLabel()).toBe("Image actions");
      await mounted.cleanup();
    }),
  );

  test(
    "a hover timer for another block does not close a click-opened toolbar",
    withPointer(async () => {
      const mounted = await mount([
        paragraph("Before", "p1"),
        mediaBlock(IMAGE_KEY, "i1", { url: PNG }),
        video("v1"),
      ]);
      await settle();
      await click(blockHost(mounted.host, "i1")?.querySelector("[data-image-card]") ?? null);
      const video1 = anchorOf(mounted.host, "v1");
      pointerTarget = video1;
      enter(video1);
      await wait(MEDIA_HOVER_OPEN_MS + 60);
      expect(toolbarLabel()).toBe("Image actions");
      expect(mediaHoverBlockId(mounted.editor)).toBe("");
      await mounted.cleanup();
    }),
  );

  test(
    "a click-opened toolbar stays open through a hover leave and its close timer, for every media kind",
    withPointer(async () => {
      const kinds: [string, string, string][] = [
        ["i1", "Image actions", "[data-image-card]"],
        ["f1", "File actions", "[data-file-card]"],
        ["v1", "Video actions", "[data-video-card]"],
        ["a1", "Audio actions", "[data-audio-card]"],
        ["e1", "Embed actions", "[data-embed-card]"],
      ];
      for (const [id, label, card] of kinds) {
        const mounted = await mount(mediaDocument());
        await settle();
        await click(blockHost(mounted.host, id)?.querySelector(card) ?? null);
        expect(toolbarLabel()).toBe(label);

        // The pointer rests on the block, then leaves it: the hover open and close both run.
        const anchor = anchorOf(mounted.host, id);
        pointerTarget = anchor;
        enter(anchor);
        await wait(MEDIA_HOVER_OPEN_MS + 60);
        pointerTarget = document.body;
        leave(anchor);
        await wait(MEDIA_HOVER_CLOSE_MS + 80);
        expect(toolbarLabel()).toBe(label);
        expect(mediaHoverBlockId(mounted.editor)).toBe("");
        await mounted.cleanup();
      }
    }),
    20000,
  );

  test(
    "an open source popover on the block keeps the hover toolbar closed",
    withPointer(async () => {
      const mounted = await mount([
        paragraph("Before", "p1"),
        mediaBlock(IMAGE_KEY, "i1", { url: PNG }),
      ]);
      await settle();
      await act(async () => {
        openMediaSource(mounted.editor, "i1");
      });
      await act(async () => {
        openMediaHover(mounted.editor, "i1");
      });
      expect(mediaSourceBlockId(mounted.editor)).toBe("i1");
      expect(mediaHoverBlockId(mounted.editor)).toBe("");
      await mounted.cleanup();
    }),
  );

  test(
    "read-only never opens a hover toolbar",
    withPointer(async () => {
      const mounted = await mount(
        [paragraph("Before", "p1"), mediaBlock(IMAGE_KEY, "i1", { url: PNG })],
        {
          readOnly: true,
        },
      );
      await settle();
      await act(async () => {
        openMediaHover(mounted.editor, "i1");
      });
      expect(mediaHoverBlockId(mounted.editor)).toBe("");
      expect(toolbarLabel()).toBeNull();
      await mounted.cleanup();
    }),
  );

  test(
    "the resize handles of a hovered image are shown without a selection",
    withPointer(async () => {
      const mounted = await mount([
        paragraph("Before", "p1"),
        mediaBlock(IMAGE_KEY, "i1", { url: PNG, width: 60 }),
      ]);
      await settle();
      const handles = () => blockHost(mounted.host, "i1")?.querySelectorAll('[role="separator"]');
      expect(handles()?.length ?? 0).toBe(0);
      const anchor = anchorOf(mounted.host, "i1");
      pointerTarget = anchor;
      enter(anchor);
      await wait(MEDIA_HOVER_OPEN_MS + 60);
      expect(handles()?.length).toBe(2);
      await mounted.cleanup();
    }),
  );
});

describe("media block classes", () => {
  test("a caret-selected media block gets the grey fill with the same 3px outset as the grab selection", () => {
    const selected = mediaBlockClassName(true, true, false);
    expect(selected).toContain("bg-muted");
    expect(selected).toContain("shadow-[0_0_0_3px_var(--muted)]");
    expect(selected).toContain("relative");
  });

  test("an unselected, unfocused or read-only media block has no fill and no vertical padding", () => {
    for (const classes of [
      mediaBlockClassName(false, true, false),
      mediaBlockClassName(true, false, false),
      mediaBlockClassName(true, true, true),
    ]) {
      expect(classes).not.toContain("bg-muted");
      expect(classes).not.toContain("py-1");
      expect(classes).toContain("relative");
    }
  });
});
