import { describe, expect, test } from "bun:test";
import { KEYS, type SlateEditor, type TElement } from "platejs";
import { createPlateEditor } from "platejs/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";

import { EditorSurface } from "../components/editor/editor-surface";
import { hrElementClassName, HR_SELECTED_CLASS_NAME } from "../components/elements/hr-element";
import { runEditorCommand } from "../lib/commands/editor-commands";
import { createEditorDocument } from "../lib/document/editor-document";
import { parseEditorDocument, type ParseResult } from "../lib/document/editor-document-validate";
import type { EditorValue } from "../lib/document/editor-value";
import {
  blockMenuDecisions,
  deleteBlockAt,
  duplicateBlockAt,
  menuBlockView,
} from "../lib/features/editor-block-menu";
import { BOOKMARK_KEY } from "../lib/features/editor-bookmark-url";
import {
  isLoadableFileUrl,
  resolveFileUrl,
  sanitizeStoredFileUrl,
} from "../lib/features/editor-file-url";
import type { FileUploadAdapter, UploadedFile } from "../lib/features/editor-file-upload";
import {
  IMAGE_ATTRS_CLEANED,
  IMAGE_CAPTION_MAX,
  IMAGE_KEY,
  IMAGE_URL_REMOVED,
  isStoredImageAttr,
  sanitizeImageEmbedUrl,
} from "../lib/features/editor-image";
import {
  clearImageSource,
  insertImage,
  removeImage,
  setImageAlign,
  setImageCaption,
  setImageSource,
  setImageWidth,
} from "../lib/features/editor-image-commands";
import { applyFinishedUpload } from "../lib/features/editor-media";
import { MEDIA_MIME_PREFIXES, sanitizeMediaSource } from "../lib/features/editor-media-source";
import { pasteRepairsOf } from "../lib/paste/editor-paste";
import { createEditorPlugins } from "../lib/plugins/editor-plugins";
import { NotionLikeEditorStatic } from "../notion-like-editor-static";
import {
  caret,
  createEditor,
  expectOk,
  expectUnsupported,
  field,
  isRecord,
  texts,
} from "./test-utils";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

const PNG = "https://cdn.example.com/a.png";
const LOCAL = "local-file:abc";

function paragraph(text: string, id: string): TElement {
  return { type: KEYS.p, id, children: [{ text }] };
}

function image(id: string, extra: Record<string, unknown> = {}): TElement {
  return { type: IMAGE_KEY, id, children: [{ text: "" }], ...extra };
}

function full(id: string): TElement {
  return image(id, {
    url: PNG,
    name: "a.png",
    size: 2048,
    mime: "image/png",
    width: 60,
    align: "right",
    caption: "A caption",
  });
}

function documentOf(content: EditorValue) {
  return createEditorDocument("doc", content);
}

function parse(content: unknown[]): ParseResult {
  return parseEditorDocument(documentOf(content as EditorValue));
}

function repairMessages(result: ParseResult): string[] {
  return result.status === "ok" ? result.repairs.map((repair) => repair.message) : [];
}

