import { BaseLinkPlugin, unwrapLink, upsertLinkText } from "@platejs/link";
import {
  ElementApi,
  KEYS,
  PathApi,
  RangeApi,
  createSlatePlugin,
  type SlateEditor,
  type TElement,
  type TRange,
} from "platejs";

import type { EditorCommand } from "../commands/editor-commands";
import { selectionInCodeBlock } from "../features/editor-code";
import { elementAllowsMarks, isVoidElementType } from "../document/editor-document-schema";
import {
  clearUnsafePastedLinkRepairs,
  isExternalLinkUrl,
  normalizeLinkInput,
  noteUnsafePastedLink,
  sanitizeLinkUrl,
} from "../features/editor-link-url";

// Native LinkRules.autolink (dist/index.js getAutolinkMatch) keeps trailing
// punctuation in the link and does not skip code blocks. submitFloatingLink
// writes target. This plugin never stores target or rel.

const TRAILING_PUNCTUATION = new Set([
  ".",
  ",",
  ";",
  ":",
  "!",
  "?",
  ")",
  '"',
  "'",
  "\u201d",
  "\u2019",
]);
const LEADING_PUNCTUATION = new Set(["(", '"', "'", "\u201c", "\u2018"]);

const savedSelections = new WeakMap<SlateEditor, TRange>();

export function linkAnchorRange(editor: SlateEditor): TRange | null {
  return savedSelections.get(editor) ?? editor.selection;
}

export const linkUiPlugin = createSlatePlugin({
  key: "linkUi",
  options: {
    mode: "closed",
    draftUrl: "",
    draftLabel: "",
    error: "",
    hoverId: "",
  },
});

export const linkPlugin = BaseLinkPlugin.configure({
  options: {
    allowedSchemes: ["http", "https", "mailto", "tel"],
    isUrl: (text) => sanitizeLinkUrl(text) !== undefined,
    keepSelectedTextOnPaste: true,
    defaultLinkAttributes: {},
  },
  node: {
    dangerouslyAllowAttributes: [],
  },
  parsers: {
    html: {
      deserializer: {
        rules: [{ validNodeName: "A" }],
        parse: ({ element, type }) => {
          const href = element.getAttribute("href");
          if (href === null || href.length === 0) {
            return undefined;
          }

          const url = sanitizeLinkUrl(href);
          if (url === undefined) {
            noteUnsafePastedLink();
            return undefined;
          }

          return { type, url };
        },
      },
    },
  },
}).overrideEditor(({ editor, tf: { insertBreak, insertData, insertText, normalizeNode } }) => ({
  transforms: {
    insertText(text, options) {
      if (
        text === " " &&
        (options === undefined || options.at === undefined) &&
        autolinkMatch(editor) !== undefined
      ) {
        // The space and the wrap are one undo. Earlier URL characters stay.
        editor.tf.withNewBatch(() => {
          applyAutolink(editor);
          insertText(text, options);
        });
        editor.tf.setSplittingOnce(true);
        return;
      }

      insertText(text, options);
    },
    insertBreak() {
      if (autolinkMatch(editor) !== undefined) {
        editor.tf.withNewBatch(() => {
          applyAutolink(editor);
          insertBreak();
        });
        editor.tf.setSplittingOnce(true);
        return;
      }

      insertBreak();
    },
    insertData(data) {
      clearUnsafePastedLinkRepairs();
      const html = data.getData("text/html");
      const url = html.trim().length === 0 ? pastedLinkUrl(data.getData("text/plain")) : undefined;
      if (url !== undefined && !selectionInCodeBlock(editor)) {
        insertPastedLink(editor, url);
        return;
      }

      insertData(data);
    },
    normalizeNode(entry) {
      const [node, path] = entry;
      if (ElementApi.isElement(node) && node.type === editor.getType(KEYS.link)) {
        if (normalizeLinkNode(editor, node, path)) {
          return;
        }
      }

      normalizeNode(entry);
    },
  },
}));

