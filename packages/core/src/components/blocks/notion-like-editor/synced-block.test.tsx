import { describe, expect, test } from "bun:test";
import { ElementApi, KEYS, type Descendant, type TElement } from "platejs";
import { createPlateEditor } from "platejs/react";
import { PlateStatic, createStaticEditor } from "platejs/static";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { collectAssetIds } from "./asset-references";
import { runEditorCommand } from "./editor-commands";
import { createEditorDocument, serializeEditorDocument } from "./editor-document";
import { normalizeBlockIds } from "./editor-document-ids";
import {
  SYNCED_REF_KEY,
  SYNCED_TARGET_ID_MAX,
  allowedChildTypes,
  isStoredSyncedTargetId,
} from "./editor-document-schema";
import { parseEditorDocument } from "./editor-document-validate";
import {
  SYNCED_CONVERT_LABEL,
  SYNCED_FROM_ABOVE,
  SYNCED_FROM_BELOW,
  SYNCED_GO_LABEL,
  SYNCED_INVALID_PLACEHOLDER,
  SYNCED_MISSING_PLACEHOLDER,
  SYNCED_REJECT_REASON,
  SYNCED_REMOVE_LABEL,
  SYNCED_SELECT_REASON,
  convertSyncedRef,
  createSyncedRef,
  goToSyncedOriginalCommand,
  findBlockById,
  materializeSyncedRefs,
  removeSyncedRef,
} from "./editor-synced-block";
import { createEditorPlugins } from "./editor-plugins";
import { EditorSurface } from "./editor-surface";
import { readToggleOpenIds } from "./editor-toggle";
import { tocEntries } from "./editor-toc";
import type { EditorValue } from "./editor-value";
import {
  caret,
  createEditor,
  createMemoryAssetStore,
  expectOk,
  expectUnsupported,
  field,
} from "./test-utils";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

function paragraph(value: string, id = "p", marks?: Record<string, boolean>): TElement {
  return { type: "p", id, children: [{ text: value, ...marks }] };
}

function heading(id: string, text: string): TElement {
  return { type: "h1", id, children: [{ text }] };
}

function syncedRef(id: string, targetBlockId: string): TElement {
  return { type: SYNCED_REF_KEY, id, targetBlockId, children: [{ text: "" }] };
}

function toggle(id: string, children: TElement[]): TElement {
  return { type: "toggle", id, children };
}

function quote(id: string, children: TElement[]): TElement {
  return { type: "blockquote", id, children };
}

function callout(id: string, children: TElement[]): TElement {
  return { type: "callout", id, icon: "info", variant: "info", children };
}

function columnGroup(child: TElement): TElement {
  return {
    type: "column_group",
    id: "group-1",
    children: [
      { type: "column", id: "column-1", width: "50%", children: [child] },
      {
        type: "column",
        id: "column-2",
        width: "50%",
        children: [paragraph("Note", "column-note")],
      },
    ],
  };
}

function tableWith(children: TElement[]): TElement {
  return {
    type: "table",
    id: "table-1",
    children: [{ type: "tr", id: "row-1", children: [{ type: "td", id: "cell-1", children }] }],
  };
}

function image(id: string, assetId: string): TElement {
  return {
    type: "img",
    id,
    assetId,
    naturalWidth: 48,
    naturalHeight: 24,
    alt: "Live",
    children: [{ text: "" }],
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
  };
}

function stubObjectUrls(): () => void {
  const previousCreate = Reflect.get(URL, "createObjectURL");
  const previousRevoke = Reflect.get(URL, "revokeObjectURL");
  let count = 0;
  Reflect.set(URL, "createObjectURL", () => {
    count += 1;
    return `blob:test-${String(count - 1)}`;
  });
  Reflect.set(URL, "revokeObjectURL", () => {});
  return () => {
    Reflect.set(URL, "createObjectURL", previousCreate);
    Reflect.set(URL, "revokeObjectURL", previousRevoke);
  };
}