// Keys sorted, so an undo that restores the same content in another key order still matches.
function canonical(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonical(item)).join(",")}]`;
  }
  if (isRecord(value)) {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function snapshot(editor: SlateEditor): string {
  return canonical(editor.children);
}

function imageEntry(editor: SlateEditor, id: string): Record<string, unknown> {
  const node = editor.children.find((child) => field(child, "id") === id);
  if (!isRecord(node)) {
    throw new Error(`No block ${id}.`);
  }
  return node;
}

function bookmarkNode(id: string): TElement {
  return { type: BOOKMARK_KEY, id, url: PNG, children: [{ text: "" }] };
}

// Each mutating command is run, then undone once. The document must match the state before it.
function expectOneUndo(editor: SlateEditor, run: () => boolean): void {
  const before = snapshot(editor);
  const undos = editor.history.undos.length;
  expect(run()).toBe(true);
  expect(editor.history.undos.length).toBe(undos + 1);
  editor.tf.undo();
  expect(snapshot(editor)).toBe(before);
}

describe("image schema", () => {
  test("a valid image round-trips unchanged", () => {
    const content = [paragraph("Before", "p1"), full("img-1")];
    const result = expectOk(parse(content));
    expect(result.repairs).toEqual([]);
    expect(result.document.content).toEqual(content);
  });

  test("an image with no url is a valid empty placeholder", () => {
    const result = expectOk(parse([image("empty-1")]));
    expect(result.document.content).toEqual([image("empty-1")]);
    expect(result.repairs).toEqual([]);
  });

  test("width, align, caption and the source fields follow the stated rules", () => {
    const good: [string, unknown][] = [
      ["width", 10],
      ["width", 100],
      ["align", "left"],
      ["align", "center"],
      ["caption", "x".repeat(IMAGE_CAPTION_MAX)],
      ["size", 0],
      ["name", "file.png"],
      ["mime", "image/svg+xml"],
      ["url", "/blocks/a.svg"],
      ["url", "local-file:abc"],
    ];
    for (const [attr, value] of good) {
      expect({ attr, ok: isStoredImageAttr(attr, value) }).toEqual({ attr, ok: true });
    }

    const bad: [string, unknown][] = [
      ["width", 9],
      ["width", 101],
      ["width", 50.5],
      ["width", "50"],
      ["align", "justify"],
      ["caption", ""],
      ["caption", "x".repeat(IMAGE_CAPTION_MAX + 1)],
      ["caption", "a\u0007b"],
      ["size", -1],
      ["size", 1.5],
      ["size", "1"],
      ["name", "a/b.png"],
      ["mime", "application/pdf"],
      ["mime", "image/"],
      ["url", "javascript:alert(1)"],
      ["url", "blob:https://example.com/3f2a"],
      ["url", "data:image/png;base64,AA=="],
      ["url", "https://example.com/a b.png"],
    ];
    for (const [attr, value] of bad) {
      expect({ attr, ok: isStoredImageAttr(attr, value) }).toEqual({ attr, ok: false });
    }
  });

  test("a bad optional attribute is dropped with a repair and the block stays", () => {
    const cases: [string, unknown][] = [
      ["width", 5],
      ["align", "justify"],
      ["caption", "a\u0007b"],
      ["size", -3],
      ["name", "x/y.png"],
      ["mime", "application/pdf"],
    ];
    for (const [key, value] of cases) {
      const result = expectOk(parse([image("img-1", { [key]: value })]));
      expect(field(result.document.content[0], key)).toBeUndefined();
      expect(field(result.document.content[0], "type")).toBe(IMAGE_KEY);
      expect(repairMessages(result).some((message) => message.includes(key))).toBe(true);
    }
  });

  test("an invalid url makes the image an empty placeholder with a repair, not an unsupported document", () => {
    for (const url of [
      "javascript:alert(1)",
      "blob:https://example.com/3f2a",
      "data:text/html,hi",
    ]) {
      const result = expectOk(
        parse([paragraph("Keep", "p1"), full("img-1"), image("img-2", { url })]),
      );
      expect(field(result.document.content[2], "url")).toBeUndefined();
      expect(field(result.document.content[2], "type")).toBe(IMAGE_KEY);
      expect(field(result.document.content[1], "url")).toBe(PNG);
      expect(repairMessages(result)).toContain(IMAGE_URL_REMOVED);
    }
  });

  test("a root-relative url is stored as valid", () => {
    const result = expectOk(parse([image("img-1", { url: "/blocks/image-demo.svg" })]));
    expect(field(result.document.content[0], "url")).toBe("/blocks/image-demo.svg");
    expect(result.repairs).toEqual([]);
  });

  test("an unknown attribute is unsupported, the way other blocks handle one", () => {
    const result = expectUnsupported(parse([image("img-1", { ratio: "16:9" })]));
    expect(result.issues.some((issue) => issue.message.includes('"ratio"'))).toBe(true);
  });

  test("an image is allowed where a bookmark is allowed, and refused where it is refused", () => {
    // Same parent, same place: the image and the bookmark must get the same parse status.
    const inside = (type: string, child: TElement): unknown[] => [
      { type, id: `${type}-outer`, children: [paragraph("Inside", `${type}-p`), child] },
    ];
    for (const type of [KEYS.blockquote, KEYS.callout]) {
      expect({ container: type, status: parse(inside(type, image("img-in"))).status }).toEqual({
        container: type,
        status: parse(inside(type, bookmarkNode("bk-in"))).status,
      });
    }
    expectUnsupported(parse(inside(KEYS.blockquote, image("img-in"))));
    expectUnsupported(parse(inside(KEYS.callout, image("img-in"))));

    for (const container of ["toggle", "column"] as const) {
      expect({ container, status: parse(wrap(image("img-in"), container)).status }).toEqual({
        container,
        status: parse(wrap(bookmarkNode("bk-in"), container)).status,
      });
      expectOk(parse(wrap(image("ok-in"), container)));
    }
  });

  test("an image is refused in a table cell and in a code block, as a bookmark is", () => {
    const table = (child: TElement): TElement => ({
      type: KEYS.table,
      id: "tbl",
      children: [
        {
          type: KEYS.tr,
          id: "tr",
          children: [{ type: KEYS.td, id: "td", children: [child] }],
        },
      ],
    });
    const codeBlock = (child: TElement): TElement => ({
      type: KEYS.codeBlock,
      id: "code",
      children: [child],
    });

    expect(parse([table(image("cell-img"))]).status).toBe(
      parse([table({ type: BOOKMARK_KEY, id: "cell-bk", url: PNG, children: [{ text: "" }] })])
        .status,
    );
    expect(parse([codeBlock(image("code-img"))]).status).not.toBe("ok");
  });

  test("the media mime rule covers the image block", () => {
    expect(MEDIA_MIME_PREFIXES.image).toBe("image/");
    expect(sanitizeMediaSource({ url: PNG, mime: "image/png" }, MEDIA_MIME_PREFIXES.image)).toEqual(
      { url: PNG, mime: "image/png" },
    );
  });
});

function wrap(child: TElement, container: "toggle" | "column"): unknown[] {
  if (container === "toggle") {
    return [{ type: KEYS.toggle, id: "t", children: [paragraph("Label", "t-label"), child] }];
  }

  return [
    {
      type: KEYS.columnGroup,
      id: "g",
      children: [
        { type: KEYS.column, id: "col-1", width: "50%", children: [child] },
        {
          type: KEYS.column,
          id: "col-2",
          width: "50%",
          children: [paragraph("Right", "col-2-p")],
        },
      ],
    },
  ];
}

describe("embed and upload sources", () => {
  test("an embed link keeps only http and https urls", () => {
    expect(sanitizeImageEmbedUrl(`  ${PNG}  `)).toBe(PNG);
    expect(sanitizeImageEmbedUrl("http://example.com/a.png")).toBe("http://example.com/a.png");
    for (const raw of [
      "javascript:alert(1)",
      "ftp://example.com/a.png",
      "blob:https://example.com/3f2a",
      "/relative.png",
      "local-file:abc",
      "https://example.com/a b.png",
      `https://example.com/${"a".repeat(2048)}`,
      42,
    ]) {
      expect({ raw, clean: sanitizeImageEmbedUrl(raw) }).toEqual({ raw, clean: null });
    }
  });

  test("a root-relative path is stored and loadable, and resolves without an adapter", async () => {
    expect(sanitizeStoredFileUrl("/a.png")).toBe("/a.png");
    expect(isLoadableFileUrl("/a.png")).toBe(true);
    expect(await resolveFileUrl(null, "/a.png", new AbortController().signal)).toBe("/a.png");
    expect(await resolveFileUrl(null, "//evil.example/a.png", new AbortController().signal)).toBe(
      null,
    );
  });
});