export function setLinkComposing(editor: SlateEditor, composing: boolean): void {
  editor.composing = composing;
}

type LinkKeyEvent = {
  key: string;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  preventDefault: () => void;
  stopPropagation: () => void;
};

export function onLinkKeyDown(editor: SlateEditor, event: LinkKeyEvent): boolean {
  if (event.altKey || event.shiftKey || event.key.toLowerCase() !== "k") {
    return false;
  }

  if (!event.metaKey && !event.ctrlKey) {
    return false;
  }

  if (editor.dom.readOnly === true) {
    return false;
  }

  event.preventDefault();
  event.stopPropagation();
  openLinkPopover(editor);
  return true;
}

export function openLinkPopover(editor: SlateEditor): void {
  if (editor.dom.readOnly === true || editor.selection === null) {
    return;
  }

  savedSelections.set(editor, editor.selection);
  editor.setOption(linkUiPlugin, "error", "");

  const existing = linkEntry(editor);
  if (existing !== undefined) {
    const url = typeof existing[0].url === "string" ? existing[0].url : "";
    editor.setOption(linkUiPlugin, "mode", "edit");
    editor.setOption(linkUiPlugin, "draftUrl", url);
    editor.setOption(linkUiPlugin, "draftLabel", editor.api.string(existing[1]));
    return;
  }

  editor.setOption(linkUiPlugin, "mode", editor.api.isCollapsed() ? "label" : "insert");
  editor.setOption(linkUiPlugin, "draftUrl", "");
  editor.setOption(linkUiPlugin, "draftLabel", "");
}

export function closeLinkPopover(editor: SlateEditor): void {
  savedSelections.delete(editor);
  editor.setOption(linkUiPlugin, "mode", "closed");
  editor.setOption(linkUiPlugin, "error", "");
}

export function commitLinkPopover(editor: SlateEditor, urlRaw: string, labelRaw: string): boolean {
  const url = sanitizeLinkUrl(normalizeLinkInput(urlRaw));
  if (url === undefined) {
    editor.setOption(linkUiPlugin, "error", "Enter a valid URL.");
    return false;
  }

  const mode = editor.getOption(linkUiPlugin, "mode");
  const saved = savedSelections.get(editor);
  const label = labelRaw.trim().length > 0 ? labelRaw.trim() : url;
  editor.tf.withNewBatch(() => {
    if (saved !== undefined) {
      editor.tf.select(saved);
    }

    if (mode === "edit") {
      updateLink(editor, url, label);
      return;
    }

    if (saved !== undefined && !RangeApi.isCollapsed(saved)) {
      wrapSelection(editor, url);
      return;
    }

    insertLinkNode(editor, url, label);
  });
  editor.tf.setSplittingOnce(true);
  closeLinkPopover(editor);
  return true;
}

export function setLinkHover(editor: SlateEditor, id: string): void {
  if (editor.getOption(linkUiPlugin, "hoverId") === id) {
    return;
  }

  editor.setOption(linkUiPlugin, "hoverId", id);
}

export function openLinkUrl(url: string): void {
  const safe = sanitizeLinkUrl(url);
  if (safe === undefined || typeof window === "undefined") {
    return;
  }

  const features = isExternalLinkUrl(safe) ? "noopener,noreferrer" : undefined;
  window.open(safe, isExternalLinkUrl(safe) ? "_blank" : "_self", features);
}

export const insertInlineLink: EditorCommand = {
  id: "inline.link.insert",
  label: "Link",
  group: "insert",
  isEnabled: (editor) => editor.dom.readOnly !== true && editor.selection !== null,
  run: (editor) => {
    openLinkPopover(editor);
  },
};

export const editInlineLink: EditorCommand = {
  id: "inline.link.edit",
  label: "Edit link",
  group: "action",
  isEnabled: (editor) => editor.dom.readOnly !== true && linkEntry(editor) !== undefined,
  run: (editor) => {
    openLinkPopover(editor);
  },
};

