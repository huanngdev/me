import { describe, expect, test } from "bun:test";
import { type SlateEditor, type TElement } from "platejs";
import { createPlateEditor } from "platejs/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { createEditorDocument } from "./editor-document";
import { parseEditorDocument } from "./editor-document-validate";
import { createEditorPlugins } from "./editor-plugins";
import { MEDIA_NOT_SUPPORTED, pasteRepairsOf, rejectDroppedFiles } from "./editor-paste";
import { pasteUrlActions } from "./editor-paste-url";
import { EditorSurface } from "./editor-surface";
import type { EditorValue } from "./editor-value";
import { caret, createEditor, expectUnsupported, field } from "./test-utils";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

const YOUTUBE = "https://www.youtube.com/watch?v=jNQXAC9IVRw";

function paragraph(text: string, id = "p"): TElement {
  return { type: "p", id, children: [{ text }] };
}

function legacyDocument(type: string, extra: Record<string, unknown>) {
  return createEditorDocument("legacy", [
    paragraph("Keep", "keep"),
    { type, id: "media", children: [{ text: "" }], ...extra },
  ]);
}

function expectLegacyKept(type: string, extra: Record<string, unknown> = {}): void {
  const raw = legacyDocument(type, extra);
  const result = expectUnsupported(parseEditorDocument(raw));
  expect(result.raw).toBe(raw);
  expect(result.issues.some((issue) => issue.message.includes(`"${type}"`))).toBe(true);
  expect(raw.content.map((node) => node.type)).toEqual(["p", type]);
  expect(field(raw.content[0], "children")).toEqual([{ text: "Keep" }]);
  for (const [key, value] of Object.entries(extra)) {
    expect(field(raw.content[1], key)).toEqual(value);
  }
}

function withFiles(html = ""): DataTransfer {
  const data = new DataTransfer();
  if (html.length > 0) {
    data.setData("text/html", html);
  }
  data.setData("text/plain", "Should not appear");
  const file = { name: "shot.png", type: "image/png", size: 8 };
  const listed: { length: number; 0: typeof file } = { length: 1, 0: file };
  Object.defineProperty(data, "files", {
    configurable: true,
    enumerable: true,
    get: () => listed,
  });
  return data;
}

function pasteHtml(editor: SlateEditor, html: string): void {
  const data = new DataTransfer();
  data.setData("text/html", html);
  data.setData("text/plain", "");
  editor.tf.insertData(data);
}

function documentText(editor: SlateEditor): string {
  return editor.children.map((block) => editor.api.string(block)).join("\n");
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
  return () => {
    Reflect.set(globalThis, "requestAnimationFrame", previousFrame);
    Reflect.set(globalThis, "cancelAnimationFrame", previousCancel);
  };
}