describe("image commands", () => {
  test("insertImage replaces an empty paragraph, selects the block, and undoes once", () => {
    const editor = createEditor([paragraph("", "empty")]);
    editor.tf.select(caret([0, 0], 0));
    const before = snapshot(editor);
    expect(runEditorCommand(editor, insertImage, { id: "new-img" })).toBe(true);
    expect(field(editor.children[0], "type")).toBe(IMAGE_KEY);
    expect(field(editor.children[0], "id")).toBe("new-img");
    expect(editor.selection).not.toBeNull();
    expect(editor.history.undos.length).toBe(1);
    editor.tf.undo();
    expect(snapshot(editor)).toBe(before);
  });

  test("insertImage goes after the current block when it is not an empty paragraph", () => {
    const editor = createEditor([paragraph("Text", "p1"), paragraph("Tail", "p2")]);
    editor.tf.select(caret([0, 0], 2));
    expect(runEditorCommand(editor, insertImage, { id: "new-img" })).toBe(true);
    expect(editor.children.map((node) => field(node, "type"))).toEqual([KEYS.p, IMAGE_KEY, KEYS.p]);
    expect(texts(editor)).toEqual(["Text", "", "Tail"]);
  });

  test("insertImage refuses an empty id and an id that is already used", () => {
    const editor = createEditor([paragraph("Text", "p1")]);
    editor.tf.select(caret([0, 0], 0));
    const before = snapshot(editor);
    expect(runEditorCommand(editor, insertImage, { id: "" })).toBe(false);
    expect(runEditorCommand(editor, insertImage, { id: "p1" })).toBe(false);
    expect(snapshot(editor)).toBe(before);
  });

  test("setImageSource writes an embed link and clears stale name, size and mime", () => {
    const editor = createEditor([full("img-1")]);
    expectOneUndo(editor, () =>
      runEditorCommand(editor, setImageSource, {
        id: "img-1",
        file: { url: "https://example.com/new.png" },
      }),
    );
    runEditorCommand(editor, setImageSource, {
      id: "img-1",
      file: { url: "https://example.com/new.png" },
    });
    const node = imageEntry(editor, "img-1");
    expect(node.url).toBe("https://example.com/new.png");
    expect(node.name).toBeUndefined();
    expect(node.size).toBeUndefined();
    expect(node.mime).toBeUndefined();
    expect(node.width).toBe(60);
    expect(node.caption).toBe("A caption");
  });

  test("setImageSource writes an upload result and drops a mime that is not an image", () => {
    const editor = createEditor([image("img-1")]);
    const file: UploadedFile = {
      url: LOCAL,
      name: "photo.png",
      size: 900,
      mime: "application/pdf",
    };
    expect(runEditorCommand(editor, setImageSource, { id: "img-1", file })).toBe(true);
    const node = imageEntry(editor, "img-1");
    expect(node.url).toBe(LOCAL);
    expect(node.name).toBe("photo.png");
    expect(node.size).toBe(900);
    expect(node.mime).toBeUndefined();
  });

  test("setImageSource refuses an unsafe embed link, a blob upload, and a block that is not an image", () => {
    const editor = createEditor([full("img-1"), paragraph("Text", "p1")]);
    const before = snapshot(editor);
    expect(
      runEditorCommand(editor, setImageSource, {
        id: "img-1",
        file: { url: "javascript:alert(1)" },
      }),
    ).toBe(false);
    expect(
      runEditorCommand(editor, setImageSource, {
        id: "img-1",
        file: { url: "ftp://example.com/a.png" },
      }),
    ).toBe(false);
    expect(
      runEditorCommand(editor, setImageSource, {
        id: "img-1",
        file: { url: "blob:https://example.com/3f2a", name: "a.png", size: 1, mime: "image/png" },
      }),
    ).toBe(false);
    expect(runEditorCommand(editor, setImageSource, { id: "p1", file: { url: PNG } })).toBe(false);
    expect(snapshot(editor)).toBe(before);
  });

  test("clearImageSource returns to the placeholder and keeps width, align and caption", () => {
    const editor = createEditor([full("img-1")]);
    expectOneUndo(editor, () => runEditorCommand(editor, clearImageSource, { id: "img-1" }));
    runEditorCommand(editor, clearImageSource, { id: "img-1" });
    const node = imageEntry(editor, "img-1");
    expect(node.url).toBeUndefined();
    expect(node.name).toBeUndefined();
    expect(node.size).toBeUndefined();
    expect(node.mime).toBeUndefined();
    expect(node.width).toBe(60);
    expect(node.align).toBe("right");
    expect(node.caption).toBe("A caption");
  });

  test("setImageWidth accepts 10 to 100, removes the width on null, and refuses the rest", () => {
    const editor = createEditor([full("img-1")]);
    expectOneUndo(editor, () =>
      runEditorCommand(editor, setImageWidth, { id: "img-1", width: 10 }),
    );
    expect(runEditorCommand(editor, setImageWidth, { id: "img-1", width: 100 })).toBe(true);
    expect(imageEntry(editor, "img-1").width).toBe(100);
    for (const width of [9, 101, 50.5]) {
      expect(runEditorCommand(editor, setImageWidth, { id: "img-1", width })).toBe(false);
    }
    expect(imageEntry(editor, "img-1").width).toBe(100);
    expect(runEditorCommand(editor, setImageWidth, { id: "img-1", width: null })).toBe(true);
    expect(imageEntry(editor, "img-1").width).toBeUndefined();
  });

  test("setImageAlign accepts the three values and refuses the rest", () => {
    const editor = createEditor([full("img-1")]);
    expectOneUndo(editor, () =>
      runEditorCommand(editor, setImageAlign, { id: "img-1", align: "left" }),
    );
    expect(runEditorCommand(editor, setImageAlign, { id: "img-1", align: "center" })).toBe(true);
    expect(imageEntry(editor, "img-1").align).toBe("center");
    // @ts-expect-error an align outside the three values is refused at runtime
    expect(runEditorCommand(editor, setImageAlign, { id: "img-1", align: "justify" })).toBe(false);
    expect(imageEntry(editor, "img-1").align).toBe("center");
  });

  test("setImageCaption cleans the text, removes an empty caption, and cuts a long one", () => {
    const editor = createEditor([full("img-1")]);
    expectOneUndo(editor, () =>
      runEditorCommand(editor, setImageCaption, { id: "img-1", caption: "Hi" }),
    );
    runEditorCommand(editor, setImageCaption, { id: "img-1", caption: "  Two\u0007   words  " });
    expect(imageEntry(editor, "img-1").caption).toBe("Two words");
    runEditorCommand(editor, setImageCaption, { id: "img-1", caption: "x".repeat(900) });
    expect(String(imageEntry(editor, "img-1").caption).length).toBeLessThanOrEqual(
      IMAGE_CAPTION_MAX,
    );
    runEditorCommand(editor, setImageCaption, { id: "img-1", caption: "   " });
    expect(imageEntry(editor, "img-1").caption).toBeUndefined();
  });

  test("removeImage deletes the block and undoes once", () => {
    const editor = createEditor([paragraph("Keep", "p1"), full("img-1")]);
    expectOneUndo(editor, () => runEditorCommand(editor, removeImage, { id: "img-1" }));
    runEditorCommand(editor, removeImage, { id: "img-1" });
    expect(editor.children.map((node) => field(node, "id"))).toEqual(["p1"]);
  });

  test("removing the only image leaves an empty paragraph", () => {
    const editor = createEditor([full("img-1")]);
    runEditorCommand(editor, removeImage, { id: "img-1" });
    expect(editor.children.length).toBe(1);
    expect(field(editor.children[0], "type")).toBe(KEYS.p);
  });

  test("every command is a no-op that returns false for a block that is not an image", () => {
    const editor = createEditor([paragraph("Text", "p1")]);
    const before = snapshot(editor);
    const attempts: boolean[] = [
      runEditorCommand(editor, setImageSource, { id: "p1", file: { url: PNG } }),
      runEditorCommand(editor, clearImageSource, { id: "p1" }),
      runEditorCommand(editor, setImageWidth, { id: "p1", width: 50 }),
      runEditorCommand(editor, setImageAlign, { id: "p1", align: "left" }),
      runEditorCommand(editor, setImageCaption, { id: "p1", caption: "x" }),
      runEditorCommand(editor, removeImage, { id: "p1" }),
      runEditorCommand(editor, clearImageSource, { id: "missing" }),
      runEditorCommand(editor, removeImage, { id: "missing" }),
    ];
    expect(attempts).toEqual([false, false, false, false, false, false, false, false]);
    expect(snapshot(editor)).toBe(before);
  });
});