export const removeInlineLink: EditorCommand = {
  id: "inline.link.remove",
  label: "Remove link",
  group: "action",
  isEnabled: (editor) => editor.dom.readOnly !== true && linkEntry(editor) !== undefined,
  run: (editor) => {
    unwrapLink(editor);
  },
};

export const openInlineLink: EditorCommand = {
  id: "inline.link.open",
  label: "Open link",
  group: "action",
  isEnabled: (editor) => selectedLinkUrl(editor) !== undefined,
  run: (editor) => {
    const url = selectedLinkUrl(editor);
    if (url !== undefined) {
      openLinkUrl(url);
    }
  },
};

type LinkMatch = {
  anchor: NonNullable<SlateEditor["selection"]>["anchor"];
  focus: NonNullable<SlateEditor["selection"]>["focus"];
  url: string;
  trailing: string;
};

function linkIsComposing(editor: SlateEditor): boolean {
  if (editor.composing === true) {
    return true;
  }

  const dom: unknown = editor.dom;
  return typeof dom === "object" && dom !== null && "composing" in dom && dom.composing === true;
}

function linkEntry(editor: SlateEditor): [TElement, number[]] | undefined {
  const entry = editor.api.above({
    match: (node) => ElementApi.isElement(node) && node.type === editor.getType(KEYS.link),
  });
  if (entry === undefined || !ElementApi.isElement(entry[0])) {
    return undefined;
  }

  return [entry[0], entry[1]];
}

function selectedLinkUrl(editor: SlateEditor): string | undefined {
  const entry = linkEntry(editor);
  if (entry === undefined || typeof entry[0].url !== "string") {
    return undefined;
  }

  return sanitizeLinkUrl(entry[0].url);
}

function pastedLinkUrl(plain: string): string | undefined {
  const trimmed = plain.trim();
  if (trimmed.length === 0 || /\s/.test(trimmed)) {
    return undefined;
  }

  return sanitizeLinkUrl(trimmed);
}

function insertPastedLink(editor: SlateEditor, url: string): void {
  if (!editor.api.isCollapsed()) {
    wrapSelection(editor, url);
    return;
  }

  if (linkEntry(editor) !== undefined) {
    editor.tf.insertText(url);
    return;
  }

  insertLinkNode(editor, url, url);
}

function insertLinkNode(editor: SlateEditor, url: string, label: string): void {
  editor.tf.insertNodes({
    type: editor.getType(KEYS.link),
    url,
    children: [linkLeaf(label, editor.api.marks())],
  });
  const entry = linkEntry(editor);
  if (entry === undefined) {
    return;
  }

  moveAfterLink(editor, entry[1]);
}

function linkLeaf(label: string, marks: ReturnType<SlateEditor["api"]["marks"]>): { text: string } {
  const leaf: { text: string } & Record<string, unknown> = { text: label };
  if (marks === null) {
    return leaf;
  }

  for (const [key, value] of Object.entries(marks)) {
    if (key !== "text") {
      leaf[key] = value;
    }
  }

  return leaf;
}

function wrapSelection(editor: SlateEditor, url: string): void {
  unwrapLink(editor, { split: true });
  editor.tf.wrapNodes({ type: editor.getType(KEYS.link), url, children: [] }, { split: true });
}

function updateLink(editor: SlateEditor, url: string, label: string): void {
  const entry = linkEntry(editor);
  if (entry === undefined) {
    return;
  }

  editor.tf.setNodes({ url }, { at: entry[1] });
  if (editor.api.string(entry[1]) !== label) {
    upsertLinkText(editor, { text: label, url });
  }
}