async function mountEditor(value: EditorValue, readOnly = false) {
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

describe("legacy media documents", () => {
  test("a stored img node is unsupported and the raw document is kept", () => {
    expectLegacyKept("img", { url: "blob:https://local/shot", alt: "Hill" });
  });

  test("a stored video node is unsupported and the raw document is kept", () => {
    expectLegacyKept("video", { url: "/clip.webm", mimeType: "video/webm" });
  });

  test("a stored audio node is unsupported and the raw document is kept", () => {
    expectLegacyKept("audio", { url: "/tone.wav", mimeType: "audio/wav" });
  });

  test("a stored file node is unsupported and the raw document is kept", () => {
    expectLegacyKept("file", {
      url: "/notes.pdf",
      mimeType: "application/pdf",
      name: "notes.pdf",
      byteSize: 591,
    });
  });

  test("a stored media_embed node is unsupported and the raw document is kept", () => {
    expectLegacyKept("media_embed", {
      provider: "youtube",
      videoId: "jNQXAC9IVRw",
      sourceUrl: YOUTUBE,
    });
  });

  test("a stored pdf node is unsupported and the raw document is kept", () => {
    expectLegacyKept("pdf", { url: "/notes.pdf", name: "notes.pdf" });
  });
});

describe("file and html media paste", () => {
  test("pasting a file inserts nothing and records one repair", () => {
    const editor = createEditor([paragraph("Stay")]);
    editor.tf.select(caret([0, 0], 4));
    editor.tf.insertData(withFiles("<p>Should not appear</p>"));
    expect(editor.children.map((block) => block.type)).toEqual(["p"]);
    expect(documentText(editor)).toBe("Stay");
    expect(pasteRepairsOf(editor)).toEqual([{ path: [], message: MEDIA_NOT_SUPPORTED }]);
  });

  test("dropping a file preventDefaults and records the same repair", () => {
    const editor = createEditor([paragraph("Stay")]);
    const data = withFiles();
    let defaultPrevented = false;
    const event = {
      preventDefault() {
        defaultPrevented = true;
      },
      dataTransfer: data,
    };
    expect(rejectDroppedFiles(editor, event)).toBe(true);
    expect(defaultPrevented).toBe(true);
    expect(pasteRepairsOf(editor)).toEqual([{ path: [], message: MEDIA_NOT_SUPPORTED }]);
    expect(documentText(editor)).toBe("Stay");
  });

  test("html img, video, audio, and iframe nodes are dropped with one repair", () => {
    const editor = createEditor([paragraph("")]);
    editor.tf.select(caret([0, 0], 0));
    pasteHtml(
      editor,
      '<p>Hello <img alt="world"> there</p><video src="/clip.webm"></video><audio src="/tone.wav"></audio><iframe src="https://www.youtube.com/embed/jNQXAC9IVRw"></iframe>',
    );
    const stored = JSON.stringify(editor.children);
    expect(stored).not.toContain("img");
    expect(stored).not.toContain("video");
    expect(stored).not.toContain("audio");
    expect(stored).not.toContain("media_embed");
    expect(stored).not.toContain("unsupported_media");
    expect(stored).not.toContain("world");
    expect(stored).not.toContain("youtube.com");
    expect(documentText(editor)).toContain("Hello");
    expect(documentText(editor)).toContain("there");
    expect(pasteRepairsOf(editor)).toEqual([{ path: [], message: MEDIA_NOT_SUPPORTED }]);
  });

  test("a pasted editor image fragment inserts nothing", () => {
    const editor = createEditor([paragraph("Stay")]);
    editor.tf.select(caret([0, 0], 0));
    editor.tf.insertFragment([
      {
        type: "img",
        id: "shot",
        url: "https://images.example/hill.png",
        alt: "Hill",
        children: [{ text: "" }],
      },
    ]);
    expect(editor.children.map((block) => block.type)).toEqual(["p"]);
    expect(documentText(editor)).toBe("Stay");
    expect(JSON.stringify(editor.children)).not.toContain("Hill");
    expect(pasteRepairsOf(editor)).toEqual([{ path: [], message: MEDIA_NOT_SUPPORTED }]);
  });
});

describe("paste url menu without embed", () => {
  test("a youtube url offers bookmark and keep as link only", async () => {
    expect(pasteUrlActions.map((action) => action.id)).toEqual(["bookmark"]);
    expect(pasteUrlActions.map((action) => action.label)).toEqual(["Bookmark"]);
    const mounted = await mountEditor([paragraph("")]);
    try {
      mounted.editor.tf.select(caret([0, 0], 0));
      await act(async () => {
        const data = new DataTransfer();
        data.setData("text/plain", YOUTUBE);
        mounted.editor.tf.insertData(data);
      });
      const menu = document.querySelector("[data-paste-url-menu]");
      const labels = [...(menu?.querySelectorAll("button") ?? [])].map(
        (button) => button.textContent,
      );
      expect(labels).toEqual(["Bookmark", "Keep as link"]);
      expect(menu?.textContent).not.toContain("Embed");
    } finally {
      await mounted.cleanup();
    }
  });
});