describe("applyFinishedUpload", () => {
  const file: UploadedFile = { url: LOCAL, name: "a.png", size: 12, mime: "image/png" };

  test("the first upload into an empty image is not an undo step, so one undo removes the block", () => {
    const editor = createEditor([paragraph("Before", "p1")]);
    editor.tf.select(caret([0, 0], 6));
    const beforeInsert = snapshot(editor);
    runEditorCommand(editor, insertImage, { id: "img-1" });
    const undos = editor.history.undos.length;
    expect(applyFinishedUpload(editor, "img-1", file)).toBe(true);
    const node = imageEntry(editor, "img-1");
    expect(node.url).toBe(LOCAL);
    expect(node.name).toBe("a.png");
    expect(node.size).toBe(12);
    expect(node.mime).toBe("image/png");
    expect(editor.history.undos.length).toBe(undos);
    editor.tf.undo();
    expect(snapshot(editor)).toBe(beforeInsert);
  });

  test("does nothing when the block is gone", () => {
    const editor = createEditor([paragraph("Text", "p1")]);
    const before = snapshot(editor);
    const undos = editor.history.undos.length;
    expect(applyFinishedUpload(editor, "gone", file)).toBe(false);
    expect(snapshot(editor)).toBe(before);
    expect(editor.history.undos.length).toBe(undos);
  });

  test("does nothing when the image already has a url", () => {
    const editor = createEditor([full("img-1")]);
    const before = snapshot(editor);
    expect(applyFinishedUpload(editor, "img-1", file)).toBe(false);
    expect(snapshot(editor)).toBe(before);
  });

  test("does nothing when the block is not an image", () => {
    const editor = createEditor([paragraph("Text", "p1")]);
    const before = snapshot(editor);
    expect(applyFinishedUpload(editor, "p1", file)).toBe(false);
    expect(snapshot(editor)).toBe(before);
  });

  test("does nothing for a result whose url is not storable", () => {
    const editor = createEditor([image("img-1")]);
    const before = snapshot(editor);
    expect(
      applyFinishedUpload(editor, "img-1", { url: "blob:https://example.com/x", size: 1 }),
    ).toBe(false);
    expect(snapshot(editor)).toBe(before);
  });

  test("does nothing in read-only mode", () => {
    const editor = createEditor([image("img-1")]);
    editor.dom.readOnly = true;
    const before = snapshot(editor);
    expect(applyFinishedUpload(editor, "img-1", file)).toBe(false);
    expect(snapshot(editor)).toBe(before);
  });
});