async function mountSynced(
  value: EditorValue,
  options: {
    readOnly?: boolean;
    store?: ReturnType<typeof createMemoryAssetStore>["store"] | null;
  } = {},
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
        readOnly={options.readOnly === true}
        placeholder=""
        className="editor"
        assetStore={options.store ?? null}
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

function elementIds(node: Descendant, ids: string[] = []): string[] {
  if (!ElementApi.isElement(node)) {
    return ids;
  }

  if (typeof node.id === "string") {
    ids.push(node.id);
  }

  for (const child of node.children) {
    elementIds(child, ids);
  }

  return ids;
}

function typesOf(value: readonly { type: string }[]): string[] {
  return value.map((node) => node.type);
}

describe("synced block spike", () => {
  test("PlateStatic assigns editor.children, so the reference does not use it", async () => {
    const editor = createStaticEditor({
      plugins: [],
      value: [paragraph("before", "before")],
    });
    const replacement = [paragraph("after", "after")];
    const host = document.createElement("div");
    let root: Root | undefined;
    if (!isReactContainer(host)) {
      throw new Error("Missing mount node.");
    }

    await act(async () => {
      root = createRoot(host);
      root.render(<PlateStatic editor={editor} value={replacement} />);
    });
    expect(editor.children).toBe(replacement);
    expect(host.querySelectorAll("[data-slate-editor]")).toHaveLength(1);
    await act(async () => {
      root?.unmount();
    });
  });

  test("the preview updates from the original without a second editor", async () => {
    const mounted = await mountSynced([
      paragraph("Hello", "original"),
      syncedRef("ref-1", "original"),
    ]);
    try {
      const surface = mounted.host.querySelector("[data-slate-editor]");
      expect(surface).toBeTruthy();
      expect(mounted.host.querySelectorAll("[data-slate-editor]")).toHaveLength(1);
      const preview = mounted.host.querySelector("[data-synced-preview]");
      expect(preview?.textContent).toContain("Hello");
      expect(preview?.getAttribute("contenteditable")).not.toBe("true");
      const undos = mounted.editor.history.undos.length;
      await act(async () => {
        const start = mounted.editor.api.start([0, 0]);
        if (!start) {
          throw new Error("Missing the original.");
        }
        mounted.editor.tf.select({
          anchor: { path: start.path, offset: 5 },
          focus: { path: start.path, offset: 5 },
        });
        mounted.editor.tf.insertText("!");
      });
      expect(mounted.host.querySelector("[data-slate-editor]")).toBe(surface);
      expect(mounted.host.querySelectorAll("[data-slate-editor]")).toHaveLength(1);
      expect(mounted.host.querySelector("[data-synced-preview]")?.textContent).toContain("Hello!");
      expect(mounted.editor.history.undos.length).toBe(undos + 1);
      const previewAfter = mounted.host.querySelector("[data-synced-preview]");
      expect(previewAfter?.closest("[data-slate-editor]")).toBe(surface);
      expect(previewAfter?.querySelector("[contenteditable='true']")).toBeNull();
      expect(mounted.editor.history.undos).toHaveLength(1);
    } finally {
      await mounted.cleanup();
    }
  });
});

describe("synced block schema", () => {
  test("a reference round-trips and keeps only id and targetBlockId", () => {
    expect(SYNCED_REF_KEY).toBe("synced_ref");
    const content = [paragraph("Hello", "original"), syncedRef("ref-1", "original")];
    const parsed = expectOk(parseEditorDocument(createEditorDocument("doc-sync", content)));
    expect(parsed.repairs).toEqual([]);
    expect(parsed.document.content).toEqual(content);
    expect(JSON.parse(serializeEditorDocument(parsed.document))).toEqual(
      createEditorDocument("doc-sync", content),
    );
    expect(allowedChildTypes("toggle")).toContain(SYNCED_REF_KEY);
    expect(allowedChildTypes(KEYS.column)).toContain(SYNCED_REF_KEY);
    expect(allowedChildTypes("blockquote")).toEqual([KEYS.p]);
    expect(allowedChildTypes("callout")).toEqual([KEYS.p]);
    expect(allowedChildTypes("td")).toEqual([KEYS.p]);
  });

  test("unknown attrs and a bad target id stay unsupported and keep the raw document", () => {
    const unknown = { ...syncedRef("ref-1", "original"), note: "extra" };
    const missing = { type: SYNCED_REF_KEY, id: "ref-missing", children: [{ text: "" }] };
    const numeric = { ...syncedRef("ref-number", "original"), targetBlockId: 4 };
    const empty = syncedRef("ref-empty", "");
    const tooLong = syncedRef("ref-long", "a".repeat(SYNCED_TARGET_ID_MAX + 1));
    const control = syncedRef("ref-control", "bad\nid");
    expect(isStoredSyncedTargetId("a".repeat(SYNCED_TARGET_ID_MAX))).toBe(true);

    for (const node of [unknown, missing, numeric, empty, tooLong, control]) {
      const raw = createEditorDocument("doc-bad", [paragraph("Hello", "original"), node]);
      const parsed = expectUnsupported(parseEditorDocument(raw));
      expect(parsed.raw).toBe(raw);
    }
  });

  test("an invalid target is kept with a repair, and a missing target is not a repair", () => {
    const self = [syncedRef("ref-self", "ref-self")];
    const chained = [
      paragraph("Hello", "original"),
      syncedRef("ref-b", "original"),
      syncedRef("ref-a", "ref-b"),
    ];
    const holding = [
      toggle("holder", [paragraph("Label", "label"), syncedRef("inner", "label")]),
      syncedRef("outer", "holder"),
    ];
    const tocTarget = [
      { type: "toc", id: "toc-1", children: [{ text: "" }] },
      syncedRef("ref-toc", "toc-1"),
    ];
    const columnTarget = [
      columnGroup(paragraph("In", "in-column")),
      syncedRef("ref-group", "group-1"),
    ];
    const missing = [syncedRef("ref-gone", "deleted-block")];

    for (const content of [self, chained, holding, tocTarget, columnTarget]) {
      const parsed = expectOk(parseEditorDocument(createEditorDocument("doc-invalid", content)));
      expect(parsed.repairs.some((repair) => repair.message.includes("cannot be synced"))).toBe(
        true,
      );
      expect(JSON.stringify(parsed.document.content)).toContain(SYNCED_REF_KEY);
    }

    const held = expectOk(parseEditorDocument(createEditorDocument("doc-held", holding)));
    expect(held.repairs.map((repair) => repair.path.join("."))).toEqual(["1"]);
    const chain = expectOk(parseEditorDocument(createEditorDocument("doc-chain", chained)));
    expect(chain.repairs).toHaveLength(1);
    expect(chain.repairs[0]?.path).toEqual([2]);

    const gone = expectOk(parseEditorDocument(createEditorDocument("doc-missing", missing)));
    expect(gone.repairs).toEqual([]);
    expect(field(gone.document.content[0], "targetBlockId")).toBe("deleted-block");
  });

  test("id normalization does not rewrite targetBlockId and keeps the surviving original", () => {
    const content = [
      paragraph("Keep", "same"),
      syncedRef("ref-1", "same"),
      paragraph("Duplicate", "same"),
    ];
    const normalized = normalizeBlockIds(content, () => "generated");
    expect(field(normalized.content[0], "id")).toBe("same");
    expect(field(normalized.content[1], "targetBlockId")).toBe("same");
    expect(field(normalized.content[1], "id")).toBe("ref-1");
    expect(field(normalized.content[2], "id")).not.toBe("same");

    const parsed = expectOk(parseEditorDocument(createEditorDocument("doc-ids", content)));
    expect(field(parsed.document.content[1], "targetBlockId")).toBe("same");
    expect(field(parsed.document.content[0], "id")).toBe("same");
  });

  test("a reference is allowed in a toggle and a column, and a quote or cell does not load it", () => {
    const nested = [
      syncedRef("top", "original"),
      paragraph("Hello", "original"),
      toggle("tg", [paragraph("Label", "label"), syncedRef("in-toggle", "original")]),
      columnGroup(syncedRef("in-column", "original")),
    ];
    const parsed = expectOk(parseEditorDocument(createEditorDocument("doc-nested", nested)));
    expect(parsed.repairs).toEqual([]);
    expect(parsed.document.content).toBe(nested);

    for (const node of [
      quote("quote-1", [paragraph("Said", "said"), syncedRef("in-quote", "said")]),
      callout("callout-1", [paragraph("Note", "note"), syncedRef("in-callout", "note")]),
      tableWith([paragraph("Cell", "cell"), syncedRef("in-cell", "cell")]),
    ]) {
      const raw = createEditorDocument("doc-container", [node]);
      expect(expectUnsupported(parseEditorDocument(raw)).raw).toBe(raw);
    }
  });
});

describe("synced block render", () => {
  test("two references and bold text follow the original", async () => {
    const mounted = await mountSynced([
      paragraph("Hello", "original", { bold: true }),
      syncedRef("ref-above", "original"),
      syncedRef("ref-below", "tail"),
      paragraph("Tail", "tail"),
    ]);
    try {
      const previews = mounted.host.querySelectorAll("[data-synced-preview]");
      expect(previews).toHaveLength(2);
      expect(previews[0]?.textContent).toContain("Hello");
      expect(previews[0]?.querySelector("strong")).toBeTruthy();
      expect(previews[1]?.textContent).toContain("Tail");
      expect(mounted.host.querySelector("[data-synced-label]")?.textContent).toBe(
        SYNCED_FROM_ABOVE,
      );
      const labels = mounted.host.querySelectorAll("[data-synced-label]");
      expect(labels[1]?.textContent).toBe(SYNCED_FROM_BELOW);
      await act(async () => {
        const start = mounted.editor.api.start([0, 0]);
        if (!start) {
          throw new Error("Missing the original.");
        }
        mounted.editor.tf.select({
          anchor: { path: start.path, offset: 5 },
          focus: { path: start.path, offset: 5 },
        });
        mounted.editor.tf.insertText("!");
      });
      const next = mounted.host.querySelectorAll("[data-synced-preview]");
      expect(next[0]?.textContent).toContain("Hello!");
      expect(next[1]?.textContent).toContain("Tail");
    } finally {
      await mounted.cleanup();
    }
  });

  test("an image asset resolves inside the reference", async () => {
    const restoreUrls = stubObjectUrls();
    try {
      const record = {
        id: "asset-live",
        kind: "image" as const,
        name: "shot.png",
        mimeType: "image/png",
        byteSize: 8,
        width: 48,
        height: 24,
        createdAt: "2026-10-07T00:00:00.000Z",
      };
      const memory = createMemoryAssetStore([record]);
      memory.records.set(record.id, { record, blob: new Blob(["png"], { type: "image/png" }) });
      const mounted = await mountSynced(
        [image("shot", "asset-live"), syncedRef("ref-shot", "shot")],
        { store: memory.store },
      );
      try {
        await act(async () => {
          await new Promise((resolve) => {
            setTimeout(resolve, 0);
          });
        });
        const images = mounted.host.querySelectorAll("img");
        expect(images.length).toBeGreaterThanOrEqual(2);
        const sources = [...images].map((node) => node.getAttribute("src"));
        expect(
          sources.every(
            (src) => src === sources[0] && typeof src === "string" && src.startsWith("blob:"),
          ),
        ).toBe(true);
      } finally {
        await mounted.cleanup();
      }
    } finally {
      restoreUrls();
    }
  });

  test("a callout reference renders the original note", async () => {
    const mounted = await mountSynced([
      callout("original", [paragraph("Stored once", "note")]),
      syncedRef("ref-1", "original"),
    ]);
    try {
      expect(mounted.host.querySelector("[data-synced-preview]")?.textContent).toContain(
        "Stored once",
      );
      expect(mounted.host.querySelector("[data-synced-label]")?.textContent).toBe(
        SYNCED_FROM_ABOVE,
      );
    } finally {
      await mounted.cleanup();
    }
  });

  test("invalid and missing targets render placeholders", async () => {
    const mounted = await mountSynced([
      syncedRef("ref-self", "ref-self"),
      syncedRef("ref-gone", "deleted-block"),
    ]);
    try {
      const states = [...mounted.host.querySelectorAll("[data-synced-state]")].map((node) =>
        node.getAttribute("data-synced-state"),
      );
      expect(states).toEqual(["invalid", "missing"]);
      expect(mounted.host.textContent).toContain(SYNCED_INVALID_PLACEHOLDER);
      expect(mounted.host.textContent).toContain(SYNCED_MISSING_PLACEHOLDER);
      expect(mounted.host.querySelector("[data-synced-preview]")).toBeNull();
    } finally {
      await mounted.cleanup();
    }
  });
});

describe("synced block commands", () => {
  test("create inserts one reference after a valid block and refuses an invalid one", () => {
    const editor = createEditor([paragraph("Hello", "original"), paragraph("", "tail")]);
    editor.tf.select(caret([0, 0], 0));
    const before = editor.history.undos.length;
    expect(runEditorCommand(editor, createSyncedRef, undefined)).toBe(true);
    expect(editor.history.undos.length).toBe(before + 1);
    expect(typesOf(editor.children)).toEqual(["p", SYNCED_REF_KEY, "p"]);
    expect(field(editor.children[1], "targetBlockId")).toBe("original");
    expect(editor.selection?.anchor.path[0]).toBe(1);
    editor.undo();
    expect(typesOf(editor.children)).toEqual(["p", "p"]);

    const group = createEditor([columnGroup(paragraph("In", "in-column"))]);
    group.tf.select(caret([0, 0, 0, 0], 0));
    expect(createSyncedRef.disabledReason?.(group)).toBe(SYNCED_REJECT_REASON);
    expect(runEditorCommand(group, createSyncedRef, undefined)).toBe(false);
    expect(typesOf(group.children)).toEqual(["column_group"]);

    const bare = createEditor([paragraph("Hello", "original")]);
    bare.tf.deselect();
    expect(createSyncedRef.disabledReason?.(bare)).toBe(SYNCED_SELECT_REASON);
    expect(runEditorCommand(bare, createSyncedRef, undefined, { readOnly: true })).toBe(false);
  });

  test("go to original opens a closed toggle, moves the caret, and skips history", () => {
    const editor = createEditor([
      toggle("closed", [paragraph("Label", "label"), paragraph("Inside", "inside")]),
      syncedRef("ref-1", "inside"),
    ]);
    editor.tf.select(caret([1, 0], 0));
    const undos = editor.history.undos.length;
    expect(runEditorCommand(editor, goToSyncedOriginalCommand, undefined)).toBe(true);
    expect(readToggleOpenIds(editor).has("closed")).toBe(true);
    expect(editor.selection?.anchor.path).toEqual([0, 1, 0]);
    expect(editor.selection?.anchor.offset).toBe(0);
    expect(editor.history.undos.length).toBe(undos);
    expect(runEditorCommand(editor, goToSyncedOriginalCommand, undefined, { readOnly: true })).toBe(
      false,
    );
  });

  test("convert to copy clones every id and leaves the original in place", () => {
    const editor = createEditor([
      callout("original", [paragraph("Note", "note")]),
      syncedRef("ref-1", "original"),
    ]);
    const originalIds = elementIds(editor.children[0]);
    editor.tf.select(caret([1, 0], 0));
    const undos = editor.history.undos.length;
    expect(runEditorCommand(editor, convertSyncedRef, undefined)).toBe(true);
    expect(editor.history.undos.length).toBe(undos + 1);
    expect(typesOf(editor.children)).toEqual(["callout", "callout"]);
    expect(elementIds(editor.children[0])).toEqual(originalIds);
    const cloneIds = elementIds(editor.children[1]);
    expect(cloneIds.length).toBe(originalIds.length);
    expect(cloneIds.every((id) => !originalIds.includes(id))).toBe(true);
    expect(new Set(cloneIds).size).toBe(cloneIds.length);
    editor.undo();
    expect(field(editor.children[1], "targetBlockId")).toBe("original");
  });

  test("remove deletes the reference in one undo", () => {
    const editor = createEditor([paragraph("Hello", "original"), syncedRef("ref-1", "original")]);
    editor.tf.select(caret([1, 0], 0));
    const undos = editor.history.undos.length;
    expect(runEditorCommand(editor, removeSyncedRef, undefined)).toBe(true);
    expect(editor.history.undos.length).toBe(undos + 1);
    expect(typesOf(editor.children)).toEqual(["p"]);
    editor.undo();
    expect(field(editor.children[1], "targetBlockId")).toBe("original");
    expect(runEditorCommand(editor, removeSyncedRef, undefined, { readOnly: true })).toBe(false);
  });

  test("Enter on a reference goes to the original and does not insert a paragraph", () => {
    const editor = createEditor([paragraph("Hello", "original"), syncedRef("ref-1", "original")]);
    editor.tf.select(caret([1, 0], 0));
    const undos = editor.history.undos.length;
    editor.tf.insertBreak();
    expect(typesOf(editor.children)).toEqual(["p", SYNCED_REF_KEY]);
    expect(editor.selection?.anchor.path).toEqual([0, 0]);
    expect(editor.history.undos.length).toBe(undos);
  });
});

describe("synced block lifetime", () => {
  test("deleting the original leaves a placeholder and undo restores it", async () => {
    const mounted = await mountSynced([
      paragraph("Hello", "original"),
      syncedRef("ref-1", "original"),
    ]);
    try {
      await act(async () => {
        mounted.editor.tf.removeNodes({ at: [0] });
      });
      expect(
        mounted.host.querySelector("[data-synced-state]")?.getAttribute("data-synced-state"),
      ).toBe("missing");
      expect(mounted.host.textContent).toContain(SYNCED_MISSING_PLACEHOLDER);
      expect(typesOf(mounted.editor.children)).toEqual([SYNCED_REF_KEY]);
      await act(async () => {
        mounted.editor.undo();
      });
      expect(mounted.host.querySelector("[data-synced-preview]")?.textContent).toContain("Hello");
    } finally {
      await mounted.cleanup();
    }
  });

  test("moving the original into a toggle or a column keeps the reference live", async () => {
    const mounted = await mountSynced([
      paragraph("Hello", "original"),
      toggle("box", [paragraph("Label", "label")]),
      columnGroup(paragraph("Side", "side")),
      syncedRef("ref-1", "original"),
    ]);
    try {
      await act(async () => {
        mounted.editor.tf.moveNodes({ at: [0], to: [1, 1] });
      });
      expect(mounted.host.querySelector("[data-synced-preview]")?.textContent).toContain("Hello");
      expect(field(mounted.editor.children.at(-1), "targetBlockId")).toBe("original");
      const original = findBlockById(mounted.editor, "original");
      expect(original?.[1].length).toBeGreaterThan(1);
      expect(mounted.editor.children[0]?.type).toBe("toggle");
    } finally {
      await mounted.cleanup();
    }

    const columned = await mountSynced([
      columnGroup(paragraph("Side", "side")),
      paragraph("Hello", "original"),
      syncedRef("ref-column", "original"),
    ]);
    try {
      await act(async () => {
        columned.editor.tf.moveNodes({ at: [1], to: [0, 0, 1] });
      });
      expect(columned.host.querySelector("[data-synced-preview]")?.textContent).toContain("Hello");
      expect(columned.editor.children[0]?.type).toBe("column_group");
      const moved = findBlockById(columned.editor, "original");
      expect(moved?.[1].length).toBeGreaterThan(1);
    } finally {
      await columned.cleanup();
    }
  });

  test("pasting a reference keeps the same target, and a missing target stays a placeholder", async () => {
    const editor = createEditor([
      paragraph("Hello", "original"),
      syncedRef("ref-1", "original"),
      paragraph("", "tail"),
    ]);
    editor.tf.select(caret([2, 0], 0));
    editor.tf.insertFragment([syncedRef("ref-1", "original")]);
    const refs = editor.children.filter((node) => node.type === SYNCED_REF_KEY);
    expect(refs).toHaveLength(2);
    expect(refs.map((node) => field(node, "targetBlockId"))).toEqual(["original", "original"]);
    expect(field(refs[1], "id")).not.toBe("ref-1");
    expect(typesOf(editor.children).filter((type) => type === "p").length).toBeGreaterThan(0);

    const empty = createEditor([paragraph("", "empty")]);
    empty.tf.select(caret([0, 0], 0));
    empty.tf.insertFragment([syncedRef("ref-gone", "deleted-block")]);
    const mounted = await mountSynced(empty.children);
    try {
      expect(mounted.host.textContent).toContain(SYNCED_MISSING_PLACEHOLDER);
      expect(
        mounted.host.querySelector("[data-synced-state]")?.getAttribute("data-synced-state"),
      ).toBe("missing");
    } finally {
      await mounted.cleanup();
    }
  });

  test("normalization terminates and a user edit is one history entry", () => {
    const quoted = createEditor([
      quote("quote-1", [paragraph("Said", "said"), syncedRef("ref-quote", "said")]),
    ]);
    quoted.tf.normalize({ force: true });
    const lifted = typesOf(quoted.children);
    const undos = quoted.history.undos.length;
    quoted.tf.normalize({ force: true });
    expect(typesOf(quoted.children)).toEqual(lifted);
    expect(quoted.history.undos.length).toBe(undos);
    expect(lifted).toEqual(["blockquote", SYNCED_REF_KEY]);

    const noted = createEditor([
      callout("callout-1", [paragraph("Note", "note"), syncedRef("ref-callout", "note")]),
    ]);
    noted.tf.normalize({ force: true });
    expect(typesOf(noted.children)).toEqual(["callout", SYNCED_REF_KEY]);

    const table = createEditor([
      tableWith([paragraph("Cell", "cell"), syncedRef("ref-cell", "cell")]),
    ]);
    table.tf.normalize({ force: true });
    expect(typesOf(table.children)).toEqual(["table", SYNCED_REF_KEY]);
    expect(field(table.children[1], "targetBlockId")).toBe("cell");

    const editor = createEditor([paragraph("Hello", "original"), syncedRef("ref-1", "original")]);
    editor.tf.select(caret([0, 0], 5));
    const before = editor.history.undos.length;
    editor.tf.insertText("!");
    expect(editor.history.undos.length).toBe(before + 1);
    editor.tf.normalize({ force: true });
    expect(editor.history.undos.length).toBe(before + 1);
  });

  test("a duplicate paste keeps the reference on the surviving original", () => {
    const editor = createEditor([
      paragraph("Keep", "same"),
      syncedRef("ref-1", "same"),
      paragraph("", "tail"),
    ]);
    editor.tf.select(caret([2, 0], 0));
    editor.tf.insertFragment([paragraph("Copy", "same")]);
    expect(field(editor.children[0], "id")).toBe("same");
    expect(field(editor.children[1], "targetBlockId")).toBe("same");
    const copy = editor.children.find(
      (node) => node.type === "p" && field(node, "id") !== "same" && field(node, "id") !== "tail",
    );
    expect(typeof field(copy, "id")).toBe("string");
    expect(field(copy, "id")).not.toBe("same");
  });
});

describe("synced block derived data", () => {
  test("materialize clones fresh ids and reports missing or invalid references", () => {
    const value: EditorValue = [
      callout("original", [paragraph("Note", "note")]),
      syncedRef("ref-live", "original"),
      syncedRef("ref-self", "ref-self"),
      syncedRef("ref-gone", "deleted-block"),
    ];
    const snapshot = JSON.stringify(value);
    const result = materializeSyncedRefs(value);
    expect(JSON.stringify(value)).toBe(snapshot);
    expect(JSON.stringify(result.value)).not.toContain(SYNCED_REF_KEY);
    expect(result.losses).toHaveLength(2);
    expect(result.losses.map((loss) => loss.path)).toEqual([[2], [3]]);
    const cloneIds = elementIds(result.value[1]);
    const originalIds = elementIds(value[0]);
    expect(cloneIds.every((id) => !originalIds.includes(id))).toBe(true);
    expect(result.value[1]?.type).toBe("callout");
  });

  test("asset cleanup ignores a reference and the outline lists a heading once", () => {
    const stored: EditorValue = [
      image("shot", "asset-live"),
      syncedRef("ref-shot", "shot"),
      heading("title", "Title"),
      syncedRef("ref-title", "title"),
    ];
    const moved: EditorValue = [
      toggle("box", [paragraph("Label", "label"), image("shot", "asset-live")]),
      syncedRef("ref-shot", "shot"),
    ];
    expect(collectAssetIds(stored).has("asset-live")).toBe(true);
    expect(collectAssetIds(moved).has("asset-live")).toBe(true);
    expect(collectAssetIds([syncedRef("ref-only", "shot")]).size).toBe(0);

    const editor = createEditor(stored);
    expect(tocEntries(editor, 3).map((entry) => entry.id)).toEqual(["title"]);
  });
});

describe("synced block toolbar", () => {
  test("the toolbar converts and a read-only reference has no toolbar", async () => {
    const mounted = await mountSynced([
      paragraph("Hello", "original"),
      syncedRef("ref-1", "original"),
    ]);
    try {
      expect(mounted.host.querySelector(`[aria-label="${SYNCED_GO_LABEL}"]`)).toBeTruthy();
      expect(mounted.host.querySelector(`[aria-label="${SYNCED_CONVERT_LABEL}"]`)).toBeTruthy();
      expect(mounted.host.querySelector(`[aria-label="${SYNCED_REMOVE_LABEL}"]`)).toBeTruthy();
      const convert = mounted.host.querySelector(`[aria-label="${SYNCED_CONVERT_LABEL}"]`);
      if (!(convert instanceof HTMLButtonElement)) {
        throw new Error("Missing convert.");
      }
      await act(async () => {
        convert.click();
      });
      expect(typesOf(mounted.editor.children)).toEqual(["p", "p"]);
      expect(field(mounted.editor.children[0], "id")).toBe("original");
      expect(field(mounted.editor.children[1], "id")).not.toBe("original");
      expect(mounted.editor.history.undos.length).toBe(1);
    } finally {
      await mounted.cleanup();
    }

    const readOnly = await mountSynced(
      [paragraph("Hello", "original"), syncedRef("ref-1", "original")],
      { readOnly: true },
    );
    try {
      expect(readOnly.host.querySelector("[data-synced-preview]")?.textContent).toContain("Hello");
      expect(readOnly.host.querySelector("[data-synced-toolbar]")).toBeNull();
      expect(runEditorCommand(readOnly.editor, convertSyncedRef, undefined)).toBe(false);
    } finally {
      await readOnly.cleanup();
    }
  });
});