function applyAutolink(editor: SlateEditor): boolean {
  const match = autolinkMatch(editor);
  if (match === undefined) {
    return false;
  }

  editor.tf.withoutNormalizing(() => {
    editor.tf.select({ anchor: match.anchor, focus: match.focus });
    editor.tf.wrapNodes(
      { type: editor.getType(KEYS.link), url: match.url, children: [] },
      { split: true },
    );
    const entry = linkEntry(editor);
    if (entry === undefined) {
      return;
    }

    if (match.trailing.length === 0) {
      moveAfterLink(editor, entry[1]);
      return;
    }

    const next = PathApi.next(entry[1]);
    editor.tf.select({ path: next, offset: match.trailing.length });
  });
  return true;
}

function moveAfterLink(editor: SlateEditor, linkPath: number[]): void {
  const next = editor.api.start(linkPath, { next: true });
  if (next !== undefined) {
    editor.tf.select(next);
    return;
  }

  const nextPath = PathApi.next(linkPath);
  editor.tf.insertNodes({ text: "" }, { at: nextPath });
  editor.tf.select({ path: nextPath, offset: 0 });
}

function autolinkMatch(editor: SlateEditor): LinkMatch | undefined {
  if (linkIsComposing(editor) || selectionInCodeBlock(editor)) {
    return undefined;
  }

  const selection = editor.selection;
  if (selection === null || selection === undefined || !editor.api.isCollapsed()) {
    return undefined;
  }

  let before = editor.api.range("before", selection, {
    before: {
      afterMatch: true,
      matchBlockStart: true,
      matchString: " ",
      skipInvalid: true,
    },
  });
  if (!before) {
    before = editor.api.range("start", selection);
  }
  if (!before) {
    return undefined;
  }

  if (
    editor.api.some({
      at: before,
      match: { type: editor.getType(KEYS.link) },
    })
  ) {
    return undefined;
  }

  const text = editor.api.string(before);
  const token = trimLinkToken(text);
  if (token === undefined) {
    return undefined;
  }

  const anchor =
    token.lead === 0
      ? before.anchor
      : editor.api.after(before.anchor, { distance: token.lead, unit: "character" });
  const focus =
    token.trailing.length === 0
      ? selection.anchor
      : editor.api.before(selection.anchor, {
          distance: token.trailing.length,
          unit: "character",
        });
  if (anchor === undefined || focus === undefined) {
    return undefined;
  }

  return { anchor, focus, url: token.url, trailing: token.trailing };
}

function trimLinkToken(text: string): { url: string; lead: number; trailing: string } | undefined {
  let end = text.length;
  while (end > 0 && TRAILING_PUNCTUATION.has(text.charAt(end - 1))) {
    end -= 1;
  }

  const direct = sanitizeLinkUrl(text.slice(0, end));
  if (direct !== undefined) {
    return { url: direct, lead: 0, trailing: text.slice(end) };
  }

  if (end > 1 && LEADING_PUNCTUATION.has(text.charAt(0))) {
    const wrapped = sanitizeLinkUrl(text.slice(1, end));
    if (wrapped !== undefined) {
      return { url: wrapped, lead: 1, trailing: text.slice(end) };
    }
  }

  return undefined;
}

function normalizeLinkNode(editor: SlateEditor, node: TElement, path: number[]): boolean {
  if ("target" in node || "rel" in node) {
    const drop = ["target", "rel"].filter((key) => key in node);
    editor.tf.unsetNodes(drop, { at: path });
    return true;
  }

  const parent = editor.api.parent(path);
  const parentType =
    parent !== undefined && ElementApi.isElement(parent[0]) ? parent[0].type : undefined;
  if (
    parentType === KEYS.codeLine ||
    parentType === KEYS.codeBlock ||
    parentType === KEYS.link ||
    (parentType !== undefined && (!elementAllowsMarks(parentType) || isVoidElementType(parentType)))
  ) {
    editor.tf.unwrapNodes({ at: path });
    return true;
  }

  const url = typeof node.url === "string" ? node.url : "";
  if (sanitizeLinkUrl(url) !== url) {
    editor.tf.unwrapNodes({ at: path });
    return true;
  }

  if (editor.api.string(path).length === 0) {
    editor.tf.removeNodes({ at: path });
    return true;
  }

  return false;
}