describe("image paste", () => {
  function pasteFragment(editor: SlateEditor, fragment: unknown[]): void {
    const data = new DataTransfer();
    data.setData(
      "application/x-slate-fragment",
      window.btoa(encodeURIComponent(JSON.stringify(fragment))),
    );
    data.setData("text/plain", "");
    editor.tf.insertData(data);
  }

  test("a pasted image keeps its valid fields and drops the bad ones", () => {
    const editor = createEditor([paragraph("Start", "p1")]);
    editor.tf.select(caret([0, 0], 5));
    pasteFragment(editor, [
      image("src-1", {
        url: PNG,
        name: "ok.png",
        size: 10,
        mime: "image/png",
        width: 5,
        align: "justify",
        caption: "Kept",
      }),
    ]);

    const pasted = editor.children.find((node) => field(node, "type") === IMAGE_KEY);
    expect(pasted).toBeDefined();
    expect(field(pasted, "url")).toBe(PNG);
    expect(field(pasted, "name")).toBe("ok.png");
    expect(field(pasted, "caption")).toBe("Kept");
    expect(field(pasted, "width")).toBeUndefined();
    expect(field(pasted, "align")).toBeUndefined();
    expect(pasteRepairsOf(editor).map((repair) => repair.message)).toContain(IMAGE_ATTRS_CLEANED);
  });

  test("a pasted image with an unsafe url stays as a placeholder", () => {
    const editor = createEditor([paragraph("Start", "p1")]);
    editor.tf.select(caret([0, 0], 5));
    pasteFragment(editor, [image("src-2", { url: "javascript:alert(1)", caption: "Still here" })]);

    const pasted = editor.children.find((node) => field(node, "type") === IMAGE_KEY);
    expect(pasted).toBeDefined();
    expect(field(pasted, "url")).toBeUndefined();
    expect(field(pasted, "caption")).toBe("Still here");
    expectOk(parseEditorDocument(documentOf(editor.children as EditorValue)));
  });
});

describe("image block menu", () => {
  test("Duplicate copies the image with a new id, and Delete removes it", () => {
    const editor = createEditor([full("img-1"), paragraph("Tail", "p1")]);
    expect(duplicateBlockAt(editor, [0])).toBe(true);
    const ids = editor.children.map((node) => field(node, "id"));
    expect(ids.length).toBe(3);
    expect(new Set(ids).size).toBe(3);
    expect(field(editor.children[1], "type")).toBe(IMAGE_KEY);
    expect(field(editor.children[1], "url")).toBe(PNG);

    expect(deleteBlockAt(editor, [1])).toBe(true);
    expect(editor.children.length).toBe(2);
  });

  test("Turn into offers what it offers for a bookmark, which is nothing", () => {
    const editor = createEditor([
      full("img-1"),
      { type: BOOKMARK_KEY, id: "bk", url: PNG, children: [{ text: "" }] },
    ]);
    const imageView = menuBlockView(editor, [0]);
    const bookmarkView = menuBlockView(editor, [1]);
    expect(imageView).not.toBeNull();
    expect(bookmarkView).not.toBeNull();
    if (imageView === null || bookmarkView === null) {
      throw new Error("Missing the block menu view.");
    }
    expect(blockMenuDecisions(imageView)).toBe(blockMenuDecisions(bookmarkView));
    expect(blockMenuDecisions(imageView)).toBeNull();
  });
});

describe("image static renderer", () => {
  test("a loadable url renders a figure with an img, and a non-loadable url shows the unavailable row", () => {
    const html = renderToStaticMarkup(
      <NotionLikeEditorStatic
        value={[
          full("ok-img"),
          image("bad-img", { url: LOCAL, name: "private.png" }),
          image("empty-img"),
        ]}
      />,
    );
    expect(html).toContain("<figure");
    expect(html).toContain(`src="${PNG}"`);
    expect(html).toContain('alt="A caption"');
    expect(html).toContain("width:60%");
    expect(html).toContain("ml-auto");
    expect(html).toContain("Image unavailable");
    expect(html).toContain("private.png");
    expect(html.match(/<figure/g)?.length).toBe(1);
  });

  test("a root-relative url renders as an image in the static output", () => {
    const html = renderToStaticMarkup(
      <NotionLikeEditorStatic value={[image("rel", { url: "/blocks/a.svg" })]} />,
    );
    expect(html).toContain('src="/blocks/a.svg"');
    expect(html).not.toContain("Image unavailable");
  });
});

// The editor tests mount the surface. The fake adapter decides what each local-file url resolves to.
type Mounted = {
  editor: SlateEditor;
  host: HTMLElement;
  root: Root;
};

async function mount(value: EditorValue, adapter: FileUploadAdapter | null): Promise<Mounted> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const editor = createPlateEditor({ plugins: createEditorPlugins(), value });
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <EditorSurface
        editor={editor}
        readOnly={false}
        placeholder=""
        className="editor"
        fileUpload={adapter}
      />,
    );
  });
  return { editor, host, root };
}

async function unmount(mounted: Mounted): Promise<void> {
  await act(async () => {
    mounted.root.unmount();
  });
  mounted.host.remove();
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
  });
}

function stateOf(host: HTMLElement, id: string): string | null {
  const anchor = host.querySelector(`[data-block-id="${id}"] [data-image-state]`);
  return anchor?.getAttribute("data-image-state") ?? null;
}

function adapterWith(resolve: (url: string) => Promise<string | null>): FileUploadAdapter {
  return {
    upload: () => Promise.reject(new Error("not used in these tests")),
    resolveUrl: (url) => resolve(url),
  };
}

describe("image rendering", () => {
  test("each of the four states is shown", async () => {
    const adapter = adapterWith((url) => {
      if (url === "local-file:ready") {
        return Promise.resolve("https://cdn.example.com/ready.png");
      }
      if (url === "local-file:gone") {
        return Promise.resolve(null);
      }
      return new Promise<string | null>(() => undefined);
    });
    const mounted = await mount(
      [
        image("s-empty"),
        image("s-loading", { url: "local-file:loading" }),
        image("s-ready", { url: "local-file:ready", name: "ready.png" }),
        image("s-unavailable", { url: "local-file:gone", name: "gone.png" }),
      ],
      adapter,
    );
    await settle();

    expect(stateOf(mounted.host, "s-empty")).toBe("empty");
    expect(mounted.host.textContent).toContain("Add an image");
    expect(stateOf(mounted.host, "s-loading")).toBe("loading");
    expect(stateOf(mounted.host, "s-ready")).toBe("ready");
    expect(mounted.host.querySelector(`[data-block-id="s-ready"] img`)?.getAttribute("src")).toBe(
      "https://cdn.example.com/ready.png",
    );
    expect(stateOf(mounted.host, "s-unavailable")).toBe("unavailable");
    expect(mounted.host.textContent).toContain("Image unavailable");
    expect(mounted.host.textContent).toContain("gone.png");

    await unmount(mounted);
  });

  test("an image element that fails to load shows the unavailable state", async () => {
    const adapter = adapterWith(() => Promise.resolve("https://cdn.example.com/broken.png"));
    const mounted = await mount(
      [image("broken", { url: "local-file:broken", name: "x.png" })],
      adapter,
    );
    await settle();
    const img = mounted.host.querySelector('[data-block-id="broken"] img');
    expect(img).not.toBeNull();
    await act(async () => {
      img?.dispatchEvent(new Event("error"));
    });
    expect(stateOf(mounted.host, "broken")).toBe("unavailable");
    await unmount(mounted);
  });

  test("the img carries the lazy, async, no-referrer attributes, and alt falls back caption, name, then empty", async () => {
    const adapter = adapterWith((url) =>
      Promise.resolve(`https://cdn.example.com/${url.slice(11)}.png`),
    );
    const mounted = await mount(
      [
        image("alt-caption", { url: "local-file:c", name: "n.png", caption: "Cap" }),
        image("alt-name", { url: "local-file:n", name: "n.png" }),
        image("alt-none", { url: "local-file:x" }),
      ],
      adapter,
    );
    await settle();
    const alt = (id: string) =>
      mounted.host.querySelector(`[data-block-id="${id}"] img`)?.getAttribute("alt");
    expect(alt("alt-caption")).toBe("Cap");
    expect(alt("alt-name")).toBe("n.png");
    expect(alt("alt-none")).toBe("");
    const img = mounted.host.querySelector('[data-block-id="alt-name"] img');
    expect(img?.getAttribute("loading")).toBe("lazy");
    expect(img?.getAttribute("decoding")).toBe("async");
    expect(img?.getAttribute("referrerpolicy")).toBe("no-referrer");
    await unmount(mounted);
  });

  test("width and align set the figure style and class", async () => {
    const mounted = await mount(
      [full("w-img"), image("r-img", { url: PNG, align: "right" }), image("c-img", { url: PNG })],
      null,
    );
    await settle();
    const figure = (id: string) => mounted.host.querySelector(`[data-block-id="${id}"] figure`);
    expect(figure("w-img")?.getAttribute("style")).toContain("width: 60%");
    expect(figure("w-img")?.className).toContain("ml-auto");
    expect(figure("r-img")?.className).toContain("ml-auto");
    expect(figure("r-img")?.className).toContain("w-fit");
    expect(figure("c-img")?.className).toContain("mx-auto");
    expect(figure("c-img")?.className).toContain("w-fit");
    await unmount(mounted);
  });

  test("the selected state uses the divider's classes", () => {
    expect(hrElementClassName(true, true, false)).toBe(HR_SELECTED_CLASS_NAME);
    expect(hrElementClassName(true, true, true)).toBeUndefined();
    expect(hrElementClassName(false, true, false)).toBeUndefined();
  });
});
